import { getStarsApi } from "./get-stars-api.js";

async function graphql(query, variables) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GitHub list API requires process.env.GITHUB_TOKEN");
  let response;
  try {
    response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    return { ok: false, reason: "network_error", message: error.message };
  }
  if (!response.ok) return { ok: false, reason: "http_error", status: response.status };
  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "invalid_json", status: response.status };
  }
  if (body?.errors?.length) return { ok: false, reason: "graphql_error", errors: body.errors, data: body.data };
  if (!body?.data || typeof body.data !== "object") return { ok: false, reason: "invalid_response" };
  return { ok: true, data: body.data };
}

function failure({ data, ...error }) {
  return error;
}

function pageCursor(page, previous) {
  if (!page?.pageInfo || !Array.isArray(page.nodes) || !Number.isSafeInteger(page.totalCount)) {
    return { ok: false, reason: "invalid_list_connection" };
  }
  if (!page.pageInfo.hasNextPage) return { ok: true, after: null };
  const cursor = page.pageInfo.endCursor;
  if (typeof cursor !== "string" || !cursor || cursor === previous) return { ok: false, reason: "invalid_list_cursor" };
  return { ok: true, after: cursor };
}

export async function getStarListsApi() {
  const lists = [];
  let viewer;
  let after = null;
  let totalCount;
  const incomplete = error => ({ ...failure(error), complete: false, lists, ...(viewer ? { viewer } : {}) });
  do {
    const result = await graphql(`query StarLists($after:String) {
      viewer { login lists(first:100,after:$after) {
        totalCount pageInfo { hasNextPage endCursor }
        nodes { id name description isPrivate slug }
      } }
    }`, { after });
    if (!result.ok) return incomplete(result);
    if (typeof result.data.viewer?.login !== "string") return incomplete({ ok: false, reason: "viewer_missing" });
    viewer = { login: result.data.viewer.login };
    const page = result.data.viewer.lists;
    const cursor = pageCursor(page, after);
    if (!cursor.ok) return incomplete(cursor);
    after = cursor.after;
    totalCount = page.totalCount;
    for (const list of page.nodes) {
      if (typeof list?.id !== "string" || typeof list.name !== "string" ||
          typeof list.slug !== "string" || typeof list.isPrivate !== "boolean") {
        return incomplete({ ok: false, reason: "invalid_list" });
      }
      lists.push({ ...list, description: list.description ?? "", items: [],
        url: `https://github.com/stars/${encodeURIComponent(viewer.login)}/lists/${encodeURIComponent(list.slug)}` });
    }
  } while (after);
  if (new Set(lists.map(list => list.id)).size !== totalCount || lists.length !== totalCount) {
    return { ok: false, reason: "lists_incomplete", complete: false, viewer, lists };
  }
  // Fetch each connection separately: a nested all-lists/items query can return HTTP 502.
  for (const list of lists) {
    after = null;
    do {
      const result = await graphql(`query StarListItems($id:ID!,$after:String) {
        node(id:$id) { ... on UserList { items(first:100,after:$after) {
          totalCount pageInfo { hasNextPage endCursor }
          nodes { ... on Repository { id databaseId nameWithOwner } }
        } } }
      }`, { id: list.id, after });
      if (!result.ok) return incomplete(result);
      const page = result.data.node?.items;
      const cursor = pageCursor(page, after);
      if (!cursor.ok) return incomplete(cursor);
      after = cursor.after;
      totalCount = page.totalCount;
      if (page.nodes.some(item => typeof item?.id !== "string" || typeof item.nameWithOwner !== "string")) {
        return { ok: false, reason: "list_items_not_visible", complete: false, viewer, lists, listId: list.id };
      }
      list.items.push(...page.nodes);
    } while (after);
    if (list.items.length !== totalCount || new Set(list.items.map(item => item.id)).size !== totalCount) {
      return { ok: false, reason: "list_items_incomplete", complete: false, viewer, lists, listId: list.id };
    }
  }
  return { ok: true, complete: true, scope: "all_pages", access: "token_visible", viewer, lists, listCount: lists.length };
}

function ids(value, label, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) ||
      value.some(id => typeof id !== "string" || !id.trim() || id !== id.trim())) {
    throw new Error(`${label} must be an array of non-empty node IDs`);
  }
  return [...new Set(value)];
}

function requireConfirmation(args) {
  if (args.confirm !== true) throw new Error("confirm: true is required to modify GitHub lists");
}

function resolveLists(snapshot, listIds) {
  return listIds.map(id => {
    const list = snapshot.lists.find(list => list.id === id);
    if (!list) throw new Error(`Unknown list ID for the authenticated viewer: ${id}`);
    return list;
  });
}

function memberships(snapshot) {
  const result = new Map();
  for (const list of snapshot.lists) for (const item of list.items) {
    if (!result.has(item.id)) result.set(item.id, []);
    result.get(item.id).push(list.id);
  }
  return result;
}

function sameIds(actual, expected) {
  return actual.length === expected.length && new Set(actual).size === expected.length && actual.every(id => expected.includes(id));
}

async function checkStarred(ctx, snapshot, assignments) {
  const stars = await getStarsApi(ctx, { username: snapshot.viewer.login, authenticated: true });
  if (!stars.ok) return { ok: false, reason: "stars_read_failed", cause: stars };
  const known = new Set(stars.items.map(item => item.nodeId));
  const unavailable = assignments.filter(item => !known.has(item.repositoryId)).map(item => item.repositoryId);
  return unavailable.length ? { ok: false, reason: "repositories_not_starred_or_not_visible", repositoryIds: unavailable } : { ok: true };
}

async function applyAssignments(snapshot, assignments, mode) {
  const before = memberships(snapshot);
  const results = [];
  const pending = [];
  for (const assignment of assignments) {
    const original = before.get(assignment.repositoryId) || [];
    const listIds = [...new Set([...(mode === "append" ? original : []), ...assignment.listIds])].sort();
    const item = { repositoryId: assignment.repositoryId, listIds, changed: !sameIds(original, listIds) };
    if (item.changed) pending.push(item);
    else results.push(item);
  }
  for (let offset = 0; offset < pending.length; offset += 10) {
    const batch = pending.slice(offset, offset + 10);
    const variables = Object.fromEntries(batch.map((item, i) => [`i${i}`, { itemId: item.repositoryId, listIds: item.listIds }]));
    const declaration = batch.map((_, i) => `$i${i}:UpdateUserListsForItemInput!`).join(",");
    const fields = batch.map((_, i) => `m${i}:updateUserListsForItem(input:$i${i}) { item { ... on Repository { id } } lists { id } }`).join("\n");
    const response = await graphql(`mutation ClassifyStars(${declaration}) { ${fields} }`, variables);
    const uncertainRepositoryIds = [];
    for (const [i, item] of batch.entries()) {
      const saved = response.data?.[`m${i}`];
      if (saved?.item?.id === item.repositoryId && Array.isArray(saved.lists) && sameIds(saved.lists.map(list => list.id), item.listIds)) results.push(item);
      else uncertainRepositoryIds.push(item.repositoryId);
    }
    if (!response.ok || uncertainRepositoryIds.length) {
      const verified = new Set(results.map(item => item.repositoryId));
      return { ...failure(response), ok: false, reason: response.ok ? "membership_not_verified" : response.reason,
        viewer: snapshot.viewer, mode, results, uncertainRepositoryIds,
        pendingRepositoryIds: pending.filter(item => !verified.has(item.repositoryId)).map(item => item.repositoryId) };
    }
  }
  return { ok: true, viewer: snapshot.viewer, mode, results, pendingRepositoryIds: [], uncertainRepositoryIds: [] };
}

export async function batchClassifyStars(ctx, args = {}) {
  requireConfirmation(args);
  const mode = args.mode === undefined ? "append" : args.mode;
  if (!["append", "replace"].includes(mode)) throw new Error("mode must be append or replace");
  if (!Array.isArray(args.assignments) || !args.assignments.length) throw new Error("assignments must be a non-empty array");
  const assignments = args.assignments.map(item => ({
    repositoryId: ids([item?.repositoryId], "repositoryId")[0], listIds: ids(item?.listIds, "listIds"),
  }));
  if (new Set(assignments.map(item => item.repositoryId)).size !== assignments.length) throw new Error("assignments contain duplicate repository IDs");
  const snapshot = await getStarListsApi();
  if (!snapshot.ok) return snapshot;
  resolveLists(snapshot, [...new Set(assignments.flatMap(item => item.listIds))]);
  const check = await checkStarred(ctx, snapshot, assignments);
  if (!check.ok) return check;
  return applyAssignments(snapshot, assignments, mode);
}

async function cleanup(snapshot, listIds, coveredByListIds) {
  const sources = resolveLists(snapshot, listIds);
  const destinations = resolveLists(snapshot, coveredByListIds);
  const covered = new Set(destinations.flatMap(list => list.items.map(item => item.id)));
  const uncoveredRepositoryIds = [...new Set(sources.flatMap(list => list.items.map(item => item.id)))].filter(id => !covered.has(id));
  if (uncoveredRepositoryIds.length) return { ok: false, reason: "source_members_not_covered", uncoveredRepositoryIds, deletedListIds: [], pendingListIds: listIds, uncertainListIds: [] };
  const deletedListIds = [];
  for (let offset = 0; offset < listIds.length; offset += 10) {
    const batch = listIds.slice(offset, offset + 10);
    const variables = Object.fromEntries(batch.map((id, i) => [`i${i}`, { listId: id, clientMutationId: id }]));
    const declaration = batch.map((_, i) => `$i${i}:DeleteUserListInput!`).join(",");
    const fields = batch.map((_, i) => `m${i}:deleteUserList(input:$i${i}) { clientMutationId }`).join("\n");
    const response = await graphql(`mutation CleanupStarLists(${declaration}) { ${fields} }`, variables);
    const uncertainListIds = [];
    for (const [i, id] of batch.entries()) {
      if (response.data?.[`m${i}`]?.clientMutationId === id) deletedListIds.push(id);
      else uncertainListIds.push(id);
    }
    if (!response.ok || uncertainListIds.length) return { ...failure(response), ok: false,
      reason: response.ok ? "deletion_not_verified" : response.reason, viewer: snapshot.viewer,
      deletedListIds, pendingListIds: listIds.filter(id => !deletedListIds.includes(id)), uncertainListIds };
  }
  const after = await getStarListsApi();
  if (!after.ok) return { ok: false, reason: "cleanup_verification_failed", cause: after, deletedListIds, pendingListIds: [], uncertainListIds: [] };
  const remaining = snapshot.lists.filter(list => !listIds.includes(list.id));
  const unchanged = after.lists.length === remaining.length && remaining.every(list => {
    const saved = after.lists.find(saved => saved.id === list.id);
    return saved && saved.name === list.name && saved.description === list.description && saved.isPrivate === list.isPrivate &&
      sameIds(saved.items.map(item => item.id), list.items.map(item => item.id));
  });
  return { ok: unchanged, ...(unchanged ? {} : { reason: "cleanup_not_verified" }), viewer: snapshot.viewer,
    deletedListIds, pendingListIds: [], uncertainListIds: [] };
}

export async function cleanupStarLists(ctx, args = {}) {
  requireConfirmation(args);
  const listIds = ids(args.listIds, "listIds");
  const coveredByListIds = ids(args.coveredByListIds === undefined ? [] : args.coveredByListIds, "coveredByListIds", true);
  if (listIds.some(id => coveredByListIds.includes(id))) throw new Error("Source and retained list IDs must not overlap");
  const snapshot = await getStarListsApi();
  if (!snapshot.ok) return snapshot;
  return cleanup(snapshot, listIds, coveredByListIds);
}

export async function mergeStarLists(ctx, args = {}) {
  requireConfirmation(args);
  const sourceListIds = ids(args.sourceListIds, "sourceListIds");
  const targetListId = ids([args.targetListId], "targetListId")[0];
  if (sourceListIds.includes(targetListId)) throw new Error("Source and target list IDs must not overlap");
  const snapshot = await getStarListsApi();
  if (!snapshot.ok) return { ...snapshot, phase: "read" };
  const sources = resolveLists(snapshot, sourceListIds);
  const [target] = resolveLists(snapshot, [targetListId]);
  const repositoryIds = [...new Set(sources.flatMap(list => list.items.map(item => item.id)))];
  const assignments = repositoryIds.map(repositoryId => ({ repositoryId, listIds: [targetListId] }));
  if (assignments.length) {
    const check = await checkStarred(ctx, snapshot, assignments);
    if (!check.ok) return { ...check, phase: "classify" };
  }
  const classification = await applyAssignments(snapshot, assignments, "append");
  if (!classification.ok) return { ok: false, phase: "classify", classification };
  const after = await getStarListsApi();
  if (!after.ok) return { ...after, phase: "verify", classification };
  const saved = after.lists.find(list => list.id === targetListId);
  const expected = [...new Set([...target.items.map(item => item.id), ...repositoryIds])];
  if (!saved || !sameIds(saved.items.map(item => item.id), expected)) {
    return { ok: false, reason: "merge_membership_not_saved", phase: "verify", classification };
  }
  const cleaned = await cleanup(after, sourceListIds, [targetListId]);
  return { ok: cleaned.ok, phase: cleaned.ok ? "complete" : "cleanup", sourceListIds, targetListId, classification, cleanup: cleaned };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  batchClassifyStars,
  cleanupStarLists,
  getStarListsApi,
  mergeStarLists,
} from "../skills/site-skill/assets/learnings/github-stars/tools/lists-api.js";

const GRAPHQL_URL = "https://api.github.com/graphql";
const TOKEN = "fixture-token";
const LOGIN = "fixture-user";
const ctx = {};

function repository(id, name = `fixture-org/repo-${id}`) {
  return {
    id,
    nodeId: `R_kgDOFixtureRepo${id}`,
    name,
    url: `https://github.com/${name}`,
    description: `${name} description`,
    language: "JavaScript",
    stars: 100 + id,
    forks: id,
    starredAt: `2026-11-${String(id).padStart(2, "0")}T00:00:00Z`,
  };
}

function starList(id, name, slug, members = []) {
  return {
    id,
    name,
    slug,
    description: `${name} description`,
    isPrivate: true,
    members,
  };
}

function response(body, { status = 200, link = "" } = {}) {
  const headers = new Headers();
  if (link) headers.set("link", link);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    async json() { return body; },
  };
}

function pageInfo(total, after, prefix, pageSize) {
  const start = after ? Number(String(after).slice(prefix.length)) : 0;
  const end = Math.min(start + pageSize, total);
  return {
    start,
    end,
    pageInfo: {
      hasNextPage: end < total,
      endCursor: end < total ? `${prefix}${end}` : null,
    },
  };
}

function createGitHubFixture(t, {
  lists,
  repositories,
  metadataPageSize = 2,
  itemPageSize = 2,
  classify,
  cleanup,
} = {}) {
  const stateLists = lists.map(list => ({ ...list, members: [...list.members] }));
  const repositoryById = new Map(repositories.map(repo => [repo.id, repo]));
  const repositoryByNodeId = new Map(repositories.map(repo => [repo.nodeId, repo]));
  const calls = [];
  let classifyCalls = 0;
  let cleanupCalls = 0;
  let restStatus = 200;

  function listById(id) {
    return stateLists.find(list => list.id === id);
  }

  function graphqlListNodes(page) {
    return page.map(list => ({
      id: list.id,
      name: list.name,
      description: list.description,
      isPrivate: list.isPrivate,
      slug: list.slug,
    }));
  }

  function itemConnection(list, after) {
    const page = pageInfo(list.members.length, after, `ITEMS_${list.id}_`, itemPageSize);
    const nodes = list.members.slice(page.start, page.end).map(id => {
      const repo = repositoryById.get(id);
      assert.ok(repo, `fixture repository ${id} must exist`);
      return { id: repo.nodeId, databaseId: repo.id, nameWithOwner: repo.name };
    });
    return { totalCount: list.members.length, nodes, pageInfo: page.pageInfo };
  }

  function applyClassifyInputs(inputs) {
    for (const input of inputs) {
      const repositoryId = repositoryByNodeId.get(input.itemId).id;
      for (const list of stateLists) {
        const memberIndex = list.members.indexOf(repositoryId);
        if (input.listIds.includes(list.id) && memberIndex < 0) list.members.push(repositoryId);
        if (!input.listIds.includes(list.id) && memberIndex >= 0) list.members.splice(memberIndex, 1);
      }
    }
  }

  const server = {
    stateLists,
    calls,
    get classifyCalls() { return classifyCalls; },
    get cleanupCalls() { return cleanupCalls; },
    setRestStatus(status) { restStatus = status; },
    classifyInputs() {
      return calls.filter(call => call.operationName === "ClassifyStars").flatMap(call => call.inputs);
    },
    operationNames() {
      return calls.map(call => call.operationName).filter(Boolean);
    },
    async handle(url, options = {}) {
      if (url.startsWith("https://api.github.com/users/")) {
        const parsed = new URL(url);
        assert.equal(parsed.hostname, "api.github.com");
        assert.equal(parsed.searchParams.get("per_page"), "100");
        assert.equal(decodedPathUser(parsed.pathname), LOGIN);
        assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${TOKEN}`);
        calls.push({ url, options, operationName: "RestStars" });
        if (restStatus !== 200) return response({ message: "fixture access denied" }, { status: restStatus });
        return response(repositories.map(repo => ({
          starred_at: repo.starredAt,
          repo: {
            id: repo.id,
            node_id: repo.nodeId,
            full_name: repo.name,
            html_url: repo.url,
            description: repo.description,
            language: repo.language,
            stargazers_count: repo.stars,
            forks_count: repo.forks,
          },
        })));
      }

      assert.equal(url, GRAPHQL_URL);
      assert.equal(options.method, "POST");
      assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${TOKEN}`);
      const payload = JSON.parse(options.body);
      const operationName = payload.query.match(/(?:query|mutation)\s+([A-Za-z0-9_]+)/)[1];
      assert.doesNotMatch(payload.query, /\b(?:addStar|removeStar)\b/i);
      const call = { url, options, operationName, payload };
      calls.push(call);

      if (operationName === "StarLists") {
        const total = stateLists.length;
        const page = pageInfo(total, payload.variables?.after, "META_", metadataPageSize);
        return response({
          data: {
            viewer: {
              login: LOGIN,
              lists: {
                totalCount: total,
                nodes: graphqlListNodes(stateLists.slice(page.start, page.end)),
                pageInfo: page.pageInfo,
              },
            },
          },
        });
      }

      if (operationName === "StarListItems") {
        const variables = payload.variables ?? {};
        const list = listById(variables.id);
        if (!list) {
          return response({ data: { node: null }, errors: [{ message: "Not Found" }] });
        }
        const items = itemConnection(list, variables.after);
        return response({
          data: {
            node: { items },
          },
        });
      }

      if (operationName === "ClassifyStars") {
        classifyCalls += 1;
        const inputs = Object.entries(payload.variables ?? {})
          .filter(([key]) => /^i\d+$/.test(key))
          .sort(([left], [right]) => Number(left.slice(1)) - Number(right.slice(1)))
          .map(([, input]) => input);
        call.inputs = inputs;
        if (classify) return classify({ server, payload, inputs, call });
        applyClassifyInputs(inputs);
        return response({
          data: Object.fromEntries(inputs.map((input, index) => [`m${index}`, {
            item: { id: input.itemId },
            lists: input.listIds.map(id => ({ id })),
          }])),
        });
      }

      if (operationName === "CleanupStarLists") {
        cleanupCalls += 1;
        const inputs = Object.entries(payload.variables ?? {})
          .filter(([key]) => /^i\d+$/.test(key))
          .sort(([left], [right]) => Number(left.slice(1)) - Number(right.slice(1)))
          .map(([, input]) => input);
        call.inputs = inputs;
        if (cleanup) return cleanup({ server, payload, inputs, call });
        for (const input of inputs) {
          const index = stateLists.findIndex(list => list.id === input.listId);
          if (index >= 0) stateLists.splice(index, 1);
        }
        return response({
          data: Object.fromEntries(inputs.map((input, index) => [
            `m${index}`,
            { clientMutationId: input.clientMutationId },
          ])),
        });
      }

      assert.fail(`unexpected GraphQL operation: ${operationName}`);
    },
  };

  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = TOKEN;
  t.after(() => {
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
  });
  t.mock.method(globalThis, "fetch", async (url, options) => server.handle(String(url), options));
  return server;
}

function decodedPathUser(pathname) {
  return decodeURIComponent(pathname.split("/")[2]);
}

async function failedResult(promise, pattern) {
  const result = await promise;
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result), pattern);
  return result;
}

test("StarLists and StarListItems follow independent real cursors and return complete list metadata", async (t) => {
  const repos = [repository(1), repository(2), repository(3)];
  createGitHubFixture(t, {
    lists: [
      starList("L_ONE", "One", "one", [1, 2]),
      starList("L_TWO", "Two", "two", [3]),
    ],
    repositories: repos,
    metadataPageSize: 1,
    itemPageSize: 1,
  });

  const result = await getStarListsApi({ token: "must-not-be-used" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.viewer, { login: LOGIN });
  assert.equal(result.complete, true);
  assert.equal(result.scope, "all_pages");
  assert.equal(result.access, "token_visible");
  assert.equal(result.listCount, 2);
  assert.deepEqual(result.lists, [
    {
      id: "L_ONE", name: "One", description: "One description", isPrivate: true,
      slug: "one", url: `https://github.com/stars/${LOGIN}/lists/one`,
      items: [
        { id: repos[0].nodeId, databaseId: 1, nameWithOwner: repos[0].name },
        { id: repos[1].nodeId, databaseId: 2, nameWithOwner: repos[1].name },
      ],
    },
    {
      id: "L_TWO", name: "Two", description: "Two description", isPrivate: true,
      slug: "two", url: `https://github.com/stars/${LOGIN}/lists/two`,
      items: [{ id: repos[2].nodeId, databaseId: 3, nameWithOwner: repos[2].name }],
    },
  ]);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test("all mutations reject missing token, missing confirmation, malformed inputs and duplicate repositories before fetch", async (t) => {
  const previousToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  t.after(() => {
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
  });
  let fetches = 0;
  t.mock.method(globalThis, "fetch", async () => {
    fetches += 1;
    assert.fail("invalid mutation input must not fetch");
  });

  await assert.rejects(getStarListsApi(ctx), /GITHUB_TOKEN/);
  process.env.GITHUB_TOKEN = TOKEN;
  const assignment = { repositoryId: "R_FIXTURE_ONE", listIds: ["L_FIXTURE"] };
  await assert.rejects(batchClassifyStars(ctx, {
    assignments: [assignment], confirm: false,
  }), /confirm/i);
  await assert.rejects(batchClassifyStars(ctx, {
    assignments: [assignment], mode: "overwrite", confirm: true,
  }), /mode/i);
  await assert.rejects(batchClassifyStars(ctx, {
    assignments: [assignment, assignment], confirm: true,
  }), /duplicate|repository/i);
  await assert.rejects(batchClassifyStars(ctx, {
    assignments: [{ repositoryId: "R_FIXTURE_ONE", listIds: [] }], confirm: true,
  }), /listIds/i);
  await assert.rejects(mergeStarLists(ctx, {
    sourceListIds: ["L_SOURCE"], targetListId: "L_TARGET", confirm: false,
  }), /confirm/i);
  await assert.rejects(cleanupStarLists(ctx, {
    listIds: ["L_EMPTY"], confirm: false,
  }), /confirm/i);
  assert.equal(fetches, 0);
});

test("unknown lists and unstarred repositories fail preflight without any write", async (t) => {
  const repo = repository(1);
  const secondRepo = repository(2);
  const server = createGitHubFixture(t, {
    lists: [starList("L_KNOWN", "Known", "known")],
    repositories: [repo, secondRepo],
    itemPageSize: 100,
  });

  await assert.rejects(batchClassifyStars(ctx, {
    assignments: [
      { repositoryId: repo.nodeId, listIds: ["L_KNOWN"] },
      { repositoryId: secondRepo.nodeId, listIds: ["L_UNKNOWN"] },
    ],
    confirm: true,
  }), /list|unknown/i);
  await failedResult(batchClassifyStars(ctx, {
    assignments: [{ repositoryId: "R_NOT_STARRED", listIds: ["L_KNOWN"] }],
    confirm: true,
  }), /star|access|repository/i);
  server.setRestStatus(403);
  await failedResult(batchClassifyStars(ctx, {
    assignments: [{ repositoryId: repo.nodeId, listIds: ["L_KNOWN"] }],
    confirm: true,
  }), /star|access|read|403/i);

  assert.equal(server.classifyCalls, 0);
});

test("append preserves every other list, replace writes the exact set, and repeated calls are idempotent", async (t) => {
  const one = repository(1);
  const two = repository(2);
  const server = createGitHubFixture(t, {
    lists: [
      starList("L_A", "A", "a", [1]),
      starList("L_B", "B", "b", []),
      starList("L_C", "C", "c", [1]),
    ],
    repositories: [one, two],
    itemPageSize: 100,
  });

  const appended = await batchClassifyStars(ctx, {
    assignments: [
      { repositoryId: one.nodeId, listIds: ["L_B"] },
      { repositoryId: two.nodeId, listIds: ["L_B"] },
    ],
    confirm: true,
  });
  assert.equal(appended.ok, true);
  assert.deepEqual(
    new Map(server.classifyInputs().map(input => [input.itemId, input.listIds])),
    new Map([
      [one.nodeId, ["L_A", "L_B", "L_C"]],
      [two.nodeId, ["L_B"]],
    ]),
  );

  const replaced = await batchClassifyStars(ctx, {
    assignments: [
      { repositoryId: one.nodeId, listIds: ["L_B"] },
      { repositoryId: two.nodeId, listIds: ["L_A", "L_B"] },
    ],
    mode: "replace",
    confirm: true,
  });
  assert.equal(replaced.ok, true);
  assert.deepEqual(server.stateLists.find(list => list.id === "L_A").members, [2]);
  assert.deepEqual(server.stateLists.find(list => list.id === "L_B").members, [1, 2]);
  assert.deepEqual(server.stateLists.find(list => list.id === "L_C").members, []);

  const writes = server.classifyCalls;
  const repeated = await batchClassifyStars(ctx, {
    assignments: [
      { repositoryId: one.nodeId, listIds: ["L_B"] },
      { repositoryId: two.nodeId, listIds: ["L_A", "L_B"] },
    ],
    mode: "replace",
    confirm: true,
  });
  assert.equal(repeated.ok, true);
  assert.deepEqual(repeated.results.map(result => result.changed), [false, false]);
  assert.equal(server.classifyCalls, writes);
});

test("a partial ClassifyStars receipt stops before the next ten-item batch and preserves progress", async (t) => {
  const repos = Array.from({ length: 11 }, (_, index) => repository(index + 1));
  const server = createGitHubFixture(t, {
    lists: [starList("L_BATCH", "Batch", "batch", [])],
    repositories: repos,
    itemPageSize: 100,
    classify: ({ inputs }) => {
      if (server.classifyCalls > 1) assert.fail("later batches must not run after a partial response");
      const first = inputs[0];
      server.stateLists[0].members.push(repos[0].id);
      return response({
        data: {
          m0: { item: { id: first.itemId }, lists: [{ id: "L_BATCH" }] },
          m1: null,
        },
        errors: [{ message: "fixture item failed", path: ["m1"] }],
      });
    },
  });

  const result = await failedResult(batchClassifyStars(ctx, {
    assignments: repos.map(repo => ({ repositoryId: repo.nodeId, listIds: ["L_BATCH"] })),
    confirm: true,
  }), /fail|partial|uncertain|success/i);

  assert.equal(server.classifyCalls, 1);
  assert.deepEqual(result.results.map(entry => entry.repositoryId), [repos[0].nodeId]);
  assert.equal(result.pendingRepositoryIds.includes(repos[10].nodeId), true);
  assert.equal(result.uncertainRepositoryIds.includes(repos[1].nodeId), true);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test("ClassifyStars returns uncertain progress on transport failures and missing receipts without retrying", async (t) => {
  const cases = [
    {
      name: "network",
      reply() { throw new Error("fixture network failure"); },
      reason: /network/i,
    },
    {
      name: "http",
      reply: () => response({ message: "fixture upstream failure" }, { status: 502 }),
      reason: /http/i,
    },
    {
      name: "missing receipt",
      reply: () => response({ data: {} }),
      reason: /verified|receipt|response/i,
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async (subtest) => {
      const repos = Array.from({ length: 11 }, (_, index) => repository(index + 1));
      const server = createGitHubFixture(subtest, {
        lists: [starList("L_TRANSPORT", "Transport", "transport", [])],
        repositories: repos,
        itemPageSize: 100,
        classify: ({ server: fixture }) => {
          if (fixture.classifyCalls > 1) assert.fail("transport failure must not retry");
          return item.reply();
        },
      });

      const result = await failedResult(batchClassifyStars(ctx, {
        assignments: repos.map(repo => ({ repositoryId: repo.nodeId, listIds: ["L_TRANSPORT"] })),
        confirm: true,
      }), item.reason);

      assert.equal(server.classifyCalls, 1);
      assert.equal(result.results.length, 0);
      assert.equal(result.uncertainRepositoryIds.length, 10);
      assert.equal(result.pendingRepositoryIds.length, 11);
      assert.equal(JSON.stringify(result).includes(TOKEN), false);
    });
  }
});

test("merge updates first, verifies the target, then deletes sources while preserving the other memberships", async (t) => {
  const one = repository(1);
  const two = repository(2);
  const three = repository(3);
  const four = repository(4);
  const server = createGitHubFixture(t, {
    lists: [
      starList("L_SOURCE", "Source", "source", [1, 2]),
      starList("L_SECOND", "Second", "second", [2, 3]),
      starList("L_TARGET", "Target", "target", [4]),
      starList("L_OTHER", "Other", "other", [1]),
    ],
    repositories: [one, two, three, four],
    itemPageSize: 100,
  });

  const result = await mergeStarLists(ctx, {
    sourceListIds: ["L_SOURCE", "L_SECOND"],
    targetListId: "L_TARGET",
    confirm: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    new Map(server.classifyInputs().map(input => [input.itemId, input.listIds])),
    new Map([
      [one.nodeId, ["L_OTHER", "L_SOURCE", "L_TARGET"]],
      [two.nodeId, ["L_SECOND", "L_SOURCE", "L_TARGET"]],
      [three.nodeId, ["L_SECOND", "L_TARGET"]],
    ]),
  );
  assert.equal(server.stateLists.some(list => list.id === "L_SOURCE"), false);
  assert.equal(server.stateLists.some(list => list.id === "L_SECOND"), false);
  assert.deepEqual(server.stateLists.find(list => list.id === "L_TARGET").members, [4, 1, 2, 3]);
  assert.deepEqual(server.stateLists.find(list => list.id === "L_OTHER").members, [1]);

  const operations = server.operationNames();
  const classification = operations.indexOf("ClassifyStars");
  const verification = operations.indexOf("StarLists", classification + 1);
  const cleanup = operations.indexOf("CleanupStarLists", verification + 1);
  const confirmation = operations.indexOf("StarLists", cleanup + 1);
  assert.ok(classification >= 0 && classification < verification);
  assert.ok(verification < cleanup && cleanup < confirmation);
});

test("merge does not delete sources when the reread does not prove the target update", async (t) => {
  const repo = repository(1);
  const server = createGitHubFixture(t, {
    lists: [
      starList("L_SOURCE", "Source", "source", [1]),
      starList("L_TARGET", "Target", "target", []),
    ],
    repositories: [repo],
    itemPageSize: 100,
    classify: ({ inputs }) => response({
      data: Object.fromEntries(inputs.map((input, index) => [`m${index}`, {
        item: { id: input.itemId },
        lists: input.listIds.map(id => ({ id })),
      }])),
    }),
  });

  const result = await failedResult(mergeStarLists(ctx, {
    sourceListIds: ["L_SOURCE"],
    targetListId: "L_TARGET",
    confirm: true,
  }), /verif|target|saved|incomplete/i);

  assert.ok(result);
  assert.equal(result.ok, false);
  assert.equal(server.cleanupCalls, 0);
  assert.equal(server.stateLists.some(list => list.id === "L_SOURCE"), true);
});

test("cleanup deletes only empty or fully covered lists and rejects uncovered members before writing", async (t) => {
  const covered = repository(1);
  const uncovered = repository(2);
  const server = createGitHubFixture(t, {
    lists: [
      starList("L_EMPTY", "Empty", "empty"),
      starList("L_COVERED", "Covered", "covered", [1]),
      starList("L_KEEP", "Keep", "keep", [1]),
      starList("L_UNCOVERED", "Uncovered", "uncovered", [2]),
    ],
    repositories: [covered, uncovered],
    itemPageSize: 100,
  });

  const success = await cleanupStarLists(ctx, {
    listIds: ["L_EMPTY", "L_COVERED"],
    coveredByListIds: ["L_KEEP"],
    confirm: true,
  });
  assert.equal(success.ok, true);
  assert.equal(server.stateLists.some(list => list.id === "L_EMPTY"), false);
  assert.equal(server.stateLists.some(list => list.id === "L_COVERED"), false);
  assert.deepEqual(server.stateLists.find(list => list.id === "L_KEEP").members, [1]);

  const writes = server.cleanupCalls;
  await failedResult(cleanupStarLists(ctx, {
    listIds: ["L_UNCOVERED"],
    coveredByListIds: ["L_KEEP"],
    confirm: true,
  }), /cover|member|retain/i);
  const readsBeforeOverlap = server.calls.length;
  await assert.rejects(cleanupStarLists(ctx, {
    listIds: ["L_UNCOVERED", "L_KEEP"],
    coveredByListIds: ["L_KEEP"],
    confirm: true,
  }), /overlap|source|covered/i);
  assert.equal(server.cleanupCalls, writes);
  assert.equal(server.calls.length, readsBeforeOverlap);
});

test("cleanup returns partial-delete progress without retrying a failed alias", async (t) => {
  const server = createGitHubFixture(t, {
    lists: [
      starList("L_ONE", "One", "one"),
      starList("L_TWO", "Two", "two"),
    ],
    repositories: [],
    itemPageSize: 100,
    cleanup: ({ inputs }) => {
      if (server.cleanupCalls > 1) assert.fail("cleanup must not retry after a partial response");
      const first = inputs[0];
      server.stateLists.splice(server.stateLists.findIndex(list => list.id === first.listId), 1);
      return response({
        data: {
          m0: { clientMutationId: first.clientMutationId },
          m1: null,
        },
        errors: [{ message: "fixture delete failed", path: ["m1"] }],
      });
    },
  });

  const result = await failedResult(cleanupStarLists(ctx, {
    listIds: ["L_ONE", "L_TWO"],
    confirm: true,
  }), /fail|partial|uncertain|success/i);

  assert.equal(server.cleanupCalls, 1);
  assert.deepEqual(result.deletedListIds, ["L_ONE"]);
  assert.equal(result.pendingListIds.includes("L_TWO") || result.uncertainListIds.includes("L_TWO"), true);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test("cleanup retains confirmed deletions when its verification response is malformed", async (t) => {
  createGitHubFixture(t, {
    lists: [starList("L_EMPTY", "Empty", "empty")],
    repositories: [],
    cleanup: ({ server, inputs }) => {
      server.stateLists.length = 0;
      server.handle = async () => response({ data: { viewer: { login: LOGIN, lists: null } } });
      return response({ data: { m0: { clientMutationId: inputs[0].clientMutationId } } });
    },
  });
  const result = await cleanupStarLists(ctx, { listIds: ["L_EMPTY"], confirm: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cleanup_verification_failed");
  assert.deepEqual(result.deletedListIds, ["L_EMPTY"]);
  assert.deepEqual(result.pendingListIds, []);
});

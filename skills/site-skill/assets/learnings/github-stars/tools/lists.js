function repositoryUrlFrom(value) {
  const url = new URL(value);
  if (url.origin !== "https://github.com" || url.username || url.password || !/^\/[^/]+\/[^/]+\/?$/.test(url.pathname)) {
    throw new Error("url must be a GitHub repository URL");
  }
  return url.origin + url.pathname.replace(/\/$/, "");
}

export async function getRepositoryLists(ctx, args = {}) {
  const repositoryUrl = repositoryUrlFrom(args.url);
  await ctx.openOrReuseTab(repositoryUrl, { wait: true });
  await ctx.waitForLoad();
  return ctx.js(`(async () => {
    const result = await (${readRepositoryListsInPage})(${JSON.stringify(repositoryUrl)});
    if (!result.ok) return result;
    return { ok: true, repositoryUrl: ${JSON.stringify(repositoryUrl)}, lists: result.lists,
      selectedLists: result.lists.filter(list => list.selected) };
  })()`);
}

export async function addRepositoryToLists(ctx, args = {}) {
  if (args.confirm !== true) throw new Error("confirm: true is required to modify GitHub lists");
  const repositoryUrl = repositoryUrlFrom(args.url);
  if (!Array.isArray(args.listNames) || !args.listNames.length ||
      args.listNames.some(name => typeof name !== "string" || !name.trim())) {
    throw new Error("listNames must be a non-empty array of list names");
  }
  const listNames = [...new Set(args.listNames.map(name => name.trim()))];
  await ctx.openOrReuseTab(repositoryUrl, { wait: true });
  await ctx.waitForLoad();
  const pending = await ctx.js(`(${addToListsInPage})(${JSON.stringify(listNames)}, ${readRepositoryListsInPage})`);
  if (!pending.ok || !pending.changed) return pending;
  await ctx.waitForElement('html:not([data-site-skill-list-submit])', { timeout: 20, visible: true });
  await ctx.gotoAndWait(repositoryUrl);
  return ctx.js(`(${verifyMembershipsInPage})(${JSON.stringify(pending)}, ${readRepositoryListsInPage})`);
}

async function readRepositoryListsInPage(repositoryUrl) {
  const action = `${repositoryUrl}/lists`;
  const response = await fetch(`${action}?experimental=1`, {
    headers: { Accept: "text/fragment+html" }, cache: "no-store",
  });
  if (!response.ok) return { ok: false, reason: "list_read_failed", status: response.status, repositoryUrl };
  const root = new DOMParser().parseFromString(await response.text(), "text/html");
  const form = root.querySelector('input[name="list_ids[]"]')?.closest("form");
  if (!form) return { ok: false, reason: "list_menu_not_found", repositoryUrl };
  const lists = [...root.querySelectorAll('[role="option"][data-value]')].map(option => ({
    id: option.getAttribute("data-value"), name: option.textContent.trim(),
    selected: option.getAttribute("aria-selected") === "true",
  }));
  return { ok: true, form, lists };
}

async function addToListsInPage(listNames, read) {
  if (/^\/(?:login|session|sessions)(?:\/|$)/.test(location.pathname)) {
    return { ok: false, reason: "login_required" };
  }
  const repositoryUrl = location.origin + location.pathname;
  const starred = [...document.querySelectorAll("button[aria-label]")].some(button =>
    button.getAttribute("aria-label") === `Unstar ${location.pathname.slice(1)}` && button.getClientRects().length
  );
  if (!starred) return { ok: false, reason: "repository_not_starred", repositoryUrl };
  const action = new URL(`${location.pathname}/lists`, location.origin);
  const before = await read(repositoryUrl);
  if (!before.ok) return before;
  const formAction = new URL(before.form.getAttribute("action"), location.href);
  if (formAction.href !== action.href || before.form.method !== "post" ||
      before.form.querySelector('[name="_method"]')?.value !== "put") {
    throw new Error("repository list form has an unexpected action or method");
  }
  const targets = listNames.map(name => {
    const matches = before.lists.filter(list => list.name === name);
    if (matches.length !== 1) throw new Error(`List name must identify exactly one existing list: ${name}`);
    return matches[0];
  });
  const addedLists = targets.filter(list => !list.selected).map(({ id, name }) => ({ id, name }));
  const alreadyPresentLists = targets.filter(list => list.selected).map(({ id, name }) => ({ id, name }));
  const selected = before.lists.filter(list => list.selected);
  if (!addedLists.length) {
    return { ok: true, repositoryUrl, changed: false, addedLists, alreadyPresentLists,
      selectedLists: selected.map(({ id, name }) => ({ id, name })) };
  }
  const body = new FormData(before.form);
  body.set("list_ids[]", "");
  for (const id of new Set([...selected, ...targets].map(list => list.id))) body.append("list_ids[]", id);
  body.set("user_list_menu_dirty", "1");
  const form = before.form;
  form.replaceChildren();
  for (const [name, value] of body) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  form.hidden = true;
  document.body.append(form);
  // A same-URL redirect must replace the submitting document before verification.
  document.documentElement.setAttribute("data-site-skill-list-submit", "");
  form.requestSubmit();
  return { ok: true, repositoryUrl, changed: true, addedLists, alreadyPresentLists,
    selectedLists: [...selected, ...targets].map(({ id, name }) => ({ id, name })) };
}

async function verifyMembershipsInPage(pending, read) {
  const { repositoryUrl, selectedLists: required, ...result } = pending;
  const after = await read(repositoryUrl);
  if (!after.ok) return after;
  const selectedLists = after.lists.filter(list => list.selected).map(({ id, name }) => ({ id, name }));
  if (!required.every(list => selectedLists.some(saved => saved.id === list.id))) {
    return { ok: false, reason: "list_membership_not_saved", repositoryUrl, selectedLists };
  }
  return { ...result, repositoryUrl, selectedLists };
}

export async function getStarLists(ctx, args = {}) {
  if (args.url !== undefined) {
    const url = new URL(args.url);
    if (url.origin !== "https://github.com" || url.username || url.password ||
        !/^\/[^/]+\/?$/.test(url.pathname) || url.searchParams.get("tab") !== "stars") {
      throw new Error("url must be a GitHub Profile Stars URL");
    }
    await ctx.openOrReuseTab(url.href, { wait: true });
    await ctx.waitForLoad();
  } else {
    await ctx.openOrReuseTab("https://github.com/stars", { wait: true });
    await ctx.waitForLoad();
    const profileUrl = await ctx.js(`(() => [...document.querySelectorAll('a[href]')]
      .find(link => new URL(link.href).searchParams.get("tab") === "stars")?.href || "")()`);
    if (!profileUrl) return { ok: false, reason: "stars_profile_not_found" };
    await ctx.gotoAndWait(profileUrl);
  }
  return ctx.js(`(${extractStarListsInPage})()`);
}

function extractStarListsInPage() {
  const root = document.querySelector("#profile-lists-container");
  if (!root) return { ok: false, reason: "star_lists_not_found", url: location.href };
  // Collapsed cards remain in the DOM; reading them avoids the eight-card UI limit.
  const lists = [...root.querySelectorAll('a[href*="/lists/"]')].map(link => {
    const count = [...link.querySelectorAll("div")].map(div => div.textContent.trim())
      .find(text => /^[\d,]+ repositor(?:y|ies)$/.test(text));
    return { name: link.querySelector("h3").textContent.trim(),
      url: new URL(link.getAttribute("href"), location.href).href,
      description: link.querySelector("span")?.textContent.trim() || "",
      repositoryCount: count ? Number(count.replace(/[^\d]/g, "")) : null };
  });
  const query = new URL(location.href).searchParams;
  return { ok: true, url: location.href, lists, listCount: lists.length,
    scope: "all_dom_lists", sort: query.get("user_lists_sort") || "updated_at",
    direction: query.get("user_lists_direction") || "desc" };
}

export async function editList(ctx, args = {}) {
  if (args.confirm !== true) throw new Error("confirm: true is required to edit a GitHub list");
  const url = new URL(args.url);
  if (url.origin !== "https://github.com" || url.username || url.password ||
      !/^\/stars\/[^/]+\/lists\/[^/]+\/?$/.test(url.pathname)) {
    throw new Error("url must be a GitHub list URL");
  }
  const patch = {};
  if (args.name !== undefined) {
    if (typeof args.name !== "string" || !args.name.trim() || args.name.trim().length > 32) {
      throw new Error("name must contain 1 to 32 characters");
    }
    patch.name = args.name.trim();
  }
  if (args.description !== undefined) {
    if (typeof args.description !== "string" || args.description.length > 160) throw new Error("description must contain at most 160 characters");
    patch.description = args.description;
  }
  if (args.isPrivate !== undefined) {
    if (typeof args.isPrivate !== "boolean") throw new Error("isPrivate must be a boolean");
    patch.isPrivate = args.isPrivate;
  }
  if (!Object.keys(patch).length) throw new Error("at least one list field must be provided");
  const listUrl = url.origin + url.pathname.replace(/\/$/, "");
  const profileUrl = `${url.origin}/${url.pathname.split("/")[2]}?tab=stars`;
  await ctx.openOrReuseTab(listUrl, { wait: true });
  await ctx.waitForLoad();
  const pending = await ctx.js(`(${editListInPage})(${JSON.stringify({ patch, listUrl, profileUrl })})`);
  if (!pending.ok || !pending.changed) return pending;
  await ctx.waitForElement('html:not([data-site-skill-list-submit])', { timeout: 20, visible: true });
  await ctx.gotoAndWait(profileUrl);
  const overview = await ctx.js(`(${extractStarListsInPage})()`);
  if (!overview.ok) return overview;
  const matches = overview.lists.filter(list => list.name === pending.name);
  if (matches.length !== 1) return { ok: false, reason: "list_edit_not_saved", url: listUrl };
  await ctx.gotoAndWait(matches[0].url);
  const verified = await ctx.js(`(${verifyCreatedListInPage})(${JSON.stringify({ ...pending,
    action: `${url.origin}/stars/${url.pathname.split("/")[2]}/lists` })})`);
  return verified.ok ? { ...verified, changed: true } : { ...verified, reason: "list_edit_not_saved" };
}

async function editListInPage({ patch, listUrl, profileUrl }) {
  const form = document.querySelector('input[name="user_list[name]"]')?.closest("form");
  if (!form) return { ok: false, reason: "edit_list_form_not_found", url: location.href };
  if (new URL(form.getAttribute("action"), location.href).href !== listUrl || form.method !== "post" ||
      form.querySelector('[name="_method"]')?.value !== "put") {
    throw new Error("edit list form has an unexpected action or method");
  }
  const name = form.querySelector('input[name="user_list[name]"]');
  const description = form.querySelector('textarea[name="user_list[description]"]');
  const isPrivate = form.querySelector('input[type="checkbox"][name="user_list[private]"]');
  const before = { name: name.value, description: description.value, isPrivate: isPrivate.checked };
  const expected = { ...before, ...patch };
  if (Object.keys(patch).every(key => patch[key] === before[key])) {
    return { ok: true, changed: false, url: listUrl, ...before };
  }
  if (expected.name !== before.name) {
    const response = await fetch(profileUrl, { cache: "no-store" });
    if (!response.ok) return { ok: false, reason: "list_read_failed", status: response.status };
    const root = new DOMParser().parseFromString(await response.text(), "text/html");
    if (!root.querySelector("#profile-lists-container")) return { ok: false, reason: "star_lists_not_found" };
    if ([...root.querySelectorAll('#profile-lists-container h3')].some(h3 => h3.textContent.trim() === expected.name)) {
      throw new Error(`A list with this name already exists: ${expected.name}`);
    }
  }
  name.value = expected.name;
  description.value = expected.description;
  isPrivate.checked = expected.isPrivate;
  document.documentElement.setAttribute("data-site-skill-list-submit", "");
  form.requestSubmit();
  return { ok: true, changed: true, ...expected };
}

export async function createList(ctx, args = {}) {
  if (args.confirm !== true) throw new Error("confirm: true is required to create a GitHub list");
  const name = typeof args.name === "string" ? args.name.trim() : "";
  const description = args.description === undefined ? "" : args.description;
  const isPrivate = args.isPrivate === undefined ? true : args.isPrivate;
  if (!name || name.length > 32) throw new Error("name must contain 1 to 32 characters");
  if (typeof description !== "string" || description.length > 160) throw new Error("description must contain at most 160 characters");
  if (typeof isPrivate !== "boolean") throw new Error("isPrivate must be a boolean");
  await ctx.openOrReuseTab("https://github.com/stars", { wait: true });
  await ctx.waitForLoad();
  const profileUrl = await ctx.js(`(() => [...document.querySelectorAll('a[href]')]
    .find(link => new URL(link.href).searchParams.get("tab") === "stars")?.href || "")()`);
  if (!profileUrl) return { ok: false, reason: "stars_profile_not_found" };
  await ctx.gotoAndWait(profileUrl);
  const submitted = await ctx.js(`(${createListInPage})(${JSON.stringify({ name, description, isPrivate })})`);
  if (!submitted.ok) return submitted;
  await ctx.waitForElement('button[data-show-dialog-id^="edit-list-dialog-"]', { timeout: 20, visible: true });
  await ctx.waitForLoad();
  return ctx.js(`(${verifyCreatedListInPage})(${JSON.stringify({ name, description, isPrivate, action: submitted.action })})`);
}

async function createListInPage({ name, description, isPrivate }) {
  const existing = [...document.querySelectorAll('#profile-lists-container a[href*="/lists/"]')];
  if (existing.some(link => link.querySelector("h3")?.textContent.trim() === name)) {
    throw new Error(`A list with this name already exists: ${name}`);
  }
  const form = document.querySelector('input[name="user_list[name]"]')?.closest("form");
  if (!form) return { ok: false, reason: "create_list_form_not_found" };
  const action = new URL(form.getAttribute("action"), location.href);
  if (action.origin !== location.origin || action.pathname !== `/stars${location.pathname}/lists` || form.method !== "post") {
    throw new Error("create list form has an unexpected action or method");
  }
  form.querySelector('input[name="user_list[name]"]').value = name;
  form.querySelector('textarea[name="user_list[description]"]').value = description;
  form.querySelector('input[type="checkbox"][name="user_list[private]"]').checked = isPrivate;
  // GitHub rejects fetch submissions with 406; submit through normal form navigation.
  form.requestSubmit();
  return { ok: true, action: action.href };
}

async function verifyCreatedListInPage({ name, description, isPrivate, action }) {
  const listUrl = new URL(location.href);
  if (listUrl.origin !== new URL(action).origin || !listUrl.pathname.startsWith(`${new URL(action).pathname}/`)) {
    return { ok: false, reason: "list_creation_not_saved" };
  }
  const saved = await fetch(listUrl.href, { cache: "no-store" });
  if (!saved.ok) return { ok: false, reason: "list_verification_failed", status: saved.status, url: listUrl.href };
  const root = new DOMParser().parseFromString(await saved.text(), "text/html");
  const savedName = root.querySelector('input[name="user_list[name]"]')?.value;
  const savedDescription = root.querySelector('textarea[name="user_list[description]"]')?.value;
  const savedPrivate = root.querySelector('input[type="checkbox"][name="user_list[private]"]')?.checked;
  if (savedName !== name || savedDescription !== description || savedPrivate !== isPrivate) {
    return { ok: false, reason: "list_creation_not_saved", url: listUrl.href };
  }
  return { ok: true, name: savedName, description: savedDescription, isPrivate: savedPrivate, url: listUrl.href };
}

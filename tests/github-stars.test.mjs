import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { getStars } from "../skills/site-skill/assets/learnings/github-stars/tools/get-stars.js";
import { getListRepositories } from "../skills/site-skill/assets/learnings/github-stars/tools/get-list-repositories.js";

const source = readFileSync(new URL("../skills/site-skill/assets/learnings/github-stars/browser-tools/extract-stars.js", import.meta.url), "utf8");
const search = '<form role="search" aria-label="Starred repositories"><input name="q"></form>';
const repository = `<li>
  <div><h3><a href="/owner/repo-one"><span>owner / </span>repo-one</a></h3></div>
  <div><dialog><h3>Sorry, something went wrong.</h3><p>Hidden error description</p></dialog></div>
  <div><p>Repository description with error handling.</p></div>
  <div><span itemprop="programmingLanguage">JavaScript</span>
    <a href="/owner/repo-one/stargazers">1,234</a><a href="/owner/repo-one/forks">56</a>
    <span>Last updated <relative-time datetime="2026-11-12T10:00:00Z">yesterday</relative-time></span>
  </div>
</li>`;
const topic = `<li><a href="/topics/example"><div>#</div><div><p>Example topic</p><p>Topic description</p></div></a>
  <div>Starred <relative-time datetime="2026-11-01T10:00:00Z">last week</relative-time></div></li>`;
const profileRepository = `<article class="profile-repository">
  <div><h3><a href="/alice/profile-one"><span>alice / </span>profile-one</a></h3></div>
  <div><dialog><h3>Sorry, something went wrong.</h3><p>Hidden error description</p></dialog></div>
  <div><p>Profile repository description.</p></div>
  <div><span itemprop="programmingLanguage">Ruby</span>
    <a href="/alice/profile-one/stargazers">9</a><a href="/alice/profile-one/forks">2</a>
    <span>Updated <relative-time datetime="2026-11-10T10:00:00Z">3 days ago</relative-time></span>
  </div>
</article>`;
const profileCollection = `<a href="/alice?tab=stars&amp;type=lists">
  <div><h3>Grouped list card</h3><p>This anchor contains its heading and is not a repository.</p></div>
</a>`;
const listMetadata = `<form action="/stars/alice/lists/frontend-picks" method="post" hidden>
  <input type="hidden" name="_method" value="put">
  <input required maxlength="32" name="user_list[name]" value="Frontend picks">
  <textarea maxlength="160" name="user_list[description]">Useful browser tools</textarea>
  <input type="hidden" name="user_list[private]" value="0">
  <input type="checkbox" name="user_list[private]" checked></form>`;
const listedRepository = `<article>
  <h2><a href="/alice/listed-one">alice / listed-one</a></h2>
  <p>Listed repository description.</p>
  <span itemprop="programmingLanguage">JavaScript</span>
  <a href="/alice/listed-one/stargazers">21</a><a href="/alice/listed-one/forks">4</a>
</article>`;

function extract(html, { url = "https://github.com/stars", readyState = "complete", args = {} } = {}) {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  Object.defineProperty(document, "readyState", { value: readyState });
  return new Function("document", "location", `return (${source});`)(document, new URL(url))(args);
}

test("mixed Stars cards exclude hidden dialogs and preserve counts and time meaning", async () => {
  const result = await extract(`<main><h1>Your Stars</h1>${search}<ul>${repository}${topic}</ul></main>`);
  assert.equal(result.ok, true);
  assert.equal(result.scope, "current_page");
  assert.equal(result.totalLoaded, 2);
  assert.equal(result.itemCount, 2);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.items[0], {
    type: "repository", name: "owner/repo-one", url: "https://github.com/owner/repo-one",
    description: "Repository description with error handling.", language: "JavaScript", stars: "1,234", forks: "56",
    time: { label: "Last updated", datetime: "2026-11-12T10:00:00Z", text: "yesterday" },
  });
  assert.deepEqual(result.items[1], {
    type: "topic", name: "Example topic", url: "https://github.com/topics/example",
    description: "Topic description", time: { label: "Starred", datetime: "2026-11-01T10:00:00Z", text: "last week" },
  });
});

test("pagination follows actual nofollow links and keeps the query, filter and sort", async () => {
  const url = "https://github.com/stars/example/repositories?filter=others&language=javascript&q=tool&sort=updated&direction=asc&page=2";
  const result = await extract(`<main>${search}<ul>${repository}</ul>
    <div class="paginate-container"><a rel="nofollow" href="?page=1&q=tool">Previous</a>
      <a rel="nofollow" href="?page=3&q=tool&language=javascript&filter=others&sort=updated&direction=asc">Next</a></div>
    <aside aria-label="Star filters"><ul><li><a href="/stars/example/repositories?filter=all">3 All repositories</a></li></ul></aside>
    <details><div role="menu"><a href="?sort=created">Recently starred</a></div></details>
  </main>`, { url });
  assert.equal(result.query, "tool");
  assert.equal(result.filter, "others");
  assert.equal(result.language, "javascript");
  assert.equal(result.sort, "updated");
  assert.equal(result.direction, "asc");
  assert.equal(new URL(result.previousUrl).searchParams.get("page"), "1");
  assert.equal(new URL(result.nextUrl).searchParams.get("page"), "3");
  assert.equal(new URL(result.nextUrl).searchParams.get("q"), "tool");
  assert.deepEqual(result.filters, [{ text: "3 All repositories", url: "https://github.com/stars/example/repositories?filter=all" }]);
  assert.equal(result.sortOptions[0].text, "Recently starred");
});

test("overview collection links and extraction cap do not imply a complete collection", async () => {
  const result = await extract(`<main>${search}<ul>${repository}${topic}</ul>
    <a href="/stars/example/repositories?filter=all">See all starred repositories</a></main>`, { args: { maxItems: 1 } });
  assert.equal(result.itemCount, 1);
  assert.equal(result.totalLoaded, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.nextUrl, "");
  assert.equal(result.collectionLinks[0].url, "https://github.com/stars/example/repositories?filter=all");
});

test("missing optional repository and topic fields stay empty", async () => {
  const result = await extract(`<main>${search}<ul><li><div><h3><a href="/owner/bare">bare</a></h3></div></li>
    <li><a href="/topics/bare"><p>bare</p></a></li></ul></main>`);
  assert.equal(result.items[0].description, "");
  assert.equal(result.items[0].language, "");
  assert.equal(result.items[0].stars, "");
  assert.equal(result.items[0].forks, "");
  assert.equal(result.items[0].time, null);
  assert.equal(result.items[1].description, "");
});

test("empty search succeeds while unknown, unrelated and loading pages fail explicitly", async () => {
  const result = await extract(`<main>${search}<div class="blankslate"><h3>Sorry, we couldn’t find any matching starred repositories.</h3></div></main>`);
  assert.equal(result.ok, true);
  assert.deepEqual(result.items, []);
  assert.match(result.emptyMessage, /couldn’t find/);
  assert.equal((await extract(`<main>${search}</main>`)).reason, "stars_not_found");
  assert.equal((await extract(`<main>${search}<ul>${repository}</ul></main>`, { readyState: "interactive" })).reason, "page_loading");
  assert.equal((await extract("<main>Sign in</main>", { url: "https://github.com/login?return_to=%2Fstars" })).reason, "login_required");
  assert.equal((await extract("<main>Repository</main>", { url: "https://github.com/owner/repo-one" })).reason, "unsupported_page");
  assert.equal((await extract(`<main>${search}<ul>${repository}</ul></main>`, { url: "https://github.com/stars/example/lists" })).reason, "unsupported_page");
  assert.equal((await extract("<main></main>", { url: "https://user@github.com/alice?tab=stars" })).reason, "unsupported_page");
});

test("item limit rejects invalid external arguments", async () => {
  for (const maxItems of [0, -1, 101, 1.5, "2"]) {
    await assert.rejects(extract("", { args: { maxItems } }), /maxItems must be an integer from 1 to 100/);
  }
});

test("Stars filter and sort extraction is scoped by the stable menu button ids", async () => {
  const result = await extract(`<main>${search}<ul>${repository}</ul>
    <button id="stars-type-filter-menu-button" aria-controls="stars-type-menu">Type</button>
    <div id="stars-type-menu" role="menu"><a href="/stars/alice/repositories?filter=all&amp;type=source">Sources</a></div>
    <button id="stars-language-filter-menu-button" aria-controls="stars-language-menu">Language</button>
    <div id="stars-language-menu" role="menu"><a href="/stars/alice/repositories?filter=all&amp;language=ruby">Ruby</a></div>
    <button id="stars-sort-menu-button" aria-controls="stars-sort-menu">Sort</button>
    <div id="stars-sort-menu" role="menu"><a href="/stars/alice/repositories?filter=all&amp;sort=updated">Updated</a></div>
    <div role="menu"><a href="/stars/alice/repositories?unrelated=1">Unrelated menu</a></div>
  </main>`, { url: "https://github.com/stars/alice/repositories?type=source&sort=updated" });
  assert.deepEqual(result.filters.map(link => link.text), ["Sources", "Ruby"]);
  assert.deepEqual(result.sortOptions.map(link => link.text), ["Updated"]);
});

test("Profile extraction selects repository headings, excludes list-card anchors and preserves the after cursor", async () => {
  const url = "https://github.com/alice?tab=stars&q=tool&type=source&sort=created&direction=desc";
  const next = "/alice?tab=stars&after=Y3Vyc29yOnYyOpK5Mjc%3D&q=tool&type=source&sort=created&direction=desc";
  const result = await extract(`<main><h1>alice</h1><div id="user-profile-frame">
    ${profileRepository}<div id="profile-lists-container">${profileCollection}</div>
  </div><div class="paginate-container"><a href="${next}">Next</a></div></main>`, { url });
  assert.equal(result.ok, true);
  assert.equal(result.layout, "profile");
  assert.equal(result.itemCount, 1);
  assert.equal(result.totalLoaded, 1);
  assert.equal(result.query, "tool");
  assert.equal(result.filter, "source");
  assert.equal(result.sort, "created");
  assert.equal(result.direction, "desc");
  assert.deepEqual(result.items[0], {
    type: "repository", name: "alice/profile-one", url: "https://github.com/alice/profile-one",
    description: "Profile repository description.", language: "Ruby", stars: "9", forks: "2",
    time: { label: "Updated", datetime: "2026-11-10T10:00:00Z", text: "3 days ago" },
  });
  assert.equal(result.nextUrl, new URL(next, url).href);
  assert.equal(new URL(result.nextUrl).searchParams.get("after"), "Y3Vyc29yOnYyOpK5Mjc=");
  assert.equal(new URL(result.nextUrl).searchParams.has("page"), false);
});

test("List extraction uses list headings and hidden edit-form metadata", async () => {
  const url = "https://github.com/stars/alice/lists/frontend-picks";
  const result = await extract(`<main><h1>GitHub list</h1>${listMetadata}
    <section id="user-list-repositories">${listedRepository}</section>
    <div class="paginate-container"><a href="/stars/alice/lists/frontend-picks?after=OPAQUE">Next</a></div>
  </main>`, { url });
  assert.equal(result.ok, true);
  assert.equal(result.layout, "list");
  assert.equal(result.title, "Frontend picks");
  assert.deepEqual(result.list, {
    name: "Frontend picks", description: "Useful browser tools", private: true,
  });
  assert.equal(result.itemCount, 1);
  assert.deepEqual(result.items[0], {
    type: "repository", name: "alice/listed-one", url: "https://github.com/alice/listed-one",
    description: "Listed repository description.", language: "JavaScript", stars: "21", forks: "4", time: null,
  });
  assert.equal(result.nextUrl, "https://github.com/stars/alice/lists/frontend-picks?after=OPAQUE");
});

test("Profile div cards keep separate descriptions and flat metadata time labels", async () => {
  const cards = ["First", "Second"].map((text, i) => `<div><div><h3><a href="/owner/repo-${i}">repo-${i}</a></h3></div>
    <div><p>${text}</p></div><div><span itemprop="programmingLanguage">JavaScript</span>
    <a href="/owner/repo-${i}/stargazers">${i}</a> Updated <relative-time datetime="2026-11-12T00:00:00Z">yesterday</relative-time></div></div>`).join("");
  const result = await extract(`<main><div id="user-profile-frame"><div>${cards}</div></div></main>`, { url: "https://github.com/example?tab=stars" });
  assert.deepEqual(result.items.map(item => item.description), ["First", "Second"]);
  assert.deepEqual(result.items.map(item => item.stars), ["0", "1"]);
  assert.deepEqual(result.items.map(item => item.time.label), ["Updated", "Updated"]);
});

test("empty List pages succeed only with the edit control and visible empty prompt", async () => {
  const url = "https://github.com/stars/alice/lists/empty-list";
  const page = `<main><h1>GitHub list</h1>${listMetadata}
    <button data-show-dialog-id="edit-list-dialog-empty">Edit list</button>
    <div class="blankslate"><h3>This list has no repositories.</h3></div></main>`;
  const result = await extract(page, { url });
  assert.equal(result.ok, true);
  assert.equal(result.layout, "list");
  assert.equal(result.itemCount, 0);
  assert.equal(result.emptyMessage, "This list has no repositories.");
  assert.equal(result.list.name, "Frontend picks");
  assert.equal((await extract(`<main>${listMetadata}</main>`, { url })).reason, "stars_not_found");
});

test("getStars waits for loading before extracting and preserves extraction failures", async () => {
  const calls = [];
  const failure = { ok: false, reason: "login_required", url: "https://github.com/login" };
  const ctx = {
    async openOrReuseTab(url) { calls.push(["open", url]); },
    async waitForLoad() { calls.push(["load"]); },
    async runSiteBrowserTool(site, tool, args) { calls.push(["extract", site, tool, args]); return failure; },
  };
  const url = "https://github.com/stars/example/topics?filter=topics&q=example";
  const result = await getStars(ctx, { url, maxItems: 5 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, failure.reason);
  assert.equal(result.url, failure.url);
  assert.equal(result.requestedUrl, url);
  assert.equal(result.complete, false);
  assert.equal(result.pagesRead, 0);
  assert.equal(result.nextUrl, url);
  assert.equal(result.stopReason, "blocked");
  assert.deepEqual(result.items, []);
  assert.deepEqual(calls, [["open", url], ["load"], ["extract", "github-stars", "extract_stars", {}]]);
  calls.length = 0;
  await getStars(ctx);
  assert.equal(calls[0][1], "https://github.com/stars");
});

test("getStars rejects non-Stars destinations and embedded credentials before navigation", async () => {
  const ctx = { async openOrReuseTab() { assert.fail("invalid URL must not navigate"); } };
  for (const url of ["https://example.com/stars", "http://github.com/stars", "https://github.com/owner/repo",
    "https://github.com/stars/example/lists", "https://user@github.com/stars"]) {
    await assert.rejects(getStars(ctx, { url }), /url must be a GitHub Stars/);
  }
});

const starsUrl = "https://github.com/stars/example/repositories?filter=all";
const starred = id => ({ type: "repository", name: `owner/repo-${id}`, url: `https://github.com/owner/repo-${id}` });
const batch = (items, nextUrl = "") => ({ ok: true, items, nextUrl, truncated: false, filters: [] });

function paginatedContext(batches) {
  const navigations = [];
  let currentUrl;
  let index = 0;
  return {
    navigations,
    async openOrReuseTab(url) { navigations.push(["open", url]); currentUrl = url; },
    async waitForLoad() {},
    async gotoAndWait(url) { navigations.push(["navigate", url]); currentUrl = url; },
    async runSiteBrowserTool(site, tool, args) {
      assert.equal(site, "github-stars");
      assert.equal(tool, "extract_stars");
      assert.deepEqual(args, {});
      assert.ok(index < batches.length, "unexpected extra page extraction");
      return { url: currentUrl, ...batches[index++] };
    },
  };
}

test("getStars reads explicit Profile and List routes without redirecting to repositories", async () => {
  for (const requested of [
    "https://github.com/alice?tab=stars&type=source",
    "https://github.com/stars/alice/lists/frontend-picks?sort=updated",
  ]) {
    const ctx = paginatedContext([batch([starred(1)])]);
    const result = await getStars(ctx, { url: requested });
    assert.equal(result.ok, true);
    assert.equal(result.complete, true);
    assert.equal(result.requestedUrl, requested);
    assert.equal(result.pagesRead, 1);
    assert.deepEqual(ctx.navigations, [["open", requested]]);
  }
});

test("getListRepositories validates its required List detail route before navigation", async () => {
  const ctx = { async openOrReuseTab() { assert.fail("invalid List URL must not navigate"); } };
  for (const url of [
    undefined,
    null,
    "",
    "https://example.com/stars/alice/lists/frontend-picks",
    "https://user@github.com/stars/alice/lists/frontend-picks",
    "https://github.com/alice?tab=stars",
    "https://github.com/owner/repository",
  ]) {
    await assert.rejects(getListRepositories(ctx, { url }), /url must be a GitHub List detail URL/);
  }
  await assert.rejects(
    getListRepositories(ctx, { url: "https://github.com/stars/alice/lists/frontend-picks", maxItems: 0 }),
    /maxItems must be a positive safe integer/,
  );
});

test("getListRepositories deduplicates pages and preserves items after a later failure", async () => {
  const listUrl = "https://github.com/stars/alice/lists/frontend-picks";
  const nextUrl = listUrl + "?after=OPAQUE";
  const failure = { ok: false, reason: "login_required", url: "https://github.com/login" };
  const ctx = paginatedContext([batch([starred(1), starred(1)], nextUrl), failure]);
  const result = await getListRepositories(ctx, { url: listUrl });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "login_required");
  assert.equal(result.requestedUrl, listUrl);
  assert.equal(result.complete, false);
  assert.equal(result.truncated, true);
  assert.equal(result.pagesRead, 1);
  assert.deepEqual(result.items, [starred(1)]);
  assert.equal(result.nextUrl, nextUrl);
});

test("getListRepositories reports a successfully read empty List as complete", async () => {
  const listUrl = "https://github.com/stars/alice/lists/empty-list";
  const ctx = paginatedContext([batch([])]);
  const result = await getListRepositories(ctx, { url: listUrl });
  assert.equal(result.ok, true);
  assert.equal(result.complete, true);
  assert.equal(result.pagesRead, 1);
  assert.deepEqual(result.items, []);
  assert.equal(result.stopReason, "end");
});

test("getStars recognizes an overview even when its user path ends in topics", async () => {
  const overview = { ...batch([starred(999), { type: "topic", url: "https://github.com/topics/example" }]),
    filters: [{ text: "All repositories", url: "https://github.com/stars/topics/repositories?filter=all" }] };
  const ctx = paginatedContext([overview, batch([starred(1)])]);
  const requested = "https://github.com/stars/topics?q=tool&language=javascript&sort=updated&direction=asc";
  const result = await getStars(ctx, { url: requested });
  assert.deepEqual(result.items, [starred(1)]);
  assert.equal(result.requestedUrl, requested);
  assert.equal(result.scope, "all_pages");
  assert.equal(result.complete, true);
  assert.equal(result.pagesRead, 1);
  assert.equal(result.stopReason, "end");
  assert.equal(ctx.navigations.length, 2);
  const target = new URL(ctx.navigations[1][1]);
  assert.equal(target.pathname, "/stars/topics/repositories");
  assert.equal(target.searchParams.get("filter"), "all");
  for (const [key, value] of new URL(requested).searchParams) assert.equal(target.searchParams.get(key), value);
});

test("getStars collects beyond 100 items, deduplicates and reuses the tab to the end", async () => {
  const pages = Array.from({ length: 5 }, (_, page) => {
    const items = Array.from({ length: 30 }, (_, i) => starred(page * 30 + i));
    if (page) items.unshift(starred(page * 30 - 1));
    return batch(items, page < 4 ? `${starsUrl}&page=${page + 2}` : "");
  });
  const ctx = paginatedContext(pages);
  const result = await getStars(ctx, { url: starsUrl });
  assert.deepEqual(result.items, Array.from({ length: 150 }, (_, i) => starred(i)));
  assert.equal(result.itemCount, 150);
  assert.equal(result.totalLoaded, 150);
  assert.equal(result.pagesRead, 5);
  assert.equal(result.complete, true);
  assert.equal(result.truncated, false);
  assert.equal(result.nextUrl, "");
  assert.equal(ctx.navigations.filter(([kind]) => kind === "open").length, 1);
  assert.equal(ctx.navigations.filter(([kind]) => kind === "navigate").length, 4);
});

test("getStars keeps partial items and the failed Stars URL after a later login block", async () => {
  const nextUrl = `${starsUrl}&page=2`;
  const failure = { ok: false, reason: "login_required", url: "https://github.com/login" };
  const ctx = paginatedContext([batch([starred(1)], nextUrl), failure]);
  const result = await getStars(ctx, { url: starsUrl });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "login_required");
  assert.equal(result.complete, false);
  assert.equal(result.truncated, true);
  assert.equal(result.pagesRead, 1);
  assert.equal(result.itemCount, 1);
  assert.deepEqual(result.items, [starred(1)]);
  assert.equal(result.nextUrl, nextUrl);
});

test("getStars caps unique items mid-page without skipping the rest of that page", async () => {
  const nextUrl = `${starsUrl}&page=2`;
  const ctx = paginatedContext([batch([starred(1), starred(2)], nextUrl), batch([starred(2), starred(3), starred(4)], `${starsUrl}&page=3`)]);
  const result = await getStars(ctx, { url: starsUrl, maxItems: 3 });
  assert.deepEqual(result.items, [starred(1), starred(2), starred(3)]);
  assert.equal(result.totalLoaded, 4);
  assert.equal(result.complete, false);
  assert.equal(result.truncated, true);
  assert.equal(result.stopReason, "max_items");
  assert.equal(result.nextUrl, nextUrl);
});

test("getStars distinguishes a limit at a page boundary from an exact collection size", async () => {
  const nextUrl = `${starsUrl}&page=2`;
  const limited = await getStars(paginatedContext([batch([starred(1), starred(2)], nextUrl)]), { url: starsUrl, maxItems: 2 });
  assert.equal(limited.complete, false);
  assert.equal(limited.nextUrl, nextUrl);
  const complete = await getStars(paginatedContext([batch([starred(1), starred(2)])]), { url: starsUrl, maxItems: 2 });
  assert.equal(complete.complete, true);
  assert.equal(complete.stopReason, "end");
});

test("getStars preserves explicit topic pages, starting pages and successful empty results", async () => {
  const topicUrl = "https://github.com/stars/example/topics?filter=topics&page=2";
  const ctx = paginatedContext([batch([])]);
  const result = await getStars(ctx, { url: topicUrl });
  assert.equal(result.complete, true);
  assert.equal(result.itemCount, 0);
  assert.equal(result.pagesRead, 1);
  assert.deepEqual(ctx.navigations, [["open", topicUrl]]);
});

test("getStars cannot claim completeness when the overview has no full repository link", async () => {
  const result = await getStars(paginatedContext([batch([starred(1)])]));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "repository_list_not_found");
  assert.equal(result.complete, false);
  assert.equal(result.pagesRead, 0);
  assert.deepEqual(result.items, []);
});

test("getStars rejects invalid item limits before navigation", async () => {
  const ctx = { async openOrReuseTab() { assert.fail("invalid limit must not navigate"); } };
  for (const maxItems of [0, -1, 1.5, "2", null, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(getStars(ctx, { maxItems }), /maxItems must be a positive safe integer/);
  }
});

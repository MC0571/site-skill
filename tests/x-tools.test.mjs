import test from "node:test";
import assert from "node:assert/strict";
import { getHistory } from "../skills/site-skill/assets/learnings/x-com/tools/get-history.js";
import { getPostReplies } from "../skills/site-skill/assets/learnings/x-com/tools/get-post-replies.js";
import { getThread } from "../skills/site-skill/assets/learnings/x-com/tools/get-thread.js";
import { getUserConnections } from "../skills/site-skill/assets/learnings/x-com/tools/get-user-connections.js";
import { getUserPosts } from "../skills/site-skill/assets/learnings/x-com/tools/get-user-posts.js";
import { getUserReplies } from "../skills/site-skill/assets/learnings/x-com/tools/get-user-replies.js";
import { searchPosts } from "../skills/site-skill/assets/learnings/x-com/tools/search-posts.js";
import { getTimelinePosts } from "../skills/site-skill/assets/learnings/x-com/tools/timeline.js";

const postUrl = "https://x.com/alice/status/100";
const post = (id, handle = "@alice") => ({ id: String(id), handle, text: `post ${id}` });

function ctxFor(batches) {
  let batch = 0;
  const ctx = {
    scrolls: 0,
    calls: [],
    async openOrReuseTab() {},
    async waitForLoad() {},
    async wait() {},
    async waitForElement() {},
    async scroll() { ctx.scrolls += 1; },
    async js() {
      return {
        url: postUrl,
        title: "X",
        tweetCount: 1,
        articleCount: 1,
        y: ctx.scrolls * 1800,
        h: 10000,
      };
    },
    async runSiteBrowserTool(site, tool, args) {
      assert.equal(site, "x-com");
      assert.ok(batch < batches.length, `unexpected extraction: ${tool}`);
      ctx.calls.push({ tool, args });
      return batches[batch++];
    },
  };
  return ctx;
}

const paginationTools = [
  { fn: getTimelinePosts, args: { maxPosts: 2 }, arrayKey: "items" },
  { fn: searchPosts, args: { query: "test", maxItems: 2 }, arrayKey: "items" },
  { fn: getThread, args: { url: postUrl, maxPosts: 2 }, arrayKey: "posts" },
  { fn: getHistory, args: { maxItems: 2 }, arrayKey: "items" },
  { fn: getPostReplies, args: { url: postUrl, maxItems: 2 }, arrayKey: "replies" },
  { fn: getUserPosts, args: { username: "alice", maxItems: 2 }, arrayKey: "items" },
  { fn: getUserReplies, args: { username: "alice", maxItems: 2 }, arrayKey: "items" },
  { fn: getUserConnections, args: { username: "alice", maxItems: 2 }, arrayKey: "users" },
];

for (const { fn, args, arrayKey } of paginationTools) {
  test(`${fn.name} keeps maxScrolls: 0 without scrolling`, async () => {
    const first = { ok: true, author: { handle: "@alice" }, [arrayKey]: [post(100)] };
    const ctx = ctxFor([first, { ...first, [arrayKey]: [post(101)] }]);
    const result = await fn(ctx, { ...args, maxScrolls: 0 });

    assert.equal(ctx.scrolls, 0);
    assert.equal(ctx.calls.length, 1);
    const items = Array.isArray(result) ? result : result[arrayKey];
    assert.deepEqual(items.map((item) => item.id), ["100"]);
  });

  if (fn === getTimelinePosts) continue;
  for (const failedPage of [0, 1]) {
    test(`${fn.name} preserves ok:false from page ${failedPage + 1}`, async () => {
      const first = { ok: true, author: { handle: "@alice" }, [arrayKey]: [post(100)] };
      const failure = {
        ok: false,
        reason: fn === getThread ? "thread_not_found" : "login_required",
        url: "https://x.com/i/flow/login",
        message: "page extraction failed",
      };
      const ctx = ctxFor(failedPage === 0 ? [failure] : [first, failure]);
      const result = await fn(ctx, { ...args, maxScrolls: 3 });

      assert.equal(result.ok, false);
      assert.equal(result.reason, failure.reason);
      assert.equal(result.message, failure.message);
      assert.equal(result.url, failure.url);
      assert.equal(ctx.scrolls, failedPage);
      assert.equal(ctx.calls.length, failedPage + 1);
    });
  }
}

test("getThread keeps the first author after the DOM author changes", async () => {
  const first = {
    ok: true,
    author: { handle: "@Alice" },
    declaredParts: { part: 1, total: 4 },
    posts: [post(100), post(101)],
    isThread: true,
  };
  const ctx = ctxFor([
    first,
    { ok: true, author: { handle: "@bob" }, posts: [post(102, "@bob")] },
    { ok: true, author: { handle: "@ALICE" }, posts: [post(103, "@ALICE"), post(104)] },
  ]);
  const result = await getThread(ctx, { url: postUrl, maxPosts: 4, maxScrolls: 2 });

  assert.deepEqual(result.posts.map((item) => item.id), ["100", "101", "103", "104"]);
  assert.deepEqual(result.author, first.author);
  assert.equal(result.postCount, 4);
  assert.equal(result.totalLoaded, 4);
  assert.equal(result.scrollRounds, 2);
  assert.equal(ctx.scrolls, 2);
});

test("getThread recomputes isThread after pagination", async () => {
  const ctx = ctxFor([
    { ok: true, author: { handle: "@alice" }, posts: [post(100)], isThread: false },
    { ok: true, author: { handle: "@alice" }, posts: [post(101)], isThread: false },
  ]);
  const result = await getThread(ctx, { url: postUrl, maxPosts: 2, maxScrolls: 1 });

  assert.equal(result.postCount, 2);
  assert.equal(result.isThread, true);
});

test("getThread recomputes isThread after truncation", async () => {
  const ctx = ctxFor([
    { ok: true, author: { handle: "@alice" }, posts: [post(100), post(101)], isThread: true },
  ]);
  const result = await getThread(ctx, { url: postUrl, maxPosts: 1, maxScrolls: 0 });

  assert.equal(result.postCount, 1);
  assert.equal(result.totalLoaded, 2);
  assert.equal(result.isThread, false);
});

for (const fn of [getUserPosts, getUserReplies]) {
  test(`${fn.name} filters authors before counting and truncating`, async () => {
    const first = Array.from({ length: 20 }, (_, i) => post(100 + i, i < 10 ? "@alice" : "@bob"));
    const contextBefore = { id: "99", handle: "@bob", text: "parent" };
    first[0].contextBefore = contextBefore;
    const next = [...first.slice(0, 5), ...Array.from({ length: 15 }, (_, i) => post(200 + i, "@ALICE"))];
    const ctx = ctxFor([{ ok: true, items: first }, { ok: true, items: next }]);
    const result = await fn(ctx, { username: "@ALIce", maxItems: 20, maxScrolls: 1 });

    const expectedIds = [...Array.from({ length: 10 }, (_, i) => String(100 + i)),
      ...Array.from({ length: 10 }, (_, i) => String(200 + i))];
    assert.deepEqual(result.items.map((item) => item.id), expectedIds);
    assert.ok(result.items.every((item) => item.handle.toLowerCase() === "@alice"));
    assert.equal(result.itemCount, 20);
    assert.equal(result.totalLoaded, 25);
    assert.equal(result.scrollRounds, 1);
    assert.equal(ctx.scrolls, 1);
    assert.equal(ctx.calls.length, 2);
    if (fn === getUserReplies) {
      assert.deepEqual(result.items[0].replyContext, contextBefore);
      assert.equal(result.items[1].replyContext, null);
    }
  });
}

for (const failedPage of [0, 1]) {
  test(`getTimelinePosts throws login_required from page ${failedPage + 1}`, async () => {
    const first = { ok: true, items: [post(100)] };
    const failure = { ok: false, reason: "login_required", url: "https://x.com/i/flow/login" };
    const ctx = ctxFor(failedPage === 0 ? [failure] : [first, failure]);

    await assert.rejects(() => getTimelinePosts(ctx, { maxPosts: 2, maxScrolls: 3 }), (error) => {
      assert.equal(error.message, "login_required");
      assert.equal(error.cause, failure);
      return true;
    });
    assert.equal(ctx.scrolls, failedPage);
    assert.equal(ctx.calls.length, failedPage + 1);
  });
}

for (const fn of [getUserPosts, getUserReplies]) {
  test(`${fn.name} continues across new posts by other authors`, async () => {
    const ctx = ctxFor([
      { ok: true, items: [post(100)] },
      { ok: true, items: [post(200, "@bob")] },
      { ok: true, items: [post(300, "@bob")] },
      { ok: true, items: [post(400)] },
    ]);
    const result = await fn(ctx, { username: "alice", maxItems: 2, maxScrolls: 4 });
    assert.deepEqual(result.items.map(item => item.id), ["100", "400"]);
    assert.equal(ctx.scrolls, 3);
  });
}

test("author-filtered pagination still stops when the source repeats", async () => {
  const otherPost = post(200, "@bob");
  const ctx = ctxFor([
    { ok: true, items: [post(100)] },
    { ok: true, items: [otherPost] },
    { ok: true, items: [otherPost] },
    { ok: true, items: [otherPost] },
  ]);
  const result = await getUserPosts(ctx, { username: "alice", maxItems: 2, maxScrolls: 5 });
  assert.deepEqual(result.items.map(item => item.id), ["100"]);
  assert.equal(ctx.scrolls, 3);
});

test("getTimelinePosts returns arrays for populated and empty successful results", async () => {
  const items = [post(100), post(101, "@bob"), post(102)];
  const ctx = ctxFor([{ ok: true, items }]);
  assert.deepEqual(await getTimelinePosts(ctx, { maxPosts: 2, maxScrolls: 0 }), items.slice(0, 2));

  const emptyCtx = ctxFor([{ ok: true, items: [] }]);
  assert.deepEqual(await getTimelinePosts(emptyCtx, { maxPosts: 2, maxScrolls: 0 }), []);
});

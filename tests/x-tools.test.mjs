import test from "node:test";
import assert from "node:assert/strict";
import { getHistory } from "../skills/site-skill/assets/learnings/x-com/tools/get-history.js";
import { getPostReplies } from "../skills/site-skill/assets/learnings/x-com/tools/get-post-replies.js";
import { getThread } from "../skills/site-skill/assets/learnings/x-com/tools/get-thread.js";
import { getUserConnections } from "../skills/site-skill/assets/learnings/x-com/tools/get-user-connections.js";
import { extractProfilePostsReport, getUserPosts } from "../skills/site-skill/assets/learnings/x-com/tools/get-user-posts.js";
import { getUserReplies } from "../skills/site-skill/assets/learnings/x-com/tools/get-user-replies.js";
import { searchPosts } from "../skills/site-skill/assets/learnings/x-com/tools/search-posts.js";
import { getTimelinePosts } from "../skills/site-skill/assets/learnings/x-com/tools/timeline.js";

const postUrl = "https://x.com/alice/status/100";
const post = (id, handle = "@alice") => ({
  id: String(id), handle, text: `post ${id}`, url: `https://x.com/${handle.slice(1)}/status/${id}`,
  displayName: handle.slice(1), timeText: "17小时", metrics: { like: "1,317", view: "41万" }, images: [], videos: [],
});

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
    async js(script) {
      if (script.includes('let clicked = 0')) return 0;
      return {
        url: postUrl,
        title: "X",
        tweetCount: 1,
        articleCount: 1,
        ready: true,
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
  const readState = ctx.js;
  ctx.js = async (script) => ({ ...await readState(script), y: Math.min(ctx.scrolls, 2) * 1800 });
  const result = await getUserPosts(ctx, { username: "alice", maxItems: 2, maxScrolls: 5 });
  assert.deepEqual(result.items.map(item => item.id), ["100"]);
  assert.equal(ctx.scrolls, 3);
});

test("profile collection keeps scrolling through a tall expanded post until a new card appears", async () => {
  const repeated = { ok: true, items: [post(100)] };
  const ctx = ctxFor([repeated, repeated, repeated, repeated, repeated, { ok: true, items: [post(101)] }]);
  const result = await getUserPosts(ctx, { username: "alice", maxItems: 2, maxScrolls: 6 });

  assert.deepEqual(result.items.map(item => item.id), ["100", "101"]);
  assert.equal(result.scrollRounds, 5);
  assert.equal(result.stopReason, "max_items");
});

test("getTimelinePosts returns arrays for populated and empty successful results", async () => {
  const items = [post(100), post(101, "@bob"), post(102)];
  const ctx = ctxFor([{ ok: true, items }]);
  assert.deepEqual(await getTimelinePosts(ctx, { maxPosts: 2, maxScrolls: 0 }), items.slice(0, 2));

  const emptyCtx = ctxFor([{ ok: true, items: [] }]);
  assert.deepEqual(await getTimelinePosts(emptyCtx, { maxPosts: 2, maxScrolls: 0 }), []);
});

test("profile collection can reach 50 posts beyond the former 20-scroll cap", async () => {
  const batches = Array.from({ length: 42 }, (_, i) => ({
    ok: true, items: i === 41 ? Array.from({ length: 9 }, (_, j) => post(200 + j)) : [post(100 + i)],
  }));
  const ctx = ctxFor(batches);
  const distances = [];
  ctx.scroll = async ({ dy }) => { ctx.scrolls += 1; distances.push(dy); };
  const result = await getUserPosts(ctx, { username: "alice", maxItems: 50 });

  assert.equal(result.itemCount, 50);
  assert.equal(result.scrollRounds, 41);
  assert.equal(result.stopReason, "max_items");
  assert.ok(distances.every(distance => distance === 650));
});

test("profile report preserves displayed thread order, reposts, missing counts and source fields", async () => {
  const root = { ...post(100), text: "First paragraph\n\n- Second line", isPinned: true };
  const reply = { ...post(102), isTruncated: true };
  const repost = { ...post(99, "@bob"), images: [{ url: "https://example.com/image.jpg" }], videos: [{ url: "", poster: "https://example.com/poster.jpg" }] };
  const ad = { ...post(103, "@sponsor"), isPromoted: true };
  const ctx = ctxFor([{ ok: true, items: [root, ad, reply] }, { ok: true, items: [reply, repost] }]);
  const result = await extractProfilePostsReport(ctx, { username: "alice", maxItems: 3 });

  assert.equal(result.ok, true);
  assert.equal(result.posts_recorded, 3);
  assert.equal(result.goal_reached, true);
  assert.deepEqual(result.rows.map(row => row.post_id), ["100", "102", "99"]);
  assert.equal(result.rows[0].post_text, root.text);
  assert.equal(result.rows[0].view_count, "41万");
  assert.equal(result.rows[0].like_count, "1,317");
  assert.equal(result.rows[0].quote_count, "not displayed");
  assert.equal(result.rows[0].bookmark_count, "not displayed");
  assert.equal(result.rows[0].date_time_displayed, "17小时");
  assert.equal(result.rows[1].needs_review, true);
  assert.equal(result.rows[2].image_urls, repost.images[0].url);
  assert.equal(result.rows[2].video_poster_urls, repost.videos[0].poster);
  assert.ok(result.rows.every(row => row.source_url === "https://x.com/alice" && row.access_status === "ok" && !Number.isNaN(Date.parse(row.checked_at))));
});

test("a late profile block preserves already recorded rows with an honest run status", async () => {
  const ctx = ctxFor([{ ok: true, items: [post(100)] }, { ok: false, reason: "rate_limited", url: "https://x.com/alice" }]);
  const result = await extractProfilePostsReport(ctx, { username: "alice", maxItems: 2 });

  assert.equal(result.ok, false);
  assert.equal(result.access_status, "rate_limited");
  assert.equal(result.stop_reason, "blocked");
  assert.equal(result.goal_reached, false);
  assert.equal(result.posts_recorded, 1);
  assert.equal(result.rows[0].post_id, "100");
  assert.equal(result.rows[0].access_status, "ok");
});

test("a profile report marks a scroll budget as incomplete rather than claiming the feed ended", async () => {
  const result = await extractProfilePostsReport(ctxFor([{ ok: true, items: [post(100)] }]), { username: "alice", maxItems: 50, maxScrolls: 0 });
  assert.equal(result.posts_recorded, 1);
  assert.equal(result.goal_reached, false);
  assert.equal(result.stop_reason, "scroll_limit");
});

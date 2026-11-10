import { boundedInteger } from "./_pagination.js";

export async function getThread(ctx, args = {}) {
  const url = String(args.url || "").trim();
  if (!url) throw new Error("url is required");
  if (!/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/]+\/status\/\d+/i.test(url)) {
    throw new Error("url must be an X post URL like https://x.com/<user>/status/<id>");
  }
  const maxPosts = Math.max(1, Math.min(Number(args.maxPosts) || 50, 100));

  await ctx.openOrReuseTab(url, { wait: true });
  await ctx.waitForLoad();
  await ctx.wait(1.5);

  const state = await ctx.js(`(() => ({
    url: location.href,
    title: document.title,
    tweetCount: document.querySelectorAll('article[data-testid="tweet"]').length,
    articleCount: document.querySelectorAll('article').length
  }))()`);

  if (/\/i\/(?:jf\/onboarding|flow\/login)|\/login/.test(state.url)) {
    return {
      ok: false,
      reason: "login_required",
      requestedUrl: url,
      url: state.url,
      message: "当前浏览器 Profile 未登录 X；请切换到已登录的 Profile，或在 ego lite 中手动登录后重试。",
    };
  }

  if (state.tweetCount === 0 && state.articleCount === 0) {
    try {
      await ctx.waitForElement('article[data-testid="tweet"], article', { timeout: 15, visible: true });
    } catch {
      // let the browser tool classify the page
    }
  }

  const maxScrolls = boundedInteger(args.maxScrolls, 5, 20, 0);
  const first = await ctx.runSiteBrowserTool("x-com", "extract_thread", { maxPosts: 100 });
  if (first.ok === false) return { ...first, requestedUrl: url };
  const authorHandle = first.author.handle.toLowerCase();
  const seen = new Map();
  for (const post of first.posts || []) {
    if (post.id) seen.set(post.id, post);
  }
  let rounds = 0;
  const target = first.declaredParts?.total || maxPosts;

  while (seen.size < target && rounds < maxScrolls) {
    const before = await ctx.js(`(() => ({ y: window.scrollY, h: document.body.scrollHeight }))()`);
    await ctx.scroll({ dx: 0, dy: 1800 });
    await ctx.wait(1.2);
    const next = await ctx.runSiteBrowserTool("x-com", "extract_thread", { maxPosts: 100 });
    if (next.ok === false) return { ...next, requestedUrl: url };
    const previousSize = seen.size;
    for (const post of next.posts || []) {
      if (post.id && post.handle.toLowerCase() === authorHandle && !seen.has(post.id)) {
        seen.set(post.id, post);
      }
    }
    rounds += 1;
    if (seen.size === previousSize) {
      const after = await ctx.js(`(() => ({ y: window.scrollY, h: document.body.scrollHeight }))()`);
      if (after.y === before.y && after.h === before.h) break;
      if (rounds >= 2) break;
    }
  }

  const posts = [...seen.values()]
    .sort((a, b) => {
      if (a.publishedAt && b.publishedAt && a.publishedAt !== b.publishedAt) {
        return Date.parse(a.publishedAt) - Date.parse(b.publishedAt);
      }
      try {
        return BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0;
      } catch {
        return 0;
      }
    })
    .slice(0, maxPosts);

  return {
    ...first,
    posts,
    postCount: posts.length,
    isThread: posts.length > 1,
    totalLoaded: seen.size,
    scrollRounds: rounds,
    requestedUrl: url,
  };
}

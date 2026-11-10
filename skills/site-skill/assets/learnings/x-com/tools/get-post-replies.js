import { collectMore } from "./_pagination.js";

export async function getPostReplies(ctx, args = {}) {
  const url = String(args.url || "").trim();
  if (!url) throw new Error("url is required");
  if (!/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/]+\/status\/\d+/i.test(url)) {
    throw new Error("url must be an X post URL like https://x.com/<user>/status/<id>");
  }
  const maxItems = Math.max(1, Math.min(Number(args.maxItems) || 50, 100));

  await ctx.openOrReuseTab(url, { wait: true });
  await ctx.waitForLoad();
  await ctx.wait(1.8);

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

  const result = await collectMore(ctx, {
    browserTool: "extract_replies",
    arrayKey: "replies",
    maxItems,
    maxScrolls: args.maxScrolls,
  });
  return { ...result, requestedUrl: url };
}

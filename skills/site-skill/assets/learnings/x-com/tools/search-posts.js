import { boundedInteger, collectMore } from "./_pagination.js";

export async function searchPosts(ctx, args = {}) {
  const query = String(args.query || "").trim();
  if (!query) throw new Error("query is required");

  const mode = args.mode === "latest" ? "latest" : "top";
  const maxItems = boundedInteger(args.maxItems, 20, 100);
  const params = new URLSearchParams({ q: query, src: "typed_query" });
  if (mode === "latest") params.set("f", "live");
  const url = `https://x.com/search?${params.toString()}`;

  await ctx.openOrReuseTab(url, { wait: true });
  await ctx.waitForLoad();
  await ctx.wait(1.0);

  const state = await ctx.js(`(() => ({
    url: location.href,
    title: document.title,
    hasPrimaryColumn: Boolean(document.querySelector('[data-testid="primaryColumn"]')),
    tweetCount: document.querySelectorAll('article[data-testid="tweet"]').length,
    bodyText: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 500)
  }))()`);

  if (/\/i\/(?:jf\/onboarding|flow\/login)|\/login/.test(state.url)) {
    return {
      ok: false,
      reason: "login_required",
      mode,
      query,
      requestedUrl: url,
      url: state.url,
      message: "当前浏览器 Profile 未登录 X；请切换到已登录的 Profile，或在 ego lite 中手动登录后重试。",
    };
  }

  if (state.tweetCount === 0) {
    try {
      await ctx.waitForElement('article[data-testid="tweet"]', { timeout: 15, visible: true });
    } catch {
      // may be a genuine empty result; let the browser tool classify it
    }
  }

  const result = await collectMore(ctx, {
    browserTool: "extract_search_results",
    arrayKey: "items",
    maxItems,
    maxScrolls: args.maxScrolls,
  });
  return {
    ...result,
    mode,
    query,
    requestedUrl: url,
  };
}

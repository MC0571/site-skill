export async function getTrends(ctx, args = {}) {
  const maxItems = Math.max(1, Math.min(Number(args.maxItems) || 20, 50));

  await ctx.openOrReuseTab("https://x.com/explore", { wait: true });
  await ctx.waitForLoad();
  await ctx.wait(1.5);

  const state = await ctx.js(`(() => ({
    url: location.href,
    title: document.title,
    trendCount: document.querySelectorAll('[data-testid="trend"]').length,
    bodyText: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 500)
  }))()`);

  if (/\/i\/(?:jf\/onboarding|flow\/login)|\/login/.test(state.url)) {
    return {
      ok: false,
      reason: "login_required",
      requestedUrl: "https://x.com/explore",
      url: state.url,
      message: "当前浏览器 Profile 未登录 X；请切换到已登录的 Profile，或在 ego lite 中手动登录后重试。",
    };
  }

  if (state.trendCount === 0) {
    try {
      await ctx.waitForElement('[data-testid="trend"]', { timeout: 15, visible: true });
    } catch {
      // let the browser tool classify empty/login states
    }
  }

  const result = await ctx.runSiteBrowserTool("x-com", "extract_trends", { maxItems });
  return {
    ...result,
    requestedUrl: "https://x.com/explore",
    maxItems,
  };
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];
}

export async function getUserProfile(ctx, args = {}) {
  const username = normalizeUsername(args.username);
  if (!username) throw new Error("username is required");

  const url = `https://x.com/${encodeURIComponent(username)}`;
  await ctx.openOrReuseTab(url, { wait: true });
  await ctx.waitForLoad();
  await ctx.wait(2.0);

  const state = await ctx.js(`(() => ({ url: location.href, title: document.title }))()`);
  if (/\/i\/(?:jf\/onboarding|flow\/login)|\/login/.test(state.url)) {
    return {
      ok: false,
      reason: "login_required",
      username,
      requestedUrl: url,
      url: state.url,
      message: "当前浏览器 Profile 未登录 X；请切换到已登录的 Profile，或在 ego lite 中手动登录后重试。",
    };
  }

  const result = await ctx.runSiteBrowserTool("x-com", "extract_profile", {});
  return { ...result, requestedUrl: url, username };
}

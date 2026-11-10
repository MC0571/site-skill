import { collectMore } from "./_pagination.js";

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];
}

export async function getUserPosts(ctx, args = {}) {
  const username = normalizeUsername(args.username);
  if (!username) throw new Error("username is required");
  const maxItems = Math.max(1, Math.min(Number(args.maxItems) || 50, 100));

  const url = `https://x.com/${encodeURIComponent(username)}`;
  await ctx.openOrReuseTab(url, { wait: true });
  await ctx.waitForLoad();
  await ctx.wait(1.8);

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

  const result = await collectMore(ctx, {
    browserTool: "extract_timeline",
    arrayKey: "items",
    maxItems: Math.min(100, Math.max(maxItems, 20)),
    maxScrolls: Math.max(0, Math.min(Number(args.maxScrolls) || 5, 20)),
  });
  const target = `@${username}`.toLowerCase();
  const items = (result.items || []).filter((item) => (item.handle || "").toLowerCase() === target).slice(0, maxItems);

  return {
    ...result,
    username,
    itemCount: items.length,
    totalVisible: (result.items || []).length,
    items,
    requestedUrl: url,
  };
}

import { collectMore } from "./_pagination.js";

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];
}

export async function getUserConnections(ctx, args = {}) {
  const username = normalizeUsername(args.username);
  if (!username) throw new Error("username is required");

  const kind = ["followers", "verified_followers", "following", "you_know"].includes(args.kind)
    ? args.kind
    : "followers";
  const maxItems = Math.max(1, Math.min(Number(args.maxItems) || 50, 100));
  const path =
    kind === "following" ? "following" :
    kind === "verified_followers" ? "verified_followers" :
    kind === "you_know" ? "followers_you_follow" :
    "followers";
  const url = `https://x.com/${encodeURIComponent(username)}/${path}`;

  await ctx.openOrReuseTab(url, { wait: true });
  await ctx.waitForLoad();
  await ctx.wait(2.0);

  const state = await ctx.js(`(() => ({ url: location.href, title: document.title }))()`);
  if (/\/i\/(?:jf\/onboarding|flow\/login)|\/login/.test(state.url)) {
    return {
      ok: false,
      reason: "login_required",
      username,
      kind,
      requestedUrl: url,
      url: state.url,
      message: "当前浏览器 Profile 未登录 X；请切换到已登录的 Profile，或在 ego lite 中手动登录后重试。",
    };
  }

  const result = await collectMore(ctx, {
    browserTool: "extract_user_cells",
    arrayKey: "users",
    maxItems,
    maxScrolls: args.maxScrolls,
    keyOf: (item) => item.profileUrl || item.handle,
  });
  return { ...result, username, kind, requestedUrl: url };
}

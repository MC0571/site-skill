import { collectMore } from "./_pagination.js";

export async function getHistory(ctx, args = {}) {
  const kind = args.kind === "likes" ? "likes" : "bookmarks";
  const folderId = String(args.folderId || "").trim();
  const maxItems = Math.max(1, Math.min(Number(args.maxItems) || 50, 100));

  let url = "https://x.com/i/history";
  if (kind === "likes") url = "https://x.com/i/history/likes";
  else if (folderId) url = `https://x.com/i/history/bookmarks/${encodeURIComponent(folderId)}`;

  await ctx.openOrReuseTab(url, { wait: true });
  await ctx.waitForLoad();
  await ctx.wait(1.2);

  const state = await ctx.js(`(() => ({ url: location.href, title: document.title }))()`);
  if (/\/i\/(?:jf\/onboarding|flow\/login)|\/login/.test(state.url)) {
    return {
      ok: false,
      reason: "login_required",
      kind,
      folderId,
      requestedUrl: url,
      url: state.url,
      message: "当前浏览器 Profile 未登录 X；请切换到已登录的 Profile，或在 ego lite 中手动登录后重试。",
    };
  }

  const result = await collectMore(ctx, {
    browserTool: "extract_timeline",
    arrayKey: "items",
    maxItems,
    maxScrolls: args.maxScrolls,
  });
  return {
    ...result,
    kind,
    folderId,
    requestedUrl: url,
    folderUnavailable: kind === "bookmarks" && Boolean(folderId) && !state.url.includes("/bookmarks/"),
  };
}

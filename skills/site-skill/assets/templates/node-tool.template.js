export async function openAndExtract(ctx, args = {}) {
  const url = String(args.url || "").trim();
  if (!url) throw new Error("url is required");

  await ctx.openOrReuseTab(url, { wait: true });
  await ctx.waitForLoad();

  return ctx.runSiteBrowserTool("__SITE_ID__", "extract_page", {});
}

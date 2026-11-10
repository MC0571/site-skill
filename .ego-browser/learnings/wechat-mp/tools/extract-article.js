export async function extractArticle(ctx, args = {}) {
  const url = typeof args.url === "string" ? args.url.trim() : "";
  if (!url) throw new Error("url is required");

  const isArticleUrl = /^https?:\/\/mp\.weixin\.qq\.com\//i.test(url);
  if (!isArticleUrl) {
    throw new Error("url must be a mp.weixin.qq.com article URL");
  }

  await ctx.openOrReuseTab(url, { wait: true });
  await ctx.waitForLoad();
  await ctx.wait(2.0);

  const article = await ctx.runSiteBrowserTool("wechat-mp", "extract_article", {});
  return {
    ...article,
    requestedUrl: url,
  };
}

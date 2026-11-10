export async function getArticle(ctx, args = {}) {
  const url = String(args.url || "").trim();
  if (!url) throw new Error("url is required");
  if (!/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i.test(url)) {
    throw new Error("url must be an x.com or twitter.com URL");
  }

  await ctx.openOrReuseTab(url, { wait: true });
  await ctx.waitForLoad();
  await ctx.wait(1.2);

  let state = await ctx.js(`(() => ({
    url: location.href,
    title: document.title,
    hasArticle: Boolean(document.querySelector('article[data-testid="twitterArticleReadView"]')),
    hasGuestArticle: Boolean(document.querySelector('[data-article-part="body"]')),
    articleLink: [...document.querySelectorAll('a[href*="/article/"]')]
      .map(a => a.href)
      .find(h => !/\\/media\\//.test(h) && /\\/article\\/\\d+/.test(h)) || ''
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

  if (!state.hasArticle && !state.hasGuestArticle && state.articleLink) {
    await ctx.openOrReuseTab(state.articleLink, { wait: true });
    await ctx.waitForLoad();
    await ctx.wait(1.2);
    state = await ctx.js(`(() => ({
      url: location.href,
      title: document.title,
      hasArticle: Boolean(document.querySelector('article[data-testid="twitterArticleReadView"]'))
    }))()`);
  }

  if (!state.hasArticle && !state.hasGuestArticle) {
    try {
      await ctx.waitForElement('article[data-testid="twitterArticleReadView"], [data-article-part="body"]', { timeout: 15, visible: true });
    } catch {
      // let the browser tool classify the page
    }
  }

  const result = await ctx.runSiteBrowserTool("x-com", "extract_article", {});
  return {
    ...result,
    requestedUrl: url,
  };
}

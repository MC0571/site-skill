export async function prepareProfileTimeline(ctx, { reloadOnTimeout = false } = {}) {
  let state;
  for (let attempt = 0; attempt < (reloadOnTimeout ? 2 : 1); attempt += 1) {
    for (let elapsed = 0; elapsed <= 20; elapsed += 1) {
      state = await ctx.js(String.raw`(() => {
        const visible = (el) => el && el.getClientRects().length > 0 &&
          getComputedStyle(el).visibility !== "hidden";
        const primary = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector("main") || document.body;
        const articles = [...primary.querySelectorAll('article[data-testid="tweet"], article')].filter(visible);
        const empty = [...primary.querySelectorAll('[data-testid="emptyState"]')].some(visible);
        const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alert"], [data-testid="error-detail"]')].filter(visible);
        const messages = dialogs.map((el) => el.innerText).join("\n");
        const pageText = articles.length || empty ? "" : primary.innerText;
        const blockingText = messages + "\n" + pageText;
        let reason = "";
        if (/\/i\/(?:jf\/onboarding|flow\/login)|\/login/.test(location.href) ||
            /sign in to x|log in to x|登录 X|登入 X/i.test(blockingText)) reason = "login_required";
        else if (/captcha|verify you are human|press and hold|robot check|验证码|人机验证/i.test(blockingText) ||
            [...document.querySelectorAll('iframe[src*="captcha"], iframe[src*="arkoselabs"]')].some(visible)) reason = "blocked:captcha";
        else if (/rate limit|too many requests|HTTP 429|请求过于频繁|已达到上限/i.test(blockingText)) reason = "rate_limited";
        else if (dialogs.some((el) => /cookie|consent|agree|接受|同意/i.test(el.innerText)) ||
            /consent|agree to|同意|接受 Cookie/i.test(pageText)) reason = "blocked:consent";
        return { url: location.href, ready: articles.length > 0 || empty, reason };
      })()`);
      if (state.reason) return { ok: false, reason: state.reason, url: state.url };
      if (state.ready || elapsed === 20) break;
      await ctx.wait(1);
    }
    if (state.ready) break;
    if (attempt === 0 && reloadOnTimeout) {
      await ctx.js("location.reload()");
      await ctx.waitForLoad();
    }
  }
  if (!state.ready) return { ok: false, reason: "blocked:content_not_loaded", url: state.url };

  // Showing the original re-renders the card; expand only after that render.
  for (const stage of ["original", "more"]) {
    const clicked = await ctx.js(`(() => {
      const stage = ${JSON.stringify(stage)};
      const primary = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector("main") || document.body;
      let clicked = 0;
      for (const article of primary.querySelectorAll('article[data-testid="tweet"], article')) {
        const controls = stage === "original"
          ? article.querySelectorAll('button[aria-label="显示原文"], button[aria-label="Show original" i]')
          : article.querySelectorAll('[data-testid="tweet-text-show-more-link"], button');
        for (const control of controls) {
          if (!control.getClientRects().length) continue;
          if (control.closest('[data-testid="card.wrapper"], [data-testid="quoteTweet"]')) continue;
          if (stage === "more" && control.getAttribute("data-testid") !== "tweet-text-show-more-link" &&
              !/^(Show more|显示更多)$/i.test((control.innerText || "").trim())) continue;
          control.click();
          clicked += 1;
        }
      }
      return clicked;
    })()`);
    if (clicked > 0) await ctx.wait(0.7);
  }
  return { ok: true, url: state.url };
}

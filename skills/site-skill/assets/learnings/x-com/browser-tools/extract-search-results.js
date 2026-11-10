async function (args) {
  const clean = (value) =>
    (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const maxItems = Math.max(1, Math.min(Number(args.maxItems) || 20, 100));

  const currentUrl = location.href;
  const bodyText = document.body ? document.body.innerText || "" : "";
  const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');

  const loginRedirect =
    /\/i\/jf\/onboarding|\/i\/flow\/login|\/login|\/i\/flow\/signup/.test(currentUrl);
  const loginWall =
    loginRedirect ||
    (!primaryColumn && /sign in|log in|登录|登入|使用手机继续|使用邮箱/i.test(bodyText)) ||
    (tweets.length === 0 && /sign in|log in|登录|登入/i.test(bodyText));

  if (loginWall) {
    let redirectAfterLogin = "";
    try {
      const parsed = new URL(currentUrl);
      redirectAfterLogin = parsed.searchParams.get("redirect_after_login") || "";
    } catch {
      redirectAfterLogin = "";
    }
    return {
      ok: false,
      reason: "login_required",
      url: currentUrl,
      title: clean(document.title),
      redirectAfterLogin,
      message: "当前浏览器 Profile 未登录 X；请切换到已登录的 Profile，或在 ego lite 中手动登录后重试。",
    };
  }

  const items = [...tweets].slice(0, maxItems).map((el) => {
    const userName = el.querySelector('[data-testid="User-Name"]');
    const userLinks = userName
      ? [...userName.querySelectorAll('a[href^="/"]')]
      : [];
    const displayName = clean(userLinks[0]?.innerText || "");
    const handle = clean(
      userLinks.find((a) => clean(a.innerText).startsWith("@"))?.innerText || ""
    );
    const statusLinks = [...el.querySelectorAll('a[href*="/status/"]')]
      .map((a) => a.href)
      .filter((href) => /\/status\/\d+$/.test(href));
    const statusUrl = statusLinks[0] || "";
    const statusId = (statusUrl.match(/\/status\/(\d+)/) || [])[1] || "";
    const metric = (key) => {
      const node = el.querySelector(`[data-testid="${key}"]`);
      if (!node) return "";
      return clean(node.getAttribute("aria-label") || node.innerText || "");
    };
    return {
      id: statusId,
      url: statusUrl,
      displayName,
      handle,
      publishedAt: el.querySelector("time")?.getAttribute("datetime") || "",
      timeText: clean(el.querySelector("time")?.innerText || ""),
      text: clean(el.querySelector('[data-testid="tweetText"]')?.innerText || ""),
      reply: metric("reply"),
      repost: metric("retweet"),
      like: metric("like"),
      socialContext: clean(el.querySelector('[data-testid="socialContext"]')?.innerText || ""),
      isPromoted: /promoted|广告/i.test(el.innerText || ""),
    };
  }).filter((item) => item.text || item.url);

  const query = (() => {
    try {
      return new URL(currentUrl).searchParams.get("q") || "";
    } catch {
      return "";
    }
  })();

  const emptyState = /no results|nothing to see|没有结果|未找到/i.test(bodyText);

  return {
    ok: true,
    url: currentUrl,
    title: clean(document.title),
    query,
    resultCount: tweets.length,
    itemCount: items.length,
    emptyState,
    items,
  };
}

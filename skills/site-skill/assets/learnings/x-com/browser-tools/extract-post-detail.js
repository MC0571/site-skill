async function (args) {
  const clean = (value) =>
    (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const currentUrl = location.href;

  if (/\/i\/(?:jf\/onboarding|flow\/login)|\/login/.test(currentUrl)) {
    return {
      ok: false,
      reason: "login_required",
      url: currentUrl,
      title: clean(document.title),
      message: "当前浏览器 Profile 未登录 X；请切换到已登录的 Profile，或在 ego lite 中手动登录后重试。",
    };
  }

  const isGuestLayout = !document.querySelector('article[data-testid="tweet"]');
  const requestedId = (new URL(currentUrl).pathname.match(/\/status\/(\d+)/) || [])[1] || "";
  const statusUrlOf = (article) => {
    const link = article.querySelector("time")?.closest('a[href*="/status/"]') ||
      [...article.querySelectorAll('a[href*="/status/"]')].find((a) => /\/status\/\d+$/.test(a.href));
    return link?.href || "";
  };
  const articles = [...document.querySelectorAll(isGuestLayout ? "article" : 'article[data-testid="tweet"]')];
  const el = articles.find((article) =>
    (statusUrlOf(article).match(/\/status\/(\d+)/) || [])[1] === requestedId);
  if (!el) {
    return {
      ok: false,
      reason: "post_not_found",
      url: currentUrl,
      title: clean(document.title),
      pageTextSample: clean(document.body ? document.body.innerText : "").slice(0, 500),
    };
  }

  if (/Show more|显示更多/i.test(el.innerText || "")) {
    const showMore = [...el.querySelectorAll('[role="button"], button')]
      .find((button) => /Show more|显示更多/i.test(button.innerText || ""));
    if (showMore) {
      showMore.click();
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  const username = (new URL(currentUrl).pathname.match(/^\/([^/]+)\/status\//) || [])[1] || "";
  const userName = el.querySelector('[data-testid="User-Name"]');
  const userLinks = userName ? [...userName.querySelectorAll('a[href^="/"]')] : [];

  let displayName = "";
  let handle = "";
  let profileUrl = username ? `${location.origin}/${username}` : "";

  if (userName && userLinks.length) {
    displayName = clean(userLinks[0]?.innerText || "");
    handle = clean(userLinks.find((a) => clean(a.innerText).startsWith("@"))?.innerText || "");
  } else if (username) {
    const profileLinks = [...el.querySelectorAll(`a[href="/${username}"]`)];
    const texts = profileLinks.map((a) => clean(a.innerText)).filter(Boolean);
    displayName = texts.find((text) => !text.startsWith("@")) || username;
    handle = texts.find((text) => text.startsWith("@")) || `@${username}`;
  }

  const statusUrl = statusUrlOf(el) || currentUrl;
  const statusId = (statusUrl.match(/\/status\/(\d+)/) || [])[1] || "";

  let images = [...el.querySelectorAll('[data-testid="tweetPhoto"] img')].map((img) => ({
    url: img.currentSrc || img.src || "",
    alt: img.alt || "",
  }));
  if (images.length === 0) {
    images = [...el.querySelectorAll("img")]
      .map((img) => ({ url: img.currentSrc || img.src || "", alt: img.alt || "" }))
      .filter((image) => image.url && !/\/profile_images\//.test(image.url) && !image.url.startsWith("data:"));
  }
  images = images.filter((image) => image.url);

  const videos = [...el.querySelectorAll("video")].map((video) => ({
    url: video.currentSrc || video.src || "",
    poster: video.poster || "",
  })).filter((video) => video.url || video.poster);

  const cards = [...el.querySelectorAll('[data-testid="card.wrapper"]')].map((card) => ({
    text: clean(card.innerText).slice(0, 500),
    url: card.querySelector("a")?.href || "",
  }));

  const metric = (key) => {
    const node = el.querySelector(`[data-testid="${key}"]`);
    if (!node) return "";
    return clean(node.getAttribute("aria-label") || node.innerText || "");
  };

  let text = "";
  const textNode = el.querySelector('[data-testid="tweetText"]');
  if (textNode) {
    text = clean(textNode.innerText || "");
  } else {
    const candidates = [...el.querySelectorAll('[dir="auto"]')]
      .map((node) => clean(node.innerText || ""))
      .filter((value) => value.length > 20)
      .sort((a, b) => b.length - a.length);
    text = candidates[0] || "";
  }

  const timeNode = el.querySelector("time");
  const timeText =
    clean(timeNode?.innerText || "") ||
    clean((el.innerText || "").match(/\d{1,2}:\d{2}\s*·\s*[^\n·]+(?:\s*·\s*[^\n·]+)?/)?.[0] || "");

  const guestMetricCounts = [...el.querySelectorAll(".x-animated-count-visual")]
    .map((node) => clean(node.innerText || ""))
    .filter(Boolean)
    .slice(0, 4);

  return {
    ok: true,
    layout: isGuestLayout ? "guest" : "logged_in",
    url: currentUrl,
    id: statusId,
    canonicalUrl: statusUrl,
    author: { name: displayName, handle, profileUrl },
    publishedAt: timeNode?.getAttribute("datetime") || "",
    timeText,
    text,
    textLength: text.length,
    isTruncated: /Show more|显示更多/i.test(el.innerText || ""),
    images,
    videos,
    cards,
    metrics: {
      reply: metric("reply") || guestMetricCounts[0] || "",
      repost: metric("retweet") || guestMetricCounts[1] || "",
      like: metric("like") || guestMetricCounts[2] || "",
      bookmark: metric("bookmark") || guestMetricCounts[3] || "",
      views: clean(el.querySelector('a[href$="/analytics"]')?.innerText || ""),
    },
  };
}

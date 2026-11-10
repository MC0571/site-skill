async function (args) {
  const clean = (value) =>
    (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const maxItems = Math.max(1, Math.min(Number(args.maxItems) || 50, 100));
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

  const primary =
    document.querySelector('[data-testid="primaryColumn"]') ||
    document.querySelector('[aria-label="Timeline: Conversation"]') ||
    document.body;
  const isGuest = !document.querySelector('article[data-testid="tweet"]');
  let articles = [...primary.querySelectorAll('article[data-testid="tweet"]')];
  if (articles.length === 0 && isGuest) {
    articles = [...primary.querySelectorAll("article")];
  }

  const parse = (el) => {
    const statusLinks = [...el.querySelectorAll('a[href*="/status/"]')]
      .map((a) => a.href)
      .filter((href) => /\/status\/\d+$/.test(href));
    const statusUrl = statusLinks[0] || "";
    const id = (statusUrl.match(/\/status\/(\d+)/) || [])[1] || "";
    const username = (statusUrl.match(/https?:\/\/[^/]+\/([^/]+)\/status\//) || [])[1] || "";
    const userName = el.querySelector('[data-testid="User-Name"]');
    let displayName = "";
    let handle = "";
    if (userName) {
      const links = [...userName.querySelectorAll('a[href^="/"]')];
      displayName = clean(links[0]?.innerText || "");
      handle = clean(links.find((a) => clean(a.innerText).startsWith("@"))?.innerText || "");
    } else if (username) {
      const links = [...el.querySelectorAll(`a[href="/${username}"]`)];
      const texts = links.map((a) => clean(a.innerText)).filter(Boolean);
      displayName = texts.find((text) => !text.startsWith("@")) || username;
      handle = texts.find((text) => text.startsWith("@")) || `@${username}`;
    }

    const textNode = el.querySelector('[data-testid="tweetText"]');
    let text = clean(textNode?.innerText || "");
    if (!text) {
      const candidates = [...el.querySelectorAll('[dir="auto"]')]
        .map((node) => clean(node.innerText || ""))
        .filter((value) => value.length > 20)
        .sort((a, b) => b.length - a.length);
      text = candidates[0] || "";
    }

    const timeNode = el.querySelector("time");
    const images = [...el.querySelectorAll('[data-testid="tweetPhoto"] img')].map((img) => ({
      url: img.currentSrc || img.src || "",
      alt: img.alt || "",
    }));
    const fallbackImages = images.length
      ? images
      : [...el.querySelectorAll("img")]
          .map((img) => ({ url: img.currentSrc || img.src || "", alt: img.alt || "" }))
          .filter((image) => image.url && !/\/profile_images\//.test(image.url));

    const socialContext = clean(el.querySelector('[data-testid="socialContext"]')?.innerText || "");
    const replyMatch = clean(el.innerText || "").match(/Replying to\s+(@[A-Za-z0-9_]+)/i);

    return {
      id,
      url: statusUrl || (id && username ? `https://x.com/${username}/status/${id}` : ""),
      displayName,
      handle,
      publishedAt: timeNode?.getAttribute("datetime") || "",
      timeText: clean(timeNode?.innerText || ""),
      text,
      textLength: text.length,
      images: fallbackImages.filter((image) => image.url && !image.url.startsWith("data:")),
      videos: [...el.querySelectorAll("video")].map((video) => ({
        url: video.currentSrc || video.src || "",
        poster: video.poster || "",
      })).filter((video) => video.url || video.poster),
      socialContext,
      isPinned: /Pinned|置顶/i.test(socialContext),
      replyToHandle: replyMatch ? replyMatch[1] : "",
      metrics: {
        reply: clean(el.querySelector('[data-testid="reply"]')?.getAttribute("aria-label") || ""),
        repost: clean(el.querySelector('[data-testid="retweet"]')?.getAttribute("aria-label") || ""),
        like: clean(el.querySelector('[data-testid="like"]')?.getAttribute("aria-label") || ""),
      },
    };
  };

  const parsed = articles.slice(0, maxItems).map(parse);
  const items = parsed.map((item, index) => {
    const previous = parsed[index - 1];
    return {
      ...item,
      contextBefore:
        previous && previous.handle && previous.handle.toLowerCase() !== (item.handle || "").toLowerCase()
          ? {
              id: previous.id,
              handle: previous.handle,
              displayName: previous.displayName,
              text: previous.text.slice(0, 200),
            }
          : null,
    };
  });

  const emptyState = Boolean(primary.querySelector('[data-testid="emptyState"]'));
  const bodyText = clean(primary.innerText || "");

  return {
    ok: true,
    url: currentUrl,
    title: clean(document.title),
    itemCount: items.length,
    items,
    emptyState,
    emptyText: emptyState ? bodyText.slice(0, 300) : "",
  };
}

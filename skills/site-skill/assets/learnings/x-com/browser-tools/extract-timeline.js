async function (args) {
  const clean = (value) =>
    (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const cleanText = (value) =>
    (value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
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
    const isOwn = (node) => {
      const quoteOwner = node.closest(
        '[data-testid="tweet"], [data-testid="card.wrapper"], [data-testid="quoteTweet"]',
      );
      return node.closest("article") === el && (!quoteOwner || quoteOwner === el);
    };
    const findOwn = (selector) => [...el.querySelectorAll(selector)].find(isOwn) || null;
    const timeNode = findOwn("time");
    const statusUrl = timeNode?.closest('a[href*="/status/"]')?.href || "";
    const statusMatch = statusUrl.match(/https?:\/\/[^/]+\/([^/]+)\/status\/(\d+)/);
    const id = statusMatch?.[2] || "";
    const username = statusMatch?.[1] || "";
    const userName = findOwn('[data-testid="User-Name"]');
    let displayName = "";
    let handle = "";
    if (userName) {
      const links = [...userName.querySelectorAll('a[href^="/"]')];
      displayName = clean(links[0]?.innerText || "");
      handle = clean(links.find((a) => clean(a.innerText).startsWith("@"))?.innerText || "");
    } else if (username) {
      const links = [...el.querySelectorAll(`a[href="/${username}"]`)].filter(isOwn);
      const texts = links.map((a) => clean(a.innerText)).filter(Boolean);
      displayName = texts.find((text) => !text.startsWith("@")) || username;
      handle = texts.find((text) => text.startsWith("@")) || `@${username}`;
    }

    let bodyNode = findOwn('[data-testid="tweetText"]');
    if (!bodyNode) {
      bodyNode = [...el.querySelectorAll('[dir="auto"]')]
        .filter(isOwn)
        .filter((node) =>
          !node.closest(
            'button, [role="button"], a[href], time, [data-testid="User-Name"], [data-testid="socialContext"], [data-testid="card.wrapper"], [data-testid="videoComponent"], [data-testid="videoPlayer"]',
          ),
        )
        .filter((node) => cleanText(node.innerText || ""))
        .sort((a, b) => cleanText(b.innerText || "").length - cleanText(a.innerText || "").length)[0] || null;
    }
    const text = cleanText(bodyNode?.innerText || "");
    const links = bodyNode
      ? [...bodyNode.querySelectorAll("a[href]")]
          .filter(isOwn)
          .map((a) => ({ text: clean(a.innerText || ""), url: a.href || a.getAttribute("href") || "" }))
          .filter((link) => link.text || link.url)
      : [];

    const imageData = (img) => ({
      url: img.currentSrc || img.src || img.getAttribute("src") || "",
      alt: img.alt || "",
    });
    const isPostImage = (img) => {
      const image = imageData(img);
      return isOwn(img) &&
        image.url &&
        !image.url.startsWith("data:") &&
        !/\/profile_images\//.test(image.url) &&
        !img.closest(
          '[data-testid="User-Name"], [data-testid="Tweet-User-Avatar"], [data-testid^="UserAvatar-Container-"], [data-testid="videoComponent"], [data-testid="videoPlayer"]',
        );
    };
    const photoImages = [...el.querySelectorAll('[data-testid="tweetPhoto"] img')]
      .filter(isPostImage)
      .map(imageData);
    const images = photoImages.length
      ? photoImages
      : [...el.querySelectorAll("img")].filter(isPostImage).map(imageData);

    const videoContainerSelector = '[data-testid="videoComponent"], [data-testid="videoPlayer"]';
    const videos = [...el.querySelectorAll(`video, ${videoContainerSelector}`)]
      .filter(isOwn)
      .filter((node) => node.tagName === "VIDEO" ||
        (!node.querySelector("video") && !node.parentElement.closest(videoContainerSelector)))
      .map((video) => {
        const component = video.closest(videoContainerSelector);
        const posterImg = [...(component?.querySelectorAll("img") || [])].find(isOwn);
        const sourceUrl = video.currentSrc || video.src || video.getAttribute("src") || "";
        const poster = video.poster || video.getAttribute("poster") ||
          posterImg?.currentSrc || posterImg?.src || posterImg?.getAttribute("src") || "";
        return {
          url: /^blob:/i.test(sourceUrl) ? "" : sourceUrl,
          poster: /^blob:/i.test(poster) ? "" : poster,
        };
      })
      .filter((video) => video.url || video.poster);

    const socialContext = clean(findOwn('[data-testid="socialContext"]')?.innerText || "");
    const isPromoted = [...el.querySelectorAll('span, [data-testid="socialContext"]')]
        .filter(isOwn)
        .filter((node) => node !== bodyNode && !bodyNode?.contains(node))
        .filter((node) => !node.closest('[data-testid="User-Name"], a[href]'))
        .some((node) => /^(?:Promoted|Ad|广告)$/i.test(clean(node.innerText || "")));
    const controls = [...el.querySelectorAll('button, [role="button"]')].filter(isOwn);
    const controlText = (node) => clean(node.innerText || "");
    const showMoreNodes = [...el.querySelectorAll('[data-testid="tweet-text-show-more-link"]')]
      .filter(isOwn);
    const isTruncated =
      showMoreNodes.length > 0 ||
      controls.some((node) => /Show more|显示更多/i.test(controlText(node)));
    const translatedToggle = /Show original|显示原文|查看原文|^原文$/i;
    const labels = [...el.querySelectorAll("[aria-label]")].filter(isOwn);
    const isTranslated =
      labels.some((node) => translatedToggle.test(node.getAttribute("aria-label") || "")) ||
      controls.some((node) => translatedToggle.test(controlText(node)));
    const metricText = (selector) => {
      const node = [...el.querySelectorAll(selector)].find((candidate) => isOwn(candidate) &&
        candidate.getClientRects().length > 0 && getComputedStyle(candidate).visibility !== "hidden");
      return clean(node?.innerText || "");
    };
    const replyMatch = clean(el.innerText || "").match(/Replying to\s+(@[A-Za-z0-9_]+)/i);

    return {
      id,
      url: statusUrl,
      displayName,
      handle,
      publishedAt: timeNode?.getAttribute("datetime") || "",
      timeText: clean(timeNode?.innerText || ""),
      text,
      textLength: text.length,
      links,
      images: images.filter((image) => image.url),
      videos,
      socialContext,
      isPinned: /Pinned|置顶/i.test(socialContext),
      isPromoted,
      isTruncated,
      isTranslated,
      replyToHandle: replyMatch ? replyMatch[1] : "",
      metrics: {
        reply: metricText('[data-testid="reply"]'),
        repost: metricText('[data-testid="retweet"]'),
        like: metricText('[data-testid="like"]'),
        view: metricText('a[href*="/analytics"]'),
        quote: metricText('[data-testid="quote"]'),
        bookmark: metricText('[data-testid="bookmark"]'),
      },
    };
  };

  const parsed = articles.map(parse).filter((item) => item.id).slice(0, maxItems);
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

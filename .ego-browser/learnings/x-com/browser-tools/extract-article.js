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

  const read = document.querySelector('article[data-testid="twitterArticleReadView"]');
  const guestBody = document.querySelector('[data-article-part="body"]');
  if (!read && !guestBody) {
    return {
      ok: false,
      reason: "article_not_found",
      url: currentUrl,
      title: clean(document.title),
      pageTextSample: clean(document.body ? document.body.innerText : "").slice(0, 500),
    };
  }

  const pathname = new URL(currentUrl).pathname;
  let urlMatch = pathname.match(/^\/([^/]+)\/article\/(\d+)/);
  let username = urlMatch ? urlMatch[1] : "";
  let articleId = urlMatch ? urlMatch[2] : "";
  if (!urlMatch) {
    const shortMatch = pathname.match(/^\/i\/article\/(\d+)/);
    if (shortMatch) articleId = shortMatch[1];
  }

  let title = "";
  let authorName = username;
  let handle = username ? `@${username}` : "";
  let publishedAt = "";
  let timeText = "";
  let wrapper = null;

  if (read) {
    title =
      clean(document.querySelector('[data-testid="twitter-article-title"]')?.innerText) ||
      clean(document.title);
    const authorLink = username
      ? [...read.querySelectorAll(`a[href="/${username}"]`)].find((a) => clean(a.innerText))
      : null;
    authorName = clean(authorLink?.innerText || username);
    const timeNode = read.querySelector("time");
    publishedAt = timeNode?.getAttribute("datetime") || "";
    timeText = clean(timeNode?.innerText || "");
    const bodyRoot = read.querySelector('[data-testid="longformRichTextComponent"]');
    wrapper = bodyRoot?.querySelector("div") || bodyRoot;
  } else {
    const titleEl =
      document.querySelector('[data-article-part="title"]') || document.querySelector("h1");
    title = clean(titleEl?.innerText || document.title);
    const byline = clean(document.querySelector('[data-article-part="byline"]')?.innerText || "");
    const handleMatch = byline.match(/@[A-Za-z0-9_]+/);
    if (handleMatch) handle = handleMatch[0];
    const namePart = byline.replace(handle, "").split(/\s+/).filter(Boolean)[0] || "";
    if (namePart) authorName = namePart;
    timeText = byline;
    wrapper = guestBody.querySelector("div") || guestBody;
  }

  const blocks = [];
  const push = (block) => {
    if (block && block.text && block.text.trim()) blocks.push(block);
  };

  const addBlocks = (container) => {
    for (const child of [...container.children]) {
      const tag = (child.tagName || "").toUpperCase();
      if (tag === "STYLE" || tag === "SCRIPT") continue;
      const cls = String(child.className || "");
      if (cls.includes("longform-unstyled") || tag === "P") {
        push({ type: "paragraph", text: clean(child.innerText) });
        continue;
      }
      if (cls.includes("contents")) {
        addBlocks(child);
        continue;
      }
      const directHeading = tag.match(/^H[1-6]$/)
        ? child
        : child.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6");
      if (directHeading) {
        push({
          type: "heading",
          level: directHeading.tagName.toLowerCase(),
          text: clean(directHeading.innerText),
        });
        continue;
      }
      if (tag === "UL" || tag === "OL") {
        const items = [...child.querySelectorAll(":scope > li")]
          .map((li) => clean(li.innerText))
          .filter(Boolean);
        if (items.length) blocks.push({ type: "list", ordered: tag === "OL", items });
        continue;
      }
      if (tag === "PRE" || cls.includes("x-article-code") || child.querySelector('[data-testid="markdown-code-block"]')) {
        push({ type: "code", text: clean(child.innerText) });
        continue;
      }
      if (tag === "BLOCKQUOTE") {
        push({ type: "quote", text: clean(child.innerText) });
        continue;
      }
      if (tag === "SECTION") {
        const text = clean(child.innerText);
        if (text) push({ type: "embed", text });
        continue;
      }
      if (child.querySelector(":scope > div, :scope > p, :scope > ul, :scope > ol, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6")) {
        addBlocks(child);
        continue;
      }
      push({ type: "paragraph", text: clean(child.innerText) });
    }
  };

  if (wrapper) addBlocks(wrapper);

  if (blocks.length === 0) {
    const fallback = clean(wrapper?.innerText || read?.innerText || guestBody?.innerText);
    if (fallback) blocks.push({ type: "paragraph", text: fallback });
  }

  const contentText = blocks
    .map((block) => (block.type === "list" ? block.items.join("\n") : block.text))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const imageRoot = read || guestBody || document;
  const images = [...imageRoot.querySelectorAll("img")]
    .map((img) => ({ url: img.currentSrc || img.src || "", alt: img.alt || "" }))
    .filter((image) => image.url && !/\/profile_images\//.test(image.url) && !image.url.startsWith("data:"));

  const scrim = document.querySelector('[data-testid="paywallScrim"]');
  const scrimStyle = scrim ? getComputedStyle(scrim) : null;
  const paywalled = Boolean(
    scrim &&
      scrimStyle &&
      scrimStyle.opacity !== "0" &&
      clean(scrim.innerText).length > 0
  );

  return {
    ok: true,
    layout: read ? "logged_in" : "guest",
    url: currentUrl,
    articleId,
    title,
    author: {
      name: authorName,
      handle,
      profileUrl: username ? `${location.origin}/${username}` : "",
    },
    publishedAt,
    timeText,
    blockCount: blocks.length,
    charCount: contentText.length,
    contentText,
    blocks,
    images,
    imageCount: images.length,
    paywalled,
  };
}

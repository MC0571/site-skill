async function (args) {
  const clean = (value) =>
    (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const maxItems = Math.max(1, Math.min(Number(args.maxItems) || 50, 100));
  const currentUrl = location.href;
  const target = new URL(currentUrl).pathname.match(/^\/([^/]+)\/status\/(\d+)/);

  if (/\/i\/(?:jf\/onboarding|flow\/login)|\/login/.test(currentUrl)) {
    return {
      ok: false,
      reason: "login_required",
      url: currentUrl,
      title: clean(document.title),
      message: "当前浏览器 Profile 未登录 X；请切换到已登录的 Profile，或在 ego lite 中手动登录后重试。",
    };
  }

  const conversation = document.querySelector('[aria-label="Timeline: Conversation"]');
  const isGuest = !document.querySelector('article[data-testid="tweet"]');
  let articles = conversation ? [...conversation.querySelectorAll('article[data-testid="tweet"]')] : [];
  if (articles.length === 0) articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
  if (articles.length === 0 && isGuest) articles = [...document.querySelectorAll('article')];
  if (articles.length === 0 || !target) {
    return {
      ok: false,
      reason: "replies_not_found",
      url: currentUrl,
      title: clean(document.title),
      pageTextSample: clean(document.body ? document.body.innerText : "").slice(0, 500),
    };
  }

  const parse = (el) => {
    const statusLinks = [...el.querySelectorAll('a[href*="/status/"]')]
      .map((a) => a.href)
      .filter((href) => /\/status\/\d+$/.test(href));
    const statusUrl = el.querySelector("time")?.closest('a[href*="/status/"]')?.href || statusLinks[0] || "";
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
    let textNode = el.querySelector('[data-testid="tweetText"]');
    if (!textNode) {
      textNode = [...el.querySelectorAll('[dir="auto"]')]
        .filter((node) => !node.closest('[data-testid="User-Name"], [data-testid="socialContext"], a[href]'))
        .sort((a, b) => clean(b.innerText).length - clean(a.innerText).length)[0] || null;
    }
    const text = clean(textNode?.innerText || "");
    const timeNode = el.querySelector("time");
    return {
      id,
      url: statusUrl,
      displayName,
      handle,
      publishedAt: timeNode?.getAttribute("datetime") || "",
      timeText: clean(timeNode?.innerText || ""),
      text,
      textLength: text.length,
      isPromoted: [...el.querySelectorAll('span, [data-testid="socialContext"]')].some((node) =>
        node !== textNode && !textNode?.contains(node) &&
        !node.closest('[data-testid="User-Name"], a[href]') &&
        /^(Promoted|Ad|广告)$/i.test(clean(node.innerText))),
      images: [...el.querySelectorAll('[data-testid="tweetPhoto"] img')].map((img) => ({
        url: img.currentSrc || img.src || "",
        alt: img.alt || "",
      })).filter((image) => image.url && !image.url.startsWith("data:")),
    };
  };

  const parsed = articles.map(parse);
  const rootId = target[2];
  const rootNumber = BigInt(rootId);
  const root = parsed.find((post) => post.id === rootId);
  const rootAuthor = { name: root?.displayName || "", handle: root?.handle || `@${target[1]}` };
  const replies = parsed.filter((reply) => reply.id && BigInt(reply.id) > rootNumber && !reply.isPromoted).slice(0, maxItems).map((reply, index, visibleReplies) => {
    const context = visibleReplies[index - 1];
    return {
      ...reply,
      replyToPostId: rootId,
      replyToHandle: rootAuthor.handle,
      contextBefore:
        context
          ? { id: context.id, handle: context.handle, displayName: context.displayName, text: context.text.slice(0, 180) }
          : null,
    };
  });

  return {
    ok: true,
    url: currentUrl,
    title: clean(document.title),
    rootPostId: rootId,
    rootAuthor,
    replyCount: replies.length,
    replies,
  };
}

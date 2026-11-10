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

  const conversation = document.querySelector('[aria-label="Timeline: Conversation"]');
  const isGuest = !document.querySelector('article[data-testid="tweet"]');
  let articles = conversation ? [...conversation.querySelectorAll('article[data-testid="tweet"]')] : [];
  if (articles.length === 0) articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
  if (articles.length === 0 && isGuest) articles = [...document.querySelectorAll('article')];
  if (articles.length === 0) {
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
        .filter((value) => value.length > 10)
        .sort((a, b) => b.length - a.length);
      text = candidates[0] || "";
    }
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
      isPromoted: /Promoted|广告/i.test(el.innerText || ""),
      images: [...el.querySelectorAll('[data-testid="tweetPhoto"] img')].map((img) => ({
        url: img.currentSrc || img.src || "",
        alt: img.alt || "",
      })).filter((image) => image.url && !image.url.startsWith("data:")),
    };
  };

  const parsed = articles.map(parse);
  const root = parsed[0];
  const replies = parsed.slice(1).filter((reply) => reply.id && !reply.isPromoted).slice(0, maxItems).map((reply, index) => {
    const context = parsed[index];
    return {
      ...reply,
      replyToPostId: root.id,
      replyToHandle: root.handle,
      contextBefore:
        context && context.id !== root.id
          ? { id: context.id, handle: context.handle, displayName: context.displayName, text: context.text.slice(0, 180) }
          : null,
    };
  });

  return {
    ok: true,
    url: currentUrl,
    title: clean(document.title),
    rootPostId: root.id,
    rootAuthor: { name: root.displayName, handle: root.handle },
    replyCount: replies.length,
    replies,
  };
}

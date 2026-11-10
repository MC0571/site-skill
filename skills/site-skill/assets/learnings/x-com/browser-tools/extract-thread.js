async function (args) {
  const clean = (value) =>
    (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const maxPosts = Math.max(1, Math.min(Number(args.maxPosts) || 50, 100));
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

  const isGuest = !document.querySelector('article[data-testid="tweet"]');
  let articles = [...document.querySelectorAll('[aria-label="Timeline: Conversation"] article[data-testid="tweet"]')];
  if (articles.length === 0) articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
  if (articles.length === 0 && isGuest) {
    articles = [...document.querySelectorAll('[aria-label="Timeline: Conversation"] article, article')];
  }
  if (articles.length === 0) {
    return {
      ok: false,
      reason: "thread_not_found",
      url: currentUrl,
      title: clean(document.title),
      pageTextSample: clean(document.body ? document.body.innerText : "").slice(0, 500),
    };
  }

  const rootId = (new URL(currentUrl).pathname.match(/\/status\/(\d+)/) || [])[1] || "";

  const statusUrlOf = (el) => {
    const links = [...el.querySelectorAll('a[href*="/status/"]')]
      .map((a) => a.href)
      .filter((href) => /\/status\/\d+$/.test(href));
    return links[0] || "";
  };

  const parse = (el) => {
    const statusUrl = statusUrlOf(el);
    const id = (statusUrl.match(/\/status\/(\d+)/) || [])[1] || "";
    const userMatch = statusUrl.match(/https?:\/\/[^/]+\/([^/]+)\/status\//);
    const username = userMatch ? userMatch[1] : "";
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
    const images = [...el.querySelectorAll('[data-testid="tweetPhoto"] img')].map((img) => ({
      url: img.currentSrc || img.src || "",
      alt: img.alt || "",
    }));
    const guestImages = images.length
      ? images
      : [...el.querySelectorAll("img")]
          .map((img) => ({ url: img.currentSrc || img.src || "", alt: img.alt || "" }))
          .filter((image) => image.url && !/\/profile_images\//.test(image.url));
    return {
      id,
      url: statusUrl || (id ? `https://x.com/${username}/status/${id}` : ""),
      handle,
      displayName,
      publishedAt: timeNode?.getAttribute("datetime") || "",
      timeText: clean(timeNode?.innerText || ""),
      text,
      textLength: text.length,
      images: guestImages.filter((image) => image.url && !image.url.startsWith("data:")),
      metrics: {
        reply: clean(el.querySelector('[data-testid="reply"]')?.getAttribute("aria-label") || ""),
        repost: clean(el.querySelector('[data-testid="retweet"]')?.getAttribute("aria-label") || ""),
        like: clean(el.querySelector('[data-testid="like"]')?.getAttribute("aria-label") || ""),
      },
    };
  };

  const parsed = articles.map(parse);
  const root = parsed[0];
  const rootHandle = (root.handle || "").toLowerCase();
  const posts = [];
  let previousId = null;

  for (const post of parsed) {
    if (!post.id) continue;
    if ((post.handle || "").toLowerCase() !== rootHandle) break;
    let idBig;
    try {
      idBig = BigInt(post.id);
    } catch {
      break;
    }
    if (previousId !== null && idBig <= previousId) break;
    posts.push(post);
    previousId = idBig;
    if (posts.length >= maxPosts) break;
  }

  const numbered = posts
    .map((post) => post.text.match(/\((\d+)\s*\/\s*(\d+)\)/))
    .find(Boolean);

  return {
    ok: true,
    layout: isGuest ? "guest" : "logged_in",
    url: currentUrl,
    requestedPostId: rootId,
    rootPostId: root.id,
    author: {
      name: root.displayName,
      handle: root.handle,
      profileUrl: root.handle ? `${location.origin}/${root.handle.replace(/^@/, "")}` : "",
    },
    postCount: posts.length,
    declaredParts: numbered ? { part: Number(numbered[1]), total: Number(numbered[2]) } : null,
    isThread: posts.length > 1,
    posts,
  };
}

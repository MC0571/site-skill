async function (args) {
  const clean = (value) =>
    (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const maxItems = Math.max(1, Math.min(Number(args.maxItems) || 20, 50));

  const currentUrl = location.href;
  const bodyText = document.body ? document.body.innerText || "" : "";
  const loginRedirect = /\/i\/(?:jf\/onboarding|flow\/login)|\/login/.test(currentUrl);
  const trendEls = document.querySelectorAll('[data-testid="trend"]');

  if (loginRedirect || (trendEls.length === 0 && /sign in|log in|登录|登入|使用手机继续/i.test(bodyText))) {
    return {
      ok: false,
      reason: "login_required",
      url: currentUrl,
      title: clean(document.title),
      message: "当前浏览器 Profile 未登录 X；请切换到已登录的 Profile，或在 ego lite 中手动登录后重试。",
    };
  }

  const trends = [...trendEls].slice(0, maxItems).map((el, index) => {
    const lines = (el.innerText || "")
      .split("\n")
      .map((line) => clean(line))
      .filter(Boolean);
    let topic = lines[0] || "";
    let context = lines[1] || "";
    let category = "";
    const categoryLine = topic.match(/^(.+?)\s*·\s*Trending$/i);
    if (categoryLine) {
      category = clean(categoryLine[1]);
      topic = lines[1] || "";
      context = lines[0] || "";
    } else {
      const parts = context.split("·").map((part) => clean(part)).filter(Boolean);
      category = /trending/i.test(parts[0] || "") ? (parts[1] || "") : (parts[0] || "");
    }
    const postsMatch = context.match(/([\d.,]+[KMB]?)\s*(?:posts|帖子)/i);
    return {
      rank: index + 1,
      topic,
      context,
      category,
      posts: postsMatch ? postsMatch[1] : "",
    };
  }).filter((trend) => trend.topic);

  return {
    ok: true,
    url: currentUrl,
    title: clean(document.title),
    trendCount: trends.length,
    trends,
  };
}

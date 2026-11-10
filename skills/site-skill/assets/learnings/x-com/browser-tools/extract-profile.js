async function (args) {
  const clean = (value) =>
    (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const currentUrl = location.href;
  const username = (new URL(currentUrl).pathname.split("/").filter(Boolean)[0] || "").replace(/^@/, "");

  if (/\/i\/(?:jf\/onboarding|flow\/login)|\/login/.test(currentUrl)) {
    return {
      ok: false,
      reason: "login_required",
      url: currentUrl,
      title: clean(document.title),
      message: "当前浏览器 Profile 未登录 X；请切换到已登录的 Profile，或在 ego lite 中手动登录后重试。",
    };
  }

  let schema = null;
  const schemaEl = document.querySelector('[data-testid="UserProfileSchema-test"]');
  if (schemaEl) {
    try {
      schema = JSON.parse(schemaEl.textContent || "{}");
    } catch {
      schema = null;
    }
  }
  const person = schema?.mainEntity || {};
  const stats = Array.isArray(person.interactionStatistic) ? person.interactionStatistic : [];
  const count = (name) => {
    const stat = stats.find((item) => item.name === name);
    return stat ? Number(stat.userInteractionCount) || 0 : 0;
  };

  const meta = (name) => {
    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return el ? el.getAttribute("content") || "" : "";
  };
  const parseCompact = (value) => {
    const match = String(value || "").match(/([\d.,]+)\s*([KMB])?/i);
    if (!match) return 0;
    const number = Number(match[1].replace(/,/g, ""));
    const multiplier = match[2] ? { K: 1000, M: 1000000, B: 1000000000 }[match[2].toUpperCase()] : 1;
    return Number.isFinite(number) ? Math.round(number * multiplier) : 0;
  };

  const bodyText = clean(document.body ? document.body.innerText : "");
  const followersMatch = bodyText.match(/([\d.,]+[KMB]?)\s*(?:关注者|Followers)/i);
  const followingMatch = bodyText.match(/([\d.,]+[KMB]?)\s*(?:正在关注|Following)/i);

  const userNameEl = document.querySelector('[data-testid="UserName"]');
  const userNameText = clean(userNameEl?.innerText || "");
  const nameFromDom = userNameText.replace(/@\S+/g, "").trim();
  const displayName = clean(person.name || nameFromDom || meta("profile:first_name") || document.querySelector("h1")?.innerText || username);
  const handle = person.additionalName
    ? `@${person.additionalName}`
    : (meta("profile:username") ? `@${meta("profile:username")}` : (username ? `@${username}` : ""));

  const websiteEl = document.querySelector('[data-testid="UserUrl"]');
  const profile = {
    id: person.identifier || "",
    name: displayName,
    handle,
    profileUrl: person.url || (username ? `${location.origin}/${username}` : currentUrl),
    bio: clean(
      document.querySelector('[data-testid="UserDescription"]')?.innerText ||
      person.description ||
      meta("twitter:description") ||
      meta("description") ||
      ""
    ),
    location: clean(document.querySelector('[data-testid="UserLocation"]')?.innerText || person.homeLocation?.name || ""),
    website: clean(websiteEl?.innerText || ""),
    websiteUrl: websiteEl?.querySelector("a")?.href || "",
    joinedAt: clean(
      document.querySelector('[data-testid="UserJoinDate"]')?.innerText ||
      schema?.dateCreated ||
      meta("twitter:data2") ||
      ""
    ),
    postsCount: count("Tweets") || parseCompact(meta("twitter:data1")),
    followersCount: count("Follows") || (followersMatch ? parseCompact(followersMatch[1]) : 0),
    followingCount: count("Friends") || (followingMatch ? parseCompact(followingMatch[1]) : 0),
    avatarUrl:
      document.querySelector('[data-testid="Tweet-User-Avatar"] img')?.src ||
      person.image?.contentUrl ||
      meta("og:image") ||
      "",
    bannerUrl: document.querySelector('img[src*="profile_banners"]')?.src || "",
    verified: Boolean(userNameEl?.querySelector('[data-testid="icon-verified"]')),
  };

  const tabs = [...document.querySelectorAll('[role="tab"]')].map((tab) => ({
    text: clean(tab.innerText),
    href: tab.getAttribute("href") || "",
    selected: tab.getAttribute("aria-selected") === "true",
  }));

  const primary = document.querySelector('[data-testid="primaryColumn"]');
  const emptyState = Boolean(primary?.querySelector('[data-testid="emptyState"]'));

  return {
    ok: true,
    url: currentUrl,
    title: clean(document.title),
    profile,
    tabs,
    emptyState,
  };
}

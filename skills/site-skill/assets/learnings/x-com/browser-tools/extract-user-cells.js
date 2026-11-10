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

  const primary = document.querySelector('[data-testid="primaryColumn"]') || document.body;
  const cells = [...primary.querySelectorAll('[data-testid="UserCell"]')];

  const parse = (cell) => {
    const bioCell = cell.cloneNode(true);
    const anchors = [...bioCell.querySelectorAll('a[href^="/"]')]
      .filter((a) => a.getAttribute("aria-hidden") !== "true");
    const profileAnchor = anchors.find((a) => {
      const text = clean(a.innerText);
      return text && !text.startsWith("@");
    }) || anchors[0];
    const handleAnchor = anchors.find((a) => clean(a.innerText).startsWith("@"));
    const displayName = clean(profileAnchor?.innerText || "");
    const handle = clean(handleAnchor?.innerText || "");
    const fullText = clean(cell.innerText || "");
    profileAnchor?.remove();
    handleAnchor?.remove();
    bioCell.querySelectorAll('button, [role="button"], [data-testid="userFollowIndicator"]')
      .forEach((node) => node.remove());
    const bio = clean(bioCell.innerText || "");

    const followButton = cell.querySelector('[data-testid$="-follow"]') || cell.querySelector('button');
    const buttonText = clean(followButton?.innerText || "");
    const avatar = cell.querySelector('[data-testid^="UserAvatar-Container-"] img');
    return {
      displayName,
      handle,
      profileUrl: profileAnchor?.getAttribute("href") || handleAnchor?.getAttribute("href") || "",
      bio,
      avatarUrl: avatar?.currentSrc || avatar?.src || "",
      verified: Boolean(cell.querySelector('[data-testid="icon-verified"]')),
      followsYou: /Follows you|关注了你/i.test(fullText),
      followButton: buttonText,
      isFollowing: /^(Following|Unfollow|正在关注|回关)$/i.test(buttonText),
    };
  };

  const users = cells.slice(0, maxItems).map(parse);
  const emptyState = Boolean(primary.querySelector('[data-testid="emptyState"]'));
  const emptyText = emptyState ? clean(primary.innerText || "").slice(0, 400) : "";

  return {
    ok: true,
    url: currentUrl,
    title: clean(document.title),
    userCount: users.length,
    users,
    emptyState,
    emptyText,
  };
}

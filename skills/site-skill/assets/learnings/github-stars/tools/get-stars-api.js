const API_ORIGIN = "https://api.github.com";

export async function getStarsApi(ctx, args = {}) {
  const options = args ?? {};
  const { username, maxItems } = options;
  const sort = options.sort === undefined ? "created" : options.sort;
  const direction = options.direction === undefined ? "desc" : options.direction;
  const authenticated = options.authenticated === undefined ? false : options.authenticated;

  if (typeof username !== "string" || !username || username.trim() !== username) {
    throw new Error("username must be a non-empty string without surrounding whitespace");
  }
  if (sort !== "created" && sort !== "updated") {
    throw new Error("sort must be created or updated");
  }
  if (direction !== "asc" && direction !== "desc") {
    throw new Error("direction must be asc or desc");
  }
  if (maxItems !== undefined && (!Number.isSafeInteger(maxItems) || maxItems < 1)) {
    throw new Error("maxItems must be a positive safe integer");
  }
  if (typeof authenticated !== "boolean") {
    throw new Error("authenticated must be a boolean");
  }

  let token;
  if (authenticated) {
    token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("authenticated: true requires process.env.GITHUB_TOKEN");
  }

  const headers = {
    Accept: "application/vnd.github.star+json",
    "X-GitHub-Api-Version": "2026-03-10",
  };
  if (authenticated) headers.Authorization = `Bearer ${token}`;

  const firstUrl = new URL(`/users/${encodeURIComponent(username)}/starred`, API_ORIGIN);
  firstUrl.searchParams.set("per_page", "100");
  firstUrl.searchParams.set("sort", sort);
  firstUrl.searchParams.set("direction", direction);

  const collected = new Map();
  let currentUrl = firstUrl.href;
  let pagesRead = 0;
  const limit = maxItems ?? Infinity;
  const finish = ({ ok = true, reason, status, items = [...collected.values()].slice(0, limit), stopReason, nextUrl = "" }) => ({
    ok,
    ...(reason ? { reason } : {}),
    ...(status === undefined ? {} : { status }),
    scope: "all_pages",
    access: authenticated ? "token_visible" : "public",
    items,
    itemCount: items.length,
    totalLoaded: collected.size,
    pagesRead,
    truncated: stopReason !== "end",
    complete: ok && stopReason === "end",
    stopReason,
    nextUrl,
  });

  while (true) {
    const response = await fetch(currentUrl, { headers });
    if (!response.ok) {
      return finish({ ok: false, reason: "http_error", status: response.status, stopReason: "blocked", nextUrl: currentUrl });
    }

    let page;
    try {
      page = await response.json();
    } catch {
      return finish({ ok: false, reason: "invalid_json", status: response.status, stopReason: "blocked", nextUrl: currentUrl });
    }
    if (!Array.isArray(page) || page.some(entry => !entry?.repo ||
        typeof entry.starred_at !== "string" || typeof entry.repo.full_name !== "string" ||
        typeof entry.repo.html_url !== "string" || !Number.isSafeInteger(entry.repo.id))) {
      return finish({ ok: false, reason: "invalid_response", status: response.status, stopReason: "blocked", nextUrl: currentUrl });
    }

    for (const entry of page) {
      const repo = entry.repo;
      const id = repo.id;
      if (!collected.has(id)) {
        collected.set(id, {
          type: "repository",
          id,
          name: repo.full_name,
          url: repo.html_url,
          description: repo.description ?? "",
          language: repo.language ?? "",
          stars: String(repo.stargazers_count ?? ""),
          forks: String(repo.forks_count ?? ""),
          starredAt: entry.starred_at,
        });
      }
    }
    pagesRead += 1;

    let nextUrl;
    try {
      nextUrl = readNextUrl(response.headers.get("link"), username, sort, direction);
    } catch {
      return finish({ ok: false, reason: "invalid_link", status: response.status, stopReason: "blocked", nextUrl: currentUrl });
    }

    const loaded = [...collected.values()];
    if (loaded.length > limit) {
      return finish({ items: loaded.slice(0, limit), stopReason: "max_items", nextUrl: currentUrl });
    }
    if (loaded.length === limit && nextUrl) {
      return finish({ stopReason: "max_items", nextUrl });
    }
    if (!nextUrl) return finish({ stopReason: "end" });
    currentUrl = nextUrl;
  }
}

function readNextUrl(header, username, sort, direction) {
  if (!header) return "";
  for (const entry of header.split(",")) {
    const match = entry.trim().match(/^<([^>]+)>\s*;(.*)$/);
    if (!match) continue;
    const rel = match[2].match(/(?:^|;)\s*rel\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
    if (!rel || !(rel[1] ?? rel[2]).split(/\s+/).includes("next")) continue;

    let next;
    try {
      next = new URL(match[1]);
    } catch {
      throw new Error("GitHub Link rel=next is not a valid URL");
    }
    const usernamePath = `/users/${encodeURIComponent(username)}/starred`;
    if (next.origin !== API_ORIGIN || next.username || next.password ||
        (next.pathname.toLowerCase() !== usernamePath.toLowerCase() && !/^\/user\/[0-9]+\/starred$/.test(next.pathname))) {
      throw new Error("GitHub Link rel=next points outside the requested starred-repositories route");
    }
    next.searchParams.set("per_page", "100");
    next.searchParams.set("sort", sort);
    next.searchParams.set("direction", direction);
    return next.href;
  }
  return "";
}

export function validateStarsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("url must be a GitHub Stars overview, repository list, stars profile or list detail URL");
  }
  if (url.origin !== "https://github.com" || url.username || url.password) {
    throw new Error("url must be a GitHub Stars overview, repository list, stars profile or list detail URL");
  }
  if (/^\/stars\/[^/]+\/lists\/[^/]+\/?$/.test(url.pathname)) {
    return { url, layout: "list", overview: false };
  }
  if (/^\/[^/]+\/?$/.test(url.pathname) && url.searchParams.get("tab") === "stars") {
    return { url, layout: "profile", overview: false };
  }
  if (/^\/stars(?:\/[^/]+(?:\/(?:repositories|topics))?)?\/?$/.test(url.pathname)) {
    const overview = url.pathname.split("/").filter(Boolean).length < 3;
    return { url, layout: "stars", overview };
  }
  throw new Error("url must be a GitHub Stars overview, repository list, stars profile or list detail URL");
}

function validateMaxItems(value) {
  if (value === undefined) return Infinity;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("maxItems must be a positive safe integer");
  }
  return value;
}

async function collectStarsPages(ctx, requestedUrl, maxItems, initialPage, currentUrl) {
  const readPage = () => ctx.runSiteBrowserTool("github-stars", "extract_stars", {});
  let page = initialPage;
  const collected = new Map();
  let pagesRead = 0;
  while (page.ok) {
    pagesRead += 1;
    for (const item of page.items) {
      if (!collected.has(item.url)) collected.set(item.url, item);
    }
    if (collected.size >= maxItems || !page.nextUrl || page.truncated) break;
    currentUrl = page.nextUrl;
    await ctx.gotoAndWait(currentUrl);
    page = await readPage();
  }

  const items = [...collected.values()].slice(0, maxItems);
  const complete = page.ok && !page.nextUrl && !page.truncated && collected.size <= maxItems;
  return {
    ...page,
    requestedUrl,
    scope: "all_pages",
    items,
    itemCount: items.length,
    totalLoaded: collected.size,
    pagesRead,
    complete,
    truncated: !complete,
    stopReason: !page.ok ? "blocked" : complete ? "end" : "max_items",
    nextUrl: complete ? "" : !page.ok || collected.size > maxItems || page.truncated ? currentUrl : page.nextUrl,
  };
}

export async function getStars(ctx, args = {}) {
  const { url, overview } = validateStarsUrl(args.url ?? "https://github.com/stars");
  const maxItems = validateMaxItems(args.maxItems);
  const requestedUrl = url.href;

  await ctx.openOrReuseTab(requestedUrl, { wait: true });
  await ctx.waitForLoad();
  const readPage = () => ctx.runSiteBrowserTool("github-stars", "extract_stars", {});
  let page = await readPage();
  let currentUrl = requestedUrl;

  if (page.ok && overview) {
    const candidates = [...(page.filters || []), ...(page.collectionLinks || [])];
    const repositories = candidates.find(link => {
      const target = new URL(link.url);
      return target.pathname.replace(/\/$/, "").endsWith("/repositories") && target.searchParams.get("filter") === "all" &&
        !target.searchParams.has("language");
    });
    if (repositories) {
      const target = new URL(repositories.url);
      for (const [key, value] of url.searchParams) target.searchParams.set(key, value);
      currentUrl = target.href;
      await ctx.gotoAndWait(currentUrl);
      page = await readPage();
    } else {
      page = { ...page, ok: false, reason: "repository_list_not_found" };
    }
  }

  return collectStarsPages(ctx, requestedUrl, maxItems, page, currentUrl);
}

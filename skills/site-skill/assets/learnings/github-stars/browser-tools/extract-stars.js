async function (args = {}) {
  const maxItems = args.maxItems ?? 100;
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 100) {
    throw new Error("maxItems must be an integer from 1 to 100");
  }
  const url = new URL(location.href);
  if (/^\/(?:login|session|sessions)(?:\/|$)/.test(url.pathname)) {
    return { ok: false, reason: "login_required", url: url.href };
  }
  let layout;
  if (/^\/stars\/[^/]+\/lists\/[^/]+\/?$/.test(url.pathname)) layout = "list";
  else if (/^\/stars(?:\/[^/]+(?:\/(?:repositories|topics))?)?\/?$/.test(url.pathname)) layout = "stars";
  else if (/^\/[^/]+\/?$/.test(url.pathname) && url.searchParams.get("tab") === "stars") layout = "profile";
  if (url.origin !== "https://github.com" || url.username || url.password || !layout) {
    return { ok: false, reason: "unsupported_page", url: url.href };
  }
  // GitHub streams cards and pagination after the search form has appeared.
  if (document.readyState !== "complete") {
    return { ok: false, reason: "page_loading", url: url.href };
  }
  const main = document.querySelector("main");
  if (!main) return { ok: false, reason: "stars_not_found", url: url.href };

  const clean = value => (value || "").replace(/\s+/g, " ").trim();
  const absolute = el => el ? new URL(el.getAttribute("href"), url).href : "";
  const visible = el => Boolean(el) && !el.closest("dialog, [hidden]");
  const links = selector => [...main.querySelectorAll(selector)].filter(visible).map(el => ({
    text: clean(el.textContent), url: absolute(el),
  }));
  const visibleMatch = (container, selector) =>
    [...container.querySelectorAll(selector)].find(visible);
  const findContainer = (link, boundary) => {
    let node = link.parentElement;
    let fallback = node;
    while (node && node !== boundary) {
      if (node.matches("li, article")) return node;
      if (node.querySelector("relative-time[datetime], [itemprop='programmingLanguage'], " +
          "a[href$='/stargazers'], a[href$='/forks'], p")) return node;
      node = node.parentElement;
    }
    return fallback || link.parentElement;
  };
  const repositoryItem = (link, container) => {
    const time = visibleMatch(container, "relative-time[datetime]");
    const description = visibleMatch(container, "p[itemprop='description'], .pinned-item-desc, p");
    return {
      type: "repository",
      name: new URL(absolute(link)).pathname.replace(/^\/|\/$/g, ""),
      url: absolute(link),
      description: clean(description?.textContent),
      language: clean(visibleMatch(container, "[itemprop='programmingLanguage']")?.textContent),
      stars: clean(visibleMatch(container, "a[href$='/stargazers']")?.textContent),
      forks: clean(visibleMatch(container, "a[href$='/forks']")?.textContent),
      time: time ? {
        label: clean(time.previousSibling?.nodeType === 3 ? time.previousSibling.textContent : ""),
        datetime: time.getAttribute("datetime"),
        text: clean(time.textContent),
      } : null,
    };
  };
  const emptyMessageIn = selector => clean([...main.querySelectorAll(selector)].find(visible)?.textContent);
  const pagination = links(".paginate-container a[href]");
  const menuLinks = ids => {
    const found = [];
    for (const id of ids) {
      const button = document.getElementById(id);
      if (!button) continue;
      const controlled = button.getAttribute("aria-controls");
      const menu = (controlled && document.getElementById(controlled)) ||
        button.closest("details")?.querySelector('[role="menu"]') ||
        button.parentElement?.querySelector('[role="menu"]');
      if (menu) found.push(...[...menu.querySelectorAll("a[href]")].map(el => ({
        text: clean(el.textContent), url: absolute(el),
      })));
    }
    return found;
  };
  const menuFilters = menuLinks(["stars-type-filter-menu-button", "stars-language-filter-menu-button"]);
  const menuSort = menuLinks(["stars-sort-menu-button"]);
  const filters = menuFilters.length ? menuFilters : links('[aria-label="Star filters"] li a[href]');
  const sortOptions = menuSort.length ? menuSort : links('[role="menu"] a[href]');
  const common = {
    ok: true,
    url: url.href,
    scope: "current_page",
    layout,
    title: clean(main.querySelector("h1")?.textContent),
    query: url.searchParams.get("q") || "",
    filter: url.searchParams.get("type") || url.searchParams.get("filter") || "",
    language: url.searchParams.get("language") || "",
    sort: url.searchParams.get("sort") || (layout === "stars" ? "created" : ""),
    direction: url.searchParams.get("direction") || "",
    filters,
    sortOptions,
    previousUrl: pagination.find(link => link.text === "Previous")?.url || "",
    nextUrl: pagination.find(link => link.text === "Next")?.url || "",
  };

  if (layout === "profile") {
    const frame = main.querySelector("#user-profile-frame");
    if (!frame) return { ok: false, reason: "stars_not_found", url: url.href };
    const repositoryLinks = [...frame.querySelectorAll("div h3 a[href]")]
      .filter(visible)
      .filter(link => /^\/[^/]+\/[^/]+\/?$/.test(new URL(absolute(link)).pathname));
    const emptyMessage = emptyMessageIn(".blankslate h3, .blankslate p");
    if (!repositoryLinks.length && !emptyMessage) {
      return { ok: false, reason: "stars_not_found", url: url.href };
    }
    const items = repositoryLinks.slice(0, maxItems)
      .map(link => repositoryItem(link, findContainer(link, frame)));
    return {
      ...common,
      items,
      itemCount: items.length,
      totalLoaded: repositoryLinks.length,
      truncated: repositoryLinks.length > items.length,
      emptyMessage,
      collectionLinks: [],
    };
  }

  if (layout === "list") {
    const repositories = main.querySelector("#user-list-repositories");
    const editButton = main.querySelector('button[data-show-dialog-id^="edit-list-dialog-"]');
    const emptyMessage = emptyMessageIn(".blankslate h3, .blankslate p");
    if (!repositories && !(visible(editButton) && emptyMessage)) {
      return { ok: false, reason: "stars_not_found", url: url.href };
    }
    const repositoryLinks = repositories
      ? [...repositories.querySelectorAll("h2 a[href]")].filter(visible)
      : [];
    if (repositories && !repositoryLinks.length && !emptyMessage) {
      return { ok: false, reason: "stars_not_found", url: url.href };
    }
    const nameInput = document.querySelector('input[name="user_list[name]"]');
    const descriptionInput = document.querySelector('textarea[name="user_list[description]"]');
    const privateInput = document.querySelector('input[type="checkbox"][name="user_list[private]"]');
    const list = {
      name: clean(nameInput?.value),
      description: (descriptionInput?.value || "").trim(),
      private: privateInput ? Boolean(privateInput.checked || privateInput.hasAttribute("checked")) : null,
    };
    const items = repositoryLinks.slice(0, maxItems)
      .map(link => repositoryItem(link, findContainer(link, repositories)));
    return {
      ...common,
      title: list.name || common.title,
      list,
      items,
      itemCount: items.length,
      totalLoaded: repositoryLinks.length,
      truncated: repositoryLinks.length > items.length,
      emptyMessage,
      collectionLinks: [],
    };
  }

  if (!main.querySelector('form[role="search"][aria-label="Starred repositories"]')) {
    return { ok: false, reason: "stars_not_found", url: url.href };
  }
  const rows = [...main.querySelectorAll("li")].filter(row =>
    visible(row) && row.querySelector('h3 a[href], a[href^="/topics/"]')
  );
  const emptyMessage = emptyMessageIn(".blankslate h3");
  if (!rows.length && !/couldn.t find any matching starred (?:repositories|topics)/i.test(emptyMessage)) {
    return { ok: false, reason: "stars_not_found", url: url.href };
  }
  const items = rows.slice(0, maxItems).map(row => {
    const repository = row.querySelector("h3 a[href]");
    if (repository) return repositoryItem(repository, row);
    const link = row.querySelector('a[href^="/topics/"]');
    const time = visibleMatch(row, "relative-time[datetime]");
    return {
      type: "topic",
      name: clean(link.querySelector("p")?.textContent),
      url: absolute(link),
      description: clean(link.querySelectorAll("p")[1]?.textContent),
      time: time ? {
        label: clean(time.previousSibling?.nodeType === 3 ? time.previousSibling.textContent : ""),
        datetime: time.getAttribute("datetime"),
        text: clean(time.textContent),
      } : null,
    };
  });
  const collectionLinks = [...main.querySelectorAll('a[href^="/stars/"]')]
    .filter(visible)
    .filter(el => !el.closest('[aria-label="Star filters"], li, dialog'))
    .filter(el => /^See all starred /.test(clean(el.textContent)))
    .map(el => ({ text: clean(el.textContent), url: absolute(el) }));
  return {
    ...common,
    items,
    itemCount: items.length,
    totalLoaded: rows.length,
    truncated: rows.length > items.length,
    emptyMessage,
    collectionLinks,
  };
}

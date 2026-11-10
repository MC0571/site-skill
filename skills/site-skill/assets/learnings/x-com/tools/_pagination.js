function defaultKey(item) {
  return item.id || item.url || `${item.handle || ""}|${item.text || ""}`;
}

export async function collectMore(ctx, options = {}) {
  const {
    browserTool,
    arrayKey = "items",
    args = {},
    maxItems = 50,
    maxScrolls = 5,
    keyOf = defaultKey,
  } = options;

  const requestArgs = { ...args, maxItems: Math.min(100, Math.max(maxItems, 20)) };
  const first = await ctx.runSiteBrowserTool("x-com", browserTool, requestArgs);
  const merged = [];
  const seen = new Set();

  const add = (items) => {
    for (const item of items || []) {
      const key = keyOf(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  };

  add(first[arrayKey]);
  let rounds = 0;
  let stalls = 0;

  while (merged.length < maxItems && rounds < maxScrolls) {
    const before = await ctx.js(`(() => ({ y: window.scrollY, h: document.body.scrollHeight }))()`);
    await ctx.scroll({ dx: 0, dy: 1800 });
    await ctx.wait(1.2);
    const next = await ctx.runSiteBrowserTool("x-com", browserTool, { ...args, maxItems: 100 });
    const previousSize = merged.length;
    add(next[arrayKey]);
    rounds += 1;
    if (merged.length === previousSize) {
      stalls += 1;
      const after = await ctx.js(`(() => ({ y: window.scrollY, h: document.body.scrollHeight }))()`);
      if (stalls >= 2 || (after.y === before.y && after.h === before.h)) break;
    } else {
      stalls = 0;
    }
  }

  const visible = merged.slice(0, maxItems);
  const countKey = arrayKey === "replies" ? "replyCount" : arrayKey === "users" ? "userCount" : "itemCount";
  return {
    ...first,
    [arrayKey]: visible,
    [countKey]: visible.length,
    totalLoaded: merged.length,
    scrollRounds: rounds,
  };
}

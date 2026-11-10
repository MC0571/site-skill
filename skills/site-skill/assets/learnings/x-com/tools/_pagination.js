function defaultKey(item) {
  return item.id || item.url || `${item.handle || ""}|${item.text || ""}`;
}

export function boundedInteger(value, fallback, max, min = 1) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

export async function collectMore(ctx, options = {}) {
  const {
    browserTool,
    arrayKey = "items",
    args = {},
    maxItems = 50,
    maxScrolls: requestedScrolls,
    keyOf = defaultKey,
    predicate,
  } = options;

  const maxScrolls = boundedInteger(requestedScrolls, 5, 20, 0);
  const requestArgs = { ...args, maxItems: Math.min(100, Math.max(maxItems, 20)) };
  const first = await ctx.runSiteBrowserTool("x-com", browserTool, requestArgs);
  if (first.ok === false) return first;
  const merged = [];
  const seen = new Set();

  const add = (items) => {
    for (const item of items || []) {
      const key = keyOf(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (!predicate || predicate(item)) merged.push(item);
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
    if (next.ok === false) return next;
    const previousSize = seen.size;
    add(next[arrayKey]);
    rounds += 1;
    if (seen.size === previousSize) {
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

import { collectMore } from "./_pagination.js";

function boundedInteger(value, fallback, max) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(number)));
}

export async function getTimelinePosts(ctx, args = {}) {
  const maxPosts = boundedInteger(args.maxPosts, 50, 100);
  const result = await collectMore(ctx, {
    browserTool: "extract_timeline",
    arrayKey: "items",
    maxItems: maxPosts,
    maxScrolls: Math.max(0, Math.min(Number(args.maxScrolls) || 5, 20)),
  });
  return (result.items || []).slice(0, maxPosts);
}

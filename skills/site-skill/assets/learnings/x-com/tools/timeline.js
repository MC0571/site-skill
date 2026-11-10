import { boundedInteger, collectMore } from "./_pagination.js";

export async function getTimelinePosts(ctx, args = {}) {
  const maxPosts = boundedInteger(args.maxPosts, 50, 100);
  const result = await collectMore(ctx, {
    browserTool: "extract_timeline",
    arrayKey: "items",
    maxItems: maxPosts,
    maxScrolls: args.maxScrolls,
  });
  if (result.ok === false) throw new Error(result.reason, { cause: result });
  return result.items;
}

import { boundedInteger, collectMore } from "./_pagination.js";
import { prepareProfileTimeline } from "./_profile-timeline.js";

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];
}

async function collectProfilePosts(ctx, args, includeTimelineContext) {
  const username = normalizeUsername(args.username);
  if (!username) throw new Error("username is required");
  const maxItems = boundedInteger(args.maxItems, 50, 100);

  const url = `https://x.com/${encodeURIComponent(username)}`;
  await ctx.openOrReuseTab(url, { wait: true });
  await ctx.waitForLoad();

  const target = `@${username}`.toLowerCase();
  let firstPage = true;
  const result = await collectMore(ctx, {
    browserTool: "extract_timeline",
    arrayKey: "items",
    maxItems,
    maxScrolls: boundedInteger(args.maxScrolls, 60, 120, 0),
    scrollLimit: 120,
    scrollDistance: 650,
    preservePartial: true,
    stopOnRepeated: false,
    predicate: (item) => !item.isPromoted &&
      (includeTimelineContext || (item.handle || "").toLowerCase() === target),
    readPage: async (pageArgs) => {
      const state = await prepareProfileTimeline(ctx, { reloadOnTimeout: firstPage });
      firstPage = false;
      if (state.ok === false) return state;
      const page = await ctx.runSiteBrowserTool("x-com", "extract_timeline", pageArgs);
      const checkedAt = new Date().toISOString();
      return { ...page, items: (page.items || []).map((item) => ({ ...item, checkedAt })) };
    },
  });
  const items = result.items || [];

  return {
    ...result,
    username,
    itemCount: items.length,
    totalVisible: (result.items || []).length,
    items,
    requestedUrl: url,
  };
}

export async function getUserPosts(ctx, args = {}) {
  return collectProfilePosts(ctx, args, false);
}

export async function extractProfilePostsReport(ctx, args = {}) {
  const result = await collectProfilePosts(ctx, args, true);
  const rows = result.items.map((item, index) => ({
    post_index: index + 1,
    post_id: item.id,
    post_url: item.url,
    post_text: item.text || "not displayed",
    author_handle: item.handle,
    author_display_name: item.displayName,
    date_time_displayed: item.timeText || "not displayed",
    ...Object.fromEntries(["reply", "repost", "like", "view", "quote", "bookmark"].map((name) => [
      `${name}_count`, item.metrics[name] || "not displayed",
    ])),
    image_urls: item.images.map((image) => image.url).join("; ") || "not displayed",
    video_poster_urls: item.videos.map((video) => video.poster).filter(Boolean).join("; ") || "not displayed",
    source_url: result.requestedUrl,
    checked_at: item.checkedAt,
    access_status: "ok",
    needs_review: Boolean(item.isTranslated || item.isTruncated),
  }));
  return {
    ok: result.ok,
    source_url: result.requestedUrl,
    checked_at: new Date().toISOString(),
    access_status: result.ok === false ? result.reason : "ok",
    posts_recorded: rows.length,
    goal_reached: result.stopReason === "max_items",
    stop_reason: result.ok === false ? "blocked" : result.stopReason,
    scroll_rounds: result.scrollRounds || 0,
    rows,
  };
}

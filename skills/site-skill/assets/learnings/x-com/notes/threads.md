# X Threads

Last verified: 2026-11-10

## What a thread is

An X thread is a series of posts by the same author, chained as self-replies:

- The first post is the root (often marked `(1/7)`, `🧵`, or "A thread").
- Each following post is a reply to the previous post by the same author.
- Each post has its own permalink: `https://x.com/<user>/status/<id>`.
- Opening any post in the thread shows the conversation page; the root may be above or below the opened post.

## Page structure

- Conversation timeline: `[aria-label="Timeline: Conversation"]`
- Thread posts: `article[data-testid="tweet"]` within that timeline (logged-in layout)
- Guest layout: plain `article` elements inside the conversation timeline, no `data-testid`
- Post text: `[data-testid="tweetText"]` (logged-in) or the longest `div[dir="auto"]` (guest)
- Author: `[data-testid="User-Name"]` (logged-in) or profile anchors (guest)
- Timestamp: `time[datetime]`
- Post URL: `a[href*="/status/"]` ending in `/status/<id>`
- Media: `[data-testid="tweetPhoto"] img` or plain `img` excluding `/profile_images/`

## Detecting thread posts

1. Find the root post by matching the current URL's status id; otherwise use the first article.
2. Keep posts whose handle equals the root author's handle.
3. Keep posts whose numeric status id is greater than or equal to the root id; this filters older same-author posts that X appends at the bottom of the conversation.
4. If timestamps exist, also keep posts published at or after the root's timestamp (small tolerance for same-second posts).
5. Sort by timestamp (or numeric id) ascending.
6. If the count is greater than 1, it is a thread; `declaredParts` parses explicit `(n/m)` numbering from the text when present.

## Tools

- `get_thread` (Node): `{ url, maxPosts? }` → opens the thread root and returns:
  - `rootPostId`, `author {name, handle, profileUrl}`
  - `postCount`, `isThread`, `declaredParts {part, total} | null`
  - `posts[]`: `{ id, url, displayName, handle, publishedAt, timeText, text, textLength, images, metrics }`
- `extract_thread` (browser): parse the currently open conversation page.

## Limits

- X virtualizes conversation pages; usually the whole thread is rendered when opening the root, but very long threads may need scrolling.
- `get_thread` accepts any post in the thread, not only the root: X's conversation page shows the whole thread context, and the tool takes the first post in the conversation timeline as the inferred root and returns it as `rootPostId` (`requestedPostId` reports the input).
- Threads can contain media-only posts; `text` may be empty while `images` is not.
- Do not confuse quote posts or replies from other users with the thread; only the root author's consecutive self-replies are included.

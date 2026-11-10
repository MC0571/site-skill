# X Posts and Articles

Last verified: 2026-11-10

## Post detail pages

URL patterns:

- `https://x.com/<user>/status/<id>`
- `https://twitter.com/<user>/status/<id>`
- Media tab: `https://x.com/<user>/status/<id>/photo/<n>`

Page structure:

- Main post: the first `article[data-testid="tweet"]` on the page
- Replies and recommended posts also use `article[data-testid="tweet"]`; do not assume the first element is unique without checking the URL
- Post text: `[data-testid="tweetText"]`
- Author block: `[data-testid="User-Name"]`
  - Display name: first `a[href^="/"]`
  - Handle: the anchor whose text starts with `@`
- Post URL: `a[href*="/status/"]` ending in `/status/<id>`
- Timestamp: `time[datetime]`, with visible text in `time`
- Images: `[data-testid="tweetPhoto"] img`
- Videos: `video` elements (check `src` and `poster`)
- Link card: `[data-testid="card.wrapper"]`
- Metrics: `[data-testid="reply"]`, `[data-testid="retweet"]`, `[data-testid="like"]`, `[data-testid="bookmark"]`
- Views: `a[href$="/analytics"]` (when available)

Post-detail tool:

- `get_post` (Node): `{ url }` → opens the post and returns:
  - `id`, `canonicalUrl`, `author {name, handle, profileUrl}`, `publishedAt`, `timeText`
  - `text`, `textLength`, `isTruncated`
  - `images`, `videos`, `cards`
  - `metrics {reply, repost, like, bookmark, views}`
- `extract_post_detail` (browser): parse the currently open post page.

## X Articles (long-form posts)

URL patterns:

- Article: `https://x.com/<user>/article/<id>`
- Canonical short form: `https://x.com/i/article/<id>` (redirects to the user path)
- A normal post can share an article; on the post page the article link is `a[href*="/article/<id>"]` and does not include `/media/`.

Page structure:

- Read view: `article[data-testid="twitterArticleReadView"]`
- Article title: `[data-testid="twitter-article-title"]`
- Rich text root: `[data-testid="longformRichTextComponent"]`
  - The actual block list is the first child `div` of this root.
  - Headings: `h1`–`h6` (often `h2.longform-header-two` wrapped in a `div`).
  - Paragraphs: `div.longform-unstyled`.
  - Lists: `ul` / `ol` with `li` children.
  - Code: `[data-testid="markdown-code-block"]`.
  - Embedded content: `section` blocks.
- Cover and inline images: `[data-testid="tweetPhoto"] img` inside the read view.
- Publish time: `time[datetime]` inside the read view.
- Author: article URL's `/<user>/` segment; the read view has `a[href="/<user>"]` with the display name.
- Paywall: `[data-testid="paywallScrim"]` exists but is usually `opacity: 0` for public articles; treat `paywalled: true` only when it is visible and has text.

Article tool:

- `get_article` (Node): `{ url }` → accepts an article URL or a post URL that links to an article; returns:
  - `articleId`, `title`, `author {name, handle, profileUrl}`, `publishedAt`
  - `blocks`: `heading` / `paragraph` / `list` / `code` / `quote` / `embed`
  - `contentText`, `charCount`, `images`, `imageCount`, `paywalled`
- `extract_article` (browser): parse the currently open article page.

## Login state

Both post and article pages redirect logged-out profiles to:

- `https://x.com/i/jf/onboarding/web?redirect_after_login=...&mode=login`
- or `/i/flow/login`, `/login`

Detection is the same as search: missing page containers plus "Sign in" / "登录" text. Return:

```json
{
  "ok": false,
  "reason": "login_required",
  "url": "...",
  "message": "当前浏览器 Profile 未登录 X；请切换到已登录的 Profile，或在 ego lite 中手动登录后重试。"
}
```

## Notes and limits

- X pages are client-rendered; wait 1–2 seconds after navigation for the read view or post card.
- Articles can be edited or deleted; keep the source URL in results.
- Long posts may be truncated with "Show more"; the post-detail tool tries to click it once before extracting, and still returns `isTruncated: true` if the text remains collapsed.
- Use only public or authorized content; do not store personal data or subscriber-only article content.

## Guest (logged-out) layout

Public posts and Articles can be read without login, but X serves a different DOM with no `data-testid` attributes.

Post page:

- Main post: first `article` element (no `data-testid`)
- Text: the longest `div[dir="auto"]` with `whitespace-pre-wrap` styling
- Author: anchors `a[href="/<username>"]`; display name is the anchor text that does not start with `@`, handle is the `@...` anchor
- Media: `article img` filtered to exclude `/profile_images/`
- Counts: `.x-animated-count-visual` spans, in reply / repost / like / bookmark order

Article page:

- Title: `[data-article-part="title"]`
- Byline: `[data-article-part="byline"]`
- Cover: `[data-article-part="cover"] img`
- Body: `[data-article-part="body"]`; actual block list is `div.x-article-body` with nested `div.contents` wrappers
- Headings are usually `h3` in guest layout, `h2` in logged-in layout
- Images exclude `/profile_images/`

Tools handle both layouts automatically and report `layout: "logged_in" | "guest"`.

# X Timeline Navigation

Last verified: 2026-11-10

## Scrolling timeline
- Timeline is inside `[data-testid="primaryColumn"]`
- Posts load lazily; extract each rendered batch before scrolling again
- Virtual list: DOM only renders visible articles + buffer
- Deduplicate by status ID while preserving first-seen display order. Pinned posts and grouped self-thread root/reply pairs mean IDs and timestamps need not descend; never sort them or discard a card for having a newer ID.
- Profile collection uses small overlapping scrolls and supports up to 120 rounds (default 60). A fixed 20-round budget can stop before 50 posts.

## Extracting posts
- Query `[data-testid="tweet"]` for post elements
- Each post has `[data-testid="tweetText"]` for content
- Author info at `[data-testid="User-Name"]`
- Always extract in one pass via browser-side closure
- Use the card's own timestamp permalink, not a quoted post's status link.
- Preserve paragraph breaks in `text`; normalize horizontal whitespace only. `links` retains mention and other inline link labels and URLs separately.

## Original language and long posts

- X can automatically translate a card to the browser UI language. `button[aria-label="显示原文"]` / `button[aria-label="Show original"]` means the displayed text is translated.
- Before extracting a profile batch, activate the original-text toggle, allow the card to re-render, then activate its `Show more` / `显示更多` button or `[data-testid="tweet-text-show-more-link"]` and allow that render to finish.
- Limit these actions to the card's display controls. Do not open post details, menus, replies or engagement controls to fill missing fields.
- `get_user_posts` and `extract_profile_posts_report` prepare every batch. The pure `extract_timeline` tool only reads; `isTranslated` and `isTruncated` indicate remaining controls. Report rows with either flag require review rather than claiming complete original text.

## Visible counts and media

- `metrics` contains `reply`, `repost`, `like`, `view`, `quote`, `bookmark` as visible strings, preserving formats such as `1,317` and `41万`. Never replace a compact visible count with the numeric value in its ARIA label.
- Missing counts are empty strings in extraction and `not displayed` in report rows. A missing or icon-only control is not a visible zero. Do not infer quotes from reposts or inspect hidden menus.
- `images` contains attached still images, excluding avatars, quoted cards and anything inside `videoComponent` / `videoPlayer`.
- `videos[].poster` contains the rendered video poster/thumbnail, including a video container's cover image before its `<video>` player mounts. Nested video containers represent one video, not duplicate posters. A `blob:` playback URL is local to that session and is returned as an empty `url`; do not export it as a reusable media link. Poster URLs can expire; retain the post URL as the source.

## Pinned posts

- Identify a pin by `[data-testid="socialContext"]` text (`Pinned` / `置顶`), not by its position. Keep it unless the user asks to exclude it.

## Readiness and access

- Profile collection waits up to 20 seconds for rendered cards or an explicit `[data-testid="emptyState"]`. On initial content timeout it reloads the same page once and waits again; further failure returns `blocked:content_not_loaded`.
- Login walls return `login_required`; CAPTCHA/robot checks `blocked:captcha`; consent screens `blocked:consent`; rate limits `rate_limited`. Visible blocking dialogs take precedence even when cards remain behind them. Words inside post bodies are not evidence of a block.
- Stop on a block and hand control to the user when needed. Do not solve challenges or accept consent automatically. Rows collected before a block retain their individual `checked_at`; the run's `access_status` records the block.

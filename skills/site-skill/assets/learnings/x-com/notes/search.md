# X Search

Last verified: 2026-11-10

## URL patterns

- Top results: `https://x.com/search?q=<encoded-query>&src=typed_query`
- Latest results: `https://x.com/search?q=<encoded-query>&src=typed_query&f=live`
- People: `https://x.com/search?q=<encoded-query>&f=user`
- Media: `https://x.com/search?q=<encoded-query>&f=media`
- Lists: `https://x.com/search?q=<encoded-query>&f=lists`

`q` must be URL-encoded. `src=typed_query` records that the query came from typing; the search page works without it but keep it for consistency.

## Page structure

- Search input: `[data-testid="SearchBox_Search_Input"]`
- Main column: `[data-testid="primaryColumn"]`
- Result cell wrapper: `[data-testid="cellInnerDiv"]`
- Post card: `article[data-testid="tweet"]`
- Post text: `[data-testid="tweetText"]`
- Author block: `[data-testid="User-Name"]`
  - Display name: first `a[href^="/"]` in the author block
  - Handle: the anchor whose text starts with `@`
  - Post link and time: `a[href*="/status/"]` and `time[datetime]`
- Metrics:
  - Reply: `[data-testid="reply"]`
  - Repost: `[data-testid="retweet"]`
  - Like: `[data-testid="like"]`
  - Bookmark: `[data-testid="bookmark"]`
- Social context (e.g. "Liked by …"): `[data-testid="socialContext"]`

## Login state

X requires login for search in the tested environment.

- Logged-out profiles are redirected to:
  - `https://x.com/i/jf/onboarding/web?redirect_after_login=...&mode=login`
  - or `/i/flow/login`, `/login`
- On that page `[data-testid="primaryColumn"]` and `article[data-testid="tweet"]` are absent, and the body contains "使用手机继续", "使用 Google 继续", "Sign in" or "Log in".
- When detection matches, return:
  ```json
  {
    "ok": false,
    "reason": "login_required",
    "url": "https://x.com/i/jf/onboarding/web?...",
    "message": "当前浏览器 Profile 未登录 X；请切换到已登录的 Profile，或在 ego lite 中手动登录后重试。"
  }
  ```
- Do not attempt to log in or create an account automatically. Use a Profile that is already signed in, or ask the user to sign in in the ego lite window.

## Result list behavior

- Search results are a virtualized list. Only visible cells plus a small buffer exist in the DOM.
- Initial load typically renders 5–20 `article[data-testid="tweet"]` elements.
- Each `article[data-testid="tweet"]` may be a normal post, a promoted post, or a social-context card; `isPromoted` is a heuristic based on the card text.
- If the list is empty, check for "No results" text; `emptyState` reports it.
- Pagination is scroll-driven; the tool returns the currently visible batch only. To read more, scroll and call again, or extend the tool with a scroll loop.

## Tools

- `search_posts` (Node): navigate to the top or latest search URL and return the visible result list.
  - `query` — required keyword or phrase
  - `mode` — `top` (default) or `latest`
  - `maxItems` — bound to 1..100, default 20
- `extract_search_results` (browser): parse the current search page DOM only. Useful when the page is already open.
- `get_trends` (Node): read trending topics from `https://x.com/explore`.

## Explore trends

- URL: `https://x.com/explore`
- Trend card: `[data-testid="trend"]`
- Card text is two lines:
  - Topic title (e.g. "Trump Vows Support for Hegseth Amid Impeachment Push")
  - Context line (e.g. "Trending now · Other · 14K posts")
- Some cards are category-first: first line is "Sports · Trending", second line is the topic (e.g. "Josh Allen").
- Tool `get_trends` handles both shapes and returns `{ rank, topic, category, posts }`.
- Logged-out profiles redirect to the login onboarding page; return `login_required`.

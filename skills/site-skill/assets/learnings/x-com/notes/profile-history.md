# X Profile, History and Connection Pages

Last verified: 2026-11-10

## History pages

URL patterns:

- Bookmarks (all): `https://x.com/i/history`
- Bookmark folder: `https://x.com/i/history/bookmarks/<folder-id>`
- Likes: `https://x.com/i/history/likes`

Page structure:

- Tabs: `[role="tab"]` with text `Bookmarks` / `Likes` and `href` `/i/history`, `/i/history/likes`
- Post list: `[data-testid="primaryColumn"] article[data-testid="tweet"]`
- Empty state: `[data-testid="emptyState"]`
  - Bookmarks empty text: "Save posts for later"
  - Likes empty text: "Like some posts"
- Bookmark folders are shown as a horizontal list (`ScrollSnap-List`) and folder links use `/i/history/bookmarks/<folder-id>`.
- If a folder path redirects to `/i/history`, the folder is not available to the current account; report `folderUnavailable: true`.

Tools:

- `get_history` with `kind: "bookmarks" | "likes"`, optional `folderId`, optional `maxItems`.
- Uses `extract_timeline`.

## User profile pages

URL patterns:

- Profile: `https://x.com/<username>`
- Posts tab: same as profile
- Replies tab: `https://x.com/<username>/with_replies`
- Reposts: `https://x.com/<username>/reposts`
- Media: `https://x.com/<username>/media`
- Articles: `https://x.com/<username>/articles`

Profile header selectors:

- Name and handle: `[data-testid="UserName"]` (text like `astaxie @astaxie`)
- Bio: `[data-testid="UserDescription"]`
- Header items: `[data-testid="UserProfileHeader_Items"]`
  - Website: `[data-testid="UserUrl"]` (text + `a[href]`)
  - Location: `[data-testid="UserLocation"]` (may be absent)
  - Join date: `[data-testid="UserJoinDate"]`
- Counts: `[data-testid="UserProfileSchema-test"]` contains JSON-LD with `interactionStatistic`:
  - `Follows` → followers count
  - `Friends` → following count
  - `Tweets` → posts count
- Avatar: `[data-testid="Tweet-User-Avatar"] img`
- Verified: `[data-testid="icon-verified"]` inside the profile's `[data-testid="UserName"]`; ignore badges on timeline posts and recommended users.
- Tabs: `[role="tab"]`; `Posts` href `/<username>`, `Replies` `/with_replies`, `Reposts` `/reposts`, `Media` `/media`, `Articles` `/articles`.

Tool: `get_user_profile` → `extract_profile`.

## User posts and replies

- Posts list: `[data-testid="primaryColumn"] article[data-testid="tweet"]`
- Pinned post: `[data-testid="socialContext"]` contains "Pinned"
- Replies page (`/<username>/with_replies`) mixes parent context posts from other users with the profile user's replies.
- To extract only the user's replies, filter by the profile handle and use the preceding article as `replyContext` / `contextBefore`.

Tools:

- `get_user_posts` → `extract_timeline`, filtered to the profile handle.
- `get_user_replies` → `extract_timeline` on `/with_replies`, filtered to the profile handle.

## Followers / Following

URL patterns:

- Followers: `https://x.com/<username>/followers`
- Verified followers: `https://x.com/<username>/verified_followers`
- Followers you know: `https://x.com/<username>/followers_you_follow`
- Following: `https://x.com/<username>/following`

Page structure:

- Tab bar shows `Verified Followers`, `Followers`, `Following` with the corresponding hrefs.
- Actual user list: `[data-testid="primaryColumn"] [data-testid="UserCell"]`
  - Do **not** use global `[data-testid="UserCell"]`; the sidebar "Who to follow" also uses it.
- Each `UserCell` is a button containing:
  - display name link (text not starting with `@`)
  - handle link (text starts with `@`)
  - bio after the handle and optional `Follow` / `Following` label
  - avatar: `[data-testid^="UserAvatar-Container-"] img`
  - verified: `[data-testid="icon-verified"]`
  - follow button: `[data-testid$="-follow"]`
- Empty state: `[data-testid="emptyState"]` inside `primaryColumn`.
  - `followers_you_follow` often shows "doesn't have any followers you know yet" and no primary-column cells.

Tool: `get_user_connections` with `kind: "followers" | "verified_followers" | "you_know" | "following"` → `extract_user_cells`.

## Login state

History pages require login. Profile pages are publicly viewable, but some tabs and follower lists may require login or show login walls. Detection: URL `/i/jf/onboarding`, `/i/flow/login`, `/login`, or empty primary column with "Sign in"/"登录" text. Return `ok: false, reason: "login_required"`.

## Limits

- X timelines are virtualized; tools return the currently rendered batch. Scroll or paginate for more.
- Counts from profile JSON-LD are authoritative at page load; UI counts can differ slightly.
- Follower lists can have hundreds of entries; `maxItems` is capped at 100.

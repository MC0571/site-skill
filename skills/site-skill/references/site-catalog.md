# Site Catalog

本仓库当前包含的站点学习包。运行时以 `assets/learnings/<site-id>/manifest.json` 为准；本文件是给 Agent 和用户看的索引。

Last verified: 2026-11-10

| site-id | 站点 | 域名 | 主要工具 | 说明 |
| --- | --- | --- | --- | --- |
| `wechat-mp` | 微信公众号文章 | `mp.weixin.qq.com` | `extract_article` | 标准图文、图片分享型文章；提取标题、公众号、作者、发布时间、正文块和图片链接 |
| `x-com` | X (Twitter) | `x.com`、`twitter.com` | `get_trends`、`search_posts`、`get_post`、`get_thread`、`get_article`、`get_history`、`get_post_replies`、`get_user_posts`、`get_user_replies`、`get_user_connections`、`get_user_profile`、`get_timeline_posts`、`search_users` | 趋势、搜索、帖子详情、Thread、长文 Article、书签/喜欢、评论、用户资料、用户帖子/回复、关注列表；兼容已登录和访客布局 |

## 使用前

1. 将 `EGO_BROWSER_AGENT_WORKSPACE` 指向 `skills/site-skill/assets`。
2. 调用 `siteSkillsForUrl(url)` 检查匹配的站点包。
3. 调用 `learnContext(url)` 读取对应 notes 和工具签名。
4. 使用 `runSiteTool(siteId, toolName, args)` 或 `runSiteBrowserTool(siteId, toolName, args)`。

## 备注

- 列表类工具支持 `maxItems` 和 `maxScrolls`；返回 `totalLoaded` 与 `scrollRounds`。
- 书签、喜欢等历史数据属于当前登录账号，不能跨账号读取。
- 站点改版时更新对应 `assets/learnings/<site-id>/browser-tools/` 中的选择器，并更新 `Last verified`。

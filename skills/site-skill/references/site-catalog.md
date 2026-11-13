# Site Catalog

本仓库当前包含的站点学习包。运行时以 `assets/learnings/<site-id>/manifest.json` 为准；本文件是给 Agent 和用户看的索引。

Last verified: 2026-11-14

| site-id | 站点 | 域名 | 主要工具 | 说明 |
| --- | --- | --- | --- | --- |
| `wechat-mp` | 微信公众号文章 | `mp.weixin.qq.com` | `extract_article` | 标准图文、图片分享型文章；提取标题、公众号、作者、发布时间、正文块和图片链接 |
| `github-stars` | GitHub 我的星 | `github.com`、`api.github.com` | `get_stars`、`extract_stars`、`get_star_lists`、`get_list_repositories`、`get_repository_lists`、`get_stars_api`、`add_repository_to_lists`、`create_list`、`edit_list`、`get_star_lists_api`、`batch_classify_stars`、`merge_star_lists`、`cleanup_star_lists` | 三种 Stars 布局、REST 加星时间与节点 ID、浏览器列表写入；Token API 快照、批量归类、合并及清理见 [批量整理 notes](../assets/learnings/github-stars/notes/bulk-lists.md)，所有写工具要求 `confirm: true` |
| `x-com` | X (Twitter) | `x.com`、`twitter.com` | `get_trends`、`search_posts`、`get_post`、`get_thread`、`get_article`、`get_history`、`get_post_replies`、`get_user_posts`、`extract_profile_posts_report`、`get_user_replies`、`get_user_connections`、`get_user_profile`、`get_timeline_posts`、`search_users` | 趋势、搜索、帖子详情、Thread、长文 Article、书签/喜欢、评论、用户资料、用户帖子/回复、关注列表；Profile 报告数据保留原文段落、可见计数、展示顺序、视频海报和逐行来源 |

## 使用前

1. 将 `EGO_BROWSER_AGENT_WORKSPACE` 指向 `skills/site-skill/assets`。
2. 调用 `siteSkillsForUrl(url)` 检查匹配的站点包。
3. 调用 `learnContext(url)` 读取对应 notes 和工具签名。
4. 使用 `runSiteTool(siteId, toolName, args)` 或 `runSiteBrowserTool(siteId, toolName, args)`。

## 备注

- X 列表类工具支持 `maxItems` 和 `maxScrolls`；返回 `totalLoaded` 与 `scrollRounds`。
- GitHub Stars 的 `get_stars` 从默认 `/stars` 经侧栏 All repositories 进入完整列表，保留请求 URL 的 `q/language/sort/direction`；传入具体 repositories/topics 页则从其原有 `page` 开始沿 Next 读取至末页。`maxItems` 可选，须为正安全整数，省略读取全部；默认不含主题，显式 topics URL 可读主题。
- `get_stars` 按 `item.url` 去重，返回 `scope=all_pages`、`complete`、`pagesRead` 和 `stopReason=end|max_items|blocked`。`extract_stars` 保持 `scope=current_page`，`maxItems` 默认 100、范围 1–100。使用方式和验证范围见 [GitHub Stars notes](../assets/learnings/github-stars/notes/overview.md)。
- Profile Stars 沿真实 `after` 游标分页；列表详情从 `#user-list-repositories h2 a` 读取。`get_star_lists` 包含 DOM 中已折叠的卡片，排序使用独立的 `user_lists_sort/user_lists_direction`；`get_repository_lists` 只读仓库归属。
- 浏览器写工具 `add_repository_to_lists` 保留已有归属并一次追加全部目标；`create_list` 只创建列表；`edit_list` 保留省略的元信息。Token API 的 `batch_classify_stars` 默认 append，显式 replace 替换全部归属；合并重读验证后删除源列表，清理仅允许空列表或成员已被保留列表完全覆盖的列表。不取消星标或自动加星。
- `get_stars_api` 默认公开读取并返回精确 `starredAt` 与 GraphQL `nodeId`。鉴权 REST 和列表 GraphQL API 仅使用调用方预配的 `GITHUB_TOKEN`，不读取 gh、钥匙串或浏览器凭据；接口末页不保证全部私有资源可见。批量写不是事务，失败保留已验证进度并停止；先重读状态再恢复。
- 书签、喜欢等历史数据属于当前登录账号，不能跨账号读取。
- 站点改版时更新对应 `assets/learnings/<site-id>/browser-tools/` 中的选择器，并更新 `Last verified`。

# ego-browser 站点学习工作区

这个目录是 ego lite 的 **site learnings（站点学习）** 工作区，目录结构需要符合 ego-browser 的约定：

```
.ego-browser/
└── learnings/
    └── <site-id>/
        ├── manifest.json       # 站点匹配规则、工具声明
        ├── notes/*.md          # 给 Agent 阅读的站点知识
        ├── tools/*.js          # Node 侧工具（可用 ctx 操作浏览器）
        └── browser-tools/*.js  # 注入页面执行的 DOM 提取工具
```

## 使用方式

ego lite 自带运行时的默认 learnings 路径在当前版本可能解析不到，因此调用前需要让 `EGO_BROWSER_AGENT_WORKSPACE` 指向本目录。

推荐使用包装脚本（会把路径注入到 Node 脚本本身，不依赖 shell 环境变量是否被运行时继承）：

```bash
./.ego-browser/bin/ego-learn nodejs <<'EOF'
const task = await taskSpace("read article");
const article = await runSiteTool("wechat-mp", "extract_article", {
  url: "https://mp.weixin.qq.com/s/xxxx",
});
console.log(article.title, article.contentText);
await task.finish({ keep: [] });
EOF
```

如果直接使用 `ego-browser nodejs`，请在脚本开头示例：

```js
process.env.EGO_BROWSER_AGENT_WORKSPACE =
  process.env.EGO_BROWSER_AGENT_WORKSPACE || "<path-to-site-skill>/.ego-browser";
```

## 已包含的学习包

| site-id | 站点 | 工具 | 说明 |
| --- | --- | --- | --- |
| `wechat-mp` | 微信公众号文章 `mp.weixin.qq.com` | `extract_article` | 提取标题、公众号、作者、发布时间、正文块和图片链接 |
| `x-com` | X (Twitter) `x.com` | `get_history`、`get_post_replies`、`get_user_posts`、`get_user_replies`、`get_user_connections`、`get_user_profile`、`get_trends`、`search_posts`、`get_post`、`get_thread`、`get_article`、`get_timeline_posts`、`search_users` | 历史、评论、用户资料/帖子/回复/关注列表、趋势、搜索、帖子详情、Thread、长文 Article；兼容已登录与访客布局 |

列表类工具（`get_history`、`get_post_replies`、`get_user_posts`、`get_user_replies`、`get_user_connections`、`search_posts`、`get_timeline_posts`）都支持：

- `maxItems`：本次最多返回多少条
- `maxScrolls`：向下滚动加载的轮数，默认 5，最大 20

返回结果里会包含 `totalLoaded`（滚动过程中累计看到的数量）和 `scrollRounds`（实际滚动轮数）。

## 新增学习包

1. 复制 `learnings/wechat-mp/` 为 `learnings/<新站点>/`。
2. 修改 `manifest.json` 的 `id`（必须与目录名一致）、`name`、`domains`。
3. 写 `notes/*.md` 和 `tools` / `browser-tools`。
4. 用 `runSiteTool("<id>", "<tool>", {...})` 实测通过即可。

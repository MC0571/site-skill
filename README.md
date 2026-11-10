# site-skill

ego lite / ego-browser 的站点学习（site learnings）skill 与学习包仓库。

## 仓库结构

```text
site-skill/
├── skills/site-learning/   # 站点学习 meta-skill：探索、沉淀、校验、测试
└── .ego-browser/           # 站点学习工作区
    ├── README.md
    ├── bin/ego-learn       # 自动设置 EGO_BROWSER_AGENT_WORKSPACE 的包装器
    └── learnings/
        ├── wechat-mp/      # 微信公众号文章
        └── x-com/          # X (Twitter)
```

## 快速使用

推荐使用包装器；它会把工作区路径注入到 Node 脚本里，不依赖 shell 环境变量是否被 ego lite 运行时继承：

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

如果直接使用 `ego-browser nodejs`，请在每段脚本开头显式设置：

```js
process.env.EGO_BROWSER_AGENT_WORKSPACE =
  process.env.EGO_BROWSER_AGENT_WORKSPACE || "<absolute path to site-skill>/.ego-browser";
```

因为 ego lite 自带运行时不一定会继承 shell 的 `export`。

## ego-browser 主 SKILL 引导

默认的 `ego-browser` SKILL 不会主动提示 Agent 检查站点学习包。如果希望在普通浏览器任务中也自动使用本仓库的学习包，请参考 [patches/ego-browser-site-learnings.md](patches/ego-browser-site-learnings.md) 给用户级 `ego-browser` SKILL 副本打一个可选补丁。

## 说明

- 当前 ego lite 版本可能无法从默认位置发现自定义 `learnings/`，因此需要设置 `EGO_BROWSER_AGENT_WORKSPACE` 指向 `.ego-browser`。
- 学习包格式与工具说明见 [.ego-browser/README.md](.ego-browser/README.md)。
- Skill 的工作流说明见 [skills/site-learning/SKILL.md](skills/site-learning/SKILL.md)。

## License

MIT

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

从仓库根目录调用：

```bash
EGO_BROWSER_AGENT_WORKSPACE="$PWD/.ego-browser" ego-browser nodejs <<'EOF'
const task = await taskSpace("read article");
const article = await runSiteTool("wechat-mp", "extract_article", {
  url: "https://mp.weixin.qq.com/s/xxxx",
});
console.log(article.title, article.contentText);
await task.finish({ keep: [] });
EOF
```

或使用包装器：

```bash
./.ego-browser/bin/ego-learn nodejs <<'EOF'
const task = await taskSpace("read x");
const result = await runSiteTool("x-com", "search_posts", { query: "AI", maxItems: 20 });
console.log(result);
await task.finish({ keep: [] });
EOF
```

## 说明

- 当前 ego lite 版本可能无法从默认位置发现自定义 `learnings/`，因此需要设置 `EGO_BROWSER_AGENT_WORKSPACE` 指向 `.ego-browser`。
- 学习包格式与工具说明见 [.ego-browser/README.md](.ego-browser/README.md)。
- Skill 的工作流说明见 [skills/site-learning/SKILL.md](skills/site-learning/SKILL.md)。

## License

MIT

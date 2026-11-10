# site-skill

ego-browser / ego lite 的**站点知识库**：包含 `site-skill` skill 和已沉淀的站点学习包。

## 把这段交给你的 Agent

```text
请读取 https://github.com/MC0571/site-skill 中的 skills/site-skill/SKILL.md
和 references/site-catalog.md，并按 setup.md 完成配置。

之后每次使用 ego-browser 处理网页前：
1. 先调用 siteSkillsForUrl 和 learnContext 检查已有站点知识；
2. 有匹配的站点包就直接用 runSiteTool / runSiteBrowserTool；
3. 没有就按 SKILL.md 学习并沉淀新的站点包。
```

完整的安装、`EGO_BROWSER_AGENT_WORKSPACE` 配置、ego-browser 主 SKILL 补丁和排错见 [setup.md](setup.md)。

## 仓库结构

```text
site-skill/
├── skills/site-skill/
│   ├── SKILL.md
│   ├── references/
│   │   └── site-catalog.md    # 已收录站点和工具索引
│   ├── assets/
│   │   ├── learnings/         # 站点学习包（运行时资产）
│   │   └── templates/         # 新建站点包模板
│   ├── bin/ego-learn          # 注入站点工作区的 ego-browser 包装器
│   └── scripts/               # 新建 / 校验脚本
├── patches/
│   └── ego-browser-site-learnings.md
├── setup.md
├── NOTICE.md
└── LICENSE
```

## License

MIT

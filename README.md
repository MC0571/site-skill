# site-skill

**让 Agent 记住每一个网站。**

`site-skill` 是 ego-browser / ego lite 的站点知识库：把一次性的网页探索，沉淀为跨会话可复用的站点知识包。Agent 第一次访问网站时学习页面结构、选择器、URL 模式和提取工具；之后的会话直接调用，不再反复摸索。

## 为什么值得

- **一次探索，长期复用**：站点知识写成标准的 `manifest.json` + notes + tools，后续任务直接调用。
- **跨会话持久化**：不依赖聊天记录和用户临时 prompt，安装一次即可被 Agent 持续加载。
- **可验证、可维护**：内置校验脚本和 `Last verified` 机制，站点改版时知道该更新哪里。
- **开箱即用**：已包含微信公众号文章、X (Twitter)、GitHub Stars 三套实战学习包。
- **可扩展**：新增站点只需按模板生成 pack，再交给 `site-skill` 的工作流。

## 已包含的站点能力

- **微信公众号文章**：标准图文、图片分享型文章，提取标题、公众号、作者、发布时间、正文和图片。
- **GitHub 我的星**：读取现代 Stars、Profile、列表详情及仓库归属，REST 返回精确 `starredAt` 和 `nodeId`；保留浏览器追加、创建、编辑列表工具。新增 Token API 全量列表快照、批量归类、合并与覆盖校验后清理，所有写工具要求 `confirm: true`。批量操作、失败恢复与验收边界见 [bulk-lists.md](skills/site-skill/assets/learnings/github-stars/notes/bulk-lists.md)。`extract_stars` 保持只读单页提取。
- **X (Twitter)**：趋势、搜索、帖子详情、Thread、长文 Article、书签/喜欢、评论、用户资料、用户帖子/回复、关注列表；兼容已登录和访客布局。

## 安装

```bash
npx skills add MC0571/site-skill
```

然后按 [setup.md](setup.md) 完成首次配置，包括：

- `EGO_BROWSER_AGENT_WORKSPACE` 指向 skill 的 `assets/` 目录
- 应用 `ego-browser` 主 SKILL 的站点学习引导补丁
- 验证站点包被发现

配置一次后，后续每个会话由安装的 `site-skill` 和 `ego-browser` 主 SKILL 持久生效，不需要再粘贴 prompt。

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
│   └── scripts/               # 新建、校验、安装补丁脚本
├── patches/
│   └── ego-browser-site-learnings.md
├── setup.md
├── NOTICE.md
└── LICENSE
```

## 开发验证

需要 Node.js 22 或更高版本。在仓库根目录运行：

```bash
npm ci
npm test
npm run validate
```

测试使用隔离的 HTML、工具上下文及安装目录，不访问真实账号。

## License

MIT

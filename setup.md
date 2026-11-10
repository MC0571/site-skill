# Setup

本文说明如何安装 `site-skill` skill、配置站点学习工作区、应用 `ego-browser` 主 SKILL 补丁，以及验证是否可用。

## 1. 前置条件

- 已安装 ego lite，并且 `ego-browser` 命令可用
- 已安装一个支持 Skill 的 Agent（Claude Code、Codex、DSH、Cursor 等）
- Node.js 22 或更高版本

检查：

```bash
ego-browser --version
node --version
```

## 2. 安装 skill

### 方式 A：通过 skills 安装器

如果当前环境的 Skill 安装器支持 GitHub 仓库：

```bash
npx skills add MC0571/site-skill
```

本仓库的 skill 位于 `skills/site-skill/`，安装器会把它放进对应 Agent 的 skill 目录。

### 方式 B：手动复制

```bash
git clone https://github.com/MC0571/site-skill.git
mkdir -p ~/.agents/skills
cp -R site-skill/skills/site-skill ~/.agents/skills/site-skill
```

不同 Agent 的 skill 目录可能不同，例如：

- DSH：`~/.dsh/skills/`
- Claude Code：`~/.claude/skills/`
- Codex：`~/.agents/skills/`

## 3. 配置站点学习工作区

站点学习包的运行时目录是 skill 目录下的 `assets/`：

```text
<skill-dir>/assets/learnings/<site-id>/
```

例如手动安装后：

```text
~/.agents/skills/site-skill/assets/learnings/
```

### 推荐方式：使用 ego-learn 包装器

`skills/site-skill/bin/ego-learn` 会自动把工作区路径注入到 Node 脚本里，不依赖 shell 环境变量：

```bash
./skills/site-skill/bin/ego-learn nodejs <<'EOF'
const task = await taskSpace("test site skill");
const result = await runSiteTool("wechat-mp", "extract_article", {
  url: "https://mp.weixin.qq.com/s/xxxx",
});
console.log(result);
await task.finish({ keep: [] });
EOF
```

### 直接使用 ego-browser 时

ego lite 的内嵌运行时不一定继承 shell 环境变量，因此必须在脚本开头显式设置：

```js
process.env.EGO_BROWSER_AGENT_WORKSPACE =
  process.env.EGO_BROWSER_AGENT_WORKSPACE ||
  "<absolute path to skills/site-skill>/assets";
```

如果从仓库直接运行：

```js
process.env.EGO_BROWSER_AGENT_WORKSPACE =
  process.env.EGO_BROWSER_AGENT_WORKSPACE ||
  "/absolute/path/to/site-skill/skills/site-skill/assets";
```

> `EGO_BROWSER_AGENT_WORKSPACE` 指向的目录必须直接包含 `learnings/`。

## 4. 应用 ego-browser 主 SKILL 补丁

默认的 `ego-browser` SKILL 不会提示 Agent 检查站点知识包。必须补上这段引导，否则即使站点包已经配置好，Agent 也可能不会主动使用。

### macOS / Linux 自动应用

在仓库根目录执行：

```bash
node skills/site-skill/scripts/apply-ego-browser-patch.mjs
```

脚本会：

1. 创建用户级 `ego-browser` skill 副本：`~/.local/share/ego/ego-skills-local`
2. 在 `SKILL.md` 中插入 `## Site learnings` 段落
3. 把 `~/.local/share/ego/ego-skills` 指向该副本

它不会修改 `/Applications/ego lite.app` 里的 app bundle。

脚本完成后再重新加载 Agent，或重启 Agent 会话。

### 手动应用

如果脚本不支持你的平台，按 [patches/ego-browser-site-learnings.md](patches/ego-browser-site-learnings.md) 中的手动步骤操作。补丁只修改用户级 SKILL 副本，不修改 app bundle。

## 5. 验证

### 检查工作区路径

```bash
./skills/site-skill/bin/ego-learn nodejs -e \
  'console.log(process.env.EGO_BROWSER_AGENT_WORKSPACE)'
```

应该输出 `<skill-dir>/assets`。

### 检查站点包发现

```bash
./skills/site-skill/bin/ego-learn nodejs -e \
  'console.log((await siteSkillsForUrl("https://mp.weixin.qq.com/s/xxxx")).map(s => s.id))'
```

应该输出：

```json
["wechat-mp"]
```

再检查 X：

```bash
./skills/site-skill/bin/ego-learn nodejs -e \
  'console.log((await siteSkillsForUrl("https://x.com/home")).map(s => s.id))'
```

应该输出：

```json
["x-com"]
```

### 检查 notes 加载

```js
const context = await learnContext("https://mp.weixin.qq.com/s/xxxx");
console.log(context.knowledge.map(item => item.fileName));
```

## 6. 常见问题

### `siteSkillsForUrl()` 返回 `[]`

按顺序检查：

1. `process.env.EGO_BROWSER_AGENT_WORKSPACE` 是否指向 `<skill-dir>/assets`
2. 该目录下是否存在 `learnings/wechat-mp/manifest.json`
3. `manifest.json` 的 `domains` 是否匹配目标域名
4. ego lite 是否正在运行

### shell 里 `export` 后仍找不到

ego lite 的内嵌运行时可能不会继承 shell 环境。请在 `ego-browser nodejs` 的脚本内部设置 `process.env.EGO_BROWSER_AGENT_WORKSPACE`，或使用 `ego-learn` 包装器。

### ego lite 升级后失效

升级可能重置用户级 ego-browser skill 或 `~/.local/share/ego/ego-skills` 链接。重新运行安装步骤，并重新应用 [patches/ego-browser-site-learnings.md](patches/ego-browser-site-learnings.md)。

### Agent 不主动使用站点包

确认：

1. Agent 已加载 `site-skill` skill
2. `ego-browser` 主 SKILL 已应用补丁
3. Agent 的任务描述中包含明确站点或 URL

## 7. 更新

```bash
git pull
npx skills add MC0571/site-skill
```

手动安装时重新复制 `skills/site-skill/`，然后重新应用补丁。升级后运行一次本文的“验证”步骤。

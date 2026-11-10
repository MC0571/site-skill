# ego-browser Site Learnings Patch

这个补丁让用户级 `ego-browser` SKILL 在开始浏览器任务前主动检查站点学习包。

## 为什么要打这个补丁

`ego-browser` 自带 SKILL 只说明如何运行 `ego-browser skill`，不会提示 Agent 调用：

- `siteSkillsForUrl(url)`
- `learnContext(url)`
- `runSiteTool(siteId, toolName, args)`

如果不补这段引导，即使学习包已经安装并被 `EGO_BROWSER_AGENT_WORKSPACE` 指向，Agent 也可能不会主动使用它们。

## 修改位置

不要修改 `/Applications/ego lite.app/...` 里的 app bundle。请修改用户级副本：

```text
macOS:
  ~/.local/share/ego/ego-skills-local/SKILL.md
  或你的 Agent skill 目录：~/.agents/skills/ego-browser/SKILL.md
```

如果还没有用户级副本，可以先复制：

```bash
mkdir -p ~/.local/share/ego
cp -R "$HOME/.local/share/ego/active_version_dir/Resources/ego-skills/ego-browser" \
      "$HOME/.local/share/ego/ego-skills-local"
```

然后把 `~/.local/share/ego/ego-skills` 指向这个副本：

```bash
ln -sfn "$HOME/.local/share/ego/ego-skills-local" "$HOME/.local/share/ego/ego-skills"
```

## 插入内容

在 `SKILL.md` 的 `# ego-browser` 标题之后插入以下段落：

````markdown
## Site learnings (check before exploring)

ego-browser can load reusable **site learning packs** before touching a page. A pack contains site-specific notes plus read-only tools, stored under `learnings/<site-id>/` in the workspace directory.

Before exploring a site for a browser task:

1. Make sure the workspace is available. Set it inside the Node script, because the bundled runtime may not inherit shell env vars:

   ```js
   process.env.EGO_BROWSER_AGENT_WORKSPACE =
     process.env.EGO_BROWSER_AGENT_WORKSPACE ||
     `${process.env.HOME}/.local/share/ego-site-learning`;
   ```

   如果使用仓库本身的 `.ego-browser`，把它设为：

   ```js
   process.env.EGO_BROWSER_AGENT_WORKSPACE =
     process.env.EGO_BROWSER_AGENT_WORKSPACE ||
     "/absolute/path/to/site-skill/.ego-browser";
   ```

2. Check whether a matching pack exists for the target URL:

   ```js
   const matches = await siteSkillsForUrl(url);
   const learned = await learnContext(url);
   ```

3. If `matches.length > 0`, use the learned tools instead of rediscovering selectors:

   ```js
   const result = await runSiteTool("<site-id>", "<tool-name>", { /* args */ });
   ```

4. If no pack matches and the site will be reused, load the `site-learning` skill and follow its workflow to create one. Do not create a pack for a one-off page.

5. If `siteSkillsForUrl()` returns an empty list for a site you know has a pack, first verify that `EGO_BROWSER_AGENT_WORKSPACE` points to the directory containing `learnings/`. Do not assume no packs exist.

Site learning tools are read-only by default. Prefer them over ad-hoc DOM exploration when a pack exists.
````

## 一次性插入脚本

```bash
SKILL_FILE="$HOME/.local/share/ego/ego-skills-local/SKILL.md"
python3 - "$SKILL_FILE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
if "## Site learnings" in text:
    print("already patched")
    raise SystemExit(0)

section = '''## Site learnings (check before exploring)

ego-browser can load reusable **site learning packs** before touching a page. A pack contains site-specific notes plus read-only tools, stored under `learnings/<site-id>/` in the workspace directory.

Before exploring a site for a browser task:

1. Set `process.env.EGO_BROWSER_AGENT_WORKSPACE` inside the Node script (not just shell export).
2. Call `siteSkillsForUrl(url)` and `learnContext(url)`.
3. If a matching pack exists, use `runSiteTool(siteId, toolName, args)` instead of rediscovering selectors.
4. If no pack matches and the site will be reused, load the `site-learning` skill and create one.
5. If a known pack is not found, verify `EGO_BROWSER_AGENT_WORKSPACE` points to the directory containing `learnings/`.

Site learning tools are read-only by default.
'''

marker = "# ego-browser\n"
if marker not in text:
    raise SystemExit("cannot find '# ego-browser' heading")
text = text.replace(marker, marker + "\n" + section + "\n", 1)
path.write_text(text, encoding="utf-8")
print("patched:", path)
PY
```

## 验证

```bash
ego-browser nodejs -e 'console.log(process.env.EGO_BROWSER_AGENT_WORKSPACE)'
```

然后在 Agent 中加载 `ego-browser` skill，确认它能看到 `## Site learnings` 段落。

## 注意

- ego lite 升级后可能重新生成 `~/.local/share/ego/ego-skills` 软链接，需要重新应用本补丁。
- 本补丁只修改用户级 SKILL 副本，不修改已签名的 app bundle。

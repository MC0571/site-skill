# 学习包格式（Learning Pack Format）

一个站点学习包是一个目录，必须放在 `EGO_BROWSER_AGENT_WORKSPACE` 指向的工作区的 `learnings/` 下。

## 目录结构

```text
<workspace>/
└── learnings/
    └── <site-id>/
        ├── manifest.json
        ├── notes/
        │   └── overview.md
        ├── tools/
        │   └── <node-tool>.js
        └── browser-tools/
            └── <browser-tool>.js
```

- `<site-id>` 只能使用小写字母、数字和连字符，必须与 `manifest.json` 的 `id` 完全一致。
- `notes` 只允许 `notes/*.md`，且文件必须存在。
- Node 工具只允许 `tools/*.js`。
- 浏览器工具只允许 `browser-tools/*.js`。

## manifest.json

```json
{
  "id": "example",
  "name": "Example Site",
  "domains": ["example.com", "*.example.com"],
  "notes": ["notes/overview.md"],
  "nodeTools": {
    "open_and_extract": {
      "description": "打开页面并提取主要内容。",
      "path": "tools/open-and-extract.js",
      "callable": "openAndExtract",
      "args": {
        "url": {
          "type": "string",
          "required": true,
          "description": "要打开的页面 URL。"
        },
        "maxItems": {
          "type": "integer",
          "required": false,
          "description": "最多返回多少条，默认 50，最大 100。"
        }
      },
      "returns": {
        "type": "object",
        "description": "包含 ok、url、title 和 items 的对象。"
      }
    }
  },
  "browserTools": {
    "extract_page": {
      "description": "从当前页面提取标题和条目。",
      "path": "browser-tools/extract-page.js",
      "args": {
        "maxItems": {
          "type": "integer",
          "required": false,
          "description": "最多返回多少条，默认 50。"
        }
      },
      "returns": {
        "type": "object",
        "description": "包含 ok、url、title 和 items 的对象。"
      }
    }
  }
}
```

### 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 站点标识，必须等于目录名 |
| `name` | 是 | 展示名称 |
| `domains` | 是 | 域名匹配列表，支持 `*.example.com` |
| `notes` | 否 | 笔记文件列表，形如 `notes/overview.md` |
| `nodeTools` | 否 | Node 侧工具映射 |
| `browserTools` | 否 | 页内工具映射 |

### 参数 schema

每个参数必须有：

- `type`：`string`、`number`、`integer`、`boolean`、`array`、`object` 之一
- `required`：布尔值
- `description`：非空字符串

`returns` 必须有 `type` 和 `description`，不能有 `required`。

## 笔记格式

`notes/overview.md` 至少包含：

```markdown
# <站点名称>

Last verified: YYYY-MM-DD

## 站点地图

- 首页：...
- 列表页：...
- 详情页：...

## URL 模式

- 列表：`/list?page=<n>`
- 详情：`/item/<id>`

## 稳定选择器

| 字段 | 选择器 | 说明 |
| --- | --- | --- |
| 标题 | `#title` | ... |
| 正文 | `#content` | ... |

## 页面状态

- 正常：...
- 空：...
- 登录/验证：...

## 工具

- `open_and_extract`：...
```

要求：

- `Last verified` 使用 `YYYY-MM-DD`。
- 不要写某个具体任务的标题、用户名或搜索结果。
- 不要写快照引用或像素坐标。

## Node 工具格式

```js
export async function openAndExtract(ctx, args = {}) {
  const url = String(args.url || "").trim();
  if (!url) throw new Error("url is required");

  await ctx.openOrReuseTab(url, { wait: true });
  await ctx.waitForLoad();

  return ctx.runSiteBrowserTool("example", "extract_page", {
    maxItems: args.maxItems,
  });
}
```

要求：

- 文件名和 `path` 一致。
- 导出函数名和 `callable` 一致。
- 只做导航、参数校验和调用浏览器工具。
- 返回 JSON 可序列化的数据。

## 浏览器工具格式

```js
async function (args) {
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
  const root = document.querySelector("#content");
  if (!root) return { ok: false, reason: "content_not_found", url: location.href };

  return {
    ok: true,
    url: location.href,
    title: clean(document.title),
    items: [...root.querySelectorAll("[data-item]")].slice(0, args.maxItems || 50).map((el) => ({
      text: clean(el.innerText),
      href: el.querySelector("a[href]")?.href || "",
    })),
  };
}
```

要求：

- 必须是 `async function (args) { ... }` 表达式（不是 `export`，不能依赖外部变量）。
- 只读取当前页面 DOM，不能导航。
- 所有返回值 JSON 可序列化。
- 找不到容器时返回 `{ ok: false, reason: "..." }`，不要抛错。

## 校验规则

`validate-site-learning.mjs` 会检查：

- `manifest.json` 可解析且 `id` 与目录一致
- `name` 非空，`domains` 合法且非空
- `notes`、`tools`、`browser-tools` 文件存在
- Node 工具可以 import，`callable` 是函数
- 浏览器工具可以解析为函数表达式
- 文件里没有临时快照引用或明显的敏感信息

## 命名建议

| 类型 | 规则 | 示例 |
| --- | --- | --- |
| site id | 小写 + 连字符 | `wechat-mp`, `x-com`, `hacker-news` |
| 工具名 | snake_case | `extract_article`, `search_repos` |
| Node 导出 | camelCase | `extractArticle`, `searchRepos` |
| 笔记 | 全小写 | `overview.md`, `timeline.md` |

# 探索手册（Exploration Playbook）

这份手册给出用 `ego-browser` 探索站点、收集结构信息的常用命令。目标是产出**稳定、可复用**的站点地图，而不是抓一次数据。

## 1. 建立探索任务

```js
const task = await taskSpace("explore example.com");
const page = task.page("p1");
await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 45_000 });
console.log({ url: await page.url(), title: await page.title() });
console.log(await page.snapshot({ scope: "full_page" }));
```

如果页面很长，`full_page` 快照会提示下方还有内容；必要时滚动后再取一次。进入 iframe 时，用父快照中 iframe 节点的 `ref` 做 subtree。

## 2. 页面结构清单

复制下面的脚本到 `ego-browser nodejs` 里执行，输出一份紧凑的 DOM 地图：

```js
const inventory = await page.evaluate(() => {
  const info = (el) => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    role: el.getAttribute("role") || undefined,
    name: el.getAttribute("name") || undefined,
    testid: el.getAttribute("data-testid") || el.getAttribute("data-test") || undefined,
    href: el.getAttribute("href") || undefined,
    text: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120),
  });
  return {
    title: document.title,
    url: location.href,
    headings: [...document.querySelectorAll("h1,h2,h3")].slice(0, 50).map(info),
    landmarks: [...document.querySelectorAll("main,nav,aside,header,footer,[role]")].slice(0, 80).map(info),
    links: [...document.querySelectorAll("a[href]")].slice(0, 200).map(info),
    buttons: [...document.querySelectorAll("button,[role=button],input[type=submit]")].slice(0, 60).map(info),
    forms: [...document.querySelectorAll("form")].map((form) => ({
      action: form.action,
      method: form.method,
      fields: [...form.querySelectorAll("input,select,textarea,button")].map(info),
    })),
    tables: [...document.querySelectorAll("table")].slice(0, 10).map((table) => ({
      headers: [...table.querySelectorAll("th")].map((th) => (th.innerText || "").trim()),
      rowCount: table.querySelectorAll("tbody tr").length,
    })),
    dataAttributes: [...new Set(
      [...document.querySelectorAll("*")].flatMap((el) =>
        [...el.attributes].map((attr) => attr.name).filter((name) => name.startsWith("data-"))
      )
    )].slice(0, 100),
  };
});
console.log(JSON.stringify(inventory, null, 2));
```

## 3. 收集 URL 模式

不要只记录一个页面。收集列表页、详情页、分页链接和导航链接，归纳 URL 模式：

```js
const links = await page.evaluate(() =>
  [...document.querySelectorAll("a[href]")]
    .map((a) => ({ text: (a.innerText || "").trim().slice(0, 100), href: a.href }))
    .filter((link) => link.href.startsWith("http"))
);
console.log(JSON.stringify(links.slice(0, 200), null, 2));
```

把相似链接归类，例如：

- 列表页：`/articles?page=2`、`/search?q=...`
- 详情页：`/article/<slug>`、`/p/<id>`
- 用户页：`/u/<username>`
- 分页：`?page=<n>`、`rel="next"`、`cursor=...`

## 4. 多页面验证

选 2～3 个代表页面，分别记录：

| 类型 | 示例 URL | 关键字段 | 备注 |
| --- | --- | --- | --- |
| 列表页 | 实际 URL | 列表项、分页 | 数量、排序 |
| 详情页 A | 实际 URL | 标题、正文、作者 | 正常内容 |
| 详情页 B | 实际 URL | 同上 | 不同模板/长度 |
| 空/错误页 | 实际 URL | 错误提示 | 不要误判为成功 |

## 5. 检查登录与验证状态

在页面加载后检查：

- URL 是否跳转到登录页（`/login`、`/signin`、`/auth`）
- 页面是否包含「登录」「Sign in」「验证」「环境异常」「完成验证」「访问过于频繁」等文本
- 是否存在验证码 iframe 或 challenge 容器
- 是否只显示预览/付费墙

```js
const state = await page.evaluate(() => {
  const text = document.body.innerText || "";
  return {
    url: location.href,
    title: document.title,
    hasLoginForm: Boolean(document.querySelector('form[action*="login"], input[autocomplete="username"]')),
    hasCaptcha: Boolean(document.querySelector('iframe[src*="captcha"], [class*="captcha"], [id*="captcha"]')),
    mentionsVerification: /环境异常|完成验证|验证码|访问过于频繁|verify|verification|captcha/i.test(text),
    textSample: text.replace(/\s+/g, " ").trim().slice(0, 500),
  };
});
console.log(state);
```

遇到验证/登录时，把状态写进 notes，并让用户在 ego lite 的 Space 里处理；不要绕过。

## 6. 延迟渲染与懒加载

如果提取结果为空：

1. `await page.waitForSelector("<main container>", { state: "visible" })`
2. 滚动一次触发懒加载：`await page.mouse.wheel(0, 800)`
3. 等待网络空闲：`await page.waitForLoadState("networkidle")`
4. 再执行提取

## 7. 动态内容与分页

- 优先寻找「加载更多」按钮而不是猜测 URL。
- 分页组件若使用按钮，记录其 `role` + 文本。
- 如果 URL 分页参数稳定，优先使用 URL 参数。
- 记录最大页数或终止条件（按钮禁用、空列表、重复内容）。

## 8. 截图辅助

视觉结构复杂（图表、画布、地图）时，配合截图：

```js
const path = await page.screenshot({ path: "/tmp/example-page.png", fullPage: true });
console.log(path);
```

截图只用于确认视觉布局，不要把像素坐标写进学习包。

## 9. 探索完成的信号

可以开始写学习包了，当你能回答：

- 这个站点有哪几类页面？
- 每类页面的 URL 模式是什么？
- 每个关键字段用什么稳定选择器？
- 登录/验证/空状态如何识别？
- 列表如何翻页？详情页如何跳转？
- 至少两个代表 URL 的提取结果是否一致？

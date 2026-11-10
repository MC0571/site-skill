# 选择器策略（Selector Strategy）

站点学习包的寿命取决于选择器是否稳定。本文给出优先级、常见反模式和修复方法。

## 优先级

| 优先级 | 类型 | 示例 | 说明 |
| --- | --- | --- | --- |
| 1 | 语义 ID | `#js_content`、`#main` | 最稳定，通常由站点维护者赋予 |
| 2 | 稳定 data 属性 | `[data-testid="article-body"]`、`[data-qa="search-result"]` | 为测试/埋点设计，结构变更时通常保留 |
| 3 | ARIA role + 可访问名称 | `loc=role:button[name="Search"]`、`loc=role:link[name="Next"]` | 贴近用户语义，兼容性好 |
| 4 | 稳定属性 | `[itemprop="headline"]`、`input[name="email"]` | 语义明确，但可能随模板变化 |
| 5 | 稳定文本 | `text="保存"` | 仅在文案稳定且不随语言切换时使用 |
| 6 | 结构 CSS | `article > div > p` | 最后手段，必须用多页面验证 |

## 常见反模式

### 1. 哈希 class

```css
/* 差：构建工具生成的哈希，每次发布都可能变 */
.css-1x2y3z .sc-abc123
```

**修复**：找 `[data-testid]`、`id`、`role`，或稳定的父容器。

### 2. nth-child / 位置选择器

```css
/* 差：列表顺序一变就失效 */
ul > li:nth-child(3)
```

**修复**：用内容特征或 `data-*` 区分，例如 `[data-type="article"]`。

### 3. 依赖布局的路径

```css
/* 差：插入一个包裹层就失效 */
body > div:nth-child(2) > div > main > section > div > p
```

**修复**：从最近的语义容器开始，例如 `main article p` 或 `#js_content p`。

### 4. 临时快照引用

```text
@12、ref=35
```

**修复**：学习包里只写稳定选择器。快照引用只用于当前这一轮操作。

### 5. 坐标点击

```js
await page.mouse.click(420, 260); // 不要写进学习包
```

**修复**：用语义定位器点击；只有 Canvas/地图等无 DOM 语义界面才用坐标，且不固化为站点知识。

### 6. 把一条数据的文本当选择器

```js
// 差：文章标题变了就失效
document.querySelector('a[title="某篇具体文章"]')
```

**修复**：用结构或 `data-*`，参数从 `args` 传入。

## 选择器回退链

一个字段可以按顺序尝试多个选择器：

```js
const pick = (selectors) => {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
};
const titleEl = pick(["#activity-name", "h1.rich_media_title", "article h1"]);
```

回退链只用于同一语义的不同模板，不要用大量随机猜测。

## 文本清洗

提取时统一处理空白和不可见字符：

```js
const clean = (value) =>
  (value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
```

## 多语言与 A/B 测试

- 优先选择不随语言变化的 `id` / `data-*`。
- 如果只能靠文本，尽量用多个候选词，或将语言作为 `args`。
- A/B 测试可能改变布局；用不同的两个账号/两次访问确认核心选择器仍有效。

## 验证清单

- [ ] 同一个选择器在至少两个代表页面有效
- [ ] 选择器不依赖登录用户的具体数据
- [ ] 选择器不含哈希 class、`nth-child`、坐标或临时 ref
- [ ] 选择器在页面加载完成后可找到
- [ ] 空状态/错误状态有独立判断，不会误报成功

# 微信公众号文章（mp.weixin.qq.com）

Last verified: 2026-11-10

## 用途

在不重新探索页面的情况下，直接提取一篇公众号文章的标题、公众号名、作者、发布时间、正文块和图片链接。

## 站点特征

- 文章 URL 常见形式：`https://mp.weixin.qq.com/s/<短链>`，或带 `__biz`、`mid`、`idx`、`sn` 查询参数的 `https://mp.weixin.qq.com/s?...`。
- 标题：`#activity-name` 或 `.rich_media_title`。
- 公众号名：`#js_name` 或 `.profile_nickname`。
- 作者：`#js_author_name`。
- 发布时间：`#publish_time`，或 `.rich_media_meta` 中的中文日期文本。
- 正文容器：`#js_content`（旧版页面可能为 `.rich_media_content`）。
- 图片懒加载：真实地址常在 `data-src` 属性，`src` 可能是占位图。

## 文章类型

- 标准图文：正文在 `#js_content`（旧版 `.rich_media_content`），按段落/标题/图片提取。
- 图片分享型：页面存在 `#js_image_content` / `#js_image_desc`，正文说明在 `#js_image_desc`，图片在 `#img_swiper` 的 `.swiper_item img`（懒加载）。工具返回 `contentType: "image_post"`，`contentText` 包含标题和说明，`images` 返回全部去重后的图片 URL。
- 遇到 `环境异常` / `完成验证后即可继续访问` 时返回 `blocked: true`、`reason: "verification_required"`，需要用户在 ego lite 中完成验证。

## 已验证的调用方式

先设置自定义学习工作区（ego lite 自带运行时默认可能找不到用户新增的 learnings）：

```js
process.env.EGO_BROWSER_AGENT_WORKSPACE = "/Users/claw/Documents/deepseek-harness/default-workspace/.ego-browser";
```

然后调用：

```js
const article = await runSiteTool("wechat-mp", "extract_article", {
  url: "https://mp.weixin.qq.com/s/xxxx",
});
```

返回字段：`ok`、`blocked`、`title`、`account`、`author`、`publishTime`、`metaTexts`、`url`、`blockCount`、`imageCount`、`contentText`、`blocks`、`images`。

## 异常处理

- 如果返回 `blocked: true`、`reason: "verification_required"`，说明微信显示了「环境异常 / 完成验证后即可继续访问」的验证页。此时应在 ego lite 的 Space 中把页面交给用户完成验证（`task.handOff()`），不要重复刷新。
- 如果返回 `ok: false`、`reason: "article_content_not_found"`，可能是文章被删除、仅粉丝可见，或页面结构改版；检查 `pageTextSample` 后再决定是否更新本学习包。
- 如果文章很长，`contentText` 会包含完整正文，图片另见 `images`。

## 维护提示

页面结构变更时，优先更新 `browser-tools/extract-article.js` 中的选择器；`manifest.json` 中的 domain 和工具描述保持不变即可。不要写入像素坐标、登录凭证或临时快照引用。

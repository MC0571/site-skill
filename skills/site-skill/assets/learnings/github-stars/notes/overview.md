# GitHub Stars

Last verified: 2026-11-13

## 范围与入口

当前登录会话的“我的星 / Your Stars”，以及同结构的用户 Stars 页面。读取工具负责读取内容、搜索、筛选和翻页；Lists 写工具负责追加已加星仓库、创建列表和编辑列表。三个写工具都要求 `confirm: true`，不封装删除或移除列表归属、取消星标或自动加星。

- 当前账号入口：`https://github.com/stars`。
- 用户摘要：`/stars/<user>`；侧栏与默认页使用同一种布局。
- 全部仓库：`/stars/<user>/repositories?filter=all`。
- 自有 / 他人仓库：上述地址的 `filter=yours` / `filter=others`。
- 主题：`/stars/<user>/topics?filter=topics`。
- Profile Stars：`/<user>?tab=stars`，支持 `after` 游标。
- 列表详情：`/stars/<user>/lists/<slug>`。
- 仓库详情：卡片 `h3 a` 指向 `/<owner>/<repo>`；详情页不在提取工具范围内。

读取工具只接受上述 Stars 路由；`add_repository_to_lists` 则接受 `https://github.com/<owner>/<repo>` 仓库完整 URL。其他 GitHub 页面也可能匹配域名发现，但不代表其结构受支持。不要把具体用户名、仓库清单或列表名写进学习包。

`get_stars` 和 `extract_stars` 支持现代 Stars、Profile Stars、列表详情三种布局，返回 `layout: stars|profile|list`；列表详情额外返回 `list` 元信息。`get_list_repositories` 要求列表详情 URL，复用 `get_stars` 的分页与截断规则。

## Profile Stars 与 Lists 总览

Profile 的内容根为 `#user-profile-frame`。仓库卡片是包含 `h3 a` 的 div，列表卡片是包含 h3 的 a；不要把列表卡片当作仓库。每张仓库卡片单独提取描述、语言、计数和时间，不能把共同父容器作为卡片。分页沿 `.paginate-container a` 的实际 Next / Previous 链接，保留不透明 `after` 游标，不自行计算 page。筛选菜单 ID 为 `stars-type-filter-menu-button`、`stars-language-filter-menu-button`、`stars-sort-menu-button`；类型包含 public、private、source、fork、sponsorable、mirror、template，不传 type 表示全部。Profile 的 Updated 时间是仓库更新时间，不是加星时间。

`#profile-lists-container a[href*="/lists/"]` 提供名称 `h3`、URL、可选描述 `span` 和 `N repository/repositories` 数量文字。折叠区的所有条目已在 DOM 中；Show all lists... 仅展开显示，`get_star_lists` 直接读取全部卡片，返回 `scope: all_dom_lists`、`lists` 和 `listCount`。数量无法解析时为 null。总览没有可靠的私有状态字段，不从卡片外观猜测私有状态。

列表排序与仓库排序分开：`user_lists_sort=name|created_at|updated_at`、`user_lists_direction=asc|desc`；默认 updated_at / desc。`get_star_lists` 可传 Profile Stars 完整 URL 保留这些参数；省略 URL 时通过当前账号 `/stars` 的 Profile 链接定位。

列表详情的仓库容器为 `#user-list-repositories`，标题链接是 `h2 a`。当前账号的隐藏编辑表单提供 `user_list[name]`、`user_list[description]` 和 checkbox `user_list[private]`，工具返回 `list.name/description/private`。空列表没有仓库容器，需要 Edit list 控件及真实空提示共同确认；不能把容器缺失直接当作空列表。大列表的真实分页尚未验收；工具沿页面实际 Next 链接读取，游标逻辑由合成 fixture 覆盖。

## 筛选、搜索、排序、分页

1. 从侧栏 `[aria-label="Star filters"]` 取得当前账号的真实入口，避免硬编码用户名。`filters` 返回这些链接及显示的计数文字。
2. 语言筛选使用 `language=<language>`，例如 `language=javascript`；应复用侧栏链接的实际参数。
3. 搜索框为 `form[role="search"][aria-label="Starred repositories"] input[name="q"]`，填写后按 Enter 提交 GET 搜索。仓库和主题页都沿用这个表单名称。
4. 排序菜单为 `summary[role="button"]`，其所在菜单内的链接参数为 `sort=created`（最近收藏）、`updated`（最近活跃）、`stars`（星标数），默认 `direction=desc`。
5. 搜索表单不会保留全部排序参数；实测从最近活跃排序提交搜索后回到最近收藏。需要组合参数时使用完整 URL，并核对工具返回的 `query/filter/language/sort/direction`。
6. 完整仓库列表每页实测 30 个。`.paginate-container a` 中按文字 `Next` / `Previous` 找链接，真实链接是 `rel="nofollow"`，不是 `rel="next"`。不可点击的前后页是 `span[aria-disabled="true"]`。
7. `get_stars` 从传入的具体 repositories/topics 页开始，沿真实 `Next` 链接读取至末页，不重置传入的 `page`；`extract_stars` 只返回当前页及 `nextUrl`，不导航。

默认摘要页实测只显示前 10 个仓库，并可混合显示主题；它没有仓库列表的 Next。`get_stars` 从默认 `/stars`（或用户摘要入口）先使用侧栏 All repositories 的真实链接进入完整仓库列表，并保留请求 URL 的 `q/language/sort/direction` 参数；摘要发现页不参与条目聚合或 `pagesRead` 计数。默认读取全部仓库不含主题，显式 topics URL 则从该主题页开始读取。`extract_stars` 仍可从 `collectionLinks` 返回 “See all starred repositories” 入口。侧栏计数和顶部 Profile Stars 计数实测存在差异，不要用它们宣称已完整读取全部收藏。

## 加载与稳定选择器

必须等待 `load` / `document.readyState === "complete"` 后再提取。该页面采用流式 HTML，搜索框和前几张卡片可先于后续卡片、分页出现。仅等待 URL、`domcontentloaded` 或搜索框会得到不完整结果。`extract_stars` 对未加载完的页面返回 `page_loading`。

| 内容 | 选择器 | 说明 |
| --- | --- | --- |
| 主内容 | `main` | 不读取顶部账号导航 |
| Stars 搜索 | `form[role="search"][aria-label="Starred repositories"]` | 页面类型标记，主题页也存在 |
| 筛选项 | `[aria-label="Star filters"] li a[href]` | 归属、主题、语言和实际链接 |
| 仓库卡片 | `main li` 中包含 `h3 a[href]` 的条目 | 使用核心列表结构，不依赖样式类 |
| 仓库名与地址 | `h3 a[href]` | 从 URL 路径取得 `owner/repo` |
| 仓库描述 | 卡片内 `:scope > div > p` | 排除隐藏弹窗中的段落 |
| 编程语言 | `[itemprop="programmingLanguage"]` | 缺失时返回空字符串 |
| 星标 / Fork 数 | `a[href$="/stargazers"]` / `a[href$="/forks"]` | 保留页面显示字符串，不把缺失当作 0 |
| 时间 | `relative-time[datetime]` | 返回 ISO datetime、文字和标签；最近活跃排序的标签为 Last updated，不是收藏时间 |
| 主题 | `li a[href^="/topics/"]` | 链接内第一个段落是标题，第二个是可选描述 |
| 空搜索 | `main .blankslate h3` | 已验证文案为 couldn’t find any matching starred repositories |
| 前后页 | `.paginate-container a[href]` | 按 Next / Previous 文字识别 |

每张仓库卡片包含隐藏的 Lists dialog，其中预置错误和空列表文案。不能扫描整页文本来判断失败，也不能直接读取卡片的全部段落或 `textContent` 当作仓库描述。

## 列表与写入边界

每张仓库卡片有 “Add this repository to a list” 入口，使用卡片内 `select-panel button[aria-haspopup="dialog"]`，打开的是 Lists dialog。该入口用于管理收藏归类，不等同于浏览全部 Stars。不要持久化带 repository ID 的 dialog ID。

`add_repository_to_lists` 接受已加星仓库的完整 GitHub URL、非空 `listNames` 字符串数组和 `confirm: true`。工具先解析全部目标列表；任一目标无法解析时在提交前失败。目标全部已有该仓库时返回 `changed: false` 且不写入；存在缺失归属时保留所有已有归属，并在一次提交中追加到全部目标。返回 `ok`、`repositoryUrl`、`changed`、`addedLists`、`alreadyPresentLists`，以及包含列表条目 `id` / `name` 的 `selectedLists`。

`create_list` 接受 1–32 字符的 `name`、最长 160 字符且默认空字符串的 `description`、默认 `true` 的 `isPrivate` 和 `confirm: true`。工具只创建列表，不自动添加仓库；名称重复时返回错误。成功结果为 `ok`、`name`、`url`、`isPrivate` 和 `description`。

三个写工具都使用浏览器现有 GitHub 会话读取页面表单并提交，不保存 cookie、CSRF token 或其他会话值；提交后重新读取页面，以实际归属或列表状态验证结果。学习包不记录真实账号、列表名或仓库名。

仓库详情页使用 React：已加星状态由 `button[aria-label="Unstar <owner>/<repo>"]` 表示。列表选项通过 `GET /<owner>/<repo>/lists?experimental=1`、`Accept: text/fragment+html` 读取；`[role="option"][data-value]` 提供列表 ID，`aria-selected` 提供归属状态。

`get_repository_lists` 将这段读取作为独立的只读工具，返回全部 `lists` 及已选 `selectedLists`；每项含 id、name、selected，不返回表单或会话字段。

追加归属使用接口返回的 POST 表单、`_method=put`、`list_ids[]` 和 `user_list_menu_dirty=1`。工具保留原有 ID 与目标 ID 的并集，通过原生表单导航提交。该接口可能已保存却返回 406 错误页，因此不能据响应错误直接重试：工具等待提交文档替换，回到正常仓库页后重新 GET，并核实全部原归属和目标归属。

创建列表使用 Profile Stars 页的原生创建表单，POST 到 `/stars/<user>/lists`，字段为 `user_list[name]`、`user_list[description]`、`user_list[private]`。GitHub 会拒绝 fetch 创建提交，工具使用原生表单导航；等待新列表的 Edit list 按钮出现后，再读取新 URL 核对名称、描述和私有状态。空列表尚无 `#user-list-repositories`，不能用仓库容器判断创建是否完成。

`edit_list` 要求现有列表 URL、至少一个 name / description / isPrivate 字段及 `confirm: true`。编辑表单 POST 到当前列表 URL，并携带 `_method=put`；名称必填且最长 32 字符，描述最长 160 字符。工具保留省略的字段，值未变时返回 `changed: false`，改名之前检查重名。提交采用原生导航，待旧文档替换后返回 Profile 查找保存的列表，再冷读详情核对三项元信息；改名可能改变 slug，应使用返回的 url。列表编辑不提交仓库归属字段。

## 官方 REST 读取通道

官方文档：[Starring](https://docs.github.com/en/rest/activity/starring?apiVersion=2026-03-10)。`GET https://api.github.com/users/<username>/starred` 支持 `sort=created|updated`、`direction=asc|desc`、`per_page`（最多 100）和 page。created 按加星时间排序，updated 按仓库最后 push 时间排序。请求 `Accept: application/vnd.github.star+json` 返回 `{starred_at, repo}`，可取得精确加星时间；示例 API 版本为 `2026-03-10`。`GET /user/starred` 是文档中的当前鉴权用户端点，本工具统一使用显式用户名端点。

`get_stars_api` 要求 username，默认公开读取，省略 maxItems 自动沿官方 `Link: rel="next"` 读取至末页。官方分页链接实测可采用 `/user/<numeric-id>/starred`，应保留实际链接，不自行递增 page。工具只跟随 api.github.com 上同类 Stars 路径，按仓库 id 去重；返回 `starredAt`、仓库信息以及与页面读取一致的 complete / pagesRead / stopReason / nextUrl 语义。

`authenticated: true` 必须由调用它的 Node 进程预先提供 `process.env.GITHUB_TOKEN`，只放进 Authorization 请求头；工具不读取 gh、钥匙串、浏览器 cookie 或凭据文件，也不保存 token。ego 的 Node 运行环境不继承 shell 环境变量，浏览器登录不等于 REST 鉴权。缺少 token 时直接报错，不静默改成公开读取。细粒度 token 文档要求 Starring 用户读取权限；可见资源仍取决于 token 权限，私有 Profile 的公开请求可能返回空列表。

结果 `access: public|token_visible` 表示读取通道，`complete: true` 只代表该端点到达末页，不能宣称已取得所有私有收藏。HTTP、JSON 或 Link 错误返回明确 reason 并保留此前条目；网络异常抛出，不自动重试。公开端点及 starred_at 字段已实测，真实 token 鉴权没有执行。

## 工具与结果

- `runSiteTool("github-stars", "get_stars", { url?, maxItems? })`：默认从当前账号 `/stars` 进入完整仓库列表，等待各页完整加载后自动翻页；URL 可携带现有筛选、搜索、排序和分页参数。`maxItems` 可选，须为正安全整数；省略读取全部，无默认 100 上限。
- `runSiteBrowserTool("github-stars", "extract_stars", { maxItems? })`：只读当前页，不导航；`maxItems` 默认 100，范围 1–100，仓库和主题共享上限。
- `runSiteTool("github-stars", "add_repository_to_lists", { url, listNames, confirm })`：将指定已加星仓库追加到一个或多个现有列表；`confirm` 必须为 `true`。
- `runSiteTool("github-stars", "create_list", { name, description?, isPrivate?, confirm })`：创建列表；`confirm` 必须为 `true`，且不会自动添加仓库。
- `runSiteTool("github-stars", "get_star_lists", { url? })`：读取全部 DOM 列表卡片及独立排序。
- `runSiteTool("github-stars", "get_list_repositories", { url, maxItems? })`：读取指定列表仓库，自动翻页。
- `runSiteTool("github-stars", "get_repository_lists", { url })`：查询一个仓库的全部列表与当前归属。
- `runSiteTool("github-stars", "edit_list", { url, name?, description?, isPrivate?, confirm })`：编辑现有列表，保留未指定字段；`confirm` 必须为 `true`。
- `runSiteTool("github-stars", "get_stars_api", { username, sort?, direction?, maxItems?, authenticated? })`：官方 REST 读取，包含精确 starredAt。
- `items` 包含 repository / topic 两种 `type`，共有 name、url、description、time；仓库还含 language、stars、forks。
- `get_stars` 返回 `scope: "all_pages"`，聚合条目按 `item.url` 去重。`itemCount` 是实际返回数；`totalLoaded` 是所有成功读取列表页的唯一条目数，包含已读取但因上限未返回的条目，不代表账号总数。
- `get_stars` 的 `pagesRead` 是成功读取的列表页数，不计摘要发现页；`complete` 是布尔值，表示已到末页且没有遗漏，上限截断或读取失败时为 `false`。`stopReason` 为 `end`（到达末页）、`max_items`（条目上限）或 `blocked`（读取失败）。从指定中间页开始的完整读取也只覆盖该页至末页。
- `get_stars` 的 `truncated` 表示仍有遗漏，包括已读页中未返回的条目及尚未读取的后续页。条目上限截到页中时，`nextUrl` 指回当前页；否则指向下一页，末页无下一页链接。
- 页面提取返回失败时，`get_stars` 返回 `ok: false`、`complete: false` 和明确的 `reason`，保留此前成功读取的 `items`，不能把部分结果作为完整读取。导航或运行时异常继续抛出，不自动重试。
- `extract_stars` 保持 `scope: "current_page"`；`totalLoaded` 是当前 DOM 的条目数，`truncated` 只表示参数截断。摘要页可继续使用 `collectionLinks`，分页列表可继续使用 `nextUrl`，均不表示已读完账号全部星标。
- 未完整加载返回 `page_loading`；跳转到登录 / 会话页返回 `login_required`；其他路由返回 `unsupported_page`；找不到已知 Stars 结构或明确空结果返回 `stars_not_found`。
- 空搜索返回 `ok: true`、空 items 和 `emptyMessage`，不会伪装成结构错误。

登录、验证、验证码或权限问题需要交还用户处理，不使用其他账号或接口绕过。账号已登录的读取状态经过实测；登录分支仅有合成 fixture 验证。全空账号和访客布局未验收。

调用示例：

```js
// 从当前账号的完整仓库列表自动读到末页。
const all = await runSiteTool("github-stars", "get_stars", {});
// 可选：最多返回指定数量，仍会按需自动翻页。
const limited = await runSiteTool("github-stars", "get_stars", { maxItems: 150 });
// 合成示例：将 owner/repo 追加到现有列表“示例列表”。
await runSiteTool("github-stars", "add_repository_to_lists", {
  url: "https://github.com/owner/repo",
  listNames: ["示例列表"],
  confirm: true,
});
// 合成示例：创建一个私有列表。
await runSiteTool("github-stars", "create_list", {
  name: "示例分类",
  description: "需要关注的开源项目",
  isPrivate: true,
  confirm: true,
});
```

## 已验证状态

真实 ego lite 会话已验证默认入口自动进入完整仓库列表、复用同一标签页沿 Next 读取至末页、跨多页条目上限、关键词＋语言＋最近活跃排序参数保留、显式主题入口及空搜索。全量读取的唯一仓库数与页面 All repositories 计数一致，并返回 `complete: true`、空 `nextUrl`；不保存真实收藏内容或账号信息。

合成 fixture 覆盖跨页重复条目去重、初始及中途提取失败、页中和页边界截断、恰好到达末页、从指定页开始、缺少完整仓库入口和非法条目上限。登录和加载分支仅由 fixture 验证。

`extract_stars` 已实测默认摘要、仓库列表、主题和空结果；`siteSkills`、`siteSkillsForUrl`、`learnContext` 已通过实际调用。仓库详情不在提取工具范围内。

Lists 写工具已在真实登录会话验证创建私有列表、单列表和多列表追加、保留已有归属、重复调用 `changed: false`，以及保存后返回仓库页重新读取。新列表的私有状态、描述及仓库内容均通过冷重开核实。公开列表创建与非法输入、服务器拒绝、导航等待分支有 fixture 覆盖；未实际创建公开列表。

扩展能力通过 ego lite 复核：Profile Stars 沿游标读取至末页、跨两页条目上限及私有筛选的空结果、折叠列表总览、列表详情导出、仓库归属查询，以及编辑新建私有列表描述后的持久化、原私有状态和仓库内容保留。不同 Stars 布局与顶部计数仍存在差异，完整性只表示传入页面通道已到末页。真实改名与私有转公开没有执行，字段保留、改名后 URL、重名拒绝及保存失败由合成 fixture 覆盖。

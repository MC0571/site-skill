# GitHub Stars 批量列表整理

Last verified: 2026-11-14

本篇沉淀真实批量迁移核实的官方接口、归属语义与恢复流程。浏览器列表工具与页面结构见 [overview.md](overview.md)；真实接口迁移的验证范围与新增封装工具的验收状态见文末。

## 官方接口与节点

列表 API 通过 `POST https://api.github.com/graphql` 调用。调用方必须预先在执行工具的 Node 进程配置 `GITHUB_TOKEN`，token 只放入 `Authorization` 请求头；封装不读取 gh、钥匙串、cookie 或凭据文件，不保存 token。浏览器登录不提供 API 鉴权，缺少 token 直接报错。计划、快照、返回的账号与成员数据、进度都由调用方保存在包外的私有证据目录，不写入学习包；不添加凭据获取工具或 job 引擎。

先沿 `viewer.lists(first: 100, after: ...)` 读取列表元信息，再对每个 `UserList` 单独沿 `items(first: 100, after: ...)` 读取成员。两层连接均核对 `totalCount` 和 `pageInfo { hasNextPage endCursor }`，沿真实不透明游标到末页。不要把全部列表与全部成员塞进一个大嵌套查询：真实迁移中该形式曾返回 HTTP 502。分页失败、节点不可见或成员数量不完整均是读取失败，不能当作空列表继续写入或清理。

仓库 GraphQL 节点 ID 使用 REST 的 `repo.node_id`，即 `get_stars_api` 条目的 `nodeId`，或其他官方 API 返回的节点 ID；列表使用 `get_star_lists_api` 返回的 `lists[].id`（GraphQL UL ID）。数字仓库 `id` / `databaseId`、网页表单的数字 `list_ids[]` 与 GraphQL 节点 ID 不能混用，不从名称、URL 或数字 ID 自行编码、合成节点。`UserListItems` 当前只支持 `Repository`，不支持 `Topic`。

公开 GraphQL mutation 的稳定契约：

| mutation | input | 语义 |
| --- | --- | --- |
| `createUserList` | `name`、`description`、`isPrivate` | 新建列表；整理流程默认私有 |
| `updateUserList` | `listId`、可选 `name` / `description` / `isPrivate` | 更新指定元信息，保留未指定字段及既有可见性 |
| `updateUserListsForItem` | `itemId`、`listIds` | 全量替换该仓库的列表归属；追加需先求原归属与目标归属的并集 |
| `deleteUserList` | `listId` | 删除列表；整理流程须先验证成员覆盖 |

现有 `create_list` / `edit_list` 继续通过浏览器会话创建与编辑，不新增重复的 API 包装工具。复用或改名时保留既有可见性，新建时显式采用默认私有；列表改名可能改变 slug，后续使用重新读取的 URL。

## 封装工具契约

通过 `runSiteTool("github-stars", toolName, args)` 调用，以下工具均位于 `tools/lists-api.js`。

| toolName / Node export | 参数 | 行为与结果 |
| --- | --- | --- |
| `get_star_lists_api` / `getStarListsApi` | `{}` | 只读完整快照；成功返回 `ok`、`complete`、`scope: all_pages`、`access: token_visible`、`viewer.login`、`listCount`、`lists`。每个列表含 `id/name/description/isPrivate/slug/url/items`，成员含 `id/databaseId/nameWithOwner`；失败保留已读数据并标记 `complete: false` |
| `batch_classify_stars` / `batchClassifyStars` | `{ assignments: [{ repositoryId: nodeId, listIds: [listNodeId] }], mode?, confirm: true }` | 非空 assignments，每个仓库只出现一次，每项 listIds 非空，可指定多个列表；默认 `append` 保留已有归属，显式 `replace` 以给定集合替换全部归属。结果含 `mode`、`results`、`pendingRepositoryIds`、`uncertainRepositoryIds` |
| `merge_star_lists` / `mergeStarLists` | `{ sourceListIds, targetListId, confirm: true }` | 非空源列表与现有目标不得重叠。将源成员追加到目标并保留其他归属；重读验证目标完整并集及源成员覆盖后才删除源列表，保留目标元信息。结果按阶段提供 `phase`、`classification`、`cleanup` 及源/目标 ID |
| `cleanup_star_lists` / `cleanupStarLists` | `{ listIds, coveredByListIds?, confirm: true }` | listIds 非空，coveredByListIds 默认 `[]`，待删与保留集合不得重叠。仅删除空列表，或成员已被保留列表成员并集完全覆盖的列表；删除后重读，核对其余列表元信息与成员不变。结果含 `deletedListIds`、`pendingListIds`、`uncertainListIds` |

所有列表 ID 必须属于 token 对应的当前账号。批量归类和合并在首批写入前校验全部分配及目标列表，并以当前账号可访问的已 Star 仓库节点为范围；无法确认的节点独立标记，不强写。`replace` 会移除未指定的列表归属，必须在计划中明确。写入不改变 Star 状态，也不自动加星。

三个 API 写工具必须传 `confirm: true`；这表示调用方已有相应账号及操作范围的授权。用户已明确授权时直接设置，不重复询问；合并与清理的授权范围应包含删除源列表。

## 调用示例

先用 `get_star_lists_api` 取得列表 ID，用鉴权 `get_stars_api` 取得仓库 `nodeId`。以下 `repository`、`targetA`、`targetB`、`sourceA`、`sourceB`、`retired` 均由这些结果和本次整理计划选定；示例不预设账号或分类。

```js
const snapshot = await runSiteTool("github-stars", "get_star_lists_api", {});
if (!snapshot.ok) throw new Error(snapshot.reason);
const stars = await runSiteTool("github-stars", "get_stars_api", {
  username: snapshot.viewer.login, authenticated: true,
});
if (!stars.ok) throw new Error(stars.reason);
// 将一个仓库追加到多个列表；批量时在 assignments 中增加其他仓库。
const classified = await runSiteTool("github-stars", "batch_classify_stars", {
  assignments: [{ repositoryId: repository.nodeId, listIds: [targetA.id, targetB.id] }],
  mode: "append", confirm: true,
});
if (!classified.ok) throw new Error("停止；保存 classified 并重读归属后恢复");
// 将多个源列表并入目标，重读验证后删除源列表。
const merged = await runSiteTool("github-stars", "merge_star_lists", {
  sourceListIds: [sourceA.id, sourceB.id], targetListId: targetA.id, confirm: true,
});
if (!merged.ok) throw new Error(`合并停止于 ${merged.phase}；保存进度并重读状态`);
// 清理另一个已迁移列表；未覆盖其全部成员时工具拒绝删除。
const cleaned = await runSiteTool("github-stars", "cleanup_star_lists", {
  listIds: [retired.id], coveredByListIds: [targetA.id, targetB.id], confirm: true,
});
if (!cleaned.ok) throw new Error("清理未验证；保存 cleaned 并重读状态");
```

每一步先检查 `ok`，将结果和进度保存到包外；失败时按下文重读对账，不能直接继续后续写入。需要替换某仓库全部归属时，将该项的完整目标集合传入，并显式使用 `mode: "replace"`。

## 整理与对账流程

1. 只读保存初始快照：完整 Star 数字 ID、`nodeId`、精确 `starredAt`，以及全部列表元信息与完整成员。核对两种读取都成功、到达末页；`complete` 仅代表当前通道与 token 可见范围，不代表所有受限或私有资源。
2. 确定目标分类及列表映射，优先复用或改名，必要时用现有工具新建。保留既有可见性，新建默认私有；先完成目标准备，再取得最新列表节点 ID。
3. 按可访问、已 Star 的仓库节点预校验全部 assignments，确认目标属于当前账号、没有重复仓库或无法解析的 ID。受限记录单列，未通过预校验的分配不进入写入。
4. 按计划执行默认 append 或已明确选择的 replace；保留每批回执与进度。合并可用 `merge_star_lists`，其追加、重读验证、删除按阶段执行。
5. 重新全量读取，逐仓库比较完整列表归属集合，逐列表比较完整成员集合，不能只看总数、首屏或 mutation 成功状态。合并目标应等于原目标与全部源成员的并集，其他归属继续保留。
6. 源列表所有成员已被保留列表覆盖后才清理；不指定覆盖列表时只允许删除空列表。覆盖不足返回 `source_members_not_covered` 与 `uncoveredRepositoryIds`，不删除。删除后重新读取，确认目标存在、源列表消失且其余列表与成员符合计划。
7. 冷读 Profile Stars 和列表详情核实展示、元信息与成员，再用相同 API、账号与可见范围比对前后完整 Star ID 集合和每项 `starredAt`。整理列表不应改变这些值；差异须解释后才能报告完成。

## 部分失败与恢复

归属更新与删除 mutation 使用 alias，每批最多 10 条，批次串行执行。这不是事务：同一批中也可能部分保存。HTTP、网络、GraphQL 错误或回执不匹配时停止，不自动重试；不要以整批请求失败推断整批未写入。

归类的 `results` 记录已核对回执或原本无需修改的项，含 `repositoryId/listIds/changed`；`pendingRepositoryIds` 包含尚未确认完成的项，`uncertainRepositoryIds` 标记提交结果不确定的项，两者可能重叠。清理的 `deletedListIds` 记录已核对删除回执的项，`pendingListIds` / `uncertainListIds` 表示尚未确认或结果不确定的项。回执核对不替代全量冷读；删除后重读失败仍须报告失败。合并的进度位于 `classification` / `cleanup`，并由 `phase` 表示停止阶段；初始读取或预校验失败可能直接返回原因，不能假定每次失败都带写入进度。

恢复前先重读完整 Stars 与列表状态，再将实际归属、已消失的列表和包外进度对账，只处理仍待完成的部分。读取失败就停止依赖该快照的写入，不把失败响应、不可解析节点或缺失容器当成空列表；不依靠盲目重试、自动回滚或持久 job 恢复。

## 受限条目与验证范围

真实迁移遇到过现代 Stars 仍列出、列表菜单 GET 返回 200，但 POST 后归属没有保存且 GraphQL 节点不可解析的受限仓库。页面出现、菜单可读或请求返回成功都不证明能写入。将此类记录与可访问仓库独立标记，保留无法完成的原因；不合成节点 ID 强写，也不宣称全部整理成功。不能绕过权限、验证或资源限制。

官方 GraphQL 列表读写、分页拆分、alias 批次和上述迁移对账流程已经真实批量迁移核实；这里不保存真实账号、仓库清单、列表名或迁移计数。

四个封装工具已通过 `runSiteTool` 在真实 ego lite 会话验收：完整列表快照与成员跨页、跨批追加和多重归属、保留原归属、重复追加不写入、精确 replace、多源重叠成员合并到已有成员的目标、覆盖不足时拒绝清理，以及覆盖完整后的非空列表清理。临时私有列表最终全部移除；原列表元信息和完整成员集合、Star ID 与精确加星时间均保持不变，Profile Stars 冷读核对通过。`siteSkillsForUrl` 与 `learnContext` 能发现新工具和本说明。

列表元信息跨页、GraphQL 部分成功、HTTP/网络失败、缺失回执与删除后重读异常由合成 fixture 验证；未为验收制造真实账号的部分失败或大量临时列表。受限仓库的可写性不因封装而改变。

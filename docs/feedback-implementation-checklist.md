# 反馈功能剩余实施清单

> 历史规划：用户随后已授权继续实现。当前实现、配置和待做的平台验收见 [feedback-deployment.md](feedback-deployment.md)；下文“只整理文档”等描述仅记录当时状态。

核对日期：2026-09-21。基于当前工作区，已推送的合包修复提交为 `8bde6e0`。

本文是交接清单，**不是功能完成报告**。本轮只整理文档，不新增反馈业务代码、不部署服务。原始产品与额度方案见 [anonymous-feedback-and-abuse-plan.md](anonymous-feedback-and-abuse-plan.md)；其中“只剩记录层”的说法不应理解为只差一个按钮，实际还缺下文的服务与页面闭环。

## 目标与默认产品决定

- 匿名浏览、匿名提交，不要求进站登录。
- 首页与下载页提供“反馈”入口，打开独立 `/feedback`。谱面详情另加带目标上下文的入口。
- 三类建议：槽位实际键型、槽位难度、整轮参考难度。
- 浏览方式复用现有按键型、比赛、轮次找谱面的逻辑。用户找到目标后打开短编辑面板，不做长问卷。
- 理由可选，最多 500 字；昵称可选且不代表已验证身份；首版不上传截图，只允许最多两个 HTTPS 证据链接。
- Turnstile 在提交环节加载和执行；浏览不需要验证。建议列表仅后台可见，提交者得到收据编号。
- 反馈写独立私有 R2 桶。提交、忽略、采纳到暂存均不写比赛 JSON、不调用 GitHub。
- “保存全部”复用现有 batch，一批 N 条建议产生一次数据 commit；不能每采纳一条就保存一次。
- 仅 admin/owner 审核；原有 contributor 编辑权限保持原语义。

## 现状：复用与缺口

| 部分 | 已有代码 | 剩余工作 |
| --- | --- | --- |
| 类型与字段校验 | `src/lib/suggestions/types.ts`、`validation.ts` | 统一错误码、版本与快照语义 |
| 目标定位与差异计划 | `src/lib/suggestions/patch.ts` | 轮次歧义、参考来源语义、权威数据再确认 |
| 把计划应用到草稿 | `src/lib/suggestions/apply.ts` | 接入真实 StagedEntry、来源跟踪与保存后核销 |
| 浏览与参考纯逻辑 | `mapBrowserRows.ts`、`roundReference.ts`、`referenceData.ts`、`roundDifficulty.ts`、`realTypeCatalog.ts` | 公共浏览组件、公共参考选择 UI |
| 公开提交 Worker | `workers/feedback/src/{index,policy,request,store,env}.ts` | 实际 DO 适配、并发幂等、路径限制、关闭状态 CORS、真实部署 |
| 公开反馈页 | 无 | `/feedback`、建议编辑、Turnstile、收据与失败保留 |
| 审核 API/UI | 无 `functions/api/suggestions/`，无 `SuggestionReview.tsx` | 分页、详情、审核 CAS、租约、补账 |
| 批量保存 | `functions/api/tournaments/batch.ts` 已返回 `{ success, count, commit, files }` | 前端保留 commit、建议 finalize、超时恢复 |
| 平台配置 | Worker 配置样例，写开关默认 false | 桶、DO、域名、Turnstile、额度核对、边缘关闭开关 |

工作区已有尚未提交的头像改动：`PlayerAvatar.tsx`、`playerProfile.ts`、Header、download、auth/me、auth/logout、auth 公共模块及中英文文案。保留这些改动，入口布局与它们一起合并。`penguin-bicycle.html` 与本任务无关。开始工作前重新读 git diff，不用 reset/checkout 覆盖工作区，也不要直接 `git add -A`。

## A. 上线前先补现有实现缺口

以下是本次源码核对发现的事项；尚未为这些事项运行新的复现测试，不能把现有测试通过当成它们已解决。

| 优先级 | 当前行为与触发条件 | 实施要求与验收 |
| --- | --- | --- |
| P0 | `store.ts::suggestionKey` 使用本次请求日期。同一 UUID 在 UTC 跨天重试会落入不同对象键 | 首次预留固定服务端 id/receivedAt/objectKey，后续重试查映射；跨天、IP 变化均不能重新生成同一请求的正文 |
| P0 | `index.ts` 先 get 再无条件 put；两次同 UUID 并发都可能读到不存在，相异正文会后写覆盖 | 由 DO 原子预留 UUID 与 payloadHash，后写使用不可变/条件创建；同 UUID 异 payload 返回 409；R2 成功、确认失败可恢复 |
| P0 | `Env.QUOTA` 是带 reserve() 的测试接口，配置样例实际会绑定 DurableObjectNamespace | 新增真正的 namespace → 固定 DO stub 适配层及迁移配置；全局预算不能按 IP 分到不同 DO 后分别各放行 300 条 |
| P1 | 目前先验证 token、扣接纳预算，再查幂等。同一 token 回放失败；重试还会重复占接纳数 | 新验证请求仍计尝试/验证预算；同一已预留请求只扣一次接纳预算。前端重试获得新 token，UUID 与业务正文保持不变；说明“不保证旧 token 可重用” |
| P1 | 入口 default.fetch 对所有路径都交给 handleSubmit | 只允许 `/v1/suggestions`，其他路径返回 404；不开放列表、任意对象读写或审核方法 |
| P1 | 写开关/配置检查发生在 CORS 与 OPTIONS 处理之前 | 白名单 origin 在关闭时也能收到可读的 503；允许正确预检；暴露 `Retry-After` 响应头。任意 origin 不获得 CORS 放行 |
| P1 | QUOTA.reserve 抛错没有统一错误响应；类型 SuggestRejection 不含 Worker 返回的 DISABLED/BUDGET_EXHAUSTED | 统一错误联合与响应；协调器异常可读地失败并且零写入，服务端不泄露配置或原始异常 |
| P1 | `locateSuggestTarget` 对 roundId 使用 find；历史数据可有重复 roundId | 重复轮次明确拒绝并提示管理员修复；不能选第一轮，也不能退回 roundIndex 猜测。测试旧数据兼容路径 |
| P1 | 原方案 reference 是“选中的参考轮”，但 patch.ts 强制 reference 的比赛/轮次等于 target | 首版建议沿用现有 offset 参考交互：reference 记录目标轮在统一标尺上的选择，UI 不提供任意外部比赛参考轮。更新注释与文档；如要任意参考轮，则同时改契约、计算与测试，不能只删校验 |

幂等映射必须独立于按日 IP 哈希；IP 哈希用来限流，不当作跨天请求身份。UUID 是高熵重试凭据，不是登录凭据，不提供匿名枚举接口。正文与 token 分开计算摘要，收据不返回正文、IP 或审核状态。

## B. 提交端：DO 与 R2 的具体结构

建议增加 `workers/feedback/src/QuotaCoordinator.ts` 与 `coordinatorAdapter.ts`。保留 policy.ts 为预算判定的唯一实现；Cloudflare SDK 依赖限于适配层，不污染共享纯函数。

1. 一个固定名称的协调对象负责全站接纳预算、验证预算与请求预留。DO 自己取 UTC 时间，调用者不能传日期重置额度。状态和计数必须持久化，重启不能归零。
2. 可用 SQLite 表：`budget_day(day, accepted, verifications)`、`ip_counters(day, ip_hash, ...)`、有时戳的滑窗记录、`submission_requests(request_id PRIMARY KEY, payload_hash, suggestion_id, received_at, object_key, phase, lease_until, expires_at)`。
3. verification 在事务内检查并增加尝试/验证预算；acceptance 在事务内先判断已有预留，再检查并预留接纳数。10 分钟规则实现真实滑窗或保守桶算法，不能固定整十分钟翻倍放行却称滑窗。
4. 首次预留生成 suggestionId、receivedAt 和日期对象键；phase 可为 reserved/stored。R2 的写在事务外完成，不能假装 SQLite 与 R2 有分布式事务。
5. 同 UUID/摘要的并发请求只有一个写入租约，其他返回可重试状态或已确认收据；异摘要 409。R2 对象存在时校验摘要并恢复 confirmed 收据，不覆盖不同正文。
6. 失败预留保守占用预算更易保证上限；若实现释放，必须幂等、不可因重试重复返还。保留期内同一次重试不反复扣接纳数。
7. 为所有状态设清理策略与单次处理上限，补分钟突发预算及待审核积压上限。记录实际的 DO/R2 操作数预算，不能只数成功建议。
8. 建议正文至少保留 180 天，幂等映射至少覆盖其可重试保留期；到期行为写明，不能宣称永久幂等。清理使用 alarm/受控运维任务；不能每条请求全表扫描。

继续只给公开 Worker 独立 `SUGGESTIONS` 桶、额度 DO、Turnstile secret 与 IP 盐。不增加管理 KV、GitHub token、主谱面桶或邮件凭据。审核状态建议采用第二个私有桶 `SUGGESTION_REVIEWS`，仅绑定 Pages 后台；公开写服务无权改审核决定。

## C. 静态反馈页与入口

建议文件：

```text
src/app/feedback/page.tsx
src/components/maps/MapBrowser.tsx
src/components/feedback/FeedbackDialog.tsx
src/components/feedback/PublicRoundReferencePicker.tsx
src/components/feedback/TurnstileChallenge.tsx
src/lib/suggestions/client.ts
src/lib/suggestions/fingerprint.ts
src/generated/feedbackDataset.ts  # 构建脚本生成，不手改
```

- 从 `RealTypeMapBrowser` 抽展示、筛选和行操作插槽；后台保留适配器，继续支持键型修改、临时归包和暂存回显。公开页不能 import 后台编辑器及其 fetchLadder/auth 请求。
- 公共页使用 `src/generated/tournaments` 与随构建发布的参考数据，筛选和浏览零业务 API。分页或虚拟列表控制 DOM 数量，不为每张图请求网络。
- 用 URLSearchParams 解析/生成上下文（tournamentId、roundId、slot、可选 beatmapId），路径编码，找不到/歧义显示说明。Next 静态导出中使用 useSearchParams 时处理 Suspense，避免 build 失败。
- 单谱面入口提供“建议键型/建议难度”；轮次入口提供“建议整轮参考”。显示比赛全名、轮次、槽位、BID、当前值与建议值，不把实现字段名直接展示给玩家。
- 难度控件使用共享字段规则：LN 存在 difficulty；HB/TB 双刻度；空输入不变成 0，不把显示轴上限当业务上限。整轮六项的 0 表示不改，影响预览列出每个将改动的槽位，SV/SPECIAL 不动。
- datasetVersion 使用排序后数据与参考文件的稳定摘要，不用每次构建时间制造伪版本。fingerprint 规范化目标相关字段与图身份；客户端与审核端共用算法，摘要不包含整个比赛无关字段。
- fingerprint 不一致只说明前提变化，不能从一个摘要恢复原值。首版展示“当前权威值 → 建议值”和版本变化提示，不伪造“提交时原值”；如需要精确原值，应显式增加有上限的 baseSnapshot 契约并标成不可信快照。
- 前端配置建议 `NEXT_PUBLIC_FEEDBACK_ENDPOINT`、`NEXT_PUBLIC_TURNSTILE_SITE_KEY`，只含公开配置；没有配置时允许浏览，提交区明确“暂未开放”。不写死测试站点或密钥，不假成功。
- Turnstile 只在准备提交时加载，action=`feedback_submit`；expired/error 清 token。切目标/改正文后清旧 token，卸载移除 widget，不无限自动重试。
- 相同提交重试复用 clientRequestId 与正文；用户更改业务内容即新请求。网络错误、429、503 保留草稿和输入，显示倒计时/关闭提示，只有 200/201 且收据合法才显示成功并清本次草稿。
- 本地草稿不保存 token；无强制登录、不上传附件、不自动抓取证据 URL。外链使用 noopener noreferrer，内容按文本渲染。
- 首页/下载页导航加“反馈”；谱面详情按钮可预填目标。与右上角头像共存，手机宽度不遮挡标题/筛选。中英文与深浅主题都覆盖。

## D. 审核 API 与状态

建议增加 `functions/api/_lib/suggestions.ts` 作为仅后台的存储/状态适配器，UI 不直接拼 R2 key。所有路径继续通过现有中间件，并在 handler 验证 admin/owner。拒绝匿名/readOnly/contributor 的审核操作。

| API | 建议职责 |
| --- | --- |
| `GET /api/suggestions?date=YYYY-MM-DD&cursor=...` | 按日期分页正文，最多 50 条，读取这一页状态；返回有界 opaque cursor 与最少摘要 |
| `GET /api/suggestions/:id?receivedAt=...` | ID/日期严格校验后读确定 key；剔除 ipHash，所有返回 private,no-store |
| `POST /api/suggestions/:id/review` | action、expectedRevision、draftId，stage 时带已审核的变更计划摘要；服务端再校验并生成 reviewerUid/租约 |
| `POST /api/suggestions/finalize` | 批量核对 commit 与实际字段结果，标 applied 或返回未同步项 |

首版按日期分页即可，状态筛选只针对当前页时要明确标识；若要“所有日期的全部待审核”，需独立索引，不能扫完整个桶伪装分页。列表不得泄露原始 IP、哈希或 token。幂等映射/索引不向公众暴露。

审核状态初始 pending/revision=0（由正文不存在审核对象推导）；首次状态写必须是 create-if-absent，后续用 ETag 条件写，不允许无条件 put。条件失败返回 409 与最新 revision。先在真实 R2 API 验证条件写语义；若不支持所需行为，再用后台独占 DO，不以 get→put 代替 CAS。

状态路径：pending→staged→applied；pending/staged→ignored；staged→pending（撤销或租约过期）。记录 reviewerUid、draftId、leaseExpiresAt、revision、审核计划摘要、appliedCommitSha。过期后其他管理员可重新采纳，旧持有者不能继续 finalize/覆盖新决定。

“清空暂存”“忽略”必须定义数据与状态一起如何恢复：删除建议来源前检查是否有手动修改/其他建议共用字段，不能简单把整个比赛恢复为旧版。服务器释放租约失败时保留待同步记录，租约仍能自然过期。

## E. 审核 UI、暂存与批量保存

1. 新增 `SuggestionReview.tsx` 和后台“反馈审核”页签。列表 → 当前值/建议值/理由/整轮影响预览 → 采纳到暂存或忽略。
2. `fetchAuthoritative` 取当前 GitHub 内容与 blob SHA；有已有草稿时基于最新草稿生成计划，比较 authoritative/baseline/draft 三者，不用构建数据冒充权威数据。
3. 验证 tournamentId 与对象 id 一致，轮次/槽位唯一、BID 没被替换；计划预览后再次应用前核对版本。`applySuggestPlan` 接收 structuredClone 副本，成功后才能替换 React 状态。
4. 扩展 StagedEntry 的建议来源记录，并保留这轮合包修复的 stagedChangesRef/稳定 setter，避免异步请求覆盖最新草稿。
5. 现有 `SuggestionChangeRecord.status='applied'|'already'` **仅表示已写进本地草稿**，不是审核记录已发布。UI 明确称“待保存”；建议封装时改名或加层级区分，避免假完成。
6. 草稿储存升级到按真实用户 UID 隔离的版本化 key。旧 v2 草稿迁移不自动猜归属；提供认领/导出恢复，不能静默删除。不能用可篡改的头像 cookie 判管理员或草稿身份。
7. stage CAS 成功但本地持久化失败要回滚租约或提示恢复；本地成功而网络响应丢失可读取状态重试。跨标签页用 draftRevision 检测冲突，禁用同时覆盖。退出登录不能把甲的草稿交给乙。
8. 多建议落到同一个文件合并一份草稿；同字段相同目标值可保留多个来源，不同值显式冲突。后续手改标为 superseded，不把不再成立的建议列为 applied。
9. 整轮引用复用已有纯函数。`_typeDiffs/_typeDiffsLocked` 是编辑器元状态，不盲目写入 Tournament JSON；验证“采纳→打开编辑器→再保存”不会把难度重新分配回旧值。
10. 保存时复用 batch。它已返回 `commit` 与 `files`（不是 commitSha 字段），前端正确读取并先持久化 `pendingFinalizations`，再清已保存草稿；保存期间新编辑保留。
11. 三方合并后用**实际写入值**核对建议，不能拿提交前计划直接全部 finalize。后端从配置仓库读取固定 commit 下的文件，并确认 commit 属于发布分支历史；验证 reviewer/draft/revision 与字段 after、图身份匹配。
12. 固定 commit 只能证明那些值存在，不能单独证明“由这条建议造成”。保存前把审核计划与服务端批次 ID 关联，必要时扩展 batch 支持有界 suggestionBatchId（有建议的请求再验 admin）；在 commit trailer 记录该 ID。禁止客户端任意给一个旧 commit 冒领建议。
13. batch 超时可能已提交成功：用批次 ID 找已有发布结果，不能盲目重建 commit。finalize 失败显示“数据已保存，反馈状态待同步”，重试只补状态，不重交 JSON。
14. 对全部值早已等于建议的情况无需制造空 commit：提供“已符合当前数据”的明确处理；如标 applied，后端仍需核对真实现有版本并记录处理原因，不能冒称本次修改。

不要扩展上传页 `MapPatch` 来装反馈字段；那是另一套上传元数据补丁。建议的存储对象、审查状态、草稿记录都不要混进比赛 JSON。

## F. 部署、额度与关闭开关

- 新增并验证 `public/_routes.json`，正常仅 `/api/*` 进入 Pages Functions。检查 `out/_routes.json`，预览部署实测静态首页、下载页、反馈筛选不会执行 Functions/KV。
- 建议独立私有正文桶与审核状态桶，绑定按上述权限分开；配置 DO migration、域名、Turnstile hostname/action、origin 白名单及 secret。
- 核对当前账号对 SQLite DO、WAF rate limit、Bot Fight 的支持与计费，不把文档中每日 100000 或每月 500 当统一额度。记录请求、KV、R2 Class A/B、DO 操作、存储的现有占用与预算。
- 总开关继续默认 false；先在测试环境验收闭环，再开放生产。边缘独立开关应能在不提交 Git、不构建 Pages 的情况下关闭公开写入。
- 默认 workers.dev/预览域名不得成为绕过边缘规则的另一入口；明确生产域名与测试域名的策略。
- 前端静态配置的修改需要正常部署一次，但每条建议不构建。服务器关闭总开关不依赖前端按钮隐藏。
- 同账号 Worker 请求额度不是独立池；只能降低风险，不能保证建议端受攻击时后台绝对不受影响。保留 GitHub 直接恢复渠道。
- 生命周期按真实前缀/对象创建时间实施；正文与审核状态分桶后，不能指望“状态改 ignored”自动触发正文 90 天过期。首版可统一正文 180 天，或由受控清理器按终态处理。
- 运维文档写清实际绑定、已验证结果、关闭/恢复步骤与数据保留策略；不要把假 KV/R2 的测试当平台验证。

## 分阶段交付与完成标准

| 顺序 | 交付内容 | 完成标准 |
| --- | --- | --- |
| 1 | 修 Worker 接口、并发幂等、DO 适配与错误契约 | 串行/并发/跨天/响应丢失不重复收录；跨实例预算不超写；缺配置零写入 |
| 2 | 静态页面、三类编辑与 Turnstile 客户端 | 匿名零业务 API 浏览；失败输入不丢；无配置明确关闭；构建能导出 /feedback |
| 3 | 审核 API、CAS、租约与 UI | 无权限 401/403；两个审核员抢同条一方 409；过期可恢复；只变草稿 |
| 4 | 暂存、batch、finalize 与超时补账 | N 条同 batch 一个 commit；失败留草稿；成功后补状态不重 commit |
| 5 | 平台预览部署和公共入口开放 | 完整用户路径验收，真实额度增量记录，关闭写入仍可浏览与管理 |

步骤 2 的页面可以先做离线预览，生产提交保持关闭直到 1、3、4、5 满足。不要只部署一个可点却丢数据的按钮。

必要测试优先覆盖：跨天重试、同 ID 异正文并发、R2 已写/DO 未确认、旧 token 重试、DO 重启、预算边界与 IPv6/NAT、多管理员 CAS、重复 roundId/slot/换 BID、整轮六值与 SV/SPECIAL 不动、草稿跨账号隔离、同字段手改、batch 响应丢失、finalize 失败补账、数据保存一次只创建一个 commit。

已有相关测试：`suggestion-validation.test.mjs`、`suggestion-patch.test.mjs`、`suggestion-apply.test.mjs`、`feedback-worker.test.mjs`、`round-reference.test.mjs`、`map-browser-rows.test.mjs`、`batch-conflicts.test.mjs`。修改后运行对应测试、三套 typecheck、构建及改动文件 lint；重任务串行，避免同时开多个开发服务器。平台验收单独记录。

## 可直接交给接手 AI 的任务说明

> 请读取本清单及链接的原设计，先检查当前 git diff，保留头像与其他现有工作。完成匿名反馈提交、后台审核到暂存、保存全部 batch 和 finalize 补账闭环，优先修复清单 A 的 Worker 缺口。复用已有纯函数，不自动写比赛 JSON，不逐条 GitHub commit，不强制登录，不开放公开建议列表。不把未配置的 Cloudflare 服务说成已上线。先实现可本地验证的代码和部署说明，部署前再核实账号配置与授权。只把缺凭据/平台能力的具体项留给站长，其余代码、测试、页面预览继续完成。最终按“已实现 / 已测试 / 待部署 / 待站长提供”分别交接。

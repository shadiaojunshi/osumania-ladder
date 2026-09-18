# 匿名访问、额度保护与反馈功能实施方案

日期：2026-09-18。状态：**设计交接，反馈和限流功能尚未实现**。不要把本文中的阈值、绑定、Turnstile、熔断和邮件能力当作已经上线。

## 1. 建议直接采用的产品决定

保留匿名浏览。首页、下载页、反馈浏览页都不要求登录，也不在加载页面时自动挑战访客。

| 项目 | 首版建议 |
| --- | --- |
| 入口 | 页头加“反馈”到独立 `/feedback`；首页谱面详情、下载页补上下文入口 |
| 浏览方式 | 复用 RealTypeMapBrowser 的键型／比赛／轮次筛选，不做长问卷 |
| 三种建议 | 槽位实际键型、槽位难度、整轮参考难度 |
| Turnstile | 开启，只在提交时；后台必须验证，不能只看前端勾选 |
| 建议列表 | 仅管理员可见；提交者只得到收据编号，不提供公开列表／搜索 |
| 理由 | 可选，最多 500 字；整轮参考修改强烈提示补理由，但不强迫填写长问卷 |
| 截图 | 首版不支持文件上传；可选最多 2 个 HTTPS 证据链接，各不超过 500 字符 |
| 登录 | 不强制；昵称可选，不将匿名昵称当身份凭证 |
| 发布 | 采纳仅进入暂存；“保存全部”才执行现有 batch，一批一个数据 commit |

入口预填 `tournamentId + roundId + slot`，轮次建议不带 slot。路径参数必须编码，不能直接拼带 `/` 的槽位。不要只保存数组下标：数据排序后下标可能指向另一张谱。

## 2. 先厘清会消耗什么额度

目前 `next.config.js` 使用 `output: 'export'`，首页比赛数据来自 `src/generated/tournaments`。打开详情展示 realType、搜索、切换排序和筛选都可以在浏览器内完成，无需 API。

| 操作 | 主要消耗 | 保护方式 |
| --- | --- | --- |
| 读取导出的 HTML／JS／静态 JSON | 静态托管和带宽规则；正常不需要执行 Functions | 验证部署路由只让 API 进入 Functions；静态缓存 |
| 点击谱面预览、OAuth、访问 `/api/*` | Workers／Pages Functions 请求、CPU，以及端点实际读取的 KV/R2／上游 | 边缘限流；昂贵操作单独预算；按需加载 |
| KV get/list/put | 分开的读、列举、写额度 | 列表分页、缓存、避免每个匿名访问都读权限数据 |
| R2 get/list/put／存储 | Class A/B 操作和存储量等 | 页面浏览不访问桶；限制提交与审核操作；生命周期 |
| GitHub commit 与 Pages 自动部署 | API、构建次数 | 反馈不提交 Git；审核积累后 batch |
| Actions 合包／镜像 | Actions 时间、外部存储和请求 | 独立审查流程；不因每条反馈自动启动 |

“每天 100000”不能笼统当成一种额度：可能指 Workers 请求，也可能指 KV 读取。上线前在账号控制台逐项记录当前套餐、限额、重置时区和已有平均/峰值用量。500/月构建也以当前 Pages 套餐为准。本文不假定已购买 WAF 限流或其他付费能力。

不要把 `/api/*` 的 401 当成免费拒绝：鉴权中间件已经被调用，可能已消耗请求额度。强制进站登录不能解决这件事。CORS 也拦不住脚本直接请求。

发布工序中检查 Pages 生成／使用的 `_routes.json`。建议显式版本化到 `public/_routes.json`，仅包含 `/api/*`（如另有动态路由则逐条加），exclude 按实际需要设置；构建产物 `out/_routes.json` 必须存在并经过 Wrangler/预览部署验证。不能直接设置 `/*` 再声称静态刷新不耗 Functions。此项只规划，未修改当前路由。

## 3. 服务与权限结构

```text
静态 Pages：/、/download、/feedback
  ├─ 读取随构建发布的比赛/参考标尺数据
  └─ POST 反馈 → 边缘规则 → 独立反馈 Worker
                          ├─ Turnstile 服务端验证
                          ├─ 原子额度协调器（可选方案见下）
                          └─ 私有 SUGGESTIONS_BUCKET/suggest/...

已登录管理员 → 现有 /api（鉴权/角色验证）
  ├─ 建议审核 API → 私有建议桶
  ├─ 采纳 → 本地 stagedChanges + 建议来源记录
  └─ 保存全部 → tournaments/batch → 1 次 Git commit → Pages 构建
```

公开 Worker 仅绑定独立建议桶；**不绑定** LADDER_KV、主 maps 桶、备份桶，不配置 GITHUB_TOKEN/SESSION_SECRET/邮件密钥。只实现固定提交路由，不提供任意 key 读写、删除、列表接口。R2 普通前缀不是 IAM 安全边界；同一绑定通常能访问整个桶，不能因为叫 `suggest/` 就认为碰不到其他数据。

建议桶关闭公开读取。对象名由服务端生成，拒绝客户端传入 key、状态、审核人、commitSha 等字段。约定 `suggest/items/YYYY/MM/DD/<uuid>.json`，审查状态可放 `suggest/reviews/<uuid>.json`。若要求凭据级别防止公开服务改审核状态，应把审核状态放第二个私有桶，或者完全交给只有后台可调用的协调器；不能靠同桶不同前缀实现这一点。

独立 Worker／桶／KV 可以隔离权限和部分存储损耗，**不能保证同一 Cloudflare 账号的请求总额度相互隔离**。所谓“反馈先熔断、后台不死”只能作为预防目标：Worker 内熔断仍需处理一次请求。边缘阻断才能在执行前减少进入 Worker 的流量；真正要求硬隔离时，应评估独立账号/独立计费边界或提高容量，并保留不依赖本站 API 的 GitHub 恢复通道。

## 4. 分层反滥用和建议初值

以下是小型站点的保守起点，先观察再调；不是平台保证，也不是已经生效的设置。

1. 边缘层：仅对反馈提交、OAuth 和动态 API 设置适合该路径的限流/挑战。确认套餐支持的 WAF rate limiting、Bot Fight 模式及例外能力；不要假定 Bot Fight 一定能按路径绕过。避免对大文件下载和全站静态资源设置过低共享阈值。反馈 Worker 的默认 workers.dev/预览地址要关闭或执行同等规则，不能绕过自定义域保护。
2. 请求层：只允许 POST + application/json；精确 Origin 白名单（仅防浏览器跨站，不能视为鉴权）；实读最多 8 KiB；拒绝额外字段、嵌套任意 JSON、非法数值和超长 ID。超出即取消流，不先 request.json() 再检查。
3. 人机验证：服务器调用 Turnstile siteverify，验证 success、预期 hostname 和 action=`feedback_submit`；设超时，失败/不可用不写 R2；处理过期及重复 token，重试需新 token 或使用已确认的幂等收据。密钥只在服务端。
4. 频率层：可信 `CF-Connecting-IP` 参与 HMAC，按天轮换用途密钥/盐；日志不保存原始 IP。建议成功提交同 IP 每 10 分钟 5 条、每天 30 条；相同目标和值短时间合并/拒绝重复。另设尝试次数限制（如每分钟 10 次），否则失败挑战也可刷验证请求。NAT 校园网/公司网可能多人同 IP，提示等待且保留用户内容，不能永久封禁。
5. 全局层：建议初始每天最多接纳 300 条、最多验证 2000 次；同时设置分钟突发预算和待审核总量上限。每日 R2/协调器实际操作预算包含重试、幂等记录、审核列表和清理，不能只数成功提交。剩余额度低时返回 503，停写；按 IP 超限返回 429 + Retry-After。
6. 运维层：提供无需代码构建的边缘关闭开关，关闭提交但静态页仍能浏览。不要用“每请求从管理员 KV 读开关”制造新的公共 KV 消耗。恢复条件人工确认；监控按聚合周期输出，禁止每个恶意请求写一条持久日志。

IP 限流只是一层：代理池、IPv6 轮换可绕过，NAT 又会误伤。只信 Cloudflare 平台注入的地址，不能接受客户端自定义 X-Forwarded-For。不要将 IP 原文或不加密钥的短哈希作为可公开的访客标识。

**原子计数选择：**如果需要“最多接纳 300 条”的严格全局保证，建议用一个 SQLite Durable Object 作为额度与幂等协调器，按小时/天分表或桶记录计数，定期清理。先核对当前套餐支持、请求/存储定价；DO 自身也耗额度。IP 计数不必一人建一个永久对象，防止基数攻击。提交前原子预留额度，失败保守占用或安全释放；拒绝态在 Worker isolate 短缓存可减少 DO 调用，但不是全局保证。KV 的 get→加一→put 和 R2 一个共享 counter.json 都不能当原子计数；免费边缘限流与内存计数只能实现尽力防护，必须明确上限会有超调。

## 5. 类型契约：避免把三类修改混在一起

建议共享纯类型放 `src/lib/suggestions/types.ts`，纯校验及补丁逻辑放同目录，不依赖 React 和管理员组件。公开/后台服务的运行时校验共享同一份可打包源码。

```ts
type Target = { tournamentId: string; roundId: string; slot?: string; beatmapId?: number }
type Proposal =
  | { kind: 'slot.realType'; target: Target & { slot: string }; value: string }
  | { kind: 'slot.difficulty'; target: Target & { slot: string }; value: { difficulty?: number; difficultyLn?: number } }
  | { kind: 'round.reference'; target: Target; reference: { tournamentId: string; roundId: string; offset: number }; value: { rc: number; hbRf: number; hbLn: number; ln: number; tbRf: number; tbLn: number } }
type Submission = {
  schemaVersion: 1
  clientRequestId: string // UUID，同一次提交重试不变
  datasetVersion: string // 构建时的数据版本
  baseFingerprint: string // 相关目标字段快照摘要，仅用于冲突提示，不是可信授权
  proposal: Proposal
  reason?: string
  evidenceUrls?: string[]
  alias?: string
  turnstileToken: string // 验证后不持久保存
}
```

难度范围复用现有 `validation.ts` 的业务上下限，**不可拿显示标尺 16.5 当数据上限**；不得将 0 同时解释成“没填写”和“删除值”。第一版仅允许正数修改，清空难度另设显式业务操作，不能隐含在空输入中。HB/TB 的双难度与 LN 的 difficulty 存储方式必须沿用现有规则，UI 明确 RF/LN 标签。

键型 value 由 `realTypeCatalog.ts` 白名单及已有规范化函数校验；自定义键型如需要支持，纳入构建时发布的目录，禁止任意字符串写入。同一首歌不同轮/槽不联动修改。

**整轮参考难度的语义已按代码核实：**`RoundRefPicker` 产生 rc/hbRf/hbLn/ln/tbRf/tbLn 六个值；`RoundEditor.applyRoundRef` 不只是改 `round.difficulty.average`，而是更新 RC/HB/LN/TB 对应谱面的难度、更新并锁定 `_typeDiffs`、重算 summary；SV 和 SPECIAL 不改。实施时把这段计算与序列化抽成共享纯函数，详情必须展示受影响的全部槽位。不要创建一个孤立的 average 输入然后宣称“整轮参考已生效”。

公开参考选择器复用 `referenceData.ts` 的计算，参考标尺也随构建静态发布。当前 `RoundRefPicker` 会请求后台 `fetchLadder()`，不能原样 import 到公开页造成 401 和额度浪费。记录用户选中的参考轮、offset 和当时六个结果；采纳时重新计算并显示变化，不能无提示套用后来更新的参考数据。

建议对象另含服务端 `id/receivedAt/payloadHash/ipHash`。前端提交的数据版本与 fingerprint 都可能伪造，只用于提示；真正采纳必须读取 GitHub 当前权威文件并再次校验。

## 6. R2 写入、幂等与审核状态

公开提交不调用 GitHub。建议正文不变，审核决定与正文分开记录。推荐状态：`pending → staged → applied`，以及 `pending/staged → ignored`；撤销暂存回 pending。`staged` 表示已放进某位管理员的待提交草稿，不能显示成“已修改网站”。

DO 可按 `clientRequestId + payloadHash + visitorScope` 保存短期幂等记录。先预留确定的 suggestionId/key，再写 R2，写成功再确认收据；R2 成功但响应/协调器确认失败时，重试检查该预留的对象，只返回同一收据。相同 requestId 不同 payload 返回 409。对象写失败不得返回已收到；不得靠 R2 LIST 找重复。

R2 不提供跨对象事务。不要用“删 pending 对象、写 accepted 对象”假装原子迁移。审核状态使用 DO 串行变更或 R2 ETag 条件写 compare-and-swap（部署前验证使用的 API 支持所需条件）；传入 expectedRevision，过期返回 409，不覆盖另一位管理员的决定。

后台列表分页 50 条，cursor 有界；首版可按日期列举不可变正文并读取该页状态，明确每页成本。若引入 DO 状态索引，只把摘要和索引放协调器，正文仍在 R2；索引更新失败要能按日期重建。别每次刷新全桶 list，更别公开匿名提供 list。对 accepted/ignored 设置如 90 天保留，pending 如 180 天；R2 lifecycle 按所采用的实际前缀设计，不能只在 JSON 里写 expiresAt 就认为会自动删除。

证据链接仅作为文本/外链展示，`noopener noreferrer`；不抓 URL 内容、不代下载、不做代理图片，避免 SSRF 和隐私泄露。理由按文本渲染，禁用 HTML/不受限 Markdown。审核列表不得暴露 IP/token。

## 7. 接入现有 staged changes 和一次保存

现有入口：`src/app/admin/page.tsx` 的 `handleStageMapChange`、`fetchAuthoritative`、`handleSubmitStaged`。草稿以比赛 ID 聚合，含 data/baseSha/baseline。沿用现有三方合并，不用构建时 JSON 配一个新 SHA 去覆盖远端。

1. 审核员点击“采纳到暂存”：读取当前权威比赛；若已有该比赛草稿，在最新草稿上打补丁。
2. 用 tournamentId/roundId/slot 定位，核实 beatmapId 和基础字段；目标不唯一、已删除、被替换或冲突时要求人工选择，不使用 `roundIndex || fallback` 自动碰运气。
3. 比较当前值、原值、建议值；显示 old→new 及整轮影响范围。已有暂存对同字段做了不同改动时不能直接覆盖；相同建议可以合并来源。
4. StagedEntry 增加 `suggestionChanges`，逐条记录 suggestionId/revision/target/before/after，而非只记一串 ID。手动再改相同字段会让原建议标记为 superseded，不能无条件标 applied。
5. 审核状态变 staged 需记录 reviewerUid、draftId、租约到期时间。浏览器草稿丢失／清空时释放租约或过期可重新采纳；不能永久“处理中”。localStorage 草稿仍按用户隔离，跨标签页按 revision 检测变化。
6. 保存全部提交一次 `/api/tournaments/batch`，继续遵守每次最多 200 文件及实际总请求体上限。commit 成功前不改 applied；冲突/网络失败保留所有草稿和来源。
7. batch 返回 commitSha 和每文件新 blob SHA。对实际成功应用的建议调用 finalize（可以批量），持久记录 commitSha/审核人/时间。后端核对该 commit 及对应补丁结果，不能只信客户端说已保存。
8. 若 GitHub 成功但 finalize 失败：标记“数据已保存、审核状态待同步”，按 commitSha + suggestionId 幂等补账，**不再次创建相同数据 commit**。可把批次 ID 放 commit trailer 方便超时后查找。

“N 条建议一次构建”的准确边界：提交/忽略/暂存都不触发构建；N 条在同一有效 batch 内保存，产生一个数据 commit。超过批次大小、分多次保存、部署功能代码或其他流水线另写清单都会产生额外提交/构建。不得承诺所有场景永远只有一次。接入后确认没有 feedback→GitHub 自动同步任务。

## 8. 推荐目录与 API

| 模块 | 职责 |
| --- | --- |
| `src/app/feedback/page.tsx` | 独立静态页，展示筛选和上下文 |
| `src/components/maps/MapBrowser.tsx` | 从 RealTypeMapBrowser 抽出浏览表格，数据和行操作通过 props 传入 |
| `src/lib/mapBrowserRows.ts` | 生成稳定行身份、排序、过滤；公共纯逻辑 |
| `src/components/feedback/FeedbackDialog.tsx` | 紧凑的三类建议编辑，提交时 Turnstile |
| `src/lib/suggestions/{types,validation,patch}.ts` | 判别联合、白名单、纯补丁、冲突比较 |
| `src/lib/roundReference.ts` | 从现有编辑器抽出的整轮应用/派生值计算 |
| `workers/feedback/` | 独立 Worker + 配置样例；仅建议桶和 Turnstile/额度绑定 |
| `functions/api/suggestions/` | 管理员列表、单条详情、review、finalize；继续走现有鉴权 |
| `src/components/admin/SuggestionReview.tsx` | 审核预览、忽略、采纳到暂存；不能自己保存比赛 |
| `docs/feedback-operations.md` | 套餐实测、绑定检查、预算、关闭/恢复、隐私与数据保留 |

公开：`POST /v1/suggestions → 201 { id, receivedAt }`；重试返回相同收据。禁止公开 GET 列表/正文。未知 ID 状态查询首版不做，避免枚举。

后台：`GET /api/suggestions?cursor=...`，`GET /api/suggestions/:id`，`POST .../:id/review { action, expectedRevision, draftId }`，`POST /api/suggestions/finalize { commitSha, items }`。所有审核至少 admin；先保持现有比赛编辑角色不变，不顺手扩权。

公开浏览组件直接从 `realTypeCatalog.ts` 引用目录，不再绕经 MapSlotEditor；保留管理员浏览器适配器和其暂存功能。不能把 admin 页连同 OAuth、KV 请求一起带入公开包。

## 9. 实施顺序和验收

1. 先记录实际额度和路由，验证匿名刷新不触发 Functions/KV；搭建独立建议桶和服务，默认关闭写入。
2. 抽出纯浏览/参考/补丁逻辑，现有后台回归通过后接静态反馈页。
3. 先完成服务器 schema、真实流限长、Turnstile 和预算控制，再开放 POST。
4. 完成审核 → 暂存 → batch → finalize 的失败恢复路径；最后加公共入口。
5. 低预算灰度，分别验证正常提交、机器人重复请求和关闭开关；Cloudflare 控制台对照真实请求/存储操作增量。

验收必须包括：匿名首页/筛选/键型展示零业务 API；合法提交无 GitHub 调用；未授权审核 401/403；回放/过期/错误 hostname 的 Turnstile 被拒；伪造字段/路径穿越/缺长度头/超长 UTF-8/NaN 被拒；跨两实例并发超预算不超写；IPv6/NAT 策略；同 requestId 幂等与冲突；R2 成功后响应丢失不重复；两个管理员 CAS 冲突；目标改名/换 BID 后不误改；跨多建议同一文件合并；整轮不动 SV/SPECIAL；保存失败保留草稿；commit 成功 finalize 失败不重 commit；清空暂存可重新采纳；100 条建议一次合法 batch 只创建一个数据 commit；关闭反馈后后台及静态资源按预期仍可访问。

平台能力核对入口（实施时查看当前文档和账号实配）：[Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/)、[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)、[KV limits](https://developers.cloudflare.com/kv/platform/limits/)、[R2 pricing](https://developers.cloudflare.com/r2/pricing/)、[Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)、[Rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)、[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)。

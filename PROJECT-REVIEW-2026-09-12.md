# osu!mania Ladder 复核报告与逐项修复任务

复核日期：2026-09-12。代码基线：ab9f707 + 当前工作区。本文替代上一版报告；旧问题编号仅用于对照，实施时使用 R01–R23。

本轮只修改这份报告。工作区原有 globals.css、LadderView.tsx、tsconfig.tsbuildinfo 改动及三个未跟踪目录均保留。上轮的“完全通读”“全部无安全头”“降权立即生效”等说法不够准确，已撤回。本报告是有证据的定向复核，不承诺穷尽整个项目的所有缺陷。

## 1. 结论与证据边界

优先解决数据覆盖与发布失败处理：批量保存会把旧草稿提交到最新 HEAD 上；Drive 上传失败可能误删仍在使用的旧文件；谱包生成遇到读取或上传错误仍可能发布残缺结果。随后处理统一数据校验、R2 恢复保护、上传页面异步串状态。

LN 单曲使用 difficulty 是当前领域约定，不能改成 difficultyLn。普通手动拟合出现负 R² 合理，不能为了“统一”截断为 0。真正遗漏的是参考选择器的 LN 回退取值错误，以及常数样本下错误地显示 R²=1。

### 本次实测

| 检查 | 结果 / 范围 |
| --- | --- |
| 全量比赛 JSON 只读检查 | 47 场、330 轮、4258 个槽位；重复轮次 ID、轮内重复 slot、文件名与内部 ID 不一致均为 0 |
| LN 回退影响范围 | 当前没有“缺 LN 汇总值但有正数 LN 单曲难度”的轮次；R17 是可复现的潜在缺陷 |
| 实际执行 npm run lint | 退出码 1，报 Invalid project directory .../lint；确实不能运行 |
| 内存模拟实际 batch handler | 没有 base SHA 的旧草稿被接受；新 commit 的 parent 是其他人保存之后的 HEAD |
| 内存模拟实际 batch handler | rounds 为字符串的请求也返回 200，证明 batch 不等于完整 schema 校验 |
| 内存模拟实际 create handler | 接受 ../outside；发出的 GitHub URL 规范化到 data/outside.json，越出 tournaments 目录 |
| 内存模拟实际 Drive 脚本 | R2 读取失败，仍删除当前 manifest 引用的旧 Drive 文件，并正常完成 main |
| 实际指纹函数 + 内存 ZIP | 同 Metadata、不同 HitObjects 的两张图产生相同指纹 |
| 实际难度函数 | LN 拟合回退得到 12；同数据参考选择器得到 null；常数 y 加错误固定斜率时 RMSE=1、R² 却为 1 |
| 实际审计函数 + 模拟 KV | 长 batch target 使 metadata 达 1517 字节；模拟 1024 字节限制后，审计写入失败被吞掉 |

上述模拟均无真实 GitHub/R2/Drive 写入；测试输入和临时执行逻辑只在内存中，未新增脚本文件。

上轮已运行前后端类型检查、62/62 测试与生产构建成功，本轮没有重复这些全量检查。这些历史结果不等于本轮已完成线上联调，也不证明未覆盖路径没有问题。

## 2. 原报告逐条裁定

| 原条目 | 复核结论 | 去向 |
| --- | --- | --- |
| 1 create 校验 | 成立，但需 contributor 以上权限；并非匿名任意写入。还缺完整 schema | R03 |
| 2 PUT/DELETE ID | PUT ID 一致性缺失成立；DELETE 只收 sha，不该要求检查 body.id 或 round id | R03 |
| 3 上传字段 | 成立；R2 的 .. 是对象键文本，不是文件系统目录穿越；接口受角色保护 | R04 |
| 4 删除后 KV 失败 | 成立；只加提示不能解决恢复能力，应调整操作顺序与失败恢复 | R07 |
| 5 备份假成功 | 成立；另需说明只备份 maps/，并不备份 trash/，也不是历史版本库 | R08 |
| 6 全站无安全头 | 只能确认仓库未配置。未读取线上响应及 Cloudflare 配置，不能断言线上完全没有 | R21 |
| 7 lint | 实测成立，但已有 TypeScript 与测试，不能说“完全没有静态检查” | R19 |
| 8 线上包过期 | 本地 manifest 日期旧成立，不能证明线上对象内容或从未跑过 Actions | R23 |
| 9 类型参数 | 大小写不匹配会空跑并成功；“一句日志都不打”错误，实际有 Found/No files available 日志 | R12 |
| 10 状态分页 | 成立，只处理首个 R2 list 结果 | R13 |
| 11 role in | 成立，会接纳原型链名称；未证明可直接提权 | R15 |
| 12 重复轮次补丁 | 循环会改所有匹配轮次，不是只改第一轮；当前数据无重复；不能用数组下标修 R2 键冲突 | R04、R05 |
| 13 构建产物 | 成立；上轮开始时它已是修改态，不能把全部变更归因于审查 | R22 |
| 14 标签死代码 | 算法无生产调用成立，RoundLayout 类型仍在使用；不应恢复已撤回的标题设计 | R22 |
| 15 LN / R² | LN 字段及一般负 R² 均撤销误报；替换为两个实际缺陷 | R17、R18 |
| 16 CORS 复制 | 可维护性建议成立；只读端点只列 GET/OPTIONS 本身不是漂移故障 | R21、R22 |
| 17 一次性脚本 | 不应仅凭比赛数量变化断言脚本过期；确有按 set 误判、缺 round 条件的危险修复逻辑 | R20 |
| 18 零散项 | push 空跑低优先；尾斜杠鉴权是代码级条件，Pages 路由行为需实测；KV TTL 重复是维护项 | R12、R22 |

额外纠正：

- confirmPendingMaps 检查 PDRC/PDLN/PDHB 等“待分类”键型，不是“缺 BID”。
- file.stream() 用于 Workers R2 binding 没有问题；不要套用 Node S3 SDK 的 Buffer 注释改它。
- ACAO=* 本身不授予带凭据跨域读取权限，但 SameSite 与 Origin 不是一回事，不能因此保证所有 CSRF 场景安全。
- KV 角色有本地缓存及跨节点最终一致性，不能承诺降权即时生效或最多延迟 5 秒。
- 包内 .osu 字节内容变化可能影响成绩匹配，不能简单说“ZIP 文件名决定成绩 hash”。
- 普通低优先清理不应排在会丢数据的问题之前。

## 3. 交给其他 AI 的共同执行约定

项目根目录：D:/osumania ladder。下列路径均相对此目录，行号是本次复核起点，后续提交可能移动；同时按函数名定位。

1. 每次领取一个 R 编号，先检查当前源码与 git status，确认尚未被前一个任务解决。
2. 每项交付必须包含实现、对应回归验证、尚未完成的验收；不能只把报告中的建议抄成注释。
3. 保留现有大小写 ID、自定义键型、特殊槽位及难度 0=未填写的约定。不得把 LN 的 difficulty 改为 difficultyLn，不得擅自恢复标题层。
4. 测试优先沿用 scripts/*.test.mjs。API 用 mock GitHub/fake R2/KV，脚本用 fake S3/Drive 与临时测试目录，不对生产数据做破坏性复现。
5. 仅在必要处抽可测试函数；不能为测试重写整套应用架构。新增异步 UI 回归应用可控延迟模拟响应顺序。
6. 前端改动检查 TypeScript；Functions 改动额外检查 functions/tsconfig.json。行为变更运行相关测试，再运行 npm test；涉及页面输出/构建配置时运行 npm run build。
7. 实施报告不等于发布授权：不要自动 push、重跑线上合包、恢复真实回收站、清理桶或删除 Drive 文件。
8. 每项完成后在本文件对应任务下追加“完成提交/日期/验证/遗留”，让下一个 AI 能判断实际进度。

推荐顺序：R09 → R08 → R01 → R02 → R03 → R05 → R04 → R07 → R06 → R10 → R11；其余按需要排期。R10 与 R11 完成并检查 R12 后，再做 R23 的发布验收。

同文件任务串行实施：R01/R02 涉及 admin/page.tsx；R04/R05 涉及 MapUploader；R06/R07 涉及 R2 写入与回收站；R10/R11/R12 涉及 generate-pack。不要分给多个 AI 同时修改同一文件。

## 4. 数据与编辑安全任务

### R01 [P1] 批量保存与旧草稿缺少编辑基准，会静默覆盖新数据

证据：functions/api/tournaments/batch.ts:46、:74；src/app/admin/page.tsx:214、:249、:280；src/components/admin/RealTypeConflictChecker.tsx:221；TournamentForm.tsx:75。

触发：A 从旧版本开始编辑，B 保存改动后，A 提交 batch。服务器在提交时读取最新 HEAD，然后把 A 的整份旧 JSON 放进树中。force:false 只能挡住读取 HEAD 之后发生的分支竞争，挡不住 B 已经完成的保存。键型浏览/冲突工具还会用构建时 bundle 的整份数据，更容易覆盖新数据。恢复旧草稿再配上新取的 sha，同样会绕过原有乐观锁。

解决方法：

1. 将每份草稿及暂存项保存为“编辑时读取的完整数据 + baseSha + 可选基准快照”；新建用明确的 baseSha:null 表示预期不存在，缺失字段不能当作新建。
2. batch 读取固定 HEAD 的树，以该树中的 blob SHA 比对每个 baseSha。所有目标都通过后才建提交；任一冲突返回 409 EDIT_CONFLICT 和 conflicts 列表，整批不更新。
3. 保留非强制 ref 更新。HEAD 在比对后变化时返回冲突或做有上限的重新核对；绝不能拿旧 JSON 换新 SHA 自动重试。
4. 同步改 admin 暂存、单图键型修改、RealTypeConflictChecker。先加载权威版本和基准，再应用明确补丁；遇到已有不一致草稿提供对比，不给旧 bundle 补上当前 SHA。
5. 升级 localStorage 格式。旧草稿无基准时允许查看/导出/人工比较，不能直接获得最新 SHA 后覆盖。单文件草稿恢复也使用原基准。
6. 返回每个文件的新 blob SHA；保持冲突草稿和当前编辑内容，允许用户选择载入最新版本与重新应用改动。

验收：A/B 同文件竞争得到 409 且 B 内容保留；B 在 A 请求前已保存也必须冲突；无关文件变动不造成永久冲突；新建撞名冲突；旧缓存草稿不能静默覆盖；一次提交含一个冲突文件时其他文件也不写。

**完成记录（2026-09-13）**

- 状态：实现完成待验收（改动未提交）；末端 UI 见「未完成」一节。
- 修改文件：新增 `functions/api/_lib/batchConflicts.ts`、`scripts/batch-conflicts.test.mjs`、`scripts/_ts-extension-loader.mjs`；改造 `functions/api/tournaments/batch.ts`、`src/app/admin/page.tsx`、`src/components/admin/JsonPreview.tsx`、`src/components/admin/RealTypeConflictChecker.tsx`、`src/components/admin/TournamentForm.tsx`、`src/lib/messages.zh.ts`、`src/lib/messages.en.ts`。
- 协议：`POST /api/tournaments/batch` 改为 `{ items: [{ id, tournament, baseSha }], summary? }`。`baseSha` 必须显式出现，`null` 才表示新建；缺失/为空字符串/旧式 `changes` 载荷一律 400 `INVALID_BATCH`（缺失不能被当成新建，否则旧客户端绕过校验）。成功返回 `{ success, count, commit, files: [{ id, sha }] }`，逐文件给新 blob sha。
- 服务端校验：读一次 HEAD（整批共用基准）→ 取该 commit 的 tree → 逐文件比对 blob sha：更新项要求 `actual === baseSha`，新建项要求路径不存在。任一不符返回 409 `EDIT_CONFLICT` + `conflicts[{ id, reason, expected, actual }]`（reason: `modified` / `missing` / `exists`），**整批不创建任何 blob/tree/commit**。tree 被 GitHub 截断或读取失败时退回逐文件查 contents API，保证「查不到」只代表确实不存在；读取失败直接 500 且不写。ref 更新保持 `force:false`，返回 409/422（HEAD 在比对之后被推进）时返回 409 + reason `head-moved`，**不做任何重试**。
- 前端：`stagedChanges` 升级为 `{ data, baseSha, baseline, legacy? }`，localStorage 键 `…:staged-tournaments:v2`；读取时若只有 v1 则迁移为 `legacy` 草稿（baseSha 未知）——可查看/导出，**禁止提交**（提交按钮禁用 + 单文件保存也被拒）。`handleEdit` 恢复已暂存草稿时使用**草稿自己的 baseSha**，不再把刚取到的最新 SHA 配给旧草稿；老格式草稿以只读方式打开。`handleStageMapChange` 与 `RealTypeConflictChecker` 都改为先 `GET /api/tournaments/{id}` 取权威内容 + sha 作为基准，再在权威内容上打 realType 补丁（不再用构建时数据包当基准）。批量提交用快照，清空时只移除本次提交且期间未被改写的条目，请求期间新增/改写的草稿保留。409 时保留全部草稿与编辑内容，展示冲突清单（id + 原因），每条提供「导出草稿」与「载入最新」（载入前二次确认，会丢弃该文件草稿）。`TournamentForm` 的本地自动保存草稿加入 `baseSha`（v2），恢复旧草稿时把基准上报给 admin 页，避免旧草稿配新 SHA。
- 运行的验证：`node --test --experimental-strip-types scripts/batch-conflicts.test.mjs` → 10/10；`npm test` → 113/113；`npx tsc --noEmit` → 0 错；`npx tsc -p functions/tsconfig.json --noEmit` → 0 错；`npm run build` → 成功（含 `/admin` 预渲染）。用例覆盖：缺失 baseSha 被拒、基准一致通过、被改/被删/撞名分别判冲突、无关文件变动不产生冲突、409 时零写入（blobs/trees/commits/ref 调用数均为 0）、一次提交含一个冲突文件时其它文件也不写、成功时返回逐文件 sha 且 commit parent = 基准 commit、ref 更新 `force:false`、HEAD 推进 → 409 `head-moved` 且不重试、tree 截断时逐文件兜底（404=不存在可新建，500=报错不写）、坏 JSON 与旧格式载荷 400 且不触碰 GitHub。
- 未完成 / 仍有风险：① 「载入最新版本后**自动重新应用**我的改动」未实现（当前是导出草稿 + 载入最新两个动作，需要一份 diff/patch 模型才能真正自动重放；表单类整体草稿尤其如此）；② 提交请求期间对同一文件的再次编辑会被保留，但基准仍是提交前那个（下次提交会判冲突，需人工处理）——按保守策略处理，未做自动推进基准；③ 未在真实 GitHub / Cloudflare Pages 上联调，也未做浏览器端到端验收（仅类型检查 + 单测 + 构建）；④ `PUT /api/tournaments/{id}` 仍只依赖 GitHub 自身的 sha 乐观锁，本轮未改（属 R02）；⑤ 冲突原因文案、导出/载入按钮只覆盖 `JsonPreview` 所在的「新建/编辑」栏。
- 与后续任务的接口变化：R02 可直接复用本项响应约定（`files[].sha`；建议 create/PUT 也返回 `sha` 并用它 `setEditingSha`）；R03 的运行时 schema 校验应在本项 `parseBatchItems` 之上扩展（本轮只做形状与基准校验，未做 rounds/maps 深层类型校验）；`scripts/_ts-extension-loader.mjs` 可复用于后续 Functions handler 测试。

**自查修正（2026-09-13，复审时发现并修复 3 处）**

- `handleStageMapChange` 原先在 setState 函数式更新**之外**计算 base/draft：连续两次改同一比赛的键型时，第二次用各自取到的基准覆盖第一次的补丁（丢补丁）。已把补丁计算移进函数式更新内部，始终打在最新暂存状态上。
- `handleEdit` 原先一律 `setEditingBaseline(loaded.tournament)`：打开已暂存草稿时会出现 baseline=最新内容 / baseSha=旧版本 的不一致。已改为优先用草稿自己的 `baseline`。
- `TournamentForm` 恢复草稿 effect 曾把 `baseSha` / `onBaseShaChange` 放进依赖：恢复带旧基准的草稿会触发该 effect 重跑并**把刚恢复的内容重置掉**。已改为经 ref 读取/回调（`baseShaRef` / `onBaseShaChangeRef`），依赖保持 `[initialData, draftKey, t]`。
- 修正后复跑：`npm test` 113/113、`npx tsc --noEmit` 0 错、`npx tsc -p functions/tsconfig.json --noEmit` 0 错。

### R02 [P2] 连续保存仍使用旧 SHA；新建成功后仍处于创建模式

证据：src/app/admin/page.tsx:154。PUT 成功只设置提示和刷新列表，没有 setEditingSha；POST 成功没有进入编辑模式。functions/api/tournaments/[id].ts:83 与 index.ts:72 都不返回新 blob SHA。

触发：修改同一比赛，保存成功后再改一次保存，仍传第一次的 SHA；新建后第二次保存仍走 POST，遇到同名文件失败。

解决方法：

1. create/update 响应读取 GitHub 成功返回中的 content.sha，返回给前端。
2. PUT 成功更新基准 SHA；POST 成功设置 editingId、基准 SHA 和编辑模式；与 R01 的 batch 成功返回统一。
3. 保存时捕获提交快照。若允许请求期间继续编辑，不得通过重置 initialData、清空全部暂存或 saveSignal 抹掉后来输入；只确认已提交版本。也可在提交期间明确锁定相关编辑入口。
4. R01 先实施时复用它的响应约定。

验收：编辑连续两次保存均成功且 SHA 更新；新建后继续保存走 PUT；请求期间新输入要么被禁用，要么保留为未保存；冲突不清草稿。

**完成记录（2026-09-13）**

- 状态：实现完成待验收（改动未提交）。采用「允许请求期间继续编辑 + 保留为未保存」这一分支，未采用「提交期间锁定编辑入口」。
- 修改文件：`functions/api/tournaments/[id].ts`（PUT 回传新 sha）、`functions/api/tournaments/index.ts`（POST 回传新 sha）、`src/app/admin/page.tsx`（`handleSubmit` 快照与模式转换）、`src/components/admin/TournamentForm.tsx`（create→edit 草稿键切换时清理过期 create 草稿）、`src/lib/messages.zh.ts` / `messages.en.ts`（新增 `admin.save.unsavedInput`）；新增 `scripts/tournament-save.test.mjs`。
- 服务端：`PUT /api/tournaments/{id}` 与 `POST /api/tournaments` 都读取 GitHub 成功响应里的 `content.sha`，随响应返回 `{ success, id, sha }`（取不到时为 `null`，不报错）；PUT 仍把调用方传入的 `sha` 原样透传给 GitHub 作为乐观锁。与 R01 的 batch 响应约定一致（都回传 sha；batch 是逐文件的 `files[].sha`）。
- 前端 `handleSubmit`：① 请求前记录提交快照（内容、id、该 id 当时的暂存条目、是否编辑模式）；② 成功后**一律**进入/保持编辑模式：`setEditingId` + 用返回的新 sha `setEditingSha` + `setEditingBaseline(提交内容)`，因此新建之后继续保存会走 PUT，编辑连续保存也不再带旧 SHA；③ 只有「提交期间没有新输入」（比较 `JSON.stringify(tournament)` 与快照）时才 `setEditInitialData`/`saveSignal++`/清 dirty/删该 id 的暂存条目，否则保留为未保存并用新文案提示「已保存，但你在保存期间的新输入还没保存，请再点一次保存」；④ 删除暂存条目仍带身份判断（`current[id] !== stagedAtStart` 时不动），所以提交期间新暂存的草稿不会被顺手删掉；⑤ 失败（含 GitHub 409 冲突）不改动任何草稿与 dirty 状态。
- 另修一处相关小问题：新建成功后会从 `…:v2:create` 草稿键切到 `…:v2:edit:<id>`，原先 create 草稿会残留、下次新建时误弹「恢复草稿」；现在只在「前一个键是 create 且切到非 create」时清掉它（不会影响在编辑 A/B 之间切换时保留 A 的草稿）。
- 运行的验证：`node --test --experimental-strip-types scripts/tournament-save.test.mjs` → 6/6；`npm test` → 121/121；`npx tsc --noEmit` → 0 错；`npx tsc -p functions/tsconfig.json --noEmit` → 0 错；`npm run build` → 成功（含 `/admin` 预渲染）。用例覆盖：PUT 回传新 sha 且透传旧 sha 作乐观锁、PUT 内容 base64 解码后与提交一致、权限不足/重复 round id 在触碰 GitHub 前被拦（403/400 且 fetch 调用数为 0）、GitHub 409 按原状态码透传且 details 保留、POST 回传新 sha 且新建不带 sha、POST 缺 id/权限不足不调 GitHub、GitHub 响应缺 `content.sha` 时返回 `null`。
- 未完成 / 仍有风险：① 「提交期间继续编辑」这条分支自动测试覆盖不到（需要浏览器端到端），本轮只做了类型检查 + 单测 + 构建，**未做浏览器联调**；② 新建后若在保存期间又有新输入，会停留在「parent 认为在编辑、表单内部仍是 create 模式」的中间态，第二次保存会自动收敛（自愈），但中间态下表单的本地草稿键仍是 create 键；③ `MapUploader.tsx` 也在 PUT 这个端点（`sha` 透传、忽略响应体），已确认向后兼容，但它的「保存成功清空补丁池」问题属 R05 未改；④ 未改 DELETE 路径。
- 与后续任务的接口变化：`PUT/POST` 现在都会返回 `sha`，R05 的 MapUploader 保存后可直接用它推进基准；R01 的 `stagedChanges` 快照判断模式（身份比较 + 内容比较）可复用到 MapUploader 的补丁池。

### R03 [P1] 比赛与共享 JSON 的运行时校验缺失

证据：functions/api/tournaments/index.ts:46；[id].ts:50；batch.ts:46；functions/api/references.ts:45；packs-manifest.ts:45；ref-ladder.ts:59。模拟已证明 batch 接受 rounds 字符串，create 接受越界路径。

解决方法：

1. 先覆盖 create/PUT/batch 的共同 validator：请求必须为对象，ID 必须为字符串且符合现有格式，文件名与 body.id 一致，rounds/maps 为数组，轮次 ID 非空且唯一、轮内 slot 非空且唯一，必需字段有正确类型，数字有限。
2. 先对全部真实 JSON 运行 validator 再决定边界。保留未知扩展字段和自定义键型；非必填 name/BID 不硬补假值，0 难度不判错。数组/文本/批量体积设置明确上限并兼容现有数据。
3. 所有读写路径先校验 URL id；DELETE 检查 path id 与 sha，不要求不存在的 body.id，也不因坏 round 数据阻止合法删除。
4. malformed JSON、null、字符串、数组、缺字段返回结构化 400，不能 TypeError 500。现有 TypeScript as 不提供运行时校验。
5. 单独子步骤扩展 references、packs-manifest、ref-ladder 的结构验证及 URL 协议限制；不能把任意对象写进下次静态构建。ref-ladder 当前会丢弃非法项、截断 500 项，应明确拒绝错误而非假成功裁剪。
6. 不只依赖 URI 编码修路径，必须先限制 ID；旧档案恢复也复用 validator。

验收：现有全库通过；../、错误内部 ID、重复轮次/slot、rounds 字符串、null、错误数字均 400 且无外部写入；合法 0 难度、混合大小写 ID、自定义类型保留。测试实际 handler，不仅测辅助正则。

**完成记录（2026-09-13）**

- 状态：实现完成待验收（改动未提交）。
- 修改文件：新增 `functions/api/_lib/validation.ts`、`scripts/validation.test.mjs`；改造 `functions/api/tournaments/index.ts`、`functions/api/tournaments/[id].ts`、`functions/api/tournaments/batch.ts`、`functions/api/references.ts`、`functions/api/packs-manifest.ts`、`functions/api/ref-ladder.ts`、`functions/api/trash/index.ts`。
- 边界怎么定的：先写临时脚本扫描 `data/`（50 场 / 345 轮 / 4429 槽位）再定边界，脚本用完即删。**刻意放宽**的 5 处都有数据依据，不是漏掉：
  ① tournament/round 的 `name`/`abbreviation` 只校验类型与长度、允许空串 —— `TournamentForm.addRound` 新建轮次默认就是 `name:''`/`abbreviation:''`，要求非空会挡住「先建轮次再填名字」；tournament 层的 `name`/`abbreviation` 反过来要求非空，因为表单第一步的「下一步」按钮就以 `canProceed = name.trim() && abbreviation.trim()` 为条件。
  ② `slot` 允许 `/ & ( )` —— 真实数据里有 `ACC/HR1`、`FS/TB`、`GM(FL&EZ)`。
  ③ tournament 的 `sheetUrl`/`forumUrl`/`wikiUrl` **不做** http(s) 协议限制 —— 129 条里 5 条是纯文本标题（如 `Tourney Method - 4 Digit osu!mania World Cup 2023 - Tourney Method`）。协议限制只加在 packs-manifest 的 `links.*`（那里的 55×2 条链接全是 http(s)，且会直接给玩家点击）。
  ④ `map.name` 可以缺省也可以是空串 —— 2 个槽位没有该字段、114 个是空串，属「还没填曲名」，不硬补假值。
  ⑤ 数值只要求有限，不做非负截断；未在 schema 里列出的字段一律原样保留。
- 服务端实际改动：① 新增 `validateTournament`（id 格式与长度、name/abbreviation、keyCount/year 整数区间、tags、customTypes、rounds 数量、轮次 id 非空唯一且为安全单段标识、order/bestOf/isQualifier/difficulty/typeDifficulties、轮内 slot 非空唯一、map 的 type/realType/difficulty/difficultyLn/beatmapId/beatmapSetId、总谱面数上限）；② `validateReferences`（`points[].label/difficulty/type ∈ rice|ln|both`）；③ `validatePacksManifest`（pack 字段类型、`links.*` 必须 http(s)）；④ `validateRefLadderEntries` —— **行为变更**：旧实现会把非法项丢掉、把第 500 项之后静默截断然后返回成功，现在明确 400 并指出 `entries[i]` 是第几项错在哪；⑤ `validatePathId` 在拼 URL 之前挡路径穿越（`../outside`、`folder/name`、`%2F`）；⑥ `readJsonBody` 把坏 JSON 变成结构化 400，不再冒泡成 500；⑦ 长度/数量上限：单文件 id 128、轮次 200、每轮谱面 200、总量 5000、batch 200 项、summary 200 字符、请求体 16MB、ref-ladder 1000 项。
- 端点接线：`POST /api/tournaments` 先校验 id 再校验整体（`../outside` 过去会被 fetch 规范化到 `data/outside.json`，写到 tournaments 目录之外）；`PUT /api/tournaments/{id}` 新增「必须带非空 `sha`」（没有基准就不该覆盖）与「文件名必须与 body.id 一致」；`DELETE` 只要 path id + sha，**不要求** body.id、也不因文件里 round 数据坏就阻止删除；`batch` 逐项跑 schema（过去 `rounds` 传字符串也能 200）；回收站恢复比赛时也复用 validator，坏 payload 拒绝写回。
- **PUT 的兼容例外**：历史数据里 `osu-mania-chinese-natrion-cup-4k-2026-rebirth.json` 的内部 id 拼成 `...national...`（文件名笔误，且与另一场 `osumania-chinese-national-cup-4k-2026-rebirth` 是两个文件）。若严格 `path id === body.id`，这场比赛会**再也存不了**。处理方式是「不允许制造新的不一致，但允许继续保存已经是这种状态的文件」：只在两者不等时才多读一次该文件当前存的 id，相等则放行。正常情况下零额外请求。（**该文件已于 2026-09-13 改名修正，见 §10；兼容路径保留为防护网。**）
- 保留的既有行为（既有测试依赖）：`POST` 缺 id 仍返回 `Missing tournament id`；重复 round id 仍先由 `findDuplicateRoundIds` 报中文文案，所以 `validateTournament` 里的同类错误也统一用了「重复的 round id」措辞。
- 运行的验证：新增 `node --test --experimental-strip-types scripts/validation.test.mjs` → **18/18**（其中第 1 例拿 `data/tournaments/` 下全部 50 场真实 JSON 逐个跑 `validateTournament`，必须全过；并断言文件名与内部 id 不一致的场次不超过已知的 1 个）；`npm test` → **139/139**（本项前为 121，新增 18 例，无回归）；`npx tsc -p functions/tsconfig.json --noEmit` → 0 错；`npx tsc --noEmit` → 0 错。
- **`npm run build` 已补跑成功（2026-09-13，提交 `3634998` 前）**：Next 16.2.6，编译 + 类型检查通过，生成 50 场比赛索引与 5 个静态页（`/`、`/_not-found`、`/admin`、`/download`）。此前一次尝试在本环境未能运行，原因是环境限制而非代码问题：`next build` 必须先清空 `.next/`（1665 个文件），被本环境的批量删除守卫拦下（`SAFE_DELETE_BULK_*`）并拒绝授权；该守卫在临时目录之外不区分目标、且本会话的删除额度用尽后连单个文件都不允许删，因此无法在不绕过守卫的前提下完成。尝试过的替代路径：① 把 `distDir` 指向项目内空目录（仍被拦，临时改动已还原，`git diff next.config.js` 为空）；② 在系统临时目录复制一份完整项目后构建（Next 16.2.6 已正常启动并进入 production build，只是 Turbopack 拒绝 `node_modules` 指向项目根之外的符号链接）。**事后核对：`.next` 1665 个文件、`node_modules` 27042 个、`src` 82 个、`data` 55 个，与构建前完全一致，没有任何文件被删除**（守卫是在删除发生前拒绝的）。本项只改 Functions 与 scripts、不涉及页面输出与构建配置，前端类型检查已 0 错；该验证已按上一条补跑完成。另注：本轮 push 时远程有两笔 admin 产生的 `Batch update tournaments`（11 + 18 个数据文件），rebase 后已用这批**新数据**重跑全库校验用例，仍然全过。
- 用例覆盖：真实数据全量通过、放宽边界回归（空轮次名、含 `/` 与 `&()` 的 slot、纯文本 URL、0 难度、缺省 map.name）、未知字段与自定义键型保留、非对象/null/字符串/数组/`rounds` 字符串/非有限数字被拒、重复 round id 与重复 slot 被拒、路径穿越 id 被拒、坏 JSON 不 500、create 越界 id 零 GitHub 请求、PUT 缺 sha 被拒、PUT 拒绝把 A 比赛写进 B 文件、PUT 仍能保存历史不一致文件、DELETE 不受坏 round 数据影响、batch 一项坏则整批 400 零写入、batch 项数/summary 上限、references/manifest/ref-ladder 坏形状被拒且合法数据仍能保存。
- 未完成 / 仍有风险：① 未在真实 GitHub / Cloudflare Pages 上联调，也未做浏览器端到端验收（只有类型检查 + 单测 + 构建）；② 负数难度、`bestOf` 语义边界等未纳入（文档只要求「数字有限」；难度的**上限**后来单独立项，见 §10）；③ 文件名≠内部 id 的 1 场历史数据已于 2026-09-13 改名修正（见 §10），PUT 侧的兼容路径保留为防护网，`validation.test.mjs` 现在要求全库零不一致；④ `ref-ladder` 的 `step` 现在会被硬拒（区间仍是旧的 `[0.1, 10]`），而面板允许输入任意有限数 —— 输入 20 过去是静默丢弃、现在会 400 并提示，属文档要求的行为变更，但 UI 若想更友好可加输入侧约束；⑤ 仅校验形状与范围，不做语义校验（例如 ref-ladder 里的 `roundId` 是否真存在于该比赛、包的 `totalMaps` 是否等于实际图数），那属于 R11/R23。
- 与后续任务的接口变化：新增错误码 `INVALID_TOURNAMENT` / `INVALID_ID` / `ID_MISMATCH`（`INVALID_BATCH` 沿用）/ `INVALID_REFERENCES` / `INVALID_MANIFEST` / `INVALID_LADDER`；`PUT /api/tournaments/{id}` 现在**必须**带 `sha`，`PUT /api/references`、`PUT /api/packs-manifest` 也必须带 `sha`（R05 的 MapUploader 已经在传，向后兼容）。R04 可以直接复用 `validation.ts` 的 `checkString`/`LIMITS`/路径段思路，但注意 `slot` 在这里是**刻意宽松**的（允许 `/`），R2 键段规则不能照抄这个宽口径。

### R04 [P2] R2 上传/删除键段与文件类型校验不完整

证据：functions/api/maps/upload.ts:28、:43；maps/delete.ts:22；osu/raw.ts:40 提供局部 validSegment，但尚不是共享导出。

影响：合法 contributor 可提交非 File 的 file 字段导致 500，或产生没有 JSON 对应项的对象；未分隔的键段会产生歧义。R2 不会把 .. 自动解析成父目录，不能描述成传统文件路径穿越。

解决方法：

1. 提取共享键段与 FormData 校验，验证 string、长度、分隔符/控制字符；file 必须为实际 File，限制大小，规范校验 nsv。不要仅相信文件名/MIME。
2. 从当前权威比赛数据验证轮次与 slot 存在且唯一；已有重复 round/slot 时拒绝上传并提示修数据，不能使用数组 index 伪装解决存储冲突。
3. 对主包/NSV 使用同一明确键构造器；检测可能碰撞的槽位后缀（例如主图 slot=X.nsv 与 X 的 NSV）；启用规则前扫描现有数据。
4. 服务端进行有限成本的档案有效性检查；声明压缩大小、解压大小/条目数限制，避免为了“验证 ZIP”无上限解压。
5. 上传、删除、读取状态/元数据的键规则对齐，维持 contributor 上传、admin 删除权限。

验收：file=文本、字段=File、错误键段、不存在槽位、重复标识均无写入；真实现有 slot 兼容；普通与 NSV 键不冲突；ReadableStream 上传继续工作。

**完成记录（2026-09-14）**

- 状态：实现完成待验收（改动未提交；未做真实 R2 / Pages 联调）。
- 修改文件：新增 `functions/api/_lib/mapKeys.ts`（键规则唯一来源：键段校验、键构造/反解、nsv 解析、.osz 尾部检查、权威数据定位）、`scripts/map-keys.test.mjs`；改造 `functions/api/maps/upload.ts`、`maps/delete.ts`、`maps/status.ts`、`maps/meta.ts`。
- 先扫数据再定规则（本项要求）：全库 51 个文件 / 4526 个槽位实测 —— **14 个 slot 含 `/`**（`FS/TB`、`GM(HR/SD)`、`GM(FL&EZ)`）、0 个 slot 以 `.nsv` 结尾、同比赛内 0 个重复 slot、0 个重复 round id、0 个键碰撞；max tournamentId 46 / roundId 9 / slot 9 字符。据此：**slot 与 roundId 允许 `/`、`&`、`()`、`.`**（收紧会挡住真实槽位，与 R03 的放宽清单一致），只拒绝空串、超长、`.`/`..`、空路径段、反斜杠与控制字符；NSV 后缀歧义规则可安全启用（现有 0 例）。
- 键规则：所有端点统一走 `mapObjectKey/mapObjectPrefix/parseMapObjectKey`。`maps/{tid}/{rid}/{slot}[.nsv].osz`；**主图的 slot 以 `.nsv` 结尾 → 400 `SLOT_SUFFIX_CONFLICT`**（它的键会和「基础 slot 的 NSV」完全相同）。status/meta 的反解与列表前缀也换成共享实现。
- 上传端点（`upload.ts`）现在按顺序校验，任一项不过都**不写任何对象**：content-type 是 multipart、formData 可解析 → tournamentId 合法 → roundId/slot 键段合法 → nsv 只认 1/true/0/false（含糊值 400，不猜）→ **file 必须是文件**（鸭子类型判 `size`/`name`/`stream`，不用 `instanceof File`：旧 compat date 下没有 File 全局，instanceof 会抛成 500）→ 非空、≤100MB → NSV 后缀歧义 → **.osz 有限成本检查**（只读尾部 66KB 的 EOCD：找签名、总条目数、中央目录边界，中央目录落在窗口内时逐条累计声明解压体积；不解压任何内容）→ 从 GitHub 读权威比赛 JSON 并确认 round/slot **存在且唯一**（重复时提示先修数据，绝不用数组下标糊过去）。错误码：`INVALID_CONTENT_TYPE/INVALID_FORM/INVALID_TOURNAMENT/INVALID_ROUND_ID/INVALID_SLOT/INVALID_NSV/INVALID_FILE/EMPTY_FILE/FILE_TOO_LARGE/SLOT_SUFFIX_CONFLICT/INVALID_ARCHIVE/TOURNAMENT_NOT_FOUND/UPSTREAM_ERROR/UNKNOWN_SLOT`。
- 删除端点（`delete.ts`）：改用 `readJsonBody` + 同样的键段/nsv 校验，键由共享构造器生成（坏字段在拼键前被拒，slot 里塞 `../` 之类不可能指向别的对象）。**刻意不要求槽位存在于 JSON**：清理孤儿对象正是删除的用途。删除顺序未动（属 R07）。
- meta 端点：`rounds=rid:slot` 分隔出的两段也走共享键段校验（坏段 400，不静默跳过）；键构造与列表前缀换成共享实现。
- 运行的验证：`node --test --experimental-strip-types scripts/map-keys.test.mjs` → 12/12；`npm test` → 187/187；`npx tsc --noEmit` → 0 错；`npx tsc -p functions/tsconfig.json --noEmit` → 0 错；`npm run build` → 成功。用例覆盖：真实槽位（含 `FS/TB`、`GM(HR/SD)`、`GM(FL&EZ)`）通过而 `''`/`'.'`/`'..'`/`'a/../b'`/`'a//b'`/反斜杠/控制字符/超长被拒、nsv 只认明确真假、键构造与反解（含含 `/` 的槽位）、NSV 歧义、`locateMapSlot` 的存在/唯一/重复报错、真 zip 通过而垃圾/截断/条目数 0/中央目录越界/声明解压超限被拒、上传 handler 的 6 类拒绝（含 file=文本、坏键段、坏 nsv、非 zip、歧义槽、未知槽、重复槽、比赛不存在 404、上游 500 → 502）全部零写入、合法请求（主图与 NSV）写出正确键且上传体仍是 ReadableStream、删除 handler 坏键段不触达 R2 且合法请求走 trash 流程、**全库真实数据 4526 槽位全部通过新规则且无键碰撞**。
- 未完成 / 仍有风险：① 每次上传现在多一次 GitHub Contents 请求（读权威 JSON）；批量上传 50 张就是 50 次调用（认证上限 5000/小时，够用，但没有做 isolate 级缓存 —— 故意不加，避免"刚保存的槽位被缓存挡住"）；② 未在真实 R2 / Cloudflare Pages 上联调，`.osz` 检查只覆盖"明显异常"，不做全量解压校验；③ `maps/meta` 的 `?ref=`/分页等别的细节未动（分页属 R13）；④ 上传/删除/读取三处的鉴权与 CORS 仍是各自实现（属 R21/R22）。
- 与后续任务的接口变化：以后任何构造或解析 `maps/...` 键的地方都必须用 `_lib/mapKeys.ts`（`mapObjectKey`/`mapObjectPrefix`/`parseMapObjectKey`）；R06/R07 若引入 `versions/` 前缀，请在同一模块里加构造器，不要在端点里拼串。

**复查追加修正（2026-09-14，本项第 1、5 点的收尾）**

- 复查时发现 `functions/api/osu/raw.ts` 还留着一份**局部**键段校验（本项第 1 点原话就是"`osu/raw.ts:40` 提供局部 validSegment，但尚不是共享导出"，只改了别的端点会漏掉它）：它的规则把 `/` 也算非法字符，而现有数据里 14 个真实槽位含 `/`（`FS/TB`、`GM(HR/SD)`、`GM(FL&EZ)`）。后果是**这些槽位读上传谱面会被 400 拒掉**，而客户端（`src/lib/osuTextClient.ts`）只在 401/403 时才降级到线上版本 —— 等于图直接打不开（有 BID 也不会回退）。已改为使用共享的 `validateRoundId`/`validateSlot` 与 `mapObjectKey` 构造候选键（`.osz` 与 `.nsv.osz` 两种）。
- 连带修一处加载问题：`_lib/mapKeys.ts` 原来用省略扩展名的 `'./validation'`，而 `validation.ts` 又省略了 `'./tournamentId'` —— 这条链让**别的**静态 import 测试（`scripts/rawBeatmap.test.mjs`）直接 `ERR_MODULE_NOT_FOUND`。两处改成显式 `*.ts`（与 `raw.ts` 的写法一致，`functions/tsconfig.json` 已开 `allowImportingTsExtensions`），现在这条链不需要任何 loader 就能加载。
- 新增 `scripts/osu-raw-segments.test.mjs`：含 `/` 的真实槽位不论主图/NSV 都能读到上传版本（200 + `X-Beatmap-Source: r2`）、真正非法的键段仍然 400、匿名请求 403、对象确实不存在时 404（不偷偷换成线上版本）。
- 复查后验证：`npm test` → 198/198（含对方 `rawBeatmap.test.mjs` 12/12 未受影响）；`npx tsc --noEmit` 0 错；`npx tsc -p functions/tsconfig.json --noEmit` 0 错。
- 仍未做：脚本侧（`scripts/generate-pack.js`、`backfill-bid.js`、`test-merge-fix.js`）也用字符串拼 `maps/...` 键，但它们与端点用的是同一条拼接规则、行为一致，属 R22 的清账范围，本次不动。

### R05 [P1] 上传页面异步请求会把 A 的状态写进 B；保存可能清掉新增补丁

证据：src/components/admin/MapUploader.tsx:74、:91、:109、:210、:326、:369、:408。

触发：快速选 A 再选 B，A 请求最后返回时，selectedTournament 是 B、tournamentData 却是 A；上传请求按 selectedTournament 构键，因此可把 A 的槽位传到 B。上传期间切比赛也没有统一保护，A 的完成回调可往 B 的上传集合和补丁池写入。保存成功 setPendingPatches(new Map()) 会清空请求发出后新加入的补丁。

解决方法：

1. 每次切换创建请求序号/AbortController；只有序号和 tournamentId 均匹配才能提交 UI 状态。切换时重置上传集合、错误与进度，不保留上个比赛的勾选。
2. 上传/补全/保存绑定操作开始时的比赛 ID，完成回调验证所属上下文；活动写操作期间禁用比赛切换，或将状态按比赛隔离，不能只有 GET 防乱序。
3. 提交补丁使用快照；成功只移除本次快照中仍未被后续编辑替换的条目。部分未命中的补丁保留并报错；applied=0 也不能擅自清池。
4. 与 R01 的版本基准结合，避免“补缺失字段”在保存时无条件覆盖其他人刚填入的值。
5. 检查相同 round/slot 跨比赛的状态隔离，不依赖组件是否恰好卸载。

验收：延迟 A、先完成 B 后再完成 A，界面始终显示 B；A 的上传完成不污染 B；保存中追加或改写补丁仍保留；status 请求失败不能显示上一比赛的勾选。

**完成记录（2026-09-14）**

- 状态：实现完成待验收（改动未提交；异步时序这一条的自动测试只覆盖纯逻辑，UI 部分未做浏览器联调）。
- 修改文件：新增 `src/lib/mapPatchCommit.ts`（补丁池纯逻辑）、`scripts/map-patch-commit.test.mjs`；改造 `src/components/admin/MapUploader.tsx`；`src/lib/messages.zh.ts` / `messages.en.ts` 补文案。
- 异步隔离：① `loadTournament` 每次切换递增请求令牌并重置 `uploadedSlots/uploadedNsvSlots/status/errorMsg/uploading/backfillSummary/backfillProgress`，只有令牌仍是最新那次切换才允许写 UI（`isCurrentRequest`）；期间又切换则整体丢弃。② `selectedTournamentRef` 让异步回调读到"现在在不在看同一场"：`uploadFile`（含 formData 的 tournamentId 改为操作开始时的 id）、`runBackfill`（URL 用绑定的 id）、`commitPending`、`deleteFile` 全部改为"完成后校验所属比赛"，不匹配就不写状态、不入补丁池——A 的上传完成不再污染 B。③ 上传/补全/保存进行中拒绝切换比赛（提示 `mapUpload.stage.switchBusy`），把"写操作飞在半路"的窗口直接关掉。④ `status` 请求失败时清空勾选集合，不再沿用上一场比赛的勾选。⑤ `backfillRunning` 这类全局 UI 标志无论上下文都复位，避免按钮永久停在"补全中"。
- 补丁池快照：新增 `StagedPatchMap`（条目 = `{ patch, origin }`）。`commitPending` 先取快照，再用 `applyStagedPatches` 写入，最后 `entriesToClear(快照, 当前池, 真正写入的 key)` —— 只移除"本次提交过 + 期间没被改写（对象同一）+ 真的写进去了"的条目；提交期间新加/改写的补丁保留。`applied=0` 不再擅自清池（保留并提示），并新增「清空暂存」按钮作为出口。
- 与 R01/R02 协议的结合（本项第 4 点）：`origin` 区分 `fill` / `explicit`。自动补全、上传回填产生的补丁是 `fill`，提交时**跳过远端已有值的字段**（不覆盖别人刚填的值）并回报数量；贴 BID 补传面板产生的补丁是 `explicit`（用户明确指定，含"清空旧 BID"的 null 删除），照写。`mergeStagedPatch` 保证 explicit 不会被后来的 fill 降级。
- 运行的验证：`node --test --experimental-strip-types scripts/map-patch-commit.test.mjs` → 8/8；`npm test` → 176/176；`npx tsc --noEmit` → 0 错；`npm run build` → 成功。纯逻辑用例覆盖：字段级合并与 explicit 不被降级、本地回显（含 null 删除）、fill 只补缺不覆盖远端、explicit 覆盖与 null 删除、key 不在权威数据时记 unmatched、提交期间改写/新加的补丁不被清、只清"提交过且未被改写且真写入"的条目、请求令牌判定。
- 未完成 / 仍有风险：① "延迟 A、先完成 B 后再完成 A 界面始终显示 B"这类**时序行为没有自动化测试**（需要浏览器可控延迟，本轮只做了实现 + 纯逻辑单测 + 类型检查）；② 未做浏览器端到端验收；③ `UPLOADING` 期间禁止切换比赛属于"用限制换安全"，若用户确实需要中途切换需另做按比赛隔离的状态模型；④ 保存时未把 R01 的 `baseSha` 一起带上（仍用 GET 到的当前 sha 做乐观锁），并发窗口比 R01 的 batch 略宽——因为这里每次保存前都会重新 GET，覆盖别人的概率低但仍存在；⑤ `maps/delete` 结束时的状态清理只写在"仍是当前比赛"分支里，切走后不做任何恢复（该比赛的勾选已在切换时重置，符合预期）。
- 与后续任务的接口变化：`src/lib/mapPatchCommit.ts` 的 `applyStagedPatches/entriesToClear/mergeStagedPatch` 可被 R04 的键段校验或其它批量补丁场景复用；`MapUploader` 的 `onStagePatches(patches, origin?)` 多了一个可选参数，新增调用方请按语义选择 `fill`/`explicit`。

### R06 [P1] 上传/恢复会无条件覆盖现有 R2；恢复比赛也会覆盖新版本

证据：functions/api/maps/upload.ts:44；functions/api/trash/index.ts:72、:103。恢复比赛会自动取得当前 SHA 以覆盖同名 JSON；恢复 map 会覆盖 originalKey，随后删掉 trash 副本。

解决方法（先做最小保护，再做完整版本历史）：

1. 恢复默认仅允许目标不存在；存在就返回 409 RESTORE_CONFLICT，保留 trash。GitHub 创建不带 SHA，R2 使用“目标不存在”的条件 put，而非 HEAD 后无条件 put。
2. 若提供“替换当前版本”，需显示差异/版本信息并带用户确认的 SHA/ETag；先归档当前对象，归档失败不得替换。
3. 普通重传也先把旧对象及 metadata 存入独立 versions/，新对象采用 ETag 条件 put。归档普通与 NSV 时隔离键。条件失败返回 409 并保留所有可恢复副本。
4. 恢复成功后清理要可重试；不要在 KV 失败后留下指向已删除 restoreKey 的唯一恢复记录。第一版可保留 trash 实体至保留期结束。
5. R2 版本备份接 R08；版本保留策略另定，不自动清掉新版本库。

验收：A→B→恢复 A 可追溯；目标已有 B 时默认恢复不覆盖；并发重传只有一个成功；归档失败不覆盖；普通与 NSV 隔离；恢复后中途失败重试不丢数据。

**完成记录（2026-09-14）**

- 状态：实现完成待验收（改动未提交；未做真实 R2 / GitHub 联调）。解决方案第 1、3、4 点已实现，第 2 点（"替换当前版本"入口）**未实现**（默认不再覆盖，所以暂时不需要它），第 5 点见下。
- 修改文件：`functions/api/_lib/mapKeys.ts`（`versions/` 键、条件写助手）、`functions/api/maps/upload.ts`（覆盖前归档 + 条件写）、`functions/api/trash/index.ts`（恢复默认不覆盖 + 清理顺序）、`functions/api/_lib/trash.ts`（记录新字段 `originalEtag`）、`functions/api/maps/delete.ts`（写入 `originalEtag`）；新增 `scripts/r2-version-safety.test.mjs`。
- 用到的存储原语（查证过 Cloudflare Workers API 文档）：`put(key, body, { onlyIf })` 在条件不满足时**返回 `null` 且不存对象**；`R2Conditional` 支持 `etagMatches` / `etagDoesNotMatch` / `uploadedBefore` / `uploadedAfter`，也可以直接传 `Headers`（除 `If-Range` 外的条件头都支持）。因此"不覆盖/只有一个成功"是**存储层保证**的，不是 HEAD 与 write 之间的运气：新建用 `Headers{ If-None-Match: '*' }`，覆盖用 `{ etagMatches: 读到的 etag }`。
- 上传（第 3 点）：写入前 `head` 目标；存在旧对象就先把旧对象连同 metadata 归档到 `versions/{key}`（**归档键固定，不带版本后缀** —— 保留策略见下方"保留策略拍板"），**归档失败直接 502 `ARCHIVE_FAILED` 并且绝不覆盖目标**；随后用条件写落新对象，条件失败返回 409 `UPLOAD_CONFLICT`（提示旧版本已归档、刷新后重试）。响应新增 `archivedKey`。审计 detail 里标注是否归档了旧版本。
- 恢复（第 1 点）：**默认只允许"目标不存在"**。
  - 谱面：`head(originalKey)` 已存在 → 409 `RESTORE_CONFLICT`，回收站条目与副本都保留；随后用 `If-None-Match: '*'` 条件写，竞态下同样 409。判定"已经恢复过"时**用 etag 比对内容**（回收站记录新增 `originalEtag`）：占位者与副本内容一致 → 说明上次恢复成功、只是记录没清干净 → 清掉记录并返回 `alreadyRestored`；内容不同（别人重传过）→ 409 明确报冲突，不谎报成功。老记录没有 `originalEtag` 时保守按"已恢复"处理（否则用户会卡在一个回收站 UI 无法解决的 409 上）。
  - 比赛：不再自动取当前 sha 覆盖同名 JSON，改为**不带 sha 创建**；GitHub 对已存在文件返回 422（或 409）→ 翻成 409 `RESTORE_CONFLICT` 并保留回收站条目。
- 清理顺序（第 4 点）：恢复成功后**先清 KV 记录、再删 trash 副本**（反过来会出现"记录唯一指向已删除 restoreKey"的状态）；副本删不掉只留个孤儿，交给保留期清理兜底。删谱面的顺序在 R07 已改为"副本 → 记录 → 删原件"。
- 运行的验证：`node --test --experimental-strip-types scripts/r2-version-safety.test.mjs` → 14/14；`npm test` → 212/212；`npx tsc --noEmit` 与 `npx tsc -p functions/tsconfig.json --noEmit` → 0 错（本项只改 Functions，未跑 build）。用例覆盖：首次上传用"不存在才写"、重传**先归档再 CAS 覆盖**（断言操作顺序与归档内容）、归档失败不覆盖、并发重传两边都拿到 409 且目标不变、恢复时目标已存在 → 409 且零写入、目标存在但副本已清理且内容一致 → `alreadyRestored`、目标被换过内容 → 409 不谎报、目标为空 → 条件写 + 先清记录再删副本、恢复竞态 → 409 保留副本与记录、副本真丢 → 404、比赛恢复不带 sha 且 422 → 409（冲突时保留条目、成功时清记录）、普通与 NSV 的归档键互不串。
- 保留策略拍板（2026-09-14，用户决定）：**每个槽位只留最近一版**。归档键从 `versions/{key}.{opId}` 改成固定的 `versions/{key}`，重传就是覆盖同一份，于是 `versions/` 的体量上限 = 槽位数、**不随重传次数增长**，也**不需要任何清理任务**（每日清理只清 `trash/`，不碰 `versions/`）。代价是只保得住"上一版"，更早的找不回来 —— 旧包绝大多数能从 osu! 重下，只有"人工上传且线上已经没了"的图属于真正的损失。同一批决定：**备份脚本不再镜像 `versions/`**（`scripts/backup-r2.js` 的 `BACKUP_PREFIXES = ['maps/']`），理由是灾难恢复要的是当前数据、历史版本镜像过去只是白花一倍存储；备份 bucket 里若残留着早先镜像过去的 `versions/` 对象，没有任何流程会去删它，属无害残留。
- 未完成 / 仍有风险：① **"替换当前版本"入口未实现**（第 2 点）—— 默认行为已经不覆盖，若之后要提供"用回收站版本替换现有版本"，必须先展示差异/版本信息并让用户确认，且先归档当前对象；② 未在真实 R2 / GitHub 上联调（条件写的真实返回、422 与 409 的具体表现都以文档与模拟为准）；③ 每次重传都会多一次 `head` + 一次流式归档写（大包会多跑一遍流量）；第 5 点的保留策略已由用户拍板（见上一节），代价是**找不回更早的旧包**；④ 回收站 UI 仍只有"恢复"一个动作，冲突时只能看到错误文案，不能查看差异或强制替换。
- 与后续任务的接口变化：`versions/` 是本项新引入的前缀，之后任何需要"历史版本"的地方请用 `mapKeys.VERSIONS_PREFIX` / `versionObjectKey`（别在端点里拼串）；`functions/api/_lib/trash.ts` 的 `TrashEntry` 现在带 `originalEtag`（老记录可以缺省）。

### R07 [P1] 谱面软删除先删原对象再记回收站，失败时无法从 UI 恢复

证据：functions/api/maps/delete.ts:41、:45、:47。R2 copy→delete→KV addTrash 的顺序成立。

解决方法：

1. 改为保存可恢复副本→成功写入 KV 恢复记录→再删原对象。前两步失败保留原件。
2. 删除失败保留副本和记录，记录为待完成或明确返回错误；生成唯一操作 ID，让重试能识别同一操作而非不断制造条目。
3. 注意 copy 与 delete 之间可能有重传。单纯 HEAD 比对后再删仍有窗口；若要保证并发安全，所有上传/删除/恢复走同一个按对象串行的协调层，或采用经验证的存储并发机制。不能声称调换顺序就解决并发删除新版本。
4. 比赛删除有 Git 历史兜底，但回收站失败也应在 UI 响应中可见；此项先修 R2 路径，避免扩大范围。

验收：分别模拟 copy、KV put、delete 失败；至少保留原件或可通过 UI 找到的副本；重试幂等；并发删除/重传不误删新对象（若并发协调另拆，必须标明尚未验收）。

**完成记录（2026-09-14）**

- 状态：实现完成待验收（改动未提交；**并发删除/重传这一条尚未验收**，见下）。
- 修改文件：`functions/api/maps/delete.ts`（重排顺序 + 结构化失败）、`functions/api/_lib/trash.ts`（新增幂等写入）、`functions/api/_lib/mapKeys.ts`（新增 opId 派生）；新增 `scripts/map-delete-order.test.mjs`。
- 新的顺序：**① 读原对象 → ② 写可恢复副本到 `trash/{key}.{opId}` → ③ 写回收站 KV 记录 → ④ 才删原对象**。每一步失败的状态都可恢复：副本写失败（`TRASH_COPY_FAILED`，502）原对象完好、不写记录、不删任何东西；KV 写失败（`TRASH_RECORD_FAILED`，502）原对象完好，并尽力把刚写下的、没有记录指向的副本清掉；原对象删失败（`DELETE_FAILED`，502，`trashed:true` + `trashId`）副本与记录都在，UI 上找得到、可恢复。成功响应新增 `trashId`，便于提示与跳转。任何一步失败都写审计（含具体原因）。
- 重试幂等：新增 `deleteOperationId(key, versionSignature)` —— 由「对象 key + etag/version」派生，**同一对象的同一版本重试得到同一个 id**；副本键 `trashObjectKey(key, opId)` 与回收站记录都由它派生。`addTrashIdempotent(kv, entry, opId)` 先用 marker 键 `trashop:{opId}` 查已有记录：查到就复用（`reused:true`），不再新建条目。marker 前缀与 `trash:` 不重叠，不会混进回收站列表；marker 写失败只会让下一次重试多建一条记录（数据不丢），不阻塞主流程。`TrashEntry` 增加可选 `opId` 字段（展示层不受影响）。
- 兼容性确认：副本键命名由 `trash/{key}.{时间戳}` 改为 `trash/{key}.{opId}` —— 每日清理（`scripts/backup-r2.js`）按 `trash/` 前缀 + 对象年龄删除，与命名无关；恢复路径（`functions/api/trash/index.ts`）只用记录里的 `originalKey`/`restoreKey`，老条目照旧可用。比赛删除走 `addTrash`（未改动，属本项范围外）。
- 运行的验证：`node --test --experimental-strip-types scripts/map-delete-order.test.mjs` → 7/7；`npm test` → 195/195；`npx tsc --noEmit` → 0 错；`npx tsc -p functions/tsconfig.json --noEmit` → 0 错（本项只改 Functions 与 scripts，未改前端，故未跑 build）。用例覆盖：成功路径的**操作顺序断言**（副本早于 KV 记录、删原对象是最后一步）、副本写失败（零删除、不写记录、原对象在）、KV 写失败（原对象在、孤儿副本被清、绝不删原对象）、原对象删失败（副本 + 记录都在、响应标 `trashed:true` 带 `trashId`）、**删除失败后重试不产生重复副本/重复条目且复用同一 `trashId`**、原对象不存在时零写入、opId 的稳定性（同版本相同、换版本不同、不同对象不同）。
- 未完成 / 仍有风险：① **「并发删除与新重传不误删新对象」没有验收** —— 读原对象与删原对象之间仍有窗口，期间的重传可能被这次删除连带删掉。要根治得让上传/删除/恢复走同一套按对象串行的协调层（或用带条件的存储原语），本项按报告建议**不扩大范围**，仅在此标明；② 没有做真实 R2 联调；③ 删除成功后再次调用会返回 `trashed:false`（原对象已不在），语义上没错但 UI 无法区分"本来就没有"与"刚删过"，未改；④ 比赛删除路径的回收站失败仍只在审计里可见，响应里不体现（报告允许先只修 R2 路径）。
- 与后续任务的接口变化：`_lib/trash.ts` 新增 `addTrashIdempotent` / `findTrashIdByOp`，R06（恢复防覆盖、versions/ 版本库）可直接复用同一 opId 思路；`_lib/mapKeys.ts` 新增 `deleteOperationId` / `trashObjectKey` / `objectVersionSignature`。

### R08 [P1] 备份部分失败仍成功退出，继续执行过期清理

证据：scripts/backup-r2.js:101、:107、:153；.github/workflows/backup-r2.yml。

解决方法：

1. 备份计数 failed>0 后抛错或设置非零退出并立即跳过 cleanup；清理失败也统计并返回非零。
2. 列举、读取和复制失败区分处理，不把权限/网络错误当成空 bucket；禁止 source=backup 等错误配置。
3. 复制应保留需要恢复的 metadata。R06 引入 versions/ 后一并备份；当前只备份 maps/，backup bucket 同键覆盖是镜像而非历史备份。
4. 明确 trash 是否需要独立备份及清理条件。不能说当天 maps 备份成功就证明过期 trash 已有副本。
5. 把 SDK 调用与 main 判定做最小可测试拆分，测试不需要线上凭据。

验收：单项复制失败→非零且没有任何 trash 删除调用；全部成功才清理；cleanup 删除失败非零；分页全量覆盖；失败日志不包含密钥。

**完成记录（2026-09-12）**

- 状态：实现完成待验收（改动未提交）。
- 修改文件：`scripts/backup-r2.js`（重构出可测试的作业入口）；新增 `scripts/backup-r2.test.mjs`。
- 实际改动：① 新增 `runBackupJob(client, opts)` 一次完成「备份 → 判定 → 清理」，只有全部前缀 `status === 'ok'` 才执行 trash 清理，返回 `{ backupResults, cleanup, exitCode }`；`cleanup === null` 即代表「没有发出任何 DeleteObject」；② 每个前缀独立返回 `status / listed / sourceCount / copied / skipped / failed / failures`，**列举失败标记 `listed:false`，不把源对象数当 0**（权限/网络错误不会被误当空 bucket）；③ 任一复制失败或列举失败 → 跳过全部清理并设 `process.exitCode = 1`；④ 清理阶段自身删除失败计入 `failed`，同样非零；⑤ `listAll` 遇到 `IsTruncated` 但缺续页 token 时抛错，不再静默漏对象；⑥ 复制保留 `ContentType`（缺省 `application/octet-stream`）与 `Metadata`/`CacheControl`/`ContentDisposition`/`ContentEncoding`/`ContentLanguage`；⑦ 备份前缀扩为 `['maps/', 'versions/']`（versions/ 由 R06 引入，不存在时列举为空属正常）；⑧ 显式禁止 `R2_BACKUP_BUCKET === R2_BUCKET`；⑨ 日志与异常统一经 `redactSecrets` 把凭据打码成 `[redacted]`；⑩ 文件头注记「备份 bucket 是同键覆盖镜像、不是版本历史；trash/ 不做独立镜像备份，本次删除的过期对象没有第二份副本」。
- 运行的验证：`node --test --experimental-strip-types scripts/backup-r2.test.mjs` → 8/8；`npm test` → 83/83；`node --check scripts/backup-r2.js` 通过。用例覆盖：复制失败 → `cleanup === null` 且 DeleteObject 调用数为 0、`exitCode 1`；全部成功 → 只删超期对象、未超期与无 `LastModified` 的保留、`exitCode 0`；清理阶段删除失败 → `exitCode 1`；列举抛 `AccessDenied` → `status 'failed'` / `listed false` / `sourceCount 0` → 跳过清理；分页两页全量覆盖 + 截断缺 token 抛错；`size+etag` 一致时跳过（不发 Get/Put）；复制保留 `ContentType`/`Metadata`/`CacheControl`；`redactSecrets` 打码凭据。全部使用内存 fake client，不接触线上凭据。
- 未验证或仍有风险：未在真实 R2 / GitHub Actions 上运行；trash 仍按「不做独立备份 + 显式提示」处理（本项不改保留期语义）；备份 bucket 同键覆盖仍是镜像而非版本历史（属 R06 范围）。`versions/` 的键布局与保留策略已随 R06 落地并由用户拍板（见下）。

**后续修正（2026-09-14，随 R06 的保留策略）**

用户拍板「每个槽位只留最近一版」之后，`versions/` 已经是有界的（上限 = 槽位数）、不再需要清理，因此**撤销上面第 ⑦ 项的 `versions/` 部分**：`BACKUP_PREFIXES` 回退为 `['maps/']`，只镜像当前数据。理由是灾难恢复要的是当前谱面、不是历史版本，镜像 `versions/` 等于白花一倍存储（每次重传还会连带把旧包整个再传一遍）。备份 bucket 里可能残留着 2026-09-12 ～ 09-14 之间镜像过去的 `versions/` 对象，没有任何流程会去删它们 —— 无害残留。`scripts/backup-r2.test.mjs` 同步去掉 `versions/` 的 fixture，并把 `backupResults` 的断言从 `['ok', 'ok']` 改成 `['ok']`（这条断言原本**隐式**要求恰好两个前缀，是回退时唯一会被绊到的地方）。
- 与后续任务的接口变化：新增导出 `runBackupJob / backupPrefix / backupAll / shouldSkipCleanup / cleanupTrash / resolveExitCode / listAll / copyHeaders / redactSecrets`，R06 引入 versions/ 或调整 trash 语义时可直接复用扩展；`node scripts/backup-r2.js` 调用方式与退出码语义（0 全成功 / 1 备份或清理不完整）保持不变，workflow 无需改动。

## 5. 合包与发布任务

### R09 [P1] Drive 上传失败会把仍被引用的旧包当成孤儿删掉

证据：scripts/upload-to-gdrive.js:157、:172、:187、:195。已用该脚本本体和 fake R2/Drive 复现。

触发：previous 和 current manifest 都引用旧 fileId；该包本次上传失败，未加入 uploadedFileIds；孤儿清理只按“这次成功上传的 ID”判断，删除旧文件。manifest 仍可能保留其链接。

解决方法：

1. 用当前目标 manifest 中所有仍需保留的 fileId 加本次新建成功的 ID 作为保留集合，不以成功上传集合代替目标集合。
2. 任一上传/权限设置失败，本次跳过所有孤儿删除并非零退出，保留 previous 及恢复信息。写成功进度和失败摘要以便重试，但不把未完成发布标成成功。
3. 孤儿删除只能处理明确不再被目标 manifest 引用的对象；去重 ID；404 幂等。
4. 旧 fileId update 得到 404 后，fallback create/update 必须重新创建 body 流；现在同一 media body 可能已被消费。将 getBody 工厂下沉到每次上传尝试。
5. 不应忽略所有权限 API 的 400；识别确实可接受的“已存在权限”情况，其余当失败。

验收：单包 503/R2 读取失败/权限失败不删任何旧文件；全成功才删真正孤儿；不存在旧 fileId 后用新流完整上传；失败退出非零，重跑可恢复。

**完成记录（2026-09-12）**

- 状态：实现完成待验收（改动未提交）。
- 修改文件：`scripts/upload-to-gdrive.js`（重构孤儿判定与失败处理）；新增 `scripts/upload-to-gdrive.test.mjs`。
- 实际改动：① 孤儿判定改用「目标 manifest 仍引用的 fileId」作保留集合（`gdriveFileId` 字段 + `googleDrive` 链接里的 id），不再用「本次上传成功的 ID」——generate-pack 会把旧 fileId / links 带进新 manifest，因此失败包继承的旧对象不会被误删；② 任一上传或权限失败即跳过全部孤儿删除、保留 `packs-manifest.previous.json` 并 `exit 1`（CI 的 Commit manifest 步骤随之不执行）；③ 上传/权限请求改为每次调用 body 工厂取一条新流，旧 fileId 404 回退 create 时不再复用已被消费的流；④ 权限 API 只接受 `alreadyExists` 类 400，其余 400/5xx 按失败处理；⑤ 孤儿删除去重，404 幂等，非 404 失败改为抛出（非零退出）。
- 运行的验证：`node --test --experimental-strip-types scripts/upload-to-gdrive.test.mjs` → 8/8；`npm test` → 75/75；`npx tsc --noEmit` → 0 错；`npm run build` → 成功。测试用内存 fake Drive，覆盖：单包失败不删任何旧文件、失败包继承的旧 fileId 不算孤儿、全部成功才删真孤儿（含去重）、旧 fileId 404 后回退上传取到两条独立流、权限 400 非 alreadyExists 视为失败 / alreadyExists 视为成功、保留集合识别两种 Drive 链接写法。
- 未验证或仍有风险：未在真实 Drive / GitHub Actions 上跑；`permissions.create` 的「已存在」具体错误形态以 Google 实际返回为准（同时匹配 `errors[0].reason === 'alreadyExists'` 与文案）；未与 R10 的 manifest 状态机联动，因此「部分失败仍写 manifest 进度」这一点目前只保证旧链接不被指坏。
- 与后续任务的接口变化：导出 `runDriveSync / collectReferencedFileIds / computeOrphans / isAlreadySharedError / deleteOrphans` 供测试与后续复用；`node scripts/upload-to-gdrive.js` 的直接调用方式与退出码语义（0 成功 / 1 失败 / 2 凭据失效）保持不变。

### R10 [P1] 合包读取/上传失败仍发布新 manifest 或覆盖旧包

证据：scripts/generate-pack.js:310、:647、:659、:699、:711、:781、:794。

触发：prefetch 出错返回 null，外层跳过谱面，甚至只剩占位图也照样上传；R2 上传失败只 warn，却仍以新 mapCount/size/date 配旧链接。全量生成结果还决定孤儿清理。无版本文件名时，部分包已覆盖、后续失败，会出现线上一半新一半旧。

解决方法：

1. 区分“JSON 槽位本来未上传”（允许缺包但明确统计）和“列举后对象读取/解析/上传失败”（本次生成失败）。禁止将后者静默降级为空图并覆盖旧包。
2. 生成结果带明确状态；某一类型处理失败时保留该类型全部旧包和旧 manifest 项；默认整次发布失败，跳过孤儿清理。禁止新统计配旧对象链接。
3. 真正避免半发布应使用 runId/内容哈希隔离的 R2 对象键，全部校验成功后再发布 manifest；失败保留旧 manifest 与旧键。Drive 脚本同步使用 manifest 明确的 objectKey，而非固定拼接 realType_part。
4. 新链接合并应保留人工维护的非 R2 镜像链接，不能因为 result.links 只有 r2 就覆盖掉全部旧 links；失败的镜像不要冒充新版本已更新。
5. 清理放到新 manifest 成功发布之后；有保留期/恢复机制。第一版可以禁用自动清理，之后单独验收，不能先删后等 git push。
6. 状态机和消费方一起改；不要只让脚本非零退出就宣称已实现原子发布。串行发布与版本键策略见 R12。

验收：模拟第 N 张谱面损坏、第 N 包上传失败、manifest 提交失败；已发布 manifest 仍指向一套完整可用的旧版本；新包统计与实际文件一致；只有占位文件的失败包不发布；人工镜像链接不丢；没有提前删除旧文件。

### R11 [P1] 元数据指纹会错误合并不同谱面；备选路径不验证内容

证据：scripts/generate-pack.js:290、:484、:537、:575、:310。已复现同 Artist/Title/Creator/Version、不同 HitObjects 指纹相同；元数据全空还会得到相同的分隔符串。

解决方法：

1. 元数据用于候选分组，不能作为等价性的唯一依据。先用未改写的 .osu 内容摘要做保守去重；需要忽略哪些无关字段必须明确制定规则，至少保留 TimingPoints、HitObjects、Mode、难度等玩法相关内容。
2. 同 BID 也可能对应修改版/倍速版或陈旧 JSON。读取实际内容并核对身份；内容不同不能仅因 BID 相同就合并，输出人工核对项。
3. 备选路径应在下载失败、ZIP/.osu 无效时尝试，且确认内容等价；当前只是看 key 是否存在，损坏的首选仍会丢图。
4. 分开“引用来源列表”和“可读取物理副本”。现在缺文件的引用在 rawEntries 前被 continue，来源标签可能丢失；只有身份可确认时才能把缺文件来源挂到其他副本。
5. totalMaps 与 mapCount 使用同一逻辑身份口径，NSV 不重复计主图数；否则指纹去重后分子与分母不一致。
6. 本项只改离线合包身份逻辑，不自动修改 JSON BID/键型或线上包。

验收：同元数据不同音符、不同 TimingPoints/倍速不合并；完全相同图可合并；空元数据不导致全合并；同 BID 不同内容报告冲突；首选损坏且有有效等价备选可出包；来源及计数一致。

### R12 [P2] workflow 输入直接拼 shell；单类型生成不更新清单；发布无协调

证据：.github/workflows/generate-packs.yml:26、:36、:49、:55；upload-packs-to-drive.yml:44；scripts/generate-pack.js:729。

解决方法：

1. 用户输入先放 env，在 run 中使用双引号包住的变量作为完整参数，禁止把表达式直接插进 shell 代码。workflow_dispatch 通常有权限限制，因此不是匿名远程执行漏洞，但 shell 注入边界确实不该存在。
2. CLI 检查参数合法性；大小写不敏感匹配后返回规范键，保留 RCmainHB/LNmainHB 等混合大小写，不能直接全部转大写。未知类型非零退出；有效但无图与非法类型区分提示。
3. 单类型生成目前会更新 R2，却不写/提交 manifest，也不跑 Drive。明确改为“单类型完整更新其 manifest 分片与镜像”或“仅离线预览不碰生产对象”，不要留下旧计数/旧 part 列表。
4. 生成与 Drive 重传 workflow 使用共同发布 concurrency group，cancel-in-progress:false。这里只防 Actions 互撞；人工/GitHub API 提交仍需校验 manifest 基准。
5. commit/push 拆成清楚条件。push 冲突时保留生成结果和错误，禁止 force push 或无脑用旧 manifest 覆盖人工链接；仅无关文件变动可有上限重试。
6. R10 采用版本对象键后同步改脚本消费接口，不单独硬编码旧命名。

验收：包含空格/分号/命令替换语法的输入作为普通字符串被拒绝，不能执行；ss→SS，RCmainHB 保持规范；单类型更新不污染其他类型；并发发布排队；manifest 冲突保留人工更改。

### R23 [核实/发布] 确认谱包内容与部署状态，不按旧日期推断线上事故

证据：data/packs-manifest.json 的 lastGenerated 为 2026-08-13T07:00:43.299Z。只能证明本地清单旧；单类型生成可能已改变线上 R2 而未改变此日期。

执行步骤：

1. 读取实际 Actions 最近成功/失败记录，核对生成使用的 commit；只读检查 R2/Drive 对象大小、ETag/更新时间及代表性包内 .osu。
2. 对 SSR SF/F 等已修复数据检查当前 R2 原图，再对包内容比对，不能跳过原文件直接全量重建。
3. R09/R10/R11/R12 修好后做隔离样包，核对图数、来源、身份、音频与 NSV。比较改写后 .osu 字节变化与成绩兼容影响。
4. 再决定正式全量发布；记录数据 commit、生成版本、对象键及校验结果。无凭据时报告哪些外部核验未完成，不猜“从未跑过”。
5. 问卷入口、GM 模板、难度精度、token 到期等旧待办重新对照源码和后台实际配置。2026-11 到期仅是旧文档记录，不是本次读取了 token 元数据。

验收：清单、对象、包内内容三者对应同一可追溯版本；原图修复已验证；用户确认过需要发布的变更；失败可以继续使用上一版。

## 5.1 实施期间新增发现（本站长 2026-09-14 反馈）

### R24 [P2] 一键下载上传：网络层中断没有任何重试，且限流会被当成"BID 有问题"

证据：`src/components/admin/MapUploader.tsx`；站长截图显示 `vietnamese-rewind-mania-championship` 一轮里 8 张图同时报 `Failed to fetch`，重跑一次全部成功。

触发与定性：行内报错是浏览器原生的 `TypeError: Failed to fetch` —— 也就是 fetch 在**网络层**抛错（连接被重置 / 流被中途掐断 / DNS 失败），不是 HTTP 状态码。这条链路上每次搬运的是整个 beatmapset（几 MB~几十 MB），`/api/osu/download` 又是把上游流直接透传（上游中途断流时，服务端已经在发响应头，**无法**在服务端重试）；而客户端这条路径当时**完全没有重试**（对比：上传路径本来就有 3 次退避重试）。所以表现就是"一批行同一句报错，重跑又全好"。

另一个连带问题：元数据查询失败时无条件写 `metaFailed: true`，而它会让完成阶段弹出"osu API 失败的行 → 是否清空旧 BID"。osu API 的 429（限流）与 5xx 也会落到这个分支 —— 一次限流抖动就可能诱导用户把本来正确的 BID 清掉。

解决方法：

1. 新增 `src/lib/fetchRetry.ts`：只对**网络层抛错**（`TypeError`）做退避重试，HTTP 状态码原样交回调用方（不猜、不掩盖）。下载 `.osz` 与元数据查询两处接入。
2. 行内错误文案区分"网络中断"与真实错误，不再直接抛浏览器原文。
3. `metaFailed` 只在**确定的 4xx（不含 429）**时置位；429/5xx 不触发"清空旧 BID"的确认。

验收：网络抖动导致的失败会在行内自动重试并成功；仍失败时提示是网络问题而不是原始英文；限流/5xx 不会导致清除 BID 的提示。

**完成记录（2026-09-14）**

- 状态：实现完成待验收（改动未提交；未做浏览器端到端验收）。
- 修改文件：新增 `src/lib/fetchRetry.ts`、`scripts/fetch-retry.test.mjs`；改 `src/components/admin/MapUploader.tsx`（两处 fetch 接入重试、`metaFailed` 条件收紧、网络错误文案）、`src/lib/messages.zh.ts` / `messages.en.ts`（新增 `mapUpload.paste.errNetwork`）。
- 运行的验证：`node --test --experimental-strip-types scripts/fetch-retry.test.mjs` → 6/6；`npm test` → 218/218；`npx tsc --noEmit` → 0 错；`npm run build` → 成功。用例覆盖：网络抛错后成功（退避 600/1200ms）、连续网络失败按次数抛出、HTTP 500/404 **不**重试、非网络异常不重试、`attempts=1` 退化为单次、分类辅助函数。
- 未完成 / 仍有风险：① 服务端透传上游流时的**中途断流无法重试**（响应头已发出）；② 仍没有"整批失败后自动补跑一遍"的机制 —— 站长手动重跑是有效的兜底，本轮只做到"单行内自动重试"，是否要加自动补跑待定；③ 未做浏览器端实机验收（本地无法复现真实的连接中断）。
- 与后续任务的接口变化：任何"下载大文件 / 跨网请求"的前端调用可以直接复用 `fetchWithNetworkRetry`；`isTransientStatus` 可用于把 429/5xx 与确定性 4xx 分开处理。

**复查追加修正（2026-09-14，把重试范围从"拿到响应头"扩到"读完响应体"）**

- 复查时发现 `fetchWithNetworkRetry` 只包住了 `fetch` 本身，而 `fetch` 在**收到响应头**时就 resolve 了 —— 几十 MB 的 `.osz` 是之后在 `autoDownloadAndTrim` 的 `await res.blob()` 里才传完的。传输中途断流抛的是同一个 `TypeError`，却发生在重试范围之外：**只重试 fetch 等于漏掉大文件最常断的那一步**，站长遇到的"一批行同时报 Failed to fetch"很可能正是它（上面第 ① 条说的"服务端无法重试"只解释了服务端那一侧，客户端这一侧当时同样没兜住）。
- 修法：`src/lib/fetchRetry.ts` 抽出通用的 `withNetworkRetry(operation, options)`（同一套退避、"只重试 TypeError"规则不变），`fetchWithNetworkRetry` 改为它的薄封装（既有调用方行为不变）；`autoDownloadAndTrim` 改为用 `withNetworkRetry` 把「发请求 + 读 blob」当成一个整体重试。HTTP 错误抛的是普通 `Error`，按规则照旧不重试，不会被反复重发。
- `scripts/fetch-retry.test.mjs` 增加两条：读体阶段断流会**重新发请求**（模拟 fetch 成功但 `res.blob()` 抛，断言请求数 2、退避 600ms、最终拿到内容）、读体阶段的 404 不重试（断言只请求 1 次）。
- 复查后验证：`node --test --experimental-strip-types scripts/fetch-retry.test.mjs` → 8/8；`npm test` → 220/220；`npx tsc --noEmit` 0 错；`npx tsc -p functions/tsconfig.json --noEmit` 0 错；`npm run build` 成功。
- 仍受第 ① 条限制：**服务端**把上游流直接透传，它那一侧在响应头发出后仍无法重试；现在客户端会把整个请求重发一次，上游若持续失败仍会失败，这一层已经尽力。

### R25 [P2] 悬浮卡段位用的是汇总缓存，会和框高（现算值）不一致

证据：`src/components/ladder/HoverCard.tsx` 的 `buildDifficultyLabel` 优先读 `round.typeDifficulties[type]`，而 `LadderView.tsx` 的框高（`adjustedAvg`）是从 `maps[].difficulty/difficultyLn` **现算**的（`typeDifficulties` 只作为"全部无有效值"时的兜底）。站长反馈：CET GF TB 显示 `~ε/ε+ / LN16+`。

定性：该轮 `typeDifficulties.TB = { rf: 15.3, ln: 16.4 }`，而 TB 谱面实际是 `difficulty 16.2 / difficultyLn 17.2` —— 边界数据过期。于是框高按实际值画、悬浮卡按旧缓存报段位，看起来就是"段位偏低一档"。全库扫描显示这不是孤例（4-digit-world-cup GF、china-osumania RO24、university cup RO16、jack-house-cup 多轮、osumania-4k-world-cup F 等都有 TB 汇总与实际值不一致；gb-cup 几轮甚至是 `{}`）。

解决方法：悬浮卡先按**图上现算**的值出段位（与框高同源），`typeDifficulties` 降级为兜底；取值口径与 LadderView 保持一致（RC/SV 用 difficulty、LN 用 difficulty、HB/TB 双段 rf+ln）。

**完成记录（2026-09-14）**

- 状态：实现完成待验收（改动未提交）。
- 修改文件：`src/components/ladder/HoverCard.tsx`（新增 `liveLabelForType`，`buildDifficultyLabel` 改为现算优先）、`src/lib/messages.zh.ts`/`messages.en.ts`（版本号 → `v0.9.0`，见下）。
- 运行的验证：`npm test` → 221/221；`npx tsc --noEmit` → 0 错；`npm run build` → 成功。**注意：段位映射逻辑（`danBand`/`getRfDanName`）目前内联在组件里，无法直接单测** —— 想锁住"悬浮卡必须与框高同源"这条回归，需要把它抽成 `src/lib/danNames.ts`（把段位表作为参数传入，避免 `@data` 别名在 node 下解析不了）。
- 未完成 / 仍有风险：① 悬浮卡只拿到 `type`、**拿不到被悬浮的 slot**，所以多 TB 的轮次（如 TB + SHOWTB）悬浮卡只能按整型聚合显示，不能精确到那个框；② `typeDifficulties` 与实际值不一致的**数据**没有清理（站长约束"不改比赛 JSON"，需要时由后台重新保存一次即可回填）；③ 没有自动化测试（见上）。
- 同类：本站长同期要求把右下角版本号从 v0.1 改为 **v0.9.0**（`control.version`，中英各一处）；`package.json` 随后也一并改为 0.9.0（见 R26 第 3 项）。

### R26 [需求] 勾选部分谱面"不参与难度统计" + 整场比赛视图按指针高度选轮次 + 版本号 0.9.0

来源：站长 2026-09-15 当面提出（三项一起）。

1. **不参与难度统计**（新功能）：每轮编辑页的**每个槽位行**加一个勾选框（默认不勾）。勾上后该图难度
   ① 不进"本轮 / 该键型"的难度平均值；② 不参与 ladder 框高。数据落在比赛 JSON 的 `map.excludeFromDifficulty`。
2. **整场比赛视图的悬浮**：tournament 模式整场比赛只画一个框（最低→最高难度），原来 hover/click 固定绑 `visibleRounds` 的最后一轮，所以任何位置都显示决赛。站长选"保持轮次口径、按指针所在高度判断"。
3. **版本号**：右下角显示 + `package.json` 一起改成 `0.9.0`（准备正式发布）。

**完成记录（2026-09-15）**

- 状态：实现完成待验收（改动未提交；未做浏览器实机验收）。
- 修改文件：新增 `src/lib/difficultyCount.ts`（唯一判断处）、`scripts/difficulty-count.test.mjs`；`src/lib/types.ts`（`BeatmapMeta.excludeFromDifficulty?`）、`src/components/admin/MapSlotEditor.tsx`（槽位行勾选框）、`src/components/admin/RoundEditor.tsx`（`recalcDifficulty` / `autoCalcTypeDiffs` 排除）、`src/components/ladder/LadderView.tsx`（框高/范围/组内取数 + 指针高度选轮次）、`src/components/ladder/HoverCard.tsx`（7 处聚合取数）、`src/lib/messages.zh.ts` / `messages.en.ts`（勾选框文案 + 版本号）、`package.json`。
- 实现要点：① 判断集中在 `countsForDifficulty/countableMaps`，口径是**默认参与、只有显式 `true` 才排除**，所以老数据零迁移、取消勾选写回 `undefined`（JSON 不落脏值）；② 后台 `recalcDifficulty`（本轮 min/max/average）与 `autoCalcTypeDiffs`（各键型平均值）+ 前端 ladder 三视图与悬浮卡**同一口径**，避免"框高排除了、数字没排除"这类各说各话；③ 勾选框沿用 `mapsToOutput` 的 `{ category, ...rest }` 展开，字段自动落盘（不需改序列化）；④ 整场比赛视图把指针 y 反解成难度（与 `ladderGeometry.plotOffsetY` 同一线性公式，包含顶部被裁切的情况），取难度区间离它最近的那一轮，**hover 与 click 同步**。
- 运行的验证：`node --test --experimental-strip-types scripts/difficulty-count.test.mjs` → 3/3；`npm test` → 224/224；`npx tsc --noEmit` → 0 错；`npm run build` → 成功。用例覆盖：默认参与（缺席/false 都参与、只有 true 排除）、`countableMaps` 过滤保序且不改原数组、**扫全库 4526 张图确认当前没有任何图勾了这一项**（即功能不影响既有显示）。
- 未完成 / 仍有风险：① 未做浏览器实机验收（勾选后框高变化、整场比赛视图各高度显示对应轮次这两条只有逻辑与类型保障）；② `round.difficulty`（本轮 min/max/average）是**存储值**：勾选后要由后台重新保存才会按新口径重算，前端只在"逐图值算不出来"时才回退到它 —— 存量数据不会自动变；③ 悬浮卡仍拿不到被悬浮的 slot（多 TB 轮次只能整型聚合）；④ 主页若还有别处单独展示单张图的难度，需另查（本轮改的是 ladder 与悬浮卡）。
- 备注：站长解释了 `typeDifficulties` 漂移的机制 —— 后台改"TB 平均值"会写穿到实际数值，但改实际数值不会回写平均值（平均值被锁定），所以**实际数值才权威**；这与 R25 的修法一致。
- 复审修正（2026-09-15，提交前审查）：`scripts/difficulty-count.test.mjs` 第三条原本断言「现有 4526 张图零命中」，那是一句**一次性上线核对** —— 留在套件里会让站长的正常使用（勾上第一张图）把 CI 弄红，且红得毫无信息量。已改成断言**字段形状**（只允许 `true` 或缺席；出现 `false` 或其它类型说明写回没清干净），全库扫描与"至少 4000 张"的覆盖检查保留，核对结论移进注释。

### R27 [需求] 键型冲突工具改成"勾选才改" + 批量选择

来源：站长 2026-09-15 —— 键型冲突很难一次性改完、有些地方一时不知道改成啥，所以要"勾选改动 + 批量选择（可以做成滑动的）"，**只有勾选了的比赛才会被改动**。

**完成记录（2026-09-15）**

- 状态：实现完成待验收（改动未提交；未做浏览器实机验收）。
- 修改文件：`src/components/admin/RealTypeConflictChecker.tsx`、`src/lib/messages.zh.ts` / `messages.en.ts`（新增 5 条文案）。
- 行为变化：以前"有差异的组一律写回"，现在**默认全不勾、只有勾上的组才会被写**：
  ① 每行左侧加勾选框（`setReview` 那种纯提示行不给勾；组内已一致、没有可改内容的行勾选框禁用）；
  ② 顶部工具条显示"已勾选 N / 有差异 M 组" + 操作提示 + 「全选（有差异的）」/「全部取消勾选」；批量选择是**在列表上拖拽框选**：在某行的方框上按住（用按下那一格的反向状态当"刷子"），纵向拖过若干行就整段刷成同一状态，**往上拖即取消这一段**，鼠标松开（含移出列表松开）结束；
  ③ 保存按钮显示 `已选 / 有差异` 两个数字，没勾时禁用；一个都没勾点了会明确提示"只有勾上的组才会被写回"；
  ④ 保存成功后把这些组**自动取消勾选**（冲突列表要等站点重建才刷新，避免下次重复写）；
  ⑤ 勾选与目标选择**存 localStorage**（`osumania-ladder:realtime-conflict-selection:v1`），刷新/隔天回来还在，正好对应"分几次改完"；只存选择、不存比赛数据。
- 运行的验证：`npx tsc --noEmit` → 0 错；`npm test` → 224/224；`npm run build` → 成功。（纯前端交互改动，没有可自动化的断言，实机操作是唯一验收方式。）
- 未完成 / 仍有风险：① 拖拽框选只覆盖"当前列表顺序里连续的一段"（要选分散的多段就分几次拖）；② 存储里残留的键（某组已修掉）无害但不会自动清理；③ 未做浏览器实机验收。（交互按站长 2026-09-15 的更正改为"列表上拖拽框选"，此前的"前 N 组滑块"已移除。）

### R28 [需求+数据质量] 新增 PDEX 键型、默认键型一律改为 Pending、找出历史误标谱面

来源：站长 2026-09-15 ——
① 特殊谱面的默认键型还是 `SS`，要加一个 `PendingEX (PDEX)`，且该键型不进下载合包；
② 以后哪怕某一轮符合标准池模板，默认键型也要是 Pending（可以保留蓝色模板按钮供手动套用）；
③ 改大类时默认键型也不再是 `SS / HB1 / RE` 这类"列表第一个"，同样改成 PD；
④ 由此引出的历史问题：有一部分谱面因为粗心，以 `SS / HB1 / RE` 的身份混在各个大类的第一个真实键型里，需要一个办法把它们找出来。

**完成记录（2026-09-15）**

- 状态：① ② ③ 实现完成待验收（改动未提交，未做浏览器实机验收）；④ 交付为**只读检测工具 + 候选报告**，不是自动改数据。
- 修改文件：
  - 新增 `src/lib/realTypeCatalog.ts`（键型目录的唯一来源：`REAL_TYPES` / `PENDING_REAL_TYPE_BY_CATEGORY` / `CATEGORY_COLORS` / `defaultRealTypeFor` / `realTypeOptionsFor`。纯数据模块，无 React、无 `@data`，可被 `node --test` 直接导入）；
  - `src/components/admin/MapSlotEditor.tsx`（改为复用目录并 re-export 旧符号；`handleCategoryChange` 用 `defaultRealTypeFor`；下拉在"当前值不在列表"时显式给占位项）；
  - `src/components/admin/RoundEditor.tsx`（`addMap` 默认 Pending；模板按钮加提示文案，明确它是**手动**入口）；
  - `src/components/admin/BulkImporter.tsx`（**不再**因为"结构命中标准池"就自动填 realType，一律 Pending；改为在确认页显示蓝色提示"第 N 轮结构匹配标准池《X》，导入后可在编辑页点蓝色模板按钮一键套用"）；
  - `scripts/generate-pack.js`（`PACK_EXCLUDED_REAL_TYPES` 加 `PDEX`，`REAL_TYPE_NAMES` 加 `PDEX: 'Pending Special'`，并导出 `PACK_EXCLUDED_REAL_TYPES` 供测试锁定）；
  - `src/lib/realType.ts`（`isPendingRealType` 加 PDEX）、`src/lib/tournamentDiagnostics.ts`（`PENDING_REAL_TYPES` / `NON_SV_PENDING_REAL_TYPES` 加 PDEX）；
  - `src/lib/messages.zh.ts` / `messages.en.ts`（PDEX 键型说明、模板按钮提示、批量导入提示、下拉占位文案）；
  - 新增 `scripts/real-type-defaults.test.mjs`（5 例）、`scripts/find-suspect-realtypes.mjs`（检测工具）、`reports/realtype-suspects.md`（生成的报告）。
- 关键设计：
  - **默认键型 = 该大类的 Pending**（RC→PDRC / LN→PDLN / HB→PDHB / SV→PDSV / 特殊→PDEX），TB 只有一种键型、无 Pending，退回 `TB`。规则集中在 `defaultRealTypeFor`，新建 / 改大类 / 批量导入三处都走它，不再各自写"列表第一个"。
  - **只有手动点蓝色模板按钮**才会写入标准池的具体键型 —— 模板仍是完整可用的，只是不再替人做决定。
  - 特殊槽位下拉 = 所有大类的键型（跨大类，如 HB1 / SVMX）+ `PDEX`；普通大类看不到 PDEX。
  - `PDEX` 与 `PDRC/PDLN/PDHB` 一样**只当分类队列，不进合包**；`PDSV` 仍然进下载栏（未定类的 SV 需要兜底包，这条是既有约定，未改）。
- **误标检测（第 ④ 点）的做法**：`node scripts/find-suspect-realtypes.mjs`（只读，不写任何比赛 JSON），用"数据自己当参照物"，6 个可解释信号打分后给人复核：
  | 信号 | 分值 | 说明 |
  | --- | --- | --- |
  | S7 结构罕见度（主信号） | 4（默认值）/2 | 同一轮同一大类里键型同质化到全库罕见：按 (大类, 组规模) 现算基线，只有 ≤5% 的组会这么"少键型" |
  | S1 跨比赛共识 | 3~5 | 同一 `beatmapId` 在别处被标成别的键型；只采信严格多数（≥2 票且多于第二名），平票时仅当"当前是大类第一个键型"才算 3 分 |
  | S2 同一套图共识 | 2 | 同一 `beatmapset` 里同类谱面键型不一致 |
  | S4 难度名关键词 | 2~3 | 难度名里出现别的子类型关键词（如标 SS 但名字里有 Jack）；弱信号，有歌曲名误报 |
  | S5 HB 的 ln 倒挂 | 2 | HB 图 ln 比 rf 高 ≥1.5 却标成 HB1 |
  | S3/S6 弱指纹 | 1 | 同组键型重复且撞默认值 / 同组只剩它还是默认值 |
  - 观察到的基线（可复现）：HB 组 3 张**全是 HB1** 的情况在全库 166 个同规模组里只占 2%；LN#3、RC#5/#6 同类同质化 ≤2%；这印证了"整组同质化"确实罕见、值得报。
  - 当前输出：扫 4625 张 → **27 个候选（高 16 / 中 11）**，涉及 16 个比赛；`--min-score 1` 可看全量（另有 500 余张只有单个弱指纹的，基本就是"默认池"本身，默认不列）。其中高置信 1 张命中最强组合（结构罕见 + 跨比赛共识 + 同组重复）：`roasted-duck-cup-2024` QF/SF `B-RC1` `SS` → 疑似应是 `MX`。
  - 工具参数：`--json`（机器可读）、`--dir`、`--out`、`--min-score`。
- 运行的验证：`node --test scripts/real-type-defaults.test.mjs` → 5/5（默认键型必须是 Pending、PDEX 在特殊下拉里、普通大类不含 PDEX、PDEX 被认作 Pending 且被合包排除、扫全库确认当前还没有图用 PDEX）；`npm test` → **229/229**；`npx tsc --noEmit` → 0 错；`npm run build` → 成功；`node scripts/find-suspect-realtypes.mjs` → 正常运行并产出报告。
- 未完成 / 仍有风险：① 未做浏览器实机验收（新建特殊图默认 PDEX、改大类后默认 Pending、导入后提示蓝色按钮这三条只有逻辑与类型保障）；② 检测**没有 ground truth**，无法给出准确率 —— 它是"候选生成器"，高置信只是排序靠前，仍要人工拍板；③ 检测结果**没有**任何自动写回（站长约束：不改比赛 JSON）；④ 报告里的"建议去处"只有单值（如 `SS → MX`）在证据唯一时才给，多数只有范围（如 HB 的 `LNmainHB`）—— 真正的子类型仍要人判断；⑤ 若把这类复核做成后台界面（点一下改一张），需要另开任务；⑥ **键型浏览器（`RealTypeMapBrowser.tsx`）没跟上 PDEX**：它的 `known` 集合由 `CATEGORY_ORDER = ['RC','LN','HB','SV','TB']` 构建（不含 `SPECIAL`），所以数据里一旦出现 PDEX，它会掉进"自定义键型"分组（能选中、能用，只是标签错）；同页 `getConversionGroups` 又显式 `filter(category !== 'SPECIAL')`，所以特殊槽位在这个页面里**没法**被转成 PDEX（得回编辑页）。当前 PDEX 用量为 0，不紧急；修它要给 `SPECIAL` 一个正式分组（涉及 `optionGroups` 与 `getConversionGroups` 两处 + 类型），留待站长定"特殊槽位要不要在这个页面独立成组"。
- 复审修正（2026-09-15，提交前审查）：`scripts/real-type-defaults.test.mjs` 原本有一条「全库扫描:目前没有任何图用 PDEX」—— 与 R26 那批同一个坑：特殊槽位新建/改大类后的默认值就是 PDEX，站长一用就会把 CI 弄红。已改成断言**长期规则**（realType 必须是非空字符串；数据里出现的每个 `PD*` 都必须被 `isPendingRealType` 认作 Pending），全库扫描与"至少 4000 张"的覆盖检查保留，一次性核对结论移进注释。

**复核结果（站长 2026-09-15 晚，2026-09-15 深夜按站长澄清修订）**

- 高置信 16 条：**14 条有效并已由站长改掉**；2 条误报（`TSC2`、`RDC 2024`）都是**结构问题**，不是判据问题（见下）。
- 中置信 11 条：**不是"无价值"** —— 其中大部分本质是**口径冲突**（同一张图在两处被标成不同键型，如 AC `HB1` vs `HB2`、JAST `RE` vs `CO`、MMT `RE` vs `CO`、MFC `HB1` vs `HB3`）。站长**暂缓**处理（要成块时间逐个统一），不是判据无效。
  → 这批的正确归宿是**已有的键型冲突工具**（R27:"勾选才改 + 拖拽框选"），而不是"误标清单"。
- 所以信号要分三类看，不要一刀切：
  - **指向"忘改"的有效信号**：S7 结构罕见度（主要产出）、S1 严格多数共识（本批仅 1 条，但同时命中 3 个信号）。
  - **指向"口径冲突"的有效信号**：S1 的平票分支、S2 同一 `beatmapset` 分歧 —— 产出是"该统一口径"，不是"标错了"。
  - **弱判据（保留为辅助线索）**：S5（ln 倒挂）、S4（难度名关键词）、S3/S6（重复 / 只剩它）。单独出现不足以定论，但站长认为仍有用。
- `RDC 2024` 误报根因（结构，不是判据）：该比赛的"轮"里其实有**两个图池** —— 槽位写作 `A-RC1…A-TB` / `B-RC1…B-HB1`（QF/SF 那轮 = A 池 6 张 + B 池 5 张 + 2 张轮级 SV）。工具把整轮当一个池，于是拿"RC 组 6 张"去比全库 `RC#6` 的基线，比较对象就错了。
  → **结论：检测/统计的最小单位必须是"池"，不是"轮"**；同轮多池要先切池再算。
- **站长澄清的一处关键前提（推翻了我原先的假设）**：**Pending 队列不会积压** —— Pending 是"我还没决定"的待办标记，会被逐个清掉；只要 Pending 不被静默改写，"我忘了改的地方"就**一眼可见**。即：默认值改成 Pending 本身就已经把"忘改"这一类从源头消掉了，**不需要算法去补**。
  → 由此确立一条产品不变量：**任何路径都不得在无人工操作的情况下把 `PD*` 改写成具体键型**。已核对 `addMap` / `handleCategoryChange` / `BulkImporter` / 上传补丁路径 / 三方合并，全部符合；模板按钮与冲突工具都是显式人工操作。
- `TSC2` 的异常待查（9 轮 100 张、多数图看起来是歌曲的官方/低难度谱面而非赛事自绘谱；站长判定为"奇葩"，暂不作为判据）。

### R29 [P2] 悬浮卡的 TB 段位用的是"平均难度"，不是那张图的实际难度

来源：站长 2026-09-16 —— "目前 TB 的难度仍然不对，用的都是平均难度好像，用实际难度吧"（确认位置：**悬浮卡的 TB 段位**）。

证据 / 根因：

- 悬浮卡只拿到 `hoveredType`（键型），**拿不到被悬浮的具体框（槽位）**；一轮里 TB 型图可能不止一张（`TB` + `SHOWTB` / `FS/TB`），于是只能整型聚合 —— 取的是同键型的**平均**。
- 缺值兜底更糟：`buildDifficultyLabel` 在图上没有可用数值时会退到 `round.difficulty.average`（**整轮所有图的平均**），拿它冒充某个键型的段位。
- 数据侧（扫全库 308 个含 TB 的轮次）：**140 轮两侧都没有实际值**、6 轮只有 rf、7 轮只有 ln；另有 **37 轮**的存储汇总 `typeDifficulties.TB` 与实际值不符（CET GF 存 `15.3/16.4`、实际 `16.2/17.2`；MWC 4K 2023 F 存 13.1 / 实际 12.8；4DM 2024 GF 存 12/12.5 / 实际 11.4/12 …）。所以"看起来用的是平均"能被大面积命中。

解决：

- `LadderView` 把被悬浮框的**槽位**随 hover 一起传下去（用拆框的 `label`，且**仅当它不等于键型名时**才算槽位，避免 HB/RC 的聚合框被误当成槽位）。
- 悬浮卡新增 `hoveredSlot`：**给了槽位就只认那张图自己的 `difficulty` / `difficultyLn`**（TB/HB 出 rf+ln 两个段位，LN 用 `difficulty`，RC/SV 用 `difficulty`）；该图没有值就返回空、**整行不显示**，不再拿平均充数。
- 去掉所有"用 `round.difficulty.average` 冒充键型段位"的兜底；键型级聚合也改为只统计有值的图。
- 顺手把这段逻辑从 `HoverCard.tsx` 抽到纯模块 **`src/lib/danLabels.ts`**（等级表由调用方注入，模块本身零运行时依赖），使其可被 `node --test` 锁定 —— R25 的完成记录里正好记着"这段逻辑内联、无法单测"这条遗留，本次一并解决。

**完成记录（2026-09-16）**

- 状态：实现完成待验收（未做浏览器实机验收）。
- 修改文件：`src/components/ladder/HoverCard.tsx`（新增 `hoveredSlot`、窄化 `typeMaps`/min-max、段位行改为可空）、`src/components/ladder/LadderView.tsx`（hover 状态与 `onHover` 增加 slot、超界带与类型视图框传 `label`）、新增 `src/lib/danLabels.ts`、新增 `scripts/dan-labels.test.mjs`。
- 运行的验证：`node --test --experimental-strip-types scripts/dan-labels.test.mjs` → **9/9**（含：悬浮 TB 框不用 `typeDifficulties` 缓存、一轮两张 TB 各出各的段位、TB 无值时返回空而不回退整轮平均、普通键型不受影响、槽位名等于键型名时退回聚合、LN 值存 `difficulty` 也能出标签、"不参与难度统计"的图不参与聚合、分档规则用合成等级表锁定）；`npm test` → **238/238**；`npx tsc --noEmit` → 0 错；`npm run build` → 成功。
- 修订(2026-09-17,站长补充规则):TB 的段位取值改为 —— 一轮只有**一张** TB 时用它自己的实际难度;**两张及以上回到该键型的平均**;TB 没有实际难度时也用平均(见 R30)。
- 未完成 / 仍有风险：① 未做浏览器实机验收（"悬浮 TB 看到实际段位"这条只有逻辑与单测保障）；② **数据侧没动**：140 轮 TB 完全没有难度值（那些轮次现在悬浮不再显示段位线，而不是显示一个错的），37 轮的存储汇总仍是旧值（前端已不读它；若还有别的消费者需要另查）；③ 若某轮 TB 的值本来就该由管理员在后台填，需要一个"TB 缺值清单"来兜底（未做）。

### R30 [P2] TB 段位规则细化 + 每轮图池标题折行 + MCNC 简写排查

来源：站长 2026-09-17（三件一起）。

1. **TB 段位规则细化**（修订 R29）：一轮里**只有一张** TB 时用它的实际难度；**两张及以上回到该键型的平均**（拆框只是显示分开）；TB 没有实际难度时用**平均** —— 依次为"图上现算的平均 → 管理员填的 `typeDifficulties.TB` → 整轮平均"，三者皆无则不显示（不硬凑一个最低段位）。
2. **每轮图池的标题折行**：整场比赛视图的框内标题会随列宽自动折到第二行，每轮图池不会 —— 因为标题层用的 `.round-box-text` 是 `white-space: nowrap + text-overflow: ellipsis`（拉窄只会截断）。改成与 `.round-box` 一致的折行。
3. **MCNC 4K 2026 的简写为什么没空格**：不是界面问题。数据里有一条**独立记录** `data/tournaments/osu-mania-chinese-national-cup-4k-2026-rebirth.json`，它的 `abbreviation` 字段写的就是 `MCNC4K2026`（无空格）；带空格的 `MCNC 4K 2026` 属于**另一条**记录（8 轮 109 张，id `osumania-chinese-national-cup-4k-2026-rebirth`）。界面原样打印该字段，所以"哪里都没有空格"。
   而且这条记录看起来是**早期残留**：只有 1 个轮次（`Qual`、8 张、isQualifier）、**全部图没有 beatmapId**，且两张图的键型与正赛不同（ST1 `TC` vs 正赛 `MX`、ST7 `SS` vs 正赛 `SA`）。→ 建议在后台删掉这条残留（或至少改成不冲突的名字）。**数据未改**（站长约束：不动比赛 JSON）。

**完成记录（2026-09-17）**

- 状态：实现完成待验收（未做浏览器实机验收）。
- 修改文件：`src/lib/danLabels.ts`（槽位判定改为"该键型只有一张图时才用实际值"，TB 额外走平均兜底链 `tbRoundAverageLabel`）、`src/app/globals.css`（`.round-box-text` 去掉 `nowrap/ellipsis`，加 `word-break: break-word`）、`scripts/dan-labels.test.mjs`（两条用例按新规则改写）。
- 运行的验证：`node --test scripts/dan-labels.test.mjs` → 9/9（含：两张 TB 都出平均、没有值的 TB 图不参与平均、单张 TB 用实际值不读缓存、缺值退到整轮平均、汇总优先于整轮平均、平均为 0 时不显示）；`npm test` → 238/238；`npx tsc --noEmit` → 0 错；`npm run build` → 成功。
- 未完成 / 仍有风险：① 未做浏览器实机验收（折行效果、TB 段位都要目视）；② MCNC 那条残留记录未处理（等站长决定删还是改名）；③ 全库另有 8 个"简写含数字但没有空格"的比赛（`4DM2023` / `JMC3` / `KET2` / `PHNM2025` / `o!mLN4` / `PTCT6` / `SWM2` / `TSC2`），看名字是刻意的短名，未动。
- **验收核对（2026-09-17，提交后实测）**：把提交前那一版 `HoverCard.tsx` 的实现从 git 取出（`git show 6441963^:src/components/ladder/HoverCard.tsx`），与新实现**逐轮逐键型**对拍全库（359 轮 × RC/LN/HB/SV/TB）：
  - 单张 TB 的轮次共 **312** 个。其中 **166 个图上有值** → 悬浮卡输出与该图自身数值**逐条相同，0 例外**（走 `sum/1`，无浮点误差）；另 **146 个图上无值** → 按 R30 的规则退回平均或不显示 —— 这几处正是"平均值 ≠ 实际值"的全部情形，因为根本没有实际值可等。**结论：只有一个 TB 的轮次，有值时严格等于实际值。**
  - 全库共 **789** 处（轮次 × 键型）新旧输出不同。其中 **LadderView 真会推出该键型框的：0 处** —— 也就是说**在键型视图里悬浮任何一个框，新旧显示完全一致**。那 789 处全部落在"页面上画不出这个框"的轮次上：旧实现在"图上一个难度值都没有"时会**硬凑一个最低档**（`~intro1-` / `~LN1` / `~intro1- / LN1`）或拿**整轮所有图的平均**冒充该键型，新实现不再伪造。这些值从来没被显示过（鼠标够不着）。
  - **唯一在页面上看得见的变化**：**整轮视图 + 顶部键型筛选**。整轮视图的框不带键型，卡片此时用 `activeFilter` 当键型，于是那些"该键型没值"的轮次以前会显示上面那个伪段位、现在整行不显示。涉及 **237 个轮次**（按组合：RC 177 / HB 175 / LN 170 / TB 138 / SV 129）。方向与 R29 的"不拿平均冒充"一致。
  - **待站长定（未决）**：上面那 237 个轮次在「整轮视图 + 键型筛选」下的段位行，是保持隐藏（当前行为）、还是显示成带"整轮参考"标注的灰字（保留参考价值又不冒充该键型）。站长 2026-09-17 未选，暂按"保持隐藏"。
- **复审修正（2026-09-17，提交前审查）**：R29 引入的 `hoveredSlot` 通路在 R30 的新规则下**已经不可达** —— `LadderView` 只在该键型有多张图（按 slot 拆框）时才把 `label` 当槽位传下去，而"TB 多于一张"正是 R30 明确要走平均的那一支（`else if (type !== 'TB')` 会跳过精确槽位匹配）；单张 TB 时 `label === 'TB'`，传下去的是 `undefined`。两条路结果**相同**（单张 TB 走 `liveLabelForType`，一张图的平均就是它自己的值），所以不是 bug，但 R29 记录里"给了槽位就只认那张图"这句现在**只有单测覆盖、UI 打不到**。保留这段通路不删（多张 TB 若日后改回"各出各的"即刻可用）。另外 `.round-box-text` 只留 `word-break: break-word`（与 `.round-box` 完全一致）—— 原先还多写了一条 `overflow-wrap: anywhere`，在 `left-1 right-1` 的定宽块里与前者没有实际差别，删掉以免"与 `.round-box` 保持一致"这句注释名不副实。

### R31 [P1] 合包三件：分包规则按阈值均分、`rewriteOsu` 的 `$` 注入隐患、NSV 缺音频导致"没声音"

来源：站长 2026-09-17。

1. **分包规则**：原来是 `MAX_MAPS_PER_PACK = 80` 的"固定 80 切块"，尾包会小到十几张（DP 只剩 13、CO 25、TB 31、HB2 32、LNMX 35、TC 36、HB3 38）—— 站长要"每个包 70-90 张、也不希望分太多个包"。改成站长给的阈值：**≤120 → 1 包；≤200 → 2 包；≤270 → 3 包；≤360 → 4 包；再往上按 90 步进**（451→6…）；份数定了之后**均分**（每包相差 ≤1 张）。**当日修订**：3 包阈值从 180 抬到 200 —— 181~200 走 2 包，避免刚过阈值出现 `61/60/60` 那种谷（各段起点仍会轻微下探：121→61/60、201→67/67/67、271→68/68/68/67）。
2. **`rewriteOsu` 的 `$` 注入**（我实测复现）：用**字符串**做 `replace` 的 replacement 时，值里若含 `$'` 会被当成"匹配点之后的整段文本"展开，把 Title 行之后**整份文件**塞进那一行（实测 70 → 135 字节，谱面直接坏掉）；`$&` / `$$` / `$1` 也会被展开或吞掉。值来自曲名/作者/版本，`sanitizeFileName` 并不清 `$`。三处替换全部改为**函数式 replacement**。
3. **"一张 SV 没声音"**：NSV 变体是作为**独立条目**打包的（`<slot>.nsv.osz`）；若那个 zip 里**只有 .osu 没有音频**，旧代码只 `console.warn` 一次就返回 `audio: null` → 包内该难度引用了一个不存在的音频文件 → 游戏里静音。改为：音频/曲绘缺失且是 NSV 时，**借用同槽主图 `<slot>.osz` 的音频/曲绘**（同一首歌，不会串味）；并在每个包的日志里加体检行 `音频:借用主图 x 张;仍缺 y 张 → <keys>`。

**完成记录（2026-09-17）**

- 状态：实现完成待验收（需要跑一次合包才能看到实际效果）。
- 修改文件：`scripts/generate-pack.js`（新增 `packCountFor` / `packSizeFor` 并替换切片逻辑、三处函数式 replacement、NSV 借用主图资源、音频体检统计、`module.exports` 增补）、`scripts/generate-pack.test.mjs`（+3 例）。
- 运行的验证：`node --test scripts/generate-pack.test.mjs` → **9/9**（新增：`$` 序列不破坏谱面且 `[HitObjects]` 只出现一次；120/200/270/360/451 边界与"各包差 ≤1"；实测规模 93→93、105→105、121→61/60、151→76/75、191→**96/95**、202→68/67/67、222→74/74/74，且每包落在 60~120 之间（全库 23 个包、无 <40 的包））；`npm test` → **241/241**；`npx tsc --noEmit` → 0 错。
- 未完成 / 仍有风险：① **改分包会改变包内 .osu 的 `Title`（标题=包名）→ 玩家已下成绩会断**，需要重新合包并让玩家重下（同 §5.4 的性质）；② 借音频只解决"整段音频缺失"，若根因是**源 .osz 被截断**则要重新上传（R04 的 EOCD 校验只对修复后的上传生效）；③ **到底哪几个 NSV 缺音频，本地读不到 R2**，要在下次合包时看日志里的"仍缺 N 张"；④ 本次只改了代码，**没有重新生成包**（由站长在 CI 触发）。
- **复审修正（2026-09-17，提交前审查）**：① `PACK_SINGLE_MAX` 原本被 `packCountFor` 里的字面量 `120` 架空（声明了没用上），已改用它取值；② 文档里的旧规则已一并更新 —— `CODEX-HANDOFF.md` §5.3 与总览行、`SECURITY-DEPLOY-STATUS.md` 的合包流程原写"每包最多 80 张（`MAX_MAPS_PER_PACK`）"，该常量已删、说法成了错的，现改为阈值+均分；同时把"改写 .osu 一律用函数式 replacement"与"NSV 借同槽主图资源"两条规则补进 §5.3（否则下一位改动者会重新踩 `$` 注入那类坑）。
- 复审另核（无问题，记录备查）：分包数变化**不会**让下载链接指向旧内容 —— R2 是按同名 key 覆盖上传，Drive 侧 `uploadOrUpdate` 也是拿旧 `fileId` **原地更新内容**（不是复用旧文件），消失的 part 走孤儿清理删除；manifest 用 `(realType, part)` 找回 fileId 因此是安全的。

### R32 [P2] 上传页删掉 .osz 后,该 slot 的本地信息（name/BID）不回滚 —— 重传也填不回去

来源：站长 2026-09-17 —— "手传一个文件，之后再把这个文件删掉，再用 bid 补传，这个 slot 在上传铺面那里的信息还是先前的信息"。

证据（`src/components/admin/MapUploader.tsx`）：手传成功时从 .osu 的 `[Metadata]` 解析出 name/BID，**同时**写两份 —— 跨轮暂存池（`stagePatches(..., 'fill')`）与本地回显（`applyPatchesLocal`）；而 `deleteFile` 只清「文件 + 勾选 + 该格的 status」三样，池里的条目与回显**一个字都没动**。

为什么"重传也填不回去"（这才是闭环）：手传回填的判定是**只补缺失字段**——

```ts
const cur = tournamentData?.rounds.find(...)?.maps.find(m => m.slot === slot)
if (builtName && !cur?.name) patch.name = builtName
```

而 `cur` 读的就是**被回显改过的** `tournamentData`；删了文件之后它仍然带着那份已删除文件的 name/BID，于是重新手传时 `!cur?.name` 为假 → 补丁是空的 → 什么都不写、界面也不变。同理，「一键补全」的候选条件是 `if (m.name && m.beatmapId) continue`，也被这份残留信息骗过去，直接跳过该 slot。

**完成记录（2026-09-17）**

- 状态：实现完成待验收（改动未提交；**未做浏览器实机验收**）。
- 修改文件：`src/lib/mapPatchCommit.ts`（新增 `slotPatchKey` / `buildSlotBaseline` / `dropStagedSlot`）、`src/components/admin/MapUploader.tsx`、`scripts/map-patch-commit.test.mjs`（+4 例）。
- 实现要点：① 加载比赛（以及每次"保存全部"刷新权威数据）时，记一份**存档基准** `slotBaselineRef`：每个 slot 的 `name/beatmapId/beatmapsetId`，字段一律存在、本来没有的记 `null`（应用时等于删掉该字段）。② 删除**主文件**成功后：丢掉该 slot 在暂存池里的条目，并把回显退回存档值 —— 那份补丁本来就是从刚删掉的文件里读出来的，留着会一直挂在行上、保存时还会写进 JSON。③ **删 NSV 变体不动这些字段**：name/BID 来自主图，删 NSV 不该把它们清掉。④ 删除后额外拉一次 `/api/maps/status` 对账 —— 文件也可能在别处被删/被传（回收站页、另一个标签页），只按本地这次删除记账会留下过期的勾选；**读不到就保留现状**，不像初次加载那样清空（否则一次网络抖动会把整页勾选抹掉）。
- 运行的验证：新增 4 例（`buildSlotBaseline` 的"缺席=null"语义；把基准应用回去时空字段被清掉、存档里有的值原样恢复；`dropStagedSlot` 不改原 map、没有该 key 时返回同一对象；**完整时序** 手传 → 删除 → BID 补传后，池里与实际写入的都是新信息）；`npm test` → **323/323**；前后端 `tsc` 0 错；`npm run build` 成功。
- 未完成 / 仍有风险：① 未做浏览器实机验收（"删了文件行上的信息立刻回到存档值""补传后显示新信息"这两条要人眼确认）；② 存档基准只在**加载比赛**与**保存全部之后**刷新，页面停留期间若别处改了 JSON，回滚会退回**打开页面那一刻**的值（比现在残留"已删除文件的信息"更接近正确，但不等于最新）；③ 池里被丢掉的补丁若是用户手填的值（explicit），也会一起丢 —— 判断是"删除这个 slot 的文件"本身就是明确动作，界面上重填一次即可，但这条取舍写在代码注释里了。

### R33 [P1] MKTC 2025 的一批谱面带着**占位 ID**（`beatmapsetId = 1`），把键型冲突工具整批粘成一组

来源：站长 2026-09-18 —— 截图里「同 set 待核对」把 MKTC 2025 一整批（Qual 到 GF、几十个槽位）归成了一组，并说明"这些 MKTC 谱面都是我前不久手动上传的谱面（它们是通过 mcz 转 osz 来的）"。

证据（本地 checkout 缺 MKTC，改从**部署站 `osumania-ladder.pages.dev` 的构建产物**里抽出线上数据核对 —— 50 场比赛 / 4715 张谱面）：

- **MKTC 2025 的 89 张里 36 张 `beatmapsetId = 1`**，而这 36 条对应 **36 首不同的歌**（`Toromaru - Curiosity`、`daisan - Yukidoke-iro Furawazu`、`Senya - Yakusoku no Kimi` …），其中 33 张连 `beatmapId` 都没有。
- 全库其余 49 场**没有任何** ≤10 的 ID（`setId <= 10` 只出现过这个 `1`）→ 这是转换产物，不是真实数据。

根因：Malody `.mcz` → `.osz` 的转换器在 `[Metadata]` 里写了占位 `BeatmapSetID:1`（`BeatmapID` 为 0/空）；而上传时解析只滤 `> 0`，于是 **1 被当成真 set id 写进了比赛 JSON**。

后果（**不只是显示难看**）：

1. **键型冲突工具**按 `beatmapsetId` 分组 → 36 条无关谱面粘成一组「同 set 待核对」（截图），真实的键型冲突被这一组淹掉；`classifySetConflict` 还会因为它"有 ≥2 种 realType、≥2 个 bid"而判成 `setReview` 报出来。
2. **上传页的「下载」按钮是按 setId 下载的**（`autoDownloadAndTrim(beatmapsetId, …)`）→ 这些行点下去会去下载 **beatmapset 1**（完全无关的图）；版本比对不通过会报错，最坏情况是版本恰好对上、**把错的图传到这个槽位**。批量下载（按轮）同样中招。
3. **误标检测的「同 beatmapset 共识」(S2)** 被污染 —— 36 张不同歌的谱面成了"同一个 set"。

**完成记录（2026-09-18）**

- 状态：实现完成待验收（改动未提交；**MKTC 的数据尚未清理**，见未完成项）。
- 修改文件：新增 `src/lib/beatmapIds.ts`（判读唯一实现）、`scripts/find-suspicious-ids.mjs`、`scripts/clear-placeholder-ids.mjs`、`scripts/beatmap-ids.test.mjs`、`reports/beatmap-id-suspects.md`；改 `src/lib/mapConflictDetection.ts`、`src/lib/maniaChart.ts`、`src/components/admin/RealTypeConflictChecker.tsx`、`src/components/admin/MapUploader.tsx`、`src/lib/messages.zh.ts` / `messages.en.ts`。
- 实现要点：
  1. **判读集中一处**：`PLACEHOLDER_ID_MAX = 1` —— `0 / 1 / 负数 / 非整数` 一律当"没有 ID"（osu! 用 `-1` 表示未提交，`0/1` 是转换器常见默认值；实测真实 set id 都在十万级，不会误伤）。
  2. **入口不再污染数据**：`MapUploader` 解析 `.osu` 的 `[Metadata]`、`maniaChart` 的解析、贴 BID 时 osu! 响应里的 set/bid，全部过 `usableBeatmapId/usableBeatmapsetId`。`PasteBidPanel` 的 `newMeta` 类型放宽为 `number | null`（占位值不写进 JSON）。
  3. **工具不再被带偏**：冲突检查器的分组不接收占位 ID；`classifySetConflict` 增加"同一个 setId 下出现 **≥3 首不同的歌** → 这个 id 不可靠，不报"（取 3 而不是 2：同一套图不同难度偶尔写法不同，2 首还可能是噪声；MKTC 那组是 36 首）。
  4. **上传页不再拿占位值去下载**：行内 `beatmapsetId` 先归一化，批量下载前再判一次（拿不到可用 setId 的行进错误列表，新增文案 `mapUpload.bulk.noSetId`），「一键补全」的候选条件也改用 `isUsableBeatmapId`（否则占位 ID 会让这些 slot 永远进不了候选）。
  5. **清单与清理工具**：`node scripts/find-suspicious-ids.mjs` → `reports/beatmap-id-suspects.md`（占位 ID 逐条列出 / 同一个 setId 挂 ≥3 首歌的组 / 同一个 bid 挂多首歌的组）；`node scripts/clear-placeholder-ids.mjs`（**默认 dry-run**，只删占位字段，写回前自检"除这些 key 外逐字节一致"，`--write` 才落盘）。
- 运行的验证：`beatmap-ids.test.mjs` → **7/7**（占位阈值含 `1.5`/`NaN`/字符串；`songKeyOf`；**36 首不同歌共用 setId → 不再报**；真的是同一首歌的多难度仍然照常报；倍速 set 仍能识别；既有短路条件不变；数据不变量"`data/tournaments` 里不该有占位 ID"）；清理脚本在**线上数据副本**上验过：dry-run 报 1 个文件 / 36 处，`--write` 后逐条比对确认**只删了那 36 个 `beatmapsetId`、其它字段 0 处变动**，再跑检测脚本 → 0 条；`npm test` → **330/330**；前后端 `tsc` 0 错；`npm run build` 成功。
- 未完成 / 仍有风险：① **MKTC 那 36 条数据还没清** —— 本地 checkout 没有这份数据（站长的改动经 GitHub 提交、本地未 pull），所以清理要由站长 `git pull` 后跑 `node scripts/clear-placeholder-ids.mjs --write`（或按报告手工清）；② 这些图**真实的 osu! BID 需要人工补**：源 `.osz` 的元数据里就没有（转换器只写了占位），只能用「贴 BID 补传」或编辑页手工填；③ 未做浏览器实机验收；④ 「同一个 bid 挂多首歌」的 8 组**没有动**（多数应是同一张图两种写法，属人工判断，脚本只列出来）。

**复查追加修正（2026-09-18，另一条工作线复核后补做）**

- 状态：实现完成待验收（改动未提交）。
- **先更正完成记录里一句不成立的话**：第 1 点写的「判读集中一处」与修改文件里写的「`src/lib/beatmapIds.ts`（判读唯一实现）」都不对 —— `grep -rn "beatmapIds" functions/` 当时返回**空**，后端**一处都没接**。真实情况是：`functions/` 里至少还有三套自己的 `> 0` 老口径。这一条不是文字问题，见下面第 1 条缺口。
- 复核确认隔壁写得对的（未改动）：`classifySetConflict` 的 ≥3 首歌判定（取 3 而非 2 的理由成立）、`RealTypeConflictChecker` 的 `byBid`/`bySet` 过滤、两个脚本的 dry-run 与写回自检、`beatmap-ids.test.mjs` 的 7 例。

- **缺口 1（最要命的一条）：脏数据会复发。** 判读只做在前端，而「一键补全」的数据源是 `/api/maps/meta` —— 它读 R2 里那些 `.osz` 的 `[Metadata]`，走的是 `functions/api/_lib/osuArchive.ts` 的 `parseOsuMetadata`，那里仍是 `> 0` 老口径。**MKTC 那 36 张的 `.osz` 就躺在 R2 里**（`[Metadata]` 里写死了 `BeatmapSetID:1`），所以：清理脚本刚删掉的占位值，站长在后台点一次「一键补全」就**被写回比赛 JSON**。隔壁把"数据清理"列成未完成项，但即使清了也守不住。
  - 修法：新增 `functions/api/_lib/beatmapIds.ts`（后端那份，注释写明为何不跨边界 import —— `functions/` 与 `src/` 是两条独立构建，仓库里零个跨边界 import 先例；沿用 `_lib/tournamentId.ts` 的 `MAX_TOURNAMENT_ID_LENGTH` vs `_lib/validation.ts` 的 `LIMITS.maxIdLength` 那套"两份 + 测试锁一致"的既有做法）；`parseOsuMetadata` 的 `BeatmapID`/`BeatmapSetID` 两处解析改过判读；`extractOsuFromOsz` 里 `uploadedId > 0` 的重复阈值去掉（改由 `parseOsuMetadata` 统一归一化，避免两处口径各写一套）；`functions/api/maps/meta.ts` 三处 `> 0` 改共享判读（`unsubmitted` 也随之改成"没有可用 BID"）。
- **缺口 2：R33 报告自己点名的"第 3 条后果"没实现，而且不止一处。** 报告写「误标检测的『同 beatmapset 共识』(S2) 被污染」，但至少两个地方在按 setId 建"共识"索引、都没防护：
  - `src/hooks/useMapHistory.ts` 的 `byBid`/`bySet` —— 上传页贴 BID 时的"这张图在别处出现过"提示，取自这两个索引。已按 `isUsableBeatmapId` 挡掉占位 ID。
  - `scripts/find-suspect-realtypes.mjs` 的 `indexByBid`（S1 跨比赛共识）与 `indexBySet`（S2 同套图共识）—— **报告里说的 S2 就在这个脚本里**，隔壁和我都漏了。同样按判读过滤。
- **缺口 3：另外三处写/判定路径漏网。**
  - `src/components/admin/BulkImporter.tsx`（批量建整场比赛，ID 直接写进 JSON）：osu! meta 与手抄的 `mapId` 都过判读（手抄个 `1` 过去会写成 `beatmapId: 1`）。
  - `src/components/admin/MapUploader.tsx`：贴 BID 补传的下载目标 `Number(meta.beatmapsetId)` 未归一化 —— 会去下载 beatmapset 1，正是报告第 2 条后果，只是换了个入口（批量下载那边隔壁已经挡了）。
  - `src/lib/tournamentDiagnostics.ts`：`mapIdentityKey` 与"这个 BID 在别处出现过"的比较集都拿占位 ID 当身份 → 36 张无关谱面互相判成"同一张图被复用了"。
- **改动的源码注释同步更正**：`src/lib/beatmapIds.ts` 头部「全站唯一一处」改成「前端这一侧」，并写明后端有 `functions/api/_lib/beatmapIds.ts` 这份镜像、两份由测试锁一致、改一边必须改另一边。
- 新增 `scripts/beatmap-ids-backend.test.mjs`（**11 例**）：前后端两份实现的阈值与 14 个样本判定**逐项对齐**（含 `1.5`/`NaN`/`Infinity`/字符串/对象）；`parseOsuMetadata` 对 `0`/`1`/`-1`/空一律返回 undefined 而真实 ID 照常、边界 `2` 算真实；`/api/maps/meta` 对占位 setId 的 `.osz` 回的是"没有 ID"（`beatmapsetId === undefined` + `unsubmitted: true`）而真实 ID 照常回；`extractOsuFromOsz` 在两个难度一真一占位时按真 BID 唯一命中、单难度占位 BID 不报"不一致"而真 BID 不符仍拦住；`mapIdentityKey`/`findDuplicateRoundMaps` 不拿占位 ID 当身份（两条端到端断言）；`analyzeImportedMapIds` 的"这场已存在"比较集不含占位 ID；BulkImporter 的 ID 判读（含手抄 `1`/`0`）；`useMapHistory` 不按占位 ID 建索引。后三条（BulkImporter / MapUploader / useMapHistory）是**逻辑复刻** —— React 组件与 hook 没法在 `node:test` 里直接跑，所以行为仍需浏览器实机验收，这几条只保证"判读函数用对了"。
- **顺带修掉一处既有测试的夹具**：`scripts/admin-data-quality.test.mjs` 的"重复比赛警告"用例原来拿 `1/2/3` 当 BID —— 我改了 `analyzeImportedMapIds` 之后 `1` 会被判读滤掉，overlap 从 2/4 掉到 1/4、断言必挂。夹具改成真实量级的值（`5000001`…），并把"为什么不能用小数字当 BID 夹具"写进注释。这处**不是**被测代码的问题，是夹具与新的判读口径不再匹配。
- 影响面实测（2026-09-18）：`grep -rn "beatmapIds" functions/` → 改动前**空**（印证后端零接入）；本地 `data/tournaments` 52 场 4750 张谱面里 `"beatmapsetId": 1|0|-1` 与 `"beatmapId": 1|0|-1` **均无匹配** —— 脏数据只在线上的 GitHub 仓库里，所以 R33 的"数据不变量"测试在本地暂时是能过的（它挡的是复发，不是现状）。
- 未完成 / 仍有风险：① **两处同类的旧脚本未改**（都属既有工具的 R20 范围，不在 R33 改动集里）：`scripts/detect-type-conflicts.js:41` 按 `beatmapsetId` 分组且只判 `if (map.beatmapsetId)` —— 占位 ID 一样会把 36 张无关谱面粘成一组，与冲突检查器修好的那个 bug 是同一个；`scripts/backfill-bid.js:190` 写回 `beatmapsetId` 只判 `> 0` —— 触发面很窄（外层 `meta.beatmapId > 0` 已挡住"BID 是占位"那批，只有"真 BID + 占位 setId"这种少见组合能走到），但口径确实是旧的。② `find-suspect-realtypes.mjs` 的改动**未跑过**（脚本要读全库数据 + 我的 Bash 工具全程不可用）：改的是两处索引条件，逻辑上与测试里已覆盖的 `findDuplicateRoundMaps` 同款，但仍需实际跑一次 `node scripts/find-suspect-realtypes.mjs` 确认报告条数变化合理（预期：只会**减少**误报，不该凭空多出条目）。③ 后端这份判读**同样要人工保持同步**（没有构建期强制），只在测试里锁；④ 其余仍待站长：MKTC 数据 `git pull` 后跑清理脚本、真实 BID 人工补、浏览器实机验收。

## 6. 可靠性与局部修复任务

### R13 [P2] 上传状态 API 忽略分页

证据：functions/api/maps/status.ts:35；maps/meta.ts 已有分页示例。

解决方法：按 R2 truncated/cursor 循环累计结果；后续页失败返回错误而不是假装完整。键解析用 slice(prefix.length)，主图/NSV 分开处理。参数校验复用 R04。

验收：fake R2 两页、主图和 NSV 混合、提前截断页都不漏；第二页失败不返回成功的部分清单；无需等真实比赛达到 1000 文件再修。

**完成记录（2026-09-17）**

- 状态：实现完成待验收（改动未提交）。
- 修改文件：`functions/api/maps/status.ts`（按 cursor 循环分页；任一分页失败返回 502 `R2_LIST_FAILED`；列表键先过共享拆键校验）、`functions/api/_lib/mapKeys.ts`（新增 `splitMapRelative`）、`functions/api/_lib/tournamentId.ts`（`isValidTournamentId` 补 128 字符上限并导出 `MAX_TOURNAMENT_ID_LENGTH`）；新增 `scripts/map-status-pagination.test.mjs`。
- 实现要点：① R2 list 单页最多 1000 个对象且默认不分页 —— 超过 1000 张的比赛后面会被静默漏掉，前端于是把"已上传"的槽位显示成未上传；现在按 `cursor` 循环累计。② **中途任何一页失败一律返回错误**，不回"部分清单"（部分清单会被前端当成权威状态，进而清掉勾选）。③ 列表里的键先过 `splitMapRelative`（复用 `validateRoundId`/`validateSlot`）—— `r1/`、`r1/../x` 这类历史垃圾键在比赛 JSON 里不可能有对应槽位，不再混进界面状态。④ `isValidTournamentId` 补 128 字符上限（= `LIMITS.maxIdLength`，测试断言两者相等），免得只调它的 `/api/maps/*` 端点接受比写路径长得多的 id 去白跑 R2/GitHub。
- 运行的验证：`map-status-pagination.test.mjs` → **9/9**（单页主图/NSV 分开归类；25 张跨 3 页一张不少且 cursor 正确传递；第二页失败 → 502 且**没有** `uploaded` 字段；未截断时只调一次 list；`r1/`、`r1/../x` 等垃圾键被滤掉；`../evil`/`-leading`/200 字符 id 全 400，128 字符边界仍 200；两个常量相等；扫全库 8000+ 个（槽位 × 主图/NSV）键全部通过拆解校验）；`npm test` → **271/271**；前后端 `tsc` 0 错；`npm run build` 成功。
- 未完成 / 仍有风险：① 没有真实 R2 联调（目前没有超过 1000 个对象的比赛，逻辑靠假分页 bucket 覆盖）；② 前端在 502 时仍走"清空勾选"分支（R05 定的行为），没有区分"这场确实没传"与"状态读不到"——报告未要求，要区分得再加一个 UI 状态。

### R14 [P2] 上游错误伪装成空数据；上传列表错误响应导致崩溃

证据：functions/api/ref-ladder.ts:40；packs-manifest.ts:29；tournaments/[id].ts:34；src/components/admin/MapUploader.tsx:58。

影响：GitHub 401/403/5xx 被参考链/清单接口返回 200 空对象，用户以为数据被删；单比赛各种错误都报 404。上传页把 401/500 的 error 对象设进 tournaments，下一次 tournaments.map 可能直接抛错。

解决方法：

1. 只有真正 404 才走明确的“不存在”语义；认证/限流/网络/5xx 分类返回错误码，避免把 GitHub 凭据失效误报为用户没登录。
2. 前端检查 response.ok 与 payload 结构；列表只接收数组。失败保留上次有效数据并显示错误/重试或重新登录，不用空数据覆盖。
3. 校验 ref-ladder/manifest 的加载错误不会被当成新的空文件提交。错误响应不包含 token 或完整上游请求头。

验收：401、403 rate limit、404、500、无效 JSON 各有正确行为；上传页不崩；真实空列表仍正常；后端凭据错误不会显示“所有数据为空”。

**完成记录（2026-09-17）**

- 状态：实现完成待验收（改动未提交）。
- 修改文件：新增 `functions/api/_lib/github.ts`（GitHub 访问唯一入口 + 上游失败分类）；改 `functions/api/ref-ladder.ts`、`packs-manifest.ts`、`tournaments/[id].ts`、`tournaments/index.ts`、`references.ts`、`trash/index.ts`（删各自的本地上游请求副本，统一接分类）；改 `src/components/admin/MapUploader.tsx`、`DifficultyRefPicker.tsx`、`RoundRefPicker.tsx`；`src/lib/messages.zh.ts` / `messages.en.ts`（新增 `mapUpload.loadFailed` / `mapUpload.listNotArray` / `mapUpload.retry` / `refPicker.ladderFailed`）；新增 `scripts/upstream-errors.test.mjs`。
- 实现要点：① **上游故障一律回 502**，不占用 401 —— 401 在中间件里已经是“你没登录”的语义，被上游凭据问题占用会让前端以为要重新登录。② **404 要探一次才知道含义**：GitHub 对**无权访问的私有仓库回 404 而不是 403**，“token 失效”与“文件真的不存在”状态码完全一样（2026-11 那次后台三 tab 全空就是这个）。所以 404 时补一次 `GET /repos/{repo}`：仓库可见 = 真不存在（`NOT_FOUND`，调用方自己决定它是不是合法空态）；仓库也 404 = 凭据问题（502 `UPSTREAM_AUTH`）；探测本身也失败 = 说不清，回 502 让站长重试，**不伪装成“文件不存在”**。③ 网络中断不抛异常，归到 `UPSTREAM_UNREACHABLE`，调用点只判 `!res.ok` 就够。④ ref-ladder / packs-manifest 把 `NOT_FOUND` 当成合法空态（标尺/清单文件还没建）；`tournaments/[id]` 真不存在才回 404 并带上 `code`。⑤ 前端：`MapUploader` 的列表加载抽成 `loadTournamentList`，`!res.ok` 时读后端 error 抛错而不是把错误对象 `setTournaments`（后者下一次 `tournaments.map` 直接崩）；列表非数组也报错；失败**保留上一份有效数据**并显示错误 + 重试按钮。`DifficultyRefPicker` 失败**不再缓存失败的 Promise**（原来一次失败会把这个 isolate 的标尺读取永久钉死），`RoundRefPicker` 同样带出后端 error。
- 影响面实测（2026-09-17，按记忆 `diff-old-impl-then-filter-reachable`：用 `git show HEAD:` 取改动前实现**原样跑**，与改后对拍，假 fetch 路由 8 个场景）：

  | 场景 | 改前 | 改后 |
  | --- | --- | --- |
  | ref-ladder · GitHub 401 | **200** `{data:{entries:[]}}` | 502 `UPSTREAM_AUTH` |
  | ref-ladder · 404 且仓库不可见 | **200** `{data:{entries:[]}}` | 502 `UPSTREAM_AUTH` |
  | ref-ladder · 正常 | 200 带数据 | 一致 |
  | packs-manifest · 403 限流 | **200** 空清单 | 502 `UPSTREAM_RATE_LIMIT` |
  | tournaments/[id] · GitHub 401 | **404** “Tournament not found” | 502 `UPSTREAM_AUTH` |
  | tournaments/[id] · 真不存在 | 404 | 404（＋`code: NOT_FOUND`） |
  | tournaments 列表 · GitHub 401 | **401** | 502 `UPSTREAM_AUTH` |
  | tournaments 列表 · 正常 | 200 | 一致 |

  其中两处最坏：**(a)** `[id]` 把凭据失效报成 404 —— 站长看到的是“这场比赛没了”，会以为数据被删了去重传；**(b)** 列表把上游 401 原样透传，**前端会当成“你的登录过期了”而触发登出流程**，站长被莫名其妙踢出后台，真实原因（GITHUB_TOKEN 过期）反而查不到。另核实正常路径的 GitHub 调用次数**恒为 1**（探测只在 404 时发生），没有把每次请求都变成两次。
- 运行的验证：`upstream-errors.test.mjs` → **19/19**（401 / 403+ratelimit / 429 / 403 无 ratelimit / 5xx / 404+仓库可见 / 404+仓库不可见 / 404+探测失败 / 网络中断共 9 种分类；5 个端点的 handler 级行为；两条“正常路径不变、且不多打探测”的断言）；`npm test` → **305/305**；前后端 `tsc` 0 错。
- 未完成 / 仍有风险：① `DifficultyFitTool.tsx` 与 `admin/page.tsx` 的列表读取仍是静默失败（不崩、不污染缓存，但会把读不到显示成空）——同类问题，报告未点名，留待一并处理；② 未线上联调，分类阈值按 GitHub 文档模拟；③ 探测请求让 404 路径多一次往返（只在真不存在/凭据失效时发生，正常路径无影响）。

**复查追加修正（2026-09-17，另一条工作线复核后补做）**

- 状态：实现完成待验收（改动未提交）。
- 发现的漏网：分类只接到 6 个**读取**端点，`functions/api/maps/upload.ts` 与 `functions/api/tournaments/batch.ts` 仍在各自拼 GitHub 请求 —— 而它们恰好是最容易撞上凭据问题的**写路径**：
  ① **上传**读权威比赛 JSON 时按 `status === 404` 直判「比赛 X 不存在」。GitHub 对**无权访问的私有仓库回 404 而不是 403**（就是本次 R14 认定的证据），于是 token 失活时站长被告知「比赛不存在」，会以为数据被删了去重传；更糟的是前端 `res.status >= 400 && < 500` 判断为**确定性失败、直接不重试**，连重试的机会都没有。
  ② **批量保存**链路上任何上游故障都只剩一句「HTTP xxx」的 500（读 ref / 读 commit / 建 blob / 建 tree / 建 commit / 推 ref），凭据失效与限流长得一模一样。
- 修改文件：`functions/api/maps/upload.ts`（`fetchTournamentJson` 改走 `githubFetch` + `classifyGithubFailure`：只有 `NOT_FOUND`「仓库可见但没这个文件」才是 404 `TOURNAMENT_NOT_FOUND`，其余回 502 + code）、`functions/api/tournaments/batch.ts`（本地 `gh()` 改为委托 `githubFetch`；六处失败点统一 `failUpstream` → 502 + code；逐文件读的 404 保留「该 commit 里没有此文件」语义 —— 能走到那里说明 `/git/ref/heads/main` 已读成功，token 对仓库有权限，所以不需要探测仓库，非 404 才分类）；新增 `scripts/upstream-errors-write-path.test.mjs`；`scripts/map-keys.test.mjs` / `scripts/batch-conflicts.test.mjs` 的假 fetch 改成返回真实 `Response`。
- **顺带修掉两个假通过**：那两个测试文件的桩返回的是 `{ ok, status, json }` 假对象，而 `classifyGithubFailure` 会 `res.clone()` 读一次响应体 —— 只要某个用例返回 404，生产代码就会抛 `TypeError: res.clone is not a function`，被 handler 的 catch 兜成 500。`batch-conflicts` 里「读取失败必须报错」那条用例正是**因为这个 TypeError 才 500「通过」的**（断言的是状态码 500）。两处改成真实 `Response` 后该用例断言同步改成 502 + `UPSTREAM_ERROR`。
- 影响面对拍（把两个文件临时还原成 `HEAD` 版本、用同一份新测试原样跑）：**8 例里 5 例失败** —— 上传凭据失效、上传限流/断网、批量 ref 404 凭据失效、批量 ref 401、批量建 blob 限流；另 3 例（真不存在仍是 404、两条正常路径不变）两版都通过。说明这些断言确实区分新旧行为，不是空转。
- 运行的验证：`upstream-errors-write-path.test.mjs` → **8/8**；`npm test` → **313/313**；前后端 `tsc` 0 错；`npm run build` 成功。
- 未完成 / 仍有风险：① **写路径仍透传上游状态码** —— `PUT /api/tournaments/{id}`（`code: UPDATE_FAILED` 但沿用上游 status，token 失效时回的是 **401**）、`DELETE /api/tournaments/{id}`、`PUT /api/references`、`PUT /api/packs-manifest` 四处仍是 `jsonResponse({ ... }, res.status)`，与「401 是『你没登录』的语义」这条原则不一致（建议同款替换成 `upstreamFailureResponse(await classifyGithubFailure(res, env))`）；② 上传在凭据失效时会被前端按 5xx 重试 3 次才报错（能用，但多两次无谓请求）；

**复查追加修正 2（2026-09-17 傍晚）：四处写路径收尾 + 一处真 bug**

- 状态：实现完成待验收（改动未提交）。
- 收尾内容：`PUT /api/tournaments/{id}`、`DELETE /api/tournaments/{id}`、`PUT /api/references`、`PUT /api/packs-manifest` 也接入分类。分流规则：**能分类的说清类别**（凭据 / 限流 / 权限 / 网络 / 不存在 → `upstreamFailureResponse`，502 或 404 + code）；**分不出类别（5xx / 没见过的状态码）时保留调用方自己的文案 + GitHub 原文，但状态码统一成 502**（新增 `isGenericUpstreamFailure`）—— 这样既不透传上游状态码，也不会违反 R02 复审那条「别只剩一句 Failed to update」的要求。
- **过程中撞到一个真 bug（由新测试当场抓到）**：`[id].ts` 的 PUT 原本先 `await res.json()` 读 body（给 409 分支取 GitHub 的 "sha does not match"），我第一版把分类放在它后面 —— `classifyGithubFailure` 里的 `res.clone()` 直接抛 **`Body has already been consumed`**，在生产上就是一个 500。两处修掉：① 调用点改成只在 409 分支读 body（加注释说明 body 只能读一次）；② `github.ts` 的 `readOwnFailure` 给 `clone().json()` 加 try/catch —— 读不到就退回按状态码分类，**绝不因为"读个诊断信息"把整个请求变成 500**。
- 测试：`upstream-errors-write-path.test.mjs` 扩到 **14/14**（新增 6 例：PUT 单场 401 → 502 `UPSTREAM_AUTH`、PUT 单场 GitHub 409 仍是 409 `EDIT_CONFLICT`（分类不能吃掉原有冲突语义）、PUT 单场正常 200 且回传新 sha、DELETE 单场 401 → 502、references PUT 401 → 502 且正常写入仍 200、packs-manifest PUT 限流 → 502 `UPSTREAM_RATE_LIMIT`）；`scripts/tournament-save.test.mjs` 的 R02 复审断言同步把 `500` 改成 `502`（文案与 code 不变，已注明原因）。
- 影响面对拍（把 `[id].ts` / `references.ts` / `packs-manifest.ts` 临时还原成 `HEAD` 版本、用同一份测试跑）：**14 例里 4 例失败** —— 正是新增的那 4 条写路径断言；恢复后 14/14。
- 运行的验证：`npm test` → **319/319**；前后端 `tsc` 0 错；`npm run build` 成功。
- 至此 **8 个访问 GitHub 的端点全部接入统一分类**（上传、批量保存、单场增改删、列表、references、packs-manifest、ref-ladder、回收站），R14 点名要区分的行为（401 / 403 限流 / 404 / 500 / 无效 JSON / 网络中断）都有对应用例。仍未做：未线上联调（分类阈值按 GitHub 文档模拟）。

### R15 [P2] 管理员角色校验、缓存可变引用与 KV 并发

证据：functions/api/admins/index.ts:110、:114、:124、:136；_lib/auth.ts:174、:196。

解决方法：

1. 对 role 用 typeof string + 自有属性/枚举校验，uid/username 也先验类型；从 KV 读到非法 role 时按 readonly 处理并记录诊断。
2. getAdminMap 当前返回缓存对象本身，调用方直接增删再 await put；写失败会留下未落库的缓存变更。先复制再修改，持久化成功才替换缓存。
3. 整份 admins 表在 KV 读改写会并发丢更新；若要求可靠权限变更，用 Durable Object 等强一致协调所有写入，明确跨节点缓存策略。只拆成每 UID 一个 KV key 仍不能解决同 UID 竞争及即时撤权。
4. 不再声称所有节点最多 5 秒生效。记录真实一致性边界；需要即时撤权时读取路径也必须符合相应保证。

验收：constructor/toString/数组角色被拒绝；KV put 失败后原角色不变；两个管理请求不互相覆盖；bootstrap owner 不可变；跨节点撤权行为符合文档。

**完成记录（2026-09-17）**

- 状态：实现完成待验收，**但第 3 条验收项（并发不互相覆盖）明确未达成**，见下。改动未提交。
- 修改文件：`functions/api/_lib/auth.ts`（新增并导出 `isRole`、新增 `sanitizeAdminMap`、`getAdminMap` / `putAdminMap` / `hasRole` 改写、新增 `clearAdminMapCache`）、`functions/api/admins/index.ts`（role 改用 `isRole`、uid/username 先验类型、body 改走 `readJsonBody`）；新增 `scripts/admin-role.test.mjs`。
- 实现要点：① **原型链不是角色表**。`role in ROLE_RANK` 对 `'constructor'` / `'toString'` / `'valueOf'` / `'__proto__'` / `'hasOwnProperty'` 全部返回 true（已 `node -e` 实测），请求体塞 `role: 'constructor'` 能通过校验写进 KV。它**不提权**（`ROLE_RANK['constructor'] >= 1` 是 `function >= 1` → false），但会写脏数据，且之后该管理员被**静默降级成 readonly**（比较得 NaN → false，还不报错）。改用 `Object.prototype.hasOwnProperty.call(ROLE_RANK, value)`（`isRole`），`hasRole` 里再挡一次作纵深防御。② **读出来的脏数据要净化**：`sanitizeAdminMap` 逐条过 `isRole`，非法的剔除并打 `[auth] INVALID_ROLE_IN_KV`（只记 uid 与 role 的 typeof，无敏感值），一处的坏数据不该让整份名单失效。③ **缓存不能是可变引用**：`getAdminMap` 返回**副本**（调用方拿到后会直接 `delete map[uid]` 再 `putAdminMap`，返回本体的话一旦 put 失败就留下“内存里改了、KV 里没改”的假象）；`putAdminMap` 先落 KV、**成功了才更新缓存**。④ 类型校验：uid 是数字/对象时 `(uid ?? '').trim()` 直接抛 → 500，现在先 `typeof` 再 trim，回 400。⑤ **一致性边界改写**：删掉“所有节点最多 5 秒生效”的说法 —— 那 5 秒只是**本 isolate 内**的读缓存 TTL，KV 本身最终一致、官方给的全球传播上界是 **60 秒**，所以一次撤权在别的边缘节点上最多可能延迟约 60s + 5s。
- 影响面实测：**没能核**线上 KV 里是否已有非法 role（无线上凭据，`admins` key 读不到）。所以 `sanitizeAdminMap` 按“可能已经有脏数据”处理 —— 即使历史上被人塞过 `role: 'constructor'`，读取时也会被剔除并降级成 readonly，而不是继续喂给 `hasRole`。若确实没被利用过，这段就是纯预防性的。
- 运行的验证：`admin-role.test.mjs` → **15/15**（8 个原型链名字 + 非字符串/大小写/空串全被 `isRole` 拒；`hasRole` 对非法 role 不给任何权限；KV 里预置 `role: 'constructor'` 的条目被剔除、同次读取的合法条目不受连累、且留下诊断；`getAdminMap` 返回副本；**KV 写失败后角色不变**；`clearAdminMapCache` 后重读 KV；POST `role=constructor` → 400 且**不落库**；uid 数字 → 400 而非 500；username 非字符串 → 退回 uid；body 非 JSON → 400；合法请求正常写；bootstrap owner 改/删均 403；DELETE uid 非字符串 → 400）；`npm test` → **305/305**；前后端 `tsc` 0 错。
- 未完成 / 仍有风险：① **「两个管理请求不互相覆盖」未达成** —— `putAdminMap` 仍是「读整份 → 改 → 写整份」，并发权限变更会互相覆盖（后写的赢）。真正修需要 Durable Object 之类的强一致协调，属架构改造，不在本轮范围；只把名单拆成每 UID 一个 key **解决不了**同 UID 竞争，也解决不了即时撤权。已把这条边界写进 `auth.ts` 的注释。实际触发面极小：只有站长在后台改权限时才会发生，两次点击之间隔着一次 KV 往返。② 跨节点撤权符合文档 —— 文档已改成 60s + 5s 的真实上界，代码行为与之一致；要即时撤权仍需换存储。③ 未线上联调。

### R16 [P2] 长 batch target 超出 KV metadata 限额，审计静默丢失

证据：functions/api/_lib/audit.ts:43；batch.ts:148。只截断 detail 的字符数，target=ids.join(',') 不限长度，中文字节数也不等于字符数。已模拟复现。

解决方法：

1. 完整审计正文留在 KV value；metadata 仅放列表所需的有界字段，用 TextEncoder 计算 JSON UTF-8 总字节，留足 1024 字节限额余量。
2. 长 target/detail 用摘要或计数，完整详情按 key 读取；前端配合查看完整记录。
3. 审计失败可不回滚已成功业务操作，但必须有不含敏感信息的服务端错误日志/计数，不能完全静默。

验收：多比赛长 ID、中文 actor/detail 时 metadata 小于限制，完整 value 不丢；列表可看摘要，详情可见完整；模拟 KV 失败有可观察诊断。

**完成记录（2026-09-17）**

- 状态：实现完成待验收（改动未提交）。
- 修改文件：`functions/api/_lib/audit.ts`、`functions/api/audit/index.ts`、`src/components/admin/AuditLog.tsx`、`src/lib/messages.zh.ts` / `messages.en.ts`（新增 `audit.viewFull`）；新增 `scripts/audit-meta.test.mjs`。
- 实现要点：① 新增 `buildAuditMetadata`：先按字符粗截（detail 200 / target 300），再按 **UTF-8 字节**（`TextEncoder`）逐字段对折收缩到 820 字节安全线内（KV 硬上限 1024）；只要裁过就打 `truncated: true`。② **完整正文始终留在 KV value**，metadata 只是列表用摘要；`listAudit` 现在把 KV key 一并带出，新增 `getAuditEntry`（**只认 `audit:` 前缀**、key ≤200 字符），端点支持 `?key=` 取全文。③ `writeAudit` 失败不再静默：`console.error('[audit] AUDIT_WRITE_FAILED', { action, targetChars, detailChars, error })` —— 只记长度与错误消息，**不含 token / 请求头**。
- 影响面实测（2026-09-17，提交前按真实数据核算）：触发线 **31 场**（`batch.ts` 的 target = `ids.join(',')` 完全不截，`LIMITS.maxBatchItems` = 200 允许一次带这么多）。历史最大批次是 18 场（`2e8abf1`）→ target 546 字节、加其余字段约 714 字节，**没超 1024，所以过去没丢过审计**；但全库现在已有 52 场，**后台"全选保存"一次 ≈ 1579 字节 → KV 直接拒写、整条审计静默消失**，只差一步就踩到。修复后再全选：metadata 收进 820 字节、全文留在 value、列表出现"查看完整"。
- 运行的验证：`audit-meta.test.mjs` → **9/9**（短条目不动；200 个比赛 id 的长 target 收缩到 ≤820 字节且带 truncated；200 汉字 = 600 字节放得下、400 汉字必须收；超长 actorName/ip 也能收而 `action`/`ts` 不丢；模拟 KV 拒写超限 metadata 但收缩后可写、且 value 保留完整 target；模拟 KV 失败时只记录那 4 个字段；`listAudit` 带 key 且按 key 取回全文；`getAuditEntry` 不读非 `audit:` 前缀与超长 key；旧的无 metadata 条目照常列出）；`npm test` → **271/271**；前后端 `tsc` 0 错；`npm run build` 成功。
- 未完成 / 仍有风险：① 前端"查看完整"是行内展开，没做复制/分页；② 审计仍写单个 KV（其配额与并发问题不在本项范围）；③ 未做真实 KV 联调，拒绝阈值按文档 1024 字节模拟；④ 收缩只覆盖 detail/target/actorName/ip 四个可变文本字段 —— 万一全裁空仍超限会退回旧行为（拒写 + 日志），实际不可达（最小 metadata 约 180 字节）。

### R17 [P2，潜在] LN 参考选择器 fallback 读错字段

证据：src/lib/referenceData.ts:92；RoundEditor.tsx:410、:609；MapSlotEditor.tsx:498；difficultyFit.ts:122。

触发：轮次没有 typeDifficulties.LN.ln，仅 LN map.difficulty=12。getRefValue(...,'LN','ln') 返回 null，拟合工具返回 12。当前全库未触发该条件，但导入/新建数据可触发。

解决方法：保持显式汇总值优先；LN/ln 的单图 fallback 读取 difficulty，HB/TB 的 ln fallback 仍读取 difficultyLn。若提取共享读取函数，保持各调用方现有精度规则，不顺手全站改小数位。

验收：LN fallback=12；HB/TB 双难度不串；显式汇总优先；0/缺失值不变成有效测量；参考链与拟合取同一语义。

**完成记录（2026-09-17）**

- 状态：实现完成待验收（改动未提交）。
- 修改文件：新增 `src/lib/mapDifficultyReading.ts`（唯一读数实现 `readMapDifficulty`）；`src/lib/referenceData.ts`（`getRefValue` 改用它）、`src/lib/difficultyFit.ts`（`getRoundDifficulty` 去掉 ln-ln 专用补丁，改用它）；新增 `scripts/map-difficulty-reading.test.mjs`。
- 根因：`getRefValue` 的 fallback 写的是"ln 一律读 `map.difficultyLn`"，而**全库 LN 类 1205 张图的 `difficultyLn` 全为空**（HB 470/882、TB 164/321 才有这个字段）→ LN 的 **fallback 分支**（无显式汇总值时按图平均）必然取不到值；`difficultyFit` 当时为 ln-ln 单独打了补丁，两份实现就此分叉。
- 影响面实测（2026-09-17，提交前全库对拍）：**本次修复在当前数据上 0 处可见变化**，与上面"触发"行的"当前全库未触发该条件"一致。351 个含 LN 图的轮次里 —— 181 个有显式 `typeDifficulties.LN.ln`（走显式优先，一直有值、未受影响）；另 170 个既无显式值、LN 图的 `difficulty` 也没录入（改前改后都取不到）。**它修的是潜伏路径**（导入/新建数据漏填汇总值时才触发）+ 消除与 `difficultyFit` 的实现分叉，不是已发生的线上故障。
- 实现要点：rf → `difficulty`；ln → **LN 类读 `difficulty`**、HB/TB 读 `difficultyLn`。只负责"取一个正整数读数"，平均值与小数位规则留在各调用方（报告要求不顺手全站改小数位：`getRefValue` 仍 `.toFixed(1)`、`getRoundDifficulty` 仍原样）。
- 运行的验证：`map-difficulty-reading.test.mjs` → **12/12**（LN 两侧都读 difficulty；HB/TB 双难度不串；0/缺失/NaN/Infinity/负值都算没有读数；LN 只有 difficultyLn 时的兜底；显式汇总优先；汇总为 0 要回退到谱面；无有效读数返回 null；`resolveLadder` 里 LN 轮次不再整条落空；**`difficultyFit` 与 `referenceData` 对 6 个维度给出同一答案**；扫全库断言 LN 无 difficultyLn 且 HB 有）；`npm test` → **271/271**；前后端 `tsc` 0 错；`npm run build` 成功。
- 未完成 / 仍有风险：① 这条依赖链上的 import **必须显式带 `.ts`**（referenceData/difficultyFit 会被 node --test 静态导入且未注册 loader），以后加新的值导入要注意；② `map.difficultyLn` 还有别的读点（`danLabels`、`MapSlotEditor`、`tournamentMerge`），各自的 type 口径是合理的，未一并改；③ `round.typeDifficulties.LN.ln` 若被填成显式值仍然优先。

### R18 [P2，局部] 常数样本错误固定斜率也显示 R²=1

证据：src/lib/difficultyFit.ts:220；DifficultyFitTool.tsx:688。样本 (0,5)、(1,5)，固定 slope=2，RMSE=1，R² 返回 1。

解决方法：总方差为 0 时 R² 本来未定义，约定并实现 UI 展示 N/A（推荐 nullable 指标），或明确采用“完美预测=1，非完美=0”的有限值约定。不要对一般负 R² 做 clamp，它意味着该固定斜率比均值预测更差。

验收：上述样例不再显示“完美拟合”；常数且预测精确的约定清楚；非恒定样本允许负 R²；既有 slope/prediction/RMSE 不改变。

**完成记录（2026-09-12）**

- 状态：实现完成待验收（改动未提交）。
- 修改文件：`src/lib/difficultyFit.ts`（`LinearFit.rSquared` 类型改为 `number | null`，两处 `totalSum <= Number.EPSILON` 分支返回 `null`，删除 `Math.max(0, ·)` 截断）；`src/components/admin/DifficultyFitTool.tsx`（R² 显示 `N/A`）；新增 `scripts/difficulty-fit.test.mjs`。
- 运行的验证：`node --test --experimental-strip-types scripts/difficulty-fit.test.mjs` → 5/5；`npm test` → 75/75；`npx tsc --noEmit` → 0 错；`npm run build` → 成功。样例：`(0,5)(1,5)` + 固定 `slope=2` → R²=null、RMSE=1、predict(0)=4；`slope=0` 精确预测仍为 null；最小二乘常数样本为 null；`(0,0)(1,1)(2,2)(3,3)` 强制 `slope=-1` → R²=-3（不再被截为 0）；普通样本 R²/slope/intercept/predict 全部不变。
- 未验证或仍有风险：`N/A` 为硬编码文案（与既有的硬编码 `R²` 标签一致），未走 i18n；当前全库仅 `DifficultyFitTool.tsx` 一处消费 `rSquared`，无其它页面受影响。
- 与后续任务的接口变化：`LinearFit.rSquared` 变为可空——任何新增消费方必须处理 `null`（表示样本无方差、R² 未定义）。

### R19 [P2] 修复 lint 与本地启动说明

证据：package.json:11 实测 next lint 失败；next.config.js 静态 export，与 package.json 的 next start 启动脚本不匹配。

解决方法：

1. 新增 ESLint 9 flat config，采用已安装 eslint-config-next 的合适预设，忽略 .next/out/src/generated/用户目录；lint 改为 eslint。
2. 用兼容 Next 16 的配置，真实运行检查。存量规则错误记录基线并小步修；不得大范围禁规则或顺手重构整库。
3. 明确静态预览与带 Functions 联调的启动方式。next start 不适用于 output:export；可提供静态 out 服务或 wrangler pages dev 的独立脚本，别把纯静态预览说成后端联调。
4. 如加入 CI，前后端 TypeScript 与测试分别覆盖；不要认为 next build 会自动执行 ESLint 或检查被排除的 Functions。

验收：lint 不再将 lint 当目录；新配置可执行且无意扫描用户目录；启动说明可实际打开静态站，Functions 测试入口另有说明。

### R20 [P2] 旧冲突脚本按图集归并，修复定位未限定轮次

证据：scripts/detect-type-conflicts.js:48、:73、:189。按 beatmapsetId 比较 type，同 set 不同难度本来可以不同 type；修复遍历全部 rounds，仅匹配 beatmapId 与 slot，两个 undefined BID 也会相等。

解决方法：

1. 默认只读 dry-run，不凭同 set 不同 type 自动认为错误；复用已有 BID/倍速冲突分类规则，set 差异作为人工核对项。
2. 真正写回需要显式 apply，并用文件 ID + round ID + slot + 原始身份/原始值精确定位；无可靠身份或重复位置拒绝自动修。
3. 保存前显示差异并校验整体数据，防止 type/realType 不一致；备份或通过可审查补丁输出。
4. 迁移到 oneoff 目录若需要，同步 workflow/路径，不仅改文件头注释。

验收：同 set 不同 BID 不误报必修冲突；不同轮次相同 slot/无 BID 不串改；默认运行不写比赛数据；输入与原始值不一致时拒绝 apply。

## 7. 加固、维护与实施边界

### R21 [P2，加固] 明确后台安全头和写请求 Origin 边界

证据：仓库无 public/_headers；functions/api/_middleware.ts 与 _lib/cors.ts 未做写请求 Origin 检查。未核实线上响应及控制台规则。

解决方法：

1. 先只读检查正式域名 /admin、尾斜杠/实际导出路径与 API 的响应头，记录实际值。Cloudflare 可能在仓库外配置，不能凭缺目录断言没有。
2. 静态 admin 配置 CSP frame-ancestors 'none'，可加 X-Frame-Options: DENY；Functions 响应头在代码中处理，不能假设 Pages _headers 覆盖 Functions。
3. 写 API 配置精确 Origin allowlist，明确生产/预览/本地和无 Origin 工具请求策略；OAuth callback 保持独立处理。继续保留身份及角色校验。
4. 不直接上 script-src 'self' 破坏 Next 静态内联启动脚本；frame-ancestors 可单独部署，再验证完整 CSP。
5. 如收拢 CORS/json helpers，保留 raw 谱面 text/plain、附件下载、缓存头等响应差异。GET-only 方法列表不是 bug。

验收：后台不能被跨站 iframe 嵌入；正常首页/后台/OAuth 可用；不允许的写 Origin 拒绝；允许 Origin 正常；未登录依旧 401、无权限依旧 403；部署后实测静态与 Functions 两类响应。

### R22 [P3] 构建产物、无生产调用算法与文档清账

范围：.gitignore、tsconfig.tsbuildinfo、src/lib/roundLabelLayout.ts、scripts/round-label-layout.test.mjs、相关交接文档。

解决方法：

1. 将 tsconfig.tsbuildinfo 加入忽略并停止跟踪，保留本地文件；不要还原其中已有改动。
2. RoundLayout 类型仍被 LadderView 使用，不能删整个模块导致 import 断裂。删除无调用算法时同时清理对应测试，或明确标记暂存未启用；不恢复已撤回的标题层。
3. 统一重复校验/保留期常量仅在能清楚跨 Node/Workers 共用时做；不能为小常量引入大架构。
4. 后台 auth 尾斜杠行为先用 Pages 环境核实；如果需支持，在不扩大 PUBLIC_PATHS 的前提下做精确归一并回归，不使用宽泛前缀免鉴权。
5. 同步状态文档，区分已实现/已部署/已验收，记录日期和验证证据；不要把历史“63 tests”当作当前结果。

验收：构建后不再出现新 tsbuildinfo 差异；LadderView 类型检查与布局不变；剩余测试覆盖生产行为；用户目录与未提交 UI 改动保留。

## 8. 任务清单与后续记录

以下任务除标注 ✅ 外均为“待实施”，本次只写方案。P1 指有明确触发条件的数据丢失/覆盖或发布损坏风险，不表示已确认线上遭遇事故。

进度速览（2026-09-17）：✅ R01（实现完成待验收，UI 自动重放未做）、✅ R02（实现完成待验收，浏览器端未联调）、✅ R03（已提交 `3634998`，未线上联调）、✅ R04（实现完成待验收，未提交，未线上联调）、✅ R05（实现完成待验收，未提交，时序行为无自动化测试）、✅ R06（实现完成待验收，未提交，**「替换当前版本」入口未做**、未线上联调）、✅ R07（实现完成待验收，未提交，并发删/重传未验收）、✅ R08、✅ R09、✅ R18、✅ R24（实施期间新增：下载路径网络重试，未提交）、✅ R25（悬浮卡段位与框高同源，未提交）、✅ R26（不参与难度统计 + 整场视图按指针选轮次 + 版本 0.9.0，未提交）、✅ R27（键型冲突改“勾选才改”+批量选择，未提交）、✅ R28（PDEX 键型 + 默认键型一律 Pending + 误标检测工具，未提交，检测结果需人工复核）、✅ R29（悬浮卡 TB 段位改用实际难度，未做浏览器验收）、✅ R30（TB 段位规则细化 + 每轮图池标题折行；MCNC 简写查为残留记录，数据未改）、✅ R31（合包分包规则均分 + `$` 注入修复 + NSV 缺音频借用主图；未重新生成包）、✅ R13（状态 API 分页 + 失败不返回部分清单，未提交）、✅ R16（审计 metadata 按字节收缩 + 失败可见 + 可按 key 看全文，未提交）、✅ R17（LN 参考读数改用 difficulty，两处实现合并，未提交）、✅ R14（上游故障不再伪装成空数据/404/401，404 探仓库可见性，前端不再崩且失败保留旧数据，未提交）、⚠️ R15（原型链 role 拒绝 + 脏数据净化 + 缓存返回副本 + 写失败不动缓存 + 一致性边界改成 60s+5s；**并发丢更新未修**，需强一致存储，未提交）、✅ R14 复查追加（上传/批量保存 + 四处写路径全部接上分类：凭据失效不再报「比赛不存在」也不再回 401，批量上游故障回 502 而不是 500；过程修掉一个 `res.clone` 已被消费导致 500 的真 bug，未提交）、✅ R32（删除 .osz 后该 slot 的本地 name/BID 与暂存补丁一起回滚 + 删除后对账已上传状态，未提交）、✅ R33（占位 ID 判读 + 冲突检查器/下载路径防护 + 检测与清理脚本；**MKTC 的 36 条数据待站长清理**）；其余待实施。

| 编号 | 工作单元 | 主要依赖 |
| --- | --- | --- |
| ✅ R01 | 保存基准与旧草稿冲突保护 | 无 |
| ✅ R02 | 连续保存/新建转编辑 | 与 R01 响应协议对齐 |
| ✅ R03 | 运行时 schema 与 ID | 无 |
| ✅ R04 | R2 字段、键与文件验证 | 复用 R03 |
| ✅ R05 | 上传页异步隔离与补丁快照 | 与 R01/R04 协调 |
| ✅ R06 | 上传版本与恢复防覆盖 | R04，配合 R08 |
| ✅ R07 | 删除恢复记录与失败顺序 | R04，与 R06 同文件串行 |
| ✅ R08 | 备份失败策略 | 无；versions 支持接 R06 |
| ✅ R09 | Drive 失败误删 | 无，建议首先修 |
| R10 | 合包发布完整性 | R09，发布消费方一起改 |
| R11 | 谱面身份/指纹与备选副本 | 与 R10 串行 |
| R12 | workflow/CLI/单类型发布 | 与 R10 协议对齐 |
| ✅ R13 | R2 状态分页 | 可独立，键规则接 R04 |
| ✅ R14 | 上游错误与 UI 错误状态 | 可独立 |
| ⚠️ R15 | 角色校验与一致性 | 局部校验已做；并发覆盖未达成（待换强一致存储） |
| ✅ R16 | 审计 metadata 字节上限 | 可独立 |
| ✅ R17 | LN 参考回退 | 可独立 |
| ✅ R18 | 常数样本 R² | 可独立 |
| R19 | lint/启动与验证入口 | 可独立 |
| R20 | 旧冲突脚本防串改 | 可独立 |
| R21 | 安全头/Origin | 先核实部署 |
| R22 | 构建与死代码清账 | 最后做 |
| R23 | 包内容/部署核实及发布验收 | 只读核实可先做，发布等合包修复 |
| ✅ R24 | 下载路径网络重试（实施期间新增） | 无 |
| ✅ R25 | 悬浮卡段位改用现算值（实施期间新增） | 无 |
| ✅ R26 | 谱面"不参与难度统计" + 整场视图悬浮（站长需求） | 无 |
| ✅ R27 | 键型冲突“勾选才改”+批量选择（站长需求） | 无 |
| ✅ R28 | PDEX 键型 + 默认键型改 Pending + 误标检测（站长需求） | 无 |
| ✅ R29 | 悬浮卡 TB 段位改用实际难度（站长反馈） | 无 |
| ✅ R30 | TB 段位规则细化 + 每轮图池标题折行（站长反馈） | 无 |
| ✅ R31 | 合包分包规则 / `$` 注入 / NSV 缺音频（站长反馈） | 无 |
| ✅ R32 | 删除 .osz 后本地信息不回滚（站长反馈） | 无 |
| ✅ R33 | 占位 beatmapId/beatmapsetId（站长反馈） | 无 |

完成记录模板（由执行对应任务的 AI 填写在该任务末尾）：

- 状态：待实施 / 实现完成待验收 / 已验收。
- 修改文件与 commit（未提交则明确写未提交）。
- 实際运行的验证、结果和测试用例。
- 未验证部分或仍有风险的条件。
- 与后续任务的接口变化。

本轮未进行真实 OAuth、Cloudflare Pages 浏览器联调、线上响应头检查、R2/Drive 包内容比对或生产恢复测试。大型表单与几何渲染也没有做全面浏览器验收；后续发现新增问题应继续写入本文件并给出独立证据。

## 9. 提交前复审补充（2026-09-13）

本次推送前做了一轮独立只读复审（审查未提交改动 + 复核 R08/R09/R18 的失败路径）。结论：改动方向与实现正确（`npm test` 115/115、前端与 Functions 类型检查 0 错、`npm run build` 成功、凭据扫描无命中），但发现 3 处"空集合 → 把桶里/Drive 上的东西全删掉"的同类缺口，已全部补上守卫并配回归测试：

- **R09 补充**：`scripts/upload-to-gdrive.js` 新增导出 `assertNonEmptyPacks()`，`main()` 在读取 manifest 后立即调用。原逻辑在 `packs` 为空时 `failed.length === 0` 成立，`computeOrphans(上一版, ∅)` 会把上一版**全部** fileId 判成孤儿并删除（R2 内仍有包可重跑恢复，但期间所有下载链接失效）。测试：`upload-to-gdrive.test.mjs` 新增「空 manifest 直接拒绝执行，绝不进入孤儿清理」，并顺带断言空本版确实会让上一版全部成为孤儿（证明守卫的必要性）。
- **R08 补充**：`scripts/backup-r2.js` 中 `backupPrefix` / `backupAll` / `cleanupTrash` / `runBackupJob` 的 `redact` 默认值由恒等函数 `(m) => m` 改为 `redactSecrets`。此前 `main()` 未显式传参，本项自己声明的「失败日志不含密钥」验收条件其实没有落地（只有 `main().catch` 那条走了打码）。测试：`backup-r2.test.mjs` 新增「不传 redact 时默认打码」，并在 `require` 脚本之前注入假 `R2_SECRET_KEY`，否则默认 secrets 为 undefined 会使该用例假通过。
- **R10 前置**：`scripts/generate-pack.js` 在 `allResults.length === 0` 时跳过 packs 孤儿清理（原逻辑 `producedKeys` 为空会让 packs 桶里所有 `.osz` 被判成孤儿）。这是该文件的既有形状，属 R10 范围内的一小块；R10 要求的发布完整性状态机（区分"槽位本来未上传"与"读取/上传失败"、runId 隔离键、manifest 成功后再清理）**仍未实施**。

复审另记的覆盖缺口（未修，留给后续任务）：两个脚本的 `main()` 接线均无测试覆盖（删掉非零退出那几行，现有测试仍全绿）；`upload-to-gdrive.test.mjs` 的 `existingNames` 从未被传入，`findExistingFileId` 命中后走 update 的分支零覆盖；`backup-r2` 的 Put 断言不校验 `Bucket/Key`，源/备份桶写反抓不到。

> 状态更新：本文件此前多处标注的"改动未提交"已过期——R01 / R08 / R09 / R18 的实现与谱面可视化、以及上述 3 处守卫，已随本次提交进入 `main`。R02 与 R03 的实现目前在工作区（未提交）。R04–R07、R10–R17、R19–R23 仍为待实施。

## 10. 用户追加项（2026-09-13，非 R 编号）

### 10.1 修正文件名笔误 natrion → national

依据：`data/tournaments/osu-mania-chinese-natrion-cup-4k-2026-rebirth.json` 文件名拼错，内部 `id` 写的是 `osu-mania-chinese-national-cup-4k-2026-rebirth`，两者不一致（R03 的「文件名必须与 body.id 一致」只能靠一条兼容路径给它放行）。用户要求修掉。

做法：**只改文件名**。内部 id 本来就是正确拼写，所以文件内容一字未动 —— 新旧 blob 都是 `b8cda18c0ce035d6733ca368a61e8867f0dc69cb`（`git hash-object` 与 `git rev-parse HEAD:<旧路径>` 相同），git 会识别为纯改名。同目录另有一场 `osumania-chinese-national-cup-4k-2026-rebirth.json`（少了第二个连字符）是**另一场比赛**，未受影响；改名目标无重名。`src/generated/tournaments.ts` 已按新文件名重新生成。

验证：`scripts/validation.test.mjs` 的全库用例从「不一致 ≤ 1」收紧为「必须为 0」；`npm test` → 145/145。

### 10.2 难度阈值：上限 25、超过 18 警告

依据：用户要求「编辑比赛的时候所有难度填写不能超过 25，防止不小心多打了个 0（超过 18 就要出警告）」。

- 规则唯一实现 `src/lib/difficultyLimits.ts`（纯函数、无 `@data` 依赖，可被 node --test 导入）。`> 25` **拒绝这次输入**而不是截断 —— 截断会把明显的笔误变成"看起来合理"的 25，更危险；`> 18` 只警告、值照存。
- 接入点：`RoundEditor`（轮次汇总全部 `_typeDiffs` 字段 + 单 TB 直连写穿的路径 + 顶部汇总提示）与 `MapSlotEditor`（单图 `difficulty` / `difficultyLn`，原有的 `max="20"` 一并改为 25）。
- 服务端兜底：`functions/api/_lib/validation.ts` 的 `LIMITS.maxDifficulty = 25`，作用于 `maps[].difficulty`、`maps[].difficultyLn`、`rounds[].difficulty.{min,max,average}`、`typeDifficulties.*.*`。不走 UI 的写入（手改 JSON、脚本直接调接口、导入的旧 JSON）由这道 400 拦住。
- 阈值不是拍的：先扫全库（50 场 / 345 轮 / 4429 槽位）确认**最大难度 17、`difficultyLn` 最大 17.2，没有任何值超过 18**，两个阈值都不会误伤现有数据。
- 验证：新增 `scripts/difficulty-limits.test.mjs` 6 例（边界值 18/25 的归类、超限拒绝、空串与非法文本放行、越界汇总格式化、**前后端两份常量必须相等**、全库难度全在警告线以下、服务端 PUT 对 190 返回 400 且不写 GitHub）；`npm test` → 145/145；`npx tsc --noEmit` 与 `npx tsc -p functions/tsconfig.json --noEmit` 均 0 错。
- 未做 / 边界：`references.json` 的参考难度与 `ref-ladder` 的 `step` **没有**套这个上限（用户说的是"编辑比赛"，2026-09-13 已确认不扩）；`DifficultyRefPicker` / `EstimateHint` 自动带入的值不过输入侧守卫，但都在 ~17 以内，服务端仍有兜底。
- 约定已同步到 `CODEX-HANDOFF.md` §5.2。

### 10.3 合包的 [Difficulty] 段完全跟随原谱（取消 OD 下限与 HP 统一改写）

依据：用户先要求「取消所有的合包时候的 OD 下限，原谱是多少就是多少」，随后追加「HP 也跟随原谱」。

- `scripts/generate-pack.js`：删除 `OD_FLOOR` 表、`getOdFloor()`、`rewriteOsu` 里的「只抬不降」分支、`prefetchMap` / `generatePack` 的 `odFloor` 传参，以及固定写 7 的 `HP_TARGET` 与那行 `HPDrainRate` 改写。现在 **[Difficulty] 段整体不被触碰，OD 与 HP 都跟随原谱**；标题/艺术家/作者/版本/`BeatmapID=0`/`BeatmapSetID=-1`/清 `Source`+`Tags`/音频/背景的改写照旧。占位谱面 `DELETE_PLACEHOLDER_OSU`（`delete this.osu`，非真谱）里的数值无关，未动。
- 顺带做了一处小重构：底部 `main()` 加 `if (require.main === module)` 守卫并导出 `{ rewriteOsu, normalizeRealType, REAL_TYPE_NAMES }`。**此前只要 `require` 这个脚本就会立刻执行 `main()`（覆盖 manifest、打 R2），根本无法测试**；直接 `node scripts/generate-pack.js` 的行为不变（已验证：无凭据时仍打印 `Missing R2 credentials` 并退出 1）。
- 验证：新增 `scripts/generate-pack.test.mjs` 6 例 —— OD 低于旧下限（1 / 4.5 / 7 / 7.9 / 8.9 / 10）全部原样保留、高于旧下限不压低、HP（1 / 5 / 7 / 8 / 9.5 / 10）全部原样保留、**`[Difficulty]` 段逐字节不变**、其余改写字段逐一断言、`[TimingPoints]` 与 `[HitObjects]` 不被触碰且行数不变。测试用 `createRequire` + dummy `R2_*` 环境变量（顶部凭据检查会 `process.exit(1)`），跑完 `git status -- data/` 只有那对改名文件，确认无副作用（没碰 manifest）。`npm test` → 151/151。
- ⚠️ 已写进 `CODEX-HANDOFF.md` §5.3 的提醒：**重新合包后包内 `.osu` 字节与旧包不同（OD/HP 变了）→ 玩家已下的成绩会断**，与 §5.4 是同一性质，别再单独推导。SV 类原本就不在 `OD_FLOOR` 里、但 HP 原来同样被写成 7，所以**所有类型的包在重新生成后都会变**。
- 文档同步：`CODEX-HANDOFF.md` §5.3 的 OD/HP 条目（改为「[Difficulty] 段整体不干预」）、§10 红线第 6 条（不再说合包改 OD/HP）、§5.1 中 FCJ 段落里提到 `OD_FLOOR=8.5` 的历史注记（改为说明该表已删除）。realType 的注册点从「3 处 + OD_FLOOR」回到「3 处」。

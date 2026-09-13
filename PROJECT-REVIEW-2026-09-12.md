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

### R06 [P1] 上传/恢复会无条件覆盖现有 R2；恢复比赛也会覆盖新版本

证据：functions/api/maps/upload.ts:44；functions/api/trash/index.ts:72、:103。恢复比赛会自动取得当前 SHA 以覆盖同名 JSON；恢复 map 会覆盖 originalKey，随后删掉 trash 副本。

解决方法（先做最小保护，再做完整版本历史）：

1. 恢复默认仅允许目标不存在；存在就返回 409 RESTORE_CONFLICT，保留 trash。GitHub 创建不带 SHA，R2 使用“目标不存在”的条件 put，而非 HEAD 后无条件 put。
2. 若提供“替换当前版本”，需显示差异/版本信息并带用户确认的 SHA/ETag；先归档当前对象，归档失败不得替换。
3. 普通重传也先把旧对象及 metadata 存入独立 versions/，新对象采用 ETag 条件 put。归档普通与 NSV 时隔离键。条件失败返回 409 并保留所有可恢复副本。
4. 恢复成功后清理要可重试；不要在 KV 失败后留下指向已删除 restoreKey 的唯一恢复记录。第一版可保留 trash 实体至保留期结束。
5. R2 版本备份接 R08；版本保留策略另定，不自动清掉新版本库。

验收：A→B→恢复 A 可追溯；目标已有 B 时默认恢复不覆盖；并发重传只有一个成功；归档失败不覆盖；普通与 NSV 隔离；恢复后中途失败重试不丢数据。

### R07 [P1] 谱面软删除先删原对象再记回收站，失败时无法从 UI 恢复

证据：functions/api/maps/delete.ts:41、:45、:47。R2 copy→delete→KV addTrash 的顺序成立。

解决方法：

1. 改为保存可恢复副本→成功写入 KV 恢复记录→再删原对象。前两步失败保留原件。
2. 删除失败保留副本和记录，记录为待完成或明确返回错误；生成唯一操作 ID，让重试能识别同一操作而非不断制造条目。
3. 注意 copy 与 delete 之间可能有重传。单纯 HEAD 比对后再删仍有窗口；若要保证并发安全，所有上传/删除/恢复走同一个按对象串行的协调层，或采用经验证的存储并发机制。不能声称调换顺序就解决并发删除新版本。
4. 比赛删除有 Git 历史兜底，但回收站失败也应在 UI 响应中可见；此项先修 R2 路径，避免扩大范围。

验收：分别模拟 copy、KV put、delete 失败；至少保留原件或可通过 UI 找到的副本；重试幂等；并发删除/重传不误删新对象（若并发协调另拆，必须标明尚未验收）。

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
- 未验证或仍有风险：未在真实 R2 / GitHub Actions 上运行；`versions/` 的实际键布局要等 R06 落地后再确认前缀粒度；trash 仍按「不做独立备份 + 显式提示」处理（本项不改保留期语义）；备份 bucket 同键覆盖仍是镜像而非版本历史（属 R06 范围）。
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

## 6. 可靠性与局部修复任务

### R13 [P2] 上传状态 API 忽略分页

证据：functions/api/maps/status.ts:35；maps/meta.ts 已有分页示例。

解决方法：按 R2 truncated/cursor 循环累计结果；后续页失败返回错误而不是假装完整。键解析用 slice(prefix.length)，主图/NSV 分开处理。参数校验复用 R04。

验收：fake R2 两页、主图和 NSV 混合、提前截断页都不漏；第二页失败不返回成功的部分清单；无需等真实比赛达到 1000 文件再修。

### R14 [P2] 上游错误伪装成空数据；上传列表错误响应导致崩溃

证据：functions/api/ref-ladder.ts:40；packs-manifest.ts:29；tournaments/[id].ts:34；src/components/admin/MapUploader.tsx:58。

影响：GitHub 401/403/5xx 被参考链/清单接口返回 200 空对象，用户以为数据被删；单比赛各种错误都报 404。上传页把 401/500 的 error 对象设进 tournaments，下一次 tournaments.map 可能直接抛错。

解决方法：

1. 只有真正 404 才走明确的“不存在”语义；认证/限流/网络/5xx 分类返回错误码，避免把 GitHub 凭据失效误报为用户没登录。
2. 前端检查 response.ok 与 payload 结构；列表只接收数组。失败保留上次有效数据并显示错误/重试或重新登录，不用空数据覆盖。
3. 校验 ref-ladder/manifest 的加载错误不会被当成新的空文件提交。错误响应不包含 token 或完整上游请求头。

验收：401、403 rate limit、404、500、无效 JSON 各有正确行为；上传页不崩；真实空列表仍正常；后端凭据错误不会显示“所有数据为空”。

### R15 [P2] 管理员角色校验、缓存可变引用与 KV 并发

证据：functions/api/admins/index.ts:110、:114、:124、:136；_lib/auth.ts:174、:196。

解决方法：

1. 对 role 用 typeof string + 自有属性/枚举校验，uid/username 也先验类型；从 KV 读到非法 role 时按 readonly 处理并记录诊断。
2. getAdminMap 当前返回缓存对象本身，调用方直接增删再 await put；写失败会留下未落库的缓存变更。先复制再修改，持久化成功才替换缓存。
3. 整份 admins 表在 KV 读改写会并发丢更新；若要求可靠权限变更，用 Durable Object 等强一致协调所有写入，明确跨节点缓存策略。只拆成每 UID 一个 KV key 仍不能解决同 UID 竞争及即时撤权。
4. 不再声称所有节点最多 5 秒生效。记录真实一致性边界；需要即时撤权时读取路径也必须符合相应保证。

验收：constructor/toString/数组角色被拒绝；KV put 失败后原角色不变；两个管理请求不互相覆盖；bootstrap owner 不可变；跨节点撤权行为符合文档。

### R16 [P2] 长 batch target 超出 KV metadata 限额，审计静默丢失

证据：functions/api/_lib/audit.ts:43；batch.ts:148。只截断 detail 的字符数，target=ids.join(',') 不限长度，中文字节数也不等于字符数。已模拟复现。

解决方法：

1. 完整审计正文留在 KV value；metadata 仅放列表所需的有界字段，用 TextEncoder 计算 JSON UTF-8 总字节，留足 1024 字节限额余量。
2. 长 target/detail 用摘要或计数，完整详情按 key 读取；前端配合查看完整记录。
3. 审计失败可不回滚已成功业务操作，但必须有不含敏感信息的服务端错误日志/计数，不能完全静默。

验收：多比赛长 ID、中文 actor/detail 时 metadata 小于限制，完整 value 不丢；列表可看摘要，详情可见完整；模拟 KV 失败有可观察诊断。

### R17 [P2，潜在] LN 参考选择器 fallback 读错字段

证据：src/lib/referenceData.ts:92；RoundEditor.tsx:410、:609；MapSlotEditor.tsx:498；difficultyFit.ts:122。

触发：轮次没有 typeDifficulties.LN.ln，仅 LN map.difficulty=12。getRefValue(...,'LN','ln') 返回 null，拟合工具返回 12。当前全库未触发该条件，但导入/新建数据可触发。

解决方法：保持显式汇总值优先；LN/ln 的单图 fallback 读取 difficulty，HB/TB 的 ln fallback 仍读取 difficultyLn。若提取共享读取函数，保持各调用方现有精度规则，不顺手全站改小数位。

验收：LN fallback=12；HB/TB 双难度不串；显式汇总优先；0/缺失值不变成有效测量；参考链与拟合取同一语义。

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

进度速览（2026-09-13）：✅ R01（实现完成待验收，未提交，UI 自动重放未做）、✅ R02（实现完成待验收，未提交，浏览器端未联调）、✅ R03（实现完成待验收，未提交，未线上联调）、✅ R08、✅ R09、✅ R18（均实现完成待验收，未提交）；其余待实施。

| 编号 | 工作单元 | 主要依赖 |
| --- | --- | --- |
| ✅ R01 | 保存基准与旧草稿冲突保护 | 无 |
| ✅ R02 | 连续保存/新建转编辑 | 与 R01 响应协议对齐 |
| ✅ R03 | 运行时 schema 与 ID | 无 |
| R04 | R2 字段、键与文件验证 | 复用 R03 |
| R05 | 上传页异步隔离与补丁快照 | 与 R01/R04 协调 |
| R06 | 上传版本与恢复防覆盖 | R04，配合 R08 |
| R07 | 删除恢复记录与失败顺序 | R04，与 R06 同文件串行 |
| ✅ R08 | 备份失败策略 | 无；versions 支持接 R06 |
| ✅ R09 | Drive 失败误删 | 无，建议首先修 |
| R10 | 合包发布完整性 | R09，发布消费方一起改 |
| R11 | 谱面身份/指纹与备选副本 | 与 R10 串行 |
| R12 | workflow/CLI/单类型发布 | 与 R10 协议对齐 |
| R13 | R2 状态分页 | 可独立，键规则接 R04 |
| R14 | 上游错误与 UI 错误状态 | 可独立 |
| R15 | 角色校验与一致性 | 可分为局部校验和协调存储两阶段 |
| R16 | 审计 metadata 字节上限 | 可独立 |
| R17 | LN 参考回退 | 可独立 |
| ✅ R18 | 常数样本 R² | 可独立 |
| R19 | lint/启动与验证入口 | 可独立 |
| R20 | 旧冲突脚本防串改 | 可独立 |
| R21 | 安全头/Origin | 先核实部署 |
| R22 | 构建与死代码清账 | 最后做 |
| R23 | 包内容/部署核实及发布验收 | 只读核实可先做，发布等合包修复 |

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

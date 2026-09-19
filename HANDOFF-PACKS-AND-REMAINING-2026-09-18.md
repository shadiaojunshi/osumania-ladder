# 交接：合包发布链 + 剩余任务（2026-09-18）

写给下一位接手的人/AI。这份文档**独立可读**，不依赖对话上下文。读完它应该能直接继续干活。

## 0. 先读这三份，别跳过

| 文件 | 作用 |
| --- | --- |
| `PROJECT-REVIEW-2026-09-12.md` | 主任务清单（R01–R33）。§8 表是状态总览；每一项的「完成记录」在它自己的章节末尾，记录了改了什么、跑了哪些检查、哪些没做 |
| `.workbuddy/memory/MEMORY.md` | 项目长期契约与陷阱。**改代码前先读它**（约 19.8KB，已压缩过，别让它涨回 20KB 以上） |
| `.workbuddy/memory/2026-09-18.md` | 今天的详细工作日志 |
| `docs/security-review-and-recovery-2026-09-18.md` | **另一条线**写的安全审查 + 删除恢复手册 + 额度分析。它有一节「合包交接给另一 AI」是写给合包链的，本文件的第 3 节就是照它整改的结果 |

## 1. 工作区现状（**已全部提交并推送，本节仅存档**）

> **2026-09-19 更新**：本文件 §1/§3.B 原先写的"工作区已清空、改动都未提交"**两处都已过期**，现已按实际状态改写。真实情况分两批：
>
> 1. **第一批（已推送）**：R01–R18、R24–R33 与合包发布链。落地提交 `2ca51d9`（占位 ID 判读 + 管理员角色 + 上游错误分类 + 删除前备份 + 请求体实流计数）、`67ebdcf`（合包发布链，含下面"这条线"全部文件）、`cd8d96e`（MKTC 36 条占位 setId 清理）、`419c4b4`（检测报告刷新）。
> 2. **第二批（R19/R20/R21/R22，已随本批提交入库）**：`eslint.config.mjs`、`public/_headers`、`scripts/serve-static.mjs`、`scripts/{backfill-bid,detect-type-conflicts}.mjs` 及其测试、`scripts/security-headers.test.mjs`、`.gitignore` 的 tsbuildinfo 与 `/*-report.json` 规则、`roundLabelLayout.ts` 死代码清理、`RECOVERY-RUNBOOK.md`、`VERIFY-AFTER-DEPLOY-2026-09-18.md`、`BATCH-METADATA-BACKFILL.md` 等。
>
> 本节下面两张清单保留原始用途 —— 说明"哪几个文件属于哪条线"，**不要拿它当"当前未提交改动"的清单**（那份盘点的正确位置是 `git status`）。
>
> 历史提醒仍然有效：**禁用 `git stash`**（历史上 stash 毁过 .git）。

**这条线（合包发布链）改的：**

```
 M scripts/generate-pack.js              发布门控 / 身份判定 / 内容寻址上传 / CLI
 M scripts/upload-to-gdrive.js           Drive 版本化上传 + 孤儿默认只报告 + pendingMirrors 清账
 M scripts/upload-to-gdrive.test.mjs     14 例
 M .github/workflows/generate-packs.yml  env+数组传参 / concurrency / push 重试 / artifact
 M .github/workflows/upload-packs-to-drive.yml   concurrency + push 重试
 M PROJECT-REVIEW-2026-09-12.md          R10/R11/R12 的完成记录 + §8 状态
?? scripts/pack-publish.js               发布决策（纯函数）+ CLI 解析
?? scripts/pack-publish.test.mjs         42 例
?? scripts/mapIdentity.js                谱面身份判定（纯函数）
?? scripts/map-identity.test.mjs         21 例
?? scripts/gc-pack-objects.mjs           独立的孤儿清理命令（带保留期）
```

**另一条线改的（不要碰、不要回退）：**

```
 M functions/api/_lib/validation.ts             请求体大小限制
 M functions/api/tournaments/[id].ts            删除改为"备份成功才删"
 M functions/api/tournaments/batch.ts
 M src/app/globals.css                          天梯超界熔岩牌与范围框合并
 M src/components/ladder/LadderView.tsx
 M src/components/ladder/RoundDetailModal.tsx
 M scripts/validation.test.mjs
?? scripts/json-body-limit.test.mjs
?? scripts/tournament-delete-safety.test.mjs
?? docs/anonymous-feedback-and-abuse-plan.md   匿名反馈与额度保护方案（已定稿未实施）
?? docs/security-review-and-recovery-2026-09-18.md
```

**这条线还改了几个 UI 小地方**（同一工作区，可与上面共存）：

```
 M src/stores/viewStore.ts                columnWidth 160→140、roundBorderAlways true→false
 M src/components/controls/ControlBar.tsx zoom 百分比补 dark 色、轮次下拉改用 control.round.all
 M src/lib/messages.zh.ts / messages.en.ts  新增 control.round.all
 M src/components/admin/AuditLog.tsx      加载中灰字补 dark 色
 M src/components/admin/DifficultyFitTool.tsx  表头箭头补 dark 色
```

## 2. 这条线做完的（R10 / R11 / R12）

三块都写在 `PROJECT-REVIEW-2026-09-12.md` 的对应章节里，这里只给结论：

- **R10 合包发布完整性**：任一包失败 → **整次不发布**（不写 manifest、不写 `.previous`、不清理、`exit 1`）；「JSON 里没槽位」（`skipped`）与「有槽位但读不到文件」（`no-available-files`）严格分开，后者算失败；对象键内容寻址；链接改合并 + `pendingMirrors`。
- **R11 谱面身份**：去重不再只看 `Artist|Title|Creator|Version` —— 元数据只当**候选键**，等价性由**内容摘要**（`Mode` + `[Difficulty]`/`[TimingPoints]`/`[HitObjects]`）决定；同 BID 也核对内容；备选路径按内容等价兜底；来源标签不再丢；计数与 `mapCount` 同口径。
- **R12 workflow/CLI/单类型**：输入经 env + 数组传参（消除 shell 注入）；CLI 白名单校验；`--type` 默认**离线预览**、`--publish` 才发布；两个发布 workflow 共用 `concurrency` 组；push 失败 rebase 重试 ≤3 次、冲突保留本地结果、**禁 force push**。
- **审查后加固**（另一条线的 7 条意见里成立的 5 条）：裸 `--offline` 与空 `--type=` 会静默全量发布 → 改成硬错误；孤儿清理从生成流程**摘出去**（重跑 hash 变了会误删线上正在引用的对象）；Drive 孤儿也默认只报告；`pendingMirrors` 只增不减；packs 桶 LIST 补分页。
- **Drive 也版本化**：Drive 文件名 = 与 R2 相同的内容键 → **同名即同内容**，已存在就跳过上传（重跑省整轮流量），内容变了才新建，旧文件只进孤儿报告。

**当前验证状态（2026-09-19 复测）**：`npm test` **536/536**；前后端 `tsc` 0 错；`npm run build` 成功；`npm run lint` 25 条存量错误（基线见 `PROJECT-REVIEW` R19）。**但从未在真实 R2 / GitHub Actions 上跑过全量** —— 所有发布路径的结论都来自纯函数单测、源码结构断言和故障注入式的单元测试。

## 3. 还没做的

### A. 结构性（优先）

1. **R15 管理员名单的并发丢更新**。`functions/api/_lib/auth.ts` 的 `getAdminMap`/`putAdminMap` 是「读整份 KV → 改 → 写整份」，两个管理请求并发会互相覆盖；`sanitizeAdminMap` 只解决了脏数据，没解决丢更新。需要强一致协调器或单写队列（Durable Object）。拆成每 UID 一个 key **解决不了**（读整份是必须的）。详见 §8 表的 ⚠️ R15 与 `docs/security-review-and-recovery-2026-09-18.md` 的 P1 表。
2. **发布链的端到端故障注入测试**。现在只有纯函数单测 + 源码结构断言。缺的是：接上假 R2 / 假 Drive / 假 GitHub，注入「第 N 包上传失败」「Drive 中途失败」「push 冲突」，然后断言**旧清单里每个 URL 仍指向原来的 bytes**。这条是另一条线明确点出的验收项。
3. **真实 R2 上的全量实跑**。内容摘要的粒度、大小预筛命中率、Drive 的跳过率、身份报告的实际内容，都只在 204 张缓存样本上验证过。跑之前建议先单类型离线预览（`--type=SS`，不上传、不动清单）。

### B. R19–R22、R34 已实施；**只剩 R23 的发布验收**（见 `PROJECT-REVIEW-2026-09-12.md` 对应章节与 §8 表）

> **2026-09-19 重写**：R19 / R20 / R21 / R22 **四项已全部实施并随本批提交入库**，本节原先"改动在工作区、未提交"与"下面两条（R21、R23）仍未实施"的说法都已过期。要点：
>
> - **R19**：`eslint.config.mjs`（ESLint 9 flat config，core-web-vitals 预设，**无禁规则**）+ `package.json` scripts（`lint`=`eslint .`、`start`=静态预览、`dev:api`、`typecheck`、`typecheck:functions`、`verify`）+ `scripts/serve-static.mjs`（零依赖伺服 `out/`，附单测）。**`npm run lint` 仍会因 25 条存量错误退出 1** —— 全部来自 `eslint-plugin-react-hooks` v7 的新规则（`set-state-in-effect` / `refs` / `immutability`），集中在「挂载即 setState / 取数时立刻置 loading / 用 ref 存基准」这类写法，逐条修等于重构后台取数层。基线清单与理由见 R19 完成记录（站长已确认保持 error、不降级）。
> - **R20**：`detect-type-conflicts` 重写成与后台体检同源的 CLI（默认只读、写回必须显式指定组与目标、保留 CRLF、定位不唯一即整组拒绝）；`backfill-bid` 的 ID 判读统一到 `src/lib/beatmapIds.ts` 并转 ESM。两者删旧 `.js`、新增 20 + 12 例测试。
> - **R21**：`public/_headers` + 中间件的写请求 Origin 闸门 + API 响应统一 `private, no-store`。**代码完成，但部署侧仍未验证** —— 验收步骤见 `VERIFY-AFTER-DEPLOY-2026-09-18.md` §3。
> - **R22**：`tsconfig.tsbuildinfo` 停止跟踪 + `.gitignore` 规则；`roundLabelLayout.ts` 的标签防碰撞死算法与其 9 例测试删除（保留 `RoundLayout` 类型）。
>
> **唯一整块未实施的是 R23 的发布验收**（只读核实已完成），见其完成记录。

### C. 我从审查里认领但没做完的

- **下载页还没消费 `pendingMirrors`**：清单顶层已经在如实记录「哪些包的镜像仍是旧内容」，但 `/download` 页面没有读它。要么显示「镜像未同步」，要么在未同步时先不显示 Drive 链接。
- **`upload-packs-to-drive.yml` 还没加 `upload-artifact`**（只给 `generate-packs.yml` 加了）。
- **Drive 的旧版本文件清理**：现在只报告不删。5TB 下可以长期留着当回滚点，要清的话照 `gc-pack-objects.mjs` 的思路再写一个 Drive 版（读已提交清单 + 保留期）。

## 4. 改合包链之前必须知道的契约（最容易踩的）

1. **`prefetchMap` 返回 `{ ok, reason, error }`，不是 `null`**。上游任何一处退回「返回 null / 静默 continue」，就等于让一张读不出来的图静默少一张，而包照样上传 —— 这正是 R10 要修的东西。
2. **发布门控不能绕**：`summarizeRun` 判定失败后必须 `exit 1` 且**不写任何文件**。写 manifest 之前不许删任何对象。
3. **「两个缺」必须分开**：JSON 里没这个类型的槽位 = `skipped`（保留旧包与旧条目，**不算失败**）；有槽位但 R2 里没有可读文件 = `no-available-files`（**失败**）。混为一谈就会把线上整类包当孤儿清掉。
4. **对象键是内容寻址的**：`{realType}_{part}.{sha256 前 8}.osz`。不要退回固定键 —— 那会让「传到一半失败」变成半新半旧。R2 与 Drive **用同一个名字**。
5. **Drive 的例外**：清单条目**没有 `objectKey`** 的历史数据仍按名字覆盖上传。改成新建会在 Drive 里产生同名副本，而线上旧清单的链接还指着老 id。
6. **孤儿清理必须独立**：真删只在 `node scripts/gc-pack-objects.mjs --clean-orphans`，它读**已提交**的清单 + 保留期（默认 24h）。`generate-pack.js` 里传 `--clean-orphans` 会**直接报错**。
7. **CLI 的硬错误**：`--type=` 空值/空白、裸 `--offline`、重复指定不同类型、未知选项 —— 全部 `exit 2`。加新参数时记得同步 `parsePackCli` 与 `describeCliError`，并补测试。
8. **`buildManifestPacks` 的两种模式**：全量发布用默认（未涉及的类型会消失，这是设计意图）；**单类型发布必须开 `preserveOtherTypes`**，否则重建出来的清单只剩一个类型，等于把别的包全变成孤儿。
9. **`pendingMirrors` 只增不减**：由 `upload-to-gdrive.js` 在同步成功后清账。别写成每轮从空 Set 重建。
10. **测试桩必须返回真实 `Response`**：`classifyGithubFailure` 会 `res.clone()` 读响应体，假对象会抛 `TypeError` 被 handler 兜成 500 —— 会让本该失败的用例「通过」。

## 5. 怎么验收（照抄即可）

```bash
npm run verify                                  # 前端 TS → 后端 TS → lint → 测试（一条龙；lint 现在会失败，见下）
npm test                                        # 期望 536/536
npm run lint                                    # 目前 25 条存量错误 → 退出 1（基线见 PROJECT-REVIEW R19）
npx tsc --noEmit                                # 期望 0 错
npx tsc -p functions/tsconfig.json --noEmit     # 期望 0 错
npm run build                                   # 期望成功
```

CLI 与 GC 的退出码（实测值）：

```bash
node scripts/generate-pack.js --offline        # 2（必须配 --type）
node scripts/generate-pack.js --type=          # 2（空类型）
node scripts/generate-pack.js --clean-orphans  # 2（已移出，指向 gc 命令）
node scripts/generate-pack.js --type=SS        # 1（合法但缺 R2 凭据）
node scripts/generate-pack.js --help           # 0
node scripts/gc-pack-objects.mjs --bogus       # 2
node scripts/gc-pack-objects.mjs               # 1（缺凭据，真跑要 R2_* 环境变量）
```

`npm run build` 偶尔会被「批量删除守卫」拦下（Next 清 `.next/` 时）——**重跑一次即可**，不要用 `CODEBUDDY_SAFE_DELETE_ENABLED=0` 绕过。

写新代码时建议顺手做**变异测试**（把关键判定改坏，看测试是否真的挂）。本轮靠它发现：`--type=` 有两处检查，只拆一处测试仍通过。

## 6. 硬性约定

- **一次只改一两个**；完成记录按 `PROJECT-REVIEW-2026-09-12.md` 的模板追加在对应任务末尾，并在 §8 表加 ✅（未全达成的标 ⚠️）。
- **不要动** `ManiaMapAnalyser.by.Leo_Black/`、`osu-toolbox/`；**不要改比赛 JSON**。
- **未授权不要 push**；改动留给站长/VSCode 提交。
- 最终报告只写「改了什么 / 跑了哪些检查 / 未完成验收」，不要写过程流水账。
- **禁用 `git stash`**。

## 7. 环境陷阱（这轮真实踩到的）

1. **同一条命令被执行两次**：`grep -c xxx && python 改文件` 这种链，第一次已经改成功、第二次 `grep` 返回 0 短路 —— 你看到的输出是第二次的，会误判成「没跑」。**对策：改文件的命令单独跑，改完再单独验证状态。**
2. **`python -c "..."` 里不要写反引号**：外层双引号会让 bash 先做命令替换 —— 本轮把 `` `docs/xxx.md` `` 当命令执行了，写进文件的名字变成空。**改文件一律先 Write 成 `.workbuddy/tmp/*.py` 再执行。**
3. **heredoc 里含反引号 / `$` / 大量中文引号的长脚本**会被 bash 判成引号未闭合（`unexpected EOF`）——同上，先写脚本文件。
4. **Edit 的锚点要唯一**：本轮锚点撞了三次（`listPackBucketObjects()` 撞函数定义、`gc-pack-objects.mjs` 撞注释、`已取消发布` 撞单类型分支）。用**带上下文的长锚点**，或加 `await` / 前缀限定。
5. **改文件的脚本要幂等**：`if '新内容' in s: skip`。但注意别写成「`if 'XXX' not in s` 才插入」—— 如果调用处已经存在这个名字，就会**跳过插入定义**，留下 ReferenceError（本轮就是这么踩的，靠写完 grep 一次发现）。
6. **幂等键要限定在目标段落内检查**：`**完成记录（2026-09-18）**` 这种串在其他任务章节里也存在，全文 count 会让新记录被 skip 掉。用 `s[a:b].count(...)`。
7. **`.workbuddy/memory/MEMORY.md` 注入上限约 20KB**：超过会被截断。加新条目时同步精简（细节留给评审文档与当日日志）。

# 项目交接文档（给接手 AI / Codex）

> 本文件写给**没有本会话记忆的接手 AI**（如 Codex）。目标是让你能独立接手本仓库，知道"这是什么、数据在哪、怎么改、怎么发布、有哪些坑"。
> 最后核对：2026-08-20（本轮功能改动已完成验证；提交状态以 `git log` 为准）

---

## 1. 项目是什么

一个 **osu!mania 4K 比赛谱面收录 + 难度天梯 + 合包下载**的网站。

- **公开站**（首页天梯、下载页）：展示历年 osu!mania 4K 比赛（MWC/MCNC/LN 杯等 33 个）的图池，把每张谱面按难度标注在"天梯"上，支持按比赛 / 轮次 / 键型三种视图浏览。纯静态站，零后端 API 调用。
- **合包下载**：按"真实键型"（realType，如 Stream/Jack/Release/SV…共 38 种）把散落在各比赛的谱面聚合打包成 `.osz`（按张数阈值分包后均分，见 §5.3），上传到 Cloudflare R2 + Google Drive，下载页提供直链。
- **管理后台**（`/admin`）：站长录入 / 编辑比赛、批量导入图池、自动下载并上传谱面、维护难度标尺、填下载链接、体检 realType 冲突、管理回收站 / 成员 / 审计日志。需 osu! OAuth 登录 + 四级权限。

一句话工作流：**录入比赛 → 上传谱面到 R2 → GitHub Actions 跑合包 → 包上传 R2/Drive → manifest 写回 → 下载页直链生效 → git push 自动部署站点。**

数据规模（2026-08-20）：33 个比赛 JSON、2973 个谱面槽位、38 种 realType、55 个合包。

---

## 2. 技术栈与架构

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | Next.js 16（`output: 'export'` 纯静态）、React 19、zustand、Tailwind 4 | `src/app/*` 三个页面：`/`（天梯）、`/download`、`/admin` |
| 后端 | Cloudflare Pages Functions（`functions/api/*`） | 全部是管理 API（公开站不调用任何 API）。统一鉴权中间件 + 四级角色 + 审计 + 软删除 |
| 存储 | Cloudflare R2（谱面桶 + 合包桶）、KV（session/回收站元数据/审计）、GitHub repo（比赛 JSON，有 commit 历史可回滚） | 见下 |
| 代理 | Deno Deploy `osu-proxy/main.ts` | osu OAuth + v1 元数据查询的中转，绕开"osu 边缘对 Cloudflare Workers IP 池限流 429" |
| CI | GitHub Actions 三个 workflow | 合包、Drive 上传、每日 R2 备份 |
| 部署 | git push 到 `main` → Cloudflare Pages 自动部署（2-4 分钟）；Deno 代理同步自动部署 | **main 直推是项目惯例** |

### 存储职责（重要）

- **比赛数据**：`data/tournaments/*.json`，存 GitHub（可 revert）。**数据源是 GitHub，不是 DB。**
- **谱面 .osz 原始文件**：R2 主桶 `osumania-ladder-maps`，路径 `maps/{tournamentId}/{roundId}/{slot}.osz`（NSV 变体 `.nsv.osz`）。无版本历史，**真正需要备份**。
- **合包包**：R2 公开桶 `osumania-ladder-packs`（r2.dev 域名，直链下载），同时镜像到 Google Drive。
- **后台状态**：KV `osumania-ladder-kv`（绑定名 `LADDER_KV`）：session cookie、回收站（30 天 TTL）、审计日志（180 天 TTL）。

### 登录链路

浏览器 → osu 授权页 → 回调 CF `/api/auth/callback` → **Deno 代理**转发 `/token` + `/me`（绕 429）→ 签发 HMAC HttpOnly session cookie（7 天）。角色：`owner` > `admin` > `contributor`（可增改不可删）> `readonly`（登录但无权限，只看）。

---

## 3. 目录地图

```
d:/osumania ladder/              ← 注意路径带空格，bash 里用引号
├── data/
│   ├── tournaments/             ← 33 个比赛 JSON（数据源，GitHub 存储）
│   ├── packs-manifest.json      ← 55 个合包的清单（下载页数据源）
│   ├── ref-ladder.json          ← 难度标尺链（跨比赛手动排的易→难轮次序列）
│   ├── references.json          ← 30 个难度参考点（标尺上标数字的锚）
│   └── scales/                  ← reform-dan.json / ln-dan.json（段位→颜色映射，天梯配色）
├── src/
│   ├── app/                     ← page.tsx（天梯）、download/page.tsx、admin/page.tsx
│   ├── components/
│   │   ├── admin/               ← TournamentForm / RoundEditor / MapSlotEditor / MapUploader /
│   │   │                           BulkImporter / ReferencesEditor / RefLadderEditor /
│   │   │                           DifficultyRefPicker / PackLinksEditor / RealTypeConflictChecker /
│   │   │                           AdminsManager / TrashManager / AuditLog / JsonPreview /
│   │   │                           RealTypeMapBrowser（键型谱面浏览器）
│   │   ├── chart/               ← 谱面可视化（复刻雨沐 !v）：ManiaChartButton / ManiaChartModal /
│   │   │                           ManiaChartSvg
│   │   └── ladder/              ← LadderView / HoverCard / RoundDetailModal
│   ├── lib/                     ← types.ts / i18n.ts / referenceData.ts / difficulty.ts / poolTemplates.ts /
│   │                               maniaChart.ts（.osu 解析 + 分页几何）/ osuTextClient.ts（取谱面文本 + 缓存）
│   ├── hooks/useMapHistory.ts   ← 谱面历史（同 beatmapId 在哪些比赛出现过，用于冲突提示）
│   ├── generated/tournaments.ts ← build 时由 generate-tournaments.js 生成（.gitignore 排除）
│   └── stores/                  ← prefsStore（语言/主题）/ viewStore（天梯视图状态）
├── functions/api/               ← Cloudflare Pages Functions（后端，独立 tsconfig）
│   ├── _middleware.ts / _lib/{auth,audit,cors,osu,trash}.ts
│   ├── auth/{login,callback,logout,me}.ts
│   ├── tournaments/index.ts + [id].ts + batch.ts
│   ├── references.ts / ref-ladder.ts / packs-manifest.ts
│   ├── maps/{upload,delete,status}.ts / osu/{beatmap,download}.ts
│   ├── admins/ / audit/ / trash/ index.ts
├── scripts/                     ← 合包 / 上传 / 备份 / 数据修复脚本（见 §8）
├── osu-proxy/main.ts            ← Deno Deploy 代理
├── .github/workflows/           ← generate-packs.yml / upload-packs-to-drive.yml / backup-r2.yml
└── SECURITY-DEPLOY-STATUS.md    ← 安全改造部署状态（较旧，2026-06，仍含登录链路等有用细节）
```

---

## 4. 数据模型（`src/lib/types.ts` + 实际 JSON）

### Tournament

```jsonc
{
  "id": "osumania-4k-world-cup-2025",   // 文件名 = id + ".json"
  "name": "osu!mania 4K World Cup 2025",
  "abbreviation": "MWC 2025",
  "keyCount": 4,
  "year": 2025,
  "priority": 5,                        // 1-5，合包排序：priority 降序 → 年份升序 → 缩写升序 → id 升序（2026-09-19 定稿）
  "forumUrl": "…", "wikiUrl": "…", "sheetUrl": "…",
  "rounds": [ /* Round[] */ ],
  "customTypes": []                     // 自定义大键型定义（一般空）
}
```

### Round

```jsonc
{
  "id": "round-1",
  "name": "Qualifiers",
  "abbreviation": "Qual",
  "order": 1,
  "bestOf": 8,
  "isQualifier": true,
  "difficulty": { "min": 0, "max": 0, "average": 0 },       // 全 0 时天梯 fallback 到 typeDifficulties
  "typeDifficulties": { "RC": {"rf": 10.2}, "HB": {"rf": 9.5, "ln": 8.8} },
  "maps": [ /* BeatmapMeta[] */ ]
}
```

### BeatmapMeta

```jsonc
{
  "slot": "RC1",               // 槽位名；TB 单张直接 "TB"，第二张才 TB1/TB2
  "type": "RC",                // 大键型：RC | LN | HB | SV | TB | SPECIAL
  "realType": "SS",            // 真实键型：38 种之一（见 §5）
  "name": "Artist - Title [Difficulty]",
  "difficulty": 10.2,          // rf 难度（RC/SV/LN/HB/TB 都存这）
  "difficultyLn": 8.8,         // 仅 HB/TB/SPECIAL 双难度时有 ln 侧
  "beatmapId": 5212273,        // osu! BID（可缺，缺了用指纹去重）
  "beatmapsetId": 2403275,
  "oszUrl": "…"                // 一般不留
}
```

### packs-manifest.json（`data/packs-manifest.json`）

```jsonc
{
  "packs": [{
    "realType": "SS",               // 键型
    "name": "4K Tournament Stream Pack 1",   // 显示名（下载页）
    "part": 1,                      // 第几包（同键型 >1 包时 1/2/3…）
    "mapCount": 80,                 // 本包含多少槽位（不含 NSV）
    "totalMaps": 124,               // 该键型去重后的唯一槽位数（下载页进度条分母）
    "lastUpdated": "2026-08-13",
    "links": { "r2": "https://pub-xxx.r2.dev/SS_1.osz", "googleDrive": "https://drive.google.com/uc?id=…&export=download" },
    "gdriveFileId": "…",            // Drive 文件 id（决定链接稳定）
    "sizeMB": 361
  }],
  "lastGenerated": "2026-08-13T07:00:43.299Z"
}
```

---

## 5. 核心业务概念（改数据前必读）

### 5.1 realType（真实键型）

38 种，分属 5 大类。**一个 realType 要"完整生效"需在 3 处注册**（新增键型必须三处都改）：

| 注册点 | 作用 |
|---|---|
| `src/components/admin/MapSlotEditor.tsx` 的 `REAL_TYPES` 对象 | admin 录入下拉（按 MapCategory 分组列选项） |
| `scripts/generate-pack.js` 的 `REAL_TYPE_NAMES` | 决定合包标题 `4K Tournament {名字} Pack {n}` |
| `src/app/download/page.tsx` 的 `CATEGORIES` 数组 | 下载页分类分组显示 |

大类映射（`MapCategory`）：RC（SS/JS/SA/CJ/SJ/FCJ/MX/DP/ADP/STC/MTC/JTC/WTC/TC/ORC/SATC）、LN（RE/CO/TE/DE/SW/JW/IN/LNMX/LNTC/LNWL/OLN）、HB（HB1-HB5/RCmainHB/LNmainHB/MXHB/MNTB/OHB）、SV（SV1/SV2/SI/ME/SVMX/**GM**）、TB（TB）、SPECIAL（自定义自由文本）。

**2026-09-12 新加了 FCJ（Finger Control Jack，归 RC 类）**：三处已注册（`MapSlotEditor` 的 RC 下拉排在 SJ 之后、`download/page.tsx` 的 rice 分类、`generate-pack.js` 的 `REAL_TYPE_NAMES`，跟 SJ/CJ 同属叠键族），中英文 `form.typeGuide.placeholder` 已补定义。`poolTemplates.ts` 未加（非常规池位，录入时手动选），当前无含 FCJ 的谱面数据。（当时还在 `OD_FLOOR` 里加了 8.5，该表已于 2026-09-13 整体删除。）

**2026-08-18 新加了 GM（Gimmick，归 SV 类）**：三处已注册，合包名 `Gimmick SV`。注意 poolTemplates.ts 未加 GM（非常规池位，录入时在 SV 下拉手动选），当前无含 GM 的谱面数据，暂无 GM 包。

**2026-08-20 新增 Pending 键型**：`PDRC / PDLN / PDHB / PDSV` 均排在所属大类下拉末尾。主表批量导入无法命中标准图池模板时，不再误选各类第一个键型，而是落入对应 Pending。`PDRC / PDLN / PDHB` 是待分类队列，`generate-pack.js` 明确跳过且下载页不展示；`PDSV` 例外，会正常合包并显示在 SV 下载分类。

### 5.2 难度输入规则

- 每张谱面有 `difficulty`（rf 难度段）。RC/SV 用 **rf**；LN 用 **ln** 段（`difficultyLn`）；HB/TB/SPECIAL **rf+ln 双框**（`needsDualDifficulty` 只对这三类返回 true）。
- `DifficultyRefPicker` 从**全局难度标尺**（`ref-ladder.json`）插值出参考值。标尺是手排的 `{tournamentId, roundId, step?}` 链，易→难，可跨比赛；`step` 默认 1（标准一轮），支持小数（半轮 0.5）。MWC 4K 2025 是基准比赛（`MWC_LADDER_TOURNAMENT_ID`），`mwc±N` 快捷偏移以此锚定。
- `references.json` 是标尺上的显式数字锚点（如 "MWC 2025 GF RC": 13.3）。天梯渲染颜色用 `reform-dan.json` 段位表。
- **TB 不参与轮的难度统计**（`recalcDifficulty` 里 `type === 'TB'` 跳过）；**HB 取 rf/ln 双侧平均**为一个数据点，单侧有取单侧。
- **难度阈值（2026-09-13 用户要求）：上限 25，超过 18 警告。** 手填难度最容易多按一个 0（19 → 190）。
  - `> 25`：**拒绝这次输入**，不截断 —— 截断会把明显的笔误变成"看起来合理"的 25，更危险。
  - `> 18`：只警告、值照存（现有全库最大难度 17 / `difficultyLn` 17.2，所以正常数据不会触发）。
  - 规则唯一实现 `src/lib/difficultyLimits.ts`（纯函数、无 `@data` 依赖，可被 `node --test` 导入）。接入点：`RoundEditor`（轮次汇总 `_typeDiffs` 全部字段 + 单 TB 直连写穿）与 `MapSlotEditor`（单图 `difficulty`/`difficultyLn`）。
  - **两处常量必须同步**：`functions/api/_lib/validation.ts` 的 `LIMITS.maxDifficulty` 是服务端兜底（前后端不能互相 import，所以各存一份）。`scripts/difficulty-limits.test.mjs` 会断言两者相等 —— 改阈值时两边一起改，否则测试红。
  - 不走 UI 的写入路径（手改 JSON、脚本直接调接口、导入的旧 JSON）由服务端那道 400 兜住。

### 5.3 合包规则（`scripts/generate-pack.js`）

- 按 `realType` 聚合所有比赛谱面 → 去重 → 分包。**分包规则（2026-09-17 站长定，`packCountFor()` / `packSizeFor()`）**：≤120 张 1 包、≤200 张 2 包、≤270 张 3 包、≤360 张 4 包，再往上按 90 步进（451→6 包）；份数定了之后**均分**，各包只差 ≤1 张。旧的"固定 80 张切块"（`MAX_MAPS_PER_PACK`）已删除 —— 尾包会小到十几张（DP 只剩 13、CO 25、TB 31）。⚠️ 改分包会改变包内 `.osu` 的 `Title`（=包名）→ 玩家已下成绩会断，与 §5.4 同性质。
- **改写 `.osu` 一律用函数式 replacement**：`String.replace` 的**字符串** replacement 会把值里的 `$'` / `$&` / `$1` 当特殊模式展开（实测 `$'` 把 Title 行之后整份文件注入该行，谱面直接坏掉）。值来自曲名/作者/版本，`sanitizeFileName` 并不清 `$`。
- **NSV 变体缺音频/曲绘时借用同槽主图**：`.nsv.osz`（NSV 变体）常常只带 `.osu`，直接打包会让这个难度在游戏里**没声音**。现在发现音频/曲绘缺失且是 NSV 时，回退去读同槽的 `<slot>.osz` 借同一首歌的音频/曲绘；每个包的日志里会打印体检行 `音频:借用主图 x 张;仍缺 y 张 → <keys>`（"仍缺"的那些要人补传）。
- **去重签名（R11，2026-09-12 起，**别再按旧的"元数据指纹"理解**）**：合并键 = **候选键 + NSV + 内容摘要**。候选键三选一互斥：有 BID → `bid:<id>`；无 BID 用 `.osu` **内部**元数据 → `meta:artist|title|creator|version`（不是 JSON 的 `name`）；都没有 → `solo:<r2Key>`（永不合并）。**等价性只看内容摘要**（`Mode` + `[Difficulty]`/`[TimingPoints]`/`[HitObjects]`；标题/背景/音频名不算差异，**OD/HP 算**）。⚠️ **两条道互不相通** —— 同内容但一个有 BID 一个没有 → **不合并也不报冲突（静默）**；都无 BID 时元数据必须**逐字相同**才合并。反过来：**清 BID 救不回这种情形**，保留正确的 BID 对合并更有利。多源复用同一谱面时合并，来源写进 osu! `Version` 的括号标签 `(MWC 2025 F HB3 & VNMC …)`；顺序 = 比赛排序（`priority` 降序 → `year` **升序**（旧在前）→ 比赛缩写升序 → `id` 升序；2026-09-19 起改过，旧版是 year 降序 + 直接比 id）。
- **身份核对报告** `reports/pack-identity-report.md`：同 BID / 同元数据但内容不同（已阻止合并，各自打包）、文件缺失且身份无法确认，以及**「内容摘要相同、但身份来源不同」**（2026-09-18 加，**只报告、不改包** —— 用于先量化"该合没合"的规模）。摘要取自预取阶段已经在手上的 `.osu`，**零额外下载**；跑 `--type=<类型>` 的离线预览也会写，或直接用 Actions 的 **Identity Report**（只读，用仓库密钥跑）。
- **输出命名**：文件名 `<realType>_<part>.osz`（单包也带 `_1`，破坏性升级 `57904da`，勿回退）；
  上传到 R2/网盘时是**内容寻址**的 `<realType>_<part>.<hash8>.osz`（`objectKeyFor`，见 `pack-publish.js`；
  键里带哈希是 R10 第 3 条：新内容 = 新键 = 旧对象原地不动，manifest 一次性切过去，避免"半新半旧"；
  内容没变则哈希相同、复用同一对象）。**"R2 与 Drive 同名即同内容"是这套设计的前提**，
  网盘侧 `driveName = entry.objectKey`。⚠️ **别为了"好看"去掉哈希或往键里加中文名** ——
  `findOrphanKeys` / `referencedObjectKeys` 靠**逐字比对**清单引用的键，键一改，
  线上 55 个老包的键就不在任何引用里 → **会被全判成孤儿、GC 一跑就删光**。
  另：`REAL_TYPE_NAMES` 里有 4 个名字**含斜杠**（`SS` = `Single/Minijack Stream/Consistency`、
  `WTC`、`HB1`、`HB2`），把它们拼进对象键会变成 R2 的目录分隔符，不要这么用。
  ✅ **2026-09-20 评估过"把下载文件名改成好看的名字"（站长提的 D 方案）→ 决定不做**，
  四条候选与结论留档：A 不改（保持 `PDSV_3.a1b2c3d4.osz`）/ B 去掉哈希（丢"内容变了就重传"的判断）/
  C 全名（等于放弃内容寻址）/ D 全名+哈希前缀（即上面的孤儿误判 + 斜杠问题）/
  F 给 R2 设 `Content-Disposition` 让浏览器存成好看的名字（对象键不动，代价最小，但**网盘那条路管不了**，
  且 CF 公开域名 `pub-xxx.r2.dev` 是否透传该头**未实测**）。**站长："算了，懒得改了" —— 全部搁置。**
  另注：玩家在 osu! 里按 `.osu` 的 `Title`（= `4K Tournament {名字} Pack {n}`）找图，下载页显示的也是这个好看名字；`.osz` 文件名很少被玩家看到 —— 这也是上一条不建议改名的原因之一。osu! 内部 `Title = "4K Tournament {名字} Pack {n}"`、`Artist = "Various Artists"`、`Creator = "Various Mappers, Compiled by the osu!mania Ladder Team"`、`BeatmapID=0`、`BeatmapSetID=-1`、`Source/Tags` 清空。（Creator 原来是全小写 `various mappers,compiled by…`，2026-09-21 改成标题大小写 —— 这个串只被写进 .osu，没有任何脚本读它来识别包；但改它同样会改包内 .osu 字节，属于下面 §5.4 那类"重新合包=成绩断"，和待跑的全量合包是同一次。）
- **下载并发 = `PACK_DOWNLOAD_CONCURRENCY`**（默认 8、上限 32、非法值回退默认；`resolveDownloadConcurrency()`）：
  `scripts/generate-pack.js` 里**不得再出现写死的并发数**（有源码守门测试）。两个 workflow 都设成 `12`。
  这是"不改架构就能提速"的唯一旋钮 —— 瓶颈在每条记录的网络往返，不在脚本本身。
- **[Difficulty] 段整体不做干预 —— OD 与 HP 都跟随原谱，原谱是多少就是多少**（2026-09-13 用户先要求「取消所有的合包 OD 下限」，随后追加「HP 也跟随原谱」；旧的 `OD_FLOOR` 表、`getOdFloor()`、`rewriteOsu` 里的抬 OD 分支，以及固定写 7 的 `HP_TARGET` 已全部删除）。⚠️ 重新合包会让包内 .osu 字节与旧包不同（OD/HP 变了），玩家已下成绩会断 —— 与 §5.4 同一性质，别再单独推导。
- **每包生成完立即上传 R2 公开桶并删本地副本**（磁盘防爆，`d6afbf7`/`8b6fd1c` 的修复）。上传 Body 必须用 **Buffer 而非流**（R2 不支持 chunked 上传）。R2 上传失败时保留本地副本。
- **manifest 全量重建**：全量跑时旧 manifest 转储 `.previous.json` → 用本次输出重建 → `(realType, part)` 匹配找回旧 `links`/`gdriveFileId` → 清理 R2 桶孤儿（本次没产出的 `.osz`）→ Drive 孤儿同步删 → 清 `.previous.json`。

- **切包方案 = `PACK_SPLIT_MODE`**（默认 `tournament`，非法值回退默认）。排序、包数、每包张数都不变，只换成员：
  `sequence` 旧行为（连续切，第 1 包会把最高优先级的比赛整批吞下）、`tournament` **默认**（整场比赛为一张牌，
  发给剩余容量最大的包；超过一个包 1/8 的「大场」先摊成 P 段；装不下就切开、余量给下一个最空的包）、
  `entry` 逐张轮转（混沌版，每场都被切碎）。不变量：容量守恒（不符**直接抛**，绝不静默丢图）、
  NSV 与其主图同包（`buildAtoms`，比对带 `alternatePaths`）、**确定性**（同一份数据每次同样划分）。
  ⚠️ **绝不要引入随机数**：`Pack N` 写进每张图的 `Title`，随机种子 = 每次发布都动玩家成绩身份。
  ⚠️ 换方案 = 换包号 = 换 `Title`/`Version` = **已下载旧包的玩家断成绩**（线上 55 包用的是旧切块 + 旧顺序，
  首次用新链发布本来就会大面积变）。与下面 `compareTournamentsForSources` 同一个坑，要换就一次换定。
### 5.4 osu! 成绩绑定机制（用户已拍板的结论，别再推导）

**osu! 本地成绩绑 .osu 文件 md5 hash，不绑 set ID。** 所以改谱面任何字节（名称/OD/HP/sourcesLabel 括号）→ hash 变 → 玩家已下成绩断。`Version` 里 sourcesLabel 括号 n→n+1 也是一个固有断点。**已知悉、接受、三方案（A 冻结名/B 去掉来源/C 维持现状）用户"先不改"，搁置。**

**⚠️ 两个不同性质的断点，别再混为一谈（2026-09-20 实测澄清）：**

① **换包号会断**（纯副作用）。一张图的 `.osu` 里，**唯一"因为换了包才变"的就是 `Title` 这一行** ——
   `Title:4K Tournament RC Pack 3`（`TitleUnicode` 同值）。`packName` 由 `generate-pack.js` 的
   `4K Tournament {键型全名} Pack {包号}` 拼出，直接写进 `.osu`。所以**重排包 = 换包号 = 换 Title = 断成绩**。
   实测（真实 `rewriteOsu`）：同一输入跑两次 md5 相同；只把 `Pack 3` 改成 `Pack 7` → md5 不同。

② **包内成员变化不会断**。包里换进来/换出去别的图，只是"这张图和谁住一起"变了，
   它自己的 `.osu` 内容一个字节没动 → **hash 不变 → 成绩保住**。
   （不要按"里面东西变了所以成绩也没了"理解 —— 那是反的。）

真正会断的是这两类**身份变化**，与包号无关：这张图**被新的比赛收录**（`Version` 前缀的 sourcesLabel
括号由 `(MWC 2023)` 变成 `(+SWM2 2026 | MWC 2023)`）、或 **OD/HP 被改**。

**站长 2026-09-20 最终拍板：保留 ` Pack N`，不做方案 A。** 理由（站长原话意思）：
无论如何 `Version` 里的 sourcesLabel 括号都要因为"新比赛收录"而变、成绩都要断一次，
既然如此不如就带着包号一起断 —— 不额外多挨一刀。**此话题关闭，别再提去掉包号。**

### 5.5 谱面可视化（复刻雨沐 `!v`，2026-09-13 上线）

把 `.osu` 画成"下落式竖条图"，与雨沐机器人 `!v` 的成图规则对齐。**全部计算在本机（浏览器）完成**，后端只提供原始 `.osu` 文本。

**代码位置**（均为纯逻辑，无 `@data` 依赖，可被 `node --test` 直接导入）：
- `src/lib/maniaChart.ts` — 解析 `.osu` + 分页几何。导出 `parseManiaBeatmap` / `buildManiaChart` / `beatToY` / `svToX` / `getKeyOverlay` / `ManiaChartError` 及全部常量（`LANE_WIDTH=10` / `CHUNK_GAP=30` / `MAX_WIDTH=1920` / `BARS_PER_CHUNK=4` / `BEATS_PER_CHUNK=16` / `ROWS_PER_PAGE=5` / `ROW_HEIGHT=710` / `ROW_GAP=20`）。
- `src/lib/osuTextClient.ts` — 取谱面文本 + 三级缓存。
- `src/components/chart/ManiaChartSvg.tsx` — 单页 SVG 渲染（同类横线合并成一条 `path`，避免上万 `<line>`）。
- `src/components/chart/ManiaChartModal.tsx` — 弹窗（翻页 / 适应宽度↔1920 原始尺寸 / 下载 PNG）。
- `src/components/chart/ManiaChartButton.tsx` — 可复用按钮（自带弹窗状态）。

**几何要点**（改之前先读 `maniaChart.ts` 顶部注释，别凭感觉调）：
- `chunkWidth = CHUNK_GAP + LANE_WIDTH*keys`；`chunksPerRow = floor((1920-30)/chunkWidth)`（4K=27、7K=18）；`chunksPerPage = chunksPerRow * 5`；整行居中偏移 `chunkX = (1920 - (chunksPerRow*chunkWidth - CHUNK_GAP))/2`。
- 每竖条 = 4 小节 × 4 拍 = 16 拍；**第 0 拍在底部**，越晚越靠上；竖条从左到右、一行行往下排。
- 一页 = `chunksPerPage * 16` 拍（4K 即 2160 拍 ≈ 180BPM 下 12 分钟）→ **绝大多数谱面只有 1 页**，多页是长图/马拉松才出现。
- **基准 BPM**：按时长加权取最长的红线 BPM，再 `normalizeBpm` 折进 120–300（×/÷2ⁿ）。
- **基准速度 / SV 归一化**：`significantSpeed` = 时长最长的 `(自身 beatLength × sv)` 四舍五入到 10 的倍数；`standardSv = beatLength×sv / significantSpeed`。
- **SV 曲线**：`std/mean > 0.25` 时画折线，否则画绿线。
- 本站无 osu 默认皮肤素材，note 改用圆角矩形（白 `#FFFFFF` / 蓝 `#5C9EFF`）。
- **与雨沐的唯一有意偏差**：雨沐把虚拟红线放在真实红线的负拍位（会画到竖条外），本站改放第一个物件拍位（beat=0，正好落在底边）。`ChartLine.ownBeatLength` 用来区分"参与速度计算的行"与纯装饰的小节线。

**取谱面与额度**（`osuTextClient.ts`）：
- 走既有 `GET /api/osu/raw`（见 §3 `functions/api/osu/raw.ts`）。带 slot 时若 401/403 且有 BID，**自动降级到 `?id=` 取线上版本**，并在弹窗里如实标注来源（`R2 比赛上传版本` / `osu! 线上版本`）。
- slot 分支会依次探测 `<baseKey>.osz` 与 `<baseKey>.nsv.osz`（SV 类轮次谱面上传的是 `.nsv.osz`）。
- 三级缓存：30 秒信任窗口（重复打开零请求）→ ETag 再校验（未变只花一次条件请求）→ 模型缓存（同 text 引用复用解析结果）。
- **Cloudflare 免费额度**：Pages Functions/Workers 共享 100,000 请求/天（午夜 UTC 重置、静态资源不计、默认 fail-open）。一次可视化 ≈ 1 次 Function + 约 5 次 R2 Class B。按每天 1000 次查看估算 ≈ 日额度 1%、R2 月额度（1000 万次）1.5% —— **安全**，故首页也放了按钮。

**按钮入口（3 处）**：管理端「编辑比赛」每张谱面（`MapSlotEditor.tsx`）、管理端「键型谱面」（`RealTypeMapBrowser.tsx` 的 `chart` 列）、首页详情弹窗每张谱面（`RoundDetailModal.tsx` 的 `MapRow`）。无 BID 且无 slot 时按钮返回 `null`。

**测试**：`scripts/mania-chart.test.mjs` 锁定几何（4K `chunkWidth=70` / `chunksPerRow=27` / `chunkX=30`，7K `chunksPerRow=18`，`beatToY` / `svToX` / `getKeyOverlay` / 跨切片裁切 / 虚拟红线 / SV 阈值 / 分页夹取）。

---

### 5.6 后台「键型谱面」的跨轮重复判读（2026-09-19 起）

`mapIdentityKey` 决定"这两张图算不算同一张"。**name 是槽位记号时不能当身份**：

- 判据（`isSlotPlaceholderName`，命中任一即视为占位）：① `^[a-z]{1,4}\d{1,3}$`（**要求至少一位数字**，
  免得误伤 `MU` 这类短曲名）；② 归一化后与**自己的 slot** 相同（兜住 `FS/TB`、`GM(HR/SD)`）。
- 命中后忽略 name、身份退到 BID；**没有可用 BID 就当没有身份**（返回 `null`）—— 宁可漏报不误报。
  背景：全库 227 张图的 name 就是槽位记号，`同大类+同槽位名+同难度` 跨独立轮次必然相撞（4DM2023 的 SV1 曾跨 7 轮报重复）。
- **轮次判重按 `round.id`**（不是 abbreviation）：两轮都叫 "F" 时按名去重会把两轮合成一轮而**漏报**。
  `warnings[].rounds` 是**给人看的**、按显示名去重 → **条目存在即等于"确实跨 ≥2 轮"**，
  调用方（如 `RealTypeMapBrowser` 的横幅/行内 `!`）**不得再拿 `rounds.length > 1` 当门槛**。
- 已知边界（刻意保留）：name 是**真实曲名**时身份只看「名字+难度」、不看 BID —— 同 BID 但两轮曲名写法不同**不报**。

### 5.7 MapUploader 的元数据暂存（跨比赛，2026-09-19 起）

补丁池**按比赛分组**：`StagedGroups = Map<tournamentId, StagedPatchMap>`（`src/lib/mapPatchCommit.ts`）。
单场那层（`applyStagedPatches` / `fill` 不覆盖远端 / 快照只清"本次写进去且期间没被改写"的条目）没变，
外面套了一层分组。三条契约：

- **换比赛不清池**（`loadTournament` 里那句 `setPendingPatches(new Map())` 已删）→ 也**不再弹**
  「切换会丢失暂存」的确认；切回某场比赛时把它自己那份暂存回放到行上。
- **统一保存走 `POST /api/tournaments/batch`**：每场各自 `GET` 权威 JSON + blob sha（R01 基准）→
  各自 `applyStagedPatches` → **一个**请求 = 一次 commit = 一次重建。
  任一场读不到就**整次不写**（batch 的原子语义，不给「哪几场进了」的糊涂账）；
  **409 → 全部重读最新 sha 自动重投一次**（`fill` 本来就不覆盖远端，重放安全，
  因此**不需要**像整份草稿那样做三方合并）；仍冲突则一个文件都不写、暂存全留、把冲突的比赛点名给用户。
- **落盘 `localStorage`**（key `osumania-ladder:map-uploader-staged:v1`）：暂存要跨比赛就不能只活在
  `useState` 里（切 tab 卸载、刷新清空）。**读盘完成前不许写盘**，否则首次 effect 会拿空池把存档清掉。
  读取一律走 `parseStagedGroups` 清洗：形状不对的条目逐条丢、`origin` 只认 `explicit` 其余退成 `fill`
  （猜错的代价必须是「不覆盖远端」）。

注意与 §9 的 **`JsonPreview`「暂存到本浏览器」不是一回事**：那是整份比赛 JSON 草稿（key 前缀
`osumania-ladder:staged-tournaments:v1`），这是元数据补丁；两者最后都汇到同一个 batch 端点。
### 5.8 天梯视图的身份层与悬浮（2026-09-19 起）

**默认进入"整场比赛"视图**（`useViewStore.mode` 默认值 `tournament`）。一个比赛 = 一个按钮 = 一整段难度范围，
框内显示**比赛全名**（不再是缩写）。三个视图模式：整场比赛 / 每轮图池 / 每轮键型。

- **悬浮锁定位**（`src/lib/ladderHover.ts`）：整场视图下同一次悬浮会话**只定位一次**，鼠标移动/滚动只换
  "指针命中的轮次"，卡片本身不动；换到另一场比赛才重新定位。每轮 / 键型视图**不锁定**（卡片跟随指针）。
  指针落在卡片上时 `LadderView` 的 `elementFromPoint` 先看 `[data-ladder-hover-card]`，命中就直接 return ——
  否则会被当成"离开了框"而把卡片关掉。滚动重绘用 `requestAnimationFrame`（滚动不发 `mousemove`）。
- **单表面**（`computeRangeSurface` + `RangeSurface.tsx` 的 `rangeSurface()`）：比赛框与轮次框共用同一套渐变坐标
  （`backgroundSize` = 绘图区高，`backgroundPosition` 按表面顶偏移），熔岩头在按钮内部，没有残片副框。
  改这两个函数会同时影响整场与每轮两种框。
- **比赛图标**：文件放 `public/tournament-icons/<比赛完整 id>.<png|webp|jpg|jpeg|svg|avif>`（**id，不是缩写**，每 id 只留一个，
  同名不同扩展会**抛错**）。`scripts/generate-tournaments.js` 在 `npm run dev` / `npm run build` 时扫目录，
  生成 `src/generated/tournamentIcons.ts`（**生成物**在 .gitignore；`public/tournament-icons/` 下的图标**要提交**，它们是站点资源）。
  **无图标不发任何网络请求**（不做 404 探测）。数量不符时构建日志会打印 `Generated icon index with N icons`。
  首次进入可视区且图片加载成功后保留原貌 5 秒，再淡出标题、淡入徽章；`prefers-reduced-motion: reduce` 下等 5 秒但不做过渡。
  加载失败保留全名，不显示破图。
- **三处逻辑已抽到 `src/lib`，别再在组件里重写一份**：`roundReference.ts`（整轮参考，含 `applyRoundRefToMaps` /
  `computeRoundRefValues` / `describeRoundRefChanges`）、`mapBrowserRows.ts`（键型浏览表格）、
  `suggestions/validation.ts`（建议校验，服务端有一份独立镜像，改一边必须同时改另一边并由测试锁住）。
  大题判读也统一走 `realTypeCatalog.ts` 的 `categoryOfRaw`。
## 6. 运行命令

> 注意：仓库路径 `d:/osumania ladder` 带空格。bash 里 `cd "/d/osumania ladder"` 或全程用绝对路径。

```bash
npm ci                     # 装依赖
npm run dev                # generate-tournaments.js + next dev（本地前端）
npm run build              # generate-tournaments.js + next build（生成 out/）
```

- **本地 `next dev` 不带后端**：`/api/*` 是 CF Pages Functions，`next dev` 不 serve，fetch 必 404。admin 页在 development 下会 mock 一个 owner session（前端可点，但调用真实 API 的按钮仍 404）。要测后端用 `wrangler pages dev`（需 `.dev.vars` 放密钥）。
- **改后端必须单独校验**：`npx tsc --noEmit -p functions/tsconfig.json`（`npm run build` 排除了 `functions/` 和 `osu-proxy/`）。
- Deno 代理改完不用本地校验，看 Deno Deploy 的 build 日志。
- `src/generated/`、`out/`、`output/`、`data/packs-manifest.previous.json` 都在 .gitignore。

### 发布（部署）

```bash
git add <文件>
git commit -m "..."
git push origin main      # → Cloudflare Pages 自动部署（2-4 分钟生效），Deno 代理几十秒
```

项目惯例是 **main 直推**，不建分支。**改 Cloudflare 环境变量不会自动重部署**：要么在 Deployments 标签页 Retry，要么推个空 commit 触发。

---

## 7. GitHub Actions（四个 workflow）

仓库 `osumania-ladder`，在 GitHub 网页 **Actions 标签页手动触发**：

### ① Generate Map Packs（核心）
输入 `realType`：
- **留空 = 全量合包**：跑所有 38 种键型，逐包生成→传 R2→删本地→**随后 Upload to Google Drive**→**Commit manifest 写回 GitHub**。全程 10+ 分钟。
- **填一个 realType**（如 `SS`）：只生成该键型包。**Drive 上传和 manifest commit 会 skip**（`if: github.event.inputs.realType == ''` 守卫），这是设计如此——避免单跑时 manifest 全量重建把别的类型清空。

需要 Secret：`R2_ACCOUNT_ID/R2_ACCESS_KEY/R2_SECRET_KEY`、`R2_PACKS_BUCKET`、`R2_PACKS_PUBLIC_URL`、`GDRIVE_CLIENT_ID/GDRIVE_CLIENT_SECRET/GDRIVE_REFRESH_TOKEN/GDRIVE_FOLDER_ID`。

### ② Upload Packs to Google Drive (Re-run)
不重新合包，直接从 R2 公开桶拉流跑 Drive 上传。**Drive 凭据修复后想重传就用它**，省 10 分钟。同样会 commit manifest。输入 `run_id` 仅作记录。

### ③ Backup R2 + Cleanup Trash
每天 UTC 18:07（北京时间 02:07）定时：主桶增量备份到 `osumania-ladder-maps-backup` + 清 R2 `trash/` 前缀超期文件。也可手动触发。

### ④ Identity Report (read-only)
**只读身份体检**，回答"内容一样、但身份来源不同的图有多少"。输入 `real_type`（留空 = 全部类型）。
- 真正跑的是一条命令：`node scripts/generate-pack.js --identity-report [--type=X]` —— **不生成包、不上传 R2、不改 manifest、不写 output/**，只读 `maps/` 算内容摘要与候选键。
- 结果写进 `reports/pack-identity-report.md`（开头是逐类型汇总表：槽位 / 可读引用 / 读取失败 / 三类问题计数），**提交回仓库**并把前 80 行打进 job summary。
- 需要 Secret：只要 `R2_ACCOUNT_ID` / `R2_ACCESS_KEY` / `R2_SECRET_KEY`（用不到 packs 桶与 Drive）。
- ⚠️ 两个反直觉点：① 报告里的 `读取失败` 表示**没看清**，不等于"没有重复"；② 体检有任何类型失败时**不写报告文件**（避免用残报告覆盖上一次结果，那个文件是要提交的）。
- ⚠️ 提交报告会触发一次站点重建 —— 这是手动、刻意的动作，不是"每次保存都重建"。

**Drive 上传失败的兜底**：日志出 `FATAL: refresh_token invalid` → 用 OAuth Playground 重跑拿新 refresh token → 更新 GitHub Secret `GDRIVE_REFRESH_TOKEN` → 跑 ②。

---

## 8. 脚本工具箱（`scripts/`）

| 脚本 | 用途 | 用法 |
|---|---|---|
| `generate-pack.js` | 合包核心（§5.3） | `node scripts/generate-pack.js --type=SS`（单类型）；不带参数=全量+重建 manifest；`--identity-report [--type=X]` = **只读身份体检**（不打包/不上传/不改清单，写 `reports/pack-identity-report.md`，也有同名 Action） |
| `upload-to-gdrive.js` | 从 R2 拉流传 Drive + 孤儿清理 | `node scripts/upload-to-gdrive.js`（需 GDRIVE_* 环境变量） |
| `backup-r2.js` | R2 增量备份 + trash 清理 | `node scripts/backup-r2.js`（每日 Action 调） |
| `generate-tournaments.js` | 由 data/tournaments/*.json 生成 `src/generated/tournaments.ts` | `npm run dev/build` 自动跑；手动 `node scripts/generate-tournaments.js` |
| `backfill-bid.mjs` | **从 R2 回填 BID/setID 到 JSON**（只增不改，不动 difficulty；占位 ID 按 `beatmapIds.ts` 判读） | `node scripts/backfill-bid.mjs`（dry-run 报告）；`--apply` 才写回 |
| `recalc-round-difficulty.js` | 按新公式重算所有 round 的 difficulty.min/max/average（TB 排除、HB 双侧平均） | `node scripts/recalc-round-difficulty.js --dry` 先看 diff |
| `detect-type-conflicts.mjs` | 键型冲突体检（与后台「realType 体检」同源）：同 BID / 倍速变体可统一，同 set 的普通多难度只供人工核对 | `node scripts/detect-type-conflicts.mjs`（**只读**）；写回要显式 `--apply --bid=<id> \| --set=<id> --to=<realType>` |
| `test-merge-fix.js` | 测试合包合并逻辑（无 bid 谱面对） | `node scripts/test-merge-fix.js` |
| `set-priority.js` / `batch-set-priority.js` | **一次性**给比赛设 priority（历史脚本，已跑过，新比赛手动在 JSON 填） | 一般不再用 |

> 本地跑 R2 相关脚本（generate-pack / upload-to-gdrive / backup-r2 / backfill-bid）需先 export：`R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET`（upload-to-gdrive 还要 GDRIVE_*）。

---

## 9. 管理后台（`/admin`，osu OAuth 登录）

Tabs（`src/app/admin/page.tsx` 的 `Tab` 类型）：

| Tab | 组件 | 做什么 |
|---|---|---|
| 新建/编辑 | `TournamentForm` + `JsonPreview` | 两步录比赛（基本信息 / 轮次谱面）。轮次用 `RoundEditor`：图池模板快速填充（`src/lib/poolTemplates.ts`，按 bestOf+资格赛索引）、逐图填/只填范围两种难度模式。表单脏了切栏/关页弹确认 |
| 管理比赛 | `manage` | 列表 → 编辑 / 删除（删=软删进回收站，写 GitHub commit） |
| 参考点 | `ReferencesEditor` | 维护 `data/references.json`（难度标尺上的显式锚点） |
| 难度标尺 | `RefLadderEditor` | 维护 `data/ref-ladder.json`（易→难轮次链，可加 step） |
| 拟合预测 | `DifficultyFitTool` | 按标尺轮位做散点/线性拟合。RF 侧默认启用 `14→15 = 1.5` 的“段位跨度倍率”（LN 默认关闭），输出会还原为原始段位；可手动调斜率，直线固定穿过样本中心 |
| 谱面上传 | `MapUploader` | 自动下载+上传（一键下载上传 N）；贴 BID 补传（三阶段：粘贴→review→执行；TB↔TB1 自动匹配；未匹配 slot 手动指派；"包含已上传"=覆盖 R2）。浏览器侧 JSZip 切单难度+去 storyboard+保留打击音效，`POST /api/maps/upload`；元数据暂存**跨比赛累计**、最后统一走 batch（§5.7）|
| 下载链接 | `PackLinksEditor` | 按 `(realType, part)` 复合键逐包填各盘链接 |
| realType 体检 | `RealTypeConflictChecker` | 批量体检同谱面 realType 冲突，admin 可保存（GitHub Git Data 单 commit 批量写回） |
| 键型谱面 | `RealTypeMapBrowser` | 按 realType 浏览全库谱面 + 跨轮重复报警。判读唯一实现在 `src/lib/tournamentDiagnostics.ts`（§5.6）|
| 回收站 | `TrashManager`（admin） | KV 软删比赛一键恢复 |
| 成员 | `AdminsManager`（admin） | 四级角色名单管理 |
| 审计 | `AuditLog`（admin） | KV 审计日志 180 天 |

**批量导入**（`BulkImporter`，轮次列表上方按钮）：粘贴 slot+ID 两列 → 确认轮次 → 逐张查 osu 元数据（可中断）→ `findMatchingTemplate` 按"map 数+各 type 计数"匹配模板自动填 realType；未命中标准模板时 RC/LN/HB/SV 分别回退到对应 Pending。

**比赛修改暂存**：`JsonPreview` 的“暂存到本浏览器”把完整比赛 JSON 持久化到 localStorage（key `osumania-ladder:staged-tournaments:v1`），不会调用后端。多场暂存最后通过 `POST /api/tournaments/batch` 用 Git Data API 合成一次 commit；该接口现允许 contributor（与逐场增改权限一致）。重新编辑已有比赛时会优先载入本地暂存版本。新建比赛仍推荐直接提交。

---

## 10. 红线与坑（绝对注意）

1. **绝不提交任何密钥到 git、绝不在回复里回显密钥值**（之前泄露过一个 osu v1 API key，用户已重置）。只用环境变量名引用。
2. **改 realType 键型必须三处齐改**（§5.1），否则出现"admin 可选但合包没名字 / 下载页不显示"的不一致。
3. **合包命名带空格**（`4K Tournament Pattern SV Pack 1`）：之前做 contest→tournament 替换时误吞空格导致 55 处坏名。改模板字符串时留意空格。
4. **不要回退"单包带 `_1` 后缀"** 和 **`TB1` 显示为 `TB`** 的约定（见 §5.3 / SECURITY-DEPLOY-STATUS）。
5. **R2 上传 Body 用 Buffer 非流**；**逐包上传+删本地**防磁盘爆（runner 14GB）。
6. **合包会改 .osz 内部 Title/Creator/Version 等**（OD/HP 自 2026-09-13 起跟随原谱、不再被改）→ 玩家已下谱面的成绩会断（hash 变）。动合包逻辑前先想清楚这个代价。
7. **改 Cloudflare 环境变量不会自动重部署**，要 Retry 或空 commit。
8. **KV 绑定要在 Production + Preview 两个环境都加**，否则 preview 500。
9. **osu 代理走 Deno**，`functions/api/_lib/osu.ts` 里保留 proxy 路径分支；改它要透传 `env`。
10. **Windows 行尾**：git 提示 LF→CRLF 无害。
11. `data/packs-manifest.json` 的 name 是**显示层**；R2/Drive 上 `.osz` 内部标题需跑全量合包才更新（旧包内部仍是 `4K Contest…`）。
12. 路径 `d:/osumania ladder` 带空格，bash 里 `cd` 会触发权限提示，用绝对路径。
13. **GITHUB_TOKEN 2026-11 到期**：若 Cloudflare 后台"三 tab 数据全空"，先怀疑 CF 的 `GITHUB_TOKEN` secret 失效（private repo 被拒 404），换 token + 重跑对应 Action 即可。

---

## 11. 项目现状与待办

### 已完成（上线）
- 公开天梯 + 三视图渲染、i18n（zh/en）、参考难度标尺 v5（真实刻度 step/pos、MWC±N 插值/外推）。
- 安全改造全量：osu OAuth、四级权限、软删除回收站（KV + R2 trash）、审计日志、每日 R2 备份、Deno 代理绕 429。
- 合包流水线 Phase 1-3：生成 → R2 直链 + Drive 镜像 → manifest 写回 → 孤儿清理 → 下载页折叠展示。
- 近期（2026-08）：GITHUB_TOKEN 修复；合包磁盘防爆（逐包传删 + Buffer）；命名 contest→tournament（含 55 处补空格）；新增 GM 键型；priority 字段；TB/HB 难度统计修复 + 全量 recalc；BID 回填脚本。
- 2026-08-20：拟合 RF 段位跨度校准与手动斜率；4 个 Pending 键型及导入回退/合包规则；键型说明折叠占位；比赛本地暂存与单 commit 批量上传；SATC 排到 JTC/WTC 之前。
- 2026-09-13：谱面可视化（复刻雨沐 `!v`），三处入口（admin 编辑比赛 / admin 键型谱面 / 首页详情弹窗），全前端计算 + 三级缓存 + 403 自动降级（见 §5.5）。

### 待办 / 搁置
1. **全量合包待跑**：manifest 改名只是显示层，R2/Drive 上 `.osz` 内部仍是 `4K Contest…` + 旧 Creator，需下次跑全量合包（Actions → Generate Map Packs → realType 留空）才会写入新 Title/Creator。**注意会让已下载玩家的成绩断（hash 变），用户已知悉接受。**
2. **GM 包**：需先录入含 GM 谱面的比赛并合包才生成 `4K Tournament Gimmick SV Pack 1`。当前无 GM 数据。
3. **三方案（成绩 hash，A 冻结名/B 去来源/C 现状）**：用户"先不改"，**勿主动实施**，等指示。
4. **难度精度 toFixed(1)→(2)**：方案已定（仅数据层 8 处），压缩后待执行，不上传。
5. **123 网盘自动上传**：审核失败搁置（见 `docs/123pan-auto-upload-research.md`）；Drive 已够用。
6. **GITHUB_TOKEN 到期**：2026-11 预警（见红线 13）。

### 相关文档
- `SECURITY-DEPLOY-STATUS.md`：安全改造部署状态 + 登录链路 + 代理迁移预案（较旧但仍是权威参考）。
- `SECURITY-SETUP.md`：站长操作清单。
- `docs/`：若干功能研究/批改记录（google-drive-auto-upload、r2-direct-pack、123pan 等）。
- 用户记忆库 `C:\Users\Shadiaojunshi\.claude\projects\d--osumania-ladder\memory\`（本 AI 的跨会话记忆，如需可读取参考）。

---

## 12. 常规操作速查（给 Codex）

| 诉求 | 怎么做 |
|---|---|
| 改比赛数据 | 编辑 `data/tournaments/<id>.json`（或走 admin 后台）→ `git push origin main` 自动部署 |
| 新增一个 realType | 三处注册（§5.1）→ 建含该键型比赛 → 合包 |
| 触发全量合包 | GitHub → Actions → **Generate Map Packs** → Run workflow → realType **留空** |
| 只合某一个键型 | 同上，realType 填如 `SS`（Drive 上传/manifest 会 skip） |
| Drive 上传重跑 | GitHub → Actions → **Upload Packs to Google Drive (Re-run)** |
| 备份 R2 | 自动每日；手动触发 Backup R2 workflow |
| 回填无 BID 老图 | `node scripts/backfill-bid.mjs --apply`（本地，需 R2 凭证） |
| 体检 realType 冲突 | admin → realType 体检，或 `node scripts/detect-type-conflicts.mjs`（只读；要改就按报告里的示例命令显式 --apply） |
| 改谱面可视化的画法/几何 | `src/lib/maniaChart.ts`（先跑 `node --test scripts/mania-chart.test.mjs`，几何断言会兜住手滑） |
| 检查 manifest 合法性 | `node -e "const m=require('./data/packs-manifest.json'); console.log(m.packs.length)"` |
| 本地开发（改代码热更） | `npm run dev`（纯前端；`/api/*` 一律 404） |
| 预览静态产物 | `npm run build` → `npm start`（= `node scripts/serve-static.mjs`，只伺服 `out/`） |
| 带后端联调 | `npm run dev:api`（= `wrangler pages dev out`，需 `.dev.vars`） |
| 跑测试 | `npm test` |
| 跑 lint | `npm run lint`（ESLint 9 flat config，约 2 分半；**当前有 25 条存量错误会退出 1**，基线见 `PROJECT-REVIEW` R19） |
| 校验前端 TS | `npm run typecheck` |
| 校验后端 TS | `npm run typecheck:functions` |
| 一次跑全套 | `npm run verify`（前端 TS → 后端 TS → lint → 测试；lint 现在是红的，会停在那一步） |
| 新增写 API（POST/PUT/DELETE） | 不用额外做事：`functions/api/_middleware.ts` 统一校验 Origin（完整 origin 不同即 403 `BAD_ORIGIN`）。响应请用 `_lib/cors.ts` 的 `jsonResponse`（自带 `private, no-store`） |
| 换/加域名调本站写 API | 配环境变量 `WRITE_ORIGIN_ALLOWLIST`（逗号分隔）；同源与预览域名不用配 |
| 数据被篡改 / 要回档 | **先停 Backup R2 workflow**（别让后续备份继续覆盖镜像），再按 `RECOVERY-RUNBOOK.md`：JSON 用 `git restore --source=<可信commit>`；R2 的 `.osz` 先看 **`<备份桶>/snapshots/<日期>/maps/…`**（变更前存档，保留 7 天），其次 `trash/`、`versions/`、镜像 |

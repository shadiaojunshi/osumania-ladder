# 项目交接文档（给接手 AI / Codex）

> 本文件写给**没有本会话记忆的接手 AI**（如 Codex）。目标是让你能独立接手本仓库，知道"这是什么、数据在哪、怎么改、怎么发布、有哪些坑"。
> 最后核对：2026-08-20（本轮功能改动已完成验证；提交状态以 `git log` 为准）

---

## 1. 项目是什么

一个 **osu!mania 4K 比赛谱面收录 + 难度天梯 + 合包下载**的网站。

- **公开站**（首页天梯、下载页）：展示历年 osu!mania 4K 比赛（MWC/MCNC/LN 杯等 33 个）的图池，把每张谱面按难度标注在"天梯"上，支持按比赛 / 轮次 / 键型三种视图浏览。纯静态站，零后端 API 调用。
- **合包下载**：按"真实键型"（realType，如 Stream/Jack/Release/SV…共 38 种）把散落在各比赛的谱面聚合打包成 `.osz`（每包最多 80 张），上传到 Cloudflare R2 + Google Drive，下载页提供直链。
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
│   │   │                           AdminsManager / TrashManager / AuditLog / JsonPreview
│   │   └── ladder/              ← LadderView / HoverCard
│   ├── lib/                     ← types.ts / i18n.ts / referenceData.ts / difficulty.ts / poolTemplates.ts
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
  "priority": 5,                        // 1-5，合包排序：priority 降序 → 年份降序 → id 升序
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

大类映射（`MapCategory`）：RC（SS/JS/SA/CJ/SJ/MX/DP/ADP/STC/MTC/JTC/WTC/TC/ORC/SATC）、LN（RE/CO/TE/DE/SW/JW/IN/LNMX/LNTC/LNWL/OLN）、HB（HB1-HB5/RCmainHB/LNmainHB/MXHB/MNTB/OHB）、SV（SV1/SV2/SI/ME/SVMX/**GM**）、TB（TB）、SPECIAL（自定义自由文本）。

**2026-08-18 新加了 GM（Gimmick，归 SV 类）**：三处已注册，合包名 `Gimmick SV`。注意 poolTemplates.ts 未加 GM（非常规池位，录入时在 SV 下拉手动选），当前无含 GM 的谱面数据，暂无 GM 包。

**2026-08-20 新增 Pending 键型**：`PDRC / PDLN / PDHB / PDSV` 均排在所属大类下拉末尾。主表批量导入无法命中标准图池模板时，不再误选各类第一个键型，而是落入对应 Pending。`PDRC / PDLN / PDHB` 是待分类队列，`generate-pack.js` 明确跳过且下载页不展示；`PDSV` 例外，会正常合包并显示在 SV 下载分类。

### 5.2 难度输入规则

- 每张谱面有 `difficulty`（rf 难度段）。RC/SV 用 **rf**；LN 用 **ln** 段（`difficultyLn`）；HB/TB/SPECIAL **rf+ln 双框**（`needsDualDifficulty` 只对这三类返回 true）。
- `DifficultyRefPicker` 从**全局难度标尺**（`ref-ladder.json`）插值出参考值。标尺是手排的 `{tournamentId, roundId, step?}` 链，易→难，可跨比赛；`step` 默认 1（标准一轮），支持小数（半轮 0.5）。MWC 4K 2025 是基准比赛（`MWC_LADDER_TOURNAMENT_ID`），`mwc±N` 快捷偏移以此锚定。
- `references.json` 是标尺上的显式数字锚点（如 "MWC 2025 GF RC": 13.3）。天梯渲染颜色用 `reform-dan.json` 段位表。
- **TB 不参与轮的难度统计**（`recalcDifficulty` 里 `type === 'TB'` 跳过）；**HB 取 rf/ln 双侧平均**为一个数据点，单侧有取单侧。

### 5.3 合包规则（`scripts/generate-pack.js`）

- 按 `realType` 聚合所有比赛谱面 → 去重 → 每包最多 **80 张**（`MAX_MAPS_PER_PACK`）。
- **去重签名优先级**：`beatmapId` → 指纹 `Artist|Title|Creator|Version`（无 BID 老图）→ `r2Key` 兜底。NSV 变体单独成条目。多源复用同一谱面时合并，多个来源写进 osu! `Version` 字段的括号标签 `(MWC 2025 F HB3 & VNMC …)`。
- **输出命名**：文件名 `<realType>_<part>.osz`（单包也带 `_1`，破坏性升级 `57904da`，勿回退）；osu! 内部 `Title = "4K Tournament {名字} Pack {n}"`、`Artist = "Various Artists"`、`Creator = "various mappers,compiled by the osu!mania Ladder Team"`、`BeatmapID=0`、`BeatmapSetID=-1`、`Source/Tags` 清空。
- **OD/HP**：`OD_FLOOR` 列出的 realType 有 OD 下限（只抬不降）；**SV 类不列出 = 不改 OD**。HP 一律设 7。
- **每包生成完立即上传 R2 公开桶并删本地副本**（磁盘防爆，`d6afbf7`/`8b6fd1c` 的修复）。上传 Body 必须用 **Buffer 而非流**（R2 不支持 chunked 上传）。R2 上传失败时保留本地副本。
- **manifest 全量重建**：全量跑时旧 manifest 转储 `.previous.json` → 用本次输出重建 → `(realType, part)` 匹配找回旧 `links`/`gdriveFileId` → 清理 R2 桶孤儿（本次没产出的 `.osz`）→ Drive 孤儿同步删 → 清 `.previous.json`。

### 5.4 osu! 成绩绑定机制（用户已拍板的结论，别再推导）

**osu! 本地成绩绑 .osu 文件 md5 hash，不绑 set ID。** 所以改谱面任何字节（名称/OD/HP/sourcesLabel 括号）→ hash 变 → 玩家已下成绩断。`Version` 里 sourcesLabel 括号 n→n+1 也是一个固有断点。**已知悉、接受、三方案（A 冻结名/B 去掉来源/C 维持现状）用户"先不改"，搁置。**

---

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

## 7. GitHub Actions（三个 workflow）

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

**Drive 上传失败的兜底**：日志出 `FATAL: refresh_token invalid` → 用 OAuth Playground 重跑拿新 refresh token → 更新 GitHub Secret `GDRIVE_REFRESH_TOKEN` → 跑 ②。

---

## 8. 脚本工具箱（`scripts/`）

| 脚本 | 用途 | 用法 |
|---|---|---|
| `generate-pack.js` | 合包核心（§5.3） | `node scripts/generate-pack.js --type=SS`（单类型）；不带参数=全量+重建 manifest |
| `upload-to-gdrive.js` | 从 R2 拉流传 Drive + 孤儿清理 | `node scripts/upload-to-gdrive.js`（需 GDRIVE_* 环境变量） |
| `backup-r2.js` | R2 增量备份 + trash 清理 | `node scripts/backup-r2.js`（每日 Action 调） |
| `generate-tournaments.js` | 由 data/tournaments/*.json 生成 `src/generated/tournaments.ts` | `npm run dev/build` 自动跑；手动 `node scripts/generate-tournaments.js` |
| `backfill-bid.js` | **从 R2 回填 BID/setID 到 JSON**（只增不改，不动 difficulty） | `node scripts/backfill-bid.js`（dry-run 报告）；`--apply` 才写回 |
| `recalc-round-difficulty.js` | 按新公式重算所有 round 的 difficulty.min/max/average（TB 排除、HB 双侧平均） | `node scripts/recalc-round-difficulty.js --dry` 先看 diff |
| `detect-type-conflicts.js` | 检测同谱面（含倍速变体）type/realType 分配冲突，交互式修复 | `node scripts/detect-type-conflicts.js` |
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
| 谱面上传 | `MapUploader` | 自动下载+上传（一键下载上传 N）；贴 BID 补传（三阶段：粘贴→review→执行；TB↔TB1 自动匹配；未匹配 slot 手动指派；"包含已上传"=覆盖 R2）。浏览器侧 JSZip 切单难度+去 storyboard+保留打击音效，`POST /api/maps/upload` |
| 下载链接 | `PackLinksEditor` | 按 `(realType, part)` 复合键逐包填各盘链接 |
| realType 体检 | `RealTypeConflictChecker` | 批量体检同谱面 realType 冲突，admin 可保存（GitHub Git Data 单 commit 批量写回） |
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
6. **合包会改 .osz 内部 Title/Creator/OD/HP** → 玩家已下谱面的成绩会断（hash 变）。动合包逻辑前先想清楚这个代价。
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
| 回填无 BID 老图 | `node scripts/backfill-bid.js --apply`（本地，需 R2 凭证） |
| 体检 realType 冲突 | admin → realType 体检，或 `node scripts/detect-type-conflicts.js` |
| 检查 manifest 合法性 | `node -e "const m=require('./data/packs-manifest.json'); console.log(m.packs.length)"` |
| 本地起站 | `npm run dev`（纯前端）；后端测试用 `wrangler pages dev` |
| 校验后端 TS | `npx tsc --noEmit -p functions/tsconfig.json` |

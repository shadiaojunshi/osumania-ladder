# 部署后核实清单（写给下一位 AI，2026-09-18）

这份文档是为了**让接手的人/AI 在不了解上下文的情况下，也能把"还没验收的几件事"核完**。
它独立可读：不需要读对话记录，照着命令跑、对着"期望值"比对即可。

---

## 0. 背景（30 秒版）

`PROJECT-REVIEW-2026-09-12.md`（R01–R33）的修复**只剩 R23 未实施**，其余全部实现完成。
但其中**有很多项只做过本地验证，没在真实环境验收过**。这份清单就是那批"没验收"的活。

**R19–R22 的改动已随提交入库**（§7 的清单是提交前的盘点，保留供对照）。**推送 ≠ 部署生效**：线上要等 Cloudflare Pages 重建完成才是新行为，所以**下面第 3 节的核实仍然必须等站长确认部署之后做**。

---

## 1. 红线（先看再动手）

1. **未授权不要 commit / push**。改动留给站长或 VSCode 端提交。
2. **只读优先**。任何会改代码/数据/线上对象的操作（包括 `--apply`、`--publish`、GC 清理），**先问站长**。
3. **能不碰 git 写命令就别碰**。这台机器上出现过 `git rm` 之后整个 `scripts/` 目录消失的事故（见 §6）；`git status` / `git log` / `git diff` 这类**查询**是安全的。
4. **不要动** `ManiaMapAnalyser.by.Leo_Black/`、`osu-toolbox/`；**不要改** `data/tournaments/*.json`（除非站长明确要求）。
5. `npm run build` 会先清空 `.next/`（几千个文件），可能被本机的"批量删除守卫"拦下 —— **重跑一次通常就过**，不要用 `CODEBUDDY_SAFE_DELETE_ENABLED=0` 绕过。
6. `.workbuddy/` 是项目数据目录（含记忆与临时脚本），**不要删**。

---

## 2. 本地检查（不需要部署，随时可跑）

```bash
npm test                                     # 期望 536/536
npx tsc --noEmit                             # 期望 0 错（前端）
npm run typecheck:functions                  # 期望 0 错（Functions）
npm run lint                                 # ⚠️ 会退出 1：25 条存量错误，见下
npm run build                                # 期望成功（被删除守卫拦下就重跑一次）
npm start                                    # 静态预览 http://localhost:3000（只伺服 out/，不含 /api）
```

关于 `npm run lint` 的 25 条错误：**这是已知基线，不要靠降级规则/写 `eslint-disable` 把它刷绿。**
全部来自 `eslint-plugin-react-hooks` v7 的新规则（`set-state-in-effect` 等），集中在后台
"挂载即 setState / 取数时立刻置 loading" 这类写法上；逐条修等于重构后台取数层。
完整基线（规则 + 文件 + 行号）在 `PROJECT-REVIEW-2026-09-12.md` 的 R19 完成记录里，站长已确认保持 error。

`npm start` 起来后请**用浏览器打开** `/`、`/admin`、`/download` 各看一眼（这是 R19 的验收项之一）。

---

## 3. 部署后核实 A：安全头与写请求来源（R21 的验收）★ 优先

> 站长本人不熟悉这套核查，所以这几条就是留给接手人的。
> **前提：R21 的改动已经部署到线上。** 未部署时跑这些只反映旧行为。

### 3.1 后台页能不能被别的网站套进 iframe

```bash
curl -sI https://osumania-ladder.pages.dev/admin | grep -i "x-frame\|content-security"
```

- **期望**：看到 `X-Frame-Options: DENY` 与 `Content-Security-Policy: frame-ancestors 'none'`。
- **看不到** → `public/_headers` 没被 Cloudflare Pages 读到。原因几乎总是 Pages 项目的
  **Build output directory 不是 `out`**（这个配置在仓库外，改不了代码解决）。
  处理：让站长把 Pages 项目的输出目录设为 `out`，或把 `_headers` 直接放进实际输出目录。
  **不要**为了让它生效而在仓库里加 `script-src 'self'` 之类的完整 CSP —— 那会破坏 Next 静态站的
  内联启动脚本（这正是 R21 明确要求避开的东西）。

### 3.2 后台 API 的响应有没有缓存策略

```bash
curl -s -o /dev/null -D - https://osumania-ladder.pages.dev/api/auth/me | grep -i "cache-control"
```

- **期望**：`cache-control: private, no-store`
- 注意 `/api/osu/raw` 是**刻意不同**的：它返回谱面文本，用 `private, no-cache` + ETag/304 —— 别当成漏改。

### 3.3 跨站写请求会被拒绝、正常写请求照常

```bash
# ① 跨站来源的写请求 → 期望 403 + {"code":"BAD_ORIGIN"}
curl -s -o - -w '\n%{http_code}\n' -X PUT \
  -H 'Origin: https://evil.example' -H 'Content-Type: application/json' \
  -d '{"tournament":{},"sha":"x"}' \
  https://osumania-ladder.pages.dev/api/tournaments/some-id

# ② 带本站 Origin、但没有登录 → 期望 401（不是 403）
curl -s -o - -w '\n%{http_code}\n' -X PUT \
  -H 'Origin: https://osumania-ladder.pages.dev' -H 'Content-Type: application/json' \
  -d '{"tournament":{},"sha":"x"}' \
  https://osumania-ladder.pages.dev/api/tournaments/some-id

# ③ 不带 Origin（curl/脚本）→ 期望 401（放行过 Origin 闸门，卡在会话上）
curl -s -o - -w '\n%{http_code}\n' -X PUT -H 'Content-Type: application/json' \
  -d '{"tournament":{},"sha":"x"}' \
  https://osumania-ladder.pages.dev/api/tournaments/some-id
```

- **期望**：① 403 `BAD_ORIGIN`；② 401 `NO_SESSION`；③ 401 `NO_SESSION`。
- **③ 的意义**：非浏览器客户端（脚本/curl）不受影响，这是设计意图。
- **然后请站长用浏览器登录后台，正常做一次"改一场比赛 → 保存"**，确认没有被 403 拦。
  如果被拦，说明预览域名/自定义域名与请求 origin 不一致 —— 那时要把该域名加进环境变量
  `WRITE_ORIGIN_ALLOWLIST`（逗号分隔的完整 origin）。

### 3.4 静态站没有被牵连

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://osumania-ladder.pages.dev/
curl -s -o /dev/null -w '%{http_code}\n' https://osumania-ladder.pages.dev/download
```

- **期望**：都是 200。R21 只改了 `/admin*` 的响应头，首页与下载页不该有变化。

---

## 4. 部署后核实 B：后台与脚本的实际行为

1. **后台**：`/admin` 打开正常、深浅色正常；上传页选一个比赛 → 传一张 .osz → 保存 → 再保存一次
   （验证 R01/R02 的"连续保存"路径）。
2. **冲突体检（只读，安全）**：
   ```bash
   node scripts/detect-type-conflicts.mjs
   ```
   期望：54 个文件 / 4935 张谱面 / **28 组**（`bid 5`、`rateSet 2`、`setReview 21`），退出码 0，
   **不写任何文件**。要改必须先 `--apply --bid=<id> | --set=<id>` 且带 `--to=<realType>`，
   并且**先问站长**要改哪一组。
3. **回填老图（需要 R2 凭据，先 dry-run）**：
   ```bash
   export R2_ACCOUNT_ID=... R2_ACCESS_KEY=... R2_SECRET_KEY=...   # 向站长要
   node scripts/backfill-bid.mjs        # 不带 --apply 只出报告
   ```
   `--apply` 会改 `data/tournaments/*.json`，**必须站长确认**。

---

## 5. 还需要凭据/权限才能做的核实（R23 剩余部分）

以下是 R23 里我**做不了**的部分（没有 R2 凭据、没有 GitHub 与 Drive 访问权）：

1. **GitHub Actions 最近的运行记录**：`Generate Map Packs`、`Upload Packs to Google Drive`
   各自最近一次成功/失败、失败在哪一步、用的哪个 commit。
   这一步能回答关键问题：**R10/R11/R12 的新发布链到底跑过没有**。
2. **R2 与 Drive 的实对象**：桶里包对象列表、大小、更新时间；Drive 里对应文件。
   与 `data/packs-manifest.json` 比对是否同一版本。
3. **隔离样包核对（R23 第 3 步）**：跑一次**单类型离线预览**（`node scripts/generate-pack.js --type=SS`，
   不带 `--publish`，不碰 R2/manifest），核对图数、来源标签、谱面身份、音频与 NSV 借用，
   再比较改写后的 `.osu` 字节变化与"玩家已下成绩会断"的影响面。
4. **问卷入口、GM 模板、难度精度、osu! token 到期**这些旧待办：对照源码与后台实际配置重新确认
   （2026-11 那个到期日是旧文档记录，**不是**读了 token 元数据得出的）。
5. `node scripts/find-suspect-realtypes.mjs` 的实际输出核对（R33 遗留：改了两处索引条件，只跑过单测，
   预期报告条数**只会减少**、不该凭空多出条目）。

### 我已经做完的只读核实（不用重做）

- 线上 R2 包的存活与大小比对（55 个包全部可达、大小全吻合）：见 `reports/pack-liveness-report.json` 与 `reports/pack-liveness-retry.json`，结论在 `PROJECT-REVIEW` R23 完成记录里。
- 线上 `/download` 页面（构建期把清单渲进 HTML）与提交的清单是同一版本。
- 数据侧：全库 0 个重复 round id、0 个残留占位 ID；误标检测实跑报告只减不增（31 → 25 条）。
- 线上响应头基线、`/api/auth/me`、`/admin` 的现状：见 R21 完成记录。
- `data/packs-manifest.json` 的现状：55 个包、`lastGenerated=2026-08-13`、**全部没有 `objectKey` /
  `gdriveObjectKey`**、R2 链接还是旧式固定键（`SV1_1.osz`），下载页是**构建期**把这份 JSON 打进包里的
  （`src/app/download/page.tsx` 里 `import packsManifest from '@data/packs-manifest.json'`）。

> ⚠️ 别用 `lastGenerated`（2026-08-13）推断"线上没被改过" —— 单类型生成可能改了 R2 却没改这个日期。

---

## 6. 环境事故记录（别重复踩）

- **`scripts/` 目录曾被整体删除**（发生在一次 `git rm` 两个文件之后，原因未定位）。
  恢复办法：`git checkout -- scripts/`（从索引恢复被跟踪文件，55 个）。
  **没有进过版本库的新文件无法恢复**。
- 本环境的"批量删除守卫"会在单次删除大量文件时拦下命令（`next build` 清 `.next/` 时最常见）。
  拦下就**重跑**，不要绕过守卫。
- 新建了未跟踪的脚本后，先备份一份：`cp scripts/*.mjs .workbuddy/tmp/scripts-backup/`。

---

## 7. 提交前的改动盘点（已随提交入库，供对照）

**修改（M）**：`.gitignore`、`package.json`、`CODEX-HANDOFF.md`、`PROJECT-REVIEW-2026-09-12.md`、
`HANDOFF-PACKS-AND-REMAINING-2026-09-18.md`、`docs/design/2026-09-homepage-implementation.md`、
`src/lib/roundLabelLayout.ts`、`src/components/admin/{PackLinksEditor,RefLadderEditor,ReferencesEditor}.tsx`、
`functions/api/_middleware.ts`、`functions/api/_lib/cors.ts`、`functions/api/maps/status.ts`、
`functions/api/osu/beatmap.ts`、`functions/api/osu/download.ts`

**新增（未跟踪）**：`eslint.config.mjs`、`public/_headers`、`scripts/serve-static.mjs`、
`scripts/serve-static.test.mjs`、`scripts/detect-type-conflicts.mjs`、`scripts/detect-type-conflicts.test.mjs`、
`scripts/backfill-bid.mjs`、`scripts/backfill-bid.test.mjs`、`scripts/security-headers.test.mjs`

**删除（已进索引）**：`scripts/backfill-bid.js`、`scripts/detect-type-conflicts.js`、
`scripts/round-label-layout.test.mjs`、`tsconfig.tsbuildinfo`（停止跟踪，本地文件保留）

对应的完成记录都在 `PROJECT-REVIEW-2026-09-12.md` 的 R19 / R20 / R21 / R22 章节末尾，§8 表里有状态。

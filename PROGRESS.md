# 进度文档(2026-09-02,压缩上下文前交接)

> 给下一个会话的 Claude / Codex:本文件记录最近两次会话完成的工作、当前状态、待办。
> 项目全貌见 [CODEX-HANDOFF.md](./CODEX-HANDOFF.md)(架构/命令/红线都在那里,本文件不重复)。

## 会话 A:手动上传元数据 + 一键补全(已 push,commit 91fa59d)

**问题**:只有"贴 BID 补传"路径会写回 name/beatmapId/beatmapsetId,手动拖 .osz / 3文件上传不写。

**已完成**:

1. **手动上传也写元数据** — [src/components/admin/MapUploader.tsx](src/components/admin/MapUploader.tsx)
   - `parseOsuMeta` 新增提取 `BeatmapID`/`BeatmapSetID`(.osu `[Metadata]` 段自带,无需 osu API)
   - 四条上传路径全部透传 `meta`(单 .osz / 3文件 / 多难度手选 / 自动下载含整轮批量)
   - 上传成功后进**现有跨轮暂存池**:只补 JSON 缺失字段,绝不覆盖已有值;NSV 不重复暂存
   - 底部"保存全部并重建"统一一次 commit
2. **一键补全存量** — 按钮"补全元数据 (n)"(MapUploader 标题栏)
   - n = R2 有文件但 JSON 缺 name 或 BID 的 slot 数
   - 新后端 `GET /api/maps/meta`([functions/api/maps/meta.ts](functions/api/maps/meta.ts)):R2 **range 读** zip 中央目录 + 单个 .osu(Workers 原生 `deflate-raw`),不下载整个 .osz;contributor+;单批 ≤500 slot
   - 前端分批 80/批,跑完给摘要(完整 X / 仅曲名 Y=未上传谱 BID≤0 / R2 无文件 Z)
   - i18n key 在 messages.zh/en.ts 的 `mapUpload.backfill.*`

## 会话 B:SSR SF/F round id 撞车事故(代码已 push,见下)

**现象**:传 SF 的 LN1 会把 F 的 LN1 也"传上";F 轮数据是 SF 的复制品。

**根因**:SF 和 F 两个 round 的 `id` 都是 `round-8`(TournamentForm `addRound` 用 `rounds.length+1` 生成 id 不查重)。后果:
- R2 key `maps/{tid}/{rid}/{slot}.osz` 撞车 → 上传互相覆盖
- 按 `roundId/slot` 定位的元数据补丁写串 → F 数据被 SF 吞
- 时间线:08-12 数据对 → 08-13 F 被 SF 覆盖 → 08-25 修对 → 09-01 再被覆盖 + 失败行触发"清空 BID"清掉 F LN1

**已完成(全部已验证 tsc 通过)**:

| 文件 | 改动 |
|---|---|
| [data/tournaments/solo-score-rush.json](data/tournaments/solo-score-rush.json) | F `id: round-8 → round-8-f`;F 16 张 + SF LN1 从 git 历史(94ae6bc / 0ff3de9)恢复。**终验:SF/F 各 16 张 BID 与用户清单逐张一致** |
| [src/components/admin/TournamentForm.tsx](src/components/admin/TournamentForm.tsx) | `addRound` 取未占用最小序号,不再撞 id |
| [src/components/admin/RealTypeConflictChecker.tsx](src/components/admin/RealTypeConflictChecker.tsx) | 体检页顶部红色警示:全库扫重复 round id(`findDuplicateRoundIds`) |
| [functions/api/_lib/roundIds.ts](functions/api/_lib/roundIds.ts)(新) | 服务端校验辅助 |
| [functions/api/tournaments/batch.ts](functions/api/tournaments/batch.ts) + [functions/api/tournaments/[id].ts](functions/api/tournaments/[id].ts) | **保存端硬校验**:重复 round id → 400 拒绝 |
| [scripts/fix-ssr-r2.js](scripts/fix-ssr-r2.js)(新) | R2 搬移:下载 `round-8/` 每个 .osz 解内部 BeatmapID,属 F 的 CopyObject+Delete 到 `round-8-f/`;被顶掉的先备份 `.orphan-<ts>` 绝不覆盖;默认 dry-run,`--apply` 执行 |
| [.github/workflows/maintenance.yml](.github/workflows/maintenance.yml)(新) | 手动 workflow "R2 Maintenance",下拉选脚本跑(本地无 R2 凭证,secrets 在 Actions 里) |

## ⚠ 当前状态与下一步(按顺序)

1. **push 状态见下**(正在推;若本文件已随 commit 一起出现在仓库,说明 push 成功)
2. **用户操作**:GitHub → Actions → **R2 Maintenance** → Run workflow(默认 fix-ssr-r2.js)→ 日志里核对搬移计划(MOVE/KEEP/SKIP)
3. 跑完 → admin 上传页刷新 SSR,核对 SF/F 勾选状态
4. SF/F 的 .osz 若此前被互覆盖错,重新"自动下载"补传(id 已分开,不会再串)
5. 可选:R2 上历史孤儿(如有)看 `.orphan-*` key

## 遗留待办(更早会话积累,均未动手)

- **全量合包待跑**:R2/Drive 包内 Title/Creator 仍旧名;Actions → Generate Map Packs → realType 留空(会断已下载玩家成绩,用户已知悉)
- **三方案(成绩 hash 断链)**:冻结名/去来源/维持现状 —— 用户拍板"先不改",勿主动实施
- **难度精度 toFixed(1)→(2)**:方案已定(数据层 8 处),待执行
- **GITHUB_TOKEN 2026-11 到期**:届时 CF 后台三 tab 数据全空 = token 失效,换 token + Retry
- **GM realType**:已注册,待录入含 GM 的比赛后才会出包(poolTemplates 未加 GM 模板)
- `tsconfig.tsbuildinfo` 是构建产物却被 git 跟踪,每次 tsc 都脏工作区,建议下次顺手 `git rm --cached` + .gitignore

## 安全红线(每次会话都要遵守)

- 绝不提交密钥、绝不回显密钥值,只用环境变量名
- main 直推是惯例(push 被拒 = fetch + rebase origin/main 再推)
- 遇比赛 JSON 数据问题:先 `git log -p` 挖历史,历史里往往有正确版本(SSR 这次就是靠 94ae6bc/0ff3de9 恢复的)

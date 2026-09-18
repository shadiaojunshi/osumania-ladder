# 批量补全谱面元数据（一次提交 = 一次构建）

> 目的：把全库缺失的 `beatmapId` / `beatmapsetId` / `name` 一次补齐，**不要一个比赛改一次**。
> 工具已经存在（`scripts/backfill-bid.mjs`），本文只是一份可直接照做的操作单。

## 1. 为什么需要「批量」

比赛 JSON 一旦提交就会触发重建。过去补元数据的做法是在后台「上传页 → 手传回填」逐个比赛做，
每个比赛一次保存 = 一次提交 = 一次构建。全库有 36 个比赛有缺口，那就是 36 次重建。

`scripts/backfill-bid.mjs` 把这件事变成**一趟扫描 → 一次写回 → 一次提交**。

## 2. 当前缺口（2026-09-18 实测，只读统计）

全库 4935 张谱面：

| 缺失项 | 数量 |
|---|---|
| 没有 `name` | 119 |
| 没有可用 `beatmapId` | 262 |
| 没有可用 `beatmapsetId` | 307 |

分布在 **36 个比赛**，最集中的几个：

| 比赛 | 总图 | 缺 name | 缺 BID | 缺 setId |
|---|---|---|---|---|
| ASC 2025 | 88 | 0 | **88** | **88** |
| MKTC 2025 | 89 | 1 | 33 | 37 |
| 4DM2023 | 98 | 0 | 24 | 24 |
| KET2 | 78 | 22 | 22 | 22 |
| MWC 4K 2025 | 97 | 7 | 7 | 7 |
| MCNC 4K 2025 | 110 | 0 | 7 | 7 |
| o!mLN4 | 110 | 9 | 9 | 9 |

> 「可用」按 `src/lib/beatmapIds.ts` 判读：**0 / 1 / 负数 / 非整数一律视为没有 ID**
> （占位 ID 不是身份，见 R33）。

## 3. 前置条件

需要 R2 凭据（**只读用**，回填本身只写本地 JSON）：

```bash
export R2_ACCOUNT_ID=<你的 account id>
export R2_ACCESS_KEY=<access key>
export R2_SECRET_KEY=<secret key>
export R2_BUCKET=osumania-ladder-maps      # 省略时默认就是这个值
```

缺任意一个，脚本会直接报错退出，不会做任何事。

## 4. 操作步骤

### 第 1 步：dry-run（默认行为，不写任何文件）

```bash
node scripts/backfill-bid.mjs
```

它会遍历所有比赛的每一张图、从 R2 拉对应的 `.osz`、读出 `.osu` 里的元数据，
但**只打印报告**。结尾会输出：

```
可回填 BID:        N  (name 补 x，覆盖占位 y)
未上传谱(占位/缺 BID): N  → 需手动处理
R2 无文件:         N  → 需重传或确认
解析出错/无.osu:   N
详细报告: <repo>/backfill-bid-report.json
这是 DRY-RUN，未写任何文件。确认无误后加 --apply 实际回填。
```

**先看第 2 行和第 3 行**：「未上传谱」和「R2 无文件」这两类是**补不了的**（见 §6），
如果它们的数量远超预期，说明还有一批图没传上去，回填解决不了。

### 第 2 步：写回

```bash
node scripts/backfill-bid.mjs --apply
```

结尾会打印 `已写回 N 个 JSON 文件，回填 M 个 beatmapId。`

### 第 3 步：核对 diff

```bash
git diff --stat -- data/tournaments
git diff -- data/tournaments/<抽查一个>.json
```

**期望看到的**：只有 `beatmapId` / `beatmapsetId` 变成具体数字、空 `name` 被填上曲名；
`difficulty`、`realType`、`slot`、`rounds` 结构**一个字都不变**。

### 第 4 步：一次性提交

```bash
git add data/tournaments
git commit -m "Backfill map metadata (beatmapId / beatmapsetId / name) for all tournaments"
git push
```

到这里为止是**一次构建**。`backfill-bid-report.json` 是本地报告，**不要加进这次提交**
（它不在 `.gitignore` 里，注意 `git add` 时别用 `-A`）。

## 5. 脚本的写回保证（只增不改）

- **只对「`beatmapId` 不可用」的图生效** —— 缺失**或占位**（0/1/负数/非整数）都算不可用；
  已经有可用 BID 的图一个字节都不动。
- **只写三个字段**：`beatmapId`、`beatmapsetId`（读不到可用值时就不写）、以及
  `name`（**仅在为空或等于 slot 名时**补真实曲名，不覆盖已有的真实名）。
- **`difficulty` 是人工评级，绝不触碰**；其它字段也一律不动。
- **保留原换行**：比赛 JSON 是 CRLF，写回时按原风格拼装，不会把整个文件重排。
- **不猜不删**：R2 没文件、或 `.osu` 里 `BeatmapID` 是占位/缺失 → 跳过并列进报告。

## 6. 补不上的部分及后续

| 报告分类 | 含义 | 怎么办 |
|---|---|---|
| 未上传谱（`unsubmitted`） | R2 里有 `.osz`，但里面的 `.osu` 的 `BeatmapID` 是占位或缺失 | 这张图需要**重新上传一份正常的 `.osz`** |
| R2 无文件（`noFile`） | JSON 里有槽位，但 R2 里根本没有对应对象 | 需要**重传**该槽位 |
| 解析出错（`errored`） | 下载/解压/解析失败 | 看报告里的 `status`，多半是对象损坏 |

这三类都要走上传页重传 —— 那是唯一必须逐张处理的路径，回填帮不上。

## 7. 顺带说明

- 脚本没有「只处理某一个比赛」的开关，**`--apply` 是全库**。这也正是想要的行为：
  一次写完、一次提交。
- 回填后 `beatmapId` 可用率上升，直接受益的是两件事：
  **「同一 BID 被多个槽位复用」的检测**（键型谱面的 `!` 标记）和**合包去重**
  （有 BID 的图走 `bid:` 这条不依赖元数据的合并路径，比元数据指纹可靠）。
- 全部 4935 张都补完之后，还有约 4.8%~5.3% 的槽位没有可用 BID（那批就是上面第 6 节的三类）。

## 8. 没有本地凭据时：走 Action

上面第 3~4 步要求本地有 R2 凭据。如果没有（或者不想在本地 export 密钥），
照 `.github/workflows/identity-report.yml` 的样子做一个 workflow 即可，形态建议是：

1. **先只跑 dry-run**（不加 `--apply`），把 `backfill-bid-report.json` 作为 artifact 上传、
   并把统计打进 job summary —— 这一步不写任何数据，跟只读体检一样安全。
2. 确认数字无误后，再跑 `--apply` 的版本。**这一步会改 `data/tournaments/*.json`**，
   所以它应当：只 `git add data/tournaments`（别用 `-A`，否则会把报告文件一起带进去）、
   提交信息写清是自动回填、push 冲突时按 `generate-packs.yml` 那套 rebase 重试、**禁 force push**。

⚠️ 与只读体检的一个关键差别：`--apply` 会改**比赛数据**，一次提交同时触发站点重建。
建议第一次只在单个类型/单场先验证，再全库跑。

# 保存冲突自动合并 设计文档

日期：2026-09-13
状态：待评审

## 问题

admin 保存比赛 JSON 走乐观锁：打开编辑时记下服务器上的 blob `sha`（`editingSha`），保存时原样回传，服务端 PUT 给 GitHub。文件在编辑期间被别处更新过，GitHub 返回 409，前端只看到「编辑基准已过期」。

触发这个的场景几乎都是**日常录入本身**：

- 上传器贴 BID 回填曲名 / `beatmapId` / `beatmapsetId` 时，会自己 GET 最新 sha 再 PUT（[MapUploader.tsx:332-348](../../../src/components/admin/MapUploader.tsx#L332-L348)），所以它永远成功，但它不通知父页面；
- 表单手里的 `editingSha` 于是过期，下一次保存必然 409。

**关键在于冲突的根源不是 sha，而是表单手里那份数据比服务器旧。** 所以「把基准换成最新再保存」（当前的一键按钮）只是让保存能通过，它会用整份旧内容覆盖整个文件 —— 上传器刚回填的曲名会被写空。冲突从「报错」变成「静默丢数据」。

## 目标

- 保存时把「你改过的字段」和「服务器上别处改过的字段」合到一起，用户无感完成。
- 同一字段两边都改（真冲突）**绝不自动选边**，一定摆给用户看。
- 单条保存和批量保存两条路径都覆盖。

## 非目标

- **不做上传器的主动同步**（已确认：合并已覆盖其效果，省掉跨组件的 state 传递）。
- 不做服务端合并：base 快照只存在于浏览器里。
- 不做多人实时协同、加锁、在线状态。

## 核心：`src/lib/tournamentMerge.ts`

纯函数，无 React / 无网络依赖，可完整覆盖测试。

```ts
export interface FieldConflict {
  path: string      // 人可读定位，如 "Round of 32 · FU1 · name"
  roundId: string
  slot?: string
  field: string
  base: unknown
  mine: unknown
  theirs: unknown
}

export interface FollowNote {
  path: string
  value: unknown    // 服务器上的新值
}

export interface MergeOutcome {
  merged: Tournament
  followed: FollowNote[]   // 你碰过没、自动采用服务器值的字段
  conflicts: FieldConflict[]
}

export function mergeTournament(
  base: Tournament | null,
  mine: Tournament,
  theirs: Tournament,
): MergeOutcome
```

### 逐字段规则

| `mine` vs `base` | `theirs` vs `base` | 结果 |
|---|---|---|
| 相同 | 相同 | 取 `mine`（无变化） |
| 相同 | 不同 | 取 `theirs`，记入 `followed` |
| 不同 | 相同 | 取 `mine` |
| 不同 | 不同且 `mine === theirs` | 取 `mine`（殊途同归） |
| 不同 | 不同 | 记入 `conflicts`，`merged` 暂取 `mine` |

真冲突时 `merged` 取 `mine` 是刻意的保守选择：**带冲突的 `merged` 不允许被写进服务器**，只有用户裁决后才提交。

### 配对规则

- `rounds`：**按 `id` 配对**。比按数组下标稳 —— 服务器在中间插一轮不会让后面全部错位。
- `round.maps`：按 `slot` 配对。
- 顶层标量（`id` / `name` / `abbreviation` / `keyCount` / `year` / `priority` / `forumUrl` / `wikiUrl` / `sheetUrl`）：直接按上表。
- `tags` / `customTypes`：整体当一个值比较，不做集合级合并。
- 其余嵌套对象（`round.difficulty`、`typeDifficulties`、round 自身的标量）递归一层。

两个键都有全量数据背书：2026-09-13 扫描 51 个文件 / 352 轮，`round.id` 与轮内 `slot` 均无重复。万一将来出现重复（手改 JSON、第三方脚本），同键的按出现顺序逐个配对即可，**不要退化成按数组下标配对** —— 那会让一次 round 插入变成大面积错位。

### 相等判断必须与键顺序无关

不能直接用 `JSON.stringify` 比较：`{a:1,b:2}` 和 `{b:2,a:1}` 串不同但语义相同，会把「服务器只是重排了键」误判成改动，进而制造大量假冲突。需要一个递归的 `deepEqual`（对象比键集合 + 逐键递归，数组按序逐项）。

`undefined` 与「字段缺失」视为相等 —— 这正是想要的语义：`{name: undefined}` 和 `{}` 在 JSON 里没有区别。

### 安全网

合并结果照旧走服务端 `validateTournament`（R03）和 GitHub 提交，所以有 bug 的合并最坏是被挡住报错，不会写坏线上数据；每次保存仍是一次带 message 的 commit，历史可查。但注意校验只管格式合法，**语义正确性完全由这个纯函数负责** —— 测试要覆盖到那张规则表的每一格。

## 接入点 A：单条保存 `handleSubmit`

现状（[page.tsx:226-235](../../../src/app/admin/page.tsx#L226-L235)）：PUT → 失败即抛错。

新流程：

```
PUT(submitted, editingSha)
 ├─ ok            → 现有成功分支
 ├─ 409/EDIT_CONFLICT →
 │    latest = fetchAuthoritative(editingId)
 │    outcome = mergeTournament(editingBaseline, submitted, latest.tournament)
 │    ├─ conflicts 为空 →
 │    │      PUT(outcome.merged, latest.sha)   // 只重试一次
 │    │        ├─ ok    → 成功分支（内容用 merged），额外提示 followed 清单
 │    │        └─ 失败  → 报错并指出可用「以最新版本为基准继续」手动处理
 │    └─ 有冲突 → 显示冲突清单，保留现有手动按钮
 └─ 其他错误 → 现有行为
```

### 需要小心的几处

- **`editingBaseline` 为 `null`**（legacy 草稿、无基准）→ 不合并，直接走现有报错路径。
- **只重试一次**，避免并发下的循环。
- **`submittedJson` / `unchanged` 的语义要拆开**。第 254 行的 `unchanged` 判断的是「提交请求期间用户有没有新输入」，它必须仍然拿 `tournament` 和**用户点保存那一刻的 `submitted`** 比，不能被合并结果污染。
  但 `setEditInitialData` / `setEditingBaseline` 要用**最终写入服务器的内容**（有合并就是 `merged`），否则表单显示的和服务器的对不上。
- `handleRefreshBase`（一键换基准）**保留**，语义是「我就想用我这份整个覆盖服务器」。它只换 `sha` 不动 `editingBaseline`，正是强制覆盖该有的行为。

## 接入点 B：批量保存 `handleSubmitStaged`

现状（[page.tsx:348-372](../../../src/app/admin/page.tsx#L348-L372)）：`/api/tournaments/batch` 原子提交，409 时返回 `conflicts`（带 reason）。

新流程：

- 409 且冲突项 **`reason === 'modified'`** 的 id → 对每个拉最新 + 用 `entry.baseline` / `entry.data` 做合并。
- 只要有一个 id 出现真冲突 → 不自动提交，走现有 `conflicts` UI。
- 全部无真冲突 → 用合并后的内容 + 各自最新的 `baseSha` 重新提交整批（只重试一次）。
- `missing` / `exists` / `head-moved` 三种 reason 不自动处理（它们不是「内容撞车」）。

## UI

- **自动合并成功**：`submitStatus` 用 `local`（蓝），文案列出 `followed`（最多 5 条 + 「等 N 处」），让人知道服务器上哪些字段被保留进来了 —— 不静默。
- **真冲突**：红色列出冲突项（定位 / 你的值 / 服务器值）+ 保留现有「以最新版本为基准继续」。

新增文案 key（zh/en 各一份）：`admin.merge.applied`、`admin.merge.conflictHeader`、`admin.merge.yours`、`admin.merge.theirs`。

## 测试

`scripts/tournament-merge.test.mjs`：

- 三方规则表逐格一个用例（含 `mine === theirs` 那格）。
- 键顺序无关（同一个对象换键序不算改动）。
- round 配对：按 `id` 配对；某轮被服务器插到中间或整轮删掉时不错位；同 id 重复时按出现顺序配对。
- maps 按 `slot` 配对；某轮新增/删除槽位。
- `undefined` / 缺失字段的等价性。
- 真冲突：`merged` 取 `mine`、且 `conflicts` 精确定位到 round + slot + field。
- 「上传器回填曲名 vs 用户录难度」的典型场景用内联 fixture 覆盖，断言零冲突且两边改动都保住 —— 不依赖会变的真实数据。
- 真实数据冒烟：对 `data/tournaments/` 里每个文件跑一次 `mergeTournament(t, t, t)`，断言零冲突且 `merged` 与 `t` 深相等（顺带验证 `deepEqual` 不会凭空造出假冲突）。

保存路径的编排逻辑（何时重试、用什么内容重试）抽成纯函数（如 `planConflictRecovery`）单独测，不靠组件测试覆盖。

## 分阶段实施

1. **合并函数 + 测试** —— 纯逻辑，无 UI 风险。
2. **接入单条保存** + 提示文案。
3. **接入批量保存**。

每阶段跑 `npm test` + `tsc --noEmit`（两个 tsconfig）+ `npm run build`。

## 影响面

| 文件 | 改动 |
|---|---|
| `src/lib/tournamentMerge.ts` | 新增 |
| `scripts/tournament-merge.test.mjs` | 新增 |
| `src/app/admin/page.tsx` | `handleSubmit` / `handleSubmitStaged` 的 409 分支 |
| `src/components/admin/JsonPreview.tsx` | 冲突清单渲染（复用现有 `conflicts` 区块） |
| `src/lib/messages.zh.ts` / `messages.en.ts` | 4 个 key |

服务端不动：`functions/api/tournaments/[id].ts` 已经返回 `code: 'EDIT_CONFLICT'`，足够前端识别。

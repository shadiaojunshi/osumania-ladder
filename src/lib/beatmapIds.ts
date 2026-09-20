// osu! 的 beatmapId / beatmapsetId 判读 —— **前端这一侧**的实现。
//
// 后端有一份逐字对齐的镜像：`functions/api/_lib/beatmapIds.ts`（`functions/` 与 `src/`
// 是两条独立构建，跨边界 import 没有先例）。两份靠 `scripts/beatmap-ids-backend.test.mjs`
// 锁住一致 —— **改这里必须同时改那边**，否则 `/api/maps/meta` 的口径会和界面漂移
//（那条路径上的占位 setId 会被「一键补全」写回比赛 JSON）。
//
// 为什么需要它（2026-09-18 站长反馈）：
//   MKTC 2025 的一批谱面是从 Malody 的 `.mcz` 转成 `.osz` 的，转换器在 `[Metadata]` 里
//   写了**占位 ID**（`BeatmapSetID:1`，`BeatmapID` 为 0/空）。上传时的解析只过滤
//   `> 0`，于是 `1` 被当成真 set id 写进了比赛 JSON —— 实测 **36 张不同歌曲的谱面
//   共用 `beatmapsetId = 1`**。后果不是一个显示问题：
//     ① 键型冲突工具把它们整批归成一组「同 set 待核对」，真实的键型冲突被淹掉；
//     ② 上传页每一行的「下载」按钮是**按 setId 下载**的 —— 会去下载 beatmapset 1
//        （完全无关的图），版本对不上最坏会上传错文件；
//     ③ 误标检测的「同 beatmapset 共识」信号被污染。
//
// 口径：**0 / 1 / 负数 / 非整数 / 非数字 一律视为不可用**（占位或未提交）。
//   osu! 自身用 `-1` 表示未提交；`0` 与 `1` 是各类转换器/模板的常见默认值。
//   实测（2026-09-18，部署站 50 场比赛 4715 张谱面）：`<= 10` 的 set id 只出现过这个
//   `1`，其余真实 set id 都在十万级以上 —— 所以这个阈值不会误伤任何真实数据。

/** 小于等于这个值的 ID 一律当成占位/未提交（0、1、-1 都不可用）。 */
export const PLACEHOLDER_ID_MAX = 1

/** 判断一个 ID 能不能当"真实 ID"用。 */
export function isUsableBeatmapId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > PLACEHOLDER_ID_MAX
}

/** 能用的 id → 原样返回；占位/缺失 → null（调用方按"没有 id"处理）。 */
export function usableBeatmapId(value: unknown): number | null {
  return isUsableBeatmapId(value) ? value : null
}

export function usableBeatmapsetId(value: unknown): number | null {
  return isUsableBeatmapId(value) ? value : null
}

/**
 * 这个 `name` 到底有没有曲名信息?**等于槽位名就说明没有**（占位名）。
 *
 * 为什么要有这个判断（2026-09-20 站长反馈的「小字」bug）:
 *   站长把一张 BID 错的谱面换成"官网查不到的谱面"时,先用一个不存在的 BID 让
 *   osu 返回 not found,再点「暂存本轮」→ 补丁是 `{name:null, beatmapId:null,
 *   beatmapsetId:null}`(清空)。但提交阶段 `isPresent` 把占位名 `"RC9"` 当成
 *   **已有值**,于是 origin='fill' 的写路径一律跳过它 —— 清空永远不生效,行上的
 *   小字消除不掉。而占位名往往就是 `slot` 本身(MWC 2023 那批是 `"RC1"`/`"SV1"`),
 *   所以这里用 `name === slot` 就能识别出来。
 *
 * 与 `scripts/backfill-bid.mjs` 的口径**基本一致但有一处差别**:那边比较前先
 * `.trim()`(离线脚本,宽松些无妨),这里**不 trim** —— 多一个空格就是另一个值,
 * 界面上的判读宁可严一点。另有第三套更宽的口径在 `src/lib/tournamentDiagnostics.ts`
 * (`/^[a-z]{1,4}\d{1,3}$/`,用来忽略"name 写成了槽位记号"的身份键),它连
 * `slot: "ST1"` / `name: "SV1"` 那种"记号但不与 slot 同名"也覆盖 —— 那批(ASC 2025
 * 资格赛 8 处)**这三处判读里只有它够得到**。三套口径各自的用途不同,别当成一处改。
 *
 * 有一道 **slot 守卫**:`slot` 不是非空字符串时一律返回 `false` —— 没有可比对的
 * 槽位名,就构不成"等于槽位名"。这顺带堵死了 `undefined === undefined` 那个坑,
 * 调用方**不需要**为了这个再额外判空(`hasRemoteValue` 那里本来就先过了 `isPresent`,
 * 空名第一关就返回"没有"了)。
 */
export function isPlaceholderName(name: unknown, slot: unknown): boolean {
  if (typeof slot !== 'string' || slot === '') return false
  return name === slot
}

/**
 * 从 `Artist - Title [Version]` 里取 `artist - title`（小写），
 * 用来判断"同一个 setId 下的谱面是不是同一首歌"。
 * 取不到（没名字 / 只有版本号）时返回 null。
 */
export function songKeyOf(name?: string | null): string | null {
  if (typeof name !== 'string') return null
  const head = name.split('[')[0].trim().toLowerCase()
  return head === '' ? null : head
}

/**
 * 同一个 setId 下出现这么多首**不同**的歌，就判定这个 id 本身不可靠。
 *
 * 取 3 而不是 2：同一套图的不同难度，名字里的 artist/title 偶尔写法不同
 * （补 `feat.`、`(Cut Ver.)` 之类），2 首还可能是这类噪声；到 3 首就基本只可能是
 * 占位 ID 把无关谱面粘在了一起（MKTC 那组是 36 首）。
 */
export const SET_ID_UNRELIABLE_SONG_COUNT = 3

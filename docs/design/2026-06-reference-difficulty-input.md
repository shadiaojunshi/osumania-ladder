# 2026-06 参考点公式难度输入 — 实施 plan

> 接续 [2026-06-batch-2.md 的 E 项](./2026-06-batch-2.md#L310-L386)。原设计文档把数据模型定为
> live-bound union (number | refRef),改谱面会同步飘到引用方。本 plan
> **简化为 resolve-at-save**:UI 端用参考算出数字落到 slot,存储仍是 plain number。

## 决议:Approach A (resolve-at-save)

| 项 | A: resolve-at-save (本 plan) | B: live-bound union (原设计) |
|---|---|---|
| Slot 存储 | `difficulty: number` 不变 | `number \| { kind:'reference', leftRefId, rightRefId, position }` |
| build 脚本 | 不动 | 要预算锡点 manifest 嵌入 generated |
| LadderView/HoverCard | 不动 | 每处读 difficulty 要走 helper |
| 锡点改了的扩散 | 不扩散(用户当时锁定的就是这个值) | 自动飘到所有引用方 |
| 工程量 | 1 PR, 约半天 | 1 PR, 2-3 天,牵连面广 |
| 备注 | UX 仍叫"参考",只是结果是不可变的快照 | 真·公式绑定 |

**理由:**
- 用户用 picker 的目的是**校准**,不是建立长期依赖。决定"这张图大约就是 MWC Ro32+1/3 那个难度"
  之后,如果半年后有人去改 MWC Ro32 某张图的难度,把所有引用此场的 slot 一起改才更**反直觉**。
- A 不动 JSON 数据模型,所有现有比赛文件保持兼容,GitHub diff 仍干净。
- A 不动 generate-tournaments / runtime helper,LadderView 一行不用改。
- A 单 PR 半天能落,B 至少 2-3 天且测试面大很多。

如果用户审 plan 时偏好 B,告诉我我换。

## 实施

### 1. 新文件: `src/lib/referenceData.ts`

纯函数 + 类型,从 `tournaments` 数组算出可用锡点。

```ts
import type { Tournament, Round } from './types'

export type RefType = 'RC' | 'HB' | 'LN' | 'SV' | 'TB'
export type RefField = 'rf' | 'ln'

export interface RefRound {
  tournamentId: string
  tournamentAbbr: string
  year: number
  roundId: string
  roundAbbr: string
  roundOrder: number
}

// (tournamentId, roundId, type, field) -> avg or null
export function getRefValue(
  tournament: Tournament,
  roundId: string,
  type: RefType,
  field: RefField
): number | null

// 列出所有"该 round 至少有一张目标 type 谱面"的 round
export function listEligibleRounds(
  tournaments: Tournament[],
  type: RefType,
  field: RefField
): RefRound[]

// 同比赛的下一轮(若同类型还有数据)
export function nextRoundInTournament(
  tournament: Tournament,
  roundId: string,
  type: RefType,
  field: RefField
): RefRound | null

// 三等分插值
export function interpolate(left: number, right: number, position: 0|1|2|3): number
```

`getRefValue` 优先读 `round.typeDifficulties[type][field]`(由 RoundEditor summary 模式或自动算
落下来的),fallback 到该 round 中该 type 谱面的 `difficulty` / `difficultyLn` 平均值。
两者都 0 返回 null。

### 2. 新组件: `src/components/admin/DifficultyRefPicker.tsx`

可复用的小按钮 + 弹出层,挂在任意 difficulty number input 旁边。

**入口按钮:** input 右侧一个小图标按钮 📊 (尺寸跟 input 同高)。点击展开 popover。

**Popover 内容:**

```
┌─ Reference difficulty ─────────────────┐
│ Tournament: [MWC 2024 (4DM 2024)  ▾]   │  ← 全 tournaments 倒序
│ Type:       [RC] [HB] [LN] [SV] [TB]  │  ← 默认当前 slot type
│                                         │
│ Left round:  [Ro32 ▾]                   │  ← 仅列含目标 type 的 round
│ Right round: [Ro16 ▾]                   │  ← 默认下一个含目标 type 的 round
│                                         │
│ Position:                               │
│ ( ) Ro32       (left)                   │
│ (●) Ro32+1/3                            │
│ ( ) Ro32+2/3                            │
│ ( ) Ro16       (right)                  │
│                                         │
│ Preview: ≈ 7.83                         │
│                                         │
│ [Cancel]              [Apply 7.83]      │
└────────────────────────────────────────┘
```

**props:**
```ts
interface Props {
  // 当前数值, 用于回填
  value: number
  // 写回数值
  onChange: (n: number) => void
  // 目标 type, 控制 picker 默认选中和过滤(传'auto'时按当前难度上下文猜)
  type: RefType
  // 'rf' / 'ln' — HB 双值 slot 用两个 picker, type='HB' field='rf' 一个, type='HB' field='ln' 另一个
  field: RefField
  // 可选: 隐藏当前 slot 所在的 (tournamentId, roundId, type) 防止自引用
  excludeRef?: { tournamentId: string; roundId: string; type: RefType }
}
```

**行为细节:**
- 点 Apply 把计算后的数字 `+(...).toFixed(1)` 写回,popover 关闭
- 选 Position=0/3 (端点)时,Apply 直接是该 round 的值
- Left/Right round 选同一个时,position 控件禁用且只能 0
- 选了一组 left/right 后,如果某个 round 在切换 type 时不再含该 type,自动选下一个合法的
- popover 用绝对定位,点遮罩或 Esc 关闭(不需要 portal,简单实现就够)

### 3. 改 `src/components/admin/MapSlotEditor.tsx`

在 [L188-L216](../../src/components/admin/MapSlotEditor.tsx#L188-L216) 难度输入区:

- RC / SV / LN: 主 difficulty input 旁加一个 `<DifficultyRefPicker>`
- HB / TB / SPECIAL: 主 difficulty(rf) 一个,difficultyLn(ln) 一个,各加各的 picker

picker 的 `excludeRef` 不传(MapSlotEditor 是新建/编辑流程,正在编辑的 round 还没有 id 落定,
不易判定"自引用";让用户自己注意,UI 不强制防御)。

### 4. 改 `src/components/admin/RoundEditor.tsx` summary 模式

[L252-L275](../../src/components/admin/RoundEditor.tsx#L252-L275) 的 summary 模式有 5 类按 type
的平均 difficulty 输入(rc / hbRf / hbLn / ln / sv)。各 input 旁也加 picker。
非 summary mode (perMap) 不动 — perMap 模式靠 MapSlotEditor 落地。

跳过 min/max 输入(参考点机制对应的是均值,min/max 是用户自己在的范围,picker 不适用)。

### 5. i18n 文案

`src/lib/messages.zh.ts` 加段(在 ReferencesEditor 段之后,TournamentForm 段之前):

```ts
// ---------- DifficultyRefPicker ----------
'refPicker.button': '参考',
'refPicker.title': '参考点选择',
'refPicker.tournament': '比赛',
'refPicker.type': '键型',
'refPicker.leftRound': '左锡点 (低难度端)',
'refPicker.rightRound': '右锡点 (高难度端)',
'refPicker.position': '位置',
'refPicker.position.left': '{round} 本身',
'refPicker.position.third1': '+1/3',
'refPicker.position.third2': '+2/3',
'refPicker.position.right': '{round} 本身',
'refPicker.preview': '预览: ≈ {value}',
'refPicker.previewNoData': '无数据',
'refPicker.apply': '应用 {value}',
'refPicker.cancel': '取消',
'refPicker.noRounds': '此比赛没有 {type} 数据',
```

`src/lib/messages.en.ts` 对应:

```ts
'refPicker.button': 'Ref',
'refPicker.title': 'Reference picker',
'refPicker.tournament': 'Tournament',
'refPicker.type': 'Type',
'refPicker.leftRound': 'Left anchor (lower)',
'refPicker.rightRound': 'Right anchor (higher)',
'refPicker.position': 'Position',
'refPicker.position.left': '{round} (left)',
'refPicker.position.third1': '+1/3',
'refPicker.position.third2': '+2/3',
'refPicker.position.right': '{round} (right)',
'refPicker.preview': 'Preview: ≈ {value}',
'refPicker.previewNoData': 'No data',
'refPicker.apply': 'Apply {value}',
'refPicker.cancel': 'Cancel',
'refPicker.noRounds': 'No {type} data in this tournament',
```

### 6. 校验 / 构建

- `npx tsc --noEmit`
- `npm run build` (Next.js 16 Turbopack)
- 主页 `npm run dev` 跑一遍, 在 admin 新建 / 编辑流程里:
  - 进 RoundEditor → MapSlotEditor → 一个 RC slot 旁点 "参考"
  - 选 4DM2023 / Qualifiers → 切到 RC → 选 Round 1 / Round 1 (同轮自引用,position 不可选)
  - 选 Round 1 / Round 2 → 选 +1/3 → Apply → number 落进 input
  - HB slot 测两个 picker 互不干扰
  - summary 模式下在 RC avg 输入旁点 picker → 同样 work

## 文件改动总览

| 文件 | 改动 | 行数估 |
|---|---|---|
| `src/lib/referenceData.ts` | 新建 | ~80 |
| `src/components/admin/DifficultyRefPicker.tsx` | 新建 | ~200 |
| `src/components/admin/MapSlotEditor.tsx` | difficulty 输入旁加 picker | +20 |
| `src/components/admin/RoundEditor.tsx` | summary mode 5 个 input 旁加 picker | +25 |
| `src/lib/messages.zh.ts` | i18n | +14 |
| `src/lib/messages.en.ts` | i18n | +14 |
| `src/lib/i18n.ts` | MessageKey 联合类型自动扩展 | 0 (TS 自动) |

无 schema/JSON/data/scripts 改动。无 Pages Functions 改动。

## 提交

单个 commit:
```
feat(admin): 难度输入加参考点 picker
- referenceData.ts 锡点算法
- DifficultyRefPicker 组件
- MapSlotEditor / RoundEditor summary 模式集成
- i18n zh/en
```

push 后 Cloudflare Pages 自动部署。

## 已知不做(留给 follow-up)

- **跨比赛自引用防御** — A 方案算的是当时快照,不可变,所以理论上自引用不会"循环",
  最坏情况是用自身平均当锡点,值偏漂但不死循环。MVP 不防御。
- **锡点策展** — 原设计文档的"勾选 isReferenceRound"用来缩短列表。MVP 全列,
  按用户文档自己说的"以后做分组"。
- **HoverCard 显示锡点来源** — 原设计要"参考: MWC 2024 Ro32+ (≈ 7.33)"。A 方案落地是数字,
  无来源可显示。要做需先把元信息存到 slot(可选 field `_refOrigin: string`),不在本 plan。
- **跨键型引用** — picker 的 type 是 user 选的,不限制必须等于当前 slot 的 type;
  用户选了拿去用就行。

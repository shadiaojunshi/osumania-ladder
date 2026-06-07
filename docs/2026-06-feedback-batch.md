# 2026-06 用户反馈批量处理

> 收件:2026-06-07 群友测试反馈一批,共 7 项功能改动 + 1 项答疑(SNI 阻断,已口头答复,
> 不在本文档范围)。本文记录每项的范围、决策、关键改动、执行顺序。
> 每项做完单独 commit,做完一项勾一项。

## 优先级与执行顺序

按"工作量从短到长"排:**6 → 4 → 1 → 5 → 2 → 3 → 7(暂存)**。

| # | 标题 | 状态 |
|---|---|---|
| 6 | 上传格 hover `title=` 显示全名 | [x] 2026-06-07 |
| 4 | BulkImporter 加"按 Qual→GF 顺序"提示 | [x] 2026-06-07 |
| 1 | 每轮图池模式加常驻白边开关 | [x] 2026-06-07 |
| 5 | TB 双值,RF + LN 都参与计算/显示 | [x] 2026-06-07 |
| 2 | 同行重叠从 2-way 扩到 3/4-way | [x] 2026-06-07 |
| 3 | 响应式 (a):小窗 / 平板 / 手机 | [x] 2026-06-07 |
| 7 | i18n + 夜晚模式(暂存,不做) | — |

---

## #6 上传格 hover 显示全名

**问题:** [MapUploader.tsx](../src/components/admin/MapUploader.tsx) 行的 `name`
(`Artist - Title [Version]`)被 `truncate` 截断,且只在 `slot` 列旁边显示。
手动上传/补传时鼠标悬浮在 `.osz` 占位框 / 自动按钮 上,没法快速核对。

**改:**
- 现行已经有 `<span title={name}>` 在 [MapUploader.tsx:868](src/components/admin/MapUploader.tsx#L868),
  但只在 slot 名行可见。补到 `MapUploadCell` 里:
  - 自动下载按钮:`title` 当前是 `从镜像自动下载 set ... 的 [version]`,
    扩成包含 `Artist - Title [Version]`(从 `name` 派生,在 `MapUploadRow` 里
    顺手 props 透传 `name` 进 `MapUploadCell`)
  - 占位框 `placeholderText` 那个 div 加 `title={name || placeholderText}`,
    悬浮显示完整谱面名 + 难度名。
  - 已上传状态那一行(✓ 已上传 + ⟳ ✕ 按钮)整行加 `title={name}`,
    方便看清楚补传的是哪个版本。

**改动文件:** [src/components/admin/MapUploader.tsx](../src/components/admin/MapUploader.tsx)
**预计:** 5 行内。

---

## #4 BulkImporter 顺序提示

**问题:** 用户从主表格复制粘贴 slot+BID 到 [BulkImporter.tsx](../src/components/admin/BulkImporter.tsx)
时,不知道要先粘 Qualifiers 还是先粘 Grand Finals。当前默认从尾倒推命名
(GF/F/SF/QF/RO16...),所以**实际期望:从上到下按 Qual → ... → GF**。

但提示只写了"用空行分隔轮次"和"如果同一个 slot 再次出现,自动开新一轮",没说时间顺序。

**改:**
- [BulkImporter.tsx:352-356](src/components/admin/BulkImporter.tsx#L352-L356) 的
  `step === 'input'` 提示文案补一段:
  > **轮次顺序:** 从上往下按比赛进程贴 —— 先贴资格赛(Qualifiers),最后贴决赛(Grand Finals)。
  > 默认按淘汰赛从尾倒推命名(最后一轮 = GF,倒数第二轮 = F,以此类推)。
- 顺手把示例改成"两轮"中第二轮看起来更像 GF(slot 数少,典型决赛),让"顺序对应"更直观。

**改动文件:** [src/components/admin/BulkImporter.tsx](../src/components/admin/BulkImporter.tsx)
**预计:** 改 1 段 jsx + 1 个 placeholder 字符串。

---

## #1 常驻白边开关 (仅 round 模式)

**问题:** [globals.css:43-46](src/app/globals.css#L43-L46) 的 `.round-box:hover`
是白边 + 阴影,只有鼠标悬浮才出现。但用户想要"看 round 模式时所有框都常驻白边"
—— 视觉上更易区分相邻框。其他模式不需要。

**改:**
- [viewStore.ts](../src/stores/viewStore.ts) 加 `roundBorderAlways: boolean` + `setRoundBorderAlways`
- [ControlBar.tsx](../src/components/controls/ControlBar.tsx) 在 `hideQualifiers` 按钮旁边加一个
  `常驻白边: 开/关` 按钮,**仅在 `mode === 'round'` 时渲染**(借 `useViewStore` 拿 `mode`)
- [LadderView.tsx](../src/components/ladder/LadderView.tsx) 的 round 模式分支
  ([:382-401](src/components/ladder/LadderView.tsx#L382-L401))
  在 `round-box` className 上挂一个 `${roundBorderAlways ? 'always-border' : ''}`
- [globals.css](../src/app/globals.css) 加:
  ```css
  .round-box.always-border {
    box-shadow: 0 0 0 1.5px white, 0 1px 3px rgba(0, 0, 0, 0.15);
  }
  .round-box.always-border:hover {
    box-shadow: 0 0 0 2px white, 0 4px 12px rgba(0, 0, 0, 0.3);
  }
  ```
  hover 用更粗的白边 + 更大阴影,保留"悬浮反馈"的对比度。

**改动文件:**
- [src/stores/viewStore.ts](../src/stores/viewStore.ts)
- [src/components/controls/ControlBar.tsx](../src/components/controls/ControlBar.tsx)
- [src/components/ladder/LadderView.tsx](../src/components/ladder/LadderView.tsx)
- [src/app/globals.css](../src/app/globals.css)

**预计:** 单文件 5 行级 × 4 个文件。

---

## #5 TB 双值,RF + LN 都参与

**问题:** 当前 [LadderView.tsx:13-25](src/components/ladder/LadderView.tsx#L13-L25)
的 `isLnBased` 判定 LN/HB 类用 LN 难度;TB 不在内,完全走 RF 难度。
但 TB 实际曲风混杂,常常 RF + LN 都有,只看 RF 难度不准。

**用户选 C:** TB 也支持 RF+LN 双值,平均**两侧都参与**。

**改:**
- 数据层:`tournaments` 里的 TB 谱面已经有 `difficulty` 和可选的 `difficultyLn`
  (admin 里 `MapSlotEditor.tsx` 让用户填两个值)。无需改类型。
- [LadderView.tsx](../src/components/ladder/LadderView.tsx) 调整两处:
  1. round 模式的 `adjustedDiffs` 计算:对 TB 谱面,如果有 `difficultyLn`,
     **同时**贡献两个值:`difficulty`(RF 轴)和 `difficultyLn - rfLnOffset`(LN 轴)。
     做法:把 TB 单独走一个分支,push 两次。如果只有 `difficulty`,只 push 一次。
  2. type 模式的 `typeAvg` 计算:`type === 'TB'` 时,`typeAvg` 改成
     `(rfAvg + (lnAvg - rfLnOffset)) / 2`(LN 分量先减偏移再平均),
     **不**像 LN 类那样整体减 rfLnOffset。
- [HoverCard.tsx:132-139](src/components/ladder/HoverCard.tsx#L132-L139) 的 TB 分支
  已经写了 `getRfDanName(rfAvg) / getLnDanName(lnAvg)`,跟新逻辑天然一致,
  无需改。
- 验证:挑一场带 TB 的比赛(如 KET2 GF),改一张 TB 谱的 `difficultyLn`,
  确认 round 框范围 / type 框位置同时反映 RF 和 LN 难度。

**注意:** `type === 'TB'` 时 `isLnBased` 仍返回 false —— 不要改它,
否则别处把 TB 当纯 LN 处理会出错。新增逻辑只在 round 框算 min/max 和 type 框算 avg
两处特判 TB,其他地方维持旧行为。

**改动文件:** [src/components/ladder/LadderView.tsx](../src/components/ladder/LadderView.tsx)
**预计:** ~30 行改动,集中在两处计算分支。

---

## #2 同行重叠从 2-way 扩到 3/4-way

**问题:** type 模式下 [LadderView.tsx:429-441](src/components/ladder/LadderView.tsx#L429-L441)
的重叠分组只支持 2 个框平排,如果同一行有 3 个 type 难度都接近,
两个会被分到 idx=0,另一个 idx=1,但 `key` 是 `round.id-type` 唯一,
3-way 会在 Map 里互相覆盖,**最终只有最后一个 idx 会落到 hover 用,
导致鼠标悬浮显示的是错的那个 type**。

**改:**
- 重写 [LadderView.tsx:429-441](src/components/ladder/LadderView.tsx#L429-L441)
  的 `overlapGroups` 逻辑:
  ```ts
  // 改成:每个 box 一个 key,值是 { groupKey, indexInGroup, groupSize }
  // groupKey 用同行第一个 box 的 round.id-type 标记,同组所有 box 共享
  const overlapInfo = new Map<string, { idx: number; size: number }>()
  // 按 adjustedAvg 排序后线性扫,|diff|<0.05 的连成一组
  const sorted = [...allTypeBoxes].sort((a, b) => a.adjustedAvg - b.adjustedAvg)
  let i = 0
  while (i < sorted.length) {
    let j = i + 1
    while (j < sorted.length && Math.abs(sorted[j].adjustedAvg - sorted[i].adjustedAvg) < 0.05) j++
    const size = j - i
    if (size > 1) {
      for (let k = i; k < j; k++) {
        const key = `${sorted[k].round.id}-${sorted[k].type}`
        overlapInfo.set(key, { idx: k - i, size })
      }
    }
    i = j
  }
  ```
- 渲染时按 `idx / size` 算 left/right 百分比:
  ```ts
  const left = info ? `${(info.idx / info.size) * 100}%` : '4px'
  const right = info ? `${((info.size - info.idx - 1) / info.size) * 100}%` : '4px'
  ```
  3-way 就是三等分,4-way 四等分,更宽就更挤但至少不丢框。
- hover 还是按 `key` 唯一,每个框都有自己的事件,不会互相吞。

**注意:** 3-way 框宽度只有 ~33%,文本会被截更多;但 hover 弹 HoverCard 显示完整,
可以接受。 4-way 是顺手做的,不需要额外验证。

**改动文件:** [src/components/ladder/LadderView.tsx](../src/components/ladder/LadderView.tsx)
**预计:** 替换原来的 [:429-465](src/components/ladder/LadderView.tsx#L429-L465) 一段。

---

## #3 响应式 (a):小窗 / 平板 / 手机

**问题(用户附图):**
1. 手机上左 scale 栏(`width: 70px`)+ 右 reference 栏(`160px`)占了大部分横向空间,
   主区域被挤成一条窄竖线
2. 顶部 Header 和底部 ControlBar 横向元素超出屏宽,看不到右侧按钮(搜索框、
   下载合包、录入数据 等),也不能左右滑
3. 主区域本身的 zoom/pan 在手机上能正常用

**改(三块独立):**

**3a. 左右栏窄化(< 768px 断点)**
- [LadderView.tsx:176](src/components/ladder/LadderView.tsx#L176) 的 `LeftScaleInner`
  当前固定 70/110px。改成:在 `< 768px` 用 `38/68px`(`showBoth` 时),
  内部 label `font-size` 减 1px,`pl-2` → `pl-1`
- [LadderView.tsx:266](src/components/ladder/LadderView.tsx#L266) 的 `RightRefInner`
  `w-[160px]` → 在 `< 768px` 改 `w-[88px]`,文本截断更早(`truncate` 已经在,只少了宽度)
- 实现方式:走 Tailwind `max-md:` 前缀,不用 JS 检测窗口宽度

**3b. Header 横向滚动 + 换行(< 768px)**
- [Header.tsx:33](src/components/Header.tsx#L33) `h-14` 改成 `h-auto min-h-14 py-2`,
  `flex` 改成 `flex flex-wrap`(< 768px)/ `flex-nowrap`(>= 768px)
- 视图模式按钮组、type 筛选组、搜索/下载/录入入口组各自加 `flex-wrap` 的 wrap 边界
  (用 `gap-y-1` 控制行间距)
- 搜索框 `w-48` 在 `< 768px` 改 `w-32`
- "osu!mania 比赛谱面天梯榜"标题 `text-lg` → `< 768px` `text-base`,
  长度太长可考虑只显示 "osu!mania 天梯榜"

**3c. ControlBar 横向滚动(< 768px)**
- [ControlBar.tsx:37](src/components/controls/ControlBar.tsx#L37) `h-14` 改 `h-auto min-h-14 py-1`,
  外层 `flex` 加 `overflow-x-auto`,**或**改成 `flex-wrap` 双行
- 倾向于 `flex-wrap` —— 横向滚动有"按钮藏在右边看不到"的同样问题,而 ControlBar
  的几个分隔符 `<div className="w-px h-6 bg-gray-300" />` 在换行时变成水平分隔
  就不合适,要把分隔符在 < 768px 时 hide
- "osu!mania Ladder v0.1" 版本字段在 < 768px 时直接 hide(`max-md:hidden`)

**整体测试断点:**
- 手机(< 480px):验证主区域至少留 60% 宽
- 平板(768-1024px):验证 Header 单行不溢出
- 小窗 PC(800-1200px):验证 ControlBar 单行不溢出

**改动文件:**
- [src/components/Header.tsx](../src/components/Header.tsx)
- [src/components/controls/ControlBar.tsx](../src/components/controls/ControlBar.tsx)
- [src/components/ladder/LadderView.tsx](../src/components/ladder/LadderView.tsx)(LeftScaleInner / RightRefInner)

**预计:** 30~50 行 className 改动,纯样式无逻辑变化。

---

## #7 i18n + 夜晚模式(暂存)

收着,下批做。两个改动一起立项,因为:
- i18n 要把所有中文 hardcode 抽 key,改面大;
- 夜晚模式要先把颜色抽 CSS 变量(/ Tailwind dark: prefix);
- 两个一起做能共用一次"全站字符串/样式扫描"的心智成本,不用扫两遍。

未来动手前另起 design 文档。

---

## 完成节奏

每完成一项:
1. `git add` 涉及文件 + `git commit` 单独消息
2. 在本文档对应表格行打勾,写日期
3. 进下一项

完成全部 6 项后:
- 运行 `npm run build` 确认通过
- 一次性 push,在 commit 之间不 push(单个 commit 跑 CI 浪费)

## 验证清单(每项做完都过一遍)

- [ ] `npm run build` 不报错
- [ ] 主页 / 下载页 / admin 页能正常打开
- [ ] 改动涉及的视图模式切换正常
- [ ] 手机宽度(浏览器 DevTools 调成 375px)看一眼

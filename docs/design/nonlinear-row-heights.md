# 段位间行高非线性化设计笔记

## 背景与动机

当前所有段位的视觉间距均匀（每个 numericValue 单位映射到固定像素），但真实难度跳跃并不均匀。
典型例子：
- alpha → beta 大约是 1.05x
- delta → epsilon 大约是 1.12x

某些时候我们会希望"把某两段之间的行高拉大/压小"以更准确反映实际难度跳跃。

## 关键事实：RF 和 LN 是两条独立标定的尺度

`data/scales/reform-dan.json` 和 `data/scales/ln-dan.json` 是不同人独立制定的。
虽然它们的 numericValue 看起来共享一条数轴（rf alpha = ln11 = 11.0），但这只是**命名巧合**，
不是物理同位。RF 段之间的非线性比例和 LN 段之间的非线性比例不一定一样。

但同时，大部分玩家的 LN 段位比 RF 段位高 0~1 段——这给了 `rfLnOffset` 滑动条存在的意义，
让两条尺度在视觉上能"对齐"。所以"两条独立尺度，但有近似对齐关系"是更准确的世界观。

## 当前坐标体系

- `data/scales/*.json`：每段位一个 numericValue（线性等距，如 epsilon=15.0、delta=14.0）
- `src/lib/difficulty.ts` 的 `difficultyToY`：numericValue → 像素的**线性**映射
  - `ratio = (range.max - difficulty) / (range.max - range.min)`
  - `Y = ratio * containerHeight`
- `containerHeight = diffRange * rowHeight * zoom`（在 `LadderView.tsx`）
- `rfLnOffset` 滑动条：在 numericValue 域做减法，LN 类元素 displayed = raw - offset

## 推荐方案：分段权重 + 共享曲线（接受 LN 跟随 RF 的代价）

### 核心思路

1. 在 scale json 里给每段加 `weightToNext` 字段（或单独 `data/config.json` 维护一份权重表），
   描述该段相对默认间距的**视觉拉伸倍数**。`weightToNext = 1.0` 等于现状。
2. `difficultyToY` 改为**分段线性插值**：
   - 找到 numericValue 落在哪两个相邻段位之间
   - 按该段的 weight 算 Y 坐标
3. `containerHeight` 改成 `Σ(weight) * baseRowHeight * zoom`，不再是 `diffRange * rowHeight`。
4. `rfLnOffset` 语义和实现都不变，仍是 numericValue 域减法。
5. RF 段栏、LN 段栏、谱面块、参考点全部走同一个 `difficultyToY`，自动一致。

### 取舍：为什么共享曲线是务实选择

理论上 RF 和 LN 是独立尺度，应该各自有 weight 表。但这样做的代价：
- `rfLnOffset` 减法在两条曲线上对应的像素距离不同
- 拖滑动条会出现错位（"ln10 显示在 ln8 位置，但 ln8 在 LN 曲线上的位置 ≠ rf8 在 RF 曲线上的位置"）
- 没有干净的修复方法

共享曲线方案接受这个事实：**LN 段位栏的视觉间距跟随 RF 的非线性配置，哪怕 LN 自己觉得是均匀的**。
后果：如果 RF 把 epsilon→delta 拉伸到 1.12，那么同位的 ln14→ln15 也被同等拉伸，
即使 LN 玩家觉得这段是均匀的 1.08。

这是数据设定的副产品，不是渲染层缺陷。除非 RF/LN 非线性差异大到无法忍受，否则保持共享曲线。

## 改动清单（"我想拉大 epsilon 和 delta 之间的行高"时怎么办）

1. **找到目标段在 reform-dan.json 中的项**，比如 epsilon → delta 这一段：
   epsilon 的 numericValue=15.0，delta 的 numericValue=14.0。

2. **如果还没建 weight 字段**：
   - 在 `data/scales/reform-dan.json` 的每个 level 加 `weightToNext`（指向更低难度的下一段）
   - 默认全部 1.0 = 等于现状
   - 同步在 `data/scales/ln-dan.json` 加同样的字段（保持两文件结构对称即可，实际渲染只用 RF 的）

3. **修改 `src/lib/difficulty.ts` 的 `difficultyToY`**：
   - 不再用 `(max - diff) / (max - min)` 算 ratio
   - 改为：从 levels 顶端往下累加 `weightToNext`，直到找到 difficulty 所在区间
   - 在区间内做线性插值（区间宽度 = `weightToNext`）
   - Y = 累加权重 / 总权重 × containerHeight
   - 注意 `range.min/max` 落在 levels 之外的边界情况（intro1- 之下、eta+ 之上）—— 用最近段的 weight 外推

4. **修改 `src/components/ladder/LadderView.tsx`**：
   - `containerHeight` 改成 `totalWeight * baseRowHeight * zoom`
     （totalWeight 从 levels 累加权重得到；可放在 `difficulty.ts` 作为 `getTotalWeight()` 导出）
   - `rowHeight` 的语义变成"每权重单位的像素高度"，UI 里的提示文字可能要更新

5. **`yToDifficulty` 同步改**（hover 卡片或将来 admin 反查时要用）：
   - 给定 Y → 找累加权重区间 → 反向插值出 numericValue

6. **调权重值**：
   - 想把 epsilon → delta 拉伸 1.12 倍，就把 epsilon 那项的 `weightToNext` 设为 1.12
   - 想把 alpha → beta 压缩到 0.95，就把 alpha 那项的 `weightToNext` 设为 0.95
   - 全部默认 1.0 起步，只调真正觉得偏差大的几段

7. **验证**：
   - `npm run build` 通过
   - 视觉检查：段位栏标签是否仍按从上到下顺序排列（不应该重叠或反序）
   - 拖 rfLnOffset 滑动条：LN 段位栏应该顺曲线滑动，不应该出现错位
   - 谱面块的 Y 坐标和段位标签应该对齐（同一 numericValue 出现在同一像素位置）

## 不推荐的备选方案（已讨论，留作记录）

- **重新标定 numericValue 让数字本身反映真实难度**：所有现存谱面 difficulty 字段全部漂移，
  得批量重新校准，工作量极大。
- **滑动条改成像素域偏移**：`rfLnOffset` 失去"段位对齐"的语义，用户没法再用段位术语表达对齐感。
- **RF/LN 各自独立 weight 表**：滑动条会错位，没有干净修复方案。

## 优先级

不紧急。当前线性映射的视觉偏差对绝大多数查看者看不出来，只有有强烈段位实感的玩家会注意到。
等有真实用户反馈"段位间距怪怪的"再做。改动局限在 `difficulty.ts` + `LadderView.tsx`
+ scale json 配置文件，风险低，可以随时引入。

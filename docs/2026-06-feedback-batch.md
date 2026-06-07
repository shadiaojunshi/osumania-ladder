# 2026-06 用户反馈批量处理

> 收件:2026-06-07 群友测试反馈一批,共 7 项功能改动 + 1 项答疑(SNI 阻断)。
> 6 项已完成并推到 main(commit `3d1e82f`),build 通过;1 项 (i18n + 夜晚模式) 暂存。

## 状态总览

| # | 标题 | 状态 |
|---|---|---|
| 6 | 上传格 hover `title=` 显示全名 | ✅ 2026-06-07 |
| 4 | BulkImporter 加"按 Qual→GF 顺序"提示 | ✅ 2026-06-07 |
| 1 | 每轮图池模式加常驻白边开关 | ✅ 2026-06-07 |
| 5 | TB 双值,RF + LN 都参与计算/显示 | ✅ 2026-06-07 |
| 2 | 同行重叠从 2-way 扩到 N-way | ✅ 2026-06-07 |
| 3 | 响应式 (a):小窗 / 平板 / 手机 | ✅ 2026-06-07 |
| 7 | i18n + 夜晚模式 | ⏸ 暂存,改面太大单独立项 |
| Q8| pages.dev SNI 阻断答疑 | 已口头答复,见末尾 |

执行顺序按"工作量从短到长":**6 → 4 → 1 → 5 → 2 → 3**。每项 type-check 单独跑,
最后 `npm run build` 一次过,合并成一个 commit 推送。

---

## #6 上传格 hover 显示全名

**问题:** [MapUploader.tsx](../src/components/admin/MapUploader.tsx) 的谱面 `name`
(`Artist - Title [Version]`)被 `truncate` 截断,只在 slot 列旁边显示。
手动上传 / 自动下载按钮上没法快速核对补传的是不是对的图。

**改动:**
- `MapUploadCell` 新增 prop `mapName?: string`,从 `MapUploadRow` 透传
- 三处加 `title=`:
  - cell 根 `<div>` —— 整个上传单元格悬浮显示完整谱面名
  - 占位框 —— `title={mapName || placeholderText}`
  - "自动"按钮 —— 拼到原本的 set ID 提示后,换行接谱面名
- 已上传那一行(✓ + ⟳ + ✕)同样挂 `title={mapName}`

**改动文件:** [src/components/admin/MapUploader.tsx](../src/components/admin/MapUploader.tsx)
3 处 `title=` + 1 个 prop 透传。

---

## #4 BulkImporter 顺序提示

**问题:** [BulkImporter.tsx](../src/components/admin/BulkImporter.tsx) 步骤 1 的说明
没有强调"从上往下按比赛进程顺序"。但默认按淘汰赛**从尾倒推**命名(最后一轮 = GF,
倒数第二 = F),贴反了识别会全错。

**改动:**
- 步骤 1 提示文案插一段加粗"轮次顺序"段:从上往下贴 Qualifiers → ... → GF,
  并解释默认倒推命名规则
- placeholder 示例从两轮(默认识别为 Qual + GF)扩成三轮(Qual → F → GF),
  让"顺序对应"更直观;首轮无 TB,后两轮有 TB 触发倒推

**改动文件:** [src/components/admin/BulkImporter.tsx](../src/components/admin/BulkImporter.tsx)
1 段 jsx + 1 个 placeholder 字符串。

---

## #1 常驻白边开关 (仅 round 模式)

**问题:** [globals.css:43-46](../src/app/globals.css#L43-L46) 的 `.round-box:hover`
只有悬浮才显白边。用户希望在每轮图池模式下所有框都常驻白边,方便区分相邻框。
其他模式不做。

**改动:**
- [viewStore.ts](../src/stores/viewStore.ts) 加 `roundBorderAlways: boolean` 状态
  + `setRoundBorderAlways` setter
- [ControlBar.tsx](../src/components/controls/ControlBar.tsx) 在"资格赛: 显示/隐藏"
  按钮后插一个 `常驻白边: 开/关` 按钮,**仅 `mode === 'round'` 时渲染**
- [LadderView.tsx](../src/components/ladder/LadderView.tsx) round 分支的
  `round-box` className 拼上 `${roundBorderAlways ? 'always-border' : ''}`
- [globals.css](../src/app/globals.css) 加规则:
  ```css
  .round-box.always-border {
    box-shadow: 0 0 0 1.5px white, 0 1px 3px rgba(0, 0, 0, 0.15);
  }
  .round-box.always-border:hover {
    box-shadow: 0 0 0 2px white, 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 50 !important;
  }
  ```
  常驻 1.5px 白边 + 轻阴影,hover 仍然加粗到 2px + 大阴影,保留交互反馈。

**改动文件:** 4 个,每个 5-10 行级。

---

## #5 TB 双值,RF + LN 都参与

**问题:** TB 类型实际曲风混杂,常常 RF + LN 都有。但旧逻辑里:
- round 模式直接 `filter((m) => m.type !== 'TB')`,TB 完全不进 min/max 计算
- type 模式 `isLnBased('TB') === false`,TB 只看 `difficulty`(RF 轴),
  `difficultyLn` 被忽略

用户选项 C:**两边都参与**。

**改动:**
- round 模式 `adjustedDiffs` 计算改成显式三分支:
  ```ts
  for (const m of round.maps) {
    if (m.type === 'TB') {
      if (m.difficulty > 0) push(m.difficulty)
      if (m.difficultyLn && m.difficultyLn > 0) push(m.difficultyLn - rfLnOffset)
    } else if (isLnBased(m)) {
      push(getLnDiff(m) - rfLnOffset)
    } else {
      push(m.difficulty)
    }
  }
  ```
  TB 同时贡献两个值进 min/max,RF 单值就退化成一个。
- type 模式 `type === 'TB'` 单独走一支:`rfAvg` + `lnAvg` 分别从 `difficulty` /
  `difficultyLn` 算,再 `(rfAvg + (lnAvg - rfLnOffset)) / 2` 取平均;只有一边时
  退化成那一边(LN 单边减偏移)。fallback 到 `typeDifficulties` 时同理两侧分取。
- `isLnBased` 不动 —— 让别处把 TB 当纯 LN 处理会出错,只在 round/type 框计算时特判。
- [HoverCard.tsx:132-139](../src/components/ladder/HoverCard.tsx#L132-L139) 的 TB 分支
  天然兼容(原本就是 `getRfDanName(rfAvg) / getLnDanName(lnAvg)`),无需改。

**改动文件:** [src/components/ladder/LadderView.tsx](../src/components/ladder/LadderView.tsx)
两处计算分支,~50 行。

---

## #2 重叠 N-way 分组

**问题:** type 模式下旧 `overlapGroups` 是 pair-wise 双层循环 + idx 0/1 二选一。
3 个框难度都接近时,后两个都拿到 `idx=1`,渲染时互相覆盖,**hover 显示底下被盖住的那个**。

**改动:** 重写成扫一遍的连续分组算法:
```ts
const sorted = [...allTypeBoxes].sort((a, b) => a.adjustedAvg - b.adjustedAvg)
let i = 0
while (i < sorted.length) {
  let j = i + 1
  while (j < sorted.length && Math.abs(sorted[j].adjustedAvg - sorted[i].adjustedAvg) < 0.05) j++
  const size = j - i
  if (size > 1) {
    for (let k = i; k < j; k++) {
      overlapInfo.set(`${sorted[k].round.id}-${sorted[k].type}`, { idx: k - i, size })
    }
  }
  i = j
}
```
渲染时按 `idx/size` 等分列宽:
```ts
const left = info ? `${(info.idx / info.size) * 100}%` : '4px'
const right = info ? `${((info.size - info.idx - 1) / info.size) * 100}%` : '4px'
```
2-way / 3-way / 4-way 都通用,size 越大单框越窄但至少不丢框。
hover 按 key 唯一,事件不再被吞。

**改动文件:** [src/components/ladder/LadderView.tsx](../src/components/ladder/LadderView.tsx)
替换原来的 `overlapGroups` 块。

---

## #3 响应式 (a):小窗 / 平板 / 手机

**问题(用户附图):**
1. 手机上左 scale(70px)+ 右 reference(160px)占了过半横向,主区被挤成竖条
2. 顶部 Header 和底部 ControlBar 横向元素溢出屏幕,看不到右侧按钮且不能横滑
3. 主区域本身 zoom/pan 在手机上能用,**不需要降级成两层"列表 → 详情"**

**改动:**

**3a. LadderView 左右栏窄化(< 768px,Tailwind md 断点)**
- 新增 `useIsNarrow()` hook,挂 `window.matchMedia('(max-width: 767px)')`,
  SSR 安全(初始 false,挂载后立即纠正)
- `LeftScaleInner` 总宽:`showBoth` 110→70px,`showOnly` 70→42px;
  内部 RF/LN 两侧 label 宽度同比例缩;`pl-2/pr-2` → `pl-1/pr-1`;
  font-size 12/11/9 → 10/10/8
- `RightRefInner` `w-[160px]` → `w-[88px] md:w-[160px]`,
  连接线 `w-3` → `w-2 md:w-3`,文字 `text-xs` → `text-[10px] md:text-xs`,
  保留 `truncate`

**3b. Header 自适应**
- `h-14` → `min-h-14 py-1 md:py-0 md:h-14`,改成允许多行
- 外层 `flex` 加 `flex-wrap md:flex-nowrap`,小屏自动换行
- 标题 `text-lg` → `text-base sm:text-lg`,中间"比赛谱面"四字 < 640px 时 hide
  (变成"osu!mania 天梯榜")
- 视图模式 / type 筛选 / 搜索区块各自 `flex-wrap`
- 搜索框 `w-48` → `w-28 sm:w-48`,placeholder "搜索比赛或轮次..." → "搜索..."
- 各按钮 padding 和 font-size 加 `sm:` 前缀小屏更紧
- `ml-auto` → `md:ml-auto`,小屏不强行推到右边

**3c. ControlBar 自适应**
- 同样 `h-14` → `min-h-14 py-1 md:py-0 md:h-14` + `flex-wrap md:flex-nowrap`
- 4 处 `<div className="w-px h-6 bg-gray-300" />` 分隔符全部 `hidden md:block`,
  换行后竖分隔变水平不合适,直接隐藏
- 末尾 "osu!mania Ladder v0.1" 版本字段 `hidden md:block`
- `ml-auto` → `md:ml-auto`

**改动文件:**
- [src/components/Header.tsx](../src/components/Header.tsx)
- [src/components/controls/ControlBar.tsx](../src/components/controls/ControlBar.tsx)
- [src/components/ladder/LadderView.tsx](../src/components/ladder/LadderView.tsx)

纯样式 + 一个新 hook,无业务逻辑变化。

---

## #7 i18n + 夜晚模式(暂存)

下批做。两个一起立项的原因:
- i18n 要把所有中文 hardcode 抽 key,改面大
- 夜晚模式要把颜色抽成 CSS 变量 / Tailwind dark: 前缀,样式扫一遍
- 两个共用一次"全站字符串/样式扫描"的心智成本,不要分两次扫

未来动手前另起 design 文档。可以先只做主页面(LadderView + Header + ControlBar),
admin 和 download 页留到第二期。

---

## Q8 — pages.dev SNI 阻断答疑

**群友问:**"用 pages.dev 找 sni 阻断么"

**意思:** 你的站是不是直接挂在 `*.pages.dev` 域名上,因为 `pages.dev`
在国内某些运营商被 SNI 阻断 —— GFW 和部分 ISP(主要移动 + 个别地区电信)
会嗅 TLS 握手包里明文的 SNI,看到 `*.pages.dev` 直接 RST,前端表现就是
"已重置连接"。

**和你网站代码无关:** 这是 TCP / TLS 握手层被中间人干掉,跟流量、Cloudflare 后端、
代码都没关系。

**解法:** 绑自定义二级域名(比如 `mania.your-domain.com`)指到这个 Pages 项目。
SNI 变成你自己的域名,大多数运营商不会动。海外用户体感无差别。

**验证:** 让那位测试者用国外 DNS / VPN 打开 → 通,就是 SNI 阻断;
还是不通,才是别的问题(IP 段封锁、DNS 污染等)。

---

## 待人工验证清单

我没法实测真机和真窗口尺寸,以下需要你或测试者亲手过一遍:

- [ ] 手机(浏览器 DevTools 调到 375×812 或真机)主页布局是否舒服,
      Header / ControlBar 各按钮都能点到
- [ ] 进 "每轮图池" 模式点"常驻白边: 开",看白边粗细是否合适
- [ ] "每轮键型" 模式找一场同行有 3 个 type 难度接近的轮(SVMX/SV2/ME 之类),
      看是不是三等分 + hover 显示对的 type
- [ ] 找一张 TB 同时填了 `difficulty` 和 `difficultyLn` 的轮,
      看 round 框范围是不是覆盖了两个值,type 框位置是不是 RF/LN 中点
- [ ] admin 上传页,把鼠标停在某个未上传的占位框上,看 tooltip 显示完整谱面名 + 难度名
- [ ] BulkImporter 粘一份正常顺序的主表格,确认默认轮次命名 (Qual / F / GF) 对得上

## 关联资料

- 上一批改动文档:[docs/r2-direct-pack-research.md](r2-direct-pack-research.md)
- BulkImporter Plan(已合并):
  `C:\Users\Shadiaojunshi\.claude\plans\rustling-baking-lecun.md`
- 提交:`3d1e82f` — `feat: 6 user-feedback fixes — TB双值, 重叠N-way, 响应式, hover, 等`

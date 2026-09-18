# 首页改进实施说明

日期：2026-09-09。面向没有本次会话上下文的接手 AI。

## 0. 先读这一节

本文件是实施规格，**不是已完成功能清单**。任务 A–E 和 S1–S3 尚待实施；本轮发布的是此前已完成的单曲反查搜索、轻量细节动效。不要把本文件中的未来功能直接当作线上行为。

用户已经确定：

- 沿用现有主页风格、难度配色和天梯用途，主要打磨细节、动画。
- 搜索单曲信息能反查对应比赛，不改造成练习谱推荐首页。
- 键型继续人工确认，不做未经验证的自动分类。
- 多人偶尔编辑；防止覆盖别人数据比自动分类更重要。
- 右上角收集建议采用**外部问卷**，优先低开发量、低维护成本。
- 每轮图池的标题靠框顶，重叠时也要可见。
- 常驻白边默认开启；鼠标左键框可打开详情；详情有动效，谱面链接有明确下划线。
- 超出绘图区上界的数据保留真实数值，通过暗红色边界效果呈现。

本次发布范围：

| 项目 | 状态 / 位置 |
| --- | --- |
| 歌名、歌手、难度名、BID、图集 ID、osu! 链接反查比赛 | 已实现，`src/lib/tournamentSearch.ts` |
| 搜索结果展示比赛、轮次、槽位，点击打开现有图池详情 | 已实现，`src/components/ladder/LadderSearchResults.tsx` |
| 控件反馈、搜索结果入场、详情入场、减少动态效果适配 | 基础版已实现，`src/app/globals.css` |
| `fl → f` 演示稿部分框置灰 | 演示稿问题，已修；正式主页搜索不根据单曲命中情况置灰轮次 |
| A–E 新需求、S1–S3 安全改进 | 本文件规格，尚未实现 |

工作区曾有 `ManiaMapAnalyser.by.Leo_Black/`、`osu-toolbox/` 两个用户目录，不要修改、提交或删除。先看 `git status`，不要覆盖用户工作。

## 1. 最小项目地图

| 文件 | 需要知道的职责 |
| --- | --- |
| `src/components/Header.tsx` | 主页标题、三种视图、键型筛选、搜索、下载/后台入口 |
| `src/components/ladder/LadderView.tsx` | `LadderView`、左右标尺、`TournamentColumn` 三个视图分支、重叠定位 |
| `src/components/ladder/HoverCard.tsx` | 鼠标悬浮信息和“详细信息”按钮 |
| `src/components/ladder/RoundDetailModal.tsx` | 图池详情和 `MapRow` 谱面链接 |
| `src/components/ControlBar.tsx` | 白边开关、缩放、列宽、行高、RF/LN 偏移、年份/轮次筛选 |
| `src/stores/viewStore.ts` | 视图状态，当前 `roundBorderAlways: false`，不持久化 |
| `src/stores/prefsStore.ts` | 已有语言和主题偏好 |
| `src/lib/difficulty.ts` | 难度坐标变换、原有难度颜色/渐变，不改变数值语义 |
| `src/lib/types.ts` | `Tournament` / `Round` / `BeatmapMeta` |
| `src/lib/messages.zh.ts`、`messages.en.ts` | 新文案必须同步中英文 |
| `data/tournaments/*.json` | 真实比赛数据，不为修显示问题而改数据 |
| `functions/api/_middleware.ts` | 管理 API 鉴权边界；外部问卷方案不需要动它 |

Next.js 16 + React 19 + Tailwind 4 + Zustand，`next.config.js` 使用 `output: 'export'`。静态输出是 `out/`；后端是独立的 Cloudflare Pages Functions，不是 Next API routes。

已有 `@floating-ui/react`，做弹层定位、焦点管理优先复用。当前没有独立图标库；任务 C 若需要图标，可一次加入 `lucide-react`，只导入 `MessageSquare` / `ExternalLink` / `ArrowUp` 等实际使用的图标，不手绘通用图标。

## 2. 任务拆分及顺序

| 任务 | 内容 | 依赖 | 相对工作量 |
| --- | --- | --- | --- |
| A | 默认白边、左键详情、链接下划线、详情完整动效 | 无 | 小 |
| B | 每轮图池顶部标题、独立标题层、碰撞处理 | A 的详情入口 | 中 |
| C | 右上角外部问卷入口 | 真实问卷 URL | 小 |
| D | 超界几何、暗红边界展示、可点击详情 | A，复用 B 的几何结果 | 中 |
| E | 搜索/响应式/动效整体验收 | A–D | 小 |
| S1 | 多人编辑版本冲突保护 | 独立，可优先于外观 | 中 |
| S2 | R2 重传保留版本、备份失败处理 | 独立 | 中 |
| S3 | 服务端统一校验、后台安全响应头 | 独立 | 中 |

一次只交给 AI 一个任务。A、B、D 都会涉及 `LadderView.tsx`，不要让多个 AI 同时改该文件。每项本地验证后提交，合并一批再推送，避免每个小改动都触发线上构建。不要让 AI 顺手实施其他未分配任务。

## 3. A：白边、左键详情和链接

### A1. 默认白边

1. 将 `viewStore.ts` 的初始 `roundBorderAlways` 改为 `true`。保留用户手动开关。
2. 检查 `TournamentColumn` 三个分支：整场比赛、每轮图池、每轮键型都根据该值添加 `always-border`。目前只有 round 分支使用该 class。
3. 当前 `globals.css` 的 `.round-box.always-border` 已有样式。白边建议 1–1.5px；浅色背景下允许加 1px 中性外描边，深色仍是白边。不能依靠加宽框改变难度范围。
4. 本轮不引入持久化：新打开/刷新默认开启；当前页面手动关闭仍有效。以后需要记住选择时，单独设计 localStorage hydration。

### A2. 统一打开详情

在 `LadderView` 中定义稳定的 `openRoundDetail(tournament, round, trigger?)`，集中完成：清理待执行的 hover 定时器、清除 `hoveredRound`、设置 `detailRound`、记录触发控件以便关闭后还原焦点。

增加 `TournamentColumn` 的 `onOpenDetail(round)` 回调，搜索结果、悬浮卡“详细信息”和点击框都调用同一路径。

- round 分支：左键打开该轮。
- type 分支：左键打开该框所属轮，详情可标记该大键型，不改变原始数据。
- tournament 分支：先保持现有语义，打开 `visibleRounds` 中最后一轮的详情；无可见轮次时不渲染可点击框。不要额外设计比赛总览页。
- 将可点击主体改成 `button type="button"`，显式清除原生 padding/border 等默认样式，再应用现有 `.round-box`。原生 Enter/Space 即可打开。
- 不要在一个按钮内嵌另一个按钮或链接。任务 B 的独立标题按钮与主体按钮是同层元素。
- 保留 hover 预览；触屏依靠点击。移动端增加命中高度时，不移动数学上的难度锚点。

### A3. 详情交互与动画

复用 `RoundDetailModal`，不新增路由，不为每次打开请求 API。

- 目前只有入场动画。补齐 `opening → open → closing → unmounted` 生命周期：关闭时先进入 closing，退场结束后再清空父组件 `detailRound`，不能先卸载再期望 CSS 执行。
- 遮罩：入场 160ms opacity；内容：入场 240ms、向上 5–8px、缓出。退场统一 140ms。初期不增加动画库。
- 使用 animation end 回调，并有 200ms 退场兜底；清理定时器。`prefers-reduced-motion: reduce` 下立即关闭且不平移。
- 使用已有 Floating UI 的 portal、`FloatingFocusManager` 和 dismiss 能力，或等价成熟焦点管理方式；详情使用 `role="dialog"`、`aria-modal="true"`、标题 ID。不要只添加 ARIA 而没有焦点管理。
- 打开后焦点在关闭按钮；Tab 不能跑到背后天梯；Esc、关闭按钮、点击遮罩空白可关闭；点击内容不能关闭；关闭后焦点回原触发按钮。
- 动画期间禁用重复关闭，重新打开另一轮时取消旧计时器，避免旧回调关闭新弹窗。
- 桌面宽度 `min(560px, calc(100vw - 32px))`，移动端 `calc(100vw - 24px)`；最大高用 `85dvh` 并保留 `85vh` fallback。头部不滚动，谱面列表滚动。

### A4. 谱面链接

`MapRow` 目前链接内部的文本 span 固定了颜色，导致父 a 的 hover 颜色不明显。

1. 有有效正整数 `beatmapId` 才渲染 osu! 链接。
2. 把歌名 span 改为继承链接颜色，并加 `underline underline-offset-4 decoration-1`；hover/focus 时加深颜色/下划线。
3. 保留 `target="_blank" rel="noopener noreferrer"`。aria 名称说明曲名和“在 osu! 打开”。可加 `ExternalLink` 图标，装饰图标设置 `aria-hidden`。
4. 没有 BID 的条目是普通文本，没有下划线/手型光标；不能伪装成可点击链接。
5. 长曲名允许两行或完整换行，至少在详情内不因 truncate 无法读全。

验收 A：全新页面三种视图默认白边；开关可关闭；左键、Enter、Space、悬浮卡和搜索结果均打开正确轮次；链接可辨认且可新标签页打开；无 BID 不生成空链接；快速开关 10 次无残留遮罩；390px 下长曲名不溢出。

## 4. B：框标题置顶且不被相邻框覆盖

### 问题与层次

当前 `.round-box` 垂直居中标题，并用每轮的 `zIndex` 控制整框遮挡。仅改 `align-items: flex-start` 或把内部标题 z-index 加大，无法穿过兄弟框的层叠上下文。

将 round 分支整理成**一次计算布局、两层渲染**，不要复制两套难度计算：

```ts
type RoundLayout = {
  key: string // tournament.id + round.id + visible index，沿用兼容旧数据的策略
  round: Round
  rawTop: number
  rawBottom: number
  paintTop: number
  paintHeight: number
  minDifficulty: number
  maxDifficulty: number
  dimmed: boolean
}
```

新增 `src/lib/roundLabelLayout.ts` 只处理像素标签的确定性布局。不要修改 `getLnDiff`、TB 排除规则或 difficulty JSON。先把现有 round 计算结果整理为 `RoundLayout[]`，既给框体也给标题使用。

> 2026-09-18（R22）：上文设想的"标题层"最终没有做（`LadderView.tsx` 里已注明"用户已拍板：本视图不做独立标题层"）。因此 `roundLabelLayout.ts` 里的标签防碰撞算法（`buildRoundLabelPlacements` / `LabelPlacement` / `LabelLayoutResult` / `LABEL_*`）与 `scripts/round-label-layout.test.mjs` 已作为"无生产调用的死代码"删除，只保留 `RoundLayout` 类型（框体层在用）。要取回：`git show 419c4b4:src/lib/roundLabelLayout.ts`。

每列内部层次：

| 层 | z-index | 行为 |
| --- | --- | --- |
| 框体层 | 10，建立自己的 stacking context | 沿用颜色和范围；hover 加白边，不跨到标题层 |
| 标题层 | 30 | 绝对定位覆盖整列；容器 `pointer-events:none`，标题按钮 `pointer-events:auto` |
| 比赛列头 | 40 | 当前比赛缩写保持可见；与框标题分开 |
| 超界边界层（任务 D） | 45 | 位于专用顶部区域，不覆盖普通标题 |
| 悬浮卡 | 页面级 80 | 在列的层叠上下文外，必要时 portal |
| 详情弹窗 | 页面级 100 | 统一遮罩与内容 |

`.round-box:hover` 现有 `z-index:50 !important` 要局限在框体层，或移除 `!important` 后用状态控制；不能让 hover 框把标题重新压住。

### 正常标题与碰撞规则

- 标题是紧凑的轮次缩写，如 `QF`、`SF`、`GF`；比赛缩写已在列头，不重复占宽。完整名称放在 aria-label 和 hover 信息中。
- 正常标题锚点是 `paintTop + 4px`，位于框的上沿，左侧留 8px。高度 20px，12px 字号，不随 viewport 缩放字号。
- 标题背景使用主题的实色表面，配 1px 对应难度色细线，保证叠在任何框上仍可读。不是一张额外大卡片。
- 标题布局以原始锚点升序排序；同锚点用 `round.order`、稳定 key 打破平局，禁止依赖 hover 或随机数。
- 无碰撞时保持原锚点。碰撞时用 24px 的最小纵向间距向下排：`labelY[i] = max(anchorY[i], labelY[i-1] + 24)`。
- 如果最后一个标题超过可用区域底部，从末尾向前回推：`labelY[i] = min(labelY[i], labelY[i+1] - 24)`。这是标签排布，框体与标尺坐标不移动。
- 标签发生位移时，画一条 1px 的短连接线指回所属框顶部；线不响应指针。hover/focus 标签时，只强调对应框，帮助分辨重叠归属。
- 极端合成数据若标题数量 × 24px 已大于可用高度，显示“轮次”集合按钮，展开完整可点击列表。不要继续压缩字到不可读或让按钮重叠。正常现有比赛无需走此降级分支。
- 标签不在动画每一帧重新布局；只在数据、列宽、缩放、行高、筛选改变时计算。hover 只改变高亮。

验收 B：构造两个部分重叠框、两个同顶点框、五个紧密框；每个标题可见且点击对应正确轮次。鼠标跨过框体不会使标题被盖住。未碰撞标题在框顶 4px 内；碰撞只移动标签，有连接线，难度框坐标不变。测试列宽 80/160/240，明暗主题和 390px。

## 5. C：右上角外部问卷

用户已选择跳转外部问卷。**不要实现站内匿名 API、D1、Turnstile、公开留言墙或邮件通知。**

### 如何实现

1. 由站长创建实际问卷并提供 HTTPS URL。可使用其已有问卷平台；不替站长注册新账号、不猜测或编造 URL。
2. 配置 `NEXT_PUBLIC_FEEDBACK_FORM_URL`。这是公开链接，不是秘密；在 `.env.example` 中新增空值和用途说明（若文件不存在再创建，不能把真实 `.env` 内容复制过去）。
3. 在小型 `src/lib/feedbackLink.ts` 中用 `new URL` 解析配置，只接受 `https:`，拒绝用户名/密码 URL。空值或无效值返回 null。该函数不进行网络请求。
4. `Header.tsx` 中搜索栏后的导航区增加反馈链接，位于下载入口之前，靠近右上角。图标 `MessageSquare` + 桌面“意见反馈”；空间不够时仅图标，保留 aria-label 和 hover/focus 提示。触控目标至少 44px。
5. 链接用 `<a href={url} target="_blank" rel="noopener noreferrer">`，沿用其他 header 控件动效。不用 iframe 嵌入问卷。
6. 没有有效 URL 时隐藏入口；不生成 `href="#"`、假成功提示或不可用按钮。验收时必须配置真实 URL 后再确认入口完成。
7. 不把当前页面 URL、用户标识、搜索词或联系信息自动拼进外部链接。用户在问卷内自行填写。

建议问卷字段：反馈类别（数据勘误/显示问题/功能建议/其他）、具体内容（必填）、比赛与轮次（选填）、BID 或链接（选填）、联系信息（选填）。问卷平台关闭“必须登录”才能让普通访问者匿名提交；建议仅管理员能看回答，并现场验证无痕窗口可用。

本任务需要的外部输入只有**问卷 URL**。尚未提供时可完成控件/配置/测试，但应明确说明入口等待配置，不能声称已能收集反馈。

### 额度说明（2026-09-09 核对）

- Cloudflare Pages Free 的 500 次/月是 **builds**，不是访客访问数或建议数量。
- 打开外部问卷、在问卷里提交答案，不触发仓库 commit，不触发 Pages 构建。
- 设置公开 URL 并发布前端需要正常部署一次，以后每份回答由问卷平台处理，其配额和隐私设置遵循该平台规则。
- 即使以后改成站内提交，Pages Functions 的请求额度也与构建分开；目前 Workers Free / Pages Functions 合计 100,000 请求/日，并非 500 条反馈/月。本轮不实施这条路线。

参考：[Pages 构建限制](https://developers.cloudflare.com/pages/platform/limits/)、[Pages Functions 计费](https://developers.cloudflare.com/pages/functions/pricing/)。

验收 C：有效 URL 在右上角出现，鼠标、键盘、触屏可打开；新标签页目标正确；无效/空 URL 无死链接；首页首次打开和点击反馈均不向本项目新增反馈 API 请求；中英文/390px 下不挤压搜索框；无痕访客能实际提交问卷。

## 6. D：超出上界的图池与 TB

### 已确认的数据

当前绘图区 `DIFFICULTY_RANGE = { min: 0.5, max: 16.5 }`。

| 比赛 / 轮次 | 当前数据 | 默认 RF/LN 偏移 = 0 时的结果 |
| --- | --- | --- |
| CET 4K 2026 / GF (`round-7`) | LNX difficulty = 17；HBX LN = 16.9 | round 框上限 17，超出绘图区 |
| CET 4K 2026 / GF / TB | RF 16.2、LN 17.2 | 现有 TB 算法 `16.2 + (17.2-16.2)*2/3 = 16.8667`，超界 |
| SWM2 / GF / SHOWTB | RF 15.8、LN 16.9 | 现算法 = 16.5333，同样略超界 |

不要把 LN 数值 17.2 直接当作 TB 的最终 y 坐标；保留现有 RF/LN 加权以及 `rfLnOffset` 行为。TB 不加入 round 普通图池范围统计。

### 统一坐标与几何

新增 `src/lib/ladderGeometry.ts`，纯函数返回真实坐标、绘制裁切结果和超界状态；三个视图和 B 的标题共用，不能各自写 clamp。

```ts
type Bounds = { min: number; max: number }
type RangeGeometry = {
  rawTop: number
  rawBottom: number
  paintTop: number
  paintBottom: number
  above: boolean
  below: boolean
}
```

1. 统一 `plotHeight = (max-min)*rowHeight*zoom`，新布局分成比赛列头 32px、顶部超界带 32px、常规绘图区。
2. 所有列都预留相同超界带高度，防止某列出现标记就让它的难度坐标整体错开。
3. `originY = 64px`，`y(d) = originY + difficultyToY(d, plotHeight, bounds)`。内容高度统一 `originY + plotHeight`。左右标尺也加同一个 originY，滚动容器、左右同步区域使用同一 contentHeight。
4. 清除旧 tournament 分支单独的 `top + 20` 等重复偏移，避免三种视图不对齐。用测试锁定同一难度在三视图与标尺的同一 y。
5. range 的 `above = maxDifficulty > bounds.max`；绘制区裁到 `[originY, originY+plotHeight]`，保留 raw 坐标给解释和连接线。完全在上界外时可以没有普通框体，但必须有边界按钮。
6. type 标量先由现有算法得出 adjustedAvg，再判超界。**不要先把真实难度 clamp 到 16.5**，否则丢失超界信息。
7. 最小点击高度仅改变绘制外观，不改变锚点。恰好 16.5 时不显示“超界”，点框在边界处需保证仍有可点击区域。
8. 改 RF/LN 偏移后重新计算超界状态；条目回到范围内时移除对应标记。不要用比赛 ID 写死 CET/SWM2 的特效。

### 暗红边界效果

- 每列的超界带位于列头下面，跟横向滚动保持列归属。普通页面滚动造成的“离开当前视口”不等于数据超界，不能给所有滚到屏幕外的框加红色。
- 样式采用暗红底 `#7f1d1d`、亮红边线 `#dc2626`、浅红/白色文字；最大高度 28px。周围使用低强度阴影，不把全页染红。
- 内容示例 `↑ GF · 超出标尺` 或 `↑ GF TB · 16.87`。完整名称、原始 RF/LN 和范围放进 hover/focus 信息，不能只靠红色表达状态。
- 可做一次 900ms 的细线扫光或从框上沿延伸的短红纹，不使用持续闪烁、整屏血雾、摄像机晃动或大量粒子。`prefers-reduced-motion` 下静态显示。
- range 穿过上边界：截断处给明确的红色边缘；普通难度颜色继续沿用原有渐变。
- 同列多个超界项：集合按钮 `↑ 超界 3`，点击展开按真实难度降序排列的列表，每项都能打开所属轮详情。相同 difficulty 用稳定 key 排序，不随机错位。
- 边界标记的点击与 A 使用同一详情入口；移动端不依赖 hover。
- 深浅主题都保持可读对比度。红色表示超出当前绘图区，不代表数据非法、绝对最高等级或需管理员修正。

验收 D：上述 CET GF、CET TB、SWM2 SHOWTB 均能找到并打开；改变偏移可让条目进出边界；测试恰好 16.5、略高 16.51、整个框都在 16.5 以上、同列三个超界项、只有 LN 值、数据无有效难度。无 NaN/负高度；整个过程不修改比赛 JSON；截图确认顶部标记没有覆盖列头、搜索、详情入口。

## 7. E：验证与发布

优先运行一次：

```powershell
npm test
npx tsc --noEmit --incremental false
npx tsc --noEmit -p functions/tsconfig.json
npm run build
git diff --check
```

只改前端的任务不必每次跑 functions tsc；新增 API 的 S1–S3 必须跑。`npm run lint` 当前指向 Next 已不支持的 `next lint`，不要把它当成有效验证，也不要为本任务顺手迁移整套 lint。

浏览器验收用构建后的静态 `out/`，避免开发期编译峰值。遵守 `docs/dev-resource-safety.md`：只启动一个本地服务，串行探测，短超时，结束清理自己的服务。不要并行启动多个 Next dev 或大量页面探测。

手动/Playwright 验收矩阵：

| 场景 | 必须满足 |
| --- | --- |
| 搜索 `fl → f → 空字符串` | 结果随查询恢复；未启用键型筛选时，不因单曲未命中而把同列轮次置灰 |
| 搜索 3392120 | 包含 COEMT Qual RC1，点击能看到对应图池和 osu! 链接 |
| 同一谱面跨多个比赛出现 | 所有比赛都可找到，不按 BID 把比赛去重掉 |
| 粘贴带 `#mania/BID` 的图集链接 | 优先匹配选中的 BID，而不是整个 set |
| 已启用 LN/RC 筛选后搜索 | 保持原筛选语义，不擅自清空其他状态 |
| 同顶点/重叠图池 | 每个标题可定位、可操作，不用修改难度解决重叠 |
| 普通框/超界框/搜索结果 | 详情目标一致 |
| 390×844、768×900、1440×900 | 新控件和弹窗不溢出；天梯保留必要横向滚动 |
| 浅色、深色、减少动态效果 | 内容可读，减少动态效果不影响功能 |
| 连续打开/关闭详情 | 无旧计时器误关新详情，无焦点丢失 |

发布前只暂存本任务文件，排除构建产物和用户目录。项目惯例是 main 直推，push 会触发 Pages 构建；只在用户已经授权发布时执行。先 fetch 并检查上游文件，必要时保留用户改动后合并，禁止 force push。一次发布后检查实际线上页面，不要只看到 `git push` 成功就报告网站已更新。

## 8. 后续安全任务（单独分配，不夹进首页改动）

### S1：防止多人编辑互相覆盖

涉及 `src/app/admin/page.tsx`、`functions/api/tournaments/batch.ts`、`functions/api/tournaments/[id].ts`，以及实际承载暂存数据的组件。

当前 batch 接收整份 tournament，提交时才取最新 HEAD；这只能防提交过程中分支推进，防不住“甲打开旧数据，乙保存，甲再提交旧整份数据”。

实施契约：

1. 从 GET 取得最新 JSON 和文件 blob SHA 后才允许编辑/暂存，不能把打包时的 `allKnownTournaments` 静态数据当成可写基准。
2. 每个草稿存 `{baseSha, baseTournament, editedTournament}`。首次修改必须确认 fresh 基准；后续修改不悄悄换 baseSha。
3. batch 请求升级为 `{changes: {[id]: {baseSha, tournament}}, summary}`。服务端在同一个基准 commit/tree 中解析受影响文件当前 SHA，逐个与 baseSha 比较。
4. 任一不符返回 409 `{code:'EDIT_CONFLICT', conflicts:[{id, expectedSha, currentSha}]}`，整批不更新分支。前端保留草稿，展示冲突比赛并允许载入最新版本对比；不自动强制覆盖。
5. 建 tree/commit 后仍以非强制方式更新 ref。若 ref 更新失败，返回明确冲突；不能把旧草稿换个 baseSha 直接重试。
6. 成功响应返回每个文件的新 blob SHA。单文件和批量保存均更新编辑器基准，避免第二次保存继续用旧 SHA。
7. 第一版不做自动三方合并。用户可逐字段选择本地/最新后重新提交。

回归：A、B 同时打开同一比赛；B 改 BID 保存；A 改键型保存得到 409，B 的 BID 保留，A 草稿仍在；连续保存两次成功；不同文件编辑不会因无关文件变化被当成同一文件冲突；无 SHA 的旧请求不能静默成功。用 mock GitHub API，不在生产库演练覆盖。

### S2：R2 历史版本与备份失败

涉及 `functions/api/maps/upload.ts`、`functions/api/trash/index.ts`、`scripts/backup-r2.js`，新增版本查询/恢复 API 时沿用 contributor/admin 权限及审计。

1. 覆盖已有 `maps/{tid}/{rid}/{slot}.osz` 前，读取旧对象 body 和 ETag，把旧对象连同 metadata 保存到 `versions/{tid}/{rid}/{slot-or-nsv}/{timestamp}-{etag}.osz`。NSV 与普通版本必须隔离。
2. 备份旧版本失败则停止上传，不能继续覆盖。写新对象使用 R2 条件写入：旧对象存在时仅在 ETag 仍等于读到的版本时替换；首次上传仅在目标仍不存在时创建。条件不满足返回 409。
3. 不用先 HEAD 再无条件覆盖；这仍存在并发窗口。根据 Workers R2 API 支持的 conditional put 明确处理失败返回。
4. 恢复操作也先归档当前版本并执行条件写；用户明确选择版本后才能恢复。普通删除回收站与版本历史是两个不同概念。
5. 备份脚本同时覆盖 `maps/` 和 `versions/`；任意复制失败都让 Action 非零退出，并跳过本次回收站清理。不能打印“失败 n”后仍返回绿色成功。
6. 第一版不自动删除版本；恢复和备份验收后另行设保留期。存储成本与保留时长由站长决定。

回归：旧 A → 新 B → 恢复 A；归档失败不覆盖；两个并发重传不能无声相互覆盖；备份单项失败 Action 失败且不执行 cleanup；NSV 与普通文件不混淆。使用 fake R2，不重传真实谱包做试验。

### S3：统一校验与后台安全头

1. 给 create/update/batch 共用运行时 schema：对象类型、文件 ID 与 body.id 一致、轮次 ID 唯一、轮内 slot 唯一、数组/字符串长度上限、有限数字。难度 0 表示未填写，不能一刀切拒绝或改成测得难度。
2. 保留现有大小写 ID、自定义大键型和特殊槽位；先用全部真实 JSON 验证兼容，再启用保存端拒绝。不把类型断言 `as` 当成运行时校验。
3. 上传验证 FormData 字段实际类型、File 类型、键段格式与真实比赛/轮次/槽位关系；R2 是对象键，不把它误称为传统磁盘目录穿越。限制体积和压缩档案解析开销，不信客户端 MIME。
4. 管理页面禁止嵌入其他站点：优先 CSP `frame-ancestors 'none'`，可兼容设置 `X-Frame-Options: DENY`。检查静态页面和 Functions 的头配置分别生效。
5. CSP 先按实际 Next 静态输出和资源源站做报告/验证，再收紧；不能简单 `script-src 'self'` 导致静态页面内联启动脚本被阻断。不要直接开放 `unsafe-eval` 作为修复。
6. 写 API 校验允许的 Origin，沿用登录和角色校验；生产/预览/本地测试的 Origin 需要明确配置。CORS 或 SameSite 不是角色权限的替代。

回归：无权限仍 401/403；坏数据 400 且不写 GitHub/R2；有效现有数据可保存；未填难度可保存；后台不可被跨站 iframe 嵌入；首页和登录回调仍正常。每次只收紧一种边界，避免把兼容问题混在大提交里。

## 9. 给接手 AI 的直接指令

```text
请执行 docs/design/2026-09-homepage-implementation.md 中的任务 <A/B/C/D/E/S1/S2/S3>。
先读第 0、1 节和目标任务，检查 git status；只阅读表中相关文件，不重新遍历整个仓库。
保持现有风格和难度数据，不做自动键型分类，不实施未分配任务。
按规格实现，并运行该任务验收；发现规格与当前源码有实际冲突时先说明具体位置。
不要处理用户目录、密钥或无关改动。任务 C 缺问卷 URL 时明确报告配置前提，不编造地址。
最终只报告：改了什么、运行了哪些检查、尚未完成的验收及对应文件。
除非本次对话明确授权发布，否则不要 push；不要因实现完成就自动重跑合包。
```

推荐先分配 A，再 B，再 D；C 在问卷链接准备好后随时插入。安全任务独立处理，其中 S1 优先。

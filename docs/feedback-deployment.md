# 反馈功能实现与部署交接

更新：2026-09-21。代码已在本地实现并已提交推送（`ba7e5b9` 起，含审查修复）；**尚未部署**，生产提交服务未开放。历史规划见 `feedback-implementation-checklist.md`，以本文的当前状态为准。

## 已实现的流程

- 首页、下载页的“反馈”进入静态 `/feedback`；图池详情的谱面入口带比赛、轮次、槽位和 BID。
- 匿名浏览不请求反馈 API、不读取后台 KV。头像使用仅供展示的 cookie，不作为权限凭据；未登录显示“没登录”。
- 按键型、比赛、轮次关键词查谱；可建议槽位键型、槽位难度、整轮参考难度。理由和昵称可选，最多两个 HTTPS 证据链接，无截图上传。
- 整轮参考按全局标尺 0–12 计算六项难度，提交的是当时的精确值快照。管理员看到当前数据与提交时的数据是否变化，不会用新标尺静默重算旧建议。
- 点击验证后才加载 Turnstile；提交校验 hostname、action 和结果。草稿与原请求 UUID 保存在浏览器，验证 token 不落盘；失败重试不重复接纳同一请求。
- admin/owner 在后台“反馈审核”按 UTC 日期加载私有建议，预览、采纳到暂存、忽略。列表不公开。
- 采纳和忽略不写比赛 JSON。“保存全部”沿用批量接口，最多 50 条建议随比赛改动产生一次数据 commit。实际 Pages 构建次数仍由项目的构建触发配置决定。
- 审核状态用 ETag CAS，采纳租约 24 小时。手动覆盖建议值或替换谱面后，必须先取消来源关联；取消关联保留草稿数值。过期来源可从本机解除，不影响后来审核人的状态。
- 草稿按账号 UID 隔离，同一账号只允许一个浏览器标签页写入。旧 v1/v2 草稿须手动确认归属后导入，原存储保留。需要支持 Web Locks 的现代浏览器和 HTTPS（localhost 也可）。

## 部署绑定

| 服务 | 绑定 / 配置 | 用途 |
| --- | --- | --- |
| 独立反馈 Worker | `SUGGESTIONS` | 新建私有建议正文桶，关闭公开访问 |
| 独立反馈 Worker | `QUOTA` | `QuotaCoordinator` Durable Object；配置已有 SQLite migration |
| 独立反馈 Worker | `TURNSTILE_SECRET`、`IP_HASH_SALT` | 服务端 secrets；盐使用独立随机值 |
| 独立反馈 Worker | `TURNSTILE_HOSTNAME` | 提交网页域名，与 siteverify 返回一致 |
| 独立反馈 Worker | `ALLOWED_ORIGINS` | 网页 Origin 精确白名单，逗号分隔 |
| 独立反馈 Worker | `FEEDBACK_WRITES_ENABLED` | 默认 `false`，显式 `true` 才接纳 |
| 现有 Pages Functions | `SUGGESTIONS` | 同一正文桶，用于读取 |
| 现有 Pages Functions | `SUGGESTION_REVIEWS` | **另建一个私有桶**，仅后台绑定，保存审核状态与批次记录 |
| 静态前端构建环境 | `NEXT_PUBLIC_FEEDBACK_ENDPOINT` | 独立 Worker 的完整 `https://域名/v1/suggestions` URL |
| 静态前端构建环境 | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile 公钥，允许生产网页域名 |

Pages 原有登录、GitHub、KV 绑定继续使用。公开 Worker 不得绑定 `SUGGESTION_REVIEWS`、`LADDER_KV`、谱面桶、备份桶、GitHub token、会话密钥或邮件密钥。R2 前缀不是权限隔离，必须分桶。

`workers/feedback/wrangler.toml` 是部署样例，需核实实际桶名、域名和账号套餐。`public/_routes.json` 仅将 `/api/*` 路由到 Pages Functions。没有前端环境变量时页面仍可浏览、填写，但明确显示“反馈提交暂未开放”。变量在构建时注入，修改后需重建前端；仅改运行时环境不会更新静态页面。

## 上线操作顺序（2026-09-22 补，面板 + wrangler）

下面每一步都写清了"点什么、期望看到什么"。**顺序不能换**：桶没建好 `wrangler deploy` 会直接失败；
总开关开在验收之前，等于把没验过的入口放给公网。

### 0. 前置确认（免费套餐够用）

- R2 已启用（本站已有 maps / packs 桶，说明早就开了）。
- Durable Objects：**Workers 免费套餐可用**，但只支持 SQLite 后端 —— `wrangler.toml` 用的正是
  `new_sqlite_classes`，对得上。（2026-07-09 起新命名空间只能建 SQLite 后端；KV 后端一直是付费专属。）
- 免费额度：DO 请求 10 万/天、SQLite 存储 5 GB/账号、Workers 10 万请求/天、R2 10 GB-月 + A 类 100 万/月。
  本站反馈预算（300 接纳/天、2000 验证/天）远低于这些上限。
- ⚠️ 2026-01-07 起 SQLite DO 存储超出免费额度开始计费；这不是"永远不花钱"的保证。

### 1. 建正文桶

面板 **R2 → Create bucket** → 名称 `osumania-ladder-suggestions` → 创建后**不要**开 Public access、
**不要**绑自定义域。（等价命令：`npx wrangler r2 bucket create osumania-ladder-suggestions`）

### 2. 建 Turnstile 站点

面板 **Turnstile → Add site** → Hostname 填 `osumania-ladder.pages.dev` → Widget 模式选 Managed。
建完拿两个值：**Site Key**（公开，进前端）和 **Secret Key**（服务端，只进 Worker secret）。
**不需要**在面板配 action —— action 由前端 widget 渲染时指定（`feedback_submit`，见
`TurnstileChallenge.tsx`），服务端按 siteverify 回值核对（`policy.ts` 的 `TURNSTILE_ACTION`）。

### 3. 登录并部署 Worker（写入仍关闭）

```bash
cd workers/feedback
npx wrangler login                          # 浏览器 OAuth；首次会让账号选一个 *.workers.dev 子域
npx wrangler secret put TURNSTILE_SECRET    # 粘贴第 2 步的 Secret Key
npx wrangler secret put IP_HASH_SALT        # 独立随机串，别复用别的盐
npx wrangler deploy
```

生成盐（本机）：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

部署完会打印 `https://osumania-ladder-feedback.<你的子域>.workers.dev`。此时
`FEEDBACK_WRITES_ENABLED` 在 `wrangler.toml` 里仍是 `"false"` —— **先别动它**。

### 4. 验证 Worker 活着、且确实关着

```bash
curl -i -X POST https://osumania-ladder-feedback.<你的子域>.workers.dev/v1/suggestions \
  -H 'Content-Type: application/json' -H 'Origin: https://osumania-ladder.pages.dev' -d '{}'
```

期望 `HTTP 503` + `{"ok":false,"code":"DISABLED"}` + `Retry-After: 3600`。
这条同时证明了路由通、配置读得到、闸是关的。返回 404 = URL 写错；返回 500/1101 = 跑
`npx wrangler tail` 看日志（日志里**不会**有 IP 或 ipHash，只有 clientRequestId）。

### 5. Pages 加两个构建期变量并重建

面板 **Workers & Pages → 该项目 → Settings → Variables and Secrets**，在 **Production** 加：

| 变量 | 值 |
| --- | --- |
| `NEXT_PUBLIC_FEEDBACK_ENDPOINT` | `https://osumania-ladder-feedback.<你的子域>.workers.dev/v1/suggestions` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | 第 2 步的 Site Key |

然后 **Deployments → 最新一次 → Retry deployment**。`NEXT_PUBLIC_*` 是构建时内联的，只存变量不重建不生效。

验证：`curl -s https://osumania-ladder.pages.dev/feedback | grep -c 反馈提交暂未开放` 应为 **0**。

### 6. 验收（开总开关之前）

- 匿名打开 `/feedback`，选一张谱，填一条，走完验证提交 → 看到"已收到，等待审核。收据编号：…"。
- 不刷新再点一次 → 应返回**同一张收据**，不产生第二条。
- 刷新 → 草稿还在；换隐身窗口 → 同 IP 当天第 10 条之后应被限流。
- 后台"反馈审核"能看到这条；采纳到暂存、忽略各试一次；"保存全部"确认只产生一个数据 commit。
- 把 Worker 写入改回 `false` 重新 deploy → 页面仍能浏览填写，提交提示"反馈提交暂未开放"。

### 7. 开闸

把 `workers/feedback/wrangler.toml` 的 `FEEDBACK_WRITES_ENABLED` 改成 `"true"` → `npx wrangler deploy`。
**这一步不重建 Pages、不碰比赛数据。** 紧急关闭就是把它改回 `"false"` 再 deploy 一次。

### 已知偏差：v1 走 workers.dev

第 3 步给出的是 `*.workers.dev` 地址，而 `feedback-implementation-checklist.md` 第 142 行要求
"默认 workers.dev 不得成为绕过边缘规则的另一入口"。
现状下这是**权宜**：本站还没有自定义域，前端要能直接 POST 就只剩这个地址。
已经到位的替代防线是 CORS 精确白名单（`ALLOWED_ORIGINS`）+ Turnstile hostname 核对 + 按 IP 的短窗口限流
+ 每日预算 —— 挡得住"别的网站拿这个入口刷"，挡不住"直接打这个域名的洪水"。要彻底合规得绑自定义域、
关掉 `workers_dev`，代价是前端要改地址并重建一次。

## 额度与关闭方式

默认 UTC 每日最多 300 个接纳预留、2000 次验证预留；全站每分钟最多 60 次验证。同 IP 每分钟最多 10 次验证、10 分钟最多 5 次接纳、每日最多 10 次接纳。预留后的网络或存储失败保守占用额度，重试原 UUID 不再扣接纳额度。按 IP 的短窗口在 UTC 换日重置；这不是跨午夜连续限速。

配额协调器使用一个固定的全局 Durable Object，事务保留计数与 UUID，重启不清零；条件创建 R2 正文防止覆盖与并发重复。跨日重试仍使用第一次预留的日期与对象 key。

**应用配额不能封顶攻击者造成的 Worker/DO 请求费用，也不能隔离同 Cloudflare 账号的共享额度。** 上线前必须核对当前套餐，配置适用于该 Worker 域名/路径的边缘限流和机器人防护。IP 可作为一层限制，但代理和 NAT 使它不能单独证明用户身份。预算耗尽只关闭反馈接纳；共享账号总额度耗尽仍可能影响后台。

预先准备针对反馈入口的 WAF 阻断规则，紧急时直接启用，避免重建 Pages。规则、Bot Fight 和限流能力以实际套餐和域名路由为准，不假设 workers.dev 自动继承网站规则。也可单独将 Worker 写入变量改回 `false` 并重新部署该 Worker；不需要提交比赛数据或触发 Pages 构建。

当前未实现“待审核积压数量”自动熔断；每日上限配合保留期限制存量，积压过多时由站长关闭写入。不要将应用预算宣称为绝对费用保障。

反馈正文现在也支持不关联谱面的纯文字提交，进入同一审核列表；它只能“忽略”或“标记已处理”，不会被接口直接转换成比赛 JSON。槽位/整轮建议仍走原来的预览、暂存和批量保存。

可视化的公开入口为 `/api/charts`，只接受构建时生成的已发布比赛/轮次/槽位/BID 组合。R2/上游读取结果按数据版本和目标缓存，重复缓存读取不消耗冷读取预算；失败和回源也不会开放任意 BID。当前应用起点是全站每天 10,000 次冷读取、全站每天 20,000 次公开取谱请求、单 IP 每天 100 次、每分钟 10 次、同 IP 最多 2 个并发冷读取。`CHART_READS_ENABLED` 默认关闭，页面要接通时需给 Pages 绑定 `CHART_QUOTA`，并配置 `CHART_IP_HASH_SALT`。普通 `/api/osu/raw`、完整 `.osz` 下载和 R2 状态接口仍属于后台能力，需 contributor 权限；静态页面和已缓存/已加载的图不受此开关影响。

## 保留期与恢复

- 正文 `suggest/items/YYYY/MM/DD/<uuid>.json` 建议保留 180 天，配置 R2 lifecycle，不公开。DO 请求映射保留 181 天，日计数两天后清理。超过正文保留期的请求不承诺恢复原收据；不要重试半年以前的请求。
- 审核桶 `suggest/reviews/` 与 `suggest/batches/` **不要套用正文桶的统一删除规则**。首版保留批次记录用于重试和核查，监控增长；将来清理须先确认无未完成批次并导出审计记录。
- 保存前同步落盘原批次 ID、数据快照。候选 commit 先写入条件更新的批次记录，再非强制推进 main。
- 请求超时后用“恢复上次保存结果”；恢复只发布/确认原候选 commit，不再创建另一份数据 commit。分支分叉则取消旧批次，保留草稿供处理冲突后新建批次。
- 数据已保存但状态未同步时，用“同步已保存的审核状态”，不再保存数据。服务端核验候选 commit 已在 main 历史中，并读取该 commit 的文件核对建议值和谱面身份。
- 依赖 main 只追加、不强制回退的正常工作方式；仓库应禁用 force push。若手工重写分支历史，先停止反馈发布，保留本机快照与批次记录，人工核对 GitHub 后再恢复。

## 本地检查与上线验收

本地测试使用假 R2/DO/GitHub，覆盖验证规则、预算、跨日 UUID、审核抢占、旧来源解除、真实 batch handler 多建议一次 commit、发布响应丢失、部分 finalize 失败后补账。它们不能代替真实 Cloudflare 的绑定、计费和条件写入验收。

本轮已通过：前端、Functions、Worker 三套 TypeScript 检查；改动涉及的应用代码 ESLint；全量 `scripts/*.test.mjs`（串行）；`npm run build` 静态导出。浏览器已核对反馈页面、三类编辑、刷新后重新选择目标恢复草稿、整轮 RF/LN 标签、无配置时禁用提交。没有执行真实 OAuth、Turnstile 提交或线上审核。

上线前需在预览环境完成：匿名正常提交与重复 UUID、Turnstile 失败、两位审核员竞争、采纳多条一次保存、保存断线恢复、状态补账、静态刷新不消耗 Functions/KV、关闭入口仍能浏览和使用后台。同时核对实际 Worker/DO/R2 操作增量、生命周期、CORS 和域名检查。

当前完成的是本地代码与本地验证；生产提交服务尚未开放。代码已提交推送，**仍未部署**，也不触发正在进行的合包。

## 错误文案（2026-09-21 补）

`src/lib/suggestions/{validation,patch}.ts` 的 `message` / `detail` 是**中文诊断原文**：它们是纯逻辑，被 `src/` + `functions/` + 独立 Worker 三边共用，服务端日志与审核页靠它读原因，所以**原文不动**。玩家看到的是 `src/lib/suggestions/errorText.ts` 按**错误码**选出的句子；码认不出来（前端上线早于服务端）退回原文，不会出现空白提示。

在这之前有三处直接把内部文本露给玩家：提交失败时拼出裸机器码（`DISABLED` / `RATE_LIMITED` / `BUDGET_EXHAUSTED`，两种语言下都是乱码）、校验失败拼中文 `message` 与全角分号、预览区直接渲染 `patch.ts` 的中文 `detail`。

- 校验码与计划码是**联合类型**，`errorText.ts` 的表用 `Record<码, [中文, 英文]>` 写 —— 新增一个码不补文案，`npm run typecheck` 直接报错。
- 提交失败码来自**独立 Worker**（另一个构建单元，tsc 看不见），由 `scripts/suggest-error-text.test.mjs` 扫 Worker 源码的码字面量对账。
- 计划失败的 `params`（轮次/槽位等插值值）由 `patch.ts` 提供，否则本地化句子只能丢掉具体 ID 或把中文夹进去。
- **该测试不覆盖三处组件接线**：那三处只有 typecheck 与人工核对，没有自动化断言（组件逻辑没有便宜的运行时测试手段）。

## 测试契约对账（2026-09-21 补）

暂停记录里"旧测试保留部分旧假设、恢复时应统一测试契约，不能只看当前绿灯"那条，指的是这个：

`workers/feedback/src/store.ts` 里曾有一个更早的 `storeSuggestion` + `r2ObjectStore` + `ObjectStore`「通用写入」版本。**生产从不调用它** —— 真正的落盘是 `index.ts` 编排里的条件创建（`onlyIf: { etagDoesNotMatch: '*' }`，条件写失败时重读一次判定 replay）。而且两份实现已经漂移：骨架写 `revision: 1`，真路径写 `revision: 0`（审核状态 CAS 的基准是 0）。

它只被两条测试引用（写失败 → 不假装成功；落盘不含 token 且 `status` / `revision`）。这两条**绿灯，测的却是一条不跑的路** —— 比不测更危险，因为"落盘记录长什么样"看起来已经被覆盖了。已删掉骨架与那两条用例，其中有价值的断言（`status: 'pending'`、`revision: 0`、正文不含 token）并入了编排用例，对着真路径断言；把 `revision` 改回 1 会让它变红（已验）。

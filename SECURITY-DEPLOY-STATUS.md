# 安全改造部署状态（交接文档）

> 这份文档记录安全改造的当前进度、待验证项和已知遗留问题。压缩对话后照这份继续即可。
> 最后更新：2026-06-03

---

## 一句话现状

安全改造**已全量上线、osu 登录已验证通过**（站长身份能进后台）。当前在排查图包相关的两个小 bug。

---

## 已完成（已上线）

把原来"明文邀请码 + 后端裸奔"的管理后台，升级为完整的鉴权 + 权限 + 恢复体系：

1. **身份层**：osu! OAuth2 登录（授权码模式），后端签发 HMAC 签名的 HttpOnly session cookie（7 天有效）。删除了明文邀请码 `data/invite-codes.json`。
2. **权限层（四级）**，后端每个写操作前校验：
   - `owner` 站长（你，`BOOTSTRAP_OWNER_UID=29165753`，永不可被降权）
   - `admin` 管理员（含删除权，可管理 contributor）
   - `contributor` 普通管理员（增/改/上传，**无删除权**）
   - `readonly` 普通用户（任何已登录但不在名单里的人，只能看）
3. **恢复层**：
   - 比赛软删除 → KV 回收站（30 天 TTL 自动过期，可在后台一键恢复）
   - 谱面软删除 → R2 `trash/` 前缀（可恢复，过期由每日 Action 清理）
   - 每日 R2 备份到第二个桶（GitHub Actions，复用已有 R2 密钥）
   - 审计日志（谁/何时/做了什么，存 KV，180 天 TTL，后台可查）
4. **中间件**：`functions/api/_middleware.ts` 统一拦截所有 `/api/*`，未登录一律 401（放行 auth 端点）。
5. **登录走 Deno Deploy 中转代理**（见下面"登录链路"一节）。

### 新增/改动的文件

**后端共享库** `functions/api/_lib/`：`cors.ts` `auth.ts` `audit.ts` `osu.ts` `trash.ts`
**后端中间件**：`functions/api/_middleware.ts`
**后端 auth 端点**：`functions/api/auth/` 下 `login.ts` `callback.ts` `logout.ts` `me.ts`
**后端新端点**：`functions/api/admins/index.ts`（名单管理）`functions/api/trash/index.ts`（回收站）`functions/api/audit/index.ts`（日志）
**改造的写接口**（加鉴权+审计+软删除）：`tournaments/index.ts` `tournaments/[id].ts` `references.ts` `packs-manifest.ts` `maps/upload.ts` `maps/delete.ts`
**前端组件**：`src/components/admin/` 下 `AdminsManager.tsx` `TrashManager.tsx` `AuditLog.tsx`
**前端页面**：`src/app/admin/page.tsx`（邀请码→osu 登录，按角色显隐 UI）
**备份**：`scripts/backup-r2.js` + `.github/workflows/backup-r2.yml`（每天 UTC 18:07 跑）
**类型检查**：`functions/tsconfig.json` + 装了 `@cloudflare/workers-types`（build 排除了 `functions/` 和 `osu-proxy/`，需单独 tsc 校验）
**Deno 代理**：`osu-proxy/main.ts`（部署在 Deno Deploy，详见下节）
**文档**：`SECURITY-SETUP.md`（站长操作清单）

---

## 登录链路（含中转代理）

```
浏览器 ──> osu 授权页（直连 osu，无代理）
浏览器 <── code（带回 callback）
Cloudflare Pages Function /api/auth/callback
   │
   │  POST {code, client_id, client_secret} 
   ▼
Deno Deploy 代理（osu-proxy/main.ts）
   │  转发到 https://osu.ppy.sh/oauth/token
   ▼
osu! → 返回 access_token
   │
   │  GET /me 同样走代理转发
   ▼
拿到 osu 用户 → 签发 session cookie → 重定向 /admin
```

### 为什么需要中转代理（核心 bug 根因）

osu.ppy.sh 在 Cloudflare 后面。Cloudflare Pages Functions 的出口走 **Cloudflare Workers 共享 IP 池**。osu 的 Cloudflare 边缘按 IP 限流，把整个 IP 池里别人家 Worker 的流量都算进来 → 你的 token 交换请求**恒定 429**，错误响应 `server=cloudflare`、`cf-mitigated=` 空，等多久都不退。这是 osu + Cloudflare Workers 的已知架构问题，不是临时限流。

**走 Deno Deploy（Google IP，非 Cloudflare）转一手**就绕开了。代理只做透传，自带 `X-Proxy-Secret` 校验防滥用，`client_secret` 仍只存在 Cloudflare 端。

### 关键 commits

- `0549c4a` 加 User-Agent（猜错方向，无效但保留没害）
- `e430fbf` 诊断信息透传 —— 这次定位到 `server=cloudflare` 才确诊根因
- `e0d4363` 引入 Deno Deploy 中转代理（OAuth `/token` + `/me`）
- `1e5dce4` 把 `osu-proxy/` 从 Next.js TS 检查排除
- `31b38b9` 谱面裁剪：去 storyboard 事件 + 保留打击音效（待验证）
- `dd3ca9a` v1 `get_beatmaps` 也走代理 + 批量导入可中断 —— 之前 `/api/osu/beatmap` 直连 osu，97 行批量导入触发同一个 429 根因

---

## 代理迁移预案（万一 Deno 也炸了）

> 万一 Deno Deploy 之后也开始 429（osu 边缘把 GCP IP 段也限了）/ Deno 服务挂了 / Deno 改商业策略，
> 整个 osu 代理需要换平台。这一节列出"30 分钟换家"的具体步骤。

### 先看影响评估

代理挂了**不丢数据**：
- 代理只透传，无凭据（无 osu client_secret、无 access_token、无 DB）
- 已登录用户的 session cookie 7 天有效，代理挂掉时已登录的人继续能用
- 比赛 JSON 在 GitHub、谱面在 R2、KV 在 Cloudflare —— 全在 Cloudflare 自己家，跟代理无关
- 公开站（首页天梯、下载页）零 API 调用，**完全不受影响**

代理挂了**只断两件事**：
- 新登录（osu OAuth `/token` + `/me`）
- 批量导入图池（v1 `/get_beatmaps` 元数据查询）。`.osz` 自动下载走 catboy/nerinyan 镜像，不经代理

### 候选平台

| 平台 | 出口 IP 段 | 免费额度 | 部署方式 | 优先度 |
|---|---|---|---|---|
| **Deno Deploy** | Google Cloud | 100 万请求/月 | git push 自动 | 当前用的 |
| **Vercel** | AWS + Vercel 边缘 | 100GB 流量/月 | git push 自动 | 🟢 备选 1 |
| **Fly.io** | 各机房独享 IP | 3 个 shared-cpu-1x VM | `flyctl deploy` | 🟡 备选 2（要写 Dockerfile） |
| **Render / Railway** | AWS 等 | 750 小时/月 | git push 自动 | 🟡 备选 3 |
| **Cloudflare Workers** | 同 osu 自己 | — | — | ⚫ 不能用（就是它的池子被限流） |
| **VPS（阿里云日本 / Vultr 东京 / Linode 新加坡）** | 独享 IP | 5-15 USD/月 | scp + systemd | ⚫ 最终兜底（独享 IP，osu 看到只有你） |

**首选 Vercel**：跟 Deno 一样 git push 自动部署、免费额度对小流量足够、IP 段跟 Cloudflare/Deno 都不重叠。

### 搬到 Vercel 的具体步骤

1. **改 `osu-proxy/main.ts` 适配 Vercel Edge Function**：把 `Deno.serve(...)` 包成默认导出，`Deno.env.get(...)` 换成 `process.env`，其余逻辑（cors、authorized、三个端点）一字不改。新建 `osu-proxy/api/index.ts`：
   ```ts
   export const config = { runtime: 'edge' }
   const PROXY_SECRET = process.env.PROXY_SECRET ?? ''
   // ...保留原 cors / authorized / token / me / v1/get_beatmaps 逻辑
   export default async function handler(req: Request) { /* same body */ }
   ```
2. Vercel 注册 → 导入 GitHub repo（osumania-ladder）→ **Root Directory** 设为 `osu-proxy` → Framework Preset 选 "Other"
3. **Settings → Environment Variables** 加 `PROXY_SECRET`，值跟当前 Cloudflare 的 `OSU_PROXY_SECRET` **完全一致**
4. 部署后拿到 `https://<项目名>.vercel.app`
5. **Cloudflare Pages → Settings → Environment Variables 改 `OSU_PROXY_URL`**（Production + Preview 都要改），从 `https://osumania-ladder.shadiaojunshi.deno.net` 改成 Vercel URL
6. **Cloudflare Deployments → 最近一次部署 Retry**（改环境变量不会自动重部署）
7. 验证：能登录进 admin / 批量导入贴一行能查通

代码改动 < 20 行，主要是 Deno API → Edge Function API 的形式变换。

### 搬到 Fly.io 的步骤（如果 Vercel 也炸）

写 Dockerfile，Deno 官方镜像直接用：
```dockerfile
FROM denoland/deno:latest
WORKDIR /app
COPY main.ts .
RUN deno cache main.ts
CMD ["run", "--allow-net", "--allow-env", "main.ts"]
```
然后 `flyctl launch` → 选机房（`nrt` 东京 / `sjc` 加州）→ `flyctl secrets set PROXY_SECRET=<同值>` → `flyctl deploy` → 拿到 `<app>.fly.dev` URL。Cloudflare 端同 Vercel 第 5-7 步。

### 终极兜底：自购 VPS

只有 Vercel + Fly.io 都被同样限流时才走这步（极小概率）。挑 IP 干净的小机房（阿里云日本 / Vultr 东京 / Linode 新加坡），月 5-15 USD。
- 装 Deno：`curl -fsSL https://deno.land/install.sh | sh`
- `main.ts` scp 上去，systemd 包一层 service
- Cloudflare Tunnel（cloudflared）打通公网（不用买域名、不用配 nginx），或自己 nginx + Let's Encrypt
- 优势：**独享 IP**，osu 边缘看到的就只有你，限流概率最低

### 平时怎么监测代理是不是要炸

代理根路径是健康检查端点（无需密钥）：
```
curl https://osumania-ladder.shadiaojunshi.deno.net/
→ {"ok":true,"service":"osu-proxy","secretConfigured":true}
```
挂一个 UptimeRobot / Better Stack 免费监控，每 5 分钟拉一次 `/`，非 200 就邮件提醒。

如果某天你看到「登录卡顿但 `/` 返回 OK」，说明上游 osu 边缘 429，不是代理本身——这就是要换平台的信号。

---

## 配置对账（已确认一致）

| 项目 | 值 | 代码读取的变量 |
|---|---|---|
| 站点域名 | `https://osumania-ladder.pages.dev` | `SITE_URL`（结尾不能带斜杠，回调由它派生 `/api/auth/callback`） |
| osu client_id | `58854` | `OSU_CLIENT_ID` |
| 站长 osu id | `29165753` | `BOOTSTRAP_OWNER_UID` |
| KV 命名空间 | `osumania-ladder-kv` | 绑定变量名必须是 `LADDER_KV` |
| R2 备份桶 | `osumania-ladder-maps-backup` | workflow 里的 `R2_BACKUP_BUCKET` |
| osu 回调 | `https://osumania-ladder.pages.dev/api/auth/callback` | 由 `SITE_URL` 派生，须与 osu 应用登记的一致 |
| Deno 代理稳定 URL | `https://osumania-ladder.shadiaojunshi.deno.net` | `OSU_PROXY_URL`（**用稳定域名，不要带 build ID 的 preview URL**） |

**站长自己填、不用告诉 AI 的 secret**：
- `OSU_CLIENT_SECRET`（osu 应用密钥）
- `SESSION_SECRET`（随机串，`openssl rand -hex 32` 生成）
- `OSU_PROXY_SECRET`（Cloudflare 端）= `PROXY_SECRET`（Deno 端）—— 必须**完全一致**

**沿用的旧 secret**：`GITHUB_TOKEN`、`GITHUB_REPO`、`OSU_API_KEY`（v1 抓谱面元数据用，已重置过）、`R2_ACCOUNT_ID/ACCESS_KEY/SECRET_KEY`

⚠️ **KV 绑定要在 Production 和 Preview 两个环境都加**，否则预览部署会 500。
⚠️ **Deno 代理用 app 的稳定生产域名**（`<app>.<org>.deno.net`），别用带 build ID 的 preview URL（每次重部署 build ID 会变，URL 会失效）。

---

## 待办（按优先级）

1. **[Bug 修复] 谱面缺曲绘 + 红色错误提示**
   - 已修代码（commit `31b38b9`）：自动下载图包时裁掉 `[Events]` 段的 storyboard 事件、保留所有打击音效（`.wav/.ogg/.mp3`）。
   - **需要用户重新跑一遍受影响图的"自动下载并上传"** → 老的 R2 文件是按旧逻辑裁的，仍然坏。重传一次后才能验证。
2. **[排查中] THMC4 F/GF 文件"重合"**
   - 数据层确认：F=`round-7`、GF=`round-8`，roundId 不同，R2 路径分别是 `maps/touhou.../round-7/...` 和 `maps/touhou.../round-8/...`，**不会互相覆盖**。
   - 但 JSON 里两轮的图池**完全相同**（同 slot、同 beatmapsetId、同名），所以两边文件内容确实一样——这是数据本身决定的，不是 bug。
   - **需要用户重传后确认**：R2 里 `round-7/` 和 `round-8/` 是不是两个独立文件夹。如果是，pass；如果发现真落进同一个文件夹，那才是真 bug。
3. **[遗留] 合包填链接**：用户说"懒得填，反正合完了"，暂缓。
4. **[当前对话] 下载图包的其它 bug**：用户即将描述具体症状。

---

## 给接手 AI 的提醒

- **安全约束**：之前泄露过一个 osu **v1** API key（已被用户重置）。绝不提交任何密钥到 git、绝不在回复里回显密钥值、只用环境变量名引用。
- **架构关键事实**：
  - 公开站 100% 静态：比赛数据 build 时由 `scripts/generate-tournaments.js` 生成进 bundle，公开页零 API 调用 → 所有 `/api/*` 都是纯管理接口，全部上锁不影响访客。
  - 比赛 JSON 存 **GitHub** repo（有 commit 历史 = 可 revert 还原），谱面 .osz 存 **R2**（无历史 = 真正需要备份）。
  - `npm run build` **排除** `functions/` 和 `osu-proxy/`，改后端必须单独跑 `npx tsc --noEmit -p functions/tsconfig.json` 校验。Deno 代理改完一般不用本地校验，看 Deno Deploy 的 build 日志即可。
- **登录链路**：永远经过 Deno 代理。改 `functions/api/_lib/osu.ts` 时要保留 proxy 路径分支，并继续把 `env` 透传给 `fetchOsuMe(env, token)`。
- **部署机制**：
  - Cloudflare Pages 靠 git push 自动部署，推上去 2-4 分钟生效。
  - Deno 代理也是 git push 自动部署，推上去几十秒就好。
  - 改 Cloudflare 环境变量**不会自动重部署**，要么 Deployments 标签里 Retry，要么推个空 commit 触发。
- **工作目录**：`d:/osumania ladder`（路径带空格，bash 里 cd 会触发权限提示，用绝对路径）。
- **Windows 行尾**：git 会提示 LF→CRLF，无害。

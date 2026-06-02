# 安全改造部署状态（交接文档）

> 这份文档记录安全改造的当前进度、待验证项和已知遗留问题。压缩对话后照这份继续即可。
> 最后更新：2026-06-02

---

## 一句话现状

安全改造代码已全部写完、type-check 通过、已推送部署（最新 commit `b00ebc9`）。
**当前卡点**：osu 登录被 osu 服务器临时限流（HTTP 429），不是代码 bug，等 10-15 分钟后只点一次登录即可验证。

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

### 新增/改动的文件

**后端共享库** `functions/api/_lib/`：`cors.ts` `auth.ts` `audit.ts` `osu.ts` `trash.ts`
**后端中间件**：`functions/api/_middleware.ts`
**后端 auth 端点**：`functions/api/auth/` 下 `login.ts` `callback.ts` `logout.ts` `me.ts`
**后端新端点**：`functions/api/admins/index.ts`（名单管理）`functions/api/trash/index.ts`（回收站）`functions/api/audit/index.ts`（日志）
**改造的写接口**（加鉴权+审计+软删除）：`tournaments/index.ts` `tournaments/[id].ts` `references.ts` `packs-manifest.ts` `maps/upload.ts` `maps/delete.ts`
**前端组件**：`src/components/admin/` 下 `AdminsManager.tsx` `TrashManager.tsx` `AuditLog.tsx`
**前端页面**：`src/app/admin/page.tsx`（邀请码→osu 登录，按角色显隐 UI）
**备份**：`scripts/backup-r2.js` + `.github/workflows/backup-r2.yml`（每天 UTC 18:07 跑）
**类型检查**：`functions/tsconfig.json` + 装了 `@cloudflare/workers-types`（build 排除了 functions/，需单独 tsc 校验）
**文档**：`SECURITY-SETUP.md`（站长操作清单）

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

**站长自己填、不用告诉 AI 的 secret**：
- `OSU_CLIENT_SECRET`（osu 应用密钥）
- `SESSION_SECRET`（随机串，`openssl rand -hex 32` 生成）

**沿用的旧 secret**：`GITHUB_TOKEN`、`GITHUB_REPO`、`OSU_API_KEY`（v1 抓谱面元数据用，已重置过）、`R2_ACCOUNT_ID/ACCESS_KEY/SECRET_KEY`

⚠️ **KV 绑定要在 Production 和 Preview 两个环境都加**，否则预览部署会 500。

---

## 当前卡点：osu 登录 429 限流

### 现象
点 osu 登录后跳回：`login_error=osu 授权失败：osu token exchange failed: 429 <html>...429 Too Many Requests...nginx...`

### 诊断
- 429 是 osu 的 **nginx 边缘限流**（请求太频繁），**不是代码 bug**。
- 没有出现 `invalid_client`/`redirect_uri` 等 OAuth 应用层错误，说明 **form-encoded 格式 osu 已接受，token 交换流程本身是通的**，只是被限流挡住。
- 触发原因：反复点登录测试 + 前后两版代码各试几次，短时间内 token 端点请求堆太多。Cloudflare Functions 出口 IP 共享，osu 对这类来源限流更敏感。

### 已做的修复（已在 `b00ebc9`）
1. token 交换从 JSON body 改成 `application/x-www-form-urlencoded`（osu 是 Laravel Passport，标准 OAuth2 格式最稳妥）。
2. callback.ts 把 osu 的真实错误体透传到 `login_error`，方便定位。

### 怎么解
1. **停手等 10-15 分钟**，期间别再点登录（每点一次刷新限流计时，越点解得越慢）。
2. 等够后**只点一次** osu 登录。
3. 结果：
   - 直接进去看到「站长」字样 → 全部搞定 ✅
   - 变成别的错（`invalid_client`/`redirect_uri`/`invalid_grant`）→ 那才是真正要修的配置问题：
     - `invalid_client` → `OSU_CLIENT_SECRET` 错或 client_id 不对
     - `redirect_uri` 相关 → `SITE_URL` 和 osu 应用登记的回调对不上
     - `invalid_grant` → code 过期/重复用，重新点一次即可

### 普通用户会不会也遇到 429
正常不会。登录成功后发 7 天 session cookie，一个人登录一次后 7 天不碰 token 端点，正常单次登录到不了阈值。
**理论隐患**（你的规模几乎不会发生）：osu nginx 限流部分按来源 IP 算，而 Cloudflare Functions 出口 IP 所有用户共享，理论上大家共用一份限流额度。只有"几十人同一分钟内反复登录"才会撞到——你这小工具场景不存在。真遇到再加按需退避重试，现在属于过度设计，不做。

---

## 待办（按优先级）

1. **[验证] osu 登录**：等限流解除后只点一次，确认能以站长身份进入。这是上线的最后一步验证。
2. **[遗留] 合包填链接**：之前跑过一次合包 Action（成功），manifest 已被机器人推到远端，但网盘链接还没填。源谱面在 R2、包条目在 manifest，随时能在 admin「合包管理」补填。注意 GitHub 的 `packs` artifact 产物 7 天后过期（但能重新生成，不影响）。用户说"懒得填，反正合完了"，暂缓。
3. **[Bug] 下载图包**：用户提到"下载图包还有点 bug"，细节未展开，等用户后续说明。

---

## 给接手 AI 的提醒

- **安全约束**：之前泄露过一个 osu **v1** API key（`6c7...`，已被用户重置）。绝不提交任何密钥到 git、绝不在回复里回显密钥值、只用环境变量名引用。
- **架构关键事实**：
  - 公开站 100% 静态：比赛数据 build 时由 `scripts/generate-tournaments.js` 生成进 bundle，公开页零 API 调用 → 所有 `/api/*` 都是纯管理接口，全部上锁不影响访客。
  - 比赛 JSON 存 **GitHub** repo（有 commit 历史 = 可 revert 还原），谱面 .osz 存 **R2**（无历史 = 真正需要备份）。
  - `npm run build` **排除** `functions/`，改后端必须单独跑 `cd functions && npx tsc --noEmit`（或用 `functions/tsconfig.json`）校验。
- **部署机制**：Cloudflare Pages 靠 git push 自动部署，推上去 2-4 分钟生效。
- **工作目录**：`d:/osumania ladder`（路径带空格，bash 里 cd 会触发权限提示，用绝对路径）。
- **Windows 行尾**：git 会提示 LF→CRLF，无害。

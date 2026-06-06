# 合包自动上传到 123 云盘 —— 调研归档

> 2026-06-03 调研。修完 bug 后回来照这份继续做。

## 背景

当前合包流程是 GitHub Actions 跑 `scripts/generate-pack.js` 生成 `.osz`，扔到
`actions/upload-artifact` 暂存 7 天，**后续手动**：下载 artifact → 传网盘 →
回 admin 后台填链接。手动环节是瓶颈，目标是合完直接出可用链接，零人工。

设计文档 [docs/superpowers/specs/2026-05-17-download-pack-feature-design.md](superpowers/specs/2026-05-17-download-pack-feature-design.md)
里 Phase 4 一直挂着没做：Google Drive 自动上传（可选）。本次决定改做 **123 云盘**，
理由：站长有 123 Pro 大容量账号，直接用更划算；中文用户用 123 也比 Google Drive 顺手。

## 容量 / 到期 / 换账号风险评估

- 站长有 Pro 大容量账号，但担心 Pro 到期后掉到 15GB，已传文件命运不明。
- 没找到 123 官方权威说法。按国内云盘惯例（包括 123 旧帖讨论）：
  - 已传文件大概率**不删除**，可读、可分享。
  - **无法再上传新文件**（直到清理或续费）。
  - 严重超容时**下载可能被限速**（123 对非会员本来就限速）。
- 不能 100% 保证。所以兜底策略一并做：每次合包同时存为 **GitHub Release asset**
  （免费、不限期），123 链接挂了能 fallback。R2 里始终有原始 .osz，再不济重跑
  Actions 重生成重传。
- 换账号对系统：改 Cloudflare 两个 secret 即可（`PAN123_CLIENT_ID` /
  `PAN123_CLIENT_SECRET` 或 refresh token），代码不需要动。
- 换账号对人：可以选择不迁移旧文件 —— `packs-manifest.json` 里 `links.drive123`
  是按 realType 存的字符串，新旧账号的链接可以混合共存。

## 123 开放平台关键事实（来源：第三方 SDK + Alist/OpenList 文档）

- 官方有「123 开放平台」，走 OAuth-style：申请应用拿
  `client_id` + `client_secret` → 登录授权拿 `access_token`（短期）+
  `refresh_token`（长期）。
- **申请门槛：需要 VIP 会员**（站长 Pro 满足）。审核几天到一周。
- 单文件最大 **30GB**，支持分片上传，远大于我们任何一个合包（最多几百 MB）。
- 上传协议大致：
  1. `POST /upload/v1/file/create` —— 报文件 sha1、文件名、父目录 ID、文件大小，
     拿到 `preuploadID`、`sliceSize`。秒传命中直接返回 fileId。
  2. `POST /upload/v1/file/slice` —— 按 `sliceSize` 分片 PUT 每片。
  3. `POST /upload/v1/file/upload_complete` —— 通知合并，拿 `fileId`。
  4. `POST /api/v1/share/create` —— 用 `fileId` 生成分享链接（可设密码、过期）。
- QPS 限制存在但 Actions 一次最多十几张图，够用。
- 防滥用条款禁止分发服务，但合规 osu! 谱面合包给参赛者下载属正常用途。
- 现成 Node.js SDK 没看到；Go 有 [123pan-3rd/go-sdk](https://pkg.go.dev/github.com/123pan-3rd/go-sdk)
  和 PHP 版本可参考接口形态。我们自己用 Node `crypto` + `fetch` 实现就够。

## 落地计划（先列住，等申请下来再开搓）

### 准备工作（站长做）

> **2026-06-06 更新**：123 现在把开放平台调用入口改放在「开发者权益包」里，
> 而且还在**内测**。直接「应用接入」入口不见了，需要先申请权益包。

1. 登录 [123pan.com](https://www.123pan.com/)，进开放平台页面。
2. 点页面里「123云盘开发者权益包内测版申请」链接，提交内测申请。门槛：
   VIP / SVIP / 长期 VIP 会员（站长 Pro 满足）。审核估计几天到一周。
3. 通过内测后才能开通「开发者权益包」，然后才会看到应用创建入口。
   - 应用名：`osumania-ladder-packs`（随便起）
   - 回调 URL：`https://osumania-ladder.pages.dev/api/123pan/callback`
4. 拿到 `client_id` 和 `client_secret`。`client_id` 给 AI；
   `client_secret` 直接填 Cloudflare Pages secret（变量名 `PAN123_CLIENT_SECRET`），
   不告诉 AI。
5. 第一次跑一个 Cloudflare Pages Function `/api/123pan/connect` 触发授权流，把
   `refresh_token` 写进 Cloudflare KV，之后 GitHub Actions 跑的时候由 CF 端
   提供短期 `access_token`（CF 有 KV、定期刷新更稳；Actions 直接拿 refresh
   也行但要把 token 存 GitHub Secret，更新麻烦）。

### 代码改动

**新增：**

- `functions/api/123pan/connect.ts` —— 站长走授权流，拿 refresh_token 入 KV。
- `functions/api/123pan/token.ts` —— Actions 调，拿短期 access_token（要校验
  调用方密钥防滥用）。
- `scripts/upload-to-123pan.js` —— 走分片上传 + 创建分享，输出 link 写回
  `data/packs-manifest.json` 的 `links.drive123` 字段。

**改：**

- `.github/workflows/generate-packs.yml` —— `Generate packs` 后接两步：
  1. 调 `node scripts/upload-to-123pan.js`，把 `output/*.osz` 全传上去，
     合并的 manifest patch 输出到 stdout。
  2. 顺带把 `output/*.osz` 也发布成 Release asset（兜底）。
  3. 提交 `data/packs-manifest.json`（已有这步）。

### 兜底：GitHub Release asset

- workflow 多一步 `softprops/action-gh-release@v2`，把 `output/*.osz` 当成
  asset 发布（tag 用 `packs-YYYYMMDD-HHMM`）。免费、不限期、可直链下载。
- `packs-manifest.json` 加一个 `fallbackUrl` 字段指向 Release asset，前端在
  123 链接没填或挂了时显示这个。

### Secrets 清单

| 变量 | 哪里 | 谁填 |
|---|---|---|
| `PAN123_CLIENT_ID` | Cloudflare Pages | 站长 |
| `PAN123_CLIENT_SECRET` | Cloudflare Pages | 站长 |
| `PAN123_PARENT_FOLDER_ID` | Cloudflare Pages | 站长（在 123 里建 `osumania-packs` 文件夹拿 ID） |
| `PAN123_PROXY_SECRET` | GitHub Secrets + Cloudflare Pages（同值） | 站长（Actions 调 token 端点的认证） |

## 待你确认 / 完成后回到这里继续

- [ ] 站长提交「开发者权益包」内测申请（截图里那个链接）
- [ ] 内测通过后开通权益包、创建应用，拿到 `client_id`，告诉 AI
- [ ] 站长把 `client_secret` 填进 Cloudflare Secret
- [ ] AI 写代码（按上面"代码改动"分支）
- [ ] 跑一次完整的 Generate Map Packs，确认链接自动写回

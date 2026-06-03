# 合包自动上传到 Google Drive —— 调研归档

> 2026-06-03 调研。和 [123pan-auto-upload-research.md](./123pan-auto-upload-research.md) 是兄弟方案,
> Google Drive 优先级低于 123(123 容量大),但作为**兜底**值得做。compact 后照这份开搓。

## 关键事实(决定方案的)

1. **Google Drive 个人账号永久免费 15GB**(和 Gmail / Photos 共享额度)。Google One 100GB 起约 1.99 USD/月,但**国内 IP 充值困难**,需要海外信用卡或第三方代充。
2. **Service Account 自己有独立 15GB 配额,无法购买扩容,无法迁移到付费**。这是死规定([Stack Overflow 高赞](https://stackoverflow.com/questions/40535355/how-to-fix-the-storage-exceeded-issue-for-google-drive-when-uploading-using-serv))。
3. **Service Account 要用大容量必须配 Shared Drive(Workspace 功能)** —— Workspace Business Standard 12 USD/月起,Shared Drive 默认 100GB。
4. **个人 OAuth refresh_token 默认不过期**,前提是 Google Cloud Console 里把 OAuth consent screen 切到 **Production** 状态;停在 Testing 状态的话 refresh_token 7 天就失效。
5. **GitHub Marketplace 有现成 action**(`mathisve/gdrive-upload-action`、`willo32/google-drive-upload-action`),可以省掉手写上传逻辑;要么也可以自己用 `googleapis` npm 包写,几十行就够。
6. Drive API 单文件大小理论上没限制,但 GitHub Actions runner 临时盘有 14GB,合包远小于这个数,无视。
7. 上传后调 `permissions.create({role: 'reader', type: 'anyone'})` 把文件设为"任何人有链接可访问",拿到 `webViewLink`(浏览器打开页) 或 `webContentLink`(直接下载)。

## 三种方案对比

| 方案 | 容量 | 成本 | 实现难度 | 推荐度 |
|---|---|---|---|---|
| **A. 站长 OAuth refresh_token + 个人 Drive** | 站长 Google 账号配额(免费 15GB,可升级) | 0(15GB 内) | ★★ 中 | **🟢 首选** |
| **B. Service Account + 站长个人 Drive 共享文件夹** | Service Account 自己的 15GB(独立) | 0 | ★ 低 | 🟡 备选(15GB 上限不能突破) |
| **C. Service Account + Workspace Shared Drive** | 100GB+(Workspace 池子) | 12 USD/月 | ★★★ 高 | 🔴 不推荐(贵且杀鸡用牛刀) |

### 为什么不优先 Service Account(方案 B)

直觉上 Service Account 不需要交互、最干净。但坑在:**Service Account 把文件传进站长 Drive 里某个文件夹后,文件所有者仍是 Service Account 自己**,占的是 Service Account 那不可买的 15GB,不占站长账号配额。所以方案 B 容量天花板是 15GB,且不可升级。除非搞 Workspace + Shared Drive,但 Workspace 不便宜。

### 为什么 OAuth(方案 A)推荐

- 容量直接挂在站长账号上,免费 15GB,要扩容可买 Google One(国内麻烦,但作为兜底 15GB 够用)。
- refresh_token 拿到一次终身用(只要 OAuth app 在 Production)。
- 缺点是首次配置麻烦:要在 Google Cloud Console 建项目、配 consent screen、跑一次 OAuth flow 拿 refresh_token、把 token 填进 GitHub Secret。但**只配一次**。

## 方案 A 落地步骤(站长操作)

> 如果你看到这步还没做,先做这步;做完了告诉 AI,AI 开搓代码。

### 1. 创建 Google Cloud 项目 + 启用 Drive API

1. 访问 [console.cloud.google.com](https://console.cloud.google.com/)。
2. 顶部「选择项目」→「新建项目」,名字 `osumania-ladder-packs`。
3. 左侧菜单「APIs & Services」→「Library」→ 搜 `Google Drive API`,点开,点 **Enable**。

### 2. 配置 OAuth consent screen

1. 左侧「APIs & Services」→「OAuth consent screen」。
2. User Type 选 **External**(只有 Workspace 才能选 Internal)。
3. App name 填 `osumania-ladder-packs`,User support email 填站长邮箱。
4. Scopes 那一步加 `https://www.googleapis.com/auth/drive.file`(只能看/操作 app 自己创建的文件,最小权限,推荐)或 `drive`(全 Drive 权限,不推荐)。
5. Test users 加站长自己的 Google 账号邮箱。
6. **重要:** 这步完成后默认是 **Testing** 状态,refresh_token 7 天过期。后面要点「PUBLISH APP」切到 Production —— 因为我们 scope 只是 `drive.file`(非敏感),**不需要 Google 审核**,直接发布即可。

### 3. 创建 OAuth Client ID

1. 左侧「APIs & Services」→「Credentials」→「+ CREATE CREDENTIALS」→「OAuth client ID」。
2. Application type 选 **Desktop app**,名字随便填。
3. 创建后下载 JSON,里面的 `client_id` 和 `client_secret` 等下要用。

### 4. 跑一次 OAuth flow 拿 refresh_token

最简单的方式:[OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)

1. 右上齿轮,勾「Use your own OAuth credentials」,填上一步的 client_id / secret。
2. 左侧 Step 1,在 scope 输入框手填 `https://www.googleapis.com/auth/drive.file`,点 Authorize APIs。
3. 跳到 Google 登录页用站长账号授权。
4. 回 Playground,Step 2 点「Exchange authorization code for tokens」。
5. 复制 `Refresh token`(永久,要保管好)。

### 5. 在 Drive 里建一个目标文件夹,记下 ID

1. drive.google.com,新建文件夹 `osumania-packs`。
2. 进入这个文件夹,看 URL `https://drive.google.com/drive/folders/<文件夹 ID>`,记下 ID。

### 6. 填进 GitHub Secrets

仓库 → Settings → Secrets and variables → Actions → New repository secret,加这三个:

| Name | Value |
|---|---|
| `GDRIVE_CLIENT_ID` | 步骤 3 的 client_id |
| `GDRIVE_CLIENT_SECRET` | 步骤 3 的 client_secret |
| `GDRIVE_REFRESH_TOKEN` | 步骤 4 拿到的 refresh token |
| `GDRIVE_FOLDER_ID` | 步骤 5 的文件夹 ID |

### 7. 切 OAuth app 到 Production

回 OAuth consent screen,点「PUBLISH APP」→ 确认。状态从 Testing 变成 In production。**不做这步 refresh_token 7 天就失效**。

完成 ↑ 7 步后告诉 AI,AI 开搓代码。

## 代码实施(AI 来做)

### 新增 `scripts/upload-to-gdrive.js`

```js
// 用 googleapis 包,几十行:
//   1. 读 refresh_token + client_id/secret 拿 access_token
//   2. 遍历 output/*.osz
//   3. files.create (multipart upload, parents=[FOLDER_ID])
//   4. permissions.create (role:reader, type:anyone) 设公开
//   5. 拿 webContentLink
//   6. 把每个 .osz 对应 realType 的链接写回 packs-manifest.json 的 links.googleDrive
//   7. 输出 patch 给 workflow stdout / 直接 write 文件
```

依赖:`npm i -D googleapis`(或者写裸 fetch 走 OAuth refresh + multipart,免依赖,代码长一倍)。

### 改 `.github/workflows/generate-packs.yml`

在 `Generate packs` 之后加:

```yaml
- name: Upload to Google Drive
  if: github.event.inputs.realType == ''  # 只有全量跑才上传
  run: node scripts/upload-to-gdrive.js
  env:
    GDRIVE_CLIENT_ID: ${{ secrets.GDRIVE_CLIENT_ID }}
    GDRIVE_CLIENT_SECRET: ${{ secrets.GDRIVE_CLIENT_SECRET }}
    GDRIVE_REFRESH_TOKEN: ${{ secrets.GDRIVE_REFRESH_TOKEN }}
    GDRIVE_FOLDER_ID: ${{ secrets.GDRIVE_FOLDER_ID }}
```

紧跟在已有的 `Commit manifest` 之前(脚本会改 `data/packs-manifest.json`,然后那步就把它一起 commit)。

### 兜底文件名重复

每次合包是覆盖式,但 Drive 的 `files.create` 总是新建,不会覆盖。两种处理:

- **A. 删旧再传**:每次先 `files.list` 找同名文件 `files.delete`,再 `files.create`。链接会变。
- **B. 用稳定 fileId**:保存 fileId 到 manifest,下次用 `files.update` 覆盖。链接不变,但脚本要先读 manifest 找出之前的 fileId。

**推荐 B**,链接稳定。

## 失败模式

- **refresh_token 失效** —— 站长改了密码 / 撤销 app / 90 天没用 / 没切 Production。处理:Actions 失败,流程里 fallback 到不上传,artifact 仍然有,人工兜底。需要在脚本里把 401 / `invalid_grant` 错误明确报出来。
- **15GB 满** —— 上传失败 `storageQuotaExceeded`。处理:删 Drive 里旧 pack,或 Google One 扩容,或切 123 主、Drive 副(本来就是这个定位)。
- **Google API rate limit** —— 个人配额 1000 reqs / 100s,远超我们一次几十次的量,无视。

## 待办

- [ ] 站长按"方案 A 落地步骤"7 步配置(预计 30 分钟)
- [ ] 站长把 `client_id` 告诉 AI(secret 仨直接填 GitHub Secret 不发 AI)
- [ ] AI 写 `scripts/upload-to-gdrive.js`(走方案 B 稳定 fileId)
- [ ] AI 改 workflow 加上传步骤
- [ ] 跑一次 Generate Map Packs,确认链接进 manifest 且 /download 页面显示

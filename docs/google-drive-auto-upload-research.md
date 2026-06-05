# 合包自动上传到 Google Drive —— 调研归档

> 2026-06-03 调研。和 [123pan-auto-upload-research.md](./123pan-auto-upload-research.md) 是兄弟方案,
> 站长有 **Google AI Pro (5 TB)** Google One 订阅,所以 Google Drive 容量上**反超 123**,
> 可以当主力。123 退成"国内用户访问更顺"的次要选项。compact 后照这份开搓。

## 容量事实(2026-06-03 确认)

- 站长 Google One 方案:**Google AI Pro,5 TB**(USD 19.99/月,据用户描述"可能有一年")。
- 这 5 TB 跨 Drive / Photos / Gmail 共享。我们用合包估算每个 100-500MB,几十个合包的总量 < 50GB,**完全用不完**。
- 只要走"方案 A:站长 OAuth refresh_token"把文件传到站长账号下,容量就算在这 5 TB 里。
- 即使将来 Google One 到期回退到免费 15GB,文件**不会被删**,只是不能再传新文件;已分享链接继续可读。这与 123 的行为相同,且 Google 的退订规则更清晰、更宽容。

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
| **A. 站长 OAuth refresh_token + 个人 Drive** | 站长 Google One 5 TB(已订阅 Google AI Pro) | 已支付 | ★★ 中 | **🟢 首选(已确定)** |
| **B. Service Account + 站长个人 Drive 共享文件夹** | Service Account 自己的 15GB(独立,不共享 5 TB) | 0 | ★ 低 | ⚫ 排除(用不到 5 TB,白浪费) |
| **C. Service Account + Workspace Shared Drive** | 100GB+(Workspace 池子) | 12 USD/月 | ★★★ 高 | ⚫ 排除(贵且重复付费) |

### 为什么不优先 Service Account(方案 B)

直觉上 Service Account 不需要交互、最干净。但坑在:**Service Account 把文件传进站长 Drive 里某个文件夹后,文件所有者仍是 Service Account 自己**,占的是 Service Account 那不可买的 15GB,不占站长账号配额。所以方案 B 容量天花板是 15GB,且不可升级。除非搞 Workspace + Shared Drive,但 Workspace 不便宜。

### 为什么 OAuth(方案 A)推荐

- **容量**:5 TB Google One,合包总量再翻 50 倍也用不完。
- refresh_token 拿到一次终身用(只要 OAuth app 在 Production)。
- 缺点是首次配置麻烦:要在 Google Cloud Console 建项目、配 consent screen、跑一次 OAuth flow 拿 refresh_token、把 token 填进 GitHub Secret。但**只配一次**。

## Drive 与 123 的分工(更新后)

既然 Drive 5 TB 是主力,123 的角色调整:

- **Google Drive 主力**:容量大、refresh_token 永久、无地区限制(对海外用户更友好)。
- **123 网盘次要**:对国内用户体验更好(下载速度、不用翻墙),但需要等开放平台审核。两者并存,`packs-manifest.json` 里 `links.googleDrive` + `links.drive123` 两个字段并列填写,前端按用户喜好显示。
- 如果后面 123 申请下来很顺利,两个都自动跑;如果 123 申请卡住,Drive 单跑也够用。

## 方案 A 落地步骤(站长操作)

> 如果你看到这步还没做,先做这步;做完了告诉 AI,AI 开搓代码。

### 1. 创建 Google Cloud 项目 + 启用 Drive API

1. 访问 [console.cloud.google.com](https://console.cloud.google.com/)。
2. 顶部「选择项目」→「新建项目」,名字 `osumania-ladder-packs`。
3. 左侧菜单「APIs & Services」→「Library」→ 搜 `Google Drive API`,点开,点 **Enable**。

### 2. 配置 OAuth consent screen(新 UI 叫「Google Auth Platform」)

> 2026 年 GCP 把 OAuth 配置 UI 重做了,菜单名换了,下面按新 UI 写。老 UI 看的话:Scopes 在 OAuth consent screen 第二步,PUBLISH APP 在 OAuth consent screen 顶部。

1. 左侧 **「Google Auth Platform」→「目标对象 / Audience」**。如果是新项目首次进入,会引导你填 App name + 用户支持邮箱 + User type。User Type 选 **External**(只有 Workspace 才能选 Internal)。App name 填 `osumania-ladder-packs`。
2. **加 Scopes** —— 新 UI 在左栏 **「数据访问 / Data Access」**,不在「目标对象」里。点进去 → **「添加或移除范围」**(Add or remove scopes)→ 搜 `drive.file` → 勾 `.../auth/drive.file` → 更新 → 保存。**不要勾 `.../auth/drive`**(全 Drive 权限,会触发敏感 scope 审核流程,几周才过)。
3. **加测试用户** —— 回「目标对象」往下找「测试用户」(Test users)→ Add users → 加站长自己的 Google 账号邮箱(就是 5TB 网盘那个账号,精确填,别多打 `.`)。
4. **必须发布应用** —— 「目标对象」页顶部「发布状态」那块点 **「发布应用 / PUBLISH APP」**,确认即可。**几秒生效,不需要 Google 审核**——因为 `drive.file` 是非敏感 scope,Google 会自动放行。
   - 不发布的后果:Testing 状态下 refresh_token **7 天就过期**,自动上传跑不了几次就要重新授权。
   - 发布之后状态显示「正式版 / In production」,refresh_token 永久有效。
   - 别担心被陌生人滥用:发布 ≠ 公开,只有你自己授权过的账号能登,而且 `drive.file` 只能看到本 app 自己上传的文件,看不到你网盘里别的东西。

### 3. 创建 OAuth Client ID

1. 左侧「APIs & Services」→「Credentials」→「+ CREATE CREDENTIALS」→「OAuth client ID」。
2. **应用类型选「Web 应用 / Web application」**(不要选 Desktop app —— 后面用 OAuth Playground 拿 refresh_token,Playground 要求注册回调 URL,Desktop 类型不接受自定义回调)。
3. 名字随便填,「已获授权的重定向 URI」加这一条:`https://developers.google.com/oauthplayground`(末尾不要 `/`,Google 严格匹配)。
4. 创建后下载 JSON,里面的 `client_id` 和 `client_secret` 等下要用。

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

| Name | Value |c:\Users\SHADIA~1\AppData\Local\Temp\QQ_1780625525846.png
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

- **refresh_token 失效** —— 站长改了密码 / 撤销 app / OAuth app 卡在 Testing 状态(7 天过期)。处理:Actions 失败,流程里 fallback 到不上传,artifact 仍然有,人工兜底。需要在脚本里把 401 / `invalid_grant` 错误明确报出来。
- **5 TB 满** —— 不可能。
- **Google One 到期回退** —— 文件不删,只是不能再上新文件。处理:续费 Google One,或停止合包更新只保留旧 pack 链接,或把存量迁移到 123(改 manifest 链接即可,无需重传)。
- **Google API rate limit** —— 个人配额 1000 reqs / 100s,远超我们一次几十次的量,无视。

## 待办

- [x] 站长按"方案 A 落地步骤"7 步配置(2026-06-05 完成,OAuth 已切 Production)
- [x] 站长把 `client_id` 告诉 AI,3 个 secret 直接进 GitHub Secrets
- [x] AI 写 [scripts/upload-to-gdrive.js](../scripts/upload-to-gdrive.js)(稳定 fileId + 顺手做了孤儿清理)
- [x] AI 改 [.github/workflows/generate-packs.yml](../.github/workflows/generate-packs.yml) 加上传步骤
- [ ] 跑一次 Generate Map Packs,确认链接进 manifest 且 /download 页面显示

## 实施时落进来的额外设计

> 实施过程中跟站长讨论后调整,跟原文不一致的地方记一下:

1. **始终带 part 后缀**(`<type>_<n>.osz` + `... Pack <n>`)——原计划是"单包不带后缀,多包才带",但站长指出"既然以后会涨过 80 张,不如全部统一带后缀,UI 也不用做两套"。这从根上避免了"单包变多包时旧 entry 残留"的孤儿问题。
2. **manifest 全量重建 + Drive 同步删孤儿**——原计划只覆盖,新计划是 generate-pack.js 把旧 manifest 转储到 `data/packs-manifest.previous.json`,然后只用本次输出 entry 重建主文件;upload-to-gdrive.js 跑完用 `.previous.json` 找出"上次有 fileId 但本次没用到"的孤儿,在 Drive 上 `files.delete` 同步清理。最后清掉 `.previous.json`(.gitignore 排除)。
3. **/download 页面**:同 realType 多 part 折叠成一行,展开看 Part 1/2/3;单包(只有 part 1)平铺。


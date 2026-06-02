# 安全改造设置指南

这份文档是给站长（你）照着操作的清单。代码我已经全部写好，你只需要按下面的步骤准备好几样东西，然后告诉我其中几个值，我来完成最后的接线和部署。

> 术语速记
> - **OAuth**：让用户用 osu! 账号登录，而不是我们自己存密码。
> - **client_id / client_secret**：osu! 发给我们这个网站的一对身份凭证。`client_id` 半公开，`client_secret` 必须保密。
> - **KV**：Cloudflare 的一个小型键值数据库，我们用它存管理员名单、审计日志、回收站。
> - **secret（机密变量）**：部署平台里保存的敏感值（密钥、token），不写进代码、不进 git。

---

## 总览：你要做的 6 件事

| # | 事项 | 大概耗时 | 做完给我什么 |
|---|------|---------|-------------|
| 1 | 确认部署域名 | 2 分钟 | 你的网站域名 |
| 2 | 注册 osu! OAuth 应用 | 5 分钟 | client_id、client_secret |
| 3 | 查到自己的 osu! 用户 ID | 1 分钟 | 你的数字 ID |
| 4 | 建一个 KV 命名空间 | 3 分钟 | （绑定名我已固定，无需给值） |
| 5 | 建一个 R2 备份桶 | 3 分钟 | 桶名 |
| 6 | 在 Cloudflare 配置 secret | 5 分钟 | 配好后告诉我一声 |

全部做完，把第 1/2/3/5 的值发给我，我接最后一公里并部署。

---

## 1. 确认部署域名

OAuth 要求我们登记一个「回调地址」，也就是 osu! 登录成功后把用户送回来的网址。所以得先确定网站的域名。

**两条路，二选一：**

### A. 直接用 Cloudflare 免费域名（推荐，0 成本，先用这个）
你的项目部署在 Cloudflare Pages 上，它自带一个免费域名，形如：

```
https://<项目名>.pages.dev
```

- 打开 Cloudflare 控制台 → 左侧 **Workers & Pages** → 点开你的项目
- 顶部能看到形如 `osumania-ladder.pages.dev` 的地址，这就是你的域名
- 把这个完整地址记下来（含 `https://`）

> 回调地址就会是 `https://<项目名>.pages.dev/api/auth/callback`，这个我来填进代码，你只要把域名给我。

### B. 用自定义域名（可选，要花钱买域名）
如果你想要个好看的域名（比如 `ladder.example.com`）：

1. **买域名**：去任意域名注册商（Cloudflare Registrar、阿里云、Namesilo、Porkbun 等）买一个，几十块一年。推荐直接在 Cloudflare Registrar 买，省去后面绑定的麻烦。
2. **接入 Cloudflare**：如果不是在 Cloudflare 买的，到 Cloudflare 控制台 → **Add a site** → 输入域名 → 按提示把域名的 NS（域名服务器）改到 Cloudflare 给的两个地址（在你买域名的那个注册商后台改）。等生效（几分钟到几小时）。
3. **绑定到 Pages**：Cloudflare 控制台 → 你的 Pages 项目 → **Custom domains** → **Set up a custom domain** → 输入你的域名 → 按提示确认。Cloudflare 会自动配好 DNS 和 HTTPS 证书。
4. 记下这个自定义域名给我。

> **建议**：先用 A 方案的免费 `pages.dev` 把整套跑通，以后想换自定义域名随时可加，只需要在 osu! 应用里多登记一个回调地址即可。

---

## 2. 注册 osu! OAuth 应用

这一步是让 osu! 认识我们这个网站。

1. 用你的 osu! 账号登录 [https://osu.ppy.sh](https://osu.ppy.sh)
2. 打开账号设置的 OAuth 区：[https://osu.ppy.sh/home/account/edit](https://osu.ppy.sh/home/account/edit)，往下滚动找到 **OAuth** 区块（标题是「OAuth」/「OAuth 应用程序」）
3. 点 **New OAuth Application**（新建 OAuth 应用程序）
4. 填写：
   - **Application Name（应用名称）**：随便起，比如 `osu!mania Ladder Admin`。这个名字会显示在用户授权页面上。
   - **Application Callback URLs（回调地址）**：填你第 1 步确定的域名 + `/api/auth/callback`。例如：
     ```
     https://osumania-ladder.pages.dev/api/auth/callback
     ```
     > 如果你以后要加自定义域名，回到这里把新的回调地址也加进去（一行一个）。
     > 想本地调试的话，可以再加一行 `http://localhost:8788/api/auth/callback`（可选）。
5. 勾选同意条款，点 **Register application（注册应用程序）**
6. 注册完成后页面会显示：
   - **Client ID**：一串数字，例如 `12345`
   - **Client Secret**：一长串字母数字。**这个只显示这一次**，复制好保存。如果丢了可以点 **Reset client secret** 重新生成。

> ⚠️ **Client Secret 等同于密码**：不要发到公开聊天、不要写进代码、不要提交到 git。等下你会把它存进 Cloudflare 的 secret 里。给我的时候，也请通过相对私密的方式，或者你自己存进 Cloudflare 后只告诉我「配好了」即可——其实 **client_secret 你可以完全不告诉我**，自己填进 Cloudflare 就行（见第 6 步）。client_id 不敏感，可以直接发我。

我们需要的权限范围（scope）是 `identify`（读取登录者的基本信息：用户名 + ID）。osu! 默认就会给 `identify`，无需特别设置。

---

## 3. 查到你自己的 osu! 用户 ID

我们要把你设成「站长（owner）」，靠的是你的数字用户 ID（不是用户名，用户名可能会改，ID 永久不变）。

- 登录 osu!，打开你的个人主页
- 看浏览器地址栏：`https://osu.ppy.sh/users/12345678` —— 末尾那串数字 `12345678` 就是你的用户 ID
- 把它记下来给我

> 这个 ID 会作为 `BOOTSTRAP_OWNER_UID` 写进配置。它的特权是：**永远是 owner，任何人都无法把你降权或移除**，是整个权限体系的根。

---

## 4. 建一个 KV 命名空间

KV 用来存三样东西：管理员名单、审计日志、回收站记录。放 KV 而不是放 GitHub，是因为管理员名单不该出现在公开仓库里。

1. Cloudflare 控制台 → 左侧 **Storage & Databases** → **KV**（或在 **Workers & Pages** 下找到 **KV**）
2. 点 **Create a namespace（创建命名空间）**
3. 名字填：`osumania-ladder-kv`（名字随意，记住即可）
4. 创建完成
5. 把它**绑定**到你的 Pages 项目：
   - 进入你的 Pages 项目 → **Settings（设置）** → **Bindings**（或旧版叫 **Functions** → **KV namespace bindings**）
   - 点 **Add binding**
   - **Variable name（变量名）**：必须填 `LADDER_KV`（这个名字代码里写死了，务必一致）
   - **KV namespace**：选你刚建的 `osumania-ladder-kv`
   - 保存
   - ⚠️ 注意 Pages 区分 **Production（生产）** 和 **Preview（预览）** 两个环境，两个都加一下这个绑定最稳妥。

> 你不需要给我任何 KV 的值，只要绑定名是 `LADDER_KV` 就行。

---

## 5. 建一个 R2 备份桶

你现在的谱面文件存在 R2 主桶 `osumania-ladder-maps` 里。R2 没有版本历史，一旦误删/恶意删就找不回来。我们建第二个桶做每日自动备份。

1. Cloudflare 控制台 → 左侧 **R2**
2. 点 **Create bucket（创建存储桶）**
3. 名字填：`osumania-ladder-maps-backup`（或你喜欢的名字，记住给我）
4. 区域选默认即可
5. 创建完成，把桶名记下来给我

> 每日备份通过 GitHub Actions 跑（复用你已有的 R2 密钥），我已经写好工作流。它每天把主桶完整同步到备份桶，并清理回收站里过期的文件。

---

## 6. 在 Cloudflare 配置 Secret（机密变量）

这一步把敏感值存进 Cloudflare，代码运行时才能读到，但不会出现在 git 里。

进入你的 Pages 项目 → **Settings（设置）** → **Variables and Secrets**（或 **Environment variables**）。
对下面每一项点 **Add variable**，**类型选 Secret（加密）**，分别添加：

| 变量名（必须完全一致） | 值 | 说明 |
|----------------------|----|----|
| `OSU_CLIENT_ID` | 第 2 步的 Client ID | osu! 应用 ID |
| `OSU_CLIENT_SECRET` | 第 2 步的 Client Secret | ⚠️ 保密，建议你自己填，不用告诉我 |
| `SESSION_SECRET` | 一段随机长字符串 | 用来给登录凭证签名，见下方生成方法 |
| `BOOTSTRAP_OWNER_UID` | 第 3 步的你的 osu 用户 ID | 把你设成永久站长 |
| `SITE_URL` | 第 1 步的完整域名 | 例如 `https://osumania-ladder.pages.dev`，结尾不要带斜杠 |

另外，确认下面这些**之前就该有**的变量还在（本次改造也要用）：

| 变量名 | 说明 |
|--------|------|
| `GITHUB_TOKEN` | 已有，操作比赛 JSON 用 |
| `GITHUB_REPO` | 已有，形如 `shadiaojunshi/osumania-ladder` |

> ⚠️ 之前那个明文写在前端的邀请码会被彻底删掉，`invite-codes.json` 也会移除。改造上线后，登录方式就只剩 osu! 登录。

### 怎么生成 `SESSION_SECRET`

随便用下面任一方法生成一段够长的随机串（32 字节以上），复制粘贴进去：

- 在命令行（Git Bash / Linux / Mac）跑：
  ```bash
  openssl rand -hex 32
  ```
- 或者 Node：
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- 生成出来形如 `a3f8...`（64 个十六进制字符），整段贴进 `SESSION_SECRET`。

> 这个值只要存在 Cloudflare 即可，**不用告诉我**。它一旦改变，所有人的登录态会失效需要重新登录，平时别动它。

### 同步给 GitHub Actions（备份用）

每日备份的 Actions 需要读写两个 R2 桶。你之前已经在 GitHub 仓库配过 `R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY`（`generate-packs.yml` 在用），备份直接复用，无需新增。我只需要把备份桶名写进工作流。

---

## 做完之后，发给我这些值

- [ ] 第 1 步：网站域名（例如 `https://osumania-ladder.pages.dev`）
- [ ] 第 2 步：`client_id`（数字，不敏感可直接发）
- [ ] 第 3 步：你的 osu! 用户 ID（数字）
- [ ] 第 5 步：备份桶名（例如 `osumania-ladder-maps-backup`）
- [ ] 第 4/6 步：确认「KV 绑定为 `LADDER_KV` 已建好」「secret 已配好」即可（`client_secret` 和 `SESSION_SECRET` 你自己填，不用发我）

收到后我会：把回调地址等最后一公里接进代码 → 推送 → 你在 Cloudflare 触发部署 → 用 osu! 登录验证 → 全套生效。

---

## 附录 A：四级权限说明

| 角色 | 谁 | 能做什么 |
|------|----|---------|
| **owner 站长** | 你（`BOOTSTRAP_OWNER_UID`） | 一切；唯一能任命/罢免 admin 的人；永不可被降权 |
| **admin 管理员** | 你信任的人 | 所有比赛/谱面操作（含**删除**）；可任命/罢免 contributor；不能动其他 admin/owner |
| **contributor 普通管理员** | 帮忙录入的人 | 新增、编辑比赛，上传谱面；**不能删除**任何东西 |
| **readonly 普通用户** | 其他任何登录者 | 只能浏览，不能改 |

> 任何用 osu! 登录但不在名单里的人，默认是 readonly。要给谁权限，由你或 admin 在「管理员管理」页面里加他的 osu 用户名/ID。

## 附录 B：恢复层说明（出事怎么救）

1. **比赛数据（GitHub）**：每次增删改都是一次 git commit。误删/被改坏 → 在 GitHub 上 `git revert` 或回退即可完整还原。删除已改为**软删除**：先进回收站（KV 记录），保留期内可在后台「回收站」页一键恢复，到期自动清除（不提供手动清空，符合你的要求）。
2. **谱面文件（R2）**：每日 Actions 自动备份到第二个桶。删除谱面改为移到 R2 的 `trash/` 前缀，保留期内可恢复，过期由备份 Action 清理。
3. **审计日志**：每次写操作记录「谁（osu 用户名+ID）、何时、对哪个比赛、做了什么」，存 KV，可在后台查看。出事能追责、能定位。
4. **告警（可选，后续可加）**：破坏性操作推送到 Discord/邮件，便于第一时间发现。本期先把日志做扎实，告警留作后续。

> 诚实说明：以上能做到**可还原、可追责、可发现**，但无法在技术上**阻止**一个有权限的人故意改坏数据（这是所有系统的共性）。残余风险靠「最小权限 + 还原 + 追责」控制——不太信任的人只给 contributor（无删除权），破坏面就很有限。

## 附录 C：关于已泄露的 osu! v1 API key

你已经重置了那个用于抓取谱面元数据的 **v1 API key**（`functions/api/osu/beatmap.ts` 用的 `OSU_API_KEY`）。确认新 key 已更新到 Cloudflare 的 `OSU_API_KEY` secret 即可。这个 key 与本次 OAuth 改造是两套独立的东西，不要混淆。

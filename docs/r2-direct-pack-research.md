# 合包自动上传到 R2(直发)—— 调研归档

> 2026-06-06。在 Drive 自动上传(已接通)和 123(内测排队)之外,
> 多加一条最便宜、最快接通、最稳定的兜底通道。

## 背景

当前合包流程:GitHub Actions 跑 [scripts/generate-pack.js](../scripts/generate-pack.js)
生成 `*.osz` → `actions/upload-artifact` 暂存 7 天(过期就没了)→ 现已加了
Google Drive 自动上传(`scripts/upload-to-gdrive.js`)。

问题:
- Drive 在中国大陆基本不能用(无 VPN 全员 timeout)
- 123 走的是「开发者权益包」内测,审核不一定过、过了也只 1 个月
- artifact 7 天就消失,不能当长期下载入口

但其实 R2 我们已经在用了 —— 站内**所有 .osz 原始文件**都存在 R2 私有桶
`osumania-ladder-maps` 里。Cloudflare R2 的关键特性是 **egress 不要钱**,
意味着用 R2 当下载入口,只按存储容量付费,流量任跑。

## 为什么这是兜底里最便宜的

| 项目 | Drive | 123 | **R2 直发** |
|---|---|---|---|
| 月成本 | 免费(15GB 限额) | 0(VIP 套餐) | ¥3-5(40GB × $0.015) |
| 接通时间 | 已接通 | 等内测 + 开发 | ≈ 1 小时 |
| 中国可用 | ❌ | ✅ | △(Cloudflare 大陆节点,看运营商) |
| 海外可用 | ✅ | ❌(分享页要登录) | ✅ |
| 大文件限制 | 无 | 无 | 无 |
| 维护成本 | 高(Drive 配额、删孤儿) | 高(月度续期、token) | 低(就是个 bucket) |

R2 免费额度是 10GB 存储 + 100 万次 A 类操作 + 1000 万次 B 类操作,
我们 ~40GB 会轻微超出免费额度,大约 $0.50/月(¥3-5),可忽略。

## 落地计划

### 准备工作(站长做)

1. Cloudflare Dashboard → R2 → 新建 bucket `osumania-ladder-packs`
   - **不要**启用 Object Versioning(合包每次全量重生成,留版本浪费钱)
   - **不要**和现有 `osumania-ladder-maps` 共用 —— 后者是私有桶、通过
     Pages Function 鉴权读;packs 桶必须公开,放一起会让裸 .osz 也被公开
2. bucket Settings → Public Access → 开启 R2.dev subdomain
   - 拿到形如 `https://pub-xxxxxxxx.r2.dev` 的公开域名
   - 后期想自定义可以再绑 `pack.your-domain.com`,但 r2.dev 已经够用
3. 把现有的 R2 凭据(`R2_ACCOUNT_ID` / `R2_ACCESS_KEY` / `R2_SECRET_KEY`)
   补上 packs bucket 的写入权限即可,**不需要新 secret**(同一个账号下的
   API token 默认对所有 bucket 有效;如果你之前限定了 bucket 范围,需要
   编辑 token 加上 `osumania-ladder-packs`)

### 代码改动

**改:**

- [scripts/generate-pack.js](../scripts/generate-pack.js) —— `main()` 里
  在 manifest 写盘**之前**加一段:
  ```js
  const PACKS_BUCKET = process.env.R2_PACKS_BUCKET || 'osumania-ladder-packs'
  const PACKS_PUBLIC_URL = process.env.R2_PACKS_PUBLIC_URL  // pub-xxxx.r2.dev
  if (PACKS_PUBLIC_URL) {
    for (const result of allResults) {
      const buf = fs.readFileSync(result.outputPath)
      await s3.send(new PutObjectCommand({
        Bucket: PACKS_BUCKET,
        Key: `${result.realType}_${result.part}.osz`,
        Body: buf,
        ContentType: 'application/x-osu-archive',
      }))
    }
    // manifest 里给 entry 写 links.r2
    for (const pack of manifest.packs) {
      pack.links.r2 = `${PACKS_PUBLIC_URL}/${pack.realType}_${pack.part}.osz`
    }
  }
  ```
- [.github/workflows/generate-packs.yml](../.github/workflows/generate-packs.yml)
  —— 在 Generate packs 步骤的 env 里加 `R2_PACKS_BUCKET` 和 `R2_PACKS_PUBLIC_URL`
  (从 secret 注入)
- [src/components/DownloadPage.tsx](../src/components/DownloadPage.tsx) (或类似)
  —— /download 页给每个 pack 多一个 "Cloudflare 直链" 按钮,引用
  `pack.links.r2`,与现有 Drive 按钮并列

**不改:**

- 不动现有 `osumania-ladder-maps` 桶。原始 .osz 仍走 Pages Function 鉴权读取。
- 不动 Drive / 123 那两条线,这是平行通道。

### Secrets 清单

| 变量 | 哪里 | 值 | 谁填 |
|---|---|---|---|
| `R2_PACKS_BUCKET` | GitHub Secrets | `osumania-ladder-packs` | 站长 |
| `R2_PACKS_PUBLIC_URL` | GitHub Secrets | `https://pub-xxxx.r2.dev` | 站长(建桶后从 R2 控制台抄) |

(R2 凭据已在,不重复)

## 注意点

1. **必须独立 public bucket**,别图省事直接把 maps 桶公开 —— 会绕过现有访问控制
2. **不启版本控制**,合包是每次全量替换的,留版本浪费钱
3. **大陆速度因运营商而异**,移动通常 1-3 MB/s,电信/联通晚高峰可能掉到
   200-500KB/s。但合包是异步下载,完全可接受。极端情况还有 123 兜底。
4. **同名覆盖**:R2 的 PutObject 同 key 默认覆盖,不需要先删旧的,合包新版
   直接盖
5. **链接寿命**:r2.dev 子域名是永久的(只要 bucket 不删、Public Access
   不关),不像 Drive 偶尔会因配额超限被自动屏蔽

## 优先级

P0 —— 实现成本最低、覆盖面最广、跟现有方案不冲突。建议作为
Drive 自动上传跑通后**下一个动作**,排在 123 之前。

## 待办

- [ ] 站长建 `osumania-ladder-packs` bucket,开 Public Access,记下 r2.dev URL
- [ ] 站长把 `R2_PACKS_BUCKET` / `R2_PACKS_PUBLIC_URL` 填到 GitHub Secrets
- [ ] AI 改 generate-pack.js + workflow + /download 页
- [ ] 跑一次 Generate Map Packs,验证 manifest.links.r2 写入 + 下载页按钮可用

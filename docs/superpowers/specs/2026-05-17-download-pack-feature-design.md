# 下载/合包功能设计文档

## 概述

为 osu!mania 难度天梯榜网站添加谱面下载功能。用户可以按真实键型（realType）下载合包，方便针对性练习。

## 架构总览

```
贡献者（admin 页面）
  └── 上传 3 个文件（.osu + 音频 + 曲绘）per map
        └── 浏览器端用 JSZip 打包成 .osz
              └── 通过 Cloudflare Function 上传到 R2

管理员触发"生成合包"
  └── GitHub Actions workflow
        ├── 从 R2 拉取指定 realType 的所有单图文件
        ├── 解压、重命名、改写元数据
        ├── 打包成大 .osz
        └── 暂存到 R2（管理员下载后手动传网盘）

用户访问 /download 页面
  └── 按 realType 分类展示合包下载链接
```

## 数据模型扩展

### BeatmapMeta（无需新增字段）

文件上传状态不存储在比赛 JSON 中。是否已上传通过查询 R2 bucket 中对应 key 是否存在来判断，避免并发写入 GitHub API 导致 409 冲突。

R2 key 约定格式：`maps/{tournamentId}/{roundId}/{slot}.osz`

例如：`maps/mwc-4k-2024/mwc2024-ro32/RC1.osz`

### 新增：合包清单文件 `data/packs-manifest.json`

```jsonc
{
  "packs": [
    {
      "realType": "JS",
      "name": "4K Contest Jumpstream Pack",
      "mapCount": 45,
      "totalMaps": 52,        // 该类型总图数（含未上传的）
      "lastUpdated": "2026-05-15",
      "links": {
        "drive123": "https://www.123pan.com/s/xxxx",
        "googleDrive": "https://drive.google.com/file/d/xxxx"
      },
      "sizeMB": 380
    }
  ],
  "lastGenerated": "2026-05-15T10:30:00Z"
}
```

## 单图上传流程

### 前端（admin 页面）

在现有比赛编辑界面中，每张图旁边增加上传区域，支持两种上传方式：

```
┌─────────────────────────────────────────────────┐
│ RC1 - Jumpstream  难度: 9.8                      │
│ ┌───────────────────────────────────────────┐   │
│ │ 方式一：直接拖入 .osz 文件                 │   │
│ │ [拖拽或点击选择 .osz]                      │   │
│ │                                           │   │
│ │ 方式二：分别上传 3 个文件                  │   │
│ │ .osu 文件:  [选择文件] ✓                  │   │
│ │ 音频文件:   [选择文件] ✓                  │   │
│ │ 曲绘文件:   [选择文件] ✓                  │   │
│ │                                           │   │
│ │ [上传]  状态: 已上传 ✓                    │   │
│ │ 限制: 单文件 ≤ 25MB                       │   │
│ └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

- 方式一（.osz 直传）：用户已有干净的单谱面 .osz，直接上传，无需拆分
- 方式二（3 文件）：用户只有散装文件时，浏览器端用 JSZip 打包成 .osz 再上传

### 上传处理逻辑（预签名 URL 方案）

1. 用户选择 3 个文件
2. 浏览器端用 JSZip 将 3 个文件打包成 .osz（<15MB，JSZip 无压力）
3. 调用 `POST /api/maps/presign` 获取 R2 预签名上传 URL
4. 浏览器直接 PUT 文件到 R2（不经过 Function 中转，无大小限制问题）
5. 上传完成后调用 `POST /api/maps/confirm` 通知后端验证文件已就位

### Cloudflare Function: `POST /api/maps/presign`

```typescript
// functions/api/maps/presign.ts
// 接收: JSON { tournamentId, roundId, slot, fileSize }
// 操作:
//   1. 验证参数合法性
//   2. 生成 R2 预签名 PUT URL（有效期 5 分钟）
//      key: maps/{tournamentId}/{roundId}/{slot}.osz
// 返回: { uploadUrl: "https://...", key: "maps/..." }
```

### Cloudflare Function: `POST /api/maps/confirm`

```typescript
// functions/api/maps/confirm.ts
// 接收: JSON { tournamentId, roundId, slot }
// 操作:
//   1. 验证 R2 中对应 key 确实存在（HEAD 请求）
//   2. 返回确认
// 返回: { success: true }
```

### Cloudflare Function: `GET /api/maps/status`

```typescript
// functions/api/maps/status.ts
// 接收: query param ?tournamentId=xxx
// 操作:
//   1. 列出 R2 中 maps/{tournamentId}/ 下所有对象
//   2. 返回已上传的 slot 列表
// 返回: { uploaded: ["mwc2024-ro32/RC1", "mwc2024-ro32/RC2", ...] }
```

### R2 Bucket 结构

```
osumania-ladder-maps/
  maps/
    mwc-4k-2024/
      ro32/
        RC1.osz
        RC2.osz
        ...
      ro16/
        RC1.osz
        ...
  packs/
    JS.osz          # 生成的合包（临时存放，管理员下载后可删）
    SS.osz
    ...
```

## 合包生成流程（GitHub Actions）

### 触发方式

管理员在 admin 页面点击"生成合包"按钮 → 调用 GitHub API 触发 workflow_dispatch。

可选参数：
- `realType`: 指定只生成某个类型的包（留空 = 全部类型逐个生成）

### Workflow 核心步骤

```yaml
# .github/workflows/generate-packs.yml
name: Generate Map Packs
on:
  workflow_dispatch:
    inputs:
      realType:
        description: '指定 realType（留空=全部）'
        required: false

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: node scripts/generate-pack.js --type=${{ inputs.realType }}
        env:
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY: ${{ secrets.R2_ACCESS_KEY }}
          R2_SECRET_KEY: ${{ secrets.R2_SECRET_KEY }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
      - uses: actions/upload-artifact@v4
        with:
          name: packs
          path: output/*.osz
          retention-days: 7
```

### 合包脚本核心逻辑 (`scripts/generate-pack.js`)

使用 `archiver` 库（流式打包，不受内存限制）而非 JSZip。

```
输入: realType (如 "JS")
```

1. 读取所有比赛 JSON，收集该 realType 的所有 map
2. 过滤出 hasFiles === true 的 map
3. 从 R2 逐个下载对应的 .osz 文件
4. 对每个 .osz：
   a. 解压（JSZip）
   b. 读取 .osu 文件，提取原始元数据（Artist, Title, Creator, Version）
   c. 生成新 Version: `({比赛缩写} {轮次缩写} {slot}) {原Artist} - {原Title} [{原Creator}] ({原Version})`
   d. 重命名音频文件为 `{safe_version}.mp3`（防冲突）
   e. 重命名曲绘文件为 `{safe_version}.jpg`（防冲突）
   f. 改写 .osu 元数据：
      - Title → pack name (如 "4K Contest Jumpstream Pack")
      - Artist → "Various Artists"
      - Creator → "shadiaojunshi"
      - Version → 上面生成的新 Version
      - AudioFilename → 重命名后的音频文件名
      - Background → 重命名后的曲绘文件名
      - BeatmapID → 0
      - BeatmapSetID → -1
      - Source → ""
      - Tags → ""
   g. 将修改后的文件加入最终包
5. 添加 "delete this" 占位谱面（用于官网上传）
6. 用 archiver（流式）打包成 .osz，输出到 output/ 目录
7. 可选：上传回 R2 的 packs/ 目录

## /download 页面设计

### 页面结构

```
┌──────────────────────────────────────────────────────────┐
│  osu!mania 4K 比赛合包下载                                │
│  按真实键型分类，包含所有已收录比赛的对应谱面               │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ── Rice 类 ──────────────────────────────────────────   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 🎵 Stream (SS)                                   │    │
│  │ 45/52 张谱面 · 380MB · 更新于 2026-05-15        │    │
│  │ [123网盘下载]  [Google Drive]                    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 🎵 Jumpstream (JS)                              │    │
│  │ 38/40 张谱面 · 310MB · 更新于 2026-05-15        │    │
│  │ [123网盘下载]  [Google Drive]                    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ ⚠️ Chordjack (CJ)                               │    │
│  │ 0/28 张谱面 · 暂无文件                          │    │
│  │ [暂无下载]                                       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ── LN 类 ───────────────────────────────────────────   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 🎵 Coordination (CO)                            │    │
│  │ 22/25 张谱面 · 180MB · 更新于 2026-05-15        │    │
│  │ [123网盘下载]  [Google Drive]                    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ── Hybrid 类 ───────────────────────────────────────   │
│  ...                                                     │
│                                                          │
│  ── 其他 ────────────────────────────────────────────   │
│  SV1 · SV2 · TB                                         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 缺失文件提示

在 admin 页面的"管理已有比赛"tab 中，每个比赛旁边显示文件完整度：

```
mwc-4k-2024    [编辑] [删除]  📁 78/91 张已上传
gbc-2025       [编辑] [删除]  📁 0/65 张已上传  ⚠️
```

点击可展开查看具体哪些 map 缺少文件。

## 文件大小限制

| 环节 | 限制 | 原因 |
|------|------|------|
| 单图 .osz 上传 | ≤ 25MB | 客户端校验，请求预签名前拒绝超大文件 |
| R2 单对象 | < 5GB | R2 限制（实际单图 .osz 不会超过 25MB） |
| GitHub Actions 磁盘 | 14GB | 免费版限制，单次最多处理 ~1500 张图 |
| Actions 运行时间 | 6 小时 | 免费版限制，实际单类型 5-10 分钟 |

## 安全考虑

- 上传接口不做额外鉴权（依赖现有邀请码机制——贡献者已通过验证才能看到 admin 页面）
- R2 bucket 设为私有，只通过 Cloudflare Function 代理访问
- 合包生成只能通过 GitHub workflow_dispatch 触发（需要 repo 写权限）
- 上传时验证文件类型（.osu 必须是文本、音频必须是 mp3/ogg/wav、曲绘必须是 jpg/png）

## 实施顺序

### Phase 1: 单图上传基础设施
1. 创建 R2 bucket，配置 Cloudflare Pages 绑定
2. 实现 `POST /api/maps/presign` Function（生成预签名 URL）
3. 实现 `POST /api/maps/confirm` + `GET /api/maps/status` Function
4. admin 页面添加上传 UI（per-map 三文件上传，直传 R2）

### Phase 2: 合包生成
5. 编写 `scripts/generate-pack.js` 合包脚本
6. 创建 GitHub Actions workflow
7. admin 页面添加"生成合包"触发按钮
8. 实现 packs-manifest.json 自动更新

### Phase 3: 下载页面
9. 创建 /download 页面 UI
10. admin 页面添加下载链接管理（手动填写网盘链接）
11. 缺失文件统计和提示

### Phase 4: 优化
12. 增量合包（只处理新增/变更的图）
13. 上传进度条和批量上传
14. Google Drive 自动上传（可选）

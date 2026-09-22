# 合包与临时归包

后台「临时归包」只修改 `packAs`，不修改 `realType`。先用「保存全部」提交比赛数据；仅在浏览器暂存的设置不会参与 GitHub Actions 合包。执行工作流的分支必须包含代码修复和已保存的数据。

## 发布方式

- GitHub Actions 的 **Generate Map Packs**：`realType` 留空就是全量发布。
- 当前存在临时归包，或上一版曾有临时归包时，通常只允许全量发布。TB 专项重分是例外：涉及 TB 的归包关系必须与已发布版本一致；新增、撤销或改动涉及 TB 的归包仍必须全量发布。其他键型未发布的归包变更不会被 TB 任务写入发布记录。
- 单类型预览仍可使用 `node scripts/generate-pack.js --type=IN`；预览需要读取 R2 原谱，但不上传、不修改线上清单。
- 全量任务同时收集真实键型和临时归包目标，因此没有原生谱面的目标也会生成；全部迁出的来源包在整次成功后才从清单移除。

## 缺图保护

成功生成的每个包会在清单的 `contentEntries` 记录实际打入的谱面内容摘要和来源路径，主图和 NSV 都记录。发布前跨所有包比较上一版与本版内容；正常换包、重新分包或合并等价副本不会误报，新增谱面也不能抵消旧内容的丢失。摘要使用现有玩法内容判据，不包含合包会改写的标题、来源标签或资源文件名。

历史清单没有逐谱面记录，无法倒推出上一版的所有内容。首次升级保留原有数量检查并输出覆盖不足的提示；成功发布的包从此建立逐谱面基准。

确实有意移除或替换旧谱面，或者首次升级遇到临时归包引起的数量收缩时，先核对日志，再在 Actions 勾选 `allowContentGaps`，或本地使用 `--allow-content-gaps`。此开关默认关闭，只允许旧内容/数量收缩，**不能放行缺音频、下载失败或压缩包损坏**。

内容比较失败时不写 manifest 或 previous manifest，不清理旧对象；生成中已上传的新对象暂时没有被线上引用，旧下载链接仍保持原状。

合包不自动清理 R2 或 Drive 旧对象。手动清理必须另行确认实际部署成功；Git 已提交/推送不等于网站已经部署。

## 只重分 TB（每包最多 50 张）

Actions → **Rebuild TB Packs Only (50 charts max)** → **Run workflow**。

- 固定运行 `--type=TB --publish`，然后 `upload-to-gdrive.js --type=TB`；无需填写选项，也没有放行丢图的开关。
- TB 主图和 NSV 都计入 50 张上限；`delete this.osu` 占位难度不计。份数为 `ceil(张数 / 50)`，尽量均分。主图和 NSV 不拆开，只有无法精确均分的成对情况允许相差 2 张。其他键型的分包阈值和分配方案不变。
- 使用同一份 `packs-manifest.json`，所以推送成功后后台合包管理会读到新 TB 列表，网站部署完成后下载页更新。新 R2 / Drive 文件使用版本化名称，保留旧文件，不执行清理。
- 生成后、Drive 同步后各核对一次非 TB 条目的完整内容，包括 123 链接和待同步状态；有任何变化就停止提交。任务与现有合包、Drive 同步共用 `packs-publish` 排队锁。
- TB 旧 123 等人工镜像链接保留，下载页标注「旧版」。重新上传分包后，在后台修改链接；如果仍使用相同 URL，则点击「确认已更新」再保存。其他包的链接完全不变。
- 失败时线上清单保持旧版，新上传但未引用的文件留待以后清理。原清单、新清单和身份报告保存为 Actions artifact 30 天。重分会改变 TB 合包标题/内容，和其他重新分包一样，osu! 本地旧成绩可能无法匹配新包。

## 键型合集 CSV

Actions → **Export Pack CSV Downloads** → **Run workflow**。`realType` 留空导出全部；填写 `TB` 等只导出该类型。

1. 按当前已发布清单的 `contentEntries` 导出，每个键型一份 CSV，包含该键型所有分包（临时借入的谱面跟随实际所在合包）。不重新合包、不改比赛数据、不写合包镜像清单。
2. 从 R2 原始 `.osz` 用 Range 读取 `.osu`，不整包下载音频和曲绘；串行读取、只缓存解析后的元数据。每张读数次 R2，不调用 osu! API 或 Pages Functions，不消耗公开取谱额度。
3. 按已发布内容摘要核对。首选原始路径失效时尝试已记录的其他副本；全部缺失、内容已变、解析失败或上传失败时停止本次索引更新，旧下载继续有效。多难度原包无法唯一确定时也停止，不猜谱面。
4. CSV 存在公开合包 R2 桶的 `csv/{realType}.{hash}.csv`，UTF-8 BOM、CRLF、标准 CSV 转义、下载响应头。只有轻量链接索引 `data/pack-csv-manifest.json` 提交到 GitHub；全部键型合计一次提交/一次 Pages 构建。玩家下载直接走 R2，不触发构建或 Worker 请求。
5. 下载页顶部显示「也可以下载csv，然后通过凛澪的下载器进行下载」，每个键型有绿色 CSV 按钮。未生成或合包更新后索引不匹配时显示「CSV 待生成」；再次运行导出即可。先重分 TB，再导出全部 CSV。

列名参考提供的 Seekman 样例：`beatmapset_id`、`beatmap_id`、`artist`、`artist_unicode`、`title`、`title_unicode`、`creator`、`version`、`mode`、`osu_file_name`、`audio_file_name`、`hitcircles`、`sliders`、`spinners`、`ar`、`cs`、`hp`、`od`、`slider_velocity`、`total_time`、`preview_time`、`bpm`、`source`、`tags`，以及合集信息。

- `total_time`：mania 最后物件结束时间，毫秒（包含 LN 尾部）；`preview_time`：毫秒；`sliders` 包含 mania LN。
- `bpm`：持续时间最长的红线 BPM；另给 `bpm_min` / `bpm_max`。负拍长绿线不当成 BPM。
- `real_type` 是所在合集键型，`pack_part` 是分包号，`variant` 为 `main` 或 `NSV`，`content_key` 是本项目玩法摘要，不是 osu! MD5。
- 未提交/占位 ID（含 0、1、负数）留空，仍保留该行。缺失元数据留空。R2 无法可靠提供的星数、ranked 状态、原始字节 MD5、Windows 文件时间及本地文件夹名不伪造；也不声明 Seekman 原生导出版本。
- 下载器需要适配这些列名。没有可用 ID 的图无法保证镜像可下；NSV、倍速或本地修改版本的 ID 可能仍指向原图，ID 下载不能保证得到相同变体。
- 沿用仓库现有的 R2 secrets；无需新增 Worker、登录或配额服务。两个新增 Action 必须先随代码推送，才会出现在 GitHub Actions 列表里。

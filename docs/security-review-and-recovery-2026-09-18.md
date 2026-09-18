# 安全检查、删除恢复与合包交接

日期：2026-09-18。范围：本地工作区代码和本地测试。没有部署、修改线上数据、执行真实合包或发邮件；未验证 Cloudflare/GitHub/Drive 控制台权限、额度与最近备份是否实际成功。合包脚本由另一 AI 修改，本任务只提供其审查交接。

## 已修复并测试

### P1：删除比赛先删除 GitHub、再尽力备份

位置：`functions/api/tournaments/[id].ts`。

旧流程：GET 文件失败也继续 DELETE；DELETE 成功后才写 KV 回收站，写失败被忽略。攻击者或正常管理员都可能遇到“删除成功但回收站没有记录”。Git 历史仍可能恢复，但后台快速恢复失效。

新流程：鉴权 → 验证 ID/SHA → 成功读取完整 base64 内容 → 核对 SHA → 成功持久化完整副本 → DELETE 同一 SHA → 审计记录 trashId/blobSha。读取或备份失败则停止删除；版本变化返回 409。DELETE 失败/超时后保留副本，避免网络不确定性导致最后一份可恢复记录被清理。回收站可能出现未实际删除成功的副本，这是故意的安全取舍；恢复不会覆盖现有同名文件。

`scripts/tournament-delete-safety.test.mjs` 六项覆盖顺序、UTF-8 完整性、备份失败、读取失败、版本不一致、并发冲突和角色门禁（六个测试中部分覆盖多个断言）。修复前五项失败，修复后通过；原有相关 fixture 已补 GitHub sha。

限制：KV 写成功不代表跨地区立即可见，回收站有短缓存；刚删除后短暂看不到可刷新/稍后再看。备份只有 30 天 TTL。非法旧 JSON 可备份，但后台恢复仍需通过 schema，必要时从 Git 历史人工修正后恢复。

### P2：JSON 大小限制只看 Content-Length，batch 直接解析

位置：`functions/api/_lib/validation.ts` 和 `functions/api/tournaments/batch.ts`。

改为读取实际流、按 UTF-8 字节计数、超限取消读取后拒绝；batch 接同一个 helper。当前总上限仍沿用 16 MiB，没有擅自降低现有批量保存容量。新测试覆盖无长度头、伪造长度头、分块超限立即取消和跨块多字节字符。它限制内存/解析消耗，**不等于请求限流**，也不能防止已经进入 Worker 的请求计费。

### 首页显示问题

`LadderView.tsx`：超界键型/TB 只渲染一个熔岩按钮，不再把普通框残片撑成第二个框；整场比赛的熔岩与主体合成一个按钮，共用外框、hover、暗色滤镜，纹理在内部渐隐。保留原始难度与绘图坐标，鼠标选轮按整体新几何反算；键盘激活有明确兜底轮次。

`RoundDetailModal.tsx`：首页点击轮次后，每个谱面行显示实际 realType（含名称提示和待分类状态），有/无 BID 都展示。来源是已经加载的静态比赛 JSON，未增加 API、KV 或 R2 请求。谱面预览仍是用户单独点击才请求的原有功能。

## 仍须处理的安全风险

| 优先级 | 事实与影响 | 建议 |
| --- | --- | --- |
| P1 | admin 可删除各场比赛；contributor 也能 PUT/batch 把 rounds/maps 清空，不能只防 DELETE | 服务端识别“文件删除/轮次删除/谱面大幅减少/难度大面积清空”，普通协作者提交删除申请，站长确认或审批；更强方案用 PR 审核全部非站长修改 |
| P1 | 权限名单存在 KV，读整份→写整份；并发更改会覆盖，KV 最终一致性和 isolate 缓存使撤权不是即时全网生效 | 权限变更转强一致协调器或单写队列；事故时先在边缘冻结写入，再撤权；不要信注释中的 immediately |
| P1 | 匿名请求鉴权失败仍可耗 Functions；新反馈将增加公共写入口 | 采用配套匿名反馈方案：边缘防护、静态数据、独立权限、预算熔断；同账号不同 Worker 不代表总请求额度硬隔离 |
| P1 | 现有每日 R2 备份是 maps/ 当前态镜像，同键覆盖，不是历史快照 | 恶意覆盖可在下一次备份污染镜像；察觉时先停备份/清理，检查 versions/ 和旧备份；尊重已定“不备份 versions/trash”策略，不擅自增加存储 |
| P2 | 审计 best-effort，后台和审计 KV 在同一平台；站点后台账号失守与云/GitHub 账号失守风险不同 | 删除预备记录应可靠落盘，独立告警/审计副本；云账号与 GitHub 开 2FA，应用 token 最小权限，不给后台代码仓库管理/强推/Actions secrets 权限 |
| P2 | 当前后台 JSON 响应没有统一 no-store，CORS 是 `*` | 管理员响应加 `Cache-Control: private, no-store`，边缘禁止缓存 API；写操作验证 Origin + JSON/CSRF。`*` 本身不等于认证数据可跨站读（无 credentials header、cookie SameSite=Lax），不要误报成已确认泄漏 |
| P2 | 回收站 list 默认只取 200，未翻页 | 大量 map 删除/失败重试后旧比赛记录可能在 UI 不可见，但不一定已丢失；加 cursor 分页、目标搜索或按 trashId 定位 |

角色区分必须用 UID：`BOOTSTRAP_OWNER_UID` 为不可从后台移除的原始站长。其他 `owner` 仍然是“除我以外的人”。客户端隐藏按钮不能提供任何安全保证；规则必须覆盖直接 HTTP 请求以及 PUT/batch，不仅 DELETE。

没有在这次检查中确认匿名用户能绕过签名会话直接获得管理员；不把它等同于“网站无安全风险”。高权限账号本来就被授权修改数据，真正的防恶意管理员需要审批/权限收缩和独立恢复，不靠更多 confirm 弹窗。

## 能否快速恢复所有比赛

**仅本站 admin 身份被滥用，GitHub 仓库和站长云账号仍安全时：可以用回收站或 Git 历史恢复。**恢复时间取决于发现时间、备份完整性及 Pages 构建，不保证秒级；目前没有一键批量恢复按钮。

### 少数比赛：后台回收站

先冻结写入/撤销嫌疑人权限，再用站长账号打开回收站，核对删除人、比赛 ID、时间后恢复。条目保留 30 天，恢复单场会产生一个 commit；现有文件存在时返回冲突并保留副本，不盲目覆盖。30 天外或回收站损坏时走 Git。

### 全库或大量修改：从可信 Git 历史一次恢复

以下是事故操作手册，**本次没有执行这些恢复命令**。先停攻击，再修数据，否则攻击者会继续覆盖恢复结果。

1. 在 Cloudflare 边缘暂时阻断后台写入；若保护规则允许，保留站长维护路径。撤销嫌疑 UID，检查其是否新建其他协作者。必要时轮换 SESSION_SECRET 使旧 cookie 失效并等待新部署传播；若 GitHub token 也泄露，先撤销/轮换 token。边缘阻断比等待 KV 撤权更适合紧急止血。
2. 保存审计日志、恶意 commit SHA、删除前 SHA、回收站编号、当前备份对象清单。怀疑覆盖时暂停每日备份/清理，保护未污染副本。
3. 从一个全新恢复 checkout 操作，不在有未提交工作的开发目录 reset/clean。示例中的 URL 与 SHA 需替换为经核实的值：

```powershell
git clone <可信仓库URL> ladder-recovery
Set-Location ladder-recovery
git switch -c codex/recover-tournaments origin/main
git log --date=iso --oneline -- data/tournaments
git diff --stat <最后可信SHA> HEAD -- data/tournaments
git restore --source=<最后可信SHA> --staged --worktree -- data/tournaments
git diff --cached --stat
git diff --cached -- data/tournaments
npm ci
npm test
npm run build
git commit -m "Restore tournament data after unauthorized changes"
```

4. 审阅恢复范围。全目录 restore 会恢复所有该目录到旧快照，也会撤掉其后合法新增/编辑；若只坏了一部分，用明确文件路径分别恢复，或在全量恢复后重放已确认的合法修改。最后推送恢复分支创建 PR 合并，或站长按实际保护规则直接提交。只需一个数据恢复 commit，禁止 force push／reset 远程分支／重写历史。
5. 验证 Pages 新构建成功、首页比赛数、目标轮次/谱面、下载链接及后台权威 JSON。不要只回滚 Pages deployment：那只恢复展示，不恢复 GitHub 权威数据，下一次构建仍可能回到坏数据。

Git 历史恢复的是 JSON，不会恢复 R2 的 .osz。应用层删除比赛当前不会顺带删除每张 R2 map，但若攻击者还调用 map 删除，需要独立恢复文件。manifest 回滚也不代表被删除的包对象/Drive 文件会回来。

### R2 文件恢复

优先回收站（未超保留期），其次按槽位检查 versions/，再检查 maps-backup。现有备份每日北京时间约 02:07 计划运行，Actions 可能延迟/失败，因此先看最后一次成功运行和清单，不能仅凭 workflow 存在就认定有备份。镜像不传播源对象缺失的删除，但会覆盖同键新内容；不是任意时间点恢复。

先列出需要恢复的精确 key，比较目标现状、大小、ETag，复制到临时检查区验证 .osz 可解压且含预期谱面，再条件写回缺失目标；对已经存在但不同内容的对象显式审阅，不全桶覆盖。恢复 token 仅站长使用，Web 管理端不绑定备份桶。

建议离线/独立账号保存仓库镜像与关键配置说明，并定期做一场比赛 + 一个 .osz 的恢复演练。GitHub 账号/云账号也失守时，同账号里的历史与备份不构成独立灾备。

## 给 3385956712@qq.com 的删除告警设计

**未启用，也未发送测试邮件。**当前没有确认可用的发信服务、已验证发件域/地址和密钥。收件箱地址并不等于发件服务；不要把 QQ 邮箱密码/授权码写进仓库。

建议将此功能放下一次独立实现，提供以下可验收合同：

1. 服务端判断 `actor.uid !== env.BOOTSTRAP_OWNER_UID`，其他 owner/admin 都要提醒；站长本人不发送常规删除提醒。收件人只从服务器配置读取，固定为站长邮箱，客户端不能改收件人。
2. `tournament.delete` 和 `map.delete` 成功、批量破坏性修改、权限提升、回收站异常均纳入通知。仅监听 DELETE 会漏掉 `rounds=[]` 等同等破坏。
3. 删除前先保存可恢复副本和 durable outbox 事件；事件含 opId、actorUid/name、目标、UTC 时间、前版本 SHA/trashId、状态 planned。副本/outbox 无法写入时拒绝高风险删除。GitHub 删除成功后更新 confirmed；失败记 failed；网络超时记 unknown，后台重试核对文件和 commit，不假报成功。
4. 发信由独立定时消费者或可靠队列执行；不要仅 `waitUntil(fetch(mailProvider))` 后丢弃结果。邮箱暂时不可用仍有 outbox 重试和后台红色提示；如果 outbox 根本不能持久化则前置阻断。
5. 选支持 HTTPS API、已验证发件人的服务，配置 `MAIL_API_KEY / MAIL_FROM / ALERT_TO` 等 secret。不要假定 Cloudflare Email Routing 能无配置给任意 QQ 地址发信。生产开通前从已验证发件地址给该收件箱发一次明确的测试告警并确认收件/垃圾箱。
6. 首条立即通知，随后短窗口合并同一演员的批量行为，保留全部事件摘要；指数退避、最大重试及人工补发入口。幂等键使用 opId/commit SHA，避免重试刷屏。邮件不放 token、cookie、原始 IP 或整份私人资料，只放身份、目标、恢复入口和可信 commit 链接。
7. 日常审计和 outbox 分开保留；建议 outbox/收件配置的权限只给站长运维服务，不让普通 Web admin 修改。真正防管理员抹痕迹时，应将关键日志复制到独立账号/服务。

最强的低复杂度保护是“非站长删除先申请、站长采纳后执行”，邮件只是发现机制，不能阻止几秒内删掉全部比赛。是否将 contributor 的普通编辑也改为 PR 审核是产品权限决策，本次没有擅自改变现有协作权限。

## 合包交接给另一 AI（不要与它并行改脚本）

以下为检查时的代码状态；另一 AI 正在修改，完成后应重新验收，不据此判定最终版本仍有问题。

1. **P1：`parsePackCli(['--offline'])` 会保留 mode=full，`--type=` 空值也可能全量发布。**应在任何环境/网络初始化前拒绝空类型和无类型离线标记，或实现真正全量离线模式；重复/冲突标记有清晰规则。验收错误拼写、空串、只有 offline 全部零写入。
2. **P1：Drive `main()` 在 manifest Git 提交前调用 `deleteOrphans`。**push 失败时线上旧 manifest 仍引用已删文件。默认只报告，清理必须独立、基于已部署且已验证的清单并设保留期，不能生成后立即删除。
3. **P1：R2 内容哈希键已在工作区新增，但 Drive 仍可能原地 update 已知 fileId。**第 N 包失败/manifest push 失败时旧 Drive 链接已变成部分新内容；若要求跨镜像一致发布，Drive 也应版本化新文件 + 最后切 manifest + 延后 GC。否则明确镜像非原子且展示未同步状态。
4. **P1：`--clean-orphans` 仍在“生成新包”的同次运行末尾真删。**文案“确认清单已提交后重跑”不成立：重跑可能产生不同 ZIP hash，脚本删的是本次尚未部署清单之外的对象。把 GC 拆成独立命令，仅读取已发布清单；保留旧构建/回滚所需版本和最短保留窗口。R2 LIST 必须分页，桶用途也必须限制，不能把任意 .osz 都视为可删合包。
5. **P2：buildManifestPacks 从空 Set 重建 pendingMirrors。**单类型更新或跳过类型可能丢失旧未同步标记；应保留所有仍存在条目的原标记，只在对应镜像实际同步成功后清账。下载页检查时没有使用 pendingMirrors，不应靠仅写清单宣称用户能识别旧镜像。
6. **P2：GitHub Actions runner 退出后，本地失败产物不会自动保留。**工作流提示“已保留本地提交/结果”需配 `upload-artifact` 的失败/always 路径，存 manifest、previous manifest、identity report 和必要日志，避免包含凭据；给人工恢复流程明确 artifact 名称。
7. **发布端到端验证**：假 R2/Drive/GitHub 注入第 N 包失败、Drive 失败、ref 冲突/push 失败；断言旧清单每个 URL 仍指向原 bytes；不能只测试 `publishable=false` 或新 manifest 未写。还要测试旧清单无 objectKey 的兼容、分包数减少、无槽类型保留、镜像链接、部分重试和重复内容。

本任务未运行真实合包、GC、备份清理或 Drive 上传，没有消耗相应线上限额。

## 验证记录

本轮新增删除安全与真实 body 大小测试；全套 `npm test` 在检查时 407/407 通过（包含工作区其他 AI 的已有合包测试）。前端 `npx tsc --noEmit`、Functions `npx tsc -p functions/tsconfig.json --noEmit` 及 `npm run build` 均通过。

浏览器实际打开首页并筛选 SWM2、切到每轮键型，DOM 确认 SHOWTB 只剩一个超界按钮（16.53），不存在普通 SHOWTB 副本。完整截图、整场渐变与各尺寸/主题的视觉验收未完成：最后阶段本机报告内存不足，因此停止进一步重型检查；随后确认本任务预览服务均已退出，3000/3018 无监听。不能将 DOM 检查当作完整视觉验收。通过本地测试也不能代表线上绑定、邮件和限流配置已生效。

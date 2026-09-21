# 反馈功能暂停记录

> 历史暂停记录，用户已恢复此任务。当前状态见 [feedback-deployment.md](feedback-deployment.md)。最新限制是完成后不提交、不推送、不触发合包。

日期：2026-09-21

本轮按站长要求在 Timinghell 独立合包问题期间暂停。不要继续启动开发服务器、运行合包或推送。

## 已完成并通过本地检查

- 反馈 Worker 路径收紧到 `/v1/suggestions`，非公开路径返回 404。
- Worker 在关闭/缺配置时仍正确处理白名单 CORS 预检，并暴露 `Retry-After`。
- 新增全站固定名称 Durable Object 协调器：全局验证/接纳预算、按 IP 尝试/窗口/日额度、持久化、并发 UUID 幂等预留、跨 UTC 日重试复用首次收据、过期清理。
- R2 正文写入使用条件创建；响应丢失时按同一 UUID 恢复，不能覆盖不同正文。
- 公开契约补充 `DISABLED`、`BUDGET_EXHAUSTED`；重复 round ID 明确拒绝。
- 审核存储/API 的第一版骨架已写入 `functions/api/_lib/suggestions.ts`、`functions/api/suggestions/`：日期/UUID 校验、admin 权限、R2 ETag CAS、预览、stage/ignore/release 状态与租约。
- 批次 journal/finalize/recovery 骨架已写入 `functions/api/_lib/suggestionBatch.ts`，batch 可带 suggestion batch ID，并保留 `commit` 字段；意外超时只恢复原候选 commit，不重新建 commit。
- 建议应用逻辑现在检查比赛/轮次身份；采纳难度后清理受影响的旧 `typeDifficulties` 元数据，避免编辑器重新分配旧平均值。
- 加入稳定 feedback dataset 版本生成脚本与 `public/_routes.json`。
- 已新增/修正协调器测试与 Worker 测试。

检查通过：

```text
node --test --experimental-strip-types --test-reporter=dot scripts/feedback-worker.test.mjs scripts/feedback-coordinator.test.mjs scripts/suggestion-apply.test.mjs scripts/suggestion-patch.test.mjs
npm run typecheck
npm run typecheck:functions
npm run typecheck:workers
node scripts/generate-tournaments.js
```

## 尚未完成，恢复后优先处理

1. 公开 `/feedback` 页面、地图浏览复用和首页/下载页入口尚未接入；三类表单与 Turnstile 组件已经有草稿文件，但还没有页面承载它们，当前 `src/app/feedback/page.tsx` 不存在。
2. 审核界面 `SuggestionReview.tsx` 尚未接入 `/admin`，批次 `suggestionBatch` 尚未在后台保存按钮传递 `suggestionBatch`；当前 API 骨架需要和真实 `StagedEntry` 草稿合并。
3. `functions/api/_lib/suggestions.ts` 中 GitHub contents 解码、R2 review bucket 绑定和 batch 实际字段核对需要接现有项目约定后再审；不能宣称已上线。
4. `workers/feedback/wrangler.toml` 的 DO/R2 绑定要在真实 Cloudflare 账号核对后再开启写入。`FEEDBACK_WRITES_ENABLED` 仍应保持 `false`。
5. 旧 `scripts/feedback-worker.test.mjs` 夹具已改为适配新 Coordinator，但它仍保留部分旧测试命名/假设；恢复时应统一测试契约，不能只看当前绿灯。
6. 头像、合包、Timinghell 相关工作区改动仍未提交；不要 `git add -A`，不要包含 `penguin-bicycle.html`。

## 工作区注意

当前工作区是共享目录，另一个 AI 可能继续修改。恢复时先运行 `git status --short` 和 `git diff --stat`，逐文件检查冲突。

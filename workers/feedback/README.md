# 反馈提交 Worker

匿名提交仅开放 `POST /v1/suggestions`，无列表、删除或任意 key 访问接口。默认关闭写入。完整实现、绑定与上线验收见 [feedback-deployment.md](../../docs/feedback-deployment.md)。

## 已有组件

| 文件 | 职责 |
| --- | --- |
| `src/index.ts` | 路由、白名单 CORS、配置关闭、验证、幂等条件写入 |
| `src/request.ts` | 方法、Origin、类型、限长读体与 JSON |
| `src/policy.ts` | Turnstile 检查、额度规则、IP 哈希 |
| `src/coordinatorAdapter.ts` | 连接固定全局 Durable Object |
| `src/QuotaCoordinator.ts` | 原子持久化配额、UUID 跨日预留、过期清理 |
| `src/store.ts` | key、正文摘要、幂等判定 |
| `src/env.ts` | 绑定配置检查 |

浏览、关闭状态的 CORS 预检不访问 R2 或 DO。有效 POST 依次经过：配置 → 方法/Origin/限长/白名单 → 原子验证额度 → Turnstile → 接纳预留 → 幂等读取/条件创建正文。

只绑定私有正文桶 `SUGGESTIONS`、`QUOTA` 和自身验证配置。审核状态在 Pages 专用的另一个私有桶 `SUGGESTION_REVIEWS`；公开 Worker 不能访问它，也不持有 GitHub、管理员 KV 或谱面桶凭据。

`wrangler.toml` 已包含 DO SQLite migration，仍是需核对账号、域名与桶名的部署样例。设置 `TURNSTILE_SECRET`、`IP_HASH_SALT` secrets，核对 Origin 与 hostname，先保持 `FEEDBACK_WRITES_ENABLED = "false"`。

## 本地验证

```text
npm run typecheck:workers
node --test --experimental-strip-types scripts/feedback-worker.test.mjs scripts/feedback-coordinator.test.mjs
```

这些测试使用内存替身，不是 Cloudflare 实际额度或故障恢复的证明。应用限额不能阻止攻击请求本身消耗 Worker/DO 额度；必须按实际套餐设置边缘防护和不依赖 Pages 构建的关闭规则。部署与真实平台验收尚未执行。

反馈接纳限额当前为同 IP 每天 10 条（公开 Worker 的 `DEFAULT_LIMITS`），两种前端反馈类型共用这个计数。

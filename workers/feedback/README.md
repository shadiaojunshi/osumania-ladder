# 反馈提交 Worker

全站**唯一的公开写入口**。方案见 `docs/anonymous-feedback-and-abuse-plan.md`。

## 现在能不能上线

**不能。** 代码就绪，但缺两样部署侧的东西：

1. **额度协调器**（Durable Object）。`env.QUOTA` 没绑定时 Worker 一律返回 503 —— 这是刻意的
   fail-closed：第 4 节说 KV 的 `get → 加一 → put` 和共享 `counter.json` 都不能当原子计数，
   而"每天最多 300 条"是给用户的承诺，不能在没有原子计数的前提下开放入口。
2. **第 9 节第 1 步的前置**：额度逐项实测、确认匿名刷新不触发 Functions/KV、建议桶建好。
   这些要在账号控制台做，代码这边无法代替。

另外 `FEEDBACK_WRITES_ENABLED` 缺省是关闭的 —— 就算部署上去也不会收提交。

## 权限边界

| 绑定 | 用途 |
| --- | --- |
| `SUGGESTIONS`（R2） | 建议正文与审核状态。**关掉公开读取** |
| `QUOTA`（Durable Object） | 原子额度协调器 |
| `TURNSTILE_SECRET` / `IP_HASH_SALT`（secret） | 人机验证、IP 哈希 |
| `TURNSTILE_HOSTNAME` / `ALLOWED_ORIGINS` / `FEEDBACK_WRITES_ENABLED`（vars） | 配置 |

**不该绑定**：`LADDER_KV`、主 maps 桶、备份桶、`GITHUB_TOKEN`、`SESSION_SECRET`、任何邮件密钥。

第 3 节原话："R2 普通前缀不是 IAM 安全边界；同一绑定通常能访问整个桶，不能因为叫 `suggest/`
就认为碰不到其他数据。" 所以隔离靠**不给绑定**，不靠路径前缀。

这个 Worker 也**不调用 GitHub**（第 6 节："公开提交不调用 GitHub"），
没有列表 / 删除 / 任意 key 读写路由。

## 文件

| 文件 | 职责 |
| --- | --- |
| `src/index.ts` | 入口与编排。闸门顺序在这里，每一道的顺序都是有意的 |
| `src/policy.ts` | 决策层：Turnstile 判定、频率/预算决策、IP 哈希 |
| `src/request.ts` | 方法/类型/Origin、**限长读体**、JSON 解析 |
| `src/store.ts` | 对象键、幂等判定、落盘；`r2ObjectStore` 把 R2 适配成最小接口 |
| `src/env.ts` | 绑定契约与配置完整性检查（fail-closed） |

请求的闸门顺序：

```
开关 → 配置完整性 → 方法/类型/Origin → 限长读体 → JSON → 白名单校验
→ 验证闸门（全局验证预算 + IP 每分钟尝试）→ Turnstile
→ 接纳闸门（全局条数 + IP 窗口/日）→ 幂等 → 写 R2 → 201
```

① **验证闸门在 Turnstile 之前**：被刷的请求连一次 siteverify 都不花。
② **接纳闸门在写之前**：验证过了但额度见底也不落盘。
③ 白名单校验直接 `import` `src/lib/suggestions/validation.ts` —— 公开端与后台**共用同一份契约**
   （第 5 节），不在这一层重写字段规则。

## 验证

```bash
npm run typecheck:workers                    # 这个 Worker 的类型检查
node --test --experimental-strip-types scripts/feedback-worker.test.mjs
```

46 个用例覆盖：预算与频率决策、IP 只认 `CF-Connecting-IP`、Turnstile 三字段核对、
限长（含 `Content-Length` 撒谎）、幂等三种结果、以及端到端编排（用假 env + 真 `Request`/`Response`）。

变异测试 9 处、抓到 8 处（第 9 处是"配置检查不查 QUOTA"—— handler 里还有第二道兜底，
属冗余而非盲区）。

⚠️ 这些**都不是平台证据**。真实 Cloudflare 上的行为（DO 定价、WAF 限流是否按路径生效、
R2 lifecycle、Turnstile 的 hostname 回填）必须按第 9 节的验收清单在账号里实测。

## 上线步骤

1. 逐项记录当前套餐与用量（方案第 2 节的表），确认重置时区。
2. 建建议桶，**关掉公开读取**。
3. 实现并部署额度协调器（Durable Object），在**同一个串行事务**里调用
   `src/policy.ts` 的 `decideVerificationGate` / `decideAcceptanceGate` ——
   决策规则只有这一份实现，DO 里那份只是调用它。
4. `wrangler secret put TURNSTILE_SECRET` / `IP_HASH_SALT`；核对 `TURNSTILE_HOSTNAME`
   与 `ALLOWED_ORIGINS`。
5. 先保持 `FEEDBACK_WRITES_ENABLED = "false"` 部署，验证静态页与路由（匿名刷新不触发 Functions）。
6. 低预算灰度：把开关改成 `"true"`，分别验证正常提交、机器人重复请求、关闭开关三条路径，
   并在控制台对照真实的请求/存储操作增量。

## 出事时怎么关

把 `FEEDBACK_WRITES_ENABLED` 改回 `"false"` 并重新部署即可 —— 提交端立刻 503，
静态页与后台不受影响（第 4 节第 6 条要求的"无需代码构建的边缘关闭开关"
需要 WAF 规则或环境变量，按实际套餐选）。

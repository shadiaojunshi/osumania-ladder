// 反馈 Worker 的绑定与配置契约。
//
// 依据 docs/anonymous-feedback-and-abuse-plan.md 第 3 节 —— **权限边界就是这个接口**：
// 这个 Worker 只该拿到下面这些绑定，别的一律不给。
//
//   ✅ 应该绑定：独立建议桶、Turnstile secret、额度协调器
//   ❌ 不该绑定：LADDER_KV、主 maps 桶、备份桶、GITHUB_TOKEN、SESSION_SECRET、任何邮件密钥
//
// 第 3 节的原话："R2 普通前缀不是 IAM 安全边界；同一绑定通常能访问整个桶，不能因为叫
// `suggest/` 就认为碰不到其他数据。" 所以隔离靠"不给绑定"，不靠路径前缀。

import type { RateDecision } from './policy.ts'

export interface Env {
  /** 独立的建议桶。**关掉公开读取**（第 3 节）。 */
  SUGGESTIONS: R2Bucket
  /** Turnstile 的服务端密钥。只在服务端，绝不进前端包。 */
  TURNSTILE_SECRET?: string
  /** 本站的 hostname（siteverify 要核对它）。 */
  TURNSTILE_HOSTNAME?: string
  /** 允许的 Origin，逗号分隔（精确匹配，不做前缀/后缀匹配）。 */
  ALLOWED_ORIGINS?: string
  /** IP 哈希的盐。**按天轮换**（见 `dailySalt`）。 */
  IP_HASH_SALT?: string
  /**
   * 提交总开关。只有显式设成 `'true'` 才开启 ——
   * 第 9 节第 1 步要求"搭建独立建议桶和服务，**默认关闭写入**"，而那一
   * 步的前提（额度实测、路由验证、桶建好、协调器就位）需要站长在控制台操作，
   * 代码这边不能假设已经就绪。
   */
  FEEDBACK_WRITES_ENABLED?: string
  /**
   * 额度协调器（Durable Object）。**没配就不开放写入** ——
   * 第 4 节末："KV 的 get→加一→put 和 R2 一个共享 counter.json 都不能当原子计数"，
   * 免费边缘限流与内存计数只能尽力而为、必须明说会有超调。既然"每天最多 300 条"
   * 是给用户的承诺，就不能在没有原子计数的前提下开放入口。
   */
  QUOTA?: QuotaCoordinator
}

export type QuotaKind = 'verification' | 'acceptance'

/**
 * 原子额度协调器。实现方（Durable Object）必须在**同一个串行事务**里
 * 调 `policy.ts` 的决策函数：通过才 +1，否则原样返回拒绝决定。
 *
 * 把决策留在 `policy.ts` 而不是各写一份，是为了"给定计数该不该放行"这条规则只有
 * 一个实现 —— DO 里那份只是调用它。
 */
export interface QuotaCoordinator {
  reserve(ipHash: string, kind: QuotaKind): Promise<RateDecision>
}

export function writesEnabled(env: Env): boolean {
  return env.FEEDBACK_WRITES_ENABLED === 'true'
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

/**
 * 当天的盐：`<基础盐>:<YYYY-MM-DD>`（UTC）。
 *
 * 为什么要轮换：同一天的记录互相之间可以用同一个哈希关联（"同一台机器提交了 3 条"），
 * 但**跨天无法关联**。第 4 节第 4 条要求"按天轮换用途密钥/盐；日志不保存原始 IP"。
 */
export function dailySalt(base: string, now: Date): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${base}:${y}-${m}-${d}`
}

export interface WorkerConfig {
  turnstileSecret: string
  turnstileHostname: string
  allowedOrigins: string[]
  ipSalt: string
}

/**
 * 配置完整性检查。缺任何一项都**不开放写入**（fail-closed）：
 * 半配置状态下最容易发生的不是"功能不可用"，而是"某一道闸门被静默跳过"。
 */
export function readConfig(env: Env): { ok: true; value: WorkerConfig } | { ok: false; missing: string[] } {
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS)
  const missing: string[] = []
  if (!env.TURNSTILE_SECRET) missing.push('TURNSTILE_SECRET')
  if (!env.TURNSTILE_HOSTNAME) missing.push('TURNSTILE_HOSTNAME')
  if (allowedOrigins.length === 0) missing.push('ALLOWED_ORIGINS')
  if (!env.IP_HASH_SALT) missing.push('IP_HASH_SALT')
  if (!env.QUOTA) missing.push('QUOTA')
  if (missing.length > 0) return { ok: false, missing }
  return {
    ok: true,
    value: {
      turnstileSecret: env.TURNSTILE_SECRET as string,
      turnstileHostname: env.TURNSTILE_HOSTNAME as string,
      allowedOrigins,
      ipSalt: env.IP_HASH_SALT as string,
    },
  }
}

// GitHub Contents API 的唯一访问入口 + 上游失败分类（R14）。
//
// 为什么需要分类：这些端点在 GitHub 出错时过去一律降级成「空数据」——
// ref-ladder / packs-manifest 的 GET 直接回 `{ data: { entries: [] } }` / 空清单，
// tournaments/[id] 把**所有**失败都回 404。站长看到的是「标尺没了 / 包没了 / 这场比赛没了」，
// 而真实原因可能是 401（GITHUB_TOKEN 失效）或限流。数据其实一份没少。
//
// 这里唯一要小心的坑：**GitHub 对无权访问的私有仓库回 404，不是 403** ——
// 也就是说「token 失效」与「文件真的不存在」在状态码上完全一样。
//（2026-11 token 到期时后台三个 tab 全空，就是这个：private repo 被拒 → 404。）
// 所以 404 不能直接当成「不存在」：要探一下仓库本身还看不看得见。

import { jsonResponse } from './cors'

export const GITHUB_API = 'https://api.github.com'

export interface GithubEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
}

export interface UpstreamFailure {
  /**
   * 回给前端的 HTTP 状态。上游故障一律 502：
   * 401 在中间件里已经是「你没登录」的语义，不能被上游凭据问题占用。
   */
  status: number
  code: string
  error: string
}

async function rawFetch(
  path: string,
  env: GithubEnv,
  options: RequestInit = {},
): Promise<Response | null> {
  try {
    return await fetch(`${GITHUB_API}/repos/${env.GITHUB_REPO}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'osumania-ladder',
        ...((options.headers as Record<string, string>) || {}),
      },
    })
  } catch {
    return null
  }
}

/**
 * 带鉴权的 GitHub 请求。网络中断不抛异常 —— 归到 UPSTREAM_UNREACHABLE，
 * 这样每个调用点只要判断 `!res.ok` 就能覆盖「连不上」这一种。
 */
export async function githubFetch(
  path: string,
  env: GithubEnv,
  options: RequestInit = {},
): Promise<Response> {
  const res = await rawFetch(path, env, options)
  if (res) return res
  return new Response(
    JSON.stringify({
      code: 'UPSTREAM_UNREACHABLE',
      error: '连接 GitHub 失败（网络中断或超时），请重试。',
    }),
    { status: 502, headers: { 'Content-Type': 'application/json' } },
  )
}

// githubFetch 自己合成的故障响应带了我们自己的 code，直接透传，不再按 GitHub 的状态码解释。
async function readOwnFailure(res: Response): Promise<UpstreamFailure | null> {
  // 用 clone 读一次,不消费调用方还要用的 body。
  // 但**调用方若已经读过 body,clone 会抛** ("Body has already been consumed"),所以这里
  // 必须兜住:读不到就当"不是我们自己合成的故障",继续按状态码分类 —— 绝不能因为
  // 读个诊断信息把整个请求变成 500。
  let body: { code?: unknown; error?: unknown } | null = null
  try {
    body = (await res.clone().json()) as { code?: unknown; error?: unknown }
  } catch {
    return null
  }
  if (!body || typeof body.code !== 'string' || !body.code.startsWith('UPSTREAM_')) return null
  return {
    status: res.status,
    code: body.code,
    error: typeof body.error === 'string' ? body.error : '上游请求失败。',
  }
}

/**
 * 把 GitHub 的非 2xx 响应分类成能回给前端的错误。
 *
 * 404 也在这里返回（code `NOT_FOUND`）—— 调用方自己决定「不存在」是不是合法空态
 *（例如 ref-ladder.json 还没建时，404 就是「空链」而不是故障）。
 *
 * 需要 env 是为了在 404 时探测仓库可见性，见文件头注释。
 */
export async function classifyGithubFailure(
  res: Response,
  env: GithubEnv,
): Promise<UpstreamFailure> {
  const own = await readOwnFailure(res)
  if (own) return own

  if (res.status === 401) {
    return {
      status: 502,
      code: 'UPSTREAM_AUTH',
      error: 'GitHub 凭据无效或已过期（后台的 GITHUB_TOKEN），数据没有被删除。',
    }
  }

  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    if (res.status === 429 || remaining === '0') {
      return { status: 502, code: 'UPSTREAM_RATE_LIMIT', error: 'GitHub 接口限流，请稍后重试。' }
    }
    return {
      status: 502,
      code: 'UPSTREAM_FORBIDDEN',
      error: 'GitHub 拒绝了这次请求（token 权限不足或仓库配置有误）。',
    }
  }

  if (res.status === 404) {
    // path 传空串 = 仓库本身（rawFetch 已经拼了 `/repos/${repo}` 前缀）。
    const probe = await rawFetch('', env)
    if (probe?.ok) {
      return { status: 404, code: 'NOT_FOUND', error: '仓库里没有这个文件或目录。' }
    }
    if (probe?.status === 404) {
      return {
        status: 502,
        code: 'UPSTREAM_AUTH',
        error: '读不到数据仓库（GITHUB_TOKEN 失效或已无权访问），数据没有被删除。',
      }
    }
    // 探测本身也失败了（限流 / 5xx / 网络）→ 说不清这个 404 是哪一种。
    // 宁可报「上游故障」让站长重试，也不要伪装成「文件不存在」。
    return {
      status: 502,
      code: 'UPSTREAM_ERROR',
      error: 'GitHub 返回 404，但无法确认仓库是否可见（探测请求也失败了），请重试。',
    }
  }

  return { status: 502, code: 'UPSTREAM_ERROR', error: `GitHub 返回 ${res.status}。` }
}

/**
 * 分不出具体类别（5xx / 没见过的状态码）的上游故障。
 *
 * 写路径用它做分流：具体类别（凭据/限流/权限/网络）由 `upstreamFailureResponse` 给出
 * 可操作的文案；这一类则让调用方保留自己更具体的提示 + GitHub 原文，
 * 但**状态码仍统一成 502**，不透传上游的状态码。
 */
export function isGenericUpstreamFailure(failure: UpstreamFailure): boolean {
  return failure.code === 'UPSTREAM_ERROR'
}

/** 分类结果 → 响应。 */
export function upstreamFailureResponse(failure: UpstreamFailure): Response {
  return jsonResponse({ error: failure.error, code: failure.code }, failure.status)
}

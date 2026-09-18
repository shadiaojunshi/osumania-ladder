import { jsonResponse, noContent } from './_lib/cors'
import { hasRole, type AuthEnv, type SessionUser } from './_lib/auth'
import { writeAudit } from './_lib/audit'
import {
  githubFetch,
  classifyGithubFailure,
  isGenericUpstreamFailure,
  upstreamFailureResponse,
} from './_lib/github'
import { readJsonBody, validatePacksManifest } from './_lib/validation'

interface Env extends AuthEnv {
  GITHUB_TOKEN: string
  GITHUB_REPO: string
}

export const onRequestOptions: PagesFunction<Env> = async () => noContent()

// 读取：任何已登录用户可读（中间件已保证登录）。
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const res = await githubFetch('/contents/data/packs-manifest.json', env)
  if (!res.ok) {
    const failure = await classifyGithubFailure(res, env)
    // 清单文件还不存在 = 合法的空清单；其余上游故障要报错，
    // 否则站长在链接编辑器里看到的是「一个包都没有」。
    if (failure.code === 'NOT_FOUND') {
      return jsonResponse({ manifest: { packs: [], lastGenerated: '' }, sha: null })
    }
    return upstreamFailureResponse(failure)
  }
  const file = (await res.json()) as { content: string; sha: string }
  const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))))
  const manifest = JSON.parse(decoded)
  return jsonResponse({ manifest, sha: file.sha })
}

// 更新：contributor 及以上。
export const onRequestPut: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as { user?: SessionUser }).user ?? null
  if (!hasRole(user, 'contributor')) {
    return jsonResponse({ error: '需要 contributor 及以上权限', code: 'FORBIDDEN' }, 403)
  }

  const body = await readJsonBody(request)
  if (!body.ok) {
    return jsonResponse({ error: body.error, code: 'INVALID_MANIFEST' }, 400)
  }
  const parsed = body.value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return jsonResponse({ error: '请求体必须是 JSON 对象', code: 'INVALID_MANIFEST' }, 400)
  }
  const { manifest, sha } = parsed as { manifest?: unknown; sha?: unknown }
  if (typeof sha !== 'string' || sha.trim() === '') {
    return jsonResponse({ error: '缺少编辑基准 sha', code: 'INVALID_MANIFEST' }, 400)
  }

  // 清单里的链接会直接出现在下载页:允许任意对象写进来等于允许写坏线上链接。
  const validated = validatePacksManifest(manifest)
  if (!validated.ok) {
    return jsonResponse({ error: validated.error, code: 'INVALID_MANIFEST' }, 400)
  }

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(validated.value, null, 2) + '\n')))

  const res = await githubFetch('/contents/data/packs-manifest.json', env, {
    method: 'PUT',
    body: JSON.stringify({ message: 'Update packs manifest links', content, sha }),
  })

  if (!res.ok) {
    // R14:同上 —— 写路径的凭据失效必须回 502 UPSTREAM_AUTH,不能是 401。
    const failure = await classifyGithubFailure(res, env)
    if (!isGenericUpstreamFailure(failure)) return upstreamFailureResponse(failure)
    // 分不出类别时保留 GitHub 原文(状态码仍是 502)。
    const err = await res.json().catch(() => ({}))
    return jsonResponse({ error: 'Failed to update', details: err }, failure.status)
  }

  await writeAudit(env.LADDER_KV, {
    actorUid: user!.uid,
    actorName: user!.username,
    action: 'packs.update',
    target: 'packs-manifest.json',
    ip: request.headers.get('CF-Connecting-IP') ?? undefined,
  })

  return jsonResponse({ success: true })
}

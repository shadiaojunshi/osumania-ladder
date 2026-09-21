import { stripToken, validateSubmission } from '../../../src/lib/suggestions/validation.ts'
import { dailySalt, parseAllowedOrigins, readConfig, writesEnabled, type Env } from './env.ts'
import { clientIp, hashIp, verifyTurnstile } from './policy.ts'
import { checkRequestShape, parseJsonBody, readBoundedBody } from './request.ts'
import { checkIdempotency, payloadHashOf, suggestionKey } from './store.ts'
import { coordinatorFor, type Coordinator } from './coordinatorAdapter.ts'
export { QuotaCoordinator } from './QuotaCoordinator.ts'

export interface Deps { now?: () => Date; fetchImpl?: typeof fetch; coordinator?: Coordinator }

export async function handleSubmit(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const origin = request.headers.get('Origin')
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS)
  const cors: Record<string, string> = origin && allowedOrigins.includes(origin) ? {
    'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Expose-Headers': 'Retry-After',
    'Access-Control-Max-Age': '600', Vary: 'Origin',
  } : { Vary: 'Origin' }
  const json = (body: unknown, status: number, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...cors, ...headers } })
  const reject = (code: string, status: number, errors: unknown[] = [], retry?: number) => json({ ok: false, code, errors }, status, retry ? { 'Retry-After': String(retry) } : {})
  if (new URL(request.url).pathname !== '/v1/suggestions') return reject('BAD_REQUEST', 404)
  if (request.method === 'OPTIONS') return cors['Access-Control-Allow-Origin'] ? new Response(null, { status: 204, headers: cors }) : reject('BAD_REQUEST', 403)
  if (!writesEnabled(env) || !readConfig(env).ok) return reject('DISABLED', 503, [], 3600)
  const shape = checkRequestShape(request, { allowedOrigins })
  if (!shape.ok) return reject('BAD_REQUEST', shape.status, [{ field: 'request', code: shape.code, message: '' }])
  try {
    const body = await readBoundedBody(request)
    if (!body.ok) return reject(body.code === 'too-large' ? 'TOO_LARGE' : 'BAD_REQUEST', body.code === 'too-large' ? 413 : 400)
    const parsed = parseJsonBody(body.text)
    if (!parsed.ok) return reject('BAD_REQUEST', 400)
    const validated = validateSubmission(parsed.value)
    if (!validated.ok) return reject('BAD_REQUEST', 400, validated.errors)
    const ip = clientIp(request)
    if (!ip) return reject('INTERNAL', 503)
    const ipHash = await hashIp(ip, dailySalt(env.IP_HASH_SALT!, (deps.now ?? (() => new Date()))()))
    const coordinator = deps.coordinator ?? coordinatorFor(env.QUOTA!)
    const verification = await coordinator.reserve(ipHash, 'verification')
    if (!verification.allow) return reject(verification.code, verification.status, [], verification.retryAfterSeconds)
    const challenge = await verifyTurnstile({ token: validated.value.turnstileToken, secret: env.TURNSTILE_SECRET!, remoteIp: ip, expectedHostname: env.TURNSTILE_HOSTNAME!, fetchImpl: deps.fetchImpl ?? fetch })
    if (!challenge.ok) return reject('TURNSTILE_FAILED', 403)
    const submission = stripToken(validated.value)
    const payloadHash = await payloadHashOf(submission)
    const accepted = await coordinator.submission(ipHash, submission.clientRequestId, payloadHash)
    if (!accepted.allow) return reject(accepted.code, accepted.status, [], 'retryAfterSeconds' in accepted ? accepted.retryAfterSeconds : undefined)
    const { id, receivedAt } = accepted.reservation
    const key = suggestionKey(id, new Date(receivedAt))
    const existing = await env.SUGGESTIONS.get(key)
    const outcome = checkIdempotency(existing ? await existing.text() : null, payloadHash)
    if (outcome.action === 'conflict') return reject('DUPLICATE_CONFLICT', 409)
    if (outcome.action === 'replay') return json({ ok: true, ...outcome.receipt }, 200)
    const record = { id, receivedAt, payloadHash, ipHash, status: 'pending', revision: 0, submission }
    const stored = await env.SUGGESTIONS.put(key, JSON.stringify(record), { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } })
    if (!stored) {
      const concurrent = await env.SUGGESTIONS.get(key)
      const replay = checkIdempotency(concurrent ? await concurrent.text() : null, payloadHash)
      if (replay.action !== 'replay') return reject('INTERNAL', 503, [], 5)
      return json({ ok: true, ...replay.receipt }, 200)
    }
    return json({ ok: true, id, receivedAt }, 201)
  } catch {
    return reject('INTERNAL', 503, [], 5)
  }
}

const worker = { fetch: handleSubmit }
export default worker

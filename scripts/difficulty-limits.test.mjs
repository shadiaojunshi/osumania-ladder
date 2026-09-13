import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// 难度阈值:>18 警告(不拦),>25 拒绝写入。
//
// 这里有两件必须盯住的事:
//   ① 阈值不能误伤现有数据 —— 全库最大难度是 17(difficultyLn 17.2),所以要有个
//      真实数据全量用例;哪天真出现 18 以上的值,这个用例会先亮红灯,提醒重新定阈值。
//   ② 前端(src/lib/difficultyLimits.ts)和 Functions(functions/api/_lib/validation.ts)
//      各有一份常量(前后端不能互相 import),必须断言两边相等。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const {
  DIFFICULTY_MAX,
  DIFFICULTY_WARN_ABOVE,
  classifyDifficulty,
  collectOutOfRange,
  formatDifficulty,
  formatOutOfRange,
  shouldAcceptDifficultyInput,
} = await import('../src/lib/difficultyLimits.ts')
const { LIMITS, validateTournament } = await import('../functions/api/_lib/validation.ts')
const { onRequestPut: updateTournament } = await import('../functions/api/tournaments/[id].ts')

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url))

const jsonRes = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data })

function installFetch(routes) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase()
    const full = String(url)
    calls.push({ method, url: full, body: options.body ? JSON.parse(options.body) : null })
    const path = full.replace(/^https:\/\/api\.github\.com\/repos\/o\/r/, '')
    const route = routes.find((r) => r.method === method && path.startsWith(r.path))
    if (!route) throw new Error(`不该发出的请求: ${method} ${path}`)
    return typeof route.reply === 'function' ? route.reply(path) : route.reply
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

const env = { GITHUB_TOKEN: 'token', GITHUB_REPO: 'o/r', LADDER_KV: { put: async () => {} } }

const tournamentWithDifficulty = (difficulty, difficultyLn) => ({
  id: 'limit-test',
  name: 'Limit Test',
  abbreviation: 'LT',
  keyCount: 4,
  year: 2026,
  rounds: [{
    id: 'round-1',
    name: '',
    abbreviation: '',
    order: 1,
    difficulty: { min: 0, max: difficulty, average: difficulty },
    maps: [{
      slot: 'RC1',
      type: 'RC',
      realType: 'SS',
      difficulty,
      ...(difficultyLn === undefined ? {} : { difficultyLn }),
    }],
  }],
})

test('难度阈值:>18 警告、>25 拒绝,边界值本身合法', () => {
  assert.equal(classifyDifficulty(0), 'ok')
  assert.equal(classifyDifficulty(17.2), 'ok')
  assert.equal(classifyDifficulty(DIFFICULTY_WARN_ABOVE), 'ok', '18 本身不警告')
  assert.equal(classifyDifficulty(18.1), 'warn')
  assert.equal(classifyDifficulty(DIFFICULTY_MAX), 'warn', '25 本身还能存,只是警告')
  assert.equal(classifyDifficulty(25.1), 'over')
  assert.equal(classifyDifficulty(190), 'over', '多按一个 0')
  assert.equal(classifyDifficulty(Number.NaN), 'ok', '非数字不在这里判')
})

test('难度输入是否接受:空串与非法文本放行,超上限拒绝', () => {
  assert.equal(shouldAcceptDifficultyInput(''), true, '清空字段要能过')
  assert.equal(shouldAcceptDifficultyInput('  '), true)
  assert.equal(shouldAcceptDifficultyInput('19'), true)
  assert.equal(shouldAcceptDifficultyInput('25'), true)
  assert.equal(shouldAcceptDifficultyInput('25.5'), false)
  assert.equal(shouldAcceptDifficultyInput('190'), false)
  assert.equal(shouldAcceptDifficultyInput('-3'), true, '负数不在本规则范围')
  assert.equal(shouldAcceptDifficultyInput('abc'), true, '非法文本交给字段自己的校验')
})

test('越界汇总与展示', () => {
  const list = collectOutOfRange({ rc: 19, tbLn: 26, sv: 0, name: 'x', missing: undefined })
  assert.deepEqual(list.map((i) => [i.key, i.level]), [['rc', 'warn'], ['tbLn', 'over']])
  assert.equal(formatOutOfRange(list), 'rc 19、tbLn 26')
  assert.equal(formatDifficulty(19), '19')
  assert.equal(formatDifficulty(19.5), '19.5')
  assert.equal(formatDifficulty(19.456), '19.46')
  assert.deepEqual(collectOutOfRange({}), [])
})

test('前后端两份常量必须一致(它们不能互相 import)', () => {
  assert.equal(DIFFICULTY_MAX, LIMITS.maxDifficulty, 'src/lib/difficultyLimits.ts 与 functions/_lib/validation.ts 的难度上限要同步改')
  assert.ok(DIFFICULTY_MAX > DIFFICULTY_WARN_ABOVE)
})

test('现有 50 场比赛的难度全部低于警告线(阈值不会误伤真实数据)', () => {
  const offenders = []
  let maxSeen = 0
  for (const file of readdirSync(`${DATA_DIR}tournaments`).filter((f) => f.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(`${DATA_DIR}tournaments/${file}`, 'utf-8'))
    for (const round of data.rounds || []) {
      for (const key of ['min', 'max', 'average']) {
        const value = round.difficulty?.[key]
        if (typeof value === 'number') {
          maxSeen = Math.max(maxSeen, value)
          if (value > DIFFICULTY_WARN_ABOVE) offenders.push(`${file} ${round.id}.difficulty.${key}=${value}`)
        }
      }
      for (const [type, dims] of Object.entries(round.typeDifficulties || {})) {
        for (const [dim, value] of Object.entries(dims)) {
          if (typeof value !== 'number') continue
          maxSeen = Math.max(maxSeen, value)
          if (value > DIFFICULTY_WARN_ABOVE) offenders.push(`${file} ${round.id}.${type}.${dim}=${value}`)
        }
      }
      for (const map of round.maps || []) {
        for (const key of ['difficulty', 'difficultyLn']) {
          const value = map[key]
          if (typeof value !== 'number') continue
          maxSeen = Math.max(maxSeen, value)
          if (value > DIFFICULTY_WARN_ABOVE) offenders.push(`${file} ${round.id} ${map.slot}.${key}=${value}`)
        }
      }
    }
  }
  assert.ok(maxSeen > 0, '没扫到任何难度值,扫描逻辑可能坏了')
  assert.deepEqual(offenders, [], `现有数据出现超过 ${DIFFICULTY_WARN_ABOVE} 的难度,请重新确认阈值`)
})

test('服务端兜底:难度超过上限的保存被 400 拦下,等于上限的能存', async () => {
  const over = validateTournament(tournamentWithDifficulty(DIFFICULTY_MAX + 1))
  assert.equal(over.ok, false)
  assert.match(over.error, new RegExp(`不能大于 ${DIFFICULTY_MAX}`))

  const atLimit = validateTournament(tournamentWithDifficulty(DIFFICULTY_MAX))
  assert.equal(atLimit.ok, true, atLimit.ok ? '' : atLimit.error)

  // difficultyLn 与轮次级 difficulty 走同一上限
  const overLn = validateTournament(tournamentWithDifficulty(10, DIFFICULTY_MAX + 5))
  assert.equal(overLn.ok, false)

  const okBody = tournamentWithDifficulty(20)
  const fetch = installFetch([
    { method: 'PUT', path: '/contents/data/tournaments/limit-test.json', reply: jsonRes(200, { content: { sha: 's2' } }) },
  ])
  try {
    const res = await updateTournament({
      params: { id: 'limit-test' },
      request: { json: async () => ({ tournament: okBody, sha: 's1' }), headers: { get: () => null } },
      env,
      data: { user: { uid: '1', username: 'tester', role: 'admin' } },
    })
    assert.equal(res.status, 200)

    const badRes = await updateTournament({
      params: { id: 'limit-test' },
      request: {
        json: async () => ({ tournament: tournamentWithDifficulty(190), sha: 's2' }),
        headers: { get: () => null },
      },
      env,
      data: { user: { uid: '1', username: 'tester', role: 'admin' } },
    })
    assert.equal(badRes.status, 400, '190 必须被拦下')
    assert.match((await badRes.json()).error, new RegExp(`不能大于 ${DIFFICULTY_MAX}`))
    assert.equal(fetch.calls.filter((c) => c.method === 'PUT').length, 1, '被拦下的请求不该写 GitHub')
  } finally {
    fetch.restore()
  }
})

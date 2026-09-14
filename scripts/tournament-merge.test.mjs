import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// 保存冲突三方合并。要盯住的事:
//   ① 规则表每一格都要有断言 —— 尤其是"两边都改"必须记冲突,绝不自动选边;
//   ② 配对必须按 round.id / map.slot,不能按数组下标(服务器插一轮会让后面全部错位);
//   ③ 键序无关:服务器只是重排了键,不该被当成改动,否则会凭空造出一堆假冲突。
// ③ 最有说服力的验证是最后那条真实数据自比。

register(new URL('./_ts-extension-loader.mjs', import.meta.url))

const { mergeTournament, planConflictRecovery } = await import('../src/lib/tournamentMerge.ts')

const DATA_DIR = fileURLToPath(new URL('../data/tournaments/', import.meta.url))

function baseTournament() {
  return {
    id: 'sample-cup',
    name: 'Sample Cup',
    abbreviation: 'SC',
    keyCount: 4,
    year: 2026,
    rounds: [
      {
        id: 'round-1',
        name: 'Qualifiers',
        abbreviation: 'Qual',
        order: 1,
        difficulty: { min: 10, max: 11, average: 10.5 },
        maps: [
          { slot: 'ST1', type: 'RC', realType: '', name: '', difficulty: 0, beatmapId: 101 },
          { slot: 'ST2', type: 'RC', realType: '', name: '', difficulty: 0, beatmapId: 102 },
        ],
      },
      {
        id: 'round-2',
        name: 'Round of 32',
        abbreviation: 'R32',
        order: 2,
        difficulty: { min: 12, max: 13, average: 12.5 },
        maps: [{ slot: 'FU1', type: 'FU', realType: '', name: '', difficulty: 0, beatmapId: 201 }],
      },
    ],
  }
}

const mapOf = (tournament, roundId, slot) =>
  tournament.rounds.find((round) => round.id === roundId).maps.find((map) => map.slot === slot)

test('规则表:服务器改过、你没碰 → 采用服务器值并记进 followed', () => {
  const base = baseTournament()
  const mine = structuredClone(base)
  const theirs = structuredClone(base)
  mapOf(theirs, 'round-1', 'ST1').name = 'Artist - Song [ST1]'

  const out = mergeTournament(base, mine, theirs)

  assert.deepEqual(out.conflicts, [])
  assert.equal(mapOf(out.merged, 'round-1', 'ST1').name, 'Artist - Song [ST1]')
  assert.equal(out.followed.length, 1)
  assert.equal(out.followed[0].path, 'Qual · ST1 · name')
  assert.equal(out.followed[0].value, 'Artist - Song [ST1]')
})

test('规则表:你改过、服务器没碰 → 保留你的,不记 followed', () => {
  const base = baseTournament()
  const mine = structuredClone(base)
  mapOf(mine, 'round-1', 'ST1').difficulty = 11.24
  const theirs = structuredClone(base)

  const out = mergeTournament(base, mine, theirs)

  assert.deepEqual(out.conflicts, [])
  assert.deepEqual(out.followed, [])
  assert.equal(mapOf(out.merged, 'round-1', 'ST1').difficulty, 11.24)
})

test('规则表:都没改 → 原样通过', () => {
  const base = baseTournament()
  const out = mergeTournament(base, structuredClone(base), structuredClone(base))

  assert.deepEqual(out.conflicts, [])
  assert.deepEqual(out.followed, [])
  assert.deepEqual(out.merged, base)
})

test('规则表:两边都改且不同 → 记冲突,merged 保守取 mine', () => {
  const base = baseTournament()
  const mine = structuredClone(base)
  mapOf(mine, 'round-1', 'ST1').name = 'Mine'
  const theirs = structuredClone(base)
  mapOf(theirs, 'round-1', 'ST1').name = 'Theirs'

  const out = mergeTournament(base, mine, theirs)

  assert.equal(out.conflicts.length, 1)
  const [conflict] = out.conflicts
  assert.equal(conflict.path, 'Qual · ST1 · name')
  assert.equal(conflict.roundId, 'round-1')
  assert.equal(conflict.slot, 'ST1')
  assert.equal(conflict.field, 'name')
  assert.equal(conflict.mine, 'Mine')
  assert.equal(conflict.theirs, 'Theirs')
  assert.equal(out.merged.rounds[0].maps[0].name, 'Mine', '有冲突时不能替用户选服务器那版')
})

test('规则表:两边改成同一个值 → 不算冲突', () => {
  const base = baseTournament()
  const mine = structuredClone(base)
  mapOf(mine, 'round-1', 'ST1').name = 'Same'
  const theirs = structuredClone(base)
  mapOf(theirs, 'round-1', 'ST1').name = 'Same'

  const out = mergeTournament(base, mine, theirs)

  assert.deepEqual(out.conflicts, [])
  assert.equal(out.merged.rounds[0].maps[0].name, 'Same')
})

test('键序无关:服务器只是重排了键,不该被当成改动', () => {
  const base = baseTournament()
  const mine = structuredClone(base)
  const theirs = structuredClone(base)
  const original = mapOf(theirs, 'round-1', 'ST1')
  theirs.rounds[0].maps[0] = {
    slot: original.slot,
    name: original.name,
    beatmapId: original.beatmapId,
    difficulty: original.difficulty,
    type: original.type,
    realType: original.realType,
  }

  const out = mergeTournament(base, mine, theirs)

  assert.deepEqual(out.conflicts, [])
  assert.deepEqual(out.followed, [], '键序变化不该被记成"服务器改了这些字段"')
})

test('undefined 与字段缺失等价', () => {
  const base = baseTournament()
  const mine = structuredClone(base)
  mapOf(mine, 'round-1', 'ST1').difficultyLn = undefined
  const theirs = structuredClone(base)

  const out = mergeTournament(base, mine, theirs)

  assert.deepEqual(out.conflicts, [])
  assert.deepEqual(out.followed, [])
})

test('round 按 id 配对:服务器在中间插一轮,后面的轮次不会被顶错', () => {
  const base = baseTournament()
  const mine = structuredClone(base)
  const theirs = structuredClone(base)
  theirs.rounds.splice(1, 0, {
    id: 'round-1b',
    name: 'Extra Round',
    abbreviation: 'EXT',
    order: 2,
    difficulty: { min: 0, max: 0, average: 0 },
    maps: [],
  })

  const out = mergeTournament(base, mine, theirs)

  assert.deepEqual(out.conflicts, [])
  assert.equal(out.merged.rounds.length, 3)
  assert.equal(out.merged.rounds[0].id, 'round-1', '第一轮不能被插进来的那轮顶掉')
  assert.equal(out.merged.rounds.find((round) => round.id === 'round-2').name, 'Round of 32')
  assert.equal(out.merged.rounds.find((round) => round.id === 'round-1b').abbreviation, 'EXT', '服务器新增的轮次要带上')
})

test('maps 按 slot 配对:服务器在中间插一张谱,后面的槽位不会被顶错', () => {
  const base = baseTournament()
  const mine = structuredClone(base)
  const theirs = structuredClone(base)
  theirs.rounds[0].maps.splice(1, 0, { slot: 'ST1b', type: 'RC', realType: '', name: '', difficulty: 0, beatmapId: 103 })

  const out = mergeTournament(base, mine, theirs)

  assert.deepEqual(out.conflicts, [])
  assert.equal(out.merged.rounds[0].maps.length, 3)
  assert.equal(mapOf(out.merged, 'round-1', 'ST2').beatmapId, 102, 'ST2 不能被插进来的槽位顶掉')
  assert.equal(mapOf(out.merged, 'round-1', 'ST1b').beatmapId, 103)
})

test('服务器删掉一整轮:记冲突,不悄悄复活也不悄悄删掉', () => {
  const base = baseTournament()
  const mine = structuredClone(base)
  const theirs = structuredClone(base)
  theirs.rounds = theirs.rounds.filter((round) => round.id !== 'round-2')

  const out = mergeTournament(base, mine, theirs)

  assert.equal(out.conflicts.length, 1)
  assert.equal(out.conflicts[0].field, '(整轮)')
  assert.ok(out.merged.rounds.some((round) => round.id === 'round-2'), 'merged 保留你看到的那轮,由你决定删不删')
})

test('base 为 null(新建 / legacy 草稿)时不合并,原样返回', () => {
  const mine = baseTournament()
  const theirs = structuredClone(mine)
  mapOf(theirs, 'round-1', 'ST1').name = 'Theirs'

  const out = mergeTournament(null, mine, theirs)

  assert.deepEqual(out.merged, mine)
  assert.deepEqual(out.conflicts, [])
  assert.deepEqual(out.followed, [])
})

test('典型场景:上传器回填曲名的同时你在录难度,两边的改动都要保住', () => {
  const base = baseTournament()
  const mine = structuredClone(base)          // 你打开编辑后录的难度
  mapOf(mine, 'round-1', 'ST1').difficulty = 11.24
  mapOf(mine, 'round-1', 'ST2').difficulty = 11.82
  const theirs = structuredClone(base)        // 上传器贴 BID 回填的元数据
  mapOf(theirs, 'round-1', 'ST1').name = 'Artist - Song [Stage 1]'
  mapOf(theirs, 'round-1', 'ST1').beatmapsetId = 555

  const out = mergeTournament(base, mine, theirs)

  assert.deepEqual(out.conflicts, [], '这是日常录入的主路径,不该产生需要人裁决的冲突')
  const merged = mapOf(out.merged, 'round-1', 'ST1')
  assert.equal(merged.name, 'Artist - Song [Stage 1]', '上传器回填的曲名必须保住')
  assert.equal(merged.beatmapsetId, 555)
  assert.equal(merged.difficulty, 11.24, '你录的难度必须保住')
  assert.equal(mapOf(out.merged, 'round-1', 'ST2').difficulty, 11.82)
})

test('冲突恢复:无冲突才重试,并用最新的 sha 提交合并结果', () => {
  const base = baseTournament()
  const mine = structuredClone(base)
  mapOf(mine, 'round-1', 'ST1').difficulty = 11.24
  const theirs = structuredClone(base)
  mapOf(theirs, 'round-1', 'ST1').name = 'Filled'

  const recovery = planConflictRecovery(base, mine, theirs, 'sha-new')

  assert.equal(recovery.action, 'retry')
  assert.equal(recovery.sha, 'sha-new')
  assert.equal(mapOf(recovery.tournament, 'round-1', 'ST1').difficulty, 11.24)
  assert.equal(mapOf(recovery.tournament, 'round-1', 'ST1').name, 'Filled')
})

test('冲突恢复:有真冲突就整份交给人,不自动选边', () => {
  const base = baseTournament()
  const mine = structuredClone(base)
  mapOf(mine, 'round-1', 'ST1').name = 'Mine'
  const theirs = structuredClone(base)
  mapOf(theirs, 'round-1', 'ST1').name = 'Theirs'

  const recovery = planConflictRecovery(base, mine, theirs, 'sha-new')

  assert.equal(recovery.action, 'manual')
  assert.equal(recovery.conflicts.length, 1)
})

test('冲突恢复:没有基准快照时绝不重试(否则就是拿猜的结果覆盖服务器)', () => {
  const mine = baseTournament()
  const theirs = structuredClone(mine)
  mapOf(theirs, 'round-1', 'ST1').name = 'Theirs'

  const recovery = planConflictRecovery(null, mine, theirs, 'sha-new')

  assert.equal(recovery.action, 'manual')
  assert.deepEqual(recovery.conflicts, [], '没有三方依据,连"哪里有冲突"都说不出来')
})

// 这条同时验证 eq 的键序无关、undefined 等价:任何一个写歪了,自比都会冒出冲突或 followed。
test('真实数据自比:零冲突、零跟随、内容深相等', () => {
  const files = readdirSync(DATA_DIR).filter((file) => file.endsWith('.json'))
  assert.ok(files.length > 0, '没扫到任何比赛文件,路径可能不对')

  for (const file of files) {
    const tournament = JSON.parse(readFileSync(`${DATA_DIR}${file}`, 'utf-8'))
    const out = mergeTournament(tournament, structuredClone(tournament), structuredClone(tournament))
    assert.deepEqual(out.conflicts, [], `${file} 自比出现冲突`)
    assert.deepEqual(out.followed, [], `${file} 自比出现跟随`)
    assert.deepEqual(out.merged, tournament, `${file} 自比改变了内容`)
  }
})

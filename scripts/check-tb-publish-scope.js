const fs = require('fs')
const assert = require('node:assert/strict')

function assertTbOnlyChange(before, after) {
  const other = manifest => manifest.packs.filter(p => p.realType !== 'TB')
    .slice().sort((a, b) => `${a.realType}#${a.part}`.localeCompare(`${b.realType}#${b.part}`))
  assert.deepEqual(other(after), other(before), 'TB 专项任务改动了其他包（包括镜像链接），拒绝发布')
  assert.deepEqual(after.packRouting, before.packRouting, 'TB 专项任务不能改动临时归包记录')
  const pending = manifest => (manifest.pendingMirrors || []).filter(k => !k.startsWith('TB_')).sort()
  assert.deepEqual(pending(after), pending(before), 'TB 专项任务改动了其他包的同步状态')
  for (const key of Object.keys(before)) {
    if (['packs', 'lastGenerated', 'pendingMirrors', 'packRouting'].includes(key)) continue
    assert.deepEqual(after[key], before[key], `TB 专项任务改动了额外设置 ${key}`)
  }
  const tb = after.packs.filter(p => p.realType === 'TB')
  assert.ok(tb.length > 0, 'TB 不能被清空')
  for (const p of tb) {
    assert.ok(Array.isArray(p.contentEntries) && p.contentEntries.length > 0 && p.contentEntries.length <= 50,
      `TB Part ${p.part} 超过 50 张或缺少内容记录`)
  }
}

if (require.main === module) {
  const [beforePath, afterPath] = process.argv.slice(2)
  assertTbOnlyChange(JSON.parse(fs.readFileSync(beforePath, 'utf8')), JSON.parse(fs.readFileSync(afterPath, 'utf8')))
  console.log('TB scope verified: all other packs and links unchanged.')
}
module.exports = { assertTbOnlyChange }

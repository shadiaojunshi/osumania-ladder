import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { datasetVersion } = require('./feedback-dataset-version.js')

// `feedbackDatasetVersion` 的四条性质。第三条（行尾）是真出过的 bug：git 检出在
// Windows 给 CRLF、在 CI(Linux) 给 LF，旧实现直接哈希原始字节，于是同一份数据算出
// 两个指纹 —— 而这个字段存在的意义正是"避免假变化"，它自己变成了假变化源。

const lf = (text) => Buffer.from(text, 'utf8')
const crlf = (text) => Buffer.from(text.replace(/\n/g, '\r\n'), 'utf8')

test('行尾不参与指纹：同一份数据的 CRLF 检出与 LF 检出必须一致', () => {
  const data = '{"id":"cup","rounds":[{"id":"final","maps":[{"slot":"RC1","difficulty":6.1}]}]}\n'
  const lfFiles = [{ name: 'cup.json', content: lf(data) }, { name: 'bowl.json', content: lf(data) }]
  const crlfFiles = [{ name: 'cup.json', content: crlf(data) }, { name: 'bowl.json', content: crlf(data) }]
  assert.equal(datasetVersion(lfFiles), datasetVersion(crlfFiles))

  // trailer（ref-ladder.json）同样要规范化，它是同一个 bug 的另一半。
  assert.equal(datasetVersion(lfFiles, lf('{"a":1}\n')), datasetVersion(crlfFiles, crlf('{"a":1}\n')))
})

test('LF 数据的指纹与旧实现逐字节一致（已发出去的指纹不能因此翻号）', () => {
  // 旧实现：`[...files].sort()` 排的是**文件名**，然后 update(文件名) + update(原始字节)，
  // 最后再 update(ref 的原始字节)。这里照抄这个顺序（排 name，不是排对象）。
  const legacy = (files, trailer) => {
    const hash = crypto.createHash('sha256')
    for (const file of [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) hash.update(file.name).update(file.content)
    if (trailer) hash.update(trailer)
    return hash.digest('hex')
  }
  const files = [
    { name: 'mwc-2024.json', content: lf('[{"a":1}]\n') },
    { name: 'cup-2025.json', content: lf('[{"b":2}]\n') },
  ]
  const trailer = lf('{"ladder":[]}\n')
  assert.equal(datasetVersion(files, trailer), legacy(files, trailer))
  // 改名、改内容、改 trailer 都要动指纹（否则"数据变了"永远检测不到）。
  assert.notEqual(datasetVersion([{ ...files[0], name: 'renamed.json' }, files[1]], trailer), legacy(files, trailer))
})

test('真实变化必须改变指纹，入参顺序必须不影响', () => {
  const a = { name: 'a.json', content: lf('{"difficulty":6.1}\n') }
  const b = { name: 'b.json', content: lf('{"difficulty":7.0}\n') }
  const base = datasetVersion([a, b], lf('{"ref":1}\n'))
  assert.equal(datasetVersion([b, a], lf('{"ref":1}\n')), base, '入参顺序不应影响指纹')
  assert.notEqual(datasetVersion([{ ...a, content: lf('{"difficulty":6.11}\n') }, b], lf('{"ref":1}\n')), base, '内容变了必须换指纹')
  assert.notEqual(datasetVersion([a, b], lf('{"ref":2}\n')), base, 'trailer 变了必须换指纹')
  assert.notEqual(datasetVersion([a, b]), base, '有没有 trailer 必须区分')
  assert.equal(datasetVersion([], undefined), crypto.createHash('sha256').digest('hex'), '空输入不该抛异常')
})

const crypto = require('crypto')

/**
 * 反馈数据集的指纹（`feedbackDatasetVersion`）。
 *
 * 用途：每条匿名反馈都记下当时的指纹，页面据此判断"数据是不是在你提交之后变了"。
 * 所以它的**唯一**硬要求是 —— 同样的数据必须永远算出同样的值。
 *
 * 为什么单独抽出来：原来的实现直接对**文件原始字节**做哈希，而 git 的行尾取决于平台
 * （Windows 检出是 CRLF，CI 是 LF）。同一份数据因此在本地和 CI 得到两个指纹，
 * 而这个字段存在的意义正是"避免假变化"。抽成纯函数才能对 CRLF 写测试 ——
 * 出问题的从来不是哈希，是"谁读的文件"。
 *
 * 兼容性：本函数对 LF 数据与旧实现**逐字节一致**，包括 trailer 的位置。线上 CI 是
 * Linux/LF，所以已经发出去的指纹不会因为这次修复而改变 —— 否则所有在途反馈都会
 * 被误判成"数据已变化"，那正是这个字段要防的事。
 */

/** 统一行尾再哈希：CRLF 和 LF 是同一份数据，不能算出两个指纹。 */
function normalize(content) {
  return content.toString('utf8').replace(/\r\n/g, '\n')
}

/**
 * @param {{ name: string, content: Buffer | string }[]} files
 *   参与指纹的数据文件。`name` 也进哈希（改名 = 改数据集），入参顺序不影响结果。
 * @param {Buffer | string} [trailer]
 *   追加在**最后**的无名内容（ref-ladder.json）。刻意不并进 `files`：
 *   旧实现就是"排序后的数据文件 + 末尾裸内容"，并进去会连 LF 的指纹一起改掉。
 * @returns {string} 64 位十六进制 sha256
 */
function datasetVersion(files, trailer) {
  const hash = crypto.createHash('sha256')
  for (const file of [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    hash.update(file.name)
    // 不额外插分隔符：保持与旧实现完全相同的字节流，行尾规范化是唯一的改动。
    hash.update(normalize(file.content))
  }
  if (trailer !== undefined && trailer !== null) hash.update(normalize(trailer))
  return hash.digest('hex')
}

module.exports = { datasetVersion, normalize }

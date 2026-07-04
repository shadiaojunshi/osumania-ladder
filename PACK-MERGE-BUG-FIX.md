# 合包谱面合并 Bug 修复方案

## 问题描述

### Bug 1: 没有 beatmapId 的谱面无法合并
- **现象**: mcnc2025 ro16 rc1 和 thmc 4 sf rc1 是同一张谱面 (Diao ye zong - Seiren 'Uruwashi no Ventra')，但没有合并
- **原因**: 这些谱面缺少 `beatmapId` 字段，导致使用 `raw:${r2Key}` 作为去重 key
- **结果**: 不同路径的相同谱面永远不会合并

### Bug 2: 重新上传覆盖导致引用失效
- **现象**: 东方杯 F 和 GF 用同一张谱面，重新上传 GF 文件后，新包里 GF 谱面丢失
- **原因**: 
  1. F 和 GF 的 beatmapId 相同，合并逻辑取第一次出现的路径 (F)
  2. 重新上传 GF 时覆盖了 GF 的文件，但 F 的路径可能已失效
  3. 脚本仍然尝试从 F 的路径读取，导致文件找不到

## 当前代码问题 (scripts/generate-pack.js:353-374)

```javascript
const rawEntries = []
for (const m of mapsToProcess) {
  if (!r2Keys.has(m.r2Key)) continue  // ← 文件不存在就跳过
  rawEntries.push({ ...m, isNsv: false })
  // ...
}

const bySignature = new Map()
for (const m of rawEntries) {
  // 问题: 只用 beatmapId 去重，没 bid 的用 r2Key (永远不会合并)
  const key = m.beatmapId ? `${m.beatmapId}|${m.isNsv ? 1 : 0}` : `raw:${m.r2Key}`
  const existing = bySignature.get(key)
  if (existing) {
    existing.sources.push(src)  // ← 只追加 sources，不更新文件路径
  } else {
    bySignature.set(key, { ...m, sources: [src] })
  }
}
```

## 修复方案

### 阶段 1: 为没有 bid 的谱面生成指纹 (fingerprint)

1. **添加函数**: 在 `generate-pack.js` 顶部添加谱面指纹生成函数

```javascript
const crypto = require('crypto')

// 为 .osu 文件生成指纹 (Artist + Title + Creator + Version)
// 用于没有 beatmapId 的谱面去重
async function generateMapFingerprint(oszBuffer) {
  try {
    const zip = await JSZip.loadAsync(oszBuffer)
    const osuFileName = Object.keys(zip.files).find(f => f.endsWith('.osu'))
    if (!osuFileName) return null
    
    const osuContent = await zip.files[osuFileName].async('string')
    const meta = parseOsu(osuContent)
    
    // 使用 Artist + Title + Creator + Version 组合作为指纹
    // 这些字段组合在一起足以唯一标识一张谱面
    const fingerprint = `${meta.artist || ''}|${meta.title || ''}|${meta.creator || ''}|${meta.version || ''}`
    return fingerprint.toLowerCase().trim()
  } catch (err) {
    console.warn(`Error generating fingerprint: ${err.message}`)
    return null
  }
}
```

### 阶段 2: 改进去重逻辑

2. **修改去重逻辑** (第 349-374 行)

```javascript
// 收集所有实际存在的物理条目，同时为没有 bid 的谱面生成指纹
const rawEntries = []
const fingerprintCache = new Map() // 缓存指纹，避免重复计算

for (const m of mapsToProcess) {
  if (!r2Keys.has(m.r2Key)) continue
  
  // 为没有 beatmapId 的谱面生成指纹
  let fingerprint = null
  if (!m.beatmapId) {
    if (fingerprintCache.has(m.r2Key)) {
      fingerprint = fingerprintCache.get(m.r2Key)
    } else {
      try {
        const oszBuffer = await downloadFromR2(m.r2Key)
        fingerprint = await generateMapFingerprint(oszBuffer)
        if (fingerprint) {
          fingerprintCache.set(m.r2Key, fingerprint)
        }
      } catch (err) {
        console.warn(`  Failed to generate fingerprint for ${m.r2Key}: ${err.message}`)
      }
    }
  }
  
  rawEntries.push({ ...m, isNsv: false, fingerprint })
  
  const nsvKey = m.r2Key.replace(/\.osz$/, '.nsv.osz')
  if (r2Keys.has(nsvKey)) {
    rawEntries.push({ ...m, r2Key: nsvKey, isNsv: true, fingerprint })
  }
}

// 改进的去重逻辑: 支持指纹匹配 + 多路径选择
const bySignature = new Map()
for (const m of rawEntries) {
  // 优先使用 beatmapId，其次使用指纹，最后才用 r2Key
  let key
  if (m.beatmapId) {
    key = `bid:${m.beatmapId}|${m.isNsv ? 1 : 0}`
  } else if (m.fingerprint) {
    key = `fp:${m.fingerprint}|${m.isNsv ? 1 : 0}`
  } else {
    key = `raw:${m.r2Key}`
  }
  
  const src = { 
    tournamentAbbr: m.tournamentAbbr, 
    roundAbbr: m.roundAbbr, 
    slot: m.slot 
  }
  
  const existing = bySignature.get(key)
  if (existing) {
    existing.sources.push(src)
    // 记录所有可能的文件路径，后续会选择最优的
    if (!existing.alternatePaths) {
      existing.alternatePaths = [existing.r2Key]
    }
    existing.alternatePaths.push(m.r2Key)
  } else {
    bySignature.set(key, { 
      ...m, 
      sources: [src],
      alternatePaths: [m.r2Key]  // 记录所有引用此谱面的路径
    })
  }
}
```

### 阶段 3: 选择最佳文件路径

3. **添加路径选择逻辑** (在 bySignature 构建完成后)

```javascript
// 为每个合并后的条目选择最佳的文件路径
// 策略: 选择文件确实存在且最新的路径
const available = []
for (const entry of bySignature.values()) {
  if (entry.alternatePaths && entry.alternatePaths.length > 1) {
    // 有多个路径，选择最优的
    let bestPath = entry.r2Key
    let pathExists = r2Keys.has(bestPath)
    
    // 如果当前路径不存在，尝试其他路径
    if (!pathExists) {
      for (const altPath of entry.alternatePaths) {
        if (r2Keys.has(altPath)) {
          bestPath = altPath
          pathExists = true
          break
        }
      }
    }
    
    if (!pathExists) {
      console.warn(`  Warning: No valid file path found for merged entry with ${entry.sources.length} sources:`)
      console.warn(`    Sources: ${entry.sources.map(s => `${s.tournamentAbbr}${s.roundAbbr} ${s.slot}`).join(', ')}`)
      console.warn(`    Tried paths: ${entry.alternatePaths.join(', ')}`)
      continue  // 跳过这个条目
    }
    
    // 使用找到的最佳路径
    entry.r2Key = bestPath
    
    if (entry.alternatePaths.length > 1) {
      console.log(`  Merged ${entry.sources.length} references to same map, using path: ${bestPath}`)
      console.log(`    Sources: ${entry.sources.map(s => `${s.tournamentAbbr}${s.roundAbbr} ${s.slot}`).join(', ')}`)
    }
  } else {
    // 单一路径，检查是否存在
    if (!r2Keys.has(entry.r2Key)) {
      console.warn(`  Skip non-existent file: ${entry.r2Key}`)
      continue
    }
  }
  
  available.push(entry)
}
```

### 阶段 4: 性能优化

4. **批量并发处理指纹生成**

由于指纹生成需要下载文件，可能会很慢。需要优化：

```javascript
// 在第一次循环中只收集需要生成指纹的条目
const needFingerprint = []
for (const m of mapsToProcess) {
  if (!r2Keys.has(m.r2Key)) continue
  if (!m.beatmapId) {
    needFingerprint.push(m)
  }
  rawEntries.push({ ...m, isNsv: false, fingerprint: null })
  
  const nsvKey = m.r2Key.replace(/\.osz$/, '.nsv.osz')
  if (r2Keys.has(nsvKey)) {
    if (!m.beatmapId) {
      needFingerprint.push({ ...m, r2Key: nsvKey, isNsv: true })
    }
    rawEntries.push({ ...m, r2Key: nsvKey, isNsv: true, fingerprint: null })
  }
}

// 批量并发生成指纹 (4个并发)
if (needFingerprint.length > 0) {
  console.log(`[${targetType}] Generating fingerprints for ${needFingerprint.length} maps without beatmapId...`)
  
  const fingerprints = await mapWithConcurrency(needFingerprint, 4, async (m) => {
    try {
      const oszBuffer = await downloadFromR2(m.r2Key)
      const fp = await generateMapFingerprint(oszBuffer)
      return { r2Key: m.r2Key, fingerprint: fp }
    } catch (err) {
      console.warn(`  Failed to fingerprint ${m.r2Key}: ${err.message}`)
      return { r2Key: m.r2Key, fingerprint: null }
    }
  })
  
  // 将指纹写回 rawEntries
  const fpMap = new Map(fingerprints.map(f => [f.r2Key, f.fingerprint]))
  for (const entry of rawEntries) {
    if (!entry.beatmapId && fpMap.has(entry.r2Key)) {
      entry.fingerprint = fpMap.get(entry.r2Key)
    }
  }
  
  console.log(`[${targetType}] Fingerprint generation complete`)
}
```

## 修改摘要

### 修改文件
- `scripts/generate-pack.js`

### 新增函数
1. `generateMapFingerprint(oszBuffer)` - 为 .osu 文件生成唯一指纹

### 修改区域
1. **第 349-374 行**: 去重逻辑
   - 为没有 bid 的谱面生成指纹
   - 使用三层 key: `bid:xxx` > `fp:xxx` > `raw:xxx`
   - 记录所有引用路径到 `alternatePaths`
   
2. **第 375 行之后**: 添加路径选择逻辑
   - 遍历合并后的条目
   - 验证文件是否真实存在
   - 选择存在的最佳路径
   - 打印合并日志

## 预期效果

### 修复前
```
[SS] Found 150 maps total
[SS] 148 unique files in R2 (collapsed 2 duplicate slot ref(s))
```
- mcnc2025 ro16 rc1 和 thmc 4 sf rc1 被当作两张不同的图
- 东方杯 GF 重传后文件丢失

### 修复后
```
[SS] Found 150 maps total
[SS] Generating fingerprints for 12 maps without beatmapId...
[SS] Fingerprint generation complete
[SS] 145 unique files in R2 (collapsed 5 duplicate slot ref(s))
  Merged 2 references to same map, using path: maps/mcnc-4k-2025/ro16/RC1.osz
    Sources: MCNC2025RO16 RC1, THMC4SF RC1
  Merged 2 references to same map, using path: maps/touhou-cup/gf/RC1.osz
    Sources: TouhouCupF RC1, TouhouCupGF RC1
```

## 测试计划

1. **测试没有 bid 的谱面合并**
   - 找到 mcnc2025 ro16 rc1 和 thmc 4 sf rc1
   - 验证它们被正确合并
   - 检查合包里只有一份

2. **测试文件路径选择**
   - 故意删除某个合并谱面的第一个路径
   - 验证脚本能找到备用路径
   - 确保不会因为单个路径失效而丢失整个谱面

3. **测试性能**
   - 记录生成指纹的时间
   - 确保并发优化生效
   - 整体打包时间不应显著增加（< 20%）

## 注意事项

1. **指纹的唯一性**: Artist + Title + Creator + Version 组合在极少数情况下可能不唯一（例如完全相同的 metadata 但谱面内容不同），但这种情况非常罕见
   
2. **性能影响**: 为没有 bid 的谱面生成指纹需要下载文件，会增加一些时间。通过并发优化和缓存可以减轻影响

3. **向后兼容**: 所有修改都是增强现有逻辑，不会影响有 bid 的谱面的正常处理

4. **日志输出**: 增加了详细的合并日志，方便排查问题和验证合并结果

# 合包谱面合并 Bug 总结

## 用户反馈的实际问题

### 问题 1: 相同谱面没有合并
**现象**: 从用户截图看，两个包看起来很相似但没有合并
- MCNC 2025 RO16 RC1
- THMC 4 SF RC1

**调查结果**: 这两张图实际上是**完全不同的谱面**
- MCNC: PIKASONIC - Today is not tomorrow (bid: 5390396)
- THMC: Diao ye zong - Seiren 'Uruwashi no Ventra' (bid: 5018267)
- ✅ **这不是 bug，应该保持独立**

### 问题 2: 重新上传导致谱面丢失 (真正的 bug)
**现象**: 
- 东方杯 F 和 GF 使用同一张谱面 (Sound of Carnation, bid: 5027483)
- F 和 GF 在合包时正确合并了
- 用户重新上传了 GF 的谱面文件（覆盖），但**没有更新 JSON 中的 beatmapId**
- 结果：新生成的包中，GF 的谱面**丢失了**

**根本原因**:
```javascript
// 当前逻辑 (第 388 行)
const key = m.beatmapId ? `${m.beatmapId}|${m.isNsv ? 1 : 0}` : `raw:${m.r2Key}`
const existing = bySignature.get(key)
if (existing) {
  existing.sources.push(src)  // ← 只追加 sources，不检查文件是否存在
} else {
  bySignature.set(key, { ...m, sources: [src] })  // ← 第一个出现的路径
}
```

**问题分析**:
1. F 和 GF 的 beatmapId 都是 5027483
2. F 先出现，路径是 `maps/touhou-project-mania-cup-4th/round-7/RC1.osz`
3. GF 后出现，路径是 `maps/touhou-project-mania-cup-4th/round-8/RC1.osz`
4. 合并时选择了 F 的路径（第一个出现）
5. 如果用户删除了 F 的文件或 F 的文件损坏，只更新了 GF 的文件
6. 脚本仍然尝试从 F 的路径读取 → **文件不存在** → 这张图在包里丢失

### 问题 3: 没有 beatmapId 的谱面无法合并
**现象**: 项目中有 672 张谱面没有 beatmapId
- 4DM2023: 98 张
- MCNC 4K 2025: 110 张
- GBC 2025 Autumn: 92 张
- 等等...

**问题**: 
```javascript
// 当前逻辑
const key = m.beatmapId ? `${m.beatmapId}|${m.isNsv ? 1 : 0}` : `raw:${m.r2Key}`
```
- 没有 beatmapId 的谱面使用 `raw:${m.r2Key}` 作为 key
- 不同路径的相同谱面永远不会合并
- 例如: `raw:maps/mcnc/ro16/RC1.osz` ≠ `raw:maps/gbc/qf/RC1.osz`

**影响**: 
- 如果同一张谱面在多个比赛中使用，但都没有 beatmapId
- 会被当作不同的谱面，重复打包
- 增加包体积

## 我们的修复方案

### 修复 1: 文件路径验证和备选路径
```javascript
// 记录所有引用路径
if (existing) {
  existing.sources.push(src)
  if (!existing.alternatePaths) {
    existing.alternatePaths = [existing.r2Key]
  }
  existing.alternatePaths.push(m.r2Key)  // ← 记录所有可能的路径
}

// 选择存在的最佳路径
for (const entry of bySignature.values()) {
  if (entry.alternatePaths && entry.alternatePaths.length > 1) {
    let bestPath = entry.r2Key
    let pathExists = r2Keys.has(bestPath)
    
    // 如果当前路径不存在，尝试其他路径
    if (!pathExists) {
      for (const altPath of entry.alternatePaths) {
        if (r2Keys.has(altPath)) {
          bestPath = altPath  // ← 找到存在的路径
          pathExists = true
          break
        }
      }
    }
    
    if (!pathExists) {
      console.warn(`Warning: No valid file path found`)
      continue  // 跳过，但至少不会导致整个包失败
    }
    
    entry.r2Key = bestPath  // ← 使用找到的最佳路径
  }
}
```

**效果**:
- ✅ 如果 F 的文件不存在，会自动使用 GF 的文件
- ✅ 不会因为单个路径失效而丢失整个谱面
- ✅ 输出日志，方便排查问题

### 修复 2: 为没有 beatmapId 的谱面生成指纹
```javascript
async function generateMapFingerprint(oszBuffer) {
  const zip = await JSZip.loadAsync(oszBuffer)
  const osuFileName = Object.keys(zip.files).find(f => f.endsWith('.osu'))
  const osuContent = await zip.files[osuFileName].async('string')
  const meta = parseOsu(osuContent)
  
  // Artist + Title + Creator + Version 组合作为指纹
  const fingerprint = `${meta.artist}|${meta.title}|${meta.creator}|${meta.version}`
  return fingerprint.toLowerCase().trim()
}

// 使用指纹作为去重 key
let key
if (m.beatmapId) {
  key = `bid:${m.beatmapId}|${m.isNsv ? 1 : 0}`
} else if (m.fingerprint) {
  key = `fp:${m.fingerprint}|${m.isNsv ? 1 : 0}`  // ← 使用指纹
} else {
  key = `raw:${m.r2Key}`
}
```

**效果**:
- ✅ 没有 beatmapId 的相同谱面可以通过指纹合并
- ✅ 减少重复文件，降低包体积
- ⚠️  需要下载文件生成指纹，会增加一些处理时间

## 关于你截图中的问题

从你的截图来看，你可能关心的是：
1. **包名格式**: 两个包显示的文本看起来很相似
2. **实际内容**: 但它们是不同的谱面

如果你想要更好地区分不同谱面，可能需要：
- 改进包名显示格式（在 `formatSources` 函数中）
- 或者是你看到的是**其他谱面**的合并问题

## 建议

能否提供：
1. 你截图中提到的具体是哪两张谱面？（完整的谱面名称）
2. 或者提供那个截图中包名的完整文本？

这样我可以准确定位你遇到的具体问题。

## 当前修复状态

✅ **已完成**: 
- 添加文件路径验证和备选路径选择
- 添加指纹生成功能
- 添加详细日志输出

📝 **待测试**:
- 需要实际运行 `generate-pack.js` 验证修复效果
- 需要确认你具体遇到的是哪个问题

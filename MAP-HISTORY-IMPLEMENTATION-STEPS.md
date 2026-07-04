# 谱面历史提示功能 - 详细实现步骤

## 前提条件
- 已有 `src/lib/types.ts` 定义了 Tournament、Round、BeatmapMeta 等类型
- 已有 `src/lib/i18n.ts` 国际化系统
- 已有 `src/components/admin/MapSlotEditor.tsx` 组件
- 已有 `src/components/admin/RoundEditor.tsx` 组件
- 已有 `src/components/admin/TournamentForm.tsx` 组件

---

## 步骤 1: 创建 useMapHistory Hook

### 文件: `src/hooks/useMapHistory.ts` (新建)

```typescript
import { useMemo } from 'react'
import type { Tournament } from '@/lib/types'

export interface MapUsage {
  tournamentId: string
  tournamentName: string
  tournamentAbbr: string
  roundId: string
  roundName: string
  roundAbbr: string
  slot: string
  type: string
  realType: string
  difficulty: number
  beatmapId?: number
  beatmapsetId?: number
  name?: string
}

export interface MapHistorySummary {
  totalUses: number
  tournaments: string[]
  types: Map<string, number>  // type -> 使用次数
  mostCommonType: string
  usages: MapUsage[]
}

/**
 * 构建 beatmapsetId -> 使用历史 的索引
 * 用于在录入新比赛时检测谱面是否在其他比赛中出现过
 */
export function useMapHistory(tournaments: Tournament[]) {
  // 构建索引：beatmapsetId -> MapUsage[]
  const historyIndex = useMemo(() => {
    const index = new Map<number, MapUsage[]>()

    for (const tournament of tournaments) {
      for (const round of tournament.rounds) {
        for (const map of round.maps) {
          // 只索引有 beatmapsetId 的谱面
          if (!map.beatmapsetId) continue

          if (!index.has(map.beatmapsetId)) {
            index.set(map.beatmapsetId, [])
          }

          index.get(map.beatmapsetId)!.push({
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            tournamentAbbr: tournament.abbreviation,
            roundId: round.id,
            roundName: round.name,
            roundAbbr: round.abbreviation,
            slot: map.slot,
            type: map.type,
            realType: map.realType,
            difficulty: map.difficulty,
            beatmapId: map.beatmapId,
            beatmapsetId: map.beatmapsetId,
            name: map.name,
          })
        }
      }
    }

    return index
  }, [tournaments])

  /**
   * 查询指定 beatmapsetId 的使用历史
   */
  const getMapHistory = (beatmapsetId: number | undefined): MapHistorySummary | null => {
    if (!beatmapsetId) return null

    const usages = historyIndex.get(beatmapsetId)
    if (!usages || usages.length === 0) return null

    // 统计每个 type 的使用次数
    const typeCounts = new Map<string, number>()
    const tournaments = new Set<string>()

    for (const usage of usages) {
      typeCounts.set(usage.type, (typeCounts.get(usage.type) || 0) + 1)
      tournaments.add(usage.tournamentAbbr)
    }

    // 找出最常用的 type
    let mostCommonType = ''
    let maxCount = 0
    for (const [type, count] of typeCounts.entries()) {
      if (count > maxCount) {
        maxCount = count
        mostCommonType = type
      }
    }

    return {
      totalUses: usages.length,
      tournaments: Array.from(tournaments),
      types: typeCounts,
      mostCommonType,
      usages,
    }
  }

  return { getMapHistory }
}
```

---

## 步骤 2: 添加 i18n 文本

### 文件: `src/lib/i18n.ts`

找到 `dict` 对象，在末尾添加（保持现有结构）：

```typescript
// 在 dict 对象中添加以下键值对
'mapSlot.history.title': {
  zh: '此谱面在其他比赛中的使用记录',
  en: 'Usage history of this map in other tournaments'
},
'mapSlot.history.used': {
  zh: '已在 {n} 个槽位使用',
  en: 'Used in {n} slot(s)'
},
'mapSlot.history.conflict': {
  zh: '当前类型 {current} 与历史常用类型 {suggested} 不一致',
  en: 'Current type {current} differs from commonly used {suggested}'
},
'mapSlot.history.previous': {
  zh: '历史使用记录',
  en: 'Previous usage'
},
'mapSlot.history.more': {
  zh: '还有 {n} 条记录...',
  en: 'and {n} more...'
},
'mapSlot.history.summary': {
  zh: '类型统计',
  en: 'Type summary'
},
```

---

## 步骤 3: 修改 MapSlotEditor 组件

### 文件: `src/components/admin/MapSlotEditor.tsx`

#### 3.1 导入新类型
在文件顶部添加：

```typescript
import type { MapHistorySummary } from '@/hooks/useMapHistory'
import { useState } from 'react'  // 如果还没有导入
```

#### 3.2 修改 Props 接口
找到 `interface Props`，添加 `getMapHistory` 参数：

```typescript
interface Props {
  map: ExtendedMap
  onChange: (map: ExtendedMap) => void
  onRemove: () => void
  getMapHistory?: (beatmapsetId: number | undefined) => MapHistorySummary | null  // 新增
}
```

#### 3.3 修改函数签名和添加状态
找到 `export function MapSlotEditor`，修改参数并添加状态：

```typescript
export function MapSlotEditor({ map, onChange, onRemove, getMapHistory }: Props) {
  const t = useT()
  const [showHistory, setShowHistory] = useState(false)  // 新增：控制历史记录展开/收起
  
  const dual = needsDualDifficulty(map.category)
  const realTypeOptions = map.category === 'SPECIAL'
    ? Object.entries(REAL_TYPES).flatMap(([cat, types]) =>
        cat === 'SPECIAL' ? [] : types.map((t) => ({ ...t, group: cat }))
      )
    : (REAL_TYPES[map.category] || [])

  // 新增：获取历史记录
  const history = getMapHistory ? getMapHistory(map.beatmapsetId) : null
  
  // 新增：检测类型冲突
  const hasTypeConflict = history && 
    history.totalUses > 0 && 
    map.type !== history.mostCommonType &&
    history.types.has(map.type) === false  // 当前type从未被使用过
```

#### 3.4 修改最外层 div 的 className
找到 `return` 语句中的最外层 `<div>`，修改其 `className`：

```typescript
return (
  <div className={`flex items-start gap-2 p-2 rounded border ${
    hasTypeConflict 
      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-700' 
      : 'bg-gray-50 dark:bg-neutral-900/50 border-gray-100 dark:border-neutral-800'
  }`}>
```

#### 3.5 在色块后添加历史提示横幅
在色块 `<div className="category-swatch ...">` 之后，`<div className="flex flex-col gap-1.5 flex-1 min-w-0">` 内部的**最前面**添加：

```typescript
<div className="flex flex-col gap-1.5 flex-1 min-w-0">
  {/* 历史提示横幅 - 新增 */}
  {history && history.totalUses > 0 && (
    <div className="flex items-center gap-2 text-xs">
      <button
        onClick={() => setShowHistory(!showHistory)}
        className={`flex items-center gap-1 px-2 py-0.5 rounded ${
          hasTypeConflict
            ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 border border-yellow-300 dark:border-yellow-700'
            : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 border border-blue-200 dark:border-blue-800'
        }`}
        title={t('mapSlot.history.title')}
      >
        {hasTypeConflict ? '⚠️' : '📋'}
        <span>
          {t('mapSlot.history.used', { n: history.totalUses })}
        </span>
        <span className="text-[10px]">
          ({history.mostCommonType})
        </span>
        <span>{showHistory ? '▼' : '▶'}</span>
      </button>
      
      {hasTypeConflict && (
        <span className="text-yellow-700 dark:text-yellow-300 text-xs">
          {t('mapSlot.history.conflict', { 
            current: map.type, 
            suggested: history.mostCommonType 
          })}
        </span>
      )}
    </div>
  )}

  {/* 展开的历史记录 - 新增 */}
  {showHistory && history && (
    <div className="border border-blue-200 dark:border-blue-800 rounded bg-white dark:bg-neutral-900 p-2 text-xs">
      <div className="font-medium text-blue-700 dark:text-blue-300 mb-1">
        {t('mapSlot.history.previous')}:
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {history.usages.slice(0, 10).map((usage, i) => (
          <div key={i} className="flex items-center gap-2 text-gray-600 dark:text-neutral-400">
            <span className="font-mono text-[10px]">
              {usage.tournamentAbbr} {usage.roundAbbr}
            </span>
            <span className="font-mono text-[10px]">{usage.slot}</span>
            <span className={`px-1 py-0.5 rounded text-[10px] ${
              usage.type === map.type
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400'
            }`}>
              {usage.type} ({usage.realType})
            </span>
          </div>
        ))}
        {history.usages.length > 10 && (
          <div className="text-gray-400 dark:text-neutral-500 text-[10px] italic">
            {t('mapSlot.history.more', { n: history.usages.length - 10 })}
          </div>
        )}
      </div>
      
      <div className="mt-2 pt-2 border-t border-blue-100 dark:border-blue-900">
        <div className="text-gray-500 dark:text-neutral-400 text-[10px]">
          {t('mapSlot.history.summary')}:
          {Array.from(history.types.entries()).map(([type, count]) => (
            <span key={type} className="ml-2">
              {type}×{count}
            </span>
          ))}
        </div>
      </div>
    </div>
  )}

  {/* 现有的输入框 - 保持不变 */}
  <div className="flex items-center gap-1.5">
    {/* ... 现有代码保持不变 ... */}
```

**注意**: 其余代码保持完全不变。

---

## 步骤 4: 修改 RoundEditor 组件

### 文件: `src/components/admin/RoundEditor.tsx`

#### 4.1 导入新类型
在文件顶部添加：

```typescript
import type { MapHistorySummary } from '@/hooks/useMapHistory'
```

#### 4.2 修改 Props 接口
找到 `interface Props`，添加 `getMapHistory` 参数：

```typescript
interface Props {
  round: RoundWithMeta
  index: number
  onChange: (round: RoundWithMeta) => void
  onRemove: () => void
  getMapHistory?: (beatmapsetId: number | undefined) => MapHistorySummary | null  // 新增
}
```

#### 4.3 修改函数签名
找到 `export function RoundEditor`，修改参数：

```typescript
export function RoundEditor({ round, index, onChange, onRemove, getMapHistory }: Props) {
```

#### 4.4 传递 getMapHistory 给 MapSlotEditor
找到渲染 `MapSlotEditor` 的地方（通常在 `round._maps.map` 内），添加 `getMapHistory` prop：

```typescript
<div className="space-y-1.5">
  {round._maps.map((map, i) => (
    <MapSlotEditor
      key={i}
      map={map}
      onChange={(m) => updateMap(i, m)}
      onRemove={() => removeMap(i)}
      getMapHistory={getMapHistory}  // 新增这一行
    />
  ))}
</div>
```

---

## 步骤 5: 修改 TournamentForm 组件

### 文件: `src/components/admin/TournamentForm.tsx`

#### 5.1 导入 useMapHistory
在文件顶部添加：

```typescript
import { useMapHistory } from '@/hooks/useMapHistory'
import type { Tournament } from '@/lib/types'  // 如果还没有导入
```

#### 5.2 添加状态和 Hook
在组件函数内部，现有状态声明附近添加：

```typescript
export function TournamentForm({ /* 现有参数 */ }) {
  // 现有状态...
  
  // 新增：用于存储所有比赛数据（用于构建历史索引）
  const [allTournaments, setAllTournaments] = useState<Tournament[]>([])
  
  // 新增：构建谱面历史索引
  const { getMapHistory } = useMapHistory(allTournaments)
```

#### 5.3 加载所有比赛数据
在现有的 `useEffect` 附近添加（或修改现有的加载逻辑）：

```typescript
// 新增：加载所有比赛数据用于历史查询
useEffect(() => {
  fetch('/api/tournaments')
    .then(r => r.json())
    .then(data => {
      // data 应该是 Tournament[] 格式
      // 如果返回的是 { tournaments: Tournament[] }，则用 data.tournaments
      setAllTournaments(Array.isArray(data) ? data : data.tournaments || [])
    })
    .catch(err => {
      console.error('Failed to load tournaments for history:', err)
    })
}, [])
```

#### 5.4 传递 getMapHistory 给 RoundEditor
找到渲染 `RoundEditor` 的地方，添加 `getMapHistory` prop：

```typescript
{rounds.map((round, i) => (
  <RoundEditor
    key={i}
    round={round}
    index={i}
    onChange={(r) => updateRound(i, r)}
    onRemove={() => removeRound(i)}
    getMapHistory={getMapHistory}  // 新增这一行
  />
))}
```

---

## 步骤 6: 测试

### 6.1 编译检查
```bash
cd "d:/osumania ladder"
npm run build
# 或
npm run dev
```

### 6.2 功能测试清单

#### 测试 1: 基础显示
1. 打开 Admin 页面，进入比赛录入
2. 添加一个 Round 和一个 Map
3. 输入一个已存在的 `beatmapsetId`（例如从现有比赛中找一个）
4. 预期：应该显示蓝色徽章 "📋 已在 X 个槽位使用 (TYPE)"

#### 测试 2: 展开历史
1. 点击徽章
2. 预期：展开显示历史记录列表，包括比赛名、轮次、槽位、类型

#### 测试 3: 类型冲突检测
1. 输入一个已存在的 `beatmapsetId`
2. 选择一个与历史不同的 type（例如历史是 RC，选择 LN）
3. 预期：
   - 整个卡片变为黄色边框和背景
   - 徽章显示 "⚠️" 而不是 "📋"
   - 显示警告文字 "当前类型 LN 与历史常用类型 RC 不一致"

#### 测试 4: 无历史记录
1. 输入一个不存在的 `beatmapsetId`（或留空）
2. 预期：不显示任何徽章，卡片保持正常样式

#### 测试 5: 性能测试
1. 打开浏览器开发者工具 -> Performance
2. 刷新 Admin 页面
3. 检查 `useMapHistory` 的索引构建时间
4. 预期：< 500ms（对于 2000+ 谱面）

---

## 故障排查

### 问题 1: TypeScript 类型错误
- 确保 `@/hooks/useMapHistory` 路径正确
- 确保 `Tournament` 类型定义正确
- 检查 `tsconfig.json` 的 `paths` 配置

### 问题 2: 徽章不显示
- 检查 `allTournaments` 是否正确加载（在浏览器控制台打印）
- 检查 `beatmapsetId` 是否正确传递到 `map` 对象
- 检查 API `/api/tournaments` 是否返回正确数据

### 问题 3: 样式不生效
- 确保 Tailwind CSS 正常工作
- 检查是否有 CSS 缓存问题（清除缓存重试）
- 检查 dark mode 类名是否正确

### 问题 4: i18n 文本不显示
- 确保 `useT()` hook 正常工作
- 检查 `dict` 对象中的键名是否正确
- 尝试在浏览器控制台调用 `t('mapSlot.history.title')` 测试

---

## 回滚方案

如果出现问题需要回滚：

### 完全回滚
```bash
git checkout src/hooks/useMapHistory.ts
git checkout src/components/admin/MapSlotEditor.tsx
git checkout src/components/admin/RoundEditor.tsx
git checkout src/components/admin/TournamentForm.tsx
git checkout src/lib/i18n.ts
```

### 部分回滚（保留 hook，只回滚 UI）
```bash
git checkout src/components/admin/MapSlotEditor.tsx
git checkout src/components/admin/RoundEditor.tsx
git checkout src/components/admin/TournamentForm.tsx
```

---

## 注意事项

1. **不要修改其他代码**: 除了上述指定的位置，其他代码保持完全不变
2. **保持缩进一致**: 使用项目现有的缩进风格（2 空格）
3. **测试 API 路径**: 确保 `/api/tournaments` 返回正确格式的数据
4. **浏览器兼容性**: 代码使用 ES6+ 特性，确保目标浏览器支持
5. **类型安全**: 如果 TypeScript 报错，优先修复类型问题而不是使用 `any`

---

## 文件修改摘要

| 文件 | 操作 | 修改量 |
|------|------|--------|
| `src/hooks/useMapHistory.ts` | 新建 | ~100 行 |
| `src/lib/i18n.ts` | 修改 | +18 行 |
| `src/components/admin/MapSlotEditor.tsx` | 修改 | +90 行 |
| `src/components/admin/RoundEditor.tsx` | 修改 | +5 行 |
| `src/components/admin/TournamentForm.tsx` | 修改 | +15 行 |

**总计**: ~228 行新增代码

---

## 预期效果截图描述

### 正常状态
```
┌──────────────────────────────────────────┐
│ │ 📋 已在 3 个槽位使用 (RC) ▶            │ ← 蓝色徽章
│ │ RC1  [RC ▼] [SS - Stream]              │
│ │ rf: 12.5  [📊]                          │
└──────────────────────────────────────────┘
```

### 冲突状态
```
┌──────────────────────────────────────────┐ ← 黄色边框
│ │ ⚠️ 已在 3 个槽位使用 (RC) ▼            │ ← 黄色背景
│ │ 当前类型 LN 与历史常用类型 RC 不一致    │
│ │ ┌────────────────────────────────────┐ │
│ │ │ 历史使用记录:                      │ │
│ │ │ • GBC2025 QF RC1 [RC (SS)]        │ │
│ │ │ • MCNC2025 RO16 RC2 [RC (SS)]     │ │
│ │ │ 类型统计: RC×3                     │ │
│ │ └────────────────────────────────────┘ │
│ │ LN1  [LN ▼] [RE - Release]             │
│ │ ln: 13.0  [📊]                          │
└──────────────────────────────────────────┘
```

---

## 完成标志

功能完成的标志：
- ✅ 可以看到历史使用徽章
- ✅ 点击可以展开/收起历史记录
- ✅ 类型冲突时显示黄色高亮
- ✅ 历史记录列表显示正确
- ✅ 类型统计显示正确
- ✅ 页面加载和响应流畅（无明显卡顿）

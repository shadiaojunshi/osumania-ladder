# 录入时谱面历史提示功能实现方案

## 功能描述

在 Admin 录入新比赛时，当输入谱面的 beatmapsetId 后：
1. 自动查询该谱面在其他比赛中的使用历史
2. 显示历史记录（比赛名、轮次、键型）
3. 如果当前分配的键型与历史不一致，高亮提示
4. 建议使用最常见的键型

## 实现方式：客户端查询（推荐）

### 为什么选择客户端查询？
- ✅ 即时响应，无网络延迟
- ✅ Admin 页面已经加载所有比赛数据
- ✅ 不增加 Cloudflare Functions 请求量
- ✅ 可以离线工作

### 技术方案

#### 1. 创建谱面历史索引 Hook

**文件**: `src/hooks/useMapHistory.ts`

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
 */
export function useMapHistory(tournaments: Tournament[]) {
  const historyIndex = useMemo(() => {
    const index = new Map<number, MapUsage[]>()

    for (const tournament of tournaments) {
      for (const round of tournament.rounds) {
        for (const map of round.maps) {
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

#### 2. 修改 MapSlotEditor 组件

**文件**: `src/components/admin/MapSlotEditor.tsx`

在 MapSlotEditor 组件中添加历史提示功能：

```typescript
// 在 Props 中添加
interface Props {
  map: ExtendedMap
  onChange: (map: ExtendedMap) => void
  onRemove: () => void
  getMapHistory?: (beatmapsetId: number | undefined) => MapHistorySummary | null  // 新增
}

// 在组件中使用
export function MapSlotEditor({ map, onChange, onRemove, getMapHistory }: Props) {
  const t = useT()
  const [showHistory, setShowHistory] = useState(false)
  
  // 获取历史记录
  const history = getMapHistory ? getMapHistory(map.beatmapsetId) : null
  
  // 检测类型冲突
  const hasTypeConflict = history && 
    history.totalUses > 0 && 
    map.type !== history.mostCommonType &&
    history.types.has(map.type) === false  // 当前type从未被使用过
  
  const dual = needsDualDifficulty(map.category)
  // ... 现有代码
  
  return (
    <div className={`flex items-start gap-2 p-2 rounded border ${
      hasTypeConflict 
        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-700' 
        : 'bg-gray-50 dark:bg-neutral-900/50 border-gray-100 dark:border-neutral-800'
    }`}>
      {/* 左侧色块 */}
      <div
        className="category-swatch w-1.5 self-stretch rounded-full shrink-0"
        style={{ background: CATEGORY_COLORS[map.category] || '#9ca3af' }}
      />

      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {/* 历史提示横幅 */}
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

        {/* 展开的历史记录 */}
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

        {/* 现有的输入框等内容 */}
        <div className="flex items-center gap-1.5">
          {/* ... 现有代码 ... */}
        </div>
        
        {/* ... 其他现有代码 ... */}
      </div>

      <button
        onClick={onRemove}
        className="text-gray-300 dark:text-neutral-600 hover:text-red-500 shrink-0 mt-1"
        title={t('mapSlot.remove')}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
```

#### 3. 在 RoundEditor 中集成

**文件**: `src/components/admin/RoundEditor.tsx`

```typescript
// 在 Props 中添加
interface Props {
  round: RoundWithMeta
  index: number
  onChange: (round: RoundWithMeta) => void
  onRemove: () => void
  getMapHistory?: (beatmapsetId: number | undefined) => MapHistorySummary | null  // 新增
}

export function RoundEditor({ round, index, onChange, onRemove, getMapHistory }: Props) {
  // ... 现有代码 ...
  
  return (
    <div className="border border-gray-200 dark:border-neutral-800 rounded-lg overflow-hidden">
      {/* ... 现有代码 ... */}
      
      <div className="space-y-1.5">
        {round._maps.map((map, i) => (
          <MapSlotEditor
            key={i}
            map={map}
            onChange={(m) => updateMap(i, m)}
            onRemove={() => removeMap(i)}
            getMapHistory={getMapHistory}  // 传递历史查询函数
          />
        ))}
      </div>
      
      {/* ... 现有代码 ... */}
    </div>
  )
}
```

#### 4. 在 TournamentForm 中提供历史数据

**文件**: `src/components/admin/TournamentForm.tsx`

```typescript
import { useMapHistory } from '@/hooks/useMapHistory'

export function TournamentForm({ /* ... */ }) {
  // 获取所有比赛数据（已有）
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  
  // 构建谱面历史索引
  const { getMapHistory } = useMapHistory(tournaments)
  
  // 加载所有比赛数据
  useEffect(() => {
    fetch('/api/tournaments')
      .then(r => r.json())
      .then(data => setTournaments(data))
      .catch(console.error)
  }, [])
  
  return (
    <div>
      {/* ... */}
      {rounds.map((round, i) => (
        <RoundEditor
          key={i}
          round={round}
          index={i}
          onChange={(r) => updateRound(i, r)}
          onRemove={() => removeRound(i)}
          getMapHistory={getMapHistory}  // 传递历史查询函数
        />
      ))}
      {/* ... */}
    </div>
  )
}
```

#### 5. i18n 国际化文本

**文件**: `src/lib/i18n.ts`

在字典中添加：

```typescript
const dict = {
  'mapSlot.history.title': {
    zh: '此谱面在其他比赛中的使用记录',
    en: 'Usage history of this map in other tournaments'
  },
  'mapSlot.history.used': {
    zh: '已在 {n} 个槽位使用',
    en: 'Used in {n} slot(s)'
  },
  'mapSlot.history.conflict': {
    zh: '⚠️ 当前类型 {current} 与历史常用类型 {suggested} 不一致',
    en: '⚠️ Current type {current} differs from commonly used {suggested}'
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
}
```

## 视觉效果

### 正常状态（无历史记录）
```
┌─────────────────────────────────────────┐
│ │ RC1  [RC ▼] [SS - Stream]             │
│ │ rf: 12.5  [📊]                         │
└─────────────────────────────────────────┘
```

### 有历史记录（无冲突）
```
┌─────────────────────────────────────────┐
│ │ 📋 已在 3 个槽位使用 (RC) ▶           │
│ │ RC1  [RC ▼] [SS - Stream]             │
│ │ rf: 12.5  [📊]                         │
└─────────────────────────────────────────┘
```

### 类型冲突（高亮警告）
```
┌─────────────────────────────────────────┐ ← 黄色边框
│ │ ⚠️ 已在 3 个槽位使用 (RC) ▼           │ ← 黄色背景
│ │ ⚠️ 当前类型 LN 与历史常用类型 RC 不一致 │
│ │                                        │
│ │ 历史使用记录:                          │
│ │ • GBC2025 QF RC1 [RC (SS)]  ← 绿色    │
│ │ • MCNC2025 RO16 RC2 [RC (SS)]  ← 绿色│
│ │ • THMC4 SF RC3 [RC (SS)]  ← 绿色     │
│ │ 类型统计: RC×3                         │
│ │                                        │
│ │ LN1  [LN ▼] [RE - Release]            │ ← 当前输入
│ │ ln: 13.0  [📊]                         │
└─────────────────────────────────────────┘
```

## 实现优先级

### Phase 1（核心功能）- 立即实现
- ✅ 创建 `useMapHistory` hook
- ✅ 修改 `MapSlotEditor` 添加历史徽章
- ✅ 在 `RoundEditor` 和 `TournamentForm` 中集成
- ✅ 添加基础样式和高亮

### Phase 2（增强体验）- 后续优化
- 点击历史记录直接跳转到对应比赛
- 显示谱面的难度分布
- 支持按 realType 进一步分析
- 缓存历史索引到 localStorage

### Phase 3（高级功能）- 可选
- 批量检测所有谱面的类型冲突
- 导出冲突报告
- 智能建议：根据谱面内容（LN 占比等）推荐类型

## 性能考虑

- **索引构建**: 使用 `useMemo` 缓存，只在比赛数据变化时重新计算
- **内存占用**: ~2000 张谱面 × 200 bytes ≈ 400KB，可接受
- **响应速度**: Map 查询是 O(1)，即时响应

## 测试计划

1. **基础功能测试**
   - 输入有历史记录的 beatmapsetId，验证徽章显示
   - 输入没有历史记录的 beatmapsetId，验证无徽章
   - 点击徽章展开/收起历史记录

2. **冲突检测测试**
   - 输入与历史不同的 type，验证黄色高亮
   - 输入与历史相同的 type，验证正常显示

3. **性能测试**
   - 加载 2000+ 谱面数据，验证索引构建时间 < 500ms
   - 切换不同谱面，验证查询响应时间 < 10ms

4. **边界情况测试**
   - beatmapsetId 为空
   - beatmapsetId 无效
   - 同一谱面在多个比赛中使用不同 type

## 文件清单

需要创建/修改的文件：
- 📝 新建: `src/hooks/useMapHistory.ts`
- ✏️  修改: `src/components/admin/MapSlotEditor.tsx`
- ✏️  修改: `src/components/admin/RoundEditor.tsx`
- ✏️  修改: `src/components/admin/TournamentForm.tsx`
- ✏️  修改: `src/lib/i18n.ts`

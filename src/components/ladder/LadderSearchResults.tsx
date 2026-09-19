'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n'
import type { BeatmapMeta, Round, Tournament } from '@/lib/types'
import type { TournamentSearchResult } from '@/lib/tournamentSearch'

// 一条结果要么是"整场比赛"(搜的是这场比赛本身),要么是"整轮"(搜到了比赛+轮次),要么是"单张谱面"。
// 从宽到窄排:先给整场比赛的入口,再给整轮,最后给具体的图。
type SearchRow =
  | { kind: 'tournament'; tournament: Tournament }
  | { kind: 'round'; tournament: Tournament; round: Round }
  | { kind: 'map'; tournament: Tournament; round: Round; map: BeatmapMeta }

export function LadderSearchResults({ results, onSelect }: {
  results: TournamentSearchResult[]
  onSelect: (tournament: Tournament, round: Round, trigger?: HTMLElement | null) => void
}) {
  const t = useT()
  const [limit, setLimit] = useState(5)
  // 整场命中默认只给一行入口 —— 一场比赛几十轮,直接铺开就是刷屏。点开才把那场的轮次列出来。
  const [expanded, setExpanded] = useState<readonly string[]>([])

  // 「整场比赛」这一行只在**这场没有轮次/谱面命中**时才出:
  // 它要解决的是"搜比赛全名,面板一行都没有"的空白,而不是去抢谱面命中的位置。
  // 反过来说,每条结果至少贡献一行,面板不可能再出现"有比赛命中却无行可点"。
  const tournamentRows: SearchRow[] = results.flatMap(({ tournament, tournamentMatch, rounds, maps }) =>
    tournamentMatch && rounds.length === 0 && maps.length === 0
      ? [{ kind: 'tournament' as const, tournament }]
      : [])
  const roundRows: SearchRow[] = results.flatMap(({ tournament, rounds, tournamentMatch }) => {
    const rows = rounds.map(({ round }) => ({ kind: 'round' as const, tournament, round }))
    if (!tournamentMatch || !expanded.includes(tournament.id)) return rows
    const listed = new Set(rows.map((row) => row.round.id))
    return [...rows, ...tournament.rounds
      .filter((round) => !listed.has(round.id))
      .map((round) => ({ kind: 'round' as const, tournament, round }))]
  })
  const mapRows: SearchRow[] = results.flatMap(({ tournament, maps }) =>
    maps.map(({ round, map }) => ({ kind: 'map' as const, tournament, round, map })))
  const rows = [...tournamentRows, ...roundRows, ...mapRows]

  return (
    <section aria-label={t('search.results')} className="max-h-[35vh] shrink-0 overflow-auto border-b border-gray-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
      <p role="status" className="text-xs text-gray-500 dark:text-neutral-400">
        {results.length
          ? t('search.summary', { tournaments: results.length, rounds: roundRows.length, maps: mapRows.length })
          : t('search.empty')}
      </p>
      {rows.length > 0 && (
        <ul className="mt-1 divide-y divide-gray-100 dark:divide-neutral-800">
          {rows.slice(0, limit).map((row, i) => {
            const open = row.kind === 'tournament' && expanded.includes(row.tournament.id)
            return (
              <li className="ladder-search-result" key={row.kind === 'tournament'
                ? `tournament:${row.tournament.id}`
                : row.kind === 'round'
                  ? `round:${row.tournament.id}/${row.round.id}`
                  : `map:${row.tournament.id}/${row.round.id}/${row.map.slot}/${i}`}>
                <button
                  type="button"
                  aria-expanded={row.kind === 'tournament' ? open : undefined}
                  onClick={(e) => {
                    if (row.kind === 'tournament') {
                      // 整场命中:点一下在原地展开/收起这场的轮次(这里不弹详情 —— 用户还没选到哪一轮)。
                      setExpanded((value) => value.includes(row.tournament.id)
                        ? value.filter((id) => id !== row.tournament.id)
                        : [...value, row.tournament.id])
                      return
                    }
                    onSelect(row.tournament, row.round, e.currentTarget)
                  }}
                  className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded px-2 py-2 text-left text-sm transition-colors hover:bg-purple-50 focus-visible:outline-2 focus-visible:outline-purple-500 dark:hover:bg-purple-950/40 motion-reduce:transition-none"
                >
                  {row.kind === 'tournament' ? (
                    <>
                      <span className="shrink-0 font-medium text-purple-700 dark:text-purple-300">
                        {row.tournament.abbreviation}
                      </span>
                      <span className="min-w-0 break-words text-gray-700 dark:text-neutral-200">
                        {row.tournament.name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-neutral-400">
                        {t('search.tournamentRounds', { n: row.tournament.rounds.length })}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-gray-500 dark:text-neutral-400">
                        {open ? t('search.collapse') : t('search.expand')}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="shrink-0 font-medium text-purple-700 dark:text-purple-300">
                        {row.tournament.abbreviation} · {row.round.abbreviation || row.round.name}{row.kind === 'map' ? ` · ${row.map.slot}` : ''}
                      </span>
                      <span className="min-w-0 break-words text-gray-700 dark:text-neutral-200">
                        {row.kind === 'round'
                          ? t('search.roundPool', { n: row.round.maps.length })
                          : (row.map.name || t('search.unnamed'))}
                      </span>
                      {row.kind === 'map' && row.map.beatmapId && (
                        <span className="text-xs text-gray-400 dark:text-neutral-500">BID {row.map.beatmapId}</span>
                      )}
                      <span className="ml-auto shrink-0 text-xs text-gray-500 dark:text-neutral-400">{t('search.openRound')} →</span>
                    </>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {rows.length > limit && (
        <button type="button" onClick={() => setLimit((value) => value + 20)} className="mt-1 rounded px-2 py-2 text-xs text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-950/40">
          {t('search.more', { count: rows.length - limit })}
        </button>
      )}
    </section>
  )
}

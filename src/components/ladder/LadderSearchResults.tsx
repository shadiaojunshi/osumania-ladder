'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n'
import type { Round, Tournament } from '@/lib/types'
import type { TournamentSearchResult } from '@/lib/tournamentSearch'

export function LadderSearchResults({ results, onSelect }: {
  results: TournamentSearchResult[]
  onSelect: (tournament: Tournament, round: Round, trigger?: HTMLElement | null) => void
}) {
  const t = useT()
  const [limit, setLimit] = useState(5)
  const matches = results.flatMap(({ tournament, maps }) => maps.map((match) => ({ tournament, ...match })))

  return (
    <section aria-label={t('search.results')} className="max-h-[35vh] shrink-0 overflow-auto border-b border-gray-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
      <p role="status" className="text-xs text-gray-500 dark:text-neutral-400">
        {results.length ? t('search.summary', { tournaments: results.length, maps: matches.length }) : t('search.empty')}
      </p>
      {matches.length > 0 && (
        <ul className="mt-1 divide-y divide-gray-100 dark:divide-neutral-800">
          {matches.slice(0, limit).map(({ tournament, round, map }, i) => (
            <li className="ladder-search-result" key={`${tournament.id}/${round.id}/${map.slot}/${i}`}>
              <button
                type="button"
                onClick={(e) => onSelect(tournament, round, e.currentTarget)}
                className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded px-2 py-2 text-left text-sm transition-colors hover:bg-purple-50 focus-visible:outline-2 focus-visible:outline-purple-500 dark:hover:bg-purple-950/40 motion-reduce:transition-none"
              >
                <span className="shrink-0 font-medium text-purple-700 dark:text-purple-300">{tournament.abbreviation} · {round.abbreviation} · {map.slot}</span>
                <span className="min-w-0 break-words text-gray-700 dark:text-neutral-200">{map.name || t('search.unnamed')}</span>
                {map.beatmapId && <span className="text-xs text-gray-400 dark:text-neutral-500">BID {map.beatmapId}</span>}
                <span className="ml-auto shrink-0 text-xs text-gray-500 dark:text-neutral-400">{t('search.openRound')} →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {matches.length > limit && (
        <button type="button" onClick={() => setLimit((value) => value + 20)} className="mt-1 rounded px-2 py-2 text-xs text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-950/40">
          {t('search.more', { count: matches.length - limit })}
        </button>
      )}
    </section>
  )
}

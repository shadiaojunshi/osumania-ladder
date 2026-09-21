'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { readPlayerProfile } from '@/lib/playerProfile'
import { useT } from '@/lib/i18n'

function subscribe(onChange: () => void) {
  window.addEventListener('focus', onChange)
  window.addEventListener('pageshow', onChange)
  document.addEventListener('visibilitychange', onChange)
  // Expire the display at the same time as the signed session, without polling an API.
  const profile = readPlayerProfile(document.cookie)
  const timer = profile ? window.setTimeout(onChange, Math.max(0, profile.exp * 1000 - Date.now()) + 1) : undefined
  return () => {
    window.removeEventListener('focus', onChange)
    window.removeEventListener('pageshow', onChange)
    document.removeEventListener('visibilitychange', onChange)
    window.clearTimeout(timer)
  }
}

function getSnapshot() {
  const profile = readPlayerProfile(document.cookie)
  return profile ? JSON.stringify(profile) : ''
}

export function PlayerAvatar() {
  const t = useT()
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => '')
  const profile = snapshot ? JSON.parse(snapshot) as { uid: string; username: string } : null
  const [failedUid, setFailedUid] = useState<string | null>(null)
  const label = profile ? t('player.account', { name: profile.username }) : t('player.login')

  return (
    <Link
      href="/admin"
      prefetch={false}
      aria-label={label}
      title={label}
      style={{ borderRadius: '50%' }}
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-purple-200 bg-purple-50 text-purple-700 transition-colors hover:border-purple-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200"
    >
      {profile && failedUid !== profile.uid ? (
        // Direct osu! CDN image: no image proxy or site Function request.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://a.ppy.sh/${profile.uid}`} alt={profile.username} width={40} height={40}
          className="h-full w-full object-cover" referrerPolicy="no-referrer"
          onError={() => setFailedUid(profile.uid)} />
      ) : (
        <span className={profile ? 'text-sm font-semibold' : 'px-0.5 text-center text-[10px] font-medium leading-tight'}>
          {profile ? Array.from(profile.username).slice(0, 2).join('') : t('player.loggedOut')}
        </span>
      )}
    </Link>
  )
}

'use client'

import { useEffect } from 'react'
import { usePrefsStore } from '@/stores/prefsStore'

export function PrefsHydrator() {
  useEffect(() => {
    usePrefsStore.getState().hydrate()
  }, [])
  return null
}

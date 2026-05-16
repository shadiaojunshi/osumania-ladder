'use client'

import { LadderView } from '@/components/ladder/LadderView'
import { ControlBar } from '@/components/controls/ControlBar'
import { Header } from '@/components/Header'

export default function Home() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />
      <LadderView />
      <ControlBar />
    </div>
  )
}

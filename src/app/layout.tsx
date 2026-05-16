import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'osu!mania 难度天梯榜',
  description: 'osu!mania 比赛难度对比天梯榜',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-white text-gray-900">
        {children}
      </body>
    </html>
  )
}

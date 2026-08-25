import type { Metadata } from 'next'
import './globals.css'
import { PrefsHydrator } from '@/components/PrefsHydrator'
import { NumberInputWheelGuard } from '@/components/NumberInputWheelGuard'

export const metadata: Metadata = {
  title: 'osu!mania 难度天梯榜',
  description: 'osu!mania 比赛难度对比天梯榜',
}

// FOUC 屏蔽: SSR 输出固定 light + zh-CN,客户端 hydration 之前由这段脚本
// 同步从 localStorage / 系统偏好读出真实主题与语言,直接写到 <html> 上。
const FOUC_SCRIPT = `(function(){try{
var t=localStorage.getItem('theme');
if(t!=='dark'&&t!=='light'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
if(t==='dark')document.documentElement.classList.add('dark');
var l=localStorage.getItem('lang');
if(l!=='zh'&&l!=='en'){l=(navigator.language||'').toLowerCase().indexOf('zh')===0?'zh':'en';}
document.documentElement.lang=l==='zh'?'zh-CN':'en';
}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: FOUC_SCRIPT }} />
      </head>
      <body className="bg-white text-gray-900 dark:bg-neutral-950 dark:text-neutral-100" suppressHydrationWarning>
        <PrefsHydrator />
        <NumberInputWheelGuard />
        {children}
      </body>
    </html>
  )
}

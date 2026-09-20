'use client'

import { useEffect, useRef, useState } from 'react'
import { COLUMN_HEADER_HEIGHT } from '@/lib/ladderGeometry'
import { emblemPlacement } from '@/lib/tournamentEmblem'

export function TournamentIdentity({ name, icon, above }: { name: string; icon?: string; above: boolean }) {
  // 没有清单项就不挂图片、不发请求、不启动观察器或计时器。
  if (!icon) return <span className="relative tournament-name">
    {above && <span aria-hidden className="overflow-marker-arrow mr-1">↑</span>}{name}
  </span>
  return <AnimatedIdentity key={icon} name={name} icon={icon} above={above} />
}

function AnimatedIdentity({ name, icon, above }: { name: string; icon: string; above: boolean }) {
  const layerRef = useRef<HTMLSpanElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const layer = layerRef.current
    const box = layer?.parentElement
    const scroll = box?.closest<HTMLElement>('[data-ladder-scroll]')
    if (!layer || !box || !scroll || failed) return
    let frame: number | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let seen = false
    const update = () => {
      frame = null
      const b = box.getBoundingClientRect()
      const v = scroll.getBoundingClientRect()
      const placement = emblemPlacement(b.top, b.bottom, b.width, v.top + COLUMN_HEADER_HEIGHT, v.bottom)
      const visible = placement.visible && b.right > v.left && b.left < v.right
      layer.style.setProperty('--emblem-y', `${placement.center}px`)
      layer.style.setProperty('--emblem-width', `${placement.width}px`)
      layer.style.setProperty('--emblem-height', `${placement.height}px`)
      layer.dataset.visible = String(visible)
      // 首次露出后保留原貌五秒；横向尚未浏览的比赛不会提前播放完。
      if (visible && !seen && loaded) {
        seen = true
        timer = setTimeout(() => setRevealed(true), 5000)
      }
    }
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(update) }
    const resize = new ResizeObserver(schedule)
    resize.observe(scroll)
    resize.observe(box)
    // 仅有实际图标的框监听滚动，且每帧最多更新一次 DOM，不重渲染整张天梯。
    scroll.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    update()
    return () => {
      scroll.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      resize.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
      if (timer !== null) clearTimeout(timer)
    }
  }, [loaded, failed])

  const ready = loaded && !failed && revealed
  return <>
    <span className={`relative tournament-name ${ready ? 'tournament-name-replaced' : ''}`}>
      {above && <span aria-hidden className="overflow-marker-arrow mr-1">↑</span>}{name}
    </span>
    <span ref={layerRef} aria-hidden className={`tournament-emblem-layer ${ready ? 'is-revealed' : ''}`}>
      <span className="tournament-emblem-halo" />
      {/* 静态原图、透明背景照常保留。contain 保证矩形图标完整，不裁切/抠底。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="tournament-emblem-image" src={icon} alt="" loading="lazy" decoding="async"
        onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
    </span>
  </>
}

import { getDifficultyColor, getGradientForRange } from '@/lib/difficulty'
import { computeRangeSurface, ORIGIN_Y, OVERFLOW_BAND_HEIGHT, type RangeGeometry } from '@/lib/ladderGeometry'

const BOUNDS = { min: 0.5, max: 16.5 }
const GRADIENT = getGradientForRange(BOUNDS.min, BOUNDS.max)

export function rangeSurface(geometry: RangeGeometry, plotHeight: number, minDifficulty: number) {
  const surface = computeRangeSurface(geometry)
  return {
    visible: surface.visible,
    className: `${geometry.above ? 'overflow-range' : ''} ${geometry.below ? 'overflow-cropped-bottom' : ''}`,
    style: {
      top: surface.top,
      height: surface.height,
      paddingTop: geometry.above && surface.bodyVisible ? OVERFLOW_BAND_HEIGHT : undefined,
      backgroundColor: getDifficultyColor(geometry.above ? BOUNDS.max : minDifficulty),
      backgroundImage: GRADIENT,
      backgroundSize: `100% ${plotHeight}px`,
      backgroundPosition: `0 ${ORIGIN_Y - surface.top}px`,
      backgroundRepeat: 'no-repeat',
    },
  }
}

export function RangeDecoration({ above, below }: { above: boolean; below: boolean }) {
  return <>
    {above && <span aria-hidden className="overflow-range-heat" />}
    {below && <span aria-hidden className="overflow-edge-bottom" />}
  </>
}

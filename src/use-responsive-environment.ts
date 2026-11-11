import { useEffect, useMemo, useState } from 'react'
import {
  calculateResponsiveLayout,
  type ResponsiveViewport,
} from './responsive-layout'

function readMedia(query: string) {
  return typeof window !== 'undefined' && window.matchMedia(query).matches
}

function readViewport(): ResponsiveViewport {
  const visual = window.visualViewport
  const visualHeight = visual?.height ?? window.innerHeight
  const visualOffsetTop = visual?.offsetTop ?? 0
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    visualWidth: visual?.width ?? window.innerWidth,
    visualHeight,
    visualOffsetTop,
    visualOffsetLeft: visual?.offsetLeft ?? 0,
    keyboardInset: Math.max(
      0,
      window.innerHeight - visualHeight - visualOffsetTop,
    ),
  }
}

export function useResponsiveEnvironment() {
  const [viewport, setViewport] = useState(readViewport)
  const [coarsePointer, setCoarsePointer] = useState(() =>
    readMedia('(pointer: coarse)'),
  )
  const [reducedMotion, setReducedMotion] = useState(() =>
    readMedia('(prefers-reduced-motion: reduce)'),
  )

  useEffect(() => {
    let frame = 0
    const refresh = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => setViewport(readViewport()))
    }
    const coarse = window.matchMedia('(pointer: coarse)')
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const refreshCoarse = () => setCoarsePointer(coarse.matches)
    const refreshMotion = () => setReducedMotion(motion.matches)
    window.addEventListener('resize', refresh)
    window.addEventListener('orientationchange', refresh)
    window.visualViewport?.addEventListener('resize', refresh)
    window.visualViewport?.addEventListener('scroll', refresh)
    coarse.addEventListener('change', refreshCoarse)
    motion.addEventListener('change', refreshMotion)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', refresh)
      window.removeEventListener('orientationchange', refresh)
      window.visualViewport?.removeEventListener('resize', refresh)
      window.visualViewport?.removeEventListener('scroll', refresh)
      coarse.removeEventListener('change', refreshCoarse)
      motion.removeEventListener('change', refreshMotion)
    }
  }, [])

  const layout = useMemo(() => calculateResponsiveLayout(viewport), [viewport])
  return { viewport, layout, coarsePointer, reducedMotion }
}

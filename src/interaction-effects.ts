export type InteractionEasing = 'linear' | 'smooth' | 'spring'

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function easeInteraction(value: number, easing: InteractionEasing) {
  const bounded = clamp01(value)
  if (easing === 'linear') return bounded
  if (easing === 'spring') {
    return clamp01(1 - Math.exp(-5 * bounded) * Math.cos(bounded * Math.PI * 1.75))
  }
  return bounded * bounded * (3 - 2 * bounded)
}

export function proximityExcitement(
  distancePx: number,
  proximityPx: number,
  activeZonePx: number,
) {
  if (distancePx <= activeZonePx) return 1
  const range = Math.max(1, proximityPx - activeZonePx)
  return clamp01(1 - (distancePx - activeZonePx) / range)
}

export interface MergeVibrationInput {
  elapsedMs: number
  dwellMs: number
  attackMs: number
  easing: InteractionEasing
  stickySlowdown: number
  reducedMotion: boolean
}

export interface VibrationState {
  amplitude: number
  frequencyScale: number
  ready: boolean
}

export function mergeVibrationState({
  elapsedMs,
  dwellMs,
  attackMs,
  easing,
  stickySlowdown,
  reducedMotion,
}: MergeVibrationInput): VibrationState {
  const dwellProgress = clamp01(elapsedMs / Math.max(1, dwellMs))
  const ready = dwellProgress >= 1
  if (reducedMotion) {
    return { amplitude: 0, frequencyScale: clamp01(stickySlowdown), ready }
  }
  if (ready) {
    return {
      amplitude: clamp01(stickySlowdown),
      frequencyScale: clamp01(stickySlowdown),
      ready,
    }
  }
  const attack = easeInteraction(elapsedMs / Math.max(1, attackMs), easing)
  const stop = easeInteraction((1 - dwellProgress) / 0.18, 'smooth')
  return {
    amplitude: attack * stop,
    frequencyScale: 1 - (1 - clamp01(stickySlowdown)) * dwellProgress,
    ready,
  }
}

export interface SplitJitterInput {
  elapsedMs: number
  attackMs: number
  easing: InteractionEasing
  reducedMotion: boolean
}

export function splitJitterState({
  elapsedMs,
  attackMs,
  easing,
  reducedMotion,
}: SplitJitterInput) {
  if (reducedMotion) return 0
  return easeInteraction(elapsedMs / Math.max(1, attackMs), easing)
}

export interface GroupCueStrengthInput {
  spatialProgress: number
  dwellElapsedMs: number
  dwellMs: number
  easing: InteractionEasing
}

export function groupBoundaryProgress(
  distancePx: number,
  thresholdPx: number,
  inside: boolean,
) {
  const normalized = clamp01(distancePx / Math.max(1, thresholdPx))
  return inside ? 0.7 + normalized * 0.3 : (1 - normalized) * 0.7
}

export function groupCueStrength({
  spatialProgress,
  dwellElapsedMs,
  dwellMs,
  easing,
}: GroupCueStrengthInput) {
  const spatial = easeInteraction(spatialProgress, easing)
  const dwell = easeInteraction(dwellElapsedMs / Math.max(1, dwellMs), easing)
  return spatial * (0.28 + dwell * 0.72)
}

export function groupCuePhase(
  elapsedSeconds: number,
  frequencyHz: number,
  offsetTurns = 0,
) {
  return (
    Math.max(0, elapsedSeconds) * Math.PI * 2 * Math.max(0.01, frequencyHz) +
    offsetTurns * Math.PI * 2
  )
}

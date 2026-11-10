import type { CellEntity } from './model'

export function seedExpiryScale(
  expiry: CellEntity['expiry'],
  timeMs: number,
  shrinkMs: number,
) {
  return seedExpiryVisualState(expiry, timeMs, shrinkMs).scale
}

export function seedExpiryVisualState(
  expiry: CellEntity['expiry'],
  timeMs: number,
  shrinkMs: number,
) {
  if (
    expiry.state === 'scheduled' &&
    expiry.createdAtMs !== undefined &&
    expiry.timeoutMs > 0
  ) {
    const lifetimeProgress = Math.max(
      0,
      Math.min(1, (timeMs - expiry.createdAtMs) / expiry.timeoutMs),
    )
    const warningProgress = Math.max(0, (lifetimeProgress - 0.68) / 0.32)
    const springEnvelope = Math.max(
      0,
      Math.min(
        1,
        1 -
          Math.exp(-warningProgress * 5.5) *
            Math.cos(warningProgress * Math.PI * 3),
      ),
    )
    const blink = (Math.sin(lifetimeProgress * Math.PI * 8) + 1) / 2
    return {
      scale: 1,
      opacity: 1 - springEnvelope * (0.24 + blink * 0.24),
      warningProgress,
    }
  }
  if (expiry.state !== 'shrinking' || expiry.shrinkStartedAtMs === undefined) {
    return { scale: 1, opacity: 1, warningProgress: 0 }
  }
  const progress = Math.max(
    0,
    Math.min(1, (timeMs - expiry.shrinkStartedAtMs) / Math.max(1, shrinkMs)),
  )
  if (progress >= 1) return { scale: 0, opacity: 0, warningProgress: 1 }
  const smoothFade = progress * progress * (3 - 2 * progress)
  const springFade = Math.max(
    0,
    Math.min(
      0.995,
      smoothFade + Math.sin(progress * Math.PI * 3) * 0.06 * (1 - progress),
    ),
  )
  const residualBlink = 0.9 + Math.sin(progress * Math.PI * 5) * 0.1 * (1 - progress)
  return {
    scale: 1 - springFade,
    opacity: (1 - springFade) * residualBlink,
    warningProgress: 1,
  }
}

import type { CellEntity } from './model'

export function seedExpiryScale(
  expiry: CellEntity['expiry'],
  timeMs: number,
  shrinkMs: number,
) {
  if (expiry.state !== 'shrinking' || expiry.shrinkStartedAtMs === undefined) return 1
  const progress = Math.max(
    0,
    Math.min(1, (timeMs - expiry.shrinkStartedAtMs) / Math.max(1, shrinkMs)),
  )
  const eased = progress * progress * (3 - 2 * progress)
  return 1 - eased
}

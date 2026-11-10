import { describe, expect, it } from 'vitest'
import type { CellEntity } from './model'
import { seedExpiryScale, seedExpiryVisualState } from './seed-expiry'

function expiry(overrides: Partial<CellEntity['expiry']>): CellEntity['expiry'] {
  return {
    state: 'scheduled',
    timeoutMs: 180_000,
    createdAtMs: 0,
    ...overrides,
  }
}

describe('seed expiry lifecycle', () => {
  it('stays full-sized until shrinking and reaches zero smoothly', () => {
    expect(seedExpiryScale(expiry({ state: 'scheduled' }), 180_000, 1200)).toBe(1)
    const shrinking = expiry({ state: 'shrinking', shrinkStartedAtMs: 180_000 })
    expect(seedExpiryScale(shrinking, 180_000, 1200)).toBe(1)
    expect(seedExpiryScale(shrinking, 180_600, 1200)).toBeGreaterThan(0)
    expect(seedExpiryScale(shrinking, 180_600, 1200)).toBeLessThan(1)
    expect(seedExpiryScale(shrinking, 181_200, 1200)).toBe(0)
  })

  it('dims with a restrained spring blink before expiry without changing geometry', () => {
    const scheduled = expiry({ state: 'scheduled', timeoutMs: 1000 })
    const early = seedExpiryVisualState(scheduled, 500, 1200)
    const warning = seedExpiryVisualState(scheduled, 900, 1200)

    expect(early).toEqual({ scale: 1, opacity: 1, warningProgress: 0 })
    expect(warning.scale).toBe(1)
    expect(warning.opacity).toBeLessThan(1)
    expect(warning.opacity).toBeGreaterThan(0.45)
  })

  it('never shrinks a cancelled seed', () => {
    expect(
      seedExpiryScale(
        expiry({ state: 'cancelled', shrinkStartedAtMs: 180_000 }),
        999_999,
        1200,
      ),
    ).toBe(1)
  })
})

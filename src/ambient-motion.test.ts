import { describe, expect, it } from 'vitest'
import { ambientScaleOffset } from './ambient-motion'

const settings = {
  enabled: true,
  amplitudePx: 0.58,
  periodMs: 6200,
  phaseSpread: 0.42,
  coverage: 1,
}

describe('ambient culture motion', () => {
  it('is deterministic, bounded, and render-scale only', () => {
    const first = ambientScaleOffset(3, 2.4, 120, settings)
    const second = ambientScaleOffset(3, 2.4, 120, settings)
    expect(first).toBe(second)
    expect(Math.abs(first)).toBeLessThanOrEqual(settings.amplitudePx / 120)
  })

  it('stops for reduced motion, disabled motion, and zero coverage', () => {
    expect(ambientScaleOffset(3, 2.4, 120, settings, true)).toBe(0)
    expect(
      ambientScaleOffset(3, 2.4, 120, { ...settings, enabled: false }),
    ).toBe(0)
    expect(
      ambientScaleOffset(3, 2.4, 120, { ...settings, coverage: 0 }),
    ).toBe(0)
  })

  it('uses phase spread to avoid mechanical lockstep motion', () => {
    const first = ambientScaleOffset(1, 1.6, 120, settings)
    const second = ambientScaleOffset(2, 1.6, 120, settings)
    expect(first).not.toBe(second)
  })
})

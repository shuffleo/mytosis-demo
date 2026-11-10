import { describe, expect, it } from 'vitest'
import { grainOffsetAt } from './wall-texture-renderer'

describe('pre-shader wall grain', () => {
  it('is deterministic while frequency and detail remain independent inputs', () => {
    const base = {
      frequency: 0.1,
      octaves: 2,
      amplitude: 0.65,
      seed: 42,
    }
    expect(grainOffsetAt(7, base)).toBe(grainOffsetAt(7, base))
    expect(grainOffsetAt(7, { ...base, frequency: 0.8 })).not.toBe(
      grainOffsetAt(7, base),
    )
    expect(grainOffsetAt(7, { ...base, octaves: 4 })).not.toBe(
      grainOffsetAt(7, base),
    )
  })
})

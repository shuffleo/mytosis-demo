import { describe, expect, it } from 'vitest'
import { mapPostProcessedPoint } from './microscope-mapping'
import { cloneSettings } from './settings'

const field = {
  width: 1000,
  height: 800,
  center: { x: 500, y: 400 },
  radius: 320,
}

describe('microscope pointer mapping', () => {
  it('keeps the fixed lens center and exterior coordinates invariant', () => {
    const settings = cloneSettings()
    expect(mapPostProcessedPoint(field.center, field, settings)).toEqual(field.center)
    expect(mapPostProcessedPoint({ x: 10, y: 10 }, field, settings)).toEqual({
      x: 10,
      y: 10,
    })
  })

  it('maps visible refracted coordinates back to sampled Paper coordinates', () => {
    const settings = cloneSettings()
    const visible = { x: 760, y: 400 }
    const mapped = mapPostProcessedPoint(visible, field, settings)

    expect(mapped.x).toBeGreaterThan(visible.x)
    expect(mapped.y).toBeCloseTo(visible.y)
    expect(mapped.x).toBeLessThan(field.center.x + field.radius)
  })

  it('makes the three distortion systems independently toggleable', () => {
    const settings = cloneSettings()
    const visible = { x: 740, y: 430 }
    settings.effects.vignette.enabled = false
    settings.effects.lens.enabled = false
    settings.effects.crt.enabled = false
    expect(mapPostProcessedPoint(visible, field, settings)).toEqual(visible)

    settings.effects.crt.enabled = true
    settings.effects.crt.bulge = 0.4
    expect(mapPostProcessedPoint(visible, field, settings)).not.toEqual(visible)
  })
})

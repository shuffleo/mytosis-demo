import { describe, expect, it } from 'vitest'
import {
  groupBoundaryProgress,
  groupCuePhase,
  groupCueStrength,
  mergeVibrationState,
  proximityExcitement,
  splitJitterState,
} from './interaction-effects'

describe('transient interaction effects', () => {
  it('ramps proximity from the outer range to a full active zone', () => {
    expect(proximityExcitement(80, 72, 18)).toBe(0)
    expect(proximityExcitement(45, 72, 18)).toBeCloseTo(0.5)
    expect(proximityExcitement(18, 72, 18)).toBe(1)
    expect(proximityExcitement(0, 72, 18)).toBe(1)
  })

  it('ramps, slows, and stops merge vibration at dwell completion', () => {
    const initial = mergeVibrationState({
      elapsedMs: 0,
      dwellMs: 720,
      attackMs: 180,
      easing: 'smooth',
      stickySlowdown: 0.22,
      reducedMotion: false,
    })
    const attacked = mergeVibrationState({
      elapsedMs: 180,
      dwellMs: 720,
      attackMs: 180,
      easing: 'smooth',
      stickySlowdown: 0.22,
      reducedMotion: false,
    })
    const ready = mergeVibrationState({
      elapsedMs: 720,
      dwellMs: 720,
      attackMs: 180,
      easing: 'smooth',
      stickySlowdown: 0.22,
      reducedMotion: false,
    })

    expect(initial.amplitude).toBe(0)
    expect(attacked.amplitude).toBeGreaterThan(0.9)
    expect(attacked.frequencyScale).toBeLessThan(1)
    expect(ready).toEqual({ amplitude: 0.22, frequencyScale: 0.22, ready: true })
  })

  it('holds split jitter at a plateau and suppresses all jitter for reduced motion', () => {
    expect(
      splitJitterState({
        elapsedMs: 0,
        attackMs: 220,
        easing: 'smooth',
        reducedMotion: false,
      }),
    ).toBe(0)
    expect(
      splitJitterState({
        elapsedMs: 440,
        attackMs: 220,
        easing: 'smooth',
        reducedMotion: false,
      }),
    ).toBe(1)
    expect(
      splitJitterState({
        elapsedMs: 440,
        attackMs: 220,
        easing: 'smooth',
        reducedMotion: true,
      }),
    ).toBe(0)
  })

  it('combines spatial contact and dwell while keeping one deterministic phase', () => {
    const near = groupCueStrength({
      spatialProgress: 0.5,
      dwellElapsedMs: 0,
      dwellMs: 720,
      easing: 'linear',
    })
    const held = groupCueStrength({
      spatialProgress: 0.5,
      dwellElapsedMs: 720,
      dwellMs: 720,
      easing: 'linear',
    })
    expect(near).toBeCloseTo(0.14)
    expect(held).toBeCloseTo(0.5)
    expect(groupCuePhase(0.25, 2, 0)).toBeCloseTo(Math.PI)
    expect(groupCuePhase(0.25, 2, 0.25)).toBeCloseTo(Math.PI * 1.5)
  })

  it('keeps join strength continuous while crossing and penetrating a group wall', () => {
    expect(groupBoundaryProgress(72, 72, false)).toBe(0)
    expect(groupBoundaryProgress(0, 72, false)).toBeCloseTo(0.7)
    expect(groupBoundaryProgress(0, 72, true)).toBeCloseTo(0.7)
    expect(groupBoundaryProgress(36, 72, true)).toBeCloseTo(0.85)
    expect(groupBoundaryProgress(72, 72, true)).toBe(1)
  })
})

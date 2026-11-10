import { describe, expect, it } from 'vitest'
import { defaultSettings, groupColorFor, migrateSettings } from './settings'

describe('refined control defaults', () => {
  it('uses the exact requested fresh values', () => {
    expect(defaultSettings.geometry).toEqual({
      innerStrokeWidth: 4.75,
      cornerRadius: 32,
      seamGap: 12,
      outerGap: 32,
      textInset: 24,
      wallGrainEnabled: true,
      wallGrain: 0.65,
      wallGrainFrequency: 0.1,
      wallGrainOctaves: 2,
      wallGrainOpacity: 0.74,
    })
    expect(defaultSettings.particles).toEqual({
      enabled: true,
      density: 64,
      speed: 0.42,
      orbitRadius: 3.5,
      size: 1.15,
      opacity: 0.28,
      color: '#454b48',
    })
    expect(defaultSettings.motion).toMatchObject({
      hoverAmplitude: 0.032,
      hoverPeriodMs: 3360,
      hoverAttackMs: 300,
      morphResponse: 32,
    })
    expect(defaultSettings.seed).toMatchObject({
      delayMinMs: 4800,
      delayMaxMs: 12400,
      rate: 0.56,
      growthMs: 8000,
      popScale: 1.2,
      sizeRatio: 0.125,
      incubationDelayMs: 3000,
      stickyEnabled: true,
      blobSizePx: 20,
      stickyDistancePx: 92,
      stickyNeckPx: 8,
      stickyTension: 0.58,
      stickyWobble: 0.1,
      stickyResponse: 18,
      expirySeconds: 180,
      expiryShrinkMs: 1200,
    })
    expect(defaultSettings.group).toMatchObject({
      wallThickness: 12,
      wallGap: 2,
      wallGrainFrequency: 0.1,
      wallGrainOctaves: 2,
      wallGrainOpacity: 0.74,
      attraction: 0.32,
      detachThreshold: 0.8,
      motionEasing: 'smooth',
      attachDistancePx: 42,
      attachHoldMs: 720,
    })
    expect(defaultSettings.mergeSplit).toEqual({
      enabled: true,
      newSelect: true,
      mergeDistancePx: 58,
      proximityPx: 72,
      activeZonePx: 18,
      activeZoneTint: 0.34,
      activeZoneGrain: 1.6,
      mergeDwellMs: 720,
      vibrationAttackMs: 180,
      vibrationEasing: 'smooth',
      cellJitterAmplitudePx: 1.4,
      cellJitterFrequencyHz: 11,
      wallJitterAmplitudePx: 2.2,
      wallJitterFrequencyHz: 8,
      stickySlowdown: 0.22,
      longPressMs: 720,
      splitJitterAttackMs: 220,
      splitJitterEasing: 'smooth',
      splitJitterAmplitudePx: 2,
      splitJitterFrequencyHz: 12,
      splitMin: 2,
      splitMax: 4,
    })
    expect(defaultSettings.clustering).toEqual({
      autoK: true,
      minK: 2,
      maxK: 4,
      seed: 20261109,
      animationMs: 1400,
    })
    expect(defaultSettings.viewTransition).toEqual({
      enabled: true,
      durationMs: 900,
      blurPx: 14,
      arcDepth: 1.8,
      easing: 'smooth',
    })
    expect(defaultSettings.editFocus).toEqual({
      trackTransitionEnabled: true,
      durationMs: 1100,
      blurPx: 24,
      arcDepth: 1.8,
      coverage: 0.8,
      easing: 'smooth',
    })
    expect(defaultSettings.effects).toEqual({
      circle: {
        grain: 0.04,
      },
      vignette: {
        enabled: true,
        intensity: 1,
        dim: 0.8,
        blurRadius: 0.5,
        rimWidth: 0.32,
        softness: 0.06,
        distortion: 0.002,
        grain: 0.024,
      },
      lens: {
        enabled: true,
        shape: 'sphere',
        refraction: 0.32,
        aberration: 0.65,
        frost: 0.4,
        glow: 0.2,
        glowRadius: 2.5,
      },
      crt: {
        enabled: true,
        phosphorScanlinesEnabled: false,
        phosphor: 155,
        scanlines: 0,
        colorShift: 0.24,
        bulge: 0.5,
      },
    })
  })

  it('does not let a legacy settings object hide fresh reset defaults', () => {
    const migrated = migrateSettings({
      geometry: { ...defaultSettings.geometry, innerStrokeWidth: 1.4 },
    })
    expect(migrated).toEqual(defaultSettings)
  })

  it('preserves version-two refinements while adding microscope defaults', () => {
    const migrated = migrateSettings({
      ...defaultSettings,
      schemaVersion: 2,
      geometry: { ...defaultSettings.geometry, seamGap: 18 },
      effects: undefined,
    })
    expect(migrated.geometry.seamGap).toBe(18)
    expect(migrated.effects).toEqual(defaultSettings.effects)
    expect(migrated.schemaVersion).toBe(11)
    expect(migrated.seed.expirySeconds).toBe(180)
    expect(migrated.clustering.autoK).toBe(true)
  })

  it('adds visible grain and glow defaults to version-five settings', () => {
    const legacy = structuredClone(defaultSettings)
    legacy.schemaVersion = 5
    const legacyLens = legacy.effects.lens as Partial<typeof legacy.effects.lens>
    delete legacyLens.glow
    delete legacyLens.glowRadius
    legacy.effects.vignette.grain = 0

    const migrated = migrateSettings(legacy)
    expect(migrated.schemaVersion).toBe(11)
    expect(migrated.effects.vignette.grain).toBe(0)
    expect(migrated.effects.lens.glow).toBe(0.2)
    expect(migrated.effects.lens.glowRadius).toBe(2.5)
  })

  it('migrates version-six settings with independent whole-circle and wall grain', () => {
    const legacy = structuredClone(defaultSettings)
    legacy.schemaVersion = 6
    delete (legacy.effects as Partial<typeof legacy.effects>).circle
    delete (legacy.geometry as Partial<typeof legacy.geometry>).wallGrain

    const migrated = migrateSettings(legacy)
    expect(migrated.schemaVersion).toBe(11)
    expect(migrated.effects.circle.grain).toBe(0.04)
    expect(migrated.geometry.wallGrain).toBe(0.65)
  })

  it('adds New Select and optical view-transition defaults to version seven', () => {
    const legacy = structuredClone(defaultSettings)
    legacy.schemaVersion = 7
    delete (legacy.mergeSplit as Partial<typeof legacy.mergeSplit>).newSelect
    delete (legacy as Partial<typeof legacy>).viewTransition

    const migrated = migrateSettings(legacy)
    expect(migrated.mergeSplit.newSelect).toBe(true)
    expect(migrated.viewTransition).toEqual(defaultSettings.viewTransition)
  })

  it('adds wall texture, seam particles, focus editing, and group palette to version eight', () => {
    const legacy = structuredClone(defaultSettings)
    legacy.schemaVersion = 8
    delete (legacy as Partial<typeof legacy>).particles
    delete (legacy as Partial<typeof legacy>).editFocus
    delete (legacy.geometry as Partial<typeof legacy.geometry>).wallGrainEnabled
    delete (legacy.palette as Partial<typeof legacy.palette>).group8

    const migrated = migrateSettings(legacy)
    expect(migrated.schemaVersion).toBe(11)
    expect(migrated.geometry.wallGrainEnabled).toBe(true)
    expect(migrated.particles).toEqual(defaultSettings.particles)
    expect(migrated.editFocus).toEqual(defaultSettings.editFocus)
    expect(migrated.palette.group8).toBe(defaultSettings.palette.group8)
  })

  it('adds the tracked focus transition controls to version nine settings', () => {
    const legacy = structuredClone(defaultSettings)
    legacy.schemaVersion = 9
    delete (
      legacy.editFocus as Partial<typeof legacy.editFocus>
    ).trackTransitionEnabled
    delete (legacy.editFocus as Partial<typeof legacy.editFocus>).arcDepth

    const migrated = migrateSettings(legacy)
    expect(migrated.schemaVersion).toBe(11)
    expect(migrated.editFocus.trackTransitionEnabled).toBe(true)
    expect(migrated.editFocus.arcDepth).toBe(1.8)
  })

  it('migrates version ten with independent interaction and group grain controls', () => {
    const legacy = structuredClone(defaultSettings)
    legacy.schemaVersion = 10
    delete (legacy.group as Partial<typeof legacy.group>).wallGrainFrequency
    delete (legacy.group as Partial<typeof legacy.group>).wallGrainOctaves
    delete (legacy.group as Partial<typeof legacy.group>).wallGrainOpacity
    delete (legacy.mergeSplit as Partial<typeof legacy.mergeSplit>).mergeDwellMs
    delete (
      legacy.mergeSplit as Partial<typeof legacy.mergeSplit>
    ).splitJitterAmplitudePx

    const migrated = migrateSettings(legacy)
    expect(migrated.schemaVersion).toBe(11)
    expect(migrated.group.wallGrainFrequency).toBe(0.1)
    expect(migrated.group.wallGrainOctaves).toBe(2)
    expect(migrated.group.wallGrainOpacity).toBe(0.74)
    expect(migrated.mergeSplit.mergeDwellMs).toBe(720)
    expect(migrated.mergeSplit.splitJitterAmplitudePx).toBe(2)
  })

  it('rotates the eight group colors deterministically', () => {
    expect(groupColorFor(defaultSettings, 1)).toBe(defaultSettings.palette.group1)
    expect(groupColorFor(defaultSettings, 8)).toBe(defaultSettings.palette.group8)
    expect(groupColorFor(defaultSettings, 9)).toBe(defaultSettings.palette.group1)
  })
})

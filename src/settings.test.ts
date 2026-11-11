import { describe, expect, it } from 'vitest'
import {
  defaultSettings,
  groupColorFor,
  identifyPalettePreset,
  migrateSettings,
  palettePresetById,
  PALETTE_PRESETS,
  SETTINGS_SCHEMA_VERSION,
} from './settings'

function contrastRatio(foreground: string, background: string) {
  const luminance = (color: string) => {
    const channels = color
      .slice(1)
      .match(/.{2}/gu)!
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      )
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

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
      wallGrainFrequency: 2.4,
      wallGrainOctaves: 1,
      wallGrainOpacity: 0.64,
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
      ambientEnabled: true,
      ambientAmplitudePx: 0.58,
      ambientPeriodMs: 6200,
      ambientPhaseSpread: 0.42,
      ambientCoverage: 0.72,
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
      expirySeconds: 45,
      expiryShrinkMs: 2200,
      incubationBlur: 16,
      incubationWigglePx: 0.8,
      incubationWiggleHz: 1.6,
      incubationWiggleEasing: 'spring',
    })
    expect(defaultSettings.group).toMatchObject({
      wallThickness: 12,
      wallGap: 2,
      wallGrainFrequency: 0.1,
      wallGrainOctaves: 2,
      wallGrainOpacity: 0.74,
      attraction: 0.4,
      detachThreshold: 0.4,
      motionEasing: 'smooth',
      attachDistancePx: 42,
      attachHoldMs: 720,
      cueFrequencyHz: 7,
      cueCellAmplitudePx: 1.6,
      cueWallAmplitudePx: 2.4,
      cueStrokeExcitation: 4,
      cuePhaseOffset: 0.18,
      ghostSizePx: 42,
      ghostRepulsion: 0.34,
      ghostResponse: 12,
      cueEasing: 'smooth',
    })
    expect(defaultSettings.mergeSplit).toEqual({
      enabled: true,
      newSelect: true,
      mergeDistancePx: 36,
      proximityPx: 32,
      activeZonePx: 44,
      activeZoneTint: 0.24,
      activeZoneGrain: 1.2,
      mergeDwellMs: 720,
      vibrationAttackMs: 180,
      vibrationEasing: 'smooth',
      cellJitterAmplitudePx: 1.2,
      cellJitterFrequencyHz: 8,
      wallJitterAmplitudePx: 2,
      wallJitterFrequencyHz: 12,
      stickySlowdown: 0.32,
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
    expect(defaultSettings.adaptiveText).toEqual({
      enabled: true,
      debounceMs: 650,
      fitMinimumFontSize: 9.5,
      fitHysteresis: 0.12,
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
        edgeFeatherPx: 20,
        focusEdgeFeatherPx: 20,
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
      focusVignette: {
        enabled: true,
        intensity: 1,
        dim: 0.8,
        blurRadius: 1,
        rimWidth: 0.16,
        softness: 0.02,
        distortion: 0.001,
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
    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION)
    expect(migrated.seed.expirySeconds).toBe(45)
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
    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION)
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
    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION)
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
    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION)
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
    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION)
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
    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION)
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

  it('migrates version eleven with ambient culture motion defaults', () => {
    const legacy = structuredClone(defaultSettings)
    legacy.schemaVersion = 11
    delete (legacy.motion as Partial<typeof legacy.motion>).ambientEnabled
    delete (legacy.motion as Partial<typeof legacy.motion>).ambientAmplitudePx
    delete (legacy.motion as Partial<typeof legacy.motion>).ambientPeriodMs
    delete (legacy.motion as Partial<typeof legacy.motion>).ambientPhaseSpread
    delete (legacy.motion as Partial<typeof legacy.motion>).ambientCoverage

    const migrated = migrateSettings(legacy)
    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION)
    expect(migrated.motion).toMatchObject({
      ambientEnabled: true,
      ambientAmplitudePx: 0.58,
      ambientPeriodMs: 6200,
      ambientPhaseSpread: 0.42,
      ambientCoverage: 0.72,
    })
  })

  it('migrates the previous shared vignette into both view profiles', () => {
    const legacy = structuredClone(defaultSettings)
    legacy.schemaVersion = 12
    legacy.effects.vignette.dim = 0.37
    delete (
      legacy.effects as Partial<typeof legacy.effects>
    ).focusVignette

    const migrated = migrateSettings(legacy)
    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION)
    expect(migrated.effects.vignette.dim).toBe(0.37)
    expect(migrated.effects.focusVignette.dim).toBe(0.37)
  })

  it('moves untouched version-thirteen focus optics to the new defaults', () => {
    const legacy = structuredClone(defaultSettings)
    legacy.schemaVersion = 13
    legacy.effects.focusVignette = {
      enabled: true,
      intensity: 0.78,
      dim: 0.56,
      blurRadius: 0.25,
      rimWidth: 0.24,
      softness: 0.08,
      distortion: 0.001,
      grain: 0.018,
    }
    delete (
      legacy.effects.circle as Partial<typeof legacy.effects.circle>
    ).edgeFeatherPx
    delete (
      legacy.effects.circle as Partial<typeof legacy.effects.circle>
    ).focusEdgeFeatherPx

    const migrated = migrateSettings(legacy)
    expect(migrated.effects.focusVignette).toEqual(
      defaultSettings.effects.focusVignette,
    )
    expect(migrated.effects.circle.edgeFeatherPx).toBe(20)
    expect(migrated.effects.circle.focusEdgeFeatherPx).toBe(20)
  })

  it('preserves customized version-thirteen focus optics during migration', () => {
    const legacy = structuredClone(defaultSettings)
    legacy.schemaVersion = 13
    legacy.effects.focusVignette.dim = 0.41

    expect(migrateSettings(legacy).effects.focusVignette.dim).toBe(0.41)
  })

  it('adds transient group cue controls to version-fourteen settings', () => {
    const legacy = structuredClone(defaultSettings)
    legacy.schemaVersion = 14
    delete (legacy.group as Partial<typeof legacy.group>).cueFrequencyHz
    delete (legacy.group as Partial<typeof legacy.group>).cueCellAmplitudePx
    delete (legacy.group as Partial<typeof legacy.group>).cueWallAmplitudePx
    delete (legacy.group as Partial<typeof legacy.group>).cueStrokeExcitation
    delete (legacy.group as Partial<typeof legacy.group>).cuePhaseOffset
    delete (legacy.group as Partial<typeof legacy.group>).ghostSizePx
    delete (legacy.group as Partial<typeof legacy.group>).ghostRepulsion
    delete (legacy.group as Partial<typeof legacy.group>).ghostResponse
    delete (legacy.group as Partial<typeof legacy.group>).cueEasing

    const migrated = migrateSettings(legacy)
    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION)
    expect(migrated.group).toMatchObject({
      cueFrequencyHz: 7,
      cueCellAmplitudePx: 1.6,
      cueWallAmplitudePx: 2.4,
      cueStrokeExcitation: 4,
      cuePhaseOffset: 0.18,
      ghostSizePx: 42,
      ghostRepulsion: 0.34,
      ghostResponse: 12,
      cueEasing: 'smooth',
    })
  })

  it('adds adaptive text controls to version-fifteen settings', () => {
    const legacy = structuredClone(defaultSettings)
    legacy.schemaVersion = 15
    delete (legacy as Partial<typeof legacy>).adaptiveText

    const migrated = migrateSettings(legacy)
    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION)
    expect(migrated.adaptiveText).toEqual(defaultSettings.adaptiveText)
  })

  it('keeps cell text WCAG AA readable in every microscope palette', () => {
    for (const preset of PALETTE_PRESETS) {
      for (const cellColor of [
        preset.palette.cellLight,
        preset.palette.cellMid,
        preset.palette.cellDark,
        preset.palette.cellDeep,
      ]) {
        expect(
          contrastRatio(preset.palette.text, cellColor),
          `${preset.label}: ${preset.palette.text} on ${cellColor}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('re-identifies a persisted preset and marks manual color edits custom', () => {
    const migrated = migrateSettings({
      ...defaultSettings,
      palette: structuredClone(palettePresetById('polarized-tide').palette),
    })
    expect(identifyPalettePreset(migrated.palette)).toBe('polarized-tide')
    migrated.palette.cellLight = '#ffffff'
    expect(identifyPalettePreset(migrated.palette)).toBe('custom')
  })
})

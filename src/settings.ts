export interface VignetteSettings {
  enabled: boolean
  intensity: number
  dim: number
  blurRadius: number
  rimWidth: number
  softness: number
  distortion: number
  grain: number
}

export interface CanvasSettings {
  schemaVersion: number
  effects: {
    circle: {
      grain: number
      edgeFeatherPx: number
      focusEdgeFeatherPx: number
    }
    vignette: VignetteSettings
    focusVignette: VignetteSettings
    lens: {
      enabled: boolean
      shape: 'sphere'
      refraction: number
      aberration: number
      frost: number
      glow: number
      glowRadius: number
    }
    crt: {
      enabled: boolean
      phosphorScanlinesEnabled: boolean
      phosphor: number
      scanlines: number
      colorShift: number
      bulge: number
    }
  }
  geometry: {
    innerStrokeWidth: number
    cornerRadius: number
    seamGap: number
    outerGap: number
    textInset: number
    wallGrainEnabled: boolean
    wallGrain: number
    wallGrainFrequency: number
    wallGrainOctaves: number
    wallGrainOpacity: number
  }
  particles: {
    enabled: boolean
    density: number
    speed: number
    orbitRadius: number
    size: number
    opacity: number
    color: string
  }
  motion: {
    hoverAmplitude: number
    hoverPeriodMs: number
    hoverAttackMs: number
    morphResponse: number
    easing: 'smooth' | 'spring' | 'direct'
    ambientEnabled: boolean
    ambientAmplitudePx: number
    ambientPeriodMs: number
    ambientPhaseSpread: number
    ambientCoverage: number
  }
  seed: {
    delayMinMs: number
    delayMaxMs: number
    rate: number
    growthMs: number
    easing: 'smooth' | 'spring' | 'linear'
    popScale: number
    maxAlive: number
    sizeRatio: number
    incubationDelayMs: number
    incubationGrowthMs: number
    incubationBlur: number
    incubationWigglePx: number
    incubationWiggleHz: number
    incubationWiggleEasing: 'smooth' | 'spring' | 'linear'
    stickyEnabled: boolean
    blobSizePx: number
    stickyDistancePx: number
    stickyNeckPx: number
    stickyTension: number
    stickyWobble: number
    stickyResponse: number
    expirySeconds: number
    expiryShrinkMs: number
  }
  group: {
    wallThickness: number
    wallGap: number
    wallGrainFrequency: number
    wallGrainOctaves: number
    wallGrainOpacity: number
    attraction: number
    detachThreshold: number
    attachContactThreshold: number
    attachDistancePx: number
    attachHoldMs: number
    cueFrequencyHz: number
    cueCellAmplitudePx: number
    cueWallAmplitudePx: number
    cueStrokeExcitation: number
    cuePhaseOffset: number
    ghostSizePx: number
    ghostRepulsion: number
    ghostResponse: number
    cueEasing: 'smooth' | 'spring' | 'linear'
    motionEasing: 'smooth' | 'spring' | 'direct'
  }
  mergeSplit: {
    enabled: boolean
    newSelect: boolean
    mergeDistancePx: number
    proximityPx: number
    activeZonePx: number
    activeZoneTint: number
    activeZoneGrain: number
    mergeDwellMs: number
    vibrationAttackMs: number
    vibrationEasing: 'smooth' | 'spring' | 'linear'
    cellJitterAmplitudePx: number
    cellJitterFrequencyHz: number
    wallJitterAmplitudePx: number
    wallJitterFrequencyHz: number
    stickySlowdown: number
    longPressMs: number
    splitJitterAttackMs: number
    splitJitterEasing: 'smooth' | 'spring' | 'linear'
    splitJitterAmplitudePx: number
    splitJitterFrequencyHz: number
    splitMin: number
    splitMax: number
  }
  viewTransition: {
    enabled: boolean
    durationMs: number
    blurPx: number
    arcDepth: number
    easing: 'smooth' | 'spring' | 'linear'
  }
  editFocus: {
    trackTransitionEnabled: boolean
    durationMs: number
    blurPx: number
    arcDepth: number
    coverage: number
    easing: 'smooth' | 'spring' | 'linear'
  }
  clustering: {
    autoK: boolean
    minK: number
    maxK: number
    seed: number
    animationMs: number
  }
  adaptiveText: {
    enabled: boolean
    debounceMs: number
    fitMinimumFontSize: number
    fitHysteresis: number
  }
  palette: {
    cellLight: string
    cellMid: string
    cellDark: string
    cellDeep: string
    innerStroke: string
    seam: string
    handles: string
    text: string
    selectedTint: string
    hoverTint: string
    groupTint: string
    group1: string
    group2: string
    group3: string
    group4: string
    group5: string
    group6: string
    group7: string
    group8: string
    interior: string
    exterior: string
  }
}

export const SETTINGS_SCHEMA_VERSION = 16

const VERSION_13_FOCUS_VIGNETTE: VignetteSettings = {
  enabled: true,
  intensity: 0.78,
  dim: 0.56,
  blurRadius: 0.25,
  rimWidth: 0.24,
  softness: 0.08,
  distortion: 0.001,
  grain: 0.018,
}

export const defaultSettings: CanvasSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  effects: {
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
  },
  geometry: {
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
  },
  particles: {
    enabled: true,
    density: 64,
    speed: 0.42,
    orbitRadius: 3.5,
    size: 1.15,
    opacity: 0.28,
    color: '#454b48',
  },
  motion: {
    hoverAmplitude: 0.032,
    hoverPeriodMs: 3360,
    hoverAttackMs: 300,
    morphResponse: 32,
    easing: 'smooth',
    ambientEnabled: true,
    ambientAmplitudePx: 0.58,
    ambientPeriodMs: 6200,
    ambientPhaseSpread: 0.42,
    ambientCoverage: 0.72,
  },
  seed: {
    delayMinMs: 4800,
    delayMaxMs: 12400,
    rate: 0.56,
    growthMs: 8000,
    easing: 'smooth',
    popScale: 1.2,
    maxAlive: 2,
    sizeRatio: 0.125,
    incubationDelayMs: 3000,
    incubationGrowthMs: 2400,
    incubationBlur: 16,
    incubationWigglePx: 0.8,
    incubationWiggleHz: 1.6,
    incubationWiggleEasing: 'spring',
    stickyEnabled: true,
    blobSizePx: 20,
    stickyDistancePx: 92,
    stickyNeckPx: 8,
    stickyTension: 0.58,
    stickyWobble: 0.1,
    stickyResponse: 18,
    expirySeconds: 45,
    expiryShrinkMs: 2200,
  },
  group: {
    wallThickness: 12,
    wallGap: 2,
    wallGrainFrequency: 0.1,
    wallGrainOctaves: 2,
    wallGrainOpacity: 0.74,
    attraction: 0.4,
    detachThreshold: 0.4,
    attachContactThreshold: 2,
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
    motionEasing: 'smooth',
  },
  mergeSplit: {
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
  },
  viewTransition: {
    enabled: true,
    durationMs: 900,
    blurPx: 14,
    arcDepth: 1.8,
    easing: 'smooth',
  },
  editFocus: {
    trackTransitionEnabled: true,
    durationMs: 1100,
    blurPx: 24,
    arcDepth: 1.8,
    coverage: 0.8,
    easing: 'smooth',
  },
  clustering: {
    autoK: true,
    minK: 2,
    maxK: 4,
    seed: 20261109,
    animationMs: 1400,
  },
  adaptiveText: {
    enabled: true,
    debounceMs: 650,
    fitMinimumFontSize: 9.5,
    fitHysteresis: 0.12,
  },
  palette: {
    cellLight: '#e7e8e6',
    cellMid: '#d9dcda',
    cellDark: '#c9cecb',
    cellDeep: '#b9c0bc',
    innerStroke: '#f6f7f5',
    seam: '#171a18',
    handles: '#f7f8f6',
    text: '#343936',
    selectedTint: '#aebdb6',
    hoverTint: '#c6d1cc',
    groupTint: '#849b91',
    group1: '#849b91',
    group2: '#9b8f84',
    group3: '#858fa3',
    group4: '#9a8795',
    group5: '#8fa27e',
    group6: '#a18f72',
    group7: '#788f9b',
    group8: '#9c8278',
    interior: '#2a2e2c',
    exterior: '#000000',
  },
}

export type PalettePresetId =
  | 'baseline'
  | 'botanical-stain'
  | 'chloroplast-amber'
  | 'polarized-tide'
  | 'organelle-night'

export interface PalettePreset {
  id: PalettePresetId
  label: string
  description: string
  palette: CanvasSettings['palette']
}

const baselinePalette = cloneSettings(defaultSettings).palette

export const PALETTE_PRESETS: readonly PalettePreset[] = [
  {
    id: 'baseline',
    label: 'Baseline · Graphite culture',
    description: 'The neutral graphite microscope palette.',
    palette: baselinePalette,
  },
  {
    id: 'botanical-stain',
    label: 'Botanical stain · Cyan / carmine',
    description: 'Warm specimen paper with cyan and carmine histology stains.',
    palette: {
      cellLight: '#f7ead9',
      cellMid: '#f0ddc8',
      cellDark: '#e7cfb9',
      cellDeep: '#dcc1aa',
      innerStroke: '#fff5e9',
      seam: '#35202e',
      handles: '#fff8ee',
      text: '#241922',
      selectedTint: '#89c6c7',
      hoverTint: '#e9b5bd',
      groupTint: '#177f88',
      group1: '#177f88',
      group2: '#a43462',
      group3: '#338c9b',
      group4: '#bd5b76',
      group5: '#5aa3a1',
      group6: '#8c365f',
      group7: '#236f85',
      group8: '#c4717f',
      interior: '#4d263d',
      exterior: '#120d16',
    },
  },
  {
    id: 'chloroplast-amber',
    label: 'Chloroplast amber · Moss / gold',
    description: 'Olive chloroplast forms suspended in amber microscope light.',
    palette: {
      cellLight: '#eee9c9',
      cellMid: '#e4ddb5',
      cellDark: '#d7cea0',
      cellDeep: '#cbc08a',
      innerStroke: '#fff7d7',
      seam: '#252416',
      handles: '#fffbe5',
      text: '#1b2117',
      selectedTint: '#9dad59',
      hoverTint: '#d7c477',
      groupTint: '#61752b',
      group1: '#61752b',
      group2: '#876b32',
      group3: '#5a733f',
      group4: '#9a7c3d',
      group5: '#466d3d',
      group6: '#aa8748',
      group7: '#73883c',
      group8: '#73552f',
      interior: '#332d1d',
      exterior: '#0d0d09',
    },
  },
  {
    id: 'polarized-tide',
    label: 'Polarized tide · Aqua / pearl',
    description: 'Cool aqua cells with the iridescent edges of polarized tissue.',
    palette: {
      cellLight: '#e3f1ed',
      cellMid: '#d3e9e5',
      cellDark: '#c2dedc',
      cellDeep: '#b0d2d2',
      innerStroke: '#f5fffc',
      seam: '#123340',
      handles: '#f2fffd',
      text: '#102a32',
      selectedTint: '#71bbb7',
      hoverTint: '#a7d8d3',
      groupTint: '#267f87',
      group1: '#267f87',
      group2: '#6a65a9',
      group3: '#398d73',
      group4: '#7e5d91',
      group5: '#367fa5',
      group6: '#a3657f',
      group7: '#3f9298',
      group8: '#5e6f9d',
      interior: '#183b49',
      exterior: '#071318',
    },
  },
  {
    id: 'organelle-night',
    label: 'Organelle night · Violet / viridian',
    description: 'A fluorescence-inspired dark field with restrained organelle color.',
    palette: {
      cellLight: '#34434a',
      cellMid: '#303b48',
      cellDark: '#382f46',
      cellDeep: '#282d39',
      innerStroke: '#61736f',
      seam: '#0a0f12',
      handles: '#f7edda',
      text: '#fff2dc',
      selectedTint: '#416f70',
      hoverTint: '#4c5969',
      groupTint: '#498f78',
      group1: '#498f78',
      group2: '#825b9e',
      group3: '#5b8ba5',
      group4: '#9a5d78',
      group5: '#6e985c',
      group6: '#a17a48',
      group7: '#5470a4',
      group8: '#8a617d',
      interior: '#151b20',
      exterior: '#030607',
    },
  },
] as const

export function palettePresetById(id: PalettePresetId) {
  return PALETTE_PRESETS.find((preset) => preset.id === id) ?? PALETTE_PRESETS[0]
}

export function identifyPalettePreset(
  palette: CanvasSettings['palette'],
): PalettePresetId | 'custom' {
  const serialized = JSON.stringify(palette)
  return (
    PALETTE_PRESETS.find((preset) => JSON.stringify(preset.palette) === serialized)?.id ??
    'custom'
  )
}

export function cloneSettings(settings: CanvasSettings = defaultSettings): CanvasSettings {
  return structuredClone(settings)
}

export function groupColorFor(settings: CanvasSettings, order: number) {
  const palette = [
    settings.palette.group1,
    settings.palette.group2,
    settings.palette.group3,
    settings.palette.group4,
    settings.palette.group5,
    settings.palette.group6,
    settings.palette.group7,
    settings.palette.group8,
  ]
  return palette[Math.max(0, order - 1) % palette.length]
}

export function migrateSettings(input?: Partial<CanvasSettings> | null): CanvasSettings {
  const sourceVersion = input?.schemaVersion ?? 0
  if (
    !input ||
    ![2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, SETTINGS_SCHEMA_VERSION].includes(
      sourceVersion,
    )
  ) {
    return cloneSettings(defaultSettings)
  }
  const legacyFocusVignette = input.effects?.focusVignette
  const migrateVersion13FocusDefaults =
    sourceVersion === 13 &&
    legacyFocusVignette !== undefined &&
    Object.entries(VERSION_13_FOCUS_VIGNETTE).every(
      ([key, value]) =>
        legacyFocusVignette[key as keyof VignetteSettings] === value,
    )
  const focusVignetteSource =
    sourceVersion <= 12 && legacyFocusVignette === undefined
      ? input.effects?.vignette
      : migrateVersion13FocusDefaults
        ? undefined
        : legacyFocusVignette
  return {
    ...cloneSettings(defaultSettings),
    ...input,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    effects: {
      circle: { ...defaultSettings.effects.circle, ...input.effects?.circle },
      vignette: { ...defaultSettings.effects.vignette, ...input.effects?.vignette },
      focusVignette: {
        ...defaultSettings.effects.focusVignette,
        ...focusVignetteSource,
      },
      lens: { ...defaultSettings.effects.lens, ...input.effects?.lens },
      crt: { ...defaultSettings.effects.crt, ...input.effects?.crt },
    },
    geometry: { ...defaultSettings.geometry, ...input.geometry },
    particles: { ...defaultSettings.particles, ...input.particles },
    motion: { ...defaultSettings.motion, ...input.motion },
    seed: { ...defaultSettings.seed, ...input.seed },
    group: { ...defaultSettings.group, ...input.group },
    mergeSplit: { ...defaultSettings.mergeSplit, ...input.mergeSplit },
    viewTransition: { ...defaultSettings.viewTransition, ...input.viewTransition },
    editFocus: { ...defaultSettings.editFocus, ...input.editFocus },
    clustering: { ...defaultSettings.clustering, ...input.clustering },
    adaptiveText: { ...defaultSettings.adaptiveText, ...input.adaptiveText },
    palette: { ...defaultSettings.palette, ...input.palette },
  }
}

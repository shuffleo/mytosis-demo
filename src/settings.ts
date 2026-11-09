export interface CanvasSettings {
  schemaVersion: number
  effects: {
    circle: {
      grain: number
    }
    vignette: {
      enabled: boolean
      intensity: number
      dim: number
      blurRadius: number
      rimWidth: number
      softness: number
      distortion: number
      grain: number
    }
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
    attraction: number
    detachThreshold: number
    attachContactThreshold: number
    attachDistancePx: number
    attachHoldMs: number
    motionEasing: 'smooth' | 'spring' | 'direct'
  }
  mergeSplit: {
    enabled: boolean
    newSelect: boolean
    mergeDistancePx: number
    longPressMs: number
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
    durationMs: number
    blurPx: number
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

export const SETTINGS_SCHEMA_VERSION = 9

export const defaultSettings: CanvasSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  effects: {
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
  },
  geometry: {
    innerStrokeWidth: 4.75,
    cornerRadius: 32,
    seamGap: 12,
    outerGap: 32,
    textInset: 24,
    wallGrainEnabled: true,
    wallGrain: 0.65,
    wallGrainFrequency: 0.018,
    wallGrainOctaves: 2,
    wallGrainOpacity: 0.74,
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
    incubationBlur: 8,
    stickyEnabled: true,
    blobSizePx: 20,
    stickyDistancePx: 92,
    stickyNeckPx: 8,
    stickyTension: 0.58,
    stickyWobble: 0.1,
    stickyResponse: 18,
    expirySeconds: 180,
    expiryShrinkMs: 1200,
  },
  group: {
    wallThickness: 12,
    wallGap: 2,
    attraction: 0.32,
    detachThreshold: 0.8,
    attachContactThreshold: 2,
    attachDistancePx: 42,
    attachHoldMs: 720,
    motionEasing: 'smooth',
  },
  mergeSplit: {
    enabled: true,
    newSelect: true,
    mergeDistancePx: 58,
    longPressMs: 720,
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
    durationMs: 720,
    blurPx: 18,
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
  if (
    !input ||
    ![2, 3, 4, 5, 6, 7, 8, SETTINGS_SCHEMA_VERSION].includes(
      input.schemaVersion ?? 0,
    )
  ) {
    return cloneSettings(defaultSettings)
  }
  return {
    ...cloneSettings(defaultSettings),
    ...input,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    effects: {
      circle: { ...defaultSettings.effects.circle, ...input.effects?.circle },
      vignette: { ...defaultSettings.effects.vignette, ...input.effects?.vignette },
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
    palette: { ...defaultSettings.palette, ...input.palette },
  }
}

import { useEffect, useRef } from 'react'
import { Pane } from 'tweakpane'
import type { PostProcessStatus } from './microscope-postprocess'
import { cloneSettings, type CanvasSettings } from './settings'

const CONTROL_HINTS: Record<string, string> = {
  'Canvas configuration': 'Live controls for field geometry, motion, growth, groups, effects, and color.',
  'Microscope effects': 'GPU post-processing applied only to the circular Paper.js field.',
  'Microscope effects — unavailable': 'WebGL2 is unavailable, so the Paper.js fallback stays active.',
  'Whole circle texture': 'Static texture applied uniformly across the circular field.',
  'Microscope vignette': 'Optical blur, dimming, distortion, and grain concentrated at the rim.',
  'Lens shader': 'Centered spherical refraction locked to the field radius.',
  'CRT shader': 'Optional display-era color, curvature, phosphor, and scanline effects.',
  Geometry: 'Cell-wall spacing, rounding, texture, and safe text inset.',
  'Seam nutrients': 'Slow Bakemono-inspired particles orbit just outside cell edges inside seams.',
  'Hover & morph': 'Timing and response of geometry-only breathing and path interpolation.',
  'Auto-growth seeds': 'Controls emergent seed creation, incubation, sticky blobs, and expiry.',
  Groups: 'Hierarchical group walls, tint, attraction, attach, detach, and settling.',
  Autogroup: 'Focused controls for deterministic local TF-IDF clustering.',
  'Experimental merge / split': 'Enables sticky thought composition and long-press decomposition.',
  'View transition': 'Controls the optical zoom-level transition between microscope and list views.',
  'Focused text editing': 'Controls the fixed-lens scene transition used for cell text editing.',
  Palette: 'Live colors for cells, walls, text, states, field, and exterior.',
  renderer: 'Shows whether the GPU microscope renderer is active.',
  enabled: 'Turns this effect or experimental behavior on and off.',
  'whole-circle noise': 'Adds static film grain across the entire circular field.',
  intensity: 'Controls the overall strength of the microscope rim treatment.',
  'rim dim': 'Darkens the outer microscope rim without changing the center.',
  'blur px': 'Blurs pixels near the circular rim by this radius.',
  'rim width': 'Sets how far the vignette reaches inward from the edge.',
  softness: 'Controls how gradually the vignette fades into the clear center.',
  distortion: 'Adds restrained optical warping around the microscope rim.',
  'grain / noise': 'Adds grain only to the vignette rim.',
  shape: 'The lens remains a centered sphere matched to the circular field.',
  refraction: 'Bends the displayed canvas radially through the lens.',
  aberration: 'Offsets red and blue channels to simulate chromatic aberration.',
  frost: 'Softens the lens image with a small GPU blur.',
  glow: 'Adds highlight bloom and a brighter glass-like Fresnel edge.',
  'glow radius px': 'Sets how far the lens bloom spreads around bright edges.',
  'phosphor + scanlines': 'Enables CRT phosphor masking and scanlines together.',
  phosphor: 'Sets the density of the CRT phosphor color mask.',
  scanlines: 'Controls horizontal CRT scanline darkness.',
  'color shift': 'Offsets color channels while leaving phosphor optional.',
  bulge: 'Adds CRT-style radial curvature.',
  'inner stroke': 'Sets the true clipped inner wall stroke width.',
  'corner radius': 'Rounds cell corners after power-diagram tessellation.',
  'seam gap': 'Sets the open spacing between neighboring cells.',
  'outer gap': 'Sets the breathing room between cells and the circle edge.',
  'text inset': 'Keeps wrapped text this far from every cell boundary.',
  'wall grain': 'Controls turbulence displacement on cell and group walls.',
  'grain enabled': 'Enables the pre-shader pencil texture for cell and group walls.',
  'grain frequency': 'Sets the spatial scale of the wall grain.',
  'grain detail': 'Sets the number of noise octaves used by the pencil texture.',
  'grain opacity': 'Sets the opacity of the pre-shader wall texture.',
  'nutrients enabled': 'Shows or hides seam particles without changing geometry.',
  'particles per cell': 'Sets the restrained number of orbiting particles around each cell.',
  'particle speed': 'Sets particle angular speed; the default is roughly ten times slower than the reference.',
  'orbit radius': 'Sets how far particles wander around their boundary anchor.',
  'particle size': 'Sets the nutrient dot radius.',
  'particle opacity': 'Sets how dim the nutrient particles appear.',
  'particle color': 'Sets the dark seam-particle color.',
  amplitude: 'Sets how much hovered cell geometry breathes; text does not scale.',
  'period ms': 'Sets the duration of one complete hover-breath cycle.',
  'attack ms': 'Sets how quickly hover breathing reaches full strength.',
  response: 'Controls how quickly Paper.js paths follow new geometry.',
  easing: 'Chooses the interpolation curve used by motion.',
  'delay min': 'Minimum randomized wait before automatic seed spawning.',
  'delay max': 'Maximum randomized wait before automatic seed spawning.',
  'spawn rate': 'Scales how frequently valid Delaunay gaps produce seeds.',
  'growth ms': 'Sets how long a seed grows to its initial size.',
  pop: 'Sets the responsive hover scale of an unexpanded seed.',
  'max alive': 'Limits how many unexpanded seeds can coexist.',
  'seed size': 'Initial seed weight as a ratio of its source-cell average.',
  'incubate delay': 'Rest time before an untouched empty cell synthesizes text.',
  'text emerge': 'Duration of the blurred incubation text reveal.',
  'text blur': 'Blur applied while incubated text remains unrevealed.',
  'sticky blobs': 'Shows organic bridges for seeds, merge targets, and armed group attachment.',
  'blob size px': 'Sets the initial visible seed diameter.',
  'sticky reach': 'Maximum gap over which a sticky bridge remains connected.',
  'neck width': 'Sets sticky bridge thickness.',
  'neck tension': 'Controls how strongly bridge curves pull toward their cells.',
  wobble: 'Adds restrained organic motion to sticky bridges.',
  'expiry seconds': 'Untouched seeds begin dying after this time.',
  'expiry shrink ms': 'Sets the duration of the seed death animation.',
  'wall thickness': 'Sets the organic group-container wall width.',
  'wall gap': 'Adds clearance between a group wall and its member tessellation.',
  attraction: 'Controls how strongly group members settle toward their slots.',
  detach: 'Distance a member must cross before leaving its group.',
  motion: 'Chooses the group settling curve.',
  'attach contacts': 'Required member contacts before a dragged cell joins a group.',
  'attach reach': 'Distance from a group wall where a held cell can begin a sticky attachment.',
  'attach hold ms': 'How long a cell must rest by a group wall before the sticky bridge arms.',
  'automatic groups': 'Lets silhouette scoring choose the clustering count.',
  'minimum groups': 'Lowest group count considered during automatic clustering.',
  'maximum groups': 'Highest group count considered during automatic clustering.',
  'deterministic seed': 'Makes local k-means assignments repeatable.',
  'settle duration': 'Sets how long new algorithmic groups visibly settle.',
  'merge distance': 'How close compatible cells must be before they merge.',
  'New Select': 'Moves merge and split into Select and hides the separate Merge / Split tool.',
  'split hold ms': 'How long to hold a cell before splitting it.',
  'split minimum': 'Minimum number of thoughts created by a split.',
  'split maximum': 'Maximum number of thoughts created by a split.',
  'transition enabled': 'Turns the microscope-to-list optical transition on or off.',
  'duration ms': 'Sets the total fade, blur, and circular-track transition time.',
  'maximum blur': 'Sets the peak blur while the view fades through black.',
  'arc depth': 'Moves the circular track centroid farther below the viewport.',
  'transition easing': 'Chooses the timing curve for blur, fade, and orbital slide.',
  'focused scene transition': 'Slides focused content along the microscope orbital track; turn off to keep the original zoom.',
  'focus duration ms': 'Sets the forward and reverse focused-editor transition duration.',
  'focus blur px': 'Sets the peak scene blur while the fixed microscope optics remain sharp.',
  'focus arc depth': 'Moves the focused-scene circular track centroid below the viewport.',
  'focus coverage': 'Sets how much of the microscope circle the focused cell occupies.',
  'focus easing': 'Chooses the focused editing camera timing curve.',
  'Add seed': 'Immediately creates one valid auto-growth seed for auditing.',
  'Die seed': 'Starts the death animation of the oldest unexpanded seed.',
  'Reset defaults': 'Restores every control to the current reference defaults.',
}

function controlHint(label: string) {
  return CONTROL_HINTS[label] ?? `${label} updates the canvas immediately.`
}

interface ControlPanelProps {
  settings: CanvasSettings
  postProcessingStatus: PostProcessStatus | 'checking'
  onChange: (settings: CanvasSettings) => void
  onAddSeed: () => void
  onDieSeed: () => void
}

export function ControlPanel({
  settings,
  postProcessingStatus,
  onChange,
  onAddSeed,
  onDieSeed,
}: ControlPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  const onAddSeedRef = useRef(onAddSeed)
  const onDieSeedRef = useRef(onDieSeed)
  const initialSettingsRef = useRef(settings)

  useEffect(() => {
    onChangeRef.current = onChange
    onAddSeedRef.current = onAddSeed
    onDieSeedRef.current = onDieSeed
  }, [onAddSeed, onChange, onDieSeed])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const params = cloneSettings(initialSettingsRef.current)
    const pane = new Pane({ container, title: 'Canvas configuration', expanded: true })
    const emitSettings = () => {
      const next = cloneSettings(params)
      next.geometry.wallGrain = Number(next.geometry.wallGrain.toFixed(3))
      next.effects.circle.grain = Number(next.effects.circle.grain.toFixed(4))
      onChangeRef.current(next)
    }

    const microscope = pane.addFolder({
      title:
        postProcessingStatus === 'fallback'
          ? 'Microscope effects — unavailable'
          : 'Microscope effects',
      expanded: true,
    })
    microscope.disabled = postProcessingStatus === 'fallback'
    const renderer = {
      status:
        postProcessingStatus === 'live'
          ? 'WebGL2'
          : postProcessingStatus === 'fallback'
            ? 'Disabled'
            : 'Checking',
    }
    microscope.addBinding(renderer, 'status', { label: 'renderer', readonly: true })

    const circleTexture = microscope.addFolder({ title: 'Whole circle texture', expanded: true })
    circleTexture.addBinding(params.effects.circle, 'grain', {
      label: 'whole-circle noise',
      min: 0,
      max: 0.08,
      step: 0.001,
    })

    const vignette = microscope.addFolder({ title: 'Microscope vignette', expanded: true })
    vignette.addBinding(params.effects.vignette, 'enabled', { label: 'enabled' })
    vignette.addBinding(params.effects.vignette, 'intensity', {
      label: 'intensity',
      min: 0,
      max: 1,
      step: 0.01,
    })
    vignette.addBinding(params.effects.vignette, 'dim', {
      label: 'rim dim',
      min: 0,
      max: 0.8,
      step: 0.01,
    })
    vignette.addBinding(params.effects.vignette, 'blurRadius', {
      label: 'blur px',
      min: 0,
      max: 12,
      step: 0.25,
    })
    vignette.addBinding(params.effects.vignette, 'rimWidth', {
      label: 'rim width',
      min: 0.04,
      max: 0.35,
      step: 0.01,
    })
    vignette.addBinding(params.effects.vignette, 'softness', {
      label: 'softness',
      min: 0.01,
      max: 0.24,
      step: 0.01,
    })
    vignette.addBinding(params.effects.vignette, 'distortion', {
      label: 'distortion',
      min: 0,
      max: 0.03,
      step: 0.001,
    })
    vignette.addBinding(params.effects.vignette, 'grain', {
      label: 'grain / noise',
      min: 0,
      max: 0.08,
      step: 0.001,
    })

    const lens = microscope.addFolder({ title: 'Lens shader', expanded: true })
    lens.addBinding(params.effects.lens, 'enabled', { label: 'enabled' })
    lens.addBinding(params.effects.lens, 'shape', { label: 'shape', readonly: true })
    lens.addBinding(params.effects.lens, 'refraction', {
      label: 'refraction',
      min: 0,
      max: 0.4,
      step: 0.01,
    })
    lens.addBinding(params.effects.lens, 'aberration', {
      label: 'aberration',
      min: 0,
      max: 4,
      step: 0.05,
    })
    lens.addBinding(params.effects.lens, 'frost', {
      label: 'frost',
      min: 0,
      max: 6,
      step: 0.1,
    })
    lens.addBinding(params.effects.lens, 'glow', {
      label: 'glow',
      min: 0,
      max: 0.5,
      step: 0.01,
    })
    lens.addBinding(params.effects.lens, 'glowRadius', {
      label: 'glow radius px',
      min: 0,
      max: 12,
      step: 0.25,
    })

    const crt = microscope.addFolder({ title: 'CRT shader', expanded: false })
    crt.addBinding(params.effects.crt, 'enabled', { label: 'enabled' })
    crt.addBinding(params.effects.crt, 'phosphorScanlinesEnabled', {
      label: 'phosphor + scanlines',
    })
    crt.addBinding(params.effects.crt, 'phosphor', {
      label: 'phosphor',
      min: 20,
      max: 160,
      step: 1,
    })
    crt.addBinding(params.effects.crt, 'scanlines', {
      label: 'scanlines',
      min: 0,
      max: 1,
      step: 0.01,
    })
    crt.addBinding(params.effects.crt, 'colorShift', {
      label: 'color shift',
      min: 0,
      max: 2,
      step: 0.01,
    })
    crt.addBinding(params.effects.crt, 'bulge', {
      label: 'bulge',
      min: 0,
      max: 0.5,
      step: 0.01,
    })

    const geometry = pane.addFolder({ title: 'Geometry', expanded: true })
    geometry.addBinding(params.geometry, 'innerStrokeWidth', {
      label: 'inner stroke',
      min: 1,
      max: 8,
      step: 0.25,
    })
    geometry.addBinding(params.geometry, 'cornerRadius', {
      label: 'corner radius',
      min: 4,
      max: 32,
      step: 1,
    })
    geometry.addBinding(params.geometry, 'seamGap', {
      label: 'seam gap',
      min: 4,
      max: 20,
      step: 0.5,
    })
    geometry.addBinding(params.geometry, 'outerGap', {
      label: 'outer gap',
      min: 20,
      max: 64,
      step: 1,
    })
    geometry.addBinding(params.geometry, 'textInset', {
      label: 'text inset',
      min: 6,
      max: 24,
      step: 1,
    })
    geometry.addBinding(params.geometry, 'wallGrain', {
      label: 'wall grain',
      min: 0,
      max: 2.5,
      step: 0.01,
    })
    geometry.addBinding(params.geometry, 'wallGrainEnabled', { label: 'grain enabled' })
    geometry.addBinding(params.geometry, 'wallGrainFrequency', {
      label: 'grain frequency',
      min: 0.002,
      max: 0.08,
      step: 0.001,
    })
    geometry.addBinding(params.geometry, 'wallGrainOctaves', {
      label: 'grain detail',
      min: 1,
      max: 4,
      step: 1,
    })
    geometry.addBinding(params.geometry, 'wallGrainOpacity', {
      label: 'grain opacity',
      min: 0,
      max: 1,
      step: 0.01,
    })

    const particles = pane.addFolder({ title: 'Seam nutrients', expanded: false })
    particles.addBinding(params.particles, 'enabled', { label: 'nutrients enabled' })
    particles.addBinding(params.particles, 'density', {
      label: 'particles per cell',
      min: 0,
      max: 128,
      step: 1,
    })
    particles.addBinding(params.particles, 'speed', {
      label: 'particle speed',
      min: 0.02,
      max: 1.5,
      step: 0.01,
    })
    particles.addBinding(params.particles, 'orbitRadius', {
      label: 'orbit radius',
      min: 0,
      max: 10,
      step: 0.25,
    })
    particles.addBinding(params.particles, 'size', {
      label: 'particle size',
      min: 0.5,
      max: 3,
      step: 0.1,
    })
    particles.addBinding(params.particles, 'opacity', {
      label: 'particle opacity',
      min: 0,
      max: 0.75,
      step: 0.01,
    })
    particles.addBinding(params.particles, 'color', { label: 'particle color' })

    const motion = pane.addFolder({ title: 'Hover + morph', expanded: false })
    motion.addBinding(params.motion, 'hoverAmplitude', {
      label: 'amplitude',
      min: 0,
      max: 0.04,
      step: 0.001,
    })
    motion.addBinding(params.motion, 'hoverPeriodMs', {
      label: 'period ms',
      min: 1600,
      max: 6000,
      step: 80,
    })
    motion.addBinding(params.motion, 'hoverAttackMs', {
      label: 'attack ms',
      min: 100,
      max: 700,
      step: 10,
    })
    motion.addBinding(params.motion, 'morphResponse', {
      label: 'response',
      min: 12,
      max: 48,
      step: 1,
    })
    motion.addBinding(params.motion, 'easing', {
      label: 'easing',
      options: { Smooth: 'smooth', Spring: 'spring', Direct: 'direct' },
    })

    const seed = pane.addFolder({ title: 'Auto-growth seeds', expanded: false })
    seed.addBinding(params.seed, 'delayMinMs', {
      label: 'delay min',
      min: 2000,
      max: 9000,
      step: 100,
    })
    seed.addBinding(params.seed, 'delayMaxMs', {
      label: 'delay max',
      min: 6000,
      max: 20000,
      step: 100,
    })
    seed.addBinding(params.seed, 'rate', {
      label: 'spawn rate',
      min: 0.1,
      max: 1,
      step: 0.05,
    })
    seed.addBinding(params.seed, 'growthMs', {
      label: 'growth ms',
      min: 3000,
      max: 14000,
      step: 100,
    })
    seed.addBinding(params.seed, 'easing', {
      label: 'easing',
      options: { Smooth: 'smooth', Spring: 'spring', Linear: 'linear' },
    })
    seed.addBinding(params.seed, 'popScale', {
      label: 'pop',
      min: 1,
      max: 1.5,
      step: 0.01,
    })
    seed.addBinding(params.seed, 'maxAlive', {
      label: 'max alive',
      min: 1,
      max: 4,
      step: 1,
    })
    seed.addBinding(params.seed, 'sizeRatio', {
      label: 'seed size',
      min: 0.0625,
      max: 0.25,
      step: 0.0125,
    })
    seed.addBinding(params.seed, 'incubationDelayMs', {
      label: 'incubate delay',
      min: 1000,
      max: 8000,
      step: 250,
    })
    seed.addBinding(params.seed, 'incubationGrowthMs', {
      label: 'text emerge',
      min: 600,
      max: 6000,
      step: 100,
    })
    seed.addBinding(params.seed, 'incubationBlur', {
      label: 'text blur',
      min: 0,
      max: 16,
      step: 0.5,
    })
    seed.addBinding(params.seed, 'stickyEnabled', {
      label: 'sticky blobs',
    })
    seed.addBinding(params.seed, 'blobSizePx', {
      label: 'blob size px',
      min: 12,
      max: 36,
      step: 1,
    })
    seed.addBinding(params.seed, 'stickyDistancePx', {
      label: 'sticky reach',
      min: 32,
      max: 160,
      step: 2,
    })
    seed.addBinding(params.seed, 'stickyNeckPx', {
      label: 'neck width',
      min: 2,
      max: 24,
      step: 1,
    })
    seed.addBinding(params.seed, 'stickyTension', {
      label: 'neck tension',
      min: 0.1,
      max: 0.9,
      step: 0.01,
    })
    seed.addBinding(params.seed, 'stickyWobble', {
      label: 'wobble',
      min: 0,
      max: 0.4,
      step: 0.01,
    })
    seed.addBinding(params.seed, 'stickyResponse', {
      label: 'response',
      min: 4,
      max: 32,
      step: 1,
    })
    seed.addBinding(params.seed, 'expirySeconds', {
      label: 'expiry seconds',
      min: 10,
      max: 600,
      step: 10,
      format: (value) => (value >= 60 ? `${value / 60} min` : `${value} sec`),
    })
    seed.addBinding(params.seed, 'expiryShrinkMs', {
      label: 'expiry shrink ms',
      min: 300,
      max: 3000,
      step: 100,
    })
    const addSeedButton = seed
      .addButton({ title: 'Add seed' })
      .on('click', () => onAddSeedRef.current())
    const dieSeedButton = seed
      .addButton({ title: 'Die seed' })
      .on('click', () => onDieSeedRef.current())
    const seedActions = document.createElement('div')
    seedActions.className = 'seed-action-row'
    addSeedButton.element.before(seedActions)
    seedActions.append(addSeedButton.element, dieSeedButton.element)

    const group = pane.addFolder({ title: 'Groups', expanded: false })
    group.addBinding(params.group, 'wallThickness', {
      label: 'wall thickness',
      min: 4,
      max: 24,
      step: 1,
    })
    group.addBinding(params.group, 'wallGap', {
      label: 'wall gap',
      min: 0,
      max: 12,
      step: 1,
    })
    group.addBinding(params.group, 'attraction', {
      label: 'attraction',
      min: 0.1,
      max: 0.7,
      step: 0.01,
    })
    group.addBinding(params.group, 'detachThreshold', {
      label: 'detach',
      min: 0.4,
      max: 1.2,
      step: 0.01,
    })
    group.addBinding(params.group, 'motionEasing', {
      label: 'motion',
      options: { Smooth: 'smooth', Spring: 'spring', Direct: 'direct' },
    })
    group.addBinding(params.group, 'attachContactThreshold', {
      label: 'attach contacts',
      min: 1,
      max: 4,
      step: 1,
    })
    group.addBinding(params.group, 'attachDistancePx', {
      label: 'attach reach',
      min: 12,
      max: 90,
      step: 1,
    })
    group.addBinding(params.group, 'attachHoldMs', {
      label: 'attach hold ms',
      min: 120,
      max: 1800,
      step: 20,
    })

    const clustering = pane.addFolder({ title: 'Autogroup', expanded: false })
    clustering.addBinding(params.clustering, 'autoK', { label: 'automatic groups' })
    clustering.addBinding(params.clustering, 'minK', {
      label: 'minimum groups',
      min: 2,
      max: 6,
      step: 1,
    })
    clustering.addBinding(params.clustering, 'maxK', {
      label: 'maximum groups',
      min: 2,
      max: 8,
      step: 1,
    })
    clustering.addBinding(params.clustering, 'seed', {
      label: 'deterministic seed',
      min: 1,
      max: 99_999_999,
      step: 1,
    })
    clustering.addBinding(params.clustering, 'animationMs', {
      label: 'settle duration',
      min: 400,
      max: 4000,
      step: 100,
    })

    const mergeSplit = pane.addFolder({ title: 'Experimental merge / split', expanded: false })
    mergeSplit.addBinding(params.mergeSplit, 'enabled', { label: 'enabled' })
    mergeSplit.addBinding(params.mergeSplit, 'newSelect', { label: 'New Select' })
    mergeSplit.addBinding(params.mergeSplit, 'mergeDistancePx', {
      label: 'merge distance',
      min: 24,
      max: 120,
      step: 2,
    })
    mergeSplit.addBinding(params.mergeSplit, 'longPressMs', {
      label: 'split hold ms',
      min: 400,
      max: 1400,
      step: 20,
    })
    mergeSplit.addBinding(params.mergeSplit, 'splitMin', {
      label: 'split minimum',
      min: 2,
      max: 4,
      step: 1,
    })
    mergeSplit.addBinding(params.mergeSplit, 'splitMax', {
      label: 'split maximum',
      min: 2,
      max: 4,
      step: 1,
    })

    const viewTransition = pane.addFolder({ title: 'View transition', expanded: false })
    viewTransition.addBinding(params.viewTransition, 'enabled', {
      label: 'transition enabled',
    })
    viewTransition.addBinding(params.viewTransition, 'durationMs', {
      label: 'duration ms',
      min: 300,
      max: 1800,
      step: 50,
    })
    viewTransition.addBinding(params.viewTransition, 'blurPx', {
      label: 'maximum blur',
      min: 0,
      max: 28,
      step: 1,
    })
    viewTransition.addBinding(params.viewTransition, 'arcDepth', {
      label: 'arc depth',
      min: 1.2,
      max: 3,
      step: 0.1,
    })
    viewTransition.addBinding(params.viewTransition, 'easing', {
      label: 'transition easing',
      options: { Smooth: 'smooth', Spring: 'spring', Linear: 'linear' },
    })

    const editFocus = pane.addFolder({ title: 'Focused text editing', expanded: false })
    editFocus.addBinding(params.editFocus, 'trackTransitionEnabled', {
      label: 'focused scene transition',
    })
    editFocus.addBinding(params.editFocus, 'durationMs', {
      label: 'focus duration ms',
      min: 180,
      max: 1600,
      step: 20,
    })
    editFocus.addBinding(params.editFocus, 'blurPx', {
      label: 'focus blur px',
      min: 0,
      max: 42,
      step: 1,
    })
    editFocus.addBinding(params.editFocus, 'arcDepth', {
      label: 'focus arc depth',
      min: 1.2,
      max: 3,
      step: 0.1,
    })
    editFocus.addBinding(params.editFocus, 'coverage', {
      label: 'focus coverage',
      min: 0.62,
      max: 0.9,
      step: 0.01,
    })
    editFocus.addBinding(params.editFocus, 'easing', {
      label: 'focus easing',
      options: { Smooth: 'smooth', Spring: 'spring', Linear: 'linear' },
    })

    const palette = pane.addFolder({ title: 'Palette', expanded: false })
    const colorBindings: Array<[keyof CanvasSettings['palette'], string]> = [
      ['cellLight', 'cell light'],
      ['cellMid', 'cell mid'],
      ['cellDark', 'cell dark'],
      ['cellDeep', 'cell deep'],
      ['innerStroke', 'inner walls'],
      ['seam', 'seams'],
      ['handles', 'handles'],
      ['text', 'text'],
      ['selectedTint', 'selected'],
      ['hoverTint', 'hover'],
      ['groupTint', 'group'],
      ['group1', 'group color 1'],
      ['group2', 'group color 2'],
      ['group3', 'group color 3'],
      ['group4', 'group color 4'],
      ['group5', 'group color 5'],
      ['group6', 'group color 6'],
      ['group7', 'group color 7'],
      ['group8', 'group color 8'],
      ['interior', 'interior field'],
      ['exterior', 'exterior'],
    ]
    for (const [key, label] of colorBindings) {
      palette.addBinding(params.palette, key, { label })
    }

    pane.addButton({ title: 'Reset defaults' }).on('click', () => {
      const defaults = cloneSettings()
      Object.assign(params.effects.vignette, defaults.effects.vignette)
      Object.assign(params.effects.lens, defaults.effects.lens)
      Object.assign(params.effects.crt, defaults.effects.crt)
      Object.assign(params.effects.circle, defaults.effects.circle)
      Object.assign(params.geometry, defaults.geometry)
      Object.assign(params.particles, defaults.particles)
      Object.assign(params.motion, defaults.motion)
      Object.assign(params.seed, defaults.seed)
      Object.assign(params.group, defaults.group)
      Object.assign(params.mergeSplit, defaults.mergeSplit)
      Object.assign(params.viewTransition, defaults.viewTransition)
      Object.assign(params.editFocus, defaults.editFocus)
      Object.assign(params.clustering, defaults.clustering)
      Object.assign(params.palette, defaults.palette)
      params.schemaVersion = defaults.schemaVersion
      pane.refresh()
      emitSettings()
    })
    pane.on('change', emitSettings)

    for (const row of container.querySelectorAll<HTMLElement>('.tp-lblv')) {
      const label = row.querySelector<HTMLElement>('.tp-lblv_l')?.textContent?.trim()
      if (!label) continue
      for (const input of row.querySelectorAll<HTMLElement>('input, select')) {
        input.setAttribute('aria-label', label)
      }
    }
    for (const element of container.querySelectorAll<HTMLElement>(
      '.tp-lblv_l, .tp-fldv_b, .tp-btnv_b, .tp-rotv_t',
    )) {
      const label = element.textContent?.trim()
      if (!label) continue
      const hint = controlHint(label)
      element.title = hint
      element.setAttribute('aria-description', hint)
    }
    return () => pane.dispose()
  }, [postProcessingStatus])

  return (
    <div className="control-panel-stack" data-testid="settings-panel">
      <div ref={containerRef} className="tweakpane-host" />
    </div>
  )
}

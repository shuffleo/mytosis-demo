import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

interface Point2 {
  x: number
  y: number
}

function polygonArea(points: readonly Point2[]) {
  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    twiceArea += current.x * next.y - next.x * current.y
  }
  return Math.abs(twiceArea) / 2
}

function polygonCentroid(points: readonly Point2[]) {
  let twiceArea = 0
  let x = 0
  let y = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const cross = current.x * next.y - next.x * current.y
    twiceArea += cross
    x += (current.x + next.x) * cross
    y += (current.y + next.y) * cross
  }
  if (Math.abs(twiceArea) < 1e-6) return points[0] ?? { x: 0, y: 0 }
  return {
    x: x / (3 * twiceArea),
    y: y / (3 * twiceArea),
  }
}

interface Cell {
  id: string
  text: string
  textVariants?: {
    sourceHash: string
    status: string
    values: { S: string; XS: string; XXS: string }
    provenance: string
    error?: string
  }
  site: Point2
  weight: number
  kind: 'journal' | 'seed'
  groupId?: string
  creation: { sourceCellIds?: string[]; promoted: boolean }
  transformation?: { kind: 'merge' | 'split'; sourceIds: string[] }
  incubation: {
    state: 'empty' | 'incubating' | 'revealed'
    sourceIds: string[]
    generatedText?: string
  }
}

interface Snapshot {
  mode: 'add' | 'select' | 'group' | 'merge'
  cellCount: number
  previewId: string | null
  hoveredId: string | null
  selectedId: string | null
  selectedIds: string[]
  selectionMode: 'single' | 'multi'
  selectedGroupId: string | null
  editingId: string | null
  acquiringGroupId: string | null
  model: {
    cells: Cell[]
    relationships: Array<{ sourceId: string; targetId: string; provenance: string }>
    groups: Array<{
      id: string
      memberIds: string[]
      container: { site: Point2; weight: number }
      style: { tint: string }
    }>
  }
  cells: Record<string, Point2[]>
  handles: Point2[]
  groupWalls: Record<string, Point2[]>
  groupWallEffects: Record<string, { strokeWidth: number }>
  breathScales: Record<string, { cell: number; text: number }>
  seedProgress: Record<string, number>
  incubationProgress: Record<string, number>
  groupContainers: Record<string, Point2[]>
  innerStrokes: Record<
    string,
    { closed: boolean; dashCount: number; strokeWidth: number; pointCount: number }
  >
  textRequirements: Record<string, { requiredArea: number; actualArea: number; fits: boolean }>
  textEffects: Record<
    string,
    { blur: number; scale: number; opacity: number; visible: boolean; incubationState: string }
  >
  textLayouts: Record<
    string,
    {
      engine: 'pretext' | 'fallback'
      lineCount: number
      variant: 'M' | 'S' | 'XS' | 'XXS'
      content: string
    }
  >
  stickyBridges: number
  mergeCandidateId: string | null
  groupCue: {
    kind: 'join' | 'detach'
    cellId: string
    groupId: string
    strength: number
    ghostStrength: number
  } | null
  history: { undoDepth: number; redoDepth: number }
  gesture: {
    kind: string
    pendingDetach?: boolean
    attachCandidateGroupId?: string | null
    attachArmedGroupId?: string | null
  } | null
  performance: {
    canvasNotifications: number
    resizeCount: number
    lastChecksum: number
    dynamic: boolean
  }
  crowdingScale: number
  field: { center: Point2; radius: number; outerRadius: number }
  settings: {
    schemaVersion: number
    effects: {
      circle: {
        grain: number
        edgeFeatherPx: number
        focusEdgeFeatherPx: number
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
      focusVignette: {
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
      seamGap: number
      cornerRadius: number
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
    }
    seed: {
      delayMinMs: number
      delayMaxMs: number
      rate: number
      growthMs: number
      popScale: number
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
      trackTransitionEnabled: boolean
      durationMs: number
      blurPx: number
      arcDepth: number
      coverage: number
      easing: 'smooth' | 'spring' | 'linear'
    }
    adaptiveText: {
      enabled: boolean
      debounceMs: number
      fitMinimumFontSize: number
      fitHysteresis: number
    }
    palette: {
      group1: string
      group2: string
      group3: string
      group4: string
      group5: string
      group6: string
      group7: string
      group8: string
    }
  }
}

interface PostProcessSnapshot {
  status: 'live' | 'fallback'
  active: boolean
  uploadCount: number
  renderCount: number
  outputWidth: number
  outputHeight: number
  sourceIncludesPaperText: true
  sourceIncludesWallTexture: true
  wallCompositeMode: 'pre-shader' | 'fallback-overlay'
  pointerEvents: string
  field: { width: number; height: number; center: Point2; radius: number }
  focusScene: {
    scale: number
    translate: Point2
    orbitAngle: number
    orbitScale: number
    orbitOrigin: Point2
    blurPx: number
    opacity: number
  }
  edgeFeatherPx: number
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    if (!window.__VORONOI_DEBUG__) throw new Error('Voronoi debug bridge is unavailable')
    return window.__VORONOI_DEBUG__.snapshot() as Snapshot
  })
}

async function postProcessSnapshot(page: Page): Promise<PostProcessSnapshot> {
  return page.evaluate(() => {
    const state = window.__VORONOI_DEBUG__?.postProcess()
    if (!state) throw new Error('Post-process debug bridge is unavailable')
    return state
  })
}

async function alignedSceneSnapshot(
  page: Page,
): Promise<{ canvas: Snapshot; postProcess: PostProcessSnapshot }> {
  return page.evaluate(() => {
    const debug = window.__VORONOI_DEBUG__
    const postProcess = debug?.postProcess()
    if (!debug || !postProcess) throw new Error('Voronoi debug bridge is unavailable')
    return {
      canvas: debug.snapshot() as Snapshot,
      postProcess,
    }
  })
}

async function visiblePointForSource(page: Page, source: Point2) {
  let visible = { ...source }
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const mapped = await page.evaluate(
      (point) => window.__VORONOI_DEBUG__?.mapPostProcessPoint(point) ?? point,
      visible,
    )
    visible = {
      x: visible.x + source.x - mapped.x,
      y: visible.y + source.y - mapped.y,
    }
  }
  return visible
}

function maximumDisplacement(before: readonly Point2[], after: readonly Point2[]) {
  return Math.max(
    ...before.map((point, index) => {
      const next = after[index]
      return next ? Math.hypot(next.x - point.x, next.y - point.y) : 0
    }),
  )
}

function pointInPolygon(point: Point2, polygon: readonly Point2[]) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index]
    const prior = polygon[previous]
    if (
      current.y > point.y !== prior.y > point.y &&
      point.x <
        ((prior.x - current.x) * (point.y - current.y)) /
          (prior.y - current.y || Number.EPSILON) +
          current.x
    ) {
      inside = !inside
    }
  }
  return inside
}

function maximumEdgeLength(points: readonly Point2[]) {
  return Math.max(
    ...points.map((point, index) => {
      const next = points[(index + 1) % points.length]
      return Math.hypot(next.x - point.x, next.y - point.y)
    }),
  )
}

async function sitePoint(page: Page, cellId: string) {
  const state = await snapshot(page)
  const cell = state.model.cells.find((candidate) => candidate.id === cellId)
  if (!cell) throw new Error(`Missing site ${cellId}`)
  return visiblePointForSource(page, {
    x: state.field.center.x + cell.site.x * state.field.radius,
    y: state.field.center.y + cell.site.y * state.field.radius,
  })
}

async function groupCells(page: Page, cellIds: readonly string[]) {
  await page.getByTestId('tool-select').click()
  await page.keyboard.down('Shift')
  try {
    for (const cellId of cellIds) {
      const point = await sitePoint(page, cellId)
      await page.mouse.click(point.x, point.y)
    }
  } finally {
    await page.keyboard.up('Shift')
  }
  await expect(page.getByTestId('tool-group')).toBeVisible()
  await page.getByTestId('tool-group').click()
  await expect(page.getByTestId('autogroup-toggle')).toBeVisible()
}

async function cellVisualPoint(page: Page, cellId: string) {
  const state = await snapshot(page)
  const polygon = state.cells[cellId]
  if (!polygon?.length) throw new Error(`Missing rendered cell ${cellId}`)
  const source = polygon.reduce(
    (sum, point) => ({
      x: sum.x + point.x / polygon.length,
      y: sum.y + point.y / polygon.length,
    }),
    { x: 0, y: 0 },
  )
  return visiblePointForSource(page, source)
}

function wallPoint(state: Snapshot, groupId: string) {
  const wall = state.groupWalls[groupId]
  if (!wall?.length) throw new Error(`Missing wall ${groupId}`)
  const center = wall.reduce(
    (sum, point) => ({ x: sum.x + point.x / wall.length, y: sum.y + point.y / wall.length }),
    { x: 0, y: 0 },
  )
  const extreme = wall.reduce((farthest, point) =>
    Math.hypot(point.x - center.x, point.y - center.y) >
    Math.hypot(farthest.x - center.x, farthest.y - center.y)
      ? point
      : farthest,
  )
  return {
    x: extreme.x * 0.96 + center.x * 0.04,
    y: extreme.y * 0.96 + center.y * 0.04,
  }
}

async function setNumericBinding(page: Page, label: string, value: number) {
  const bindingLabel = page.getByTestId('settings-panel').getByText(label, { exact: true })
  const input = bindingLabel.locator('..').locator('input')
  await input.fill(String(value))
  await input.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?view=microscope')
  await expect(page.getByTestId('voronoi-canvas')).toBeVisible()
  await page.waitForTimeout(650)
})

test('uses exact microscope defaults and composites Paper text below sharp UI', async ({ page }) => {
  const state = await snapshot(page)
  expect(state.settings.schemaVersion).toBe(16)
  expect(state.settings.adaptiveText).toEqual({
    enabled: true,
    debounceMs: 650,
    fitMinimumFontSize: 9.5,
    fitHysteresis: 0.12,
  })
  expect(state.settings.effects).toEqual({
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

  const post = await postProcessSnapshot(page)
  expect(post.status).toBe('live')
  expect(post.active).toBe(true)
  expect(post.sourceIncludesPaperText).toBe(true)
  expect(post.pointerEvents).toBe('none')
  expect(post.field.radius).toBeCloseTo(state.field.outerRadius, 5)
  const sourceBox = await page.getByTestId('voronoi-canvas').boundingBox()
  const outputBox = await page.getByTestId('microscope-canvas').boundingBox()
  expect(outputBox).toEqual(sourceBox)

  await page.getByTestId('tool-select').click()
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('settings-toggle').click()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
  await page.getByRole('button', { name: 'Adaptive text', exact: true }).click()
  await expect(page.getByLabel('local generation')).toBeChecked()
  await expect(page.getByLabel('edit debounce ms')).toHaveValue('650')
  expect(Number(await page.getByLabel('fit font floor').inputValue())).toBe(9.5)
  expect(Number(await page.getByLabel('fit hysteresis').inputValue())).toBe(0.12)
  await expect(page.getByTestId('adaptive-text-status')).toContainText(
    'Adaptive text idle',
  )
  const outputZ = await page.getByTestId('microscope-canvas').evaluate((node) =>
    Number.parseInt(getComputedStyle(node).zIndex, 10),
  )
  const toolbarZ = await page.getByRole('toolbar', { name: 'Canvas tools' }).evaluate((node) =>
    Number.parseInt(getComputedStyle(node).zIndex, 10),
  )
  expect(toolbarZ).toBeGreaterThan(outputZ)
})

test('toggles vignette, lens, and CRT independently with live parameters', async ({ page }) => {
  await page.getByTestId('settings-toggle').click()
  const panel = page.getByTestId('settings-panel')
  const vignetteProfile = panel.getByLabel('profile', { exact: true })
  await expect(vignetteProfile).toHaveValue('Regular view')
  await vignetteProfile.selectOption({ label: 'Focused edit' })
  await setNumericBinding(page, 'rim dim', 0.41)
  expect((await snapshot(page)).settings.effects.focusVignette.dim).toBeCloseTo(0.41)
  expect((await snapshot(page)).settings.effects.vignette.dim).toBeCloseTo(0.8)
  await vignetteProfile.selectOption({ label: 'Regular view' })
  await panel.getByText('CRT shader', { exact: true }).click()
  const enabled = panel.getByLabel('enabled', { exact: true })
  await expect(enabled).toHaveCount(4)

  await enabled.nth(0).evaluate((element: HTMLInputElement) => element.click())
  await enabled.nth(1).evaluate((element: HTMLInputElement) => element.click())
  let state = await snapshot(page)
  expect(state.settings.effects.vignette.enabled).toBe(false)
  expect(state.settings.effects.lens.enabled).toBe(false)
  expect(state.settings.effects.crt.enabled).toBe(true)
  expect((await postProcessSnapshot(page)).active).toBe(true)

  await enabled.nth(2).evaluate((element: HTMLInputElement) => element.click())
  await expect.poll(async () => (await postProcessSnapshot(page)).active).toBe(true)
  await expect(page.getByTestId('microscope-canvas')).toBeVisible()
  expect((await postProcessSnapshot(page)).wallCompositeMode).toBe('pre-shader')

  await enabled.nth(1).evaluate((element: HTMLInputElement) => element.click())
  await setNumericBinding(page, 'refraction', 0.22)
  await setNumericBinding(page, 'aberration', 2.2)
  await setNumericBinding(page, 'frost', 1.4)
  await setNumericBinding(page, 'glow', 0.22)
  await setNumericBinding(page, 'glow radius px', 7)
  state = await snapshot(page)
  expect(state.settings.effects.lens.enabled).toBe(true)
  expect(state.settings.effects.lens.shape).toBe('sphere')
  expect(state.settings.effects.lens.refraction).toBeCloseTo(0.22)
  expect(state.settings.effects.lens.aberration).toBeCloseTo(2.2)
  expect(state.settings.effects.lens.frost).toBeCloseTo(1.4)
  expect(state.settings.effects.lens.glow).toBeCloseTo(0.22)
  expect(state.settings.effects.lens.glowRadius).toBeCloseTo(7)
  await expect(page.getByTestId('microscope-canvas')).toBeVisible()
})

test('exposes live grain and glow controls in the open microscope panel', async ({ page }) => {
  await page.getByTestId('settings-toggle').click()
  const panel = page.getByTestId('settings-panel')
  await expect(panel.getByText('whole-circle noise', { exact: true })).toBeVisible()
  await expect(panel.getByText('grain / noise', { exact: true })).toBeVisible()
  await expect(panel.getByText('wall grain', { exact: true })).toBeVisible()
  await expect(panel.getByText('grain enabled', { exact: true })).toBeVisible()
  await expect(panel.getByText('grain frequency', { exact: true })).toBeVisible()
  await expect(panel.getByText('grain opacity', { exact: true })).toBeVisible()
  await expect(panel.getByText('glow', { exact: true })).toBeVisible()
  const unlabeledHints = await panel
    .locator('.tp-lblv_l, .tp-fldv_b, .tp-btnv_b, .tp-rotv_t')
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.textContent?.trim() && !element.getAttribute('title'))
        .map((element) => element.textContent?.trim()),
    )
  expect(unlabeledHints).toEqual([])
  await expect(page.locator('#paper-wall-pencil feTurbulence')).toHaveCount(1)
  const paperFilter = await page.getByTestId('wall-texture-canvas').evaluate(
    (canvas) => getComputedStyle(canvas).filter,
  )
  expect(paperFilter).toBe('none')
  const wallLayerStyle = await page.getByTestId('wall-texture-canvas').evaluate(
    (canvas) => ({
      opacity: getComputedStyle(canvas).opacity,
      zIndex: Number.parseInt(getComputedStyle(canvas).zIndex, 10),
    }),
  )
  const microscopeZ = await page.getByTestId('microscope-canvas').evaluate(
    (canvas) => Number.parseInt(getComputedStyle(canvas).zIndex, 10),
  )
  expect(wallLayerStyle.opacity).toBe('0')
  expect(wallLayerStyle.zIndex).toBeLessThan(microscopeZ)
  expect((await postProcessSnapshot(page)).sourceIncludesWallTexture).toBe(true)
  expect(
    await page
      .getByTestId('voronoi-canvas')
      .evaluate((canvas) => getComputedStyle(canvas).filter),
  ).toBe('none')

  const before = await postProcessSnapshot(page)
  await setNumericBinding(page, 'whole-circle noise', 0.021)
  await setNumericBinding(page, 'grain / noise', 0.031)
  await setNumericBinding(page, 'wall grain', 1.1)
  await setNumericBinding(page, 'glow', 0.27)
  await expect
    .poll(async () => {
      const state = await snapshot(page)
      return (
        Math.abs(state.settings.effects.circle.grain - 0.021) < 0.0001 &&
        Math.abs(state.settings.effects.vignette.grain - 0.031) < 0.0001 &&
        Math.abs(state.settings.geometry.wallGrain - 1.1) < 0.0001 &&
        Math.abs(state.settings.effects.lens.glow - 0.27) < 0.0001
      )
    })
    .toBe(true)
  await expect
    .poll(async () => (await postProcessSnapshot(page)).renderCount)
    .toBeGreaterThan(before.renderCount)
  await expect(page.locator('#paper-wall-pencil feDisplacementMap')).toHaveAttribute(
    'scale',
    '1.1',
  )
  await page.getByText('Seam nutrients', { exact: true }).click()
  await expect(panel.getByLabel('nutrients enabled')).toBeChecked()
  await expect(panel.getByLabel('particles per cell')).toHaveValue('64')
  const wallPixelCount = await page.getByTestId('wall-texture-canvas').evaluate(
    (canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d')
      if (!context) return 0
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0
      for (let index = 3; index < pixels.length; index += 64) {
        if (pixels[index] > 0) count += 1
      }
      return count
    },
  )
  expect(wallPixelCount).toBeGreaterThan(50)
  await page.waitForTimeout(1200)
  const wallPixelCountAfterDirtyRepaint = await page
    .getByTestId('wall-texture-canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d')
      if (!context) return 0
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0
      for (let index = 3; index < pixels.length; index += 64) {
        if (pixels[index] > 0) count += 1
      }
      return count
    })
  expect(wallPixelCountAfterDirtyRepaint).toBeGreaterThan(wallPixelCount * 0.5)

  await panel
    .getByLabel('nutrients enabled')
    .evaluate((element: HTMLInputElement) => element.click())
  const lowDetailRenderCount = (await postProcessSnapshot(page)).renderCount
  await setNumericBinding(page, 'wall grain', 2.2)
  await setNumericBinding(page, 'grain frequency', 0.006)
  await setNumericBinding(page, 'grain detail', 1)
  await expect
    .poll(async () => (await postProcessSnapshot(page)).renderCount)
    .toBeGreaterThan(lowDetailRenderCount)
  const lowDetail = await page.getByTestId('microscope-canvas').screenshot()
  const highDetailRenderCount = (await postProcessSnapshot(page)).renderCount
  await setNumericBinding(page, 'grain frequency', 0.075)
  await setNumericBinding(page, 'grain detail', 4)
  await expect
    .poll(async () => (await postProcessSnapshot(page)).renderCount)
    .toBeGreaterThan(highDetailRenderCount)
  const highDetail = await page.getByTestId('microscope-canvas').screenshot()
  expect(lowDetail.equals(highDetail)).toBe(false)
})

test('feathers the circle before and after the shader in regular and focused modes', async ({
  page,
}) => {
  const mask = page.locator('.microscope-viewport-mask')
  await expect(mask).not.toHaveCSS('mask-image', 'none')
  expect((await postProcessSnapshot(page)).edgeFeatherPx).toBe(20)

  await page.getByTestId('settings-toggle').click()
  const panel = page.getByTestId('settings-panel')
  await expect(panel.getByLabel('edge profile')).toBeVisible()
  await setNumericBinding(page, 'edge feather px', 12)
  await panel.getByLabel('edge profile').selectOption({ label: 'Focused edit' })
  await setNumericBinding(page, 'edge feather px', 28)
  let state = await snapshot(page)
  expect(state.settings.effects.circle.edgeFeatherPx).toBe(12)
  expect(state.settings.effects.circle.focusEdgeFeatherPx).toBe(28)
  expect((await postProcessSnapshot(page)).edgeFeatherPx).toBe(12)

  await page.getByTestId('settings-toggle').click()
  await page.getByTestId('tool-select').click()
  const point = await sitePoint(page, 'cell-4')
  await page.mouse.dblclick(point.x, point.y, { delay: 70 })
  await expect
    .poll(async () => page.locator('.voronoi-stage').getAttribute('data-focus-phase'))
    .toBe('editing')
  const focused = await postProcessSnapshot(page)
  expect(focused.edgeFeatherPx).toBeCloseTo(28, 4)
  expect(focused.focusScene.blurPx).toBeCloseTo(0, 4)
  await expect(mask).not.toHaveCSS('mask-image', 'none')

  await page.getByTestId('cell-editor').press('Escape')
  await expect
    .poll(async () => (await postProcessSnapshot(page)).edgeFeatherPx)
    .toBeCloseTo(12, 4)
  state = await snapshot(page)
  expect(state.settings.effects.circle.edgeFeatherPx).toBe(12)
})

test('zooms a cell into a large integrated editor and restores the microscope', async ({
  page,
}) => {
  await page.getByTestId('settings-toggle').click()
  await page.getByText('Focused text editing', { exact: true }).click()
  await expect(page.getByLabel('focused scene transition')).toBeChecked()
  await expect(page.getByLabel('focus duration ms')).toHaveValue('1100')
  await expect(page.getByLabel('focus blur px')).toHaveValue('24')
  await expect(page.getByLabel('focus arc depth')).toHaveValue('1.8')
  await expect(page.getByLabel('focus coverage')).toHaveValue('0.80')
  await setNumericBinding(page, 'focus blur px', 22)
  await page.getByTestId('settings-toggle').click()
  await page.getByTestId('tool-select').click()
  const point = await sitePoint(page, 'cell-4')
  await page.mouse.dblclick(point.x, point.y, { delay: 70 })
  const editor = page.getByTestId('cell-editor')
  await expect(editor).toBeFocused()
  await expect(page.getByTestId('focus-edit-dismiss')).toBeVisible()
  const overlay = page.getByTestId('microscope-text-overlay')
  await expect(overlay).toHaveAttribute('data-overlay-state', 'focused')
  const enteringLayerContract = await page.evaluate(() => {
    const source = document.querySelector<HTMLElement>('[data-testid="voronoi-canvas"]')!
    const shader = document.querySelector<HTMLElement>('[data-testid="microscope-canvas"]')!
    const editor = document.querySelector<HTMLElement>('[data-testid="cell-editor"]')!
    const overlay = document.querySelector<HTMLElement>(
      '[data-testid="microscope-text-overlay"]',
    )!
    return {
      source: Number.parseInt(getComputedStyle(source).zIndex, 10),
      shader: Number.parseInt(getComputedStyle(shader).zIndex, 10),
      editor: Number.parseInt(getComputedStyle(editor).zIndex, 10),
      overlay: Number.parseInt(getComputedStyle(overlay).zIndex, 10),
      overlayPointerEvents: getComputedStyle(overlay).pointerEvents,
    }
  })
  expect(enteringLayerContract.source).toBeLessThan(enteringLayerContract.shader)
  expect(enteringLayerContract.editor).toBeLessThan(enteringLayerContract.overlay)
  expect(enteringLayerContract.overlayPointerEvents).toBe('none')
  const fixedOpticsBefore = await page.getByTestId('microscope-canvas').evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return {
      transform: getComputedStyle(element).transform,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }
  })
  await expect(page.locator('.voronoi-stage')).toHaveAttribute('data-focus-phase', 'entering')
  const enteringEditorBounds = await editor.boundingBox()
  await expect
    .poll(async () => page.locator('.voronoi-stage').getAttribute('data-focus-phase'))
    .toBe('editing')
  const focusedEditorBounds = await editor.boundingBox()
  expect(enteringEditorBounds).not.toBeNull()
  expect(focusedEditorBounds).not.toBeNull()
  expect(
    Math.hypot(
      focusedEditorBounds!.x - enteringEditorBounds!.x,
      focusedEditorBounds!.y - enteringEditorBounds!.y,
    ),
  ).toBeGreaterThan(8)
  await expect(page.locator('.voronoi-stage')).toHaveAttribute(
    'data-focused-cell',
    'cell-4',
  )
  const editorStyle = await editor.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      width: Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
      background: style.backgroundColor,
      border: style.borderWidth,
      textFill: style.getPropertyValue('-webkit-text-fill-color'),
      pointerEvents: style.pointerEvents,
      spellcheck: (element as HTMLTextAreaElement).spellcheck,
      computedFontSize: Number.parseFloat(style.fontSize),
      transformScale: Math.hypot(
        new DOMMatrixReadOnly(style.transform).a,
        new DOMMatrixReadOnly(style.transform).b,
      ),
      visualFontSize: Number.parseFloat(
        (element as HTMLElement).dataset.visualFontSize ?? '0',
      ),
    }
  })
  expect(editorStyle.width).toBeGreaterThan(20)
  expect(editorStyle.height).toBeGreaterThan(20)
  expect(editorStyle.background).toBe('rgba(0, 0, 0, 0)')
  expect(editorStyle.border).toBe('0px')
  expect(editorStyle.textFill).not.toBe('rgba(0, 0, 0, 0)')
  expect(editorStyle.pointerEvents).toBe('auto')
  expect(editorStyle.spellcheck).toBe(true)
  expect(editorStyle.visualFontSize).toBeGreaterThanOrEqual(11)
  expect(editorStyle.visualFontSize).toBeLessThanOrEqual(16)
  expect(editorStyle.computedFontSize * editorStyle.transformScale).toBeCloseTo(
    editorStyle.visualFontSize,
    1,
  )
  const {
    canvas: focusedCanvas,
    postProcess: focusedPostProcess,
  } = await alignedSceneSnapshot(page)
  const focusedCellCenter = polygonCentroid(focusedCanvas.cells['cell-4'])
  expect(
    Math.abs(
      focusedCellCenter.x * focusedPostProcess.focusScene.scale +
        focusedPostProcess.focusScene.translate.x -
        focusedCanvas.field.center.x,
    ),
  ).toBeLessThan(1)
  expect(
    Math.abs(
      focusedCellCenter.y * focusedPostProcess.focusScene.scale +
        focusedPostProcess.focusScene.translate.y -
        focusedCanvas.field.center.y,
    ),
  ).toBeLessThan(1)
  expect(focusedPostProcess.focusScene.scale).toBeGreaterThan(1)
  expect(focusedPostProcess.focusScene.orbitAngle).toBeCloseTo(0, 5)
  expect(focusedPostProcess.focusScene.opacity).toBeCloseTo(1, 5)
  expect(
    await page.getByTestId('microscope-canvas').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return {
        transform: getComputedStyle(element).transform,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }
    }),
  ).toEqual(fixedOpticsBefore)
  await editor.fill(
    Array.from({ length: 18 }, (_, index) => `A responsive focused line ${index + 1}.`).join(
      '\n',
    ),
  )
  await page.waitForTimeout(500)
  const {
    canvas: draftSnapshot,
    postProcess: draftPostProcess,
  } = await alignedSceneSnapshot(page)
  const draftEditorBounds = await editor.boundingBox()
  const draftPolygon = draftSnapshot.cells['cell-4'].map((point) => ({
    x: point.x * draftPostProcess.focusScene.scale +
      draftPostProcess.focusScene.translate.x,
    y: point.y * draftPostProcess.focusScene.scale +
      draftPostProcess.focusScene.translate.y,
  }))
  expect(draftEditorBounds).not.toBeNull()
  expect(draftEditorBounds!.x).toBeGreaterThanOrEqual(
    Math.min(...draftPolygon.map((point) => point.x)) - 1,
  )
  expect(draftEditorBounds!.y).toBeGreaterThanOrEqual(
    Math.min(...draftPolygon.map((point) => point.y)) - 1,
  )
  expect(draftEditorBounds!.x + draftEditorBounds!.width).toBeLessThanOrEqual(
    Math.max(...draftPolygon.map((point) => point.x)) + 1,
  )
  expect(draftEditorBounds!.y + draftEditorBounds!.height).toBeLessThanOrEqual(
    Math.max(...draftPolygon.map((point) => point.y)) + 1,
  )
  await expect(page.locator('.voronoi-stage')).toHaveCSS('--focus-blur', '22px')
  await expect(page.getByTestId('tool-add')).toBeVisible()
  await expect(page.getByTestId('autogroup-toggle')).toBeVisible()
  await expect(page.getByTestId('sprout-toggle')).toBeVisible()
  await expect(page.getByTestId('tool-group')).toHaveCount(0)
  await expect(page.getByTestId('tool-merge')).toHaveCount(0)

  await page.mouse.click(8, 8)
  await expect(editor).toHaveCount(0)
  await expect(page.locator('.voronoi-stage')).toHaveAttribute('data-focus-phase', 'exiting')
  await expect(overlay).toHaveAttribute('data-overlay-state', 'exiting')
  await expect(overlay).toHaveCSS('pointer-events', 'none')
  await expect
    .poll(async () => page.locator('.voronoi-stage').getAttribute('data-focus-phase'))
    .toBe('idle')
  await expect(page.locator('.microscope-scene')).not.toHaveClass(/is-focus-/)
  await expect(overlay).toHaveCount(0)
  const restored = await postProcessSnapshot(page)
  expect(restored.focusScene.scale).toBeCloseTo(1, 5)
  expect(restored.focusScene.orbitAngle).toBeCloseTo(0, 5)
  expect(restored.focusScene.blurPx).toBeCloseTo(0, 5)
  expect(restored.focusScene.opacity).toBeCloseTo(1, 5)
})

test('retains the direct focused-editor zoom when the tracked transition is off', async ({
  page,
}) => {
  await page.getByTestId('settings-toggle').click()
  await page.getByText('Focused text editing', { exact: true }).click()
  await page
    .getByLabel('focused scene transition')
    .evaluate((element: HTMLInputElement) => element.click())
  await expect
    .poll(async () => (await snapshot(page)).settings.editFocus.trackTransitionEnabled)
    .toBe(false)
  await page.getByTestId('settings-toggle').click()
  await page.getByTestId('tool-select').click()
  const point = await sitePoint(page, 'cell-4')
  await page.mouse.dblclick(point.x, point.y, { delay: 70 })
  await page.waitForTimeout(320)
  const transitioning = await postProcessSnapshot(page)
  expect(transitioning.focusScene.scale).toBeGreaterThan(1)
  expect(transitioning.focusScene.orbitAngle).toBe(0)
  expect(transitioning.focusScene.opacity).toBe(1)
  await page.getByTestId('cell-editor').press('Escape')
  await expect
    .poll(async () => page.locator('.voronoi-stage').getAttribute('data-focus-phase'))
    .toBe('idle')
})

test('keeps newly created placeholder text under the microscope overlay from its first frame', async ({
  page,
}) => {
  const before = await snapshot(page)
  await page.getByTestId('tool-add').click()
  await page.mouse.click(
    before.field.center.x - before.field.radius * 0.14,
    before.field.center.y + before.field.radius * 0.08,
  )
  const editor = page.getByTestId('cell-editor')
  const overlay = page.getByTestId('microscope-text-overlay')
  await expect(editor).toHaveAttribute('data-presentation', 'inline')
  await expect(editor).not.toHaveAttribute('placeholder', '')
  await expect(overlay).toHaveAttribute('data-overlay-state', 'inline')
  const layerContract = await page.evaluate(() => {
    const z = (testId: string) =>
      Number.parseInt(
        getComputedStyle(
          document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!,
        ).zIndex,
        10,
      )
    return {
      source: z('voronoi-canvas'),
      shader: z('microscope-canvas'),
      editor: z('cell-editor'),
      overlay: z('microscope-text-overlay'),
    }
  })
  expect(layerContract.source).toBeLessThan(layerContract.shader)
  expect(layerContract.editor).toBeLessThan(layerContract.overlay)

  await editor.fill('A newly created thought.')
  await editor.press('Enter')
  await expect(overlay).toHaveCount(0)
  await expect(page.getByTestId('microscope-canvas')).toBeVisible()
})

test('selects shorter microscope variants while focused and list editors keep canonical M', async ({
  page,
}) => {
  const canonical =
    'I noticed the difficult unresolved conversation became easier only after I carefully named the specific concern, preserved the important context, and asked for one concrete next step.'
  await page.evaluate((text) => {
    const debug = window.__VORONOI_DEBUG__
    if (!debug) throw new Error('Missing debug bridge')
    const document = JSON.parse(debug.serialize()) as {
      cells: Array<Record<string, unknown> & { id: string; text: string }>
    }
    const cell = document.cells.find((candidate) => candidate.id === 'cell-4')
    if (!cell) throw new Error('Missing test cell')
    let hash = 0x811c9dc5
    const normalized = text.normalize('NFKC').trim().replace(/\s+/gu, ' ')
    for (let index = 0; index < normalized.length; index += 1) {
      hash ^= normalized.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193)
    }
    cell.text = text
    cell.textVariants = {
      sourceHash: `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`,
      status: 'ready',
      values: {
        S: 'The conversation eased after I named the concern and asked for a next step.',
        XS: 'Naming the concern made the next step clearer.',
        XXS: 'Naming it clarified the next step.',
      },
      provenance: 'on-device-model',
      provider: 'e2e-fixture',
      model: 'fixture-model',
      promptVersion: 'variants-v1',
      generatedAtMs: 1,
    }
    debug.load(JSON.stringify(document))
  }, canonical)
  await page.setViewportSize({ width: 560, height: 720 })

  await expect
    .poll(async () => (await snapshot(page)).textLayouts['cell-4']?.variant)
    .not.toBe('M')
  const compact = await snapshot(page)
  expect(compact.textLayouts['cell-4'].content).not.toContain('unresolved conversation')

  const point = await sitePoint(page, 'cell-4')
  await page.mouse.dblclick(point.x, point.y, { delay: 70 })
  const editor = page.getByTestId('cell-editor')
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue(canonical)
  await expect(page.getByTestId('microscope-text-overlay')).toBeVisible()
  await editor.press('Escape')
  await expect(editor).toHaveCount(0)

  await page.getByTestId('list-view-toggle').click()
  await expect(page.getByTestId('list-view')).toBeVisible()
  await expect(page.getByTestId('list-cell-cell-4')).toHaveValue(canonical)
})

test('falls back deterministically when the on-device model cannot load offline', async ({
  page,
}) => {
  await page.route(/(?:huggingface\.co|hf\.co|cdn-lfs)/u, (route) => route.abort())
  await page.evaluate(() =>
    localStorage.setItem('mytosis.force-adaptive-worker', 'true'),
  )
  await page.context().setOffline(true)
  const point = await sitePoint(page, 'cell-4')
  await page.mouse.dblclick(point.x, point.y, { delay: 70 })
  const editor = page.getByTestId('cell-editor')
  const canonical =
    'I kept the important decision small enough to discuss clearly before tomorrow.'
  await editor.fill(canonical)
  await editor.press('Enter')

  await expect
    .poll(
      async () =>
        (await snapshot(page)).model.cells.find((cell) => cell.id === 'cell-4')
          ?.textVariants?.status,
      { timeout: 30_000 },
    )
    .toBe('fallback')
  const cell = (await snapshot(page)).model.cells.find(
    (candidate) => candidate.id === 'cell-4',
  )
  expect(cell?.text).toBe(canonical)
  expect(cell?.textVariants?.provenance).toBe('deterministic-fallback')
  expect(cell?.textVariants?.values.S.split(/\s+/u).length).toBeLessThan(
    canonical.split(/\s+/u).length,
  )
  expect(cell?.textVariants?.error).toBeTruthy()

  await page.getByTestId('settings-toggle').click()
  await expect(page.getByTestId('adaptive-text-status')).toContainText(
    'Model error; deterministic fallback active',
  )
})

test('keeps CRT color shift and bulge while phosphor and scanlines are independently off', async ({
  page,
}) => {
  await page.getByTestId('settings-toggle').click()
  const panel = page.getByTestId('settings-panel')
  await panel.getByText('CRT shader', { exact: true }).click()
  const phosphorToggle = panel
    .getByText('phosphor + scanlines', { exact: true })
    .locator('..')
    .locator('input')
  await expect(phosphorToggle).not.toBeChecked()

  const before = await snapshot(page)
  expect(before.settings.effects.crt.colorShift).toBe(0.24)
  expect(before.settings.effects.crt.bulge).toBe(0.5)
  await phosphorToggle.evaluate((element: HTMLInputElement) => element.click())
  await expect.poll(async () => (await snapshot(page)).settings.effects.crt.phosphorScanlinesEnabled)
    .toBe(true)
  const enabled = await snapshot(page)
  expect(enabled.settings.effects.crt.colorShift).toBe(0.24)
  expect(enabled.settings.effects.crt.bulge).toBe(0.5)
  await phosphorToggle.evaluate((element: HTMLInputElement) => element.click())
  await expect
    .poll(async () => (await snapshot(page)).settings.effects.crt.phosphorScanlinesEnabled)
    .toBe(false)
})

test('keeps the lens centered and radius-synchronized through viewport resize', async ({ page }) => {
  const desktop = await postProcessSnapshot(page)
  const desktopField = (await snapshot(page)).field
  expect(desktop.field.center).toEqual(desktopField.center)
  expect(desktop.field.radius).toBeCloseTo(desktopField.outerRadius, 5)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  const mobile = await postProcessSnapshot(page)
  const mobileField = (await snapshot(page)).field
  expect(mobile.field.center).toEqual(mobileField.center)
  expect(mobile.field.radius).toBeCloseTo(mobileField.outerRadius, 5)
  expect(mobile.field.radius).toBeLessThan(desktop.field.radius)
  expect(mobile.outputWidth).toBeGreaterThanOrEqual(390)
  expect(mobile.outputHeight).toBeGreaterThanOrEqual(844)
})

test('maps refracted pointer input back to Paper hit-testing', async ({ page }) => {
  await page.getByTestId('settings-toggle').click()
  await setNumericBinding(page, 'refraction', 0.4)
  await page.getByTestId('settings-toggle').click()
  await page.getByTestId('tool-select').click()

  const source = await sitePoint(page, 'cell-4')
  const visible = await visiblePointForSource(page, source)
  const mapped = await page.evaluate(
    (point) => window.__VORONOI_DEBUG__?.mapPostProcessPoint(point) ?? point,
    visible,
  )
  expect(Math.hypot(mapped.x - source.x, mapped.y - source.y)).toBeLessThan(0.2)
  expect(Math.hypot(visible.x - source.x, visible.y - source.y)).toBeGreaterThan(0.5)

  await page.mouse.click(visible.x, visible.y)
  expect((await snapshot(page)).selectedId).toBe('cell-4')
  const targetSource = { x: source.x - 34, y: source.y + 18 }
  const targetVisible = await visiblePointForSource(page, targetSource)
  await page.mouse.move(visible.x, visible.y)
  await page.mouse.down()
  // Keep this pointer-mapping assertion below the intentional merge dwell;
  // the merge behavior itself is covered by its dedicated interaction test.
  await page.mouse.move(targetVisible.x, targetVisible.y, { steps: 2 })
  await page.mouse.up()
  const moved = await snapshot(page)
  const movedCell = moved.model.cells.find((cell) => cell.id === 'cell-4')
  expect(movedCell?.site.x).not.toBeCloseTo(
    (source.x - moved.field.center.x) / moved.field.radius,
    2,
  )
})

test('stops texture uploads when static and falls back without WebGL', async ({ page }) => {
  await page.getByTestId('settings-toggle').click()
  await page.getByText('Seam nutrients', { exact: true }).click()
  await page.getByLabel('nutrients enabled').evaluate((element: HTMLInputElement) =>
    element.click(),
  )
  await page.getByText('Ambient culture motion', { exact: true }).click()
  await page.getByLabel('ambient motion').evaluate((element: HTMLInputElement) =>
    element.click(),
  )
  await page.getByTestId('settings-toggle').click()
  await expect
    .poll(async () => (await snapshot(page)).performance.dynamic, { timeout: 15_000 })
    .toBe(false)
  await page.waitForTimeout(1400)
  const settled = await postProcessSnapshot(page)
  await page.waitForTimeout(650)
  expect((await postProcessSnapshot(page)).uploadCount).toBe(settled.uploadCount)

  await page.addInitScript(() => {
    const nativeGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function getContext(
      this: HTMLCanvasElement,
      contextId: string,
      ...args: unknown[]
    ) {
      if (contextId === 'webgl2') return null
      return nativeGetContext.call(this, contextId, ...args)
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await page.reload()
  await page.waitForTimeout(500)
  const fallback = await postProcessSnapshot(page)
  expect(fallback.status).toBe('fallback')
  expect(fallback.active).toBe(false)
  await expect(page.getByTestId('microscope-canvas')).toBeHidden()
  await expect(page.getByTestId('voronoi-canvas')).toBeVisible()
  await page.getByTestId('settings-toggle').click()
  await expect(
    page.getByText('Microscope effects — unavailable', { exact: true }),
  ).toBeVisible()

  await page.getByTestId('settings-toggle').click()
  const state = await snapshot(page)
  const point = {
    x: state.field.center.x - state.field.radius * 0.12,
    y: state.field.center.y,
  }
  await page.getByTestId('tool-add').click()
  await page.mouse.move(point.x, point.y)
  await expect.poll(async () => (await snapshot(page)).previewId).not.toBeNull()
})

test('switches New Select tools, previews, and reuses the single empty cell at center', async ({ page }) => {
  const toolbar = page.getByRole('toolbar', { name: 'Canvas tools' })
  await expect(toolbar.getByTestId('tool-add')).toHaveAttribute('aria-pressed', 'false')
  await expect(toolbar.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')
  await expect(toolbar.getByTestId('autogroup-toggle')).toBeVisible()
  await expect(toolbar.getByTestId('tool-merge')).toHaveCount(0)
  await expect(toolbar.getByTestId('sprout-toggle')).toBeVisible()
  await expect(toolbar.getByTestId('tool-select').locator('img')).toHaveAttribute(
    'src',
    '/assets/toolbar/select%20tool.svg',
  )
  await expect(toolbar.getByTestId('tool-add').locator('img')).toHaveAttribute(
    'src',
    '/assets/toolbar/add%20cell.svg',
  )
  await expect(toolbar.getByTestId('autogroup-toggle').locator('img')).toHaveAttribute(
    'src',
    '/assets/toolbar/auto%20group.svg',
  )
  await expect(toolbar.getByTestId('sprout-toggle').locator('img')).toHaveAttribute(
    'src',
    '/assets/toolbar/cultivate%20:%20auto%20seed.svg',
  )
  await expect(toolbar.getByTestId('history-undo').locator('img')).toHaveAttribute(
    'src',
    '/assets/toolbar/undo.svg',
  )
  await expect(toolbar.getByTestId('history-redo').locator('img')).toHaveAttribute(
    'src',
    '/assets/toolbar/redo.svg',
  )
  await expect(toolbar.getByTestId('list-view-toggle').locator('img')).toHaveAttribute(
    'src',
    '/assets/toolbar/list%20view.svg',
  )
  await toolbar.getByTestId('tool-add').click()
  await expect(toolbar.getByTestId('tool-add')).toHaveAttribute('aria-pressed', 'true')

  const before = await snapshot(page)
  const tightGapCells = ['cell-1', 'cell-2', 'cell-6'].map((id) => {
    const cell = before.model.cells.find((candidate) => candidate.id === id)
    if (!cell) throw new Error(`Missing tight-gap fixture ${id}`)
    return cell
  })
  const tightGapSite = tightGapCells.reduce(
    (sum, cell) => ({
      x: sum.x + cell.site.x / tightGapCells.length,
      y: sum.y + cell.site.y / tightGapCells.length,
    }),
    { x: 0, y: 0 },
  )
  const previewPoint = {
    x: before.field.center.x + before.field.radius * tightGapSite.x,
    y: before.field.center.y + before.field.radius * tightGapSite.y,
  }
  await page.mouse.move(previewPoint.x, previewPoint.y)
  await expect.poll(async () => (await snapshot(page)).previewId).not.toBeNull()
  const preview = await snapshot(page)
  expect(preview.cellCount).toBe(before.cellCount)
  expect(Object.keys(preview.cells)).toHaveLength(before.cellCount)

  await page.mouse.click(previewPoint.x, previewPoint.y)
  await expect.poll(async () => (await snapshot(page)).cellCount).toBe(before.cellCount + 1)
  await expect
    .poll(async () => Boolean((await snapshot(page)).cells[preview.previewId ?? '']))
    .toBe(true)
  await page.waitForTimeout(300)
  const created = await snapshot(page)
  const createdCell = created.model.cells.find((cell) => cell.id === preview.previewId)
  expect(createdCell?.text).toBe('')
  expect(createdCell?.incubation.state).toBe('empty')
  const createdPolygon = created.cells[preview.previewId ?? '']
  expect(createdPolygon).toBeDefined()
  const createdWidth =
    Math.max(...createdPolygon.map((point) => point.x)) -
    Math.min(...createdPolygon.map((point) => point.x))
  const createdHeight =
    Math.max(...createdPolygon.map((point) => point.y)) -
    Math.min(...createdPolygon.map((point) => point.y))
  expect(Math.min(createdWidth, createdHeight)).toBeGreaterThan(34)
  const firstSite = createdCell?.site

  const inlineEditor = page.getByTestId('cell-editor')
  await expect(inlineEditor).toBeVisible()
  await expect(inlineEditor).toHaveAttribute('data-presentation', 'inline')
  await expect(inlineEditor).toBeFocused()
  expect(created.selectedId).toBe(createdCell?.id)
  const createdArea = polygonArea(createdPolygon)
  await inlineEditor.fill(
    Array.from({ length: 24 }, (_, index) => `live draft ${index + 1}`).join(' '),
  )
  await expect
    .poll(async () => {
      const state = await snapshot(page)
      return polygonArea(state.cells[createdCell!.id])
    })
    .toBeGreaterThan(createdArea * 1.08)
  expect(
    (await snapshot(page)).model.cells.find((cell) => cell.id === createdCell?.id)?.site,
  ).toEqual(createdCell?.site)
  await inlineEditor.press('Escape')

  await toolbar.getByTestId('tool-add').click()
  await toolbar.getByTestId('tool-add').click()
  const recentered = await snapshot(page)
  expect(recentered.cellCount).toBe(created.cellCount)
  const onlyEmptyCells = recentered.model.cells.filter(
    (cell) => cell.kind === 'journal' && cell.text.trim() === '',
  )
  expect(onlyEmptyCells).toHaveLength(1)
  expect(Math.hypot(onlyEmptyCells[0].site.x, onlyEmptyCells[0].site.y)).toBeLessThan(0.09)
  expect(onlyEmptyCells[0].site).not.toEqual(firstSite)

  await page.getByTestId('cell-editor').press('Escape')
  await toolbar.getByTestId('tool-add').click()
  await page.getByTestId('sprout-toggle').click()
  await expect(page.getByTestId('sprout-toggle')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('tool-select').click()
  await expect(page.getByTestId('sprout-toggle')).toBeVisible()
  await expect(page.getByTestId('sprout-toggle')).toHaveAttribute('aria-pressed', 'true')
  expect((await snapshot(page)).previewId).toBeNull()

  await page.keyboard.down('Shift')
  try {
    for (const id of ['cell-1', 'cell-2']) {
      const point = await sitePoint(page, id)
      await page.mouse.click(point.x, point.y)
    }
  } finally {
    await page.keyboard.up('Shift')
  }
  await expect(page.getByTestId('tool-add')).toBeDisabled()
  await expect(page.getByTestId('autogroup-toggle')).toHaveCount(0)
  await expect(page.getByTestId('tool-group')).toBeVisible()
  await expect(page.getByTestId('tool-group').locator('img')).toHaveAttribute(
    'src',
    '/assets/toolbar/group%20as%20group%20cell.svg',
  )
  await expect(page.getByTestId('sprout-toggle')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('tool-group').click()
  await expect(page.getByTestId('autogroup-toggle')).toBeVisible()
  await expect(page.getByTestId('tool-add')).toBeEnabled()
  expect((await snapshot(page)).mode).toBe('select')
})

test('uses exact defaults, survives slider extremes, and resets cleanly', async ({ page }) => {
  const fresh = await snapshot(page)
  expect(fresh.settings.geometry).toEqual({
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
  expect(fresh.settings.particles).toMatchObject({
    enabled: true,
    density: 64,
    speed: 0.42,
    orbitRadius: 3.5,
    opacity: 0.28,
  })
  expect(fresh.settings.motion).toMatchObject({
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
  expect(fresh.settings.seed).toMatchObject({
    delayMinMs: 4800,
    delayMaxMs: 12400,
    rate: 0.56,
    growthMs: 8000,
    popScale: 1.2,
    sizeRatio: 0.125,
    stickyEnabled: true,
    blobSizePx: 20,
    stickyDistancePx: 92,
    stickyNeckPx: 8,
    stickyTension: 0.58,
    stickyWobble: 0.1,
    stickyResponse: 18,
    incubationBlur: 16,
    incubationWigglePx: 0.8,
    incubationWiggleHz: 1.6,
    incubationWiggleEasing: 'spring',
    expirySeconds: 45,
    expiryShrinkMs: 2200,
  })
  expect(fresh.settings.group).toMatchObject({
    wallThickness: 12,
    wallGap: 2,
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
    wallGrainFrequency: 0.1,
    wallGrainOctaves: 2,
    wallGrainOpacity: 0.74,
  })
  expect(fresh.settings.mergeSplit).toEqual({
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
  expect(fresh.settings.viewTransition).toEqual({
    enabled: true,
    durationMs: 900,
    blurPx: 14,
    arcDepth: 1.8,
    easing: 'smooth',
  })
  await expect(page.getByTestId('settings-panel')).toBeHidden()
  await page.getByTestId('settings-toggle').click()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
  await expect(page.getByText('Canvas configuration', { exact: true })).toBeVisible()
  await page.getByText('View transition', { exact: true }).click()
  await expect(page.getByLabel('transition enabled')).toBeChecked()
  await expect(page.getByLabel('duration ms', { exact: true })).toHaveValue('900')
  await expect(page.getByLabel('maximum blur')).toHaveValue('14')
  await expect(page.getByLabel('arc depth', { exact: true })).toHaveValue('1.8')
  await page.getByText('Palette', { exact: true }).click()
  await expect(page.getByText('group color 1', { exact: true })).toBeVisible()
  await expect(page.getByText('group color 8', { exact: true })).toBeVisible()

  await setNumericBinding(page, 'inner stroke', 8)
  await setNumericBinding(page, 'seam gap', 20)
  await setNumericBinding(page, 'corner radius', 4)
  await setNumericBinding(page, 'outer gap', 64)
  await page.waitForTimeout(500)
  const extreme = await snapshot(page)
  expect(extreme.field.radius).toBeLessThan(fresh.field.radius)
  for (const stroke of Object.values(extreme.innerStrokes)) {
    expect(stroke).toEqual({
      closed: true,
      dashCount: 0,
      strokeWidth: 16,
      pointCount: 72,
    })
  }
  for (const polygon of Object.values(extreme.cells)) {
    expect(maximumEdgeLength(polygon)).toBeLessThan(80)
  }

  await page.getByText('Reset defaults', { exact: true }).click()
  await expect.poll(async () => (await snapshot(page)).settings.geometry.innerStrokeWidth).toBe(4.75)
  const reset = await snapshot(page)
  expect(reset.settings.geometry).toEqual({
    ...fresh.settings.geometry,
    wallGrain: reset.settings.geometry.wallGrain,
  })
  expect(reset.settings.geometry.wallGrain).toBeCloseTo(fresh.settings.geometry.wallGrain, 8)
  expect(reset.settings.motion).toEqual(fresh.settings.motion)
  expect(reset.settings.seed).toEqual(fresh.settings.seed)
  expect(reset.settings.group).toEqual(fresh.settings.group)

  await page.getByText('Experimental merge / split', { exact: true }).click()
  const newSelect = page.getByTestId('settings-panel').getByLabel('New Select')
  await expect(newSelect).toBeChecked()
  await expect(page.getByTestId('tool-merge')).toHaveCount(0)
  await newSelect.evaluate((element: HTMLInputElement) => element.click())
  await expect(page.getByTestId('tool-merge')).toHaveCount(0)

  await page.getByTestId('settings-toggle').click()
  await expect(page.getByTestId('settings-panel')).toBeHidden()
  await expect(page.getByTestId('settings-toggle')).toBeVisible()
})

test('switches microscope palette presets without recoloring the bullet editor', async ({
  page,
}) => {
  await page.getByTestId('list-view-toggle').click()
  await expect(page.getByTestId('list-view')).toBeVisible()
  const listColorsBefore = await page.getByTestId('list-view').evaluate((element) => {
    const style = getComputedStyle(element)
    return { color: style.color, background: style.backgroundImage }
  })
  await page.getByTestId('return-microscope').click()
  await expect(page.getByTestId('voronoi-canvas')).toBeVisible()

  await page.getByTestId('settings-toggle').click()
  await page.getByText('Palette', { exact: true }).click()
  const preset = page.getByLabel('preset')
  await expect(preset).toHaveValue('Baseline · Graphite culture')
  await preset.selectOption({ label: 'Organelle night · Violet / viridian' })
  await expect
    .poll(async () => (await snapshot(page)).settings.palette.exterior)
    .toBe('#030607')

  await page.getByTestId('settings-toggle').click()
  await page.getByTestId('list-view-toggle').click()
  await expect(page.getByTestId('list-view')).toBeVisible()
  const listColorsAfter = await page.getByTestId('list-view').evaluate((element) => {
    const style = getComputedStyle(element)
    return { color: style.color, background: style.backgroundImage }
  })
  expect(listColorsAfter).toEqual(listColorsBefore)
})

test('keeps text still while geometry breathes, then drags and power-resizes seams', async ({
  page,
}) => {
  await page.getByTestId('tool-select').click()
  const point = await sitePoint(page, 'cell-6')
  await page.mouse.move(point.x, point.y)
  await expect.poll(async () => (await snapshot(page)).hoveredId).toBe('cell-6')
  await page.waitForTimeout(220)
  const firstBreath = (await snapshot(page)).breathScales['cell-6']
  await page.waitForTimeout(330)
  const secondBreath = (await snapshot(page)).breathScales['cell-6']
  const breathSamples = [firstBreath.cell, secondBreath.cell]
  for (let sample = 0; sample < 4; sample += 1) {
    await page.waitForTimeout(220)
    breathSamples.push((await snapshot(page)).breathScales['cell-6'].cell)
  }
  expect(firstBreath.text).toBe(1)
  expect(secondBreath.text).toBe(1)
  expect(Math.max(...breathSamples) - Math.min(...breathSamples)).toBeGreaterThan(0.002)

  await page.mouse.click(point.x, point.y)
  await expect.poll(async () => (await snapshot(page)).selectedId).toBe('cell-6')
  const selected = await snapshot(page)
  expect(selected.handles).toHaveLength(4)

  const neighborBefore = selected.cells['cell-5']
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 74, point.y + 38, { steps: 3 })
  const duringDrag = await snapshot(page)
  await page.mouse.up()
  await page.waitForTimeout(280)
  const dragged = await snapshot(page)
  expect(
    dragged.model.cells.find((cell) => cell.id === 'cell-6')?.site.x,
  ).toBeGreaterThan(selected.model.cells.find((cell) => cell.id === 'cell-6')?.site.x ?? 0)
  expect(maximumDisplacement(neighborBefore, dragged.cells['cell-5'])).toBeGreaterThan(2)
  expect(maximumDisplacement(duringDrag.cells['cell-6'], dragged.cells['cell-6'])).toBeLessThan(80)

  const beforeResize = dragged.model.cells.find((cell) => cell.id === 'cell-6')
  const rightHandleSource = dragged.handles.reduce((rightmost, handle) =>
    handle.x > rightmost.x ? handle : rightmost,
  )
  const rightHandle = await visiblePointForSource(page, rightHandleSource)
  const rightHandleTarget = await visiblePointForSource(page, {
    x: rightHandleSource.x + 54,
    y: rightHandleSource.y,
  })
  const seamBeforeResize = dragged.cells['cell-7']
  await page.mouse.move(rightHandle.x, rightHandle.y)
  await page.mouse.down()
  await page.mouse.move(rightHandleTarget.x, rightHandleTarget.y, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const resized = await snapshot(page)
  const afterResize = resized.model.cells.find((cell) => cell.id === 'cell-6')
  expect(afterResize?.site.x).toBeCloseTo(beforeResize?.site.x ?? 0, 5)
  expect(afterResize?.weight).toBeGreaterThan(beforeResize?.weight ?? 0)
  expect(maximumDisplacement(seamBeforeResize, resized.cells['cell-7'])).toBeGreaterThan(1)
})

test('uses Pretext in-browser and keeps reflow stable after geometry settles', async ({ page }) => {
  await expect
    .poll(async () =>
      Object.entries((await snapshot(page)).textLayouts)
        .filter(([id]) => id.startsWith('cell-'))
        .every(([, layout]) => layout.engine === 'pretext'),
    )
    .toBe(true)

  await page.getByTestId('tool-select').click()
  const point = await sitePoint(page, 'cell-6')
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 64, point.y + 24, { steps: 18 })
  await page.mouse.up()
  await page.waitForTimeout(450)
  const counts: number[] = []
  for (let index = 0; index < 5; index += 1) {
    counts.push((await snapshot(page)).textLayouts['cell-6'].lineCount)
    await page.waitForTimeout(40)
  }
  expect(new Set(counts).size).toBe(1)
  expect((await snapshot(page)).textLayouts['cell-6'].engine).toBe('pretext')
})

test('edits with a shader-aligned caret, outside-dismisses, cancels, and deletes safely', async ({ page }) => {
  await page.getByTestId('tool-select').click()
  const point = await sitePoint(page, 'cell-4')
  await page.mouse.dblclick(point.x, point.y, { delay: 70 })
  const editor = page.getByTestId('cell-editor')
  await expect(editor).toBeFocused()
  await editor.press('ControlOrMeta+A')
  await editor.type('Quiet progress')
  await editor.press('End')
  await editor.type('X')
  await editor.press('Backspace')
  await editor.press('Home')
  await editor.type('X')
  await editor.press('ArrowLeft')
  await editor.press('Delete')
  await expect(editor).toHaveValue('Quiet progress')

  await page.mouse.click(30, 30)
  await expect(editor).toBeHidden()
  expect((await snapshot(page)).model.cells.find((cell) => cell.id === 'cell-4')?.text).toBe(
    'Quiet progress',
  )
  expect((await snapshot(page)).mode).toBe('select')

  await page.waitForTimeout(760)
  await page.mouse.dblclick(point.x, point.y, { delay: 70 })
  await editor.fill('Discard me')
  await editor.press('Escape')
  await expect(editor).toBeHidden()
  expect((await snapshot(page)).model.cells.find((cell) => cell.id === 'cell-4')?.text).toBe(
    'Quiet progress',
  )

  await page.waitForTimeout(760)
  await page.mouse.click(point.x, point.y)
  const beforeDelete = await snapshot(page)
  await page.getByTestId('voronoi-canvas').focus()
  await page.keyboard.press('Delete')
  await expect.poll(async () => (await snapshot(page)).cellCount).toBe(beforeDelete.cellCount - 1)
  expect((await snapshot(page)).model.cells.some((cell) => cell.id === 'cell-4')).toBe(false)
})

test('undoes and redoes add, move, resize, edit, delete, and group mutations', async ({ page }) => {
  const initial = await page.evaluate(() => window.__VORONOI_DEBUG__?.serialize())
  const field = (await snapshot(page)).field
  const addPoint = { x: field.center.x + 20, y: field.center.y + 14 }
  await page.getByTestId('tool-add').click()
  await page.mouse.move(addPoint.x, addPoint.y)
  await page.mouse.click(addPoint.x, addPoint.y)
  await expect.poll(async () => (await snapshot(page)).cellCount).toBe(13)
  await page.evaluate(() => window.__VORONOI_DEBUG__?.undo())
  expect(await page.evaluate(() => window.__VORONOI_DEBUG__?.serialize())).toBe(initial)
  await page.evaluate(() => window.__VORONOI_DEBUG__?.redo())
  await expect.poll(async () => (await snapshot(page)).cellCount).toBe(13)
  await page.evaluate(() => window.__VORONOI_DEBUG__?.undo())

  await page.getByTestId('tool-select').click()
  let point = await sitePoint(page, 'cell-4')
  const originalCell = (await snapshot(page)).model.cells.find((cell) => cell.id === 'cell-4')
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 44, point.y + 18, { steps: 10 })
  await page.mouse.up()
  await page.evaluate(() => window.__VORONOI_DEBUG__?.undo())
  let restored = (await snapshot(page)).model.cells.find((cell) => cell.id === 'cell-4')
  expect(restored?.site).toEqual(originalCell?.site)

  point = await sitePoint(page, 'cell-4')
  await page.mouse.click(point.x, point.y)
  let state = await snapshot(page)
  const rightHandleSource = state.handles.reduce((rightmost, handle) =>
    handle.x > rightmost.x ? handle : rightmost,
  )
  const rightHandle = await visiblePointForSource(page, rightHandleSource)
  const rightHandleTarget = await visiblePointForSource(page, {
    x: rightHandleSource.x + 32,
    y: rightHandleSource.y,
  })
  await page.mouse.move(rightHandle.x, rightHandle.y)
  await page.mouse.down()
  await page.mouse.move(rightHandleTarget.x, rightHandleTarget.y, { steps: 8 })
  await page.mouse.up()
  await page.evaluate(() => window.__VORONOI_DEBUG__?.undo())
  restored = (await snapshot(page)).model.cells.find((cell) => cell.id === 'cell-4')
  expect(restored?.weight).toBe(originalCell?.weight)

  point = await sitePoint(page, 'cell-4')
  await page.mouse.dblclick(point.x, point.y, { delay: 70 })
  const editor = page.getByTestId('cell-editor')
  await editor.fill('A reversible text edit.')
  await editor.press('Enter')
  await page.evaluate(() => window.__VORONOI_DEBUG__?.undo())
  restored = (await snapshot(page)).model.cells.find((cell) => cell.id === 'cell-4')
  expect(restored?.text).toBe(originalCell?.text)

  await page.waitForTimeout(760)
  point = await sitePoint(page, 'cell-4')
  await page.mouse.click(point.x, point.y)
  await page.getByTestId('voronoi-canvas').focus()
  await page.keyboard.press('Delete')
  await page.evaluate(() => window.__VORONOI_DEBUG__?.undo())
  expect((await snapshot(page)).model.cells.some((cell) => cell.id === 'cell-4')).toBe(true)

  await groupCells(page, ['cell-1', 'cell-2'])
  expect((await snapshot(page)).model.groups[0].memberIds).toEqual(['cell-1', 'cell-2'])
  await page.evaluate(() => window.__VORONOI_DEBUG__?.undo())
  state = await snapshot(page)
  expect(state.model.groups).toHaveLength(0)
  expect(state.model.cells.find((cell) => cell.id === 'cell-1')?.groupId).toBeUndefined()
  await page.evaluate(() => window.__VORONOI_DEBUG__?.redo())
  expect((await snapshot(page)).model.groups[0].memberIds).toEqual(['cell-1', 'cell-2'])
})

test('adds a transient tessellated audit seed, makes room, then pops and promotes it', async ({
  page,
}) => {
  await page.getByTestId('settings-toggle').click()
  await page.getByText('Auto-growth seeds', { exact: true }).click()
  await setNumericBinding(page, 'growth ms', 3000)
  const beforeSeed = await snapshot(page)
  await page.getByText('Add seed', { exact: true }).click()
  await page.waitForTimeout(700)
  const growing = await snapshot(page)
  const seed = growing.model.cells.find((cell) => cell.kind === 'seed')
  expect(seed).toBeDefined()
  expect(seed?.creation.sourceCellIds).toHaveLength(3)
  expect(growing.model.relationships.filter((relation) => relation.sourceId === seed?.id)).toHaveLength(
    3,
  )
  expect(growing.seedProgress[seed?.id ?? '']).toBeGreaterThan(0)
  expect(growing.seedProgress[seed?.id ?? '']).toBeLessThan(1)
  const sources = growing.model.cells.filter((cell) =>
    seed?.creation.sourceCellIds?.includes(cell.id),
  )
  const averageSourceWeight =
    sources.reduce((sum, source) => sum + source.weight, 0) / sources.length
  expect(seed?.weight).toBeCloseTo(averageSourceWeight * 0.125, 6)
  const seedPolygon = growing.cells[seed?.id ?? '']
  const seedWidth =
    Math.max(...seedPolygon.map((point) => point.x)) -
    Math.min(...seedPolygon.map((point) => point.x))
  const seedHeight =
    Math.max(...seedPolygon.map((point) => point.y)) -
    Math.min(...seedPolygon.map((point) => point.y))
  expect(seedWidth).toBeGreaterThan(3)
  expect(seedHeight).toBeGreaterThan(3)
  expect(seedWidth).toBeLessThan(48)
  expect(seedHeight).toBeLessThan(48)
  expect(
    seed?.creation.sourceCellIds?.some(
      (sourceId) =>
        Math.abs(
          polygonArea(growing.cells[sourceId]) -
            polygonArea(beforeSeed.cells[sourceId]),
        ) > 4,
    ),
  ).toBe(true)
  expect(growing.stickyBridges).toBeGreaterThan(0)

  await page.getByTestId('settings-toggle').click()
  await page.waitForTimeout(1400)
  const point = await cellVisualPoint(page, seed?.id ?? '')
  await page.mouse.move(point.x, point.y)
  await expect.poll(async () => (await snapshot(page)).hoveredId).toBe(seed?.id)
  await page.waitForTimeout(250)
  const popped = (await snapshot(page)).breathScales[seed?.id ?? '']
  expect(popped.text).toBe(1)
  expect(Math.abs(popped.cell - 1)).toBeGreaterThan(0.001)

  await page.mouse.click(point.x, point.y)
  await page.waitForTimeout(150)
  const promoted = await snapshot(page)
  const promotedCell = promoted.model.cells.find((cell) => cell.id === seed?.id)
  expect(promotedCell?.kind).toBe('journal')
  expect(promotedCell?.creation.promoted).toBe(true)
  expect(promotedCell?.text.trim().split(/\s+/u).length).toBeGreaterThanOrEqual(5)
  expect(promotedCell?.text.trim().split(/\s+/u).length).toBeLessThanOrEqual(20)
  expect(promotedCell?.incubation.sourceIds).toHaveLength(3)
  expect(promoted.selectedId).toBe(seed?.id)
})

test('manually dies the oldest unexpanded seed from the paired audit controls', async ({
  page,
}) => {
  await page.getByTestId('settings-toggle').click()
  await page.getByText('Auto-growth seeds', { exact: true }).click()
  await setNumericBinding(page, 'expiry shrink ms', 300)
  await page.getByText('Add seed', { exact: true }).click()
  await expect
    .poll(async () => (await snapshot(page)).model.cells.find((cell) => cell.kind === 'seed')?.id)
    .not.toBeUndefined()
  const seedId = (await snapshot(page)).model.cells.find((cell) => cell.kind === 'seed')?.id
  if (!seedId) throw new Error('Expected a manually added seed')
  const addBox = await page.getByText('Add seed', { exact: true }).boundingBox()
  const dieBox = await page.getByText('Die seed', { exact: true }).boundingBox()
  expect(addBox?.y).toBeCloseTo(dieBox?.y ?? -1, 0)
  await page.getByText('Die seed', { exact: true }).click()
  await expect
    .poll(
      async () =>
        (await snapshot(page)).model.cells.some((cell) => cell.id === seedId),
      { timeout: 2500 },
    )
    .toBe(false)
})

test('expires an inactive persisted seed without requiring the audit button', async ({
  page,
}) => {
  expect(await page.evaluate(() => window.__VORONOI_DEBUG__?.forceSeed())).toBe(true)
  const seedId = (await snapshot(page)).model.cells.find(
    (cell) => cell.kind === 'seed',
  )?.id
  if (!seedId) throw new Error('Expected an automatic seed fixture')
  await page.evaluate((id) => {
    const serialized = window.__VORONOI_DEBUG__!.serialize()
    const document = JSON.parse(serialized) as {
      cells: Array<{
        id: string
        expiry: { state: string; createdAtMs?: number; timeoutMs: number }
      }>
    }
    const seed = document.cells.find((cell) => cell.id === id)
    if (!seed) throw new Error('Seed disappeared before expiry setup')
    seed.expiry.state = 'scheduled'
    seed.expiry.createdAtMs = Date.now() - 60_000
    window.__VORONOI_DEBUG__!.load(JSON.stringify(document))
  }, seedId)

  await expect
    .poll(
      async () =>
        (await snapshot(page)).model.cells.some((cell) => cell.id === seedId),
      { timeout: 5000 },
    )
    .toBe(false)
})

test('excludes grouped journals from auto-growth synthesis candidates', async ({ page }) => {
  await groupCells(page, ['cell-1', 'cell-2', 'cell-3'])
  const spawned = await page.evaluate(() => window.__VORONOI_DEBUG__?.forceSeed() ?? false)
  expect(spawned).toBe(true)
  const state = await snapshot(page)
  const seed = state.model.cells.find((cell) => cell.kind === 'seed')
  expect(seed?.creation.sourceCellIds).toHaveLength(3)
  for (const sourceId of seed?.creation.sourceCellIds ?? []) {
    expect(state.model.cells.find((cell) => cell.id === sourceId)?.groupId).toBeUndefined()
  }
})

test('feature-flagged touch gestures select, edit, and enter multi-select', async ({
  page,
}) => {
  await page.goto('/?view=microscope&pointerGestures=1')
  await expect(page.getByTestId('voronoi-canvas')).toHaveAttribute(
    'data-pointer-gestures',
    'enabled',
  )
  const canvas = page.getByTestId('voronoi-canvas')
  const dispatchTouch = (
    type: 'pointerdown' | 'pointerup',
    point: Point2,
    pointerId = 21,
  ) =>
    canvas.dispatchEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      clientX: point.x,
      clientY: point.y,
      buttons: type === 'pointerdown' ? 1 : 0,
    })

  const first = await sitePoint(page, 'cell-1')
  await dispatchTouch('pointerdown', first)
  await dispatchTouch('pointerup', first)
  await expect.poll(async () => (await snapshot(page)).selectedId).toBe('cell-1')
  await dispatchTouch('pointerdown', first)
  await dispatchTouch('pointerup', first)
  await expect(page.getByTestId('cell-editor')).toBeFocused()
  await page.getByTestId('cell-editor').press('Escape')

  const second = await sitePoint(page, 'cell-2')
  await dispatchTouch('pointerdown', first, 22)
  await page.waitForTimeout(540)
  await dispatchTouch('pointerup', first, 22)
  await expect.poll(async () => (await snapshot(page)).selectionMode).toBe('multi')
  await dispatchTouch('pointerdown', second, 23)
  await dispatchTouch('pointerup', second, 23)
  await expect
    .poll(async () => (await snapshot(page)).selectedIds.sort())
    .toEqual(['cell-1', 'cell-2'])
})

test('New Select delays sticky merge, long-press splits, and keeps both reversible', async ({ page }) => {
  await page.getByTestId('tool-select').click()
  const beforeInteraction = await snapshot(page)
  const targetAreaBefore = polygonArea(beforeInteraction.cells['cell-2'])
  const targetSiteBefore = beforeInteraction.model.cells.find(
    (cell) => cell.id === 'cell-2',
  )?.site
  const source = await sitePoint(page, 'cell-1')
  const target = await sitePoint(page, 'cell-2')
  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 2 })
  expect((await snapshot(page)).mergeCandidateId).toBeNull()
  await page.waitForTimeout(220)
  await expect
    .poll(async () => (await snapshot(page)).interactionEffects['cell-2']?.tint ?? 0)
    .toBeGreaterThan(0)
  const activeZoneState = await snapshot(page)
  expect(activeZoneState.interactionEffects['cell-2']?.tint).toBeGreaterThan(0)
  expect(activeZoneState.interactionEffects['cell-2']?.grainBoost).toBeGreaterThan(1)
  expect(activeZoneState.interactionEffects['cell-1']?.cellJitterPx).toBeGreaterThan(0)
  expect(activeZoneState.interactionEffects['cell-2']?.cellJitterPx).toBeGreaterThan(0)
  expect(activeZoneState.interactionEffects['cell-1']?.frequencyHz).toBe(
    activeZoneState.interactionEffects['cell-2']?.frequencyHz,
  )
  expect(
    activeZoneState.model.cells.find((cell) => cell.id === 'cell-2')?.site,
  ).toEqual(targetSiteBefore)
  await page.waitForTimeout(780)
  await expect.poll(async () => (await snapshot(page)).mergeCandidateId).toBe('cell-2')
  await expect.poll(async () => (await snapshot(page)).stickyBridges).toBeGreaterThan(0)
  const stickyState = await snapshot(page)
  expect(stickyState.stickyBridges).toBeGreaterThanOrEqual(2)
  expect(stickyState.stickyBridges).toBeLessThanOrEqual(4)
  expect(polygonArea(stickyState.cells['cell-2'])).toBeGreaterThan(targetAreaBefore * 0.25)
  expect(stickyState.interactionEffects['cell-1']?.cellJitterPx).toBeGreaterThan(0)
  expect(stickyState.interactionEffects['cell-1']?.cellJitterPx).toBeLessThanOrEqual(
    activeZoneState.interactionEffects['cell-1']?.cellJitterPx ?? Number.POSITIVE_INFINITY,
  )
  await page.mouse.up()
  await expect.poll(async () => (await snapshot(page)).cellCount).toBe(11)
  expect(Object.keys((await snapshot(page)).interactionEffects)).toHaveLength(0)
  let state = await snapshot(page)
  const merged = state.model.cells.find((cell) => cell.transformation?.kind === 'merge')
  expect(merged?.transformation?.sourceIds.sort()).toEqual(['cell-1', 'cell-2'])
  expect(state.history.undoDepth).toBeGreaterThan(0)

  await page.getByTestId('settings-toggle').click()
  const undo = page.getByTestId('history-undo')
  const redo = page.getByTestId('history-redo')
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect.poll(async () => (await snapshot(page)).cellCount).toBe(12)
  await expect(redo).toBeEnabled()
  await redo.click()
  await expect.poll(async () => (await snapshot(page)).cellCount).toBe(11)
  await page.getByTestId('settings-toggle').click()

  state = await snapshot(page)
  const splitSource = state.model.cells.find((cell) => cell.transformation?.kind === 'merge')
  const splitPoint = await sitePoint(page, splitSource?.id ?? '')
  await page.mouse.move(splitPoint.x, splitPoint.y)
  await page.mouse.down()
  await page.waitForTimeout(300)
  expect(
    (await snapshot(page)).interactionEffects[splitSource?.id ?? '']?.wallJitterPx,
  ).toBeGreaterThan(0)
  await page.waitForTimeout(850)
  await page.mouse.up()
  await expect.poll(async () => (await snapshot(page)).cellCount).toBeGreaterThan(11)
  state = await snapshot(page)
  const splitCells = state.model.cells.filter((cell) => cell.transformation?.kind === 'split')
  expect(splitCells.length).toBeGreaterThanOrEqual(2)
  expect(splitCells.length).toBeLessThanOrEqual(4)
  expect(Object.keys(state.interactionEffects)).toHaveLength(0)

  await page.evaluate(() => window.__VORONOI_DEBUG__?.undo())
  await expect.poll(async () => (await snapshot(page)).cellCount).toBe(11)
  await page.evaluate(() => window.__VORONOI_DEBUG__?.redo())
  await expect.poll(async () => (await snapshot(page)).cellCount).toBeGreaterThan(11)
})

test('keeps merge affordances static when reduced motion is preferred', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.getByTestId('tool-select').click()
  const source = await sitePoint(page, 'cell-1')
  const target = await sitePoint(page, 'cell-2')
  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 4 })
  await expect
    .poll(async () => (await snapshot(page)).interactionEffects['cell-2']?.tint ?? 0)
    .toBeGreaterThan(0)
  const state = await snapshot(page)
  expect(state.interactionEffects['cell-2']?.tint).toBeGreaterThan(0)
  expect(state.interactionEffects['cell-2']?.grainBoost).toBeGreaterThan(1)
  expect(state.interactionEffects['cell-1']?.cellJitterPx ?? 0).toBe(0)
  expect(state.interactionEffects['cell-2']?.cellJitterPx ?? 0).toBe(0)
  expect(state.interactionEffects['cell-2']?.wallJitterPx ?? 0).toBe(0)
  await page.mouse.up()
})

test('keeps ambient culture motion render-only and adjustable', async ({ page }) => {
  await page.getByTestId('settings-toggle').click()
  await page.getByText('Ambient culture motion', { exact: true }).click()
  await expect(page.getByLabel('ambient motion')).toBeChecked()
  await expect(page.getByLabel('idle amplitude px')).toHaveValue('0.58')
  await expect(page.getByLabel('idle period ms')).toHaveValue('6200')
  await expect(page.getByLabel('phase spread')).toHaveValue('0.42')
  await expect(page.getByRole('textbox', { name: 'coverage', exact: true })).toHaveValue('0.72')
  await setNumericBinding(page, 'idle amplitude px', 3)
  await setNumericBinding(page, 'idle period ms', 1200)
  await setNumericBinding(page, 'coverage', 1)
  await page.getByTestId('settings-toggle').click()
  await page.waitForTimeout(450)

  const before = await snapshot(page)
  expect(before.settings.motion).toMatchObject({
    ambientEnabled: true,
    ambientAmplitudePx: 3,
    ambientPeriodMs: 1200,
    ambientCoverage: 1,
  })
  expect(before.performance.dynamic).toBe(true)
  await page.waitForTimeout(360)
  const after = await snapshot(page)
  expect(after.model.cells.map((cell) => ({ id: cell.id, site: cell.site }))).toEqual(
    before.model.cells.map((cell) => ({ id: cell.id, site: cell.site })),
  )
  expect(
    Math.max(
      ...Object.keys(before.breathScales).map((id) =>
        Math.abs(before.breathScales[id].cell - after.breathScales[id].cell),
      ),
    ),
  ).toBeGreaterThan(0.001)
  expect(
    Math.max(
      ...Object.keys(before.cells).map((id) =>
        maximumDisplacement(before.cells[id], after.cells[id]),
      ),
    ),
  ).toBeGreaterThan(0.03)
})

test('merges and splits members without escaping their hierarchical group', async ({ page }) => {
  await groupCells(page, ['cell-1', 'cell-2'])
  await page.waitForTimeout(900)
  let state = await snapshot(page)
  const groupId = state.model.groups[0]?.id
  if (!groupId) throw new Error('Expected a group')
  expect(state.model.groups[0].container.weight).toBeGreaterThan(
    Math.max(
      ...state.model.cells
        .filter((cell) => cell.groupId === groupId)
        .map((cell) => cell.weight),
    ) + 0.01,
  )
  expect(state.model.groups[0].style.tint).toBe(state.settings.palette.group1)

  await page.getByTestId('tool-select').click()
  const source = await cellVisualPoint(page, 'cell-1')
  const target = await cellVisualPoint(page, 'cell-2')
  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 16 })
  await page.waitForTimeout(780)
  await expect.poll(async () => (await snapshot(page)).mergeCandidateId).toBe('cell-2')
  await page.mouse.up()
  await expect.poll(async () => (await snapshot(page)).cellCount).toBe(11)
  state = await snapshot(page)
  const merged = state.model.cells.find((cell) => cell.transformation?.kind === 'merge')
  expect(merged?.groupId).toBe(groupId)
  expect(state.model.groups[0].memberIds).toContain(merged?.id)

  const splitPoint = await sitePoint(page, merged?.id ?? '')
  await page.mouse.move(splitPoint.x, splitPoint.y)
  await page.mouse.down()
  await page.waitForTimeout(850)
  await page.mouse.up()
  await expect.poll(async () => (await snapshot(page)).cellCount).toBeGreaterThan(11)
  await page.waitForTimeout(1200)
  state = await snapshot(page)
  const splitMembers = state.model.cells.filter((cell) => cell.transformation?.kind === 'split')
  expect(splitMembers.length).toBeGreaterThanOrEqual(2)
  expect(splitMembers.every((cell) => cell.groupId === groupId)).toBe(true)
  expect(splitMembers.every((cell) => state.model.groups[0].memberIds.includes(cell.id))).toBe(true)
  for (const cell of splitMembers) {
    const requirement = state.textRequirements[cell.id]
    const textEffect = state.textEffects[cell.id]
    expect(requirement?.fits || textEffect?.visible === false).toBe(true)
  }
})

test('wall-selects and resizes a group, then individually edits, reorders, and detaches a member', async ({ page }) => {
  test.setTimeout(60_000)
  const firstPoint = await sitePoint(page, 'cell-5')
  await page.mouse.move(firstPoint.x, firstPoint.y)
  await expect.poll(async () => (await snapshot(page)).hoveredId).toBe('cell-5')
  await groupCells(page, ['cell-5', 'cell-9'])
  await page.waitForTimeout(650)
  let state = await snapshot(page)
  const group = state.model.groups[0]
  expect(group.memberIds).toEqual(['cell-5', 'cell-9'])
  expect(state.acquiringGroupId).toBeNull()
  expect(state.groupWalls[group.id].length).toBeGreaterThan(32)
  for (const point of state.groupWalls[group.id]) {
    expect(Math.hypot(point.x - state.field.center.x, point.y - state.field.center.y)).toBeLessThanOrEqual(
      state.field.outerRadius + 1,
    )
  }
  const container = state.groupContainers[group.id]
  for (const cell of state.model.cells.filter((candidate) => !candidate.groupId)) {
    for (const point of state.cells[cell.id] ?? []) {
      expect(pointInPolygon(point, container)).toBe(false)
    }
  }

  await page.keyboard.press('Escape')
  expect((await snapshot(page)).acquiringGroupId).toBeNull()
  await page.getByTestId('tool-select').click()
  await page.keyboard.press('Escape')
  state = await snapshot(page)
  const wall = await visiblePointForSource(page, wallPoint(state, group.id))
  await page.mouse.click(wall.x, wall.y)
  await expect.poll(async () => (await snapshot(page)).selectedGroupId).toBe(group.id)
  state = await snapshot(page)
  expect(state.handles).toHaveLength(4)
  const groupWeightBefore = state.model.groups[0].container.weight
  const rightHandle = state.handles.reduce((right, point) =>
    point.x > right.x ? point : right,
  )
  const visibleHandle = await visiblePointForSource(page, rightHandle)
  await page.mouse.move(visibleHandle.x, visibleHandle.y)
  await page.mouse.down()
  await page.mouse.move(visibleHandle.x + 54, visibleHandle.y, { steps: 12 })
  await page.mouse.up()
  await expect
    .poll(async () => (await snapshot(page)).model.groups[0].container.weight)
    .toBeGreaterThan(groupWeightBefore)

  const memberPoint = await cellVisualPoint(page, 'cell-5')
  await page.mouse.click(memberPoint.x, memberPoint.y)
  await expect.poll(async () => (await snapshot(page)).selectedId).toBe('cell-5')
  expect((await snapshot(page)).selectedGroupId).toBeNull()
  await page.mouse.dblclick(memberPoint.x, memberPoint.y, { delay: 70 })
  const editor = page.getByTestId('cell-editor')
  await expect(editor).toBeFocused()
  await editor.fill('A grouped thought became clearer.')
  await editor.press('Enter')
  expect((await snapshot(page)).model.cells.find((cell) => cell.id === 'cell-5')?.text).toBe(
    'A grouped thought became clearer.',
  )

  await page.waitForTimeout(760)
  state = await snapshot(page)
  const updatedWall = await visiblePointForSource(page, wallPoint(state, group.id))
  await page.mouse.click(updatedWall.x, updatedWall.y)
  await expect.poll(async () => (await snapshot(page)).selectedGroupId).toBe(group.id)
  const reorderStart = await cellVisualPoint(page, 'cell-5')
  await page.mouse.move(reorderStart.x, reorderStart.y)
  await page.mouse.down()
  await page.mouse.move(reorderStart.x + 24, reorderStart.y + 10, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  state = await snapshot(page)
  expect(state.model.groups[0].memberIds).toEqual(['cell-9', 'cell-5'])

  const detachStart = await cellVisualPoint(page, 'cell-5')
  const remainingMember = state.model.cells.find((cell) => cell.id === 'cell-9')
  const awayLength = Math.max(
    0.001,
    Math.hypot(remainingMember?.site.x ?? 0, remainingMember?.site.y ?? 0),
  )
  const detachTarget = await visiblePointForSource(page, {
    x:
      state.field.center.x -
      state.field.radius * ((remainingMember?.site.x ?? 0) / awayLength) * 0.94,
    y:
      state.field.center.y -
      state.field.radius * ((remainingMember?.site.y ?? 0) / awayLength) * 0.94,
  })
  await page.mouse.move(detachStart.x, detachStart.y)
  await page.mouse.down()
  await page.mouse.move(detachTarget.x, detachTarget.y, { steps: 18 })
  await expect.poll(async () => (await snapshot(page)).groupCue?.kind).toBe('detach')
  await expect
    .poll(async () => (await snapshot(page)).groupCue?.ghostStrength ?? 0)
    .toBeGreaterThan(0)
  await page.waitForTimeout(820)
  await expect.poll(async () => (await snapshot(page)).gesture?.pendingDetach).toBe(true)
  expect(await page.evaluate(() => window.__VORONOI_DEBUG__!.serialize()))
    .not.toContain('group-ghost:')
  await page.mouse.up()
  await page.waitForTimeout(250)
  state = await snapshot(page)
  expect(state.model.cells.find((cell) => cell.id === 'cell-5')?.groupId).toBeUndefined()
  expect(state.model.groups[0].memberIds).toEqual(['cell-9'])
})

test('pulls distant members inward, dwell-attaches at the wall, and preserves deep attach', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.getByTestId('settings-toggle').click()
  const panel = page.getByTestId('settings-panel')
  await panel.getByText('Groups', { exact: true }).click()
  await panel.getByText('Join / detach cues', { exact: true }).click()
  for (const label of [
    'join threshold px',
    'detach threshold',
    'dwell ms',
    'cue frequency hz',
    'cell amplitude px',
    'wall amplitude px',
    'stroke excitation px',
    'phase offset',
    'ghost size px',
    'ghost repulsion',
    'ghost response',
    'cue easing',
  ]) {
    await expect(panel.getByText(label, { exact: true })).toBeVisible()
  }
  await setNumericBinding(page, 'dwell ms', 1800)
  await page.getByTestId('settings-toggle').click()
  const initial = await snapshot(page)
  const firstInitial = initial.model.cells.find((cell) => cell.id === 'cell-1')
  const secondInitial = initial.model.cells.find((cell) => cell.id === 'cell-11')
  const initialDistance = Math.hypot(
    (firstInitial?.site.x ?? 0) - (secondInitial?.site.x ?? 0),
    (firstInitial?.site.y ?? 0) - (secondInitial?.site.y ?? 0),
  )

  await groupCells(page, ['cell-1', 'cell-11', 'cell-5'])
  await page.waitForTimeout(1500)
  let state = await snapshot(page)
  const group = state.model.groups[0]
  const firstPulled = state.model.cells.find((cell) => cell.id === 'cell-1')
  const secondPulled = state.model.cells.find((cell) => cell.id === 'cell-11')
  const pulledDistance = Math.hypot(
    (firstPulled?.site.x ?? 0) - (secondPulled?.site.x ?? 0),
    (firstPulled?.site.y ?? 0) - (secondPulled?.site.y ?? 0),
  )
  expect(pulledDistance).toBeLessThan(initialDistance)

  await page.getByTestId('tool-select').click()
  await page.keyboard.press('Escape')
  const nearWall = await visiblePointForSource(page, wallPoint(state, group.id))
  let attachPoint = await sitePoint(page, 'cell-6')
  await page.mouse.move(attachPoint.x, attachPoint.y)
  await page.mouse.down()
  await page.mouse.move(nearWall.x, nearWall.y, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  expect((await snapshot(page)).model.cells.find((cell) => cell.id === 'cell-6')?.groupId).toBeUndefined()
  await expect.poll(async () => (await snapshot(page)).groupCue).toBeNull()

  attachPoint = await cellVisualPoint(page, 'cell-6')
  const dwellWall = await visiblePointForSource(page, wallPoint(await snapshot(page), group.id))
  await page.mouse.move(attachPoint.x, attachPoint.y)
  await page.mouse.down()
  await page.mouse.move(dwellWall.x, dwellWall.y, { steps: 14 })
  await expect
    .poll(async () => (await snapshot(page)).gesture?.attachCandidateGroupId)
    .toBe(group.id)
  await expect.poll(async () => (await snapshot(page)).groupCue?.kind).toBe('join')
  await expect
    .poll(async () => (await snapshot(page)).groupCue?.ghostStrength ?? 0)
    .toBeGreaterThan(0)
  expect(await page.evaluate(() => window.__VORONOI_DEBUG__!.serialize()))
    .not.toContain('group-ghost:')
  await page.mouse.up()
  await expect.poll(async () => (await snapshot(page)).groupCue).toBeNull()
  expect((await snapshot(page)).model.cells.find((cell) => cell.id === 'cell-6')?.groupId)
    .toBeUndefined()
  await page.getByTestId('settings-toggle').click()
  await panel.getByText('Groups', { exact: true }).click()
  await panel.getByText('Join / detach cues', { exact: true }).click()
  await setNumericBinding(page, 'dwell ms', 300)
  await page.getByTestId('settings-toggle').click()

  attachPoint = await cellVisualPoint(page, 'cell-6')
  const armedWall = await visiblePointForSource(page, wallPoint(await snapshot(page), group.id))
  await page.mouse.move(attachPoint.x, attachPoint.y)
  await page.mouse.down()
  await page.mouse.move(armedWall.x, armedWall.y, { steps: 14 })
  await expect
    .poll(async () => (await snapshot(page)).gesture?.attachCandidateGroupId)
    .toBe(group.id)
  await page.waitForTimeout(420)
  await expect
    .poll(async () => (await snapshot(page)).gesture?.attachArmedGroupId)
    .toBe(group.id)
  const armedCue = await snapshot(page)
  expect(armedCue.groupCue?.kind).toBe('join')
  expect(armedCue.groupCue?.strength).toBeGreaterThan(0.7)
  expect(armedCue.groupWallEffects[group.id].strokeWidth).toBeGreaterThan(
    armedCue.settings.group.wallThickness,
  )
  await expect.poll(async () => (await snapshot(page)).stickyBridges).toBeGreaterThan(0)
  await page.mouse.up()
  await expect
    .poll(async () => (await snapshot(page)).model.cells.find((cell) => cell.id === 'cell-6')?.groupId)
    .toBe(group.id)

  state = await snapshot(page)
  attachPoint = await sitePoint(page, 'cell-7')
  const containerPoint = await visiblePointForSource(page, {
    x: state.field.center.x + group.container.site.x * state.field.radius,
    y: state.field.center.y + group.container.site.y * state.field.radius,
  })
  await page.mouse.move(attachPoint.x, attachPoint.y)
  await page.mouse.down()
  await page.mouse.move(containerPoint.x, containerPoint.y, { steps: 20 })
  await page.mouse.up()
  await expect
    .poll(async () => (await snapshot(page)).model.cells.find((cell) => cell.id === 'cell-7')?.groupId)
    .toBe(group.id)
})

test('incubates a resting empty cell with blurred synthesis and reveals it on select', async ({
  page,
}) => {
  await page.getByTestId('settings-toggle').click()
  await page.getByText('Auto-growth seeds', { exact: true }).click()
  await setNumericBinding(page, 'text emerge', 6000)
  await page.getByTestId('settings-toggle').click()
  const before = await snapshot(page)
  const addPoint = {
    x: before.field.center.x - before.field.radius * 0.12,
    y: before.field.center.y + before.field.radius * 0.04,
  }
  await page.getByTestId('tool-add').click()
  await page.mouse.move(addPoint.x, addPoint.y)
  await expect.poll(async () => (await snapshot(page)).previewId).not.toBeNull()
  const previewId = (await snapshot(page)).previewId
  await page.mouse.click(addPoint.x, addPoint.y)
  await page.getByTestId('cell-editor').press('Enter')
  await page.getByTestId('tool-add').click()
  await page.getByTestId('sprout-toggle').click()
  await page.mouse.move(12, 12)
  await page.waitForTimeout(3200)

  let state = await snapshot(page)
  const incubating = state.model.cells.find((cell) => cell.id === previewId)
  expect(incubating?.incubation.state).toBe('incubating')
  expect(incubating?.incubation.sourceIds.length).toBeGreaterThan(0)
  expect(incubating?.text.length).toBeGreaterThan(0)
  expect(state.textEffects[previewId ?? ''].blur).toBe(16)
  expect(state.textEffects[previewId ?? ''].scale).toBeLessThan(1)
  expect(state.incubationProgress[previewId ?? '']).toBeLessThan(1)
  const incubationLayers = await page.evaluate(() => {
    const z = (testId: string) =>
      Number.parseInt(
        getComputedStyle(
          document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!,
        ).zIndex,
        10,
      )
    return {
      source: z('voronoi-canvas'),
      wallNoise: z('wall-texture-canvas'),
      shader: z('microscope-canvas'),
    }
  })
  expect(incubationLayers.source).toBeLessThan(incubationLayers.shader)
  expect(incubationLayers.wallNoise).toBeLessThan(incubationLayers.shader)

  await page.getByTestId('tool-select').click()
  const revealPoint = await cellVisualPoint(page, previewId ?? '')
  await page.mouse.click(revealPoint.x, revealPoint.y)
  await page.waitForTimeout(120)
  state = await snapshot(page)
  expect(state.model.cells.find((cell) => cell.id === previewId)?.incubation.state).toBe(
    'revealed',
  )
  expect(state.textEffects[previewId ?? ''].blur).toBe(0)
  expect(state.incubationProgress[previewId ?? '']).toBe(1)
})

test('feeds fitted text requirements into minimum cell geometry', async ({ page }) => {
  await page.getByTestId('tool-select').click()
  const point = await sitePoint(page, 'cell-5')
  await page.mouse.dblclick(point.x, point.y, { delay: 70 })
  const editor = page.getByTestId('cell-editor')
  await editor.fill(
    'I gave the difficult unresolved question more room and finally noticed a calmer answer taking shape.',
  )
  await editor.press('Enter')
  await expect
    .poll(async () => (await snapshot(page)).textRequirements['cell-5']?.fits, {
      timeout: 5000,
    })
    .toBe(true)
  await page.waitForTimeout(500)
  const state = await snapshot(page)
  const fittedRequirement = state.textRequirements['cell-5']

  expect(fittedRequirement.requiredArea).toBeGreaterThan(0)
  expect(fittedRequirement.actualArea).toBeGreaterThanOrEqual(fittedRequirement.requiredArea * 0.8)
  expect(fittedRequirement.fits).toBe(true)
  expect(state.crowdingScale).toBeGreaterThan(0)
  expect(state.crowdingScale).toBeLessThanOrEqual(1)
})

test('clips cells to the circle and stays fitted at desktop and mobile widths', async ({ page }) => {
  const initial = await snapshot(page)
  const canvas = page.getByTestId('voronoi-canvas')
  await expect(canvas).toHaveCSS('background-color', 'rgb(0, 0, 0)')
  for (const points of Object.values(initial.cells)) {
    for (const point of points) {
      expect(
        Math.hypot(point.x - initial.field.center.x, point.y - initial.field.center.y),
      ).toBeLessThanOrEqual(initial.field.radius + 1)
    }
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(390)
  await page.waitForTimeout(450)
  const mobile = await snapshot(page)
  expect(mobile.cellCount).toBe(initial.cellCount)
  expect(mobile.field.radius).toBeLessThan(initial.field.radius)
  await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toBeVisible()
  for (const id of [
    'history-undo',
    'tool-add',
    'tool-select',
    'autogroup-toggle',
    'list-view-toggle',
  ]) {
    const box = await page.getByTestId(id).boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390)
  }
  await expect(page.getByTestId('settings-toggle')).toBeVisible()
  await page.getByTestId('settings-toggle').click()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
  const panelBox = await page.getByTestId('settings-panel').boundingBox()
  expect(panelBox?.width).toBeLessThanOrEqual(366)
  await expect
    .poll(
      async () => {
        const state = await snapshot(page)
        return Object.entries(state.textRequirements)
          .filter(([id]) => state.model.cells.find((cell) => cell.id === id)?.text.trim())
          .every(
            ([id, requirement]) =>
              requirement.fits && state.textEffects[id]?.visible !== false,
          )
      },
      { timeout: 3000 },
    )
    .toBe(true)
})

test('hides only resize handles blocked by the circular boundary', async ({ page }) => {
  await page.getByTestId('tool-select').click()
  const state = await snapshot(page)
  const boundaryCell = Object.entries(state.cells)
    .map(([id, points]) => ({
      id,
      reach: Math.max(
        ...points.map((point) =>
          Math.hypot(
            point.x - state.field.center.x,
            point.y - state.field.center.y,
          ),
        ),
      ),
    }))
    .sort((first, second) => second.reach - first.reach)[0]
  const point = await cellVisualPoint(page, boundaryCell.id)
  await page.mouse.click(point.x, point.y)
  await page.waitForTimeout(160)
  const selected = await snapshot(page)
  expect(selected.handles.length).toBeGreaterThan(0)
  expect(selected.handles.length).toBeLessThan(4)
  for (const handle of selected.handles) {
    expect(
      Math.hypot(
        handle.x - selected.field.center.x,
        handle.y - selected.field.center.y,
      ),
    ).toBeLessThan(selected.field.radius - 6)
  }
})

test('settles without cyclical motion when reduced motion is preferred', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.waitForTimeout(500)
  await page.getByTestId('tool-select').click()
  const point = await sitePoint(page, 'cell-6')
  await page.mouse.move(point.x, point.y)
  await page.waitForTimeout(500)
  const settled = await snapshot(page)
  await page.waitForTimeout(350)
  const later = await snapshot(page)
  expect(maximumDisplacement(settled.cells['cell-6'], later.cells['cell-6'])).toBeLessThan(0.05)
  expect(later.breathScales['cell-6'].text).toBe(1)
  expect(Math.abs(later.breathScales['cell-6'].cell - settled.breathScales['cell-6'].cell)).toBeLessThan(
    0.001,
  )
})

test('passes an automated accessibility audit with controls expanded', async ({ page }) => {
  await page.getByTestId('settings-toggle').click()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

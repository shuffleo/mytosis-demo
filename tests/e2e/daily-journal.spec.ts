import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function visibleCellPoint(page: Page, cellId: string) {
  const state = await page.evaluate(() => window.__VORONOI_DEBUG__?.snapshot())
  const cell = state?.model.cells.find((candidate) => candidate.id === cellId)
  if (!state || !cell) throw new Error(`Missing cell ${cellId}`)
  const polygon = state.cells[cellId]
  const source = polygon?.length
    ? {
        x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
        y: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length,
      }
    : {
        x: state.field.center.x + cell.site.x * state.field.radius,
        y: state.field.center.y + cell.site.y * state.field.radius,
      }
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

async function selectedDayKey(page: Page) {
  const value = await page
    .locator('.date-rail__day button[aria-pressed="true"]')
    .getAttribute('data-day-key')
  if (!value) throw new Error('Selected day key is missing')
  return value
}

async function nearestPastDay(page: Page, todayKey: string): Promise<Locator> {
  const candidates = page.locator(
    '.date-rail__day button:not(:disabled)[data-date-status="empty"]',
  )
  const count = await candidates.count()
  for (let index = count - 1; index >= 0; index -= 1) {
    const candidate = candidates.nth(index)
    const dayKey = await candidate.getAttribute('data-day-key')
    if (dayKey && dayKey < todayKey) return candidate
  }
  throw new Error('No past day is available in the date rail')
}

function contrastRatio(foreground: string, background: string) {
  const channels = (color: string) =>
    color.match(/\d+(?:\.\d+)?/gu)!.slice(0, 3).map(Number)
  const luminance = (color: string) =>
    channels(color)
      .map((channel) => channel / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      )
      .reduce(
        (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index],
        0,
      )
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('list-view')).toBeVisible()
  await expect(page.getByTestId('date-rail')).toBeVisible()
})

test('starts in list view and presents local-day date states', async ({ page }) => {
  await expect(page.getByTestId('date-rail')).toHaveAttribute('data-theme', 'list')
  const listRailSurface = await page.getByTestId('date-rail').evaluate((rail) => ({
    background: getComputedStyle(rail).backgroundColor,
    border: getComputedStyle(rail).borderStyle,
    radius: getComputedStyle(rail).borderRadius,
    shadow: getComputedStyle(rail).boxShadow,
    position: getComputedStyle(rail.parentElement!).position,
  }))
  expect(listRailSurface).toMatchObject({
    background: 'rgba(0, 0, 0, 0)',
    border: 'none',
    radius: '0px',
    shadow: 'none',
  })
  expect(listRailSurface.position).toBe('sticky')
  await expect(page.getByTestId('date-calendar-trigger')).toHaveCSS(
    'border-radius',
    '0px',
  )
  await expect(page.locator('.date-rail__day button').first()).toHaveCSS(
    'border-radius',
    '0px',
  )
  const toolbarGeometry = await page.locator('.toolbar-dock').evaluate((toolbar) => {
    const capsules = [...toolbar.querySelectorAll<HTMLElement>('.toolbar-capsule')]
    const buttons = [...toolbar.querySelectorAll<HTMLElement>('button')]
    const labeledButtons = [...toolbar.querySelectorAll<HTMLElement>(
      '.toolbar-labeled-button',
    )]
    return {
      capsuleRadii: capsules.map((element) => getComputedStyle(element).borderRadius),
      buttonRadii: buttons.map((element) => getComputedStyle(element).borderRadius),
      dividers: labeledButtons.map(
        (element) => getComputedStyle(element, '::before').content,
      ),
    }
  })
  expect(toolbarGeometry.capsuleRadii.every((radius) => radius === '0px')).toBe(true)
  expect(toolbarGeometry.buttonRadii.every((radius) => radius === '0px')).toBe(true)
  expect(toolbarGeometry.dividers.every((content) => content === 'none')).toBe(true)
  const todayKey = await selectedDayKey(page)
  await expect(
    page.locator(`.date-rail__day button[data-day-key="${todayKey}"]`),
  ).toHaveAttribute('aria-current', 'date')

  const future = page.locator('.date-rail__day.is-future').first()
  await expect(future.locator('button')).toBeDisabled()
  await expect(future).toHaveCSS('opacity', '0.4')

  const emptyPast = await nearestPastDay(page, todayKey)
  await expect(emptyPast.locator('..')).toHaveCSS('opacity', '1')

  const railGeometry = await page.getByTestId('date-rail').evaluate((rail) => {
    const month = rail.querySelector('.date-rail__month')!.getBoundingClientRect()
    const days = rail.querySelector('.date-rail__days')!.getBoundingClientRect()
    return {
      groupCenter: (month.left + days.right) / 2,
      viewportCenter: window.innerWidth / 2,
    }
  })
  expect(Math.abs(railGeometry.groupCenter - railGeometry.viewportCenter)).toBeLessThan(3)

  const selected = page.locator('.date-rail__day button[aria-pressed="true"]')
  await selected.hover()
  const selectedColors = await selected.evaluate((element) => {
    const style = getComputedStyle(element)
    return { color: style.color, background: style.backgroundColor }
  })
  expect(contrastRatio(selectedColors.color, selectedColors.background)).toBeGreaterThanOrEqual(
    4.5,
  )

  await page.getByTestId('return-microscope').click()
  await expect(page.getByTestId('voronoi-canvas')).toBeVisible()
  await expect(page.getByTestId('date-rail')).toHaveAttribute(
    'data-theme',
    'microscope',
  )
  await expect(page.getByTestId('date-rail')).toHaveCSS(
    'background-color',
    'rgb(0, 0, 0)',
  )
  const microscopeToolbarGeometry = await page.locator('.toolbar-dock').evaluate((toolbar) => {
    const labeledButtons = [...toolbar.querySelectorAll<HTMLElement>(
      '.toolbar-labeled-button',
    )]
    const active = toolbar.querySelector<HTMLElement>('.is-active-tool')
    return {
      buttonRadii: [...toolbar.querySelectorAll<HTMLElement>('button')].map(
        (element) => getComputedStyle(element).borderRadius,
      ),
      dividers: labeledButtons.map(
        (element) => getComputedStyle(element, '::before').content,
      ),
      activeUnderlineRadius: active
        ? getComputedStyle(active, '::after').borderRadius
        : null,
    }
  })
  expect(
    microscopeToolbarGeometry.buttonRadii.every((radius) => radius === '0px'),
  ).toBe(true)
  expect(
    microscopeToolbarGeometry.dividers.every((content) => content === 'none'),
  ).toBe(true)
  expect(microscopeToolbarGeometry.activeUnderlineRadius).toBe('0px')
  const microscopeGeometry = await page.getByTestId('date-rail').evaluate((rail) => {
    const month = rail.querySelector('.date-rail__month')!.getBoundingClientRect()
    const days = rail.querySelector('.date-rail__days')!.getBoundingClientRect()
    return {
      groupCenter: (month.left + days.right) / 2,
      viewportCenter: window.innerWidth / 2,
    }
  })
  expect(Math.abs(microscopeGeometry.groupCenter - microscopeGeometry.viewportCenter)).toBeLessThan(
    3,
  )
  const microscopeSelected = page.locator(
    '.date-rail__day button[aria-pressed="true"]',
  )
  await microscopeSelected.hover()
  const microscopeColors = await microscopeSelected.evaluate((element) => {
    const style = getComputedStyle(element)
    return { color: style.color, background: style.backgroundColor }
  })
  expect(
    contrastRatio(microscopeColors.color, microscopeColors.background),
  ).toBeGreaterThanOrEqual(4.5)
})

test('preserves independent pages when switching dates', async ({ page }) => {
  const todayKey = await selectedDayKey(page)
  const past = await nearestPastDay(page, todayKey)
  const pastKey = await past.getAttribute('data-day-key')
  if (!pastKey) throw new Error('Past day key is missing')

  await past.click()
  const pastEditor = page.locator('[data-list-cell]').first()
  await expect(pastEditor).toHaveValue('')
  await expect(pastEditor).toBeFocused()
  await pastEditor.fill('A note that belongs only to this earlier day.')
  await page.getByTestId('date-calendar-trigger').click()
  await page.keyboard.press('Escape')
  await expect(page.locator(`.date-rail__day button[data-day-key="${pastKey}"]`).locator('..'))
    .toHaveClass(/is-content/)

  await page.locator(`.date-rail__day button[data-day-key="${todayKey}"]`).click()
  await expect(page.locator('[data-list-cell]').first()).not.toHaveValue(
    'A note that belongs only to this earlier day.',
  )

  await page.locator(`.date-rail__day button[data-day-key="${pastKey}"]`).click()
  await expect(page.locator('[data-list-cell]').first()).toHaveValue(
    'A note that belongs only to this earlier day.',
  )
})

test('travels through days directionally and supports wheel plus Today recovery', async ({
  page,
}) => {
  const todayKey = await selectedDayKey(page)
  const past = await nearestPastDay(page, todayKey)
  const pastKey = await past.getAttribute('data-day-key')
  if (!pastKey) throw new Error('Past day key is missing')

  await past.click()
  await expect(page.locator('.app-shell')).toHaveClass(/date-transition-backward-/)
  await expect(page.locator('.date-rail__days')).toHaveAttribute(
    'data-travel-direction',
    'backward',
  )
  expect(
    await page.locator('.date-rail__days').evaluate(
      (element) => element.getAnimations().length,
    ),
  ).toBeGreaterThan(0)
  const listSlide = await page.getByTestId('list-view').evaluate((view) => {
    const animation = getComputedStyle(view)
    const matrix = new DOMMatrixReadOnly(animation.transform)
    return {
      animationName: animation.animationName,
      timingFunction: animation.animationTimingFunction,
      scaleX: matrix.a,
      skewY: matrix.b,
      skewX: matrix.c,
      scaleY: matrix.d,
    }
  })
  expect(listSlide).toMatchObject({
    timingFunction: 'linear',
    scaleX: 1,
    skewY: 0,
    skewX: 0,
    scaleY: 1,
  })
  expect(listSlide.animationName).toMatch(/^journal-list-day-backward-(out|in)$/)
  const transitionSurfaces = await page.evaluate(() => {
    const shell = getComputedStyle(document.querySelector('.app-shell')!)
    const page = getComputedStyle(document.querySelector('.list-editor')!)
    return {
      shellBackground: shell.backgroundImage,
      pageBackground: page.backgroundImage,
      divider: page.boxShadow,
    }
  })
  expect(transitionSurfaces.shellBackground).toBe(
    transitionSurfaces.pageBackground,
  )
  expect(transitionSurfaces.divider).not.toBe('none')
  await expect.poll(() => selectedDayKey(page)).toBe(pastKey)
  await expect(page.locator('.app-shell')).not.toHaveClass(/date-transition-/)
  const todayButton = page.getByTestId('date-rail-today')
  await expect(todayButton).toBeVisible()
  await expect(todayButton).toBeEnabled()
  await expect(todayButton).toHaveCSS('border-radius', '0px')
  await expect(
    page.locator(`.date-rail__day button[data-day-key="${todayKey}"] .date-rail__today-dot`),
  ).toBeVisible()
  const attachedGeometry = await page.getByTestId('date-rail').evaluate((rail) => {
    const railBox = rail.getBoundingClientRect()
    const todayBox = rail.querySelector('.date-rail__today')!.getBoundingClientRect()
    return railBox.right - todayBox.right
  })
  expect(attachedGeometry).toBeLessThanOrEqual(7)

  await page.getByTestId('date-rail').dispatchEvent('wheel', { deltaY: 80 })
  await page.waitForTimeout(100)
  expect(await selectedDayKey(page)).toBe(pastKey)
  await page.getByTestId('date-rail').dispatchEvent('wheel', { deltaX: 80 })
  await expect(page.locator('.app-shell')).toHaveClass(/date-transition-forward-/)
  await expect.poll(() => selectedDayKey(page)).toBe(todayKey)

  await expect(page.locator('.app-shell')).not.toHaveClass(/date-transition-/)
  const earliestVisible = page.locator('.date-rail__day button:not(:disabled)').first()
  const earliestKey = await earliestVisible.getAttribute('data-day-key')
  if (!earliestKey) throw new Error('Earliest visible day is missing')
  await earliestVisible.click()
  await expect.poll(() => selectedDayKey(page)).toBe(earliestKey)
  await expect(page.locator('.app-shell')).not.toHaveClass(/date-transition-/)
  const nextEarliestVisible = page.locator('.date-rail__day button:not(:disabled)').first()
  const nextEarliestKey = await nextEarliestVisible.getAttribute('data-day-key')
  if (!nextEarliestKey) throw new Error('Next earliest visible day is missing')
  await nextEarliestVisible.click()
  await expect.poll(() => selectedDayKey(page)).toBe(nextEarliestKey)
  await expect(todayButton).toBeVisible()
  await expect(todayButton).toBeEnabled()
  await todayButton.click()
  await expect.poll(() => selectedDayKey(page)).toBe(todayKey)
})

test('coalesces rapid date travel and settles the rail without overshoot', async ({
  page,
}) => {
  const todayKey = await selectedDayKey(page)
  const selectable = page.locator('.date-rail__day button:not(:disabled)')
  const first = selectable.nth(1)
  const second = selectable.nth(3)
  const firstKey = await first.getAttribute('data-day-key')
  const secondKey = await second.getAttribute('data-day-key')
  if (!firstKey || !secondKey || firstKey === todayKey || secondKey === todayKey) {
    throw new Error('Rapid travel fixtures are missing')
  }
  await first.click()
  await page.waitForTimeout(70)
  await second.click()
  await expect.poll(() => selectedDayKey(page)).toBe(secondKey)
  await expect(page.locator('.app-shell')).not.toHaveClass(/date-transition-/)
  await expect
    .poll(() =>
      page.locator('.date-rail__days').evaluate((element) => {
        const transform = getComputedStyle(element).transform
        return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41
      }),
    )
    .toBe(0)
})

test('makes date travel immediate when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  const todayKey = await selectedDayKey(page)
  const past = await nearestPastDay(page, todayKey)
  const pastKey = await past.getAttribute('data-day-key')
  if (!pastKey) throw new Error('Past day key is missing')
  await past.click()
  await expect.poll(() => selectedDayKey(page)).toBe(pastKey)
  await expect(page.locator('.app-shell')).not.toHaveClass(/date-transition-/)
  expect(
    await page.locator('.date-rail__days').evaluate(
      (element) => element.getAnimations().length,
    ),
  ).toBe(0)
})

test('keeps a selected microscope palette global across day pages', async ({ page }) => {
  await page.getByTestId('return-microscope').click()
  await expect(page.getByTestId('voronoi-canvas')).toBeVisible()
  await page.getByTestId('settings-toggle').click()
  await page.getByText('Palette', { exact: true }).click()
  await page.getByLabel('preset').selectOption({
    label: 'Organelle night · Violet / viridian',
  })
  const expectedExterior = await page.evaluate(
    () => window.__VORONOI_DEBUG__!.snapshot().settings.palette.exterior,
  )
  await page.getByTestId('settings-toggle').click()

  const todayKey = await selectedDayKey(page)
  const past = await nearestPastDay(page, todayKey)
  await past.click()
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__VORONOI_DEBUG__!.snapshot().settings.palette.exterior,
      ),
    )
    .toBe(expectedExterior)
})

test('clears persisted journal pages with the confirmation-backed sidebar reset', async ({
  page,
}) => {
  const todayKey = await selectedDayKey(page)
  const past = await nearestPastDay(page, todayKey)
  const pastKey = await past.getAttribute('data-day-key')
  if (!pastKey) throw new Error('Past day key is missing')
  await past.click()
  await expect.poll(() => selectedDayKey(page)).toBe(pastKey)
  await page.locator('[data-list-cell]').first().fill('Temporary local journal data.')
  await page.getByTestId('date-calendar-trigger').click()
  await page.keyboard.press('Escape')
  await page.reload()
  const restoredPast = page.locator(
    `.date-rail__day button[data-day-key="${pastKey}"]`,
  )
  await restoredPast.click()
  await expect.poll(() => selectedDayKey(page)).toBe(pastKey)
  await expect(page.locator('[data-list-cell]').first()).toHaveValue(
    'Temporary local journal data.',
  )

  await page.getByTestId('return-microscope').click()
  await expect(page.getByTestId('voronoi-canvas')).toBeVisible()
  await page.getByTestId('settings-toggle').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByTestId('start-anew').click()

  await expect(page.getByTestId('list-view')).toBeVisible()
  await expect(page.locator('[data-list-cell]').first()).not.toHaveValue(
    'Temporary local journal data.',
  )
  const ownedKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith('mytosis.daily-journal')),
  )
  expect(ownedKeys.every((key) => !key.includes(pastKey))).toBe(true)
})

test('shares undo and redo with the bullet toolbar', async ({ page }) => {
  const editor = page.locator('[data-list-cell]').first()
  const original = await editor.inputValue()
  const changed = 'A reversible journal edit from the bullet view.'

  await editor.fill(changed)
  await page.getByTestId('date-calendar-trigger').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('history-undo')).toBeEnabled()
  await page.getByTestId('history-undo').click()
  await expect(page.locator('[data-list-cell]').first()).toHaveValue(original)
  await expect(page.getByTestId('history-redo')).toBeEnabled()
  await page.getByTestId('history-redo').click()
  await expect(page.locator('[data-list-cell]').first()).toHaveValue(changed)
})

test('preserves an active microscope edit during keyboard date switching', async ({
  page,
}) => {
  await page.goto('/?view=microscope')
  await page.getByTestId('tool-select').click()
  const point = await visibleCellPoint(page, 'cell-4')
  await page.mouse.dblclick(point.x, point.y, { delay: 70 })
  const editor = page.getByTestId('cell-editor')
  const draft = 'A focused edit preserved before leaving the day.'
  await editor.fill(draft)

  const todayKey = await selectedDayKey(page)
  const past = await nearestPastDay(page, todayKey)
  await past.focus()
  await page.keyboard.press('Enter')
  await expect(editor).toBeHidden()

  const today = page.locator(
    `.date-rail__day button[data-day-key="${todayKey}"]`,
  )
  await today.focus()
  await page.keyboard.press('Enter')
  await expect
    .poll(async () =>
      page.evaluate(
        (expected) =>
          window.__VORONOI_DEBUG__
            ?.snapshot()
            .model.cells.find((cell) => cell.id === 'cell-4')?.text === expected,
        draft,
      ),
    )
    .toBe(true)
})

test('opens an empty microscope day in inline typing mode without model drift', async ({
  page,
}) => {
  await page.goto('/?view=microscope')
  const todayKey = await selectedDayKey(page)
  const past = await nearestPastDay(page, todayKey)
  await past.click()

  const editor = page.getByTestId('cell-editor')
  await expect(editor).toBeVisible()
  await expect(editor).toHaveAttribute('data-presentation', 'inline')
  await expect(editor).toBeFocused()
  const before = await page.evaluate(() => window.__VORONOI_DEBUG__!.snapshot())
  const cell = before.model.cells.find((candidate) => candidate.kind === 'journal')
  if (!cell) throw new Error('Empty date cell is missing')
  expect(before.textLayouts[cell.id]?.lineCount).toBeGreaterThan(0)
  await expect(page.getByTestId('focus-edit-dismiss')).toHaveCount(0)
  await expect(page.getByTestId('voronoi-canvas')).toHaveCSS('cursor', 'default')
  const draft = Array.from(
    { length: 32 },
    (_, index) => `growing thought ${index + 1}`,
  ).join(' ')
  await editor.fill(draft)
  const editorBox = await editor.boundingBox()
  if (!editorBox) throw new Error('Inline editor bounds are missing')
  await page.mouse.click(
    editorBox.x + editorBox.width * 0.28,
    editorBox.y + editorBox.height * 0.5,
  )
  const firstCaret = await editor.evaluate((element) => element.selectionStart)
  await page.mouse.click(
    editorBox.x + editorBox.width * 0.72,
    editorBox.y + editorBox.height * 0.5,
  )
  const secondCaret = await editor.evaluate((element) => element.selectionStart)
  expect(secondCaret).not.toBe(firstCaret)
  expect((await page.evaluate(() => window.__VORONOI_DEBUG__!.snapshot())).editingCaretIndex)
    .toBe(secondCaret)
  const during = await page.evaluate(() => window.__VORONOI_DEBUG__!.snapshot())
  expect(during.model.cells.find((candidate) => candidate.id === cell.id)?.site).toEqual(
    cell.site,
  )
  await editor.press('Enter')
  await expect
    .poll(async () =>
      page.evaluate(
        ({ cellId, text }) =>
          window.__VORONOI_DEBUG__!
            .snapshot()
            .model.cells.find((candidate) => candidate.id === cellId)?.text === text,
        { cellId: cell.id, text: draft },
      ),
    )
    .toBe(true)
})

test('maps focused clicks to the rendered caret and keeps inline outside clicks selectable', async ({
  page,
}) => {
  await page.goto('/?view=microscope')
  await page.getByTestId('tool-select').click()
  const focusedPoint = await visibleCellPoint(page, 'cell-4')
  await page.mouse.dblclick(focusedPoint.x, focusedPoint.y, { delay: 70 })
  const focusedEditor = page.getByTestId('cell-editor')
  await focusedEditor.fill('alpha beta gamma delta epsilon')
  const focusedBox = await focusedEditor.boundingBox()
  if (!focusedBox) throw new Error('Focused editor bounds are missing')
  const focusedFirstLineY = await focusedEditor.evaluate((element) => {
    const style = getComputedStyle(element)
    const matrix = new DOMMatrixReadOnly(style.transform)
    const scale = Math.hypot(matrix.a, matrix.b)
    return Number.parseFloat(style.lineHeight) * scale * 0.65
  })
  await page.mouse.click(
    focusedBox.x + focusedBox.width * 0.25,
    focusedBox.y + focusedFirstLineY,
  )
  const focusedSelection = await focusedEditor.evaluate(
    (element) => element.selectionStart,
  )
  expect(focusedSelection).toBeLessThan('alpha beta gamma delta epsilon'.length)
  expect(
    (await page.evaluate(() => window.__VORONOI_DEBUG__!.snapshot()))
      .editingCaretIndex,
  ).toBe(focusedSelection)
  await page.getByTestId('focus-edit-dismiss').click({ position: { x: 2, y: 2 } })

  await page.getByTestId('tool-add').click()
  const field = await page.evaluate(() => window.__VORONOI_DEBUG__!.snapshot().field)
  await page.mouse.click(field.center.x, field.center.y)
  const inlineEditor = page.getByTestId('cell-editor')
  await expect(inlineEditor).toHaveAttribute('data-presentation', 'inline')
  await expect(page.getByTestId('focus-edit-dismiss')).toHaveCount(0)
  const originalCell = await visibleCellPoint(page, 'cell-1')
  await page.mouse.click(originalCell.x, originalCell.y)
  await expect
    .poll(() =>
      page.evaluate(() => window.__VORONOI_DEBUG__!.snapshot().selectedId),
    )
    .not.toBe('cell-13')
  expect(
    await page.evaluate(() => window.__VORONOI_DEBUG__!.snapshot().selectedId),
  ).not.toBeNull()
})

test('uses native caret geometry across focused zoom, DPR, and font sizes', async ({
  browser,
}) => {
  test.setTimeout(45_000)
  const context = await browser.newContext({
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  try {
    await page.goto('/?view=microscope')
    await page.getByTestId('tool-select').click()
    const point = await visibleCellPoint(page, 'cell-4')
    await page.mouse.dblclick(point.x, point.y, { delay: 70 })
    const editor = page.getByTestId('cell-editor')
    await expect(editor).toBeFocused()
    await expect
      .poll(async () => page.locator('.voronoi-stage').getAttribute('data-focus-phase'))
      .toBe('editing')
    await editor.fill('alpha beta gamma delta epsilon zeta eta theta')

    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2)
    expect(
      await page.evaluate(
        () => window.__VORONOI_DEBUG__?.postProcess()?.focusScene.scale ?? 1,
      ),
    ).toBeGreaterThan(1)

    for (const fontSize of [9, 13, 17]) {
      await editor.evaluate((element, size) => {
        element.style.setProperty('font-size', `${size}px`, 'important')
        element.style.setProperty('line-height', `${size * 1.22}px`, 'important')
        element.style.setProperty('padding-block', '0', 'important')
      }, fontSize)
      const box = await editor.boundingBox()
      if (!box) throw new Error('Native editor bounds are missing')
      const firstLineY = await editor.evaluate((element) => {
        const style = getComputedStyle(element)
        const matrix = new DOMMatrixReadOnly(style.transform)
        const scale = Math.hypot(matrix.a, matrix.b)
        return Number.parseFloat(style.lineHeight) * scale * 0.65
      })
      await page.mouse.click(box.x + box.width * 0.22, box.y + firstLineY)
      const left = await editor.evaluate((element) => element.selectionStart)
      await page.mouse.click(box.x + box.width * 0.78, box.y + firstLineY)
      const right = await editor.evaluate((element) => element.selectionStart)
      expect(right, `font size ${fontSize}px`).toBeGreaterThan(left)
    }

    const selectionBox = await editor.boundingBox()
    if (!selectionBox) throw new Error('Native editor selection bounds are missing')
    const selectionLineY = await editor.evaluate((element) => {
      const style = getComputedStyle(element)
      const matrix = new DOMMatrixReadOnly(style.transform)
      const scale = Math.hypot(matrix.a, matrix.b)
      return Number.parseFloat(style.lineHeight) * scale * 0.65
    })
    await page.mouse.move(
      selectionBox.x + selectionBox.width * 0.2,
      selectionBox.y + selectionLineY,
    )
    await page.mouse.down()
    await page.mouse.move(
      selectionBox.x + selectionBox.width * 0.8,
      selectionBox.y + selectionLineY,
      { steps: 8 },
    )
    await page.mouse.up()
    const selection = await editor.evaluate((element) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
      spellcheck: element.spellcheck,
      pointerEvents: getComputedStyle(element).pointerEvents,
    }))
    expect(selection.end).toBeGreaterThan(selection.start)
    expect(selection.spellcheck).toBe(true)
    expect(selection.pointerEvents).toBe('auto')
  } finally {
    await context.close()
  }
})

test('popup calendar supports keyboard navigation and passes accessibility checks', async ({
  page,
}) => {
  const trigger = page.getByTestId('date-calendar-trigger')
  await trigger.click()
  const calendar = page.getByTestId('date-calendar')
  await expect(calendar).toBeVisible()
  const focusedBefore = await page.locator('.date-calendar button:focus').getAttribute('data-day-key')
  await page.keyboard.press('ArrowLeft')
  const focusedAfter = await page.locator('.date-calendar button:focus').getAttribute('data-day-key')
  expect(focusedAfter).not.toBe(focusedBefore)
  await page.keyboard.press('Escape')
  await expect(calendar).toBeHidden()
  await expect(trigger).toBeFocused()

  await trigger.click()
  const results = await new AxeBuilder({ page }).include('[data-testid="date-rail"]').analyze()
  expect(results.violations).toEqual([])
})

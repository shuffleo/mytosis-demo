import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function visibleCellPoint(page: Page, cellId: string) {
  const state = await page.evaluate(() => window.__VORONOI_DEBUG__?.snapshot())
  const cell = state?.model.cells.find((candidate) => candidate.id === cellId)
  if (!state || !cell) throw new Error(`Missing cell ${cellId}`)
  const source = {
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
  const todayKey = await selectedDayKey(page)
  await expect(
    page.locator(`.date-rail__day button[data-day-key="${todayKey}"]`),
  ).toHaveAttribute('aria-current', 'date')

  const future = page.locator('.date-rail__day.is-future').first()
  await expect(future.locator('button')).toBeDisabled()
  await expect(future).toHaveCSS('opacity', '0.4')

  const emptyPast = await nearestPastDay(page, todayKey)
  await expect(emptyPast.locator('..')).toHaveCSS('opacity', '0.6')

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

test('clears persisted journal pages with the confirmation-backed sidebar reset', async ({
  page,
}) => {
  const todayKey = await selectedDayKey(page)
  const past = await nearestPastDay(page, todayKey)
  const pastKey = await past.getAttribute('data-day-key')
  if (!pastKey) throw new Error('Past day key is missing')
  await past.click()
  await page.locator('[data-list-cell]').first().fill('Temporary local journal data.')
  await page.getByTestId('date-calendar-trigger').click()
  await page.keyboard.press('Escape')
  await page.reload()
  await page.locator(`.date-rail__day button[data-day-key="${pastKey}"]`).click()
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
  const draft = Array.from(
    { length: 32 },
    (_, index) => `growing thought ${index + 1}`,
  ).join(' ')
  await editor.fill(draft)
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

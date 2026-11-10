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
})

test('preserves independent pages when switching dates', async ({ page }) => {
  const todayKey = await selectedDayKey(page)
  const past = await nearestPastDay(page, todayKey)
  const pastKey = await past.getAttribute('data-day-key')
  if (!pastKey) throw new Error('Past day key is missing')

  await past.click()
  const pastEditor = page.locator('[data-list-cell]').first()
  await expect(pastEditor).toHaveValue('')
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

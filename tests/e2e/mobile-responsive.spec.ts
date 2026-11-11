import { expect, test, type Page } from '@playwright/test'

async function visibleCellPoint(page: Page, cellId: string) {
  const state = await page.evaluate(() => window.__VORONOI_DEBUG__?.snapshot())
  const cell = state?.model.cells.find((candidate) => candidate.id === cellId)
  if (!state || !cell) throw new Error(`Missing ${cellId}`)
  const source = {
    x: state.field.center.x + cell.site.x * state.field.radius,
    y: state.field.center.y + cell.site.y * state.field.radius,
  }
  let visible = { ...source }
  for (let iteration = 0; iteration < 7; iteration += 1) {
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

test.beforeEach(async ({ page }) => {
  await page.goto('/?view=microscope&pointerGestures=1')
  await expect(page.getByTestId('voronoi-canvas')).toBeVisible()
  await page.waitForTimeout(350)
})

test('keeps responsive chrome reachable without covering the field', async ({
  page,
}, testInfo) => {
  const shell = page.locator('.app-shell')
  const layoutClass = await shell.getAttribute('data-layout-class')
  if (testInfo.project.name === 'phone-landscape-touch') {
    expect(layoutClass).toBe('compact-landscape')
  } else if (
    testInfo.project.name === 'phone-touch' ||
    testInfo.project.name === 'small-android-touch' ||
    testInfo.project.name === 'phone-reduced-motion'
  ) {
    expect(layoutClass).toBe('compact-portrait')
  } else if (testInfo.project.name === 'tablet-touch-keyboard') {
    expect(layoutClass).toBe('medium')
  } else {
    expect(layoutClass).toBe('expanded')
  }

  const field = await page.evaluate(() => window.__VORONOI_DEBUG__!.snapshot().field)
  expect(field.center.x - field.outerRadius).toBeGreaterThanOrEqual(0)
  expect(field.center.y - field.outerRadius).toBeGreaterThanOrEqual(0)
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('Viewport is missing')
  expect(field.center.x + field.outerRadius).toBeLessThanOrEqual(viewport.width)
  expect(field.center.y + field.outerRadius).toBeLessThanOrEqual(viewport.height)

  if (testInfo.project.name !== 'desktop-chromium') {
    const boxes = await page
      .getByRole('toolbar', { name: 'Canvas tools' })
      .locator('button')
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect()
          return { width: box.width, height: box.height }
        }),
      )
    expect(boxes.every((box) => box.width >= 44 && box.height >= 44)).toBe(true)
  }
})

test('supports touch select, second-tap edit, and orientation persistence', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium')
  const point = await visibleCellPoint(page, 'cell-4')
  await page.touchscreen.tap(point.x, point.y)
  await expect
    .poll(() =>
      page.evaluate(() => window.__VORONOI_DEBUG__!.snapshot().selectedId),
    )
    .toBe('cell-4')
  await page.touchscreen.tap(point.x, point.y)
  await expect(page.getByTestId('cell-editor')).toBeFocused()
  await page.getByTestId('cell-editor').fill('Draft survives orientation')

  const viewport = page.viewportSize()
  if (!viewport) throw new Error('Viewport is missing')
  await page.setViewportSize({ width: viewport.height, height: viewport.width })
  await expect(page.getByTestId('cell-editor')).toHaveValue(
    'Draft survives orientation',
  )
  await page.getByTestId('editor-accessory-bar').getByRole('button', {
    name: 'Done',
  }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__VORONOI_DEBUG__!
            .snapshot()
            .model.cells.find((cell) => cell.id === 'cell-4')?.text,
      ),
    )
    .toBe('Draft survives orientation')
})

test('uses immediate date changes in the reduced-motion phone project', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-reduced-motion')
  await page.getByTestId('list-view-toggle').click()
  const active = page.locator('.date-rail__day button[aria-pressed="true"]')
  const currentKey = await active.getAttribute('data-day-key')
  const past = page.locator(
    '.date-rail__day button:not(:disabled)[data-date-status="empty"]',
  ).first()
  const pastKey = await past.getAttribute('data-day-key')
  if (!currentKey || !pastKey) throw new Error('Date fixtures are missing')
  await past.click()
  await expect(
    page.locator(`.date-rail__day button[data-day-key="${pastKey}"]`),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.app-shell')).not.toHaveClass(/date-transition-/)
  expect(
    await page.locator('.date-rail__days').evaluate(
      (element) => element.getAnimations().length,
    ),
  ).toBe(0)
})

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function debugSnapshot(page: Page) {
  return page.evaluate(() => window.__VORONOI_DEBUG__?.snapshot())
}

async function serialized(page: Page) {
  return page.evaluate(() => window.__VORONOI_DEBUG__?.serialize() ?? '')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('voronoi-canvas')).toBeVisible()
  await page.waitForTimeout(500)
})

test('autogroup blocks all work, pulses geometry only, and cancels exactly', async ({ page }) => {
  await page.getByTestId('settings-toggle').click()
  const before = await serialized(page)
  await page.getByTestId('tool-group').click()
  await expect(page.getByTestId('autogroup-toggle')).toHaveAttribute(
    'aria-label',
    'Start local autogroup',
  )
  await page.getByTestId('autogroup-toggle').click()
  await expect(page.getByTestId('clustering-status')).toBeVisible()
  await expect(page.getByTestId('autogroup-toggle')).toHaveAttribute(
    'aria-label',
    'Cancel autogroup',
  )
  await expect(page.getByTestId('tool-add')).toBeDisabled()
  await expect(page.getByTestId('settings-toggle')).toBeDisabled()
  await expect(page.getByTestId('settings-panel')).toBeHidden()
  await expect(page.getByTestId('voronoi-canvas')).toHaveAttribute('tabindex', '-1')

  await page.waitForTimeout(250)
  const processing = await debugSnapshot(page)
  const scales = Object.values(processing?.breathScales ?? {})
  expect(scales.some((scale) => Math.abs(scale.cell - 1) > 0.0001)).toBe(true)
  expect(processing?.blocked).toBe(true)
  expect(processing?.clusteringWave).toBe(true)
  expect(Object.values(processing?.breathScales ?? {}).every((scale) => scale.text === 1)).toBe(
    true,
  )

  await page.keyboard.press('Escape')
  await page.getByTestId('autogroup-toggle').click()
  await expect(page.getByTestId('clustering-status')).toBeHidden()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
  expect(await serialized(page)).toBe(before)
  expect((await debugSnapshot(page))?.blocked).toBe(false)
})

test('autogroup persists provenance, grows walls, and is one undoable command', async ({
  page,
}) => {
  const before = await serialized(page)
  await page.getByTestId('tool-group').click()
  await page.getByTestId('autogroup-toggle').click()
  await expect(page.getByTestId('clustering-status')).toBeVisible()
  await expect(page.getByTestId('clustering-status')).toBeHidden({ timeout: 10_000 })
  await expect
    .poll(async () => (await debugSnapshot(page))?.model.groups.length ?? 0)
    .toBeGreaterThan(0)
  await expect
    .poll(async () => Object.keys((await debugSnapshot(page))?.groupWalls ?? {}).length)
    .toBeGreaterThan(0)
  await expect
    .poll(
      async () => {
        const requirements = Object.values((await debugSnapshot(page))?.textRequirements ?? {})
        return requirements.length > 0 && requirements.every((requirement) => requirement.fits)
      },
      { timeout: 6_000 },
    )
    .toBe(true)
  await expect
    .poll(
      async () => {
        const before = (await debugSnapshot(page))?.groupWalls ?? {}
        await page.waitForTimeout(500)
        const after = (await debugSnapshot(page))?.groupWalls ?? {}
        let movement = 0
        for (const [groupId, points] of Object.entries(after)) {
          const prior = before[groupId] ?? []
          for (const [index, point] of points.entries()) {
            const previous = prior[index] ?? point
            movement = Math.max(
              movement,
              Math.hypot(point.x - previous.x, point.y - previous.y),
            )
          }
        }
        return movement
      },
      { timeout: 8_000 },
    )
    .toBeLessThan(0.25)

  const settled = await debugSnapshot(page)
  if (!settled) throw new Error('Missing settled clustering snapshot')
  for (const cell of settled.model.cells.filter((candidate) => candidate.text.trim())) {
    const requirement = settled.textRequirements[cell.id]
    const effect = settled.textEffects[cell.id]
    expect(requirement?.fits || effect?.visible === false).toBe(true)
  }

  const document = JSON.parse(await serialized(page)) as {
    groups: Array<{ provenance: { source: string; provider?: string; seed?: number } }>
    layout: { clustering?: { algorithm: string; provider: string; seed: number; k: number } }
  }
  expect(document.layout.clustering).toMatchObject({
    algorithm: 'cosine-kmeans',
    provider: 'local-tfidf',
    seed: 20261109,
  })
  expect(document.layout.clustering?.k).toBeGreaterThanOrEqual(2)
  expect(document.groups.every((group) => group.provenance.source === 'autogroup')).toBe(true)

  await expect(page.getByTestId('history-undo')).toBeEnabled()
  await page.getByTestId('history-undo').click()
  expect(await serialized(page)).toBe(before)
  await expect(page.getByTestId('history-redo')).toBeEnabled()
  await page.getByTestId('history-redo').click()
  await expect
    .poll(async () => (await debugSnapshot(page))?.model.groups.length ?? 0)
    .toBeGreaterThan(0)
})

test('expands an autogroup container after list insertion so every label still fits', async ({
  page,
}) => {
  await page.getByTestId('tool-group').click()
  await page.getByTestId('autogroup-toggle').click()
  await expect(page.getByTestId('clustering-status')).toBeHidden({ timeout: 10_000 })

  await page.getByTestId('list-view-toggle').click()
  const first = page.locator('[data-list-cell]').first()
  await first.fill('I protected one clear decision from the noise around it.')
  await first.press('Enter')
  const added = page.locator('[data-list-cell]:focus')
  await added.fill('I kept tomorrow’s experiment small enough to complete.')
  await added.press('Tab')
  await page.getByTestId('return-microscope').click()

  await expect
    .poll(
      async () => {
        const state = await debugSnapshot(page)
        if (!state) return false
        return state.model.cells
          .filter((cell) => cell.text.trim())
          .every(
            (cell) =>
              state.textRequirements[cell.id]?.fits &&
              state.textEffects[cell.id]?.visible,
          )
      },
      { timeout: 8_000 },
    )
    .toBe(true)
})

test('expires an untouched seed, while promotion cancels the countdown', async ({ page }) => {
  const createFastSeed = async (omitLegacyTimestamp = false) => {
    await expect
      .poll(
        async () => page.evaluate(() => window.__VORONOI_DEBUG__?.forceSeed() ?? false),
        { timeout: 5000 },
      )
      .toBe(true)
    const value = JSON.parse(await serialized(page)) as {
      cells: Array<{
        id: string
        kind: string
        expiry: {
          state: string
          timeoutMs: number
          createdAtMs?: number
          shrinkStartedAtMs?: number
        }
      }>
    }
    const seed = [...value.cells].reverse().find((cell) => cell.kind === 'seed')
    if (!seed) throw new Error('Seed could not be spawned')
    seed.expiry.state = 'scheduled'
    seed.expiry.timeoutMs = 120
    if (omitLegacyTimestamp) delete seed.expiry.createdAtMs
    else seed.expiry.createdAtMs = Date.now()
    await page.evaluate((document) => {
      window.__VORONOI_DEBUG__?.load(JSON.stringify(document))
    }, value)
    if (omitLegacyTimestamp) {
      const restored = JSON.parse(await serialized(page)) as {
        cells: Array<{ id: string; expiry: { createdAtMs?: number } }>
      }
      expect(restored.cells.find((cell) => cell.id === seed.id)?.expiry.createdAtMs).toBeGreaterThan(
        0,
      )
    }
    return seed.id
  }

  const firstId = await createFastSeed(true)
  await expect
    .poll(
      async () =>
        (await debugSnapshot(page))?.model.cells.some((cell) => cell.id === firstId) ?? true,
      { timeout: 4000 },
    )
    .toBe(false)

  const secondId = await createFastSeed()
  const state = await debugSnapshot(page)
  const seed = state?.model.cells.find((cell) => cell.id === secondId)
  if (!state || !seed) throw new Error('Missing seed geometry')
  await page.mouse.click(
    state.field.center.x + seed.site.x * state.field.radius,
    state.field.center.y + seed.site.y * state.field.radius,
  )
  await page.waitForTimeout(1500)
  const after = JSON.parse(await serialized(page)) as {
    cells: Array<{ id: string; kind: string; expiry: { state: string } }>
  }
  expect(after.cells.find((cell) => cell.id === secondId)?.expiry.state).toBe('cancelled')
  expect(after.cells.find((cell) => cell.id === secondId)?.kind).toBe('journal')
})

test('switches to the shared-model list editor and restores the microscope', async ({ page }) => {
  const postBefore = await page.evaluate(() => window.__VORONOI_DEBUG__?.postProcess())
  expect(postBefore?.active).toBe(true)
  const beforeCount = (await debugSnapshot(page))?.cellCount ?? 0
  await page.getByTestId('list-view-toggle').click()
  await expect(page.locator('.app-shell')).toHaveClass(/view-transition-microscope-out/)
  await expect(page.locator('.view-transition-curtain')).toBeVisible()
  await page.waitForTimeout(160)
  const outgoingFrame = await page.locator('.voronoi-stage').evaluate((element) => ({
    opacity: Number.parseFloat(getComputedStyle(element).opacity),
    transform: getComputedStyle(element).transform,
  }))
  const curtainOpacity = await page.locator('.view-transition-curtain').evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).opacity),
  )
  expect(outgoingFrame.opacity).toBeGreaterThan(0.7)
  expect(outgoingFrame.transform).not.toBe('none')
  expect(curtainOpacity).toBeLessThan(0.35)
  await expect(page.getByTestId('list-view')).toBeVisible()
  await expect(page.getByTestId('voronoi-canvas')).toBeHidden()
  await expect(page.getByTestId('settings-toggle')).toHaveCount(0)
  const toolbar = page.getByRole('toolbar', { name: 'List view controls' })
  await expect(toolbar.getByRole('button')).toHaveCount(1)
  await expect(page.getByTestId('return-microscope')).toBeVisible()
  expect((await page.evaluate(() => window.__VORONOI_DEBUG__?.postProcess()))?.active).toBe(false)

  const first = page.locator('[data-list-cell]').first()
  const firstId = await first.getAttribute('data-list-cell')
  await first.fill('I clarified one tradeoff before adding another idea.')
  await first.evaluate((element: HTMLTextAreaElement) => {
    const caret = element.value.indexOf('before')
    element.setSelectionRange(caret, caret)
  })
  await first.press('Enter')
  const editors = page.locator('[data-list-cell]')
  await expect(editors).toHaveCount(beforeCount + 1)
  const added = page.locator('[data-list-cell]:focus')
  await expect(added).toBeFocused()
  await expect(first).toHaveValue('I clarified one tradeoff')
  await expect(added).toHaveValue('before adding another idea.')
  expect(await added.getAttribute('data-list-cell')).toBe(
    await editors.last().getAttribute('data-list-cell'),
  )
  await expect(page.locator('.list-bullet')).toHaveText(
    Array.from({ length: beforeCount + 1 }, () => '●'),
  )
  await added.fill('I kept the next experiment small enough to finish.')
  await added.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(element.value.length, element.value.length)
  })
  await added.press('Alt+ArrowLeft')
  expect(await added.evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBeLessThan(
    (await added.inputValue()).length,
  )
  await added.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(element.value.length, element.value.length)
  })
  await added.press('Enter')
  await expect(editors).toHaveCount(beforeCount + 2)
  const empty = page.locator('[data-list-cell]:focus')
  await expect(empty).toHaveValue('')
  const emptyId = await empty.getAttribute('data-list-cell')
  if (!emptyId) throw new Error('Expected an empty bullet id')
  const emptyEditor = page.locator(`[data-list-cell="${emptyId}"]`)
  await empty.press('Enter')
  await expect(editors).toHaveCount(beforeCount + 2)
  const afterEmptyEnter = JSON.parse(await serialized(page)) as {
    cells: Array<{ id: string; text: string; kind: string }>
  }
  expect(
    afterEmptyEnter.cells.filter((cell) => cell.kind === 'journal' && cell.text.trim() === ''),
  ).toEqual([expect.objectContaining({ id: emptyId })])
  await emptyEditor.fill('I left one clear next step at the end of the list.')
  await emptyEditor.evaluate((element: HTMLTextAreaElement) =>
    element.setSelectionRange(12, 12),
  )
  await emptyEditor.press('ArrowUp')
  await expect(added).toBeFocused()
  await added.evaluate((element: HTMLTextAreaElement) => {
    const caret = Math.floor(element.value.length / 2)
    element.setSelectionRange(caret, caret)
  })
  await added.press('ArrowDown')
  await expect(emptyEditor).toBeFocused()
  const focusStyle = await emptyEditor.locator('xpath=..').evaluate((element) => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, shadow: style.boxShadow }
  })
  expect(focusStyle.background).toBe('rgba(0, 0, 0, 0)')
  expect(focusStyle.shadow).toBe('none')
  await emptyEditor.press('Tab')
  await expect(emptyEditor.locator('xpath=..')).toHaveAttribute('data-depth', '1')
  const depthColors = await Promise.all([
    first.evaluate((element) => getComputedStyle(element).color),
    emptyEditor.evaluate((element) => getComputedStyle(element).color),
  ])
  expect(depthColors[1]).toBe(depthColors[0])
  await emptyEditor.press('Shift+Tab')
  await expect(emptyEditor.locator('xpath=..')).toHaveAttribute('data-depth', '0')

  await page.getByTestId('return-microscope').click()
  await expect(page.locator('.app-shell')).toHaveClass(/view-transition-list-out/)
  await expect(page.getByTestId('list-view')).toHaveCount(0)
  await expect(page.getByTestId('voronoi-canvas')).toBeVisible()
  await expect(page.getByTestId('settings-toggle')).toBeVisible()
  await expect
    .poll(async () => (await page.evaluate(() => window.__VORONOI_DEBUG__?.postProcess()))?.active)
    .toBe(true)
  const restored = JSON.parse(await serialized(page)) as {
    cells: Array<{ id: string; text: string; groupId?: string }>
  }
  expect(restored.cells).toHaveLength(beforeCount + 2)
  expect(restored.cells.find((cell) => cell.id === firstId)?.text).toBe(
    'I clarified one tradeoff',
  )
  expect(restored.cells.some((cell) => cell.text.includes('experiment small'))).toBe(true)
})

test('exposes an accessible list view and toolbar history controls', async ({ page }) => {
  await expect(page.getByTestId('history-undo')).toBeDisabled()
  const state = await debugSnapshot(page)
  if (!state) throw new Error('Missing debug state')
  await page.mouse.click(state.field.center.x, state.field.center.y)
  await expect(page.getByTestId('history-undo')).toBeEnabled()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('history-redo')).toBeEnabled()

  await page.getByTestId('list-view-toggle').click()
  await expect(page.getByTestId('list-view')).toBeVisible()
  const results = await new AxeBuilder({ page }).include('[data-testid="list-view"]').analyze()
  expect(results.violations).toEqual([])
})

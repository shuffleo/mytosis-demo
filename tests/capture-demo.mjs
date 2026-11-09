import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'

const mediaDirectory =
  '/Users/leo/Library/Application Support/Cursor/AgentStores/cursor_agent_stores/bc-2cd4db53-7d81-4bb0-a134-9052264afb22/files/media'
const screenshotPath = `${mediaDirectory}/paper-voronoi-microscope.png`
const videoPath = `${mediaDirectory}/paper-voronoi-microscope.mp4`
const temporaryVideoPath = '/tmp/paper-voronoi-microscope.webm'
const viewport = { width: 1440, height: 900 }

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 1,
  recordVideo: {
    dir: '/tmp/paper-voronoi-microscope-video',
    size: viewport,
  },
})
const page = await context.newPage()
const video = page.video()
const pause = (milliseconds) => page.waitForTimeout(milliseconds)
const snapshot = () => page.evaluate(() => window.__VORONOI_DEBUG__.snapshot())

async function sitePoint(cellId) {
  const state = await snapshot()
  const cell = state.model.cells.find((candidate) => candidate.id === cellId)
  if (!cell) throw new Error(`Missing ${cellId}`)
  return {
    x: state.field.center.x + cell.site.x * state.field.radius,
    y: state.field.center.y + cell.site.y * state.field.radius,
  }
}

async function cellVisualPoint(cellId) {
  const state = await snapshot()
  const polygon = state.cells[cellId]
  if (!polygon?.length) throw new Error(`Missing rendered cell ${cellId}`)
  return polygon.reduce(
    (sum, point) => ({
      x: sum.x + point.x / polygon.length,
      y: sum.y + point.y / polygon.length,
    }),
    { x: 0, y: 0 },
  )
}

await mkdir(mediaDirectory, { recursive: true })
await page.goto('http://127.0.0.1:4173')
await pause(1000)

const initial = await snapshot()
const addPoint = {
  x: initial.field.center.x - initial.field.radius * 0.12,
  y: initial.field.center.y + initial.field.radius * 0.02,
}
await page.mouse.move(addPoint.x, addPoint.y, { steps: 20 })
await pause(700)
const addedCellId = (await snapshot()).previewId
if (!addedCellId) throw new Error('Add preview did not produce a cell id')
await page.mouse.click(addPoint.x, addPoint.y)
await page.getByTestId('sprout-toggle').click()
await page.mouse.move(16, 16)
await pause(3300)

await page.getByTestId('tool-select').click()
const movable = await sitePoint('cell-6')
await page.mouse.move(movable.x, movable.y, { steps: 16 })
await pause(700)
await page.mouse.click(movable.x, movable.y)
await pause(400)
await page.mouse.move(movable.x, movable.y)
await page.mouse.down()
await page.mouse.move(movable.x + 70, movable.y + 36, { steps: 18 })
await page.mouse.up()
await pause(650)

const selected = await snapshot()
const rightHandle = selected.handles.reduce((rightmost, handle) =>
  handle.x > rightmost.x ? handle : rightmost,
)
await page.mouse.move(rightHandle.x, rightHandle.y, { steps: 10 })
await page.mouse.down()
await page.mouse.move(rightHandle.x + 44, rightHandle.y, { steps: 14 })
await page.mouse.up()
await pause(650)

const moved = await sitePoint('cell-6')
await page.mouse.dblclick(moved.x, moved.y, { delay: 80 })
const editor = page.getByTestId('cell-editor')
await editor.press('ControlOrMeta+A')
await editor.type('I gave the difficult question enough room to change shape.')
await pause(450)
await editor.press('Enter')
await pause(600)

const spawned = await page.evaluate(() => window.__VORONOI_DEBUG__.forceSeed())
if (!spawned) throw new Error('Could not create the deterministic demonstration seed')
await pause(2100)
const seedState = await snapshot()
const seed = seedState.model.cells.find((cell) => cell.kind === 'seed')
if (!seed) throw new Error('Seed did not appear')
const seedPoint = await cellVisualPoint(seed.id)
await page.mouse.move(seedPoint.x, seedPoint.y, { steps: 15 })
await pause(650)
await page.mouse.click(seedPoint.x, seedPoint.y)
await pause(1600)

await page.getByTestId('tool-group').click()
for (const cellId of ['cell-5', 'cell-9', 'cell-10']) {
  const point = await sitePoint(cellId)
  await page.mouse.move(point.x, point.y, { steps: 12 })
  await pause(300)
  await page.mouse.click(point.x, point.y)
  await pause(450)
}
await page.keyboard.press('Escape')
await page.getByTestId('tool-select').click()
await pause(1800)

for (const temporaryId of [seed.id, addedCellId]) {
  const temporaryPoint = await cellVisualPoint(temporaryId)
  await page.mouse.click(temporaryPoint.x, temporaryPoint.y)
  await page.getByTestId('voronoi-canvas').press('Delete')
  await pause(500)
}

await page.evaluate((temporaryIds) => {
  const bridge = window.__VORONOI_DEBUG__
  if (!bridge) throw new Error('Debug bridge unavailable during capture cleanup')
  const model = JSON.parse(bridge.serialize())
  const removed = new Set([
    ...temporaryIds,
    ...model.cells
      .filter((cell) => cell.kind === 'seed' || cell.text.trim() === '')
      .map((cell) => cell.id),
  ])
  model.cells = model.cells.filter((cell) => !removed.has(cell.id))
  model.relationships = model.relationships.filter(
    (relationship) =>
      !removed.has(relationship.sourceId) && !removed.has(relationship.targetId),
  )
  model.layout.zOrder = model.layout.zOrder.filter((id) => !removed.has(id))
  model.groups = model.groups
    .map((group) => ({
      ...group,
      memberIds: group.memberIds.filter((id) => !removed.has(id)),
    }))
    .filter((group) => group.memberIds.length > 1)
  bridge.load(JSON.stringify(model))
}, [seed.id, addedCellId])
await pause(800)

await page.getByTestId('settings-toggle').click()
await pause(800)
await page.screenshot({ path: screenshotPath })
await pause(1000)

await context.close()
if (!video) throw new Error('Video recording did not initialize')
await video.saveAs(temporaryVideoPath)
await browser.close()

execFileSync(
  'ffmpeg',
  [
    '-y',
    '-i',
    temporaryVideoPath,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    videoPath,
  ],
  { stdio: 'ignore' },
)

console.log(JSON.stringify({ screenshotPath, videoPath }))

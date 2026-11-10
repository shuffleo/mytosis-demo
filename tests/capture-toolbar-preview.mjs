import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'

const mediaDirectory =
  '/Users/leo/Library/Application Support/Cursor/AgentStores/cursor_agent_stores/bc-2cd4db53-7d81-4bb0-a134-9052264afb22/files/media'
const screenshotPath = `${mediaDirectory}/mytosis-toolbar-preview.png`
const videoPath = `${mediaDirectory}/mytosis-toolbar-preview.mp4`
const temporaryVideoPath = '/tmp/mytosis-toolbar-preview.webm'
const viewport = { width: 1440, height: 900 }

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 1,
  recordVideo: {
    dir: '/tmp/mytosis-toolbar-preview-video',
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

await mkdir(mediaDirectory, { recursive: true })
await page.goto('http://127.0.0.1:4173')
await pause(1000)

const pastDay = page.locator(
  '.date-rail__day button:not(:disabled)[data-date-status="empty"]',
).last()
await pastDay.click()
await pause(900)
await page.getByTestId('return-microscope').click()
await pause(1500)

await page.getByTestId('settings-toggle').click()
await pause(700)
await page.screenshot({ path: screenshotPath })
await pause(900)

await page.getByTestId('settings-toggle').click()
await page.getByTestId('tool-select').click()
const editPoint = await sitePoint('cell-4')
await page.mouse.dblclick(editPoint.x, editPoint.y, { delay: 70 })
const editor = page.getByTestId('cell-editor')
await editor.fill('A geometrically aligned native editing surface keeps selection exact.')
await pause(900)

const editorBox = await editor.boundingBox()
if (!editorBox) throw new Error('Focused editor did not render')
await page.mouse.move(
  editorBox.x + editorBox.width * 0.18,
  editorBox.y + editorBox.height * 0.5,
)
await page.mouse.down()
await page.mouse.move(
  editorBox.x + editorBox.width * 0.82,
  editorBox.y + editorBox.height * 0.5,
  { steps: 12 },
)
await page.mouse.up()
await pause(1800)

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

import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'

const mediaDirectory =
  '/Users/leo/Library/Application Support/Cursor/AgentStores/cursor_agent_stores/bc-2cd4db53-7d81-4bb0-a134-9052264afb22/files/media'
const screenshotPath = `${mediaDirectory}/paper-voronoi-clustering.png`
const videoPath = `${mediaDirectory}/paper-voronoi-clustering.mp4`
const temporaryVideoPath = '/tmp/paper-voronoi-clustering.webm'
const viewport = { width: 1440, height: 900 }

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 1,
  recordVideo: {
    dir: '/tmp/paper-voronoi-clustering-video',
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
await pause(1100)

await page.getByTestId('tool-select').click()
const hoverPoint = await sitePoint('cell-6')
await page.mouse.move(hoverPoint.x, hoverPoint.y, { steps: 18 })
await pause(900)

await page.getByTestId('tool-group').click()
await page.getByTestId('autogroup-toggle').click()
await pause(1150)
await page.getByTestId('autogroup-toggle').click()
await pause(700)
await page.getByTestId('autogroup-toggle').click()
await pause(5500)

await page.getByTestId('list-view-toggle').click()
await pause(1000)
const firstEditor = page.locator('[data-list-cell]').first()
await firstEditor.fill('I protected one clear decision from the noise around it.')
await firstEditor.press('Enter')
const newEditor = page.locator('[data-list-cell]:focus')
await newEditor.fill('I kept tomorrow’s experiment small enough to complete.')
await newEditor.press('Tab')
await pause(1300)

await page.getByTestId('return-microscope').click()
await pause(1800)
await page.getByTestId('tool-group').click()
await page.getByTestId('settings-toggle').click()
await page.getByText('Autogroup', { exact: true }).click()
await pause(900)
await page.screenshot({ path: screenshotPath })
await pause(900)

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

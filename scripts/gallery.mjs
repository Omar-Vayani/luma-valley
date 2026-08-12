/**
 * gallery — a set of labelled screenshots of the valley, for looking at
 * changes without booting the game.
 *
 *   npm run dev              # in another terminal
 *   node scripts/gallery.mjs [outDir]
 *
 * Frame rate here is meaningless (software rasteriser); composition,
 * colour and layout are not.
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const outDir = process.argv[2] ?? '/tmp/luma-gallery'
mkdirSync(outDir, { recursive: true })

const base = process.env.LUMA_URL ?? 'http://127.0.0.1:5173/'
const url = base.includes('?') ? `${base}&fresh=1` : `${base}?fresh=1`

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-crashpad'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForFunction(() => !!window.luma, null, { timeout: 60_000 })
await page.waitForFunction(
  () => document.querySelector('.loading')?.classList.contains('done'), null, { timeout: 120_000 },
)
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}
await page.addStyleTag({ content: '.enter{display:none !important}' })

/** midday, dusk and the small hours, in ticks of a 1200-tick day */
const NOON = 0
const DUSK = 470
const NIGHT = 640

const shots = [
  { name: '01-arrival', tick: NOON, at: [16, 96], look: [0, 0], pitch: -0.04 },
  { name: '02-plaza', tick: NOON, at: [4, 24], look: [0, -14], pitch: -0.02 },
  { name: '03-market-row', tick: NOON, at: [-14, -4], look: [-26, -18], pitch: -0.02 },
  { name: '04-the-hearths', tick: NOON, at: [-40, -26], look: [-64, -38], pitch: -0.02 },
  { name: '05-fields', tick: NOON, at: [-64, 12], look: [-86, 18], pitch: -0.03 },
  { name: '06-old-grove', tick: NOON, at: [56, -40], look: [78, -52], pitch: -0.02 },
  { name: '07-mirror-lake', tick: DUSK, at: [104, 74], look: [168, 96], pitch: 0.0 },
  { name: '08-beacon-hill', tick: DUSK, at: [-124, 128], look: [0, 0], pitch: -0.1 },
  { name: '09-founders-stones', tick: DUSK, at: [-166, -50], look: [-178, -58], pitch: -0.02 },
  { name: '10-plaza-at-night', tick: NIGHT, at: [2, 26], look: [0, 0], pitch: -0.02 },
  { name: '11-lantern-light', tick: NIGHT, at: [-18, -8], look: [-26, -18], pitch: -0.02 },
]

for (const s of shots) {
  await page.evaluate((v) => {
    window.luma.sim.time = v.tick
    window.luma.view.teleport(v.at[0], v.at[1])
    window.luma.view.lookAt(v.look[0], v.look[1], v.pitch)
  }, s)
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `${outDir}/${s.name}.png` })
  console.log(`${outDir}/${s.name}.png`)
}

// a Luma, close enough to read
await page.evaluate(() => {
  window.luma.sim.time = 0
  const c = window.luma.sim.creatures.find((x) => x.alive)
  window.luma.view.teleport(c.pos.x + Math.sin(c.facing) * 3, c.pos.z + Math.cos(c.facing) * 3)
  window.luma.view.lookAt(c.pos.x, c.pos.z, -0.16)
})
await page.waitForTimeout(2200)
await page.screenshot({ path: `${outDir}/12-a-luma.png` })
console.log(`${outDir}/12-a-luma.png`)

// the panels
for (const [key, name] of [['KeyR', '13-notice-board'], ['KeyJ', '14-journal'], ['KeyM', '15-map'], ['KeyH', '16-haven']]) {
  await page.keyboard.press(key)
  await page.waitForTimeout(1600)
  await page.screenshot({ path: `${outDir}/${name}.png` })
  console.log(`${outDir}/${name}.png`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}

await browser.close()

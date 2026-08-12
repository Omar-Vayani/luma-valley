/**
 * perf — what the valley costs to draw, per quality preset.
 *
 * Frame times here mean nothing (this runs on a software rasteriser); the
 * numbers worth reading are draw calls and triangles, which are the same on
 * any GPU and are what a laptop actually has to chew through.
 */
import { chromium } from 'playwright-core'

const base = process.env.LUMA_URL ?? 'http://127.0.0.1:5173/'
const url = base.includes('?') ? `${base}&fresh=1` : `${base}?fresh=1`

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-crashpad'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForFunction(() => !!window.luma, null, { timeout: 60_000 })
await page.waitForFunction(
  () => document.querySelector('.loading')?.classList.contains('done'), null, { timeout: 90_000 },
)
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

const spots = [
  { name: 'plaza', x: 0, z: 14, lx: 0, lz: -20 },
  { name: 'hearths lane', x: -40, z: -24, lx: -70, lz: -40 },
  { name: 'south road', x: 16, z: 90, lx: 0, lz: 0 },
  { name: 'lake shore', x: 104, z: 70, lx: 168, lz: 96 },
  { name: 'beacon hill', x: -124, z: 128, lx: 0, lz: 0 },
]

console.log('preset      place            draws   triangles')
for (const preset of ['low', 'medium', 'high', 'ultra']) {
  await page.evaluate((q) => window.luma.view.setQuality(q), preset)
  await page.waitForTimeout(1200)
  for (const s of spots) {
    await page.evaluate((v) => {
      window.luma.view.teleport(v.x, v.z)
      window.luma.view.lookAt(v.lx, v.lz, -0.03)
    }, s)
    await page.waitForTimeout(1400)
    const info = await page.evaluate(() => {
      const r = window.luma.view.engine.renderer.info.render
      return { calls: r.calls, tris: r.triangles }
    })
    console.log(
      `${preset.padEnd(11)} ${s.name.padEnd(16)} ${String(info.calls).padStart(5)}   ` +
      `${(info.tris / 1000).toFixed(0).padStart(6)}k`,
    )
  }
}

await browser.close()

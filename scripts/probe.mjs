/**
 * probe — read the live game state after driving it, for diagnosing.
 *   node scripts/probe.mjs
 */
import { chromium } from 'playwright-core'

const base = process.env.LUMA_URL ?? 'http://127.0.0.1:5173/'
const url = base.includes('?') ? `${base}&fresh=1` : `${base}?fresh=1`

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-crashpad'],
})
const page = await browser.newPage({ viewport: { width: 900, height: 560 } })
page.on('pageerror', (e) => console.log('pageerror:', e.message))
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForFunction(() => !!window.luma, null, { timeout: 60_000 })
await page.waitForFunction(
  () => document.querySelector('.loading')?.classList.contains('done'), null, { timeout: 120_000 },
)
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}
await page.evaluate(() => window.luma.view.setQuality('low'))

for (const spot of [[104, 74], [120, 60], [96, 62], [0, 20]]) {
  await page.evaluate((s) => {
    window.luma.sim.time = 470
    window.luma.view.teleport(s[0], s[1])
    window.luma.view.lookAt(168, 96, 0)
  }, spot)
  await page.waitForTimeout(2500)
  const out = await page.evaluate(async () => {
    const t = await import('/src/world/terrain.ts')
    const p = window.luma.view.playerPosition()
    return {
      asked: null,
      pos: [Math.round(p.x), Math.round(p.z)],
      ground: +t.heightAt(p.x, p.z).toFixed(2),
      underwater: t.isUnderwater(p.x, p.z),
      region: t.regionAt(p.x, p.z)?.name ?? null,
      time: window.luma.sim.time,
      hudTime: document.querySelector('.status .clock b')?.textContent,
      hudPlace: document.querySelector('.status .place')?.textContent,
    }
  })
  console.log(JSON.stringify({ asked: spot, ...out }))
}

await browser.close()

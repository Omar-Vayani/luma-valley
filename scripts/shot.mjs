/**
 * shot — take screenshots of the running game so changes can be looked at.
 *
 *   node scripts/shot.mjs out.png [waitMs] [--walk]
 */
import { chromium } from 'playwright-core'

const out = process.argv[2] ?? '/tmp/shot.png'
const wait = Number(process.argv[3] ?? 9000)
const base = process.env.LUMA_URL ?? 'http://127.0.0.1:5173/'
const url = base.includes('?') ? `${base}&fresh=1` : `${base}?fresh=1`

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome',
  headless: true,
  args: [
    '--disable-crash-reporter', '--disable-crashpad',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

const errors = []
const logs = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
  else if (process.env.SHOT_LOGS) logs.push(`${m.type()}: ${m.text()}`)
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForTimeout(wait)

// the click-to-look overlay cannot be dismissed without a real pointer lock
await page.addStyleTag({ content: '.enter{display:none !important}' })
// close whatever panel opened on first run so the world is visible
await page.keyboard.press('Escape')
await page.waitForTimeout(600)

for (const arg of process.argv.slice(4)) {
  if (arg.startsWith('--key=')) {
    await page.keyboard.press(arg.slice(6))
    await page.waitForTimeout(900)
  }
  if (arg.startsWith('--wait=')) await page.waitForTimeout(Number(arg.slice(7)))
  if (arg.startsWith('--click=')) {
    await page.click(arg.slice(8)).catch(() => {})
    await page.waitForTimeout(700)
  }
  // --tick=N — jump the settlement clock, for looking at the light
  if (arg.startsWith('--tick=')) {
    const t = Number(arg.slice(7))
    await page.evaluate((v) => { if (window.luma) window.luma.sim.time = v }, t)
    await page.waitForTimeout(900)
  }
  // --near / --face — stand beside or in front of the nearest Luma
  if (arg === '--near' || arg === '--face') {
    const front = arg === '--face'
    await page.evaluate((inFront) => {
      const luma = window.luma
      if (!luma) return
      const c = luma.sim.creatures.find((x) => x.alive)
      if (!c) return
      const d = 3.0
      const x = inFront ? c.pos.x + Math.sin(c.facing) * d : c.pos.x + 2.6
      const z = inFront ? c.pos.z + Math.cos(c.facing) * d : c.pos.z + 2.2
      luma.view.teleport(x, z)
      luma.view.lookAt(c.pos.x, c.pos.z, -0.18)
    }, front)
    await page.waitForTimeout(1400)
  }
  // --at=x,z[,lookX,lookZ,pitch] — stand somewhere and look at something
  if (arg.startsWith('--at=')) {
    const n = arg.slice(5).split(',').map(Number)
    await page.evaluate(([x, z, lx, lz, pitch]) => {
      const luma = window.luma
      if (!luma) return
      luma.view.teleport(x, z)
      luma.view.lookAt(lx ?? 0, lz ?? 0, pitch ?? -0.05)
    }, n)
    await page.waitForTimeout(1200)
  }
}

await page.screenshot({ path: out })
console.log('wrote', out)
if (process.env.SHOT_LOGS) {
  console.log('--- console ---')
  for (const l of logs.filter((x) => !x.includes('AudioContext')).slice(0, 200)) console.log(l)
}
if (errors.length) {
  console.log('--- console errors ---')
  for (const e of errors.slice(0, 20)) console.log(e)
} else {
  console.log('no console errors')
}
await browser.close()

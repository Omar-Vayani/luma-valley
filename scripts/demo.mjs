/**
 * demo — record a short, scripted play session as a video.
 *
 * Drives the real game in a headless browser: walks in, lets the society run,
 * talks to a neighbour, opens the mind inspector and the Haven panel, and
 * hands over a loaf. Deterministic enough to re-record after a change.
 *
 *   npm run demo                 # against http://127.0.0.1:4173/
 *   LUMA_URL=... npm run demo
 */
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, renameSync } from 'node:fs'
import path from 'node:path'

const base = process.env.LUMA_URL ?? 'http://127.0.0.1:4173/'
const executablePath = process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome'
const outDir = process.env.DEMO_DIR ?? '/tmp/luma-demo'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--disable-crash-reporter', '--disable-crashpad', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
})
const page = await context.newPage()

const beat = (ms = 1200) => page.waitForTimeout(ms)

await page.goto(`${base}?fresh=1&seed=2026`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
await beat(5000)

// the controls card greets a first-time player: let it be read, then close it
await beat(4000)
await page.locator('[data-help-close]').first().click({ force: true })
await beat(1500)

// a look around the settlement
for (const key of ['KeyW', 'KeyW', 'KeyA', 'KeyD', 'KeyS']) {
  await page.keyboard.down(key)
  await beat(700)
  await page.keyboard.up(key)
}
await beat(1000)

// let the society get on with its life
await page.locator('[data-speed="10"]').first().click({ force: true })
await beat(20000)
await page.locator('[data-speed="1"]').first().click({ force: true })
await beat(1500)

// stand next to somebody and make them the one we are speaking to
await page.evaluate(() => {
  const lab = window.__lab
  const near = lab?.sim?.creatures?.find((c) => c.alive)
  if (!near) return
  lab.sim.player.pos = { x: near.pos.x + 2, z: near.pos.z + 2 }
  lab.view.callbacks?.onTapCreature?.(near.id, near.pos.x, near.pos.z)
})
await beat(1500)
await page.keyboard.press('Escape')
await beat(600)

// hand a loaf to the neighbour, before any panel can cover the strip
const give = page.locator('[data-player-give="bread"]').first()
if (await give.count()) {
  await give.click({ force: true })
  await beat(3200)
}

// what it costs to run
await page.keyboard.press('F3')
await beat(1500)
await page.screenshot({ path: path.join(outDir, 'perf-overlay.png') })
await beat(5000)
await page.keyboard.press('F3')
await beat(1000)

// talk
await page.keyboard.press('t')
await beat(1200)
for (const line of ['hello', 'how are you feeling?', 'can i buy bread']) {
  // stay beside them: a conversation you walk away from is not a conversation
  await page.evaluate(() => {
    const lab = window.__lab
    const partner = lab.sim.talkingWith != null ? lab.sim.creatureById(lab.sim.talkingWith) : null
    if (partner) lab.sim.player.pos = { x: partner.pos.x + 1.6, z: partner.pos.z + 1.6 }
  })
  await page.locator('[data-talk-input]').first().fill(line)
  await beat(800)
  await page.locator('[data-talk-submit]').first().click({ force: true })
  await beat(3600)
}
await page.keyboard.press('Escape')
await beat(900)

// why did they do that?
await page.evaluate(() => {
  const lab = window.__lab
  const near = lab?.sim?.creatures?.find((c) => c.alive)
  if (near) lab.view.callbacks?.onTapCreature?.(near.id, near.pos.x, near.pos.z)
})
await page.keyboard.press('i')
await beat(3000)
await page.locator('[data-inspector]').first().evaluate((el) => el.scrollTo({ top: 260, behavior: 'smooth' }))
await beat(2600)
await page.locator('[data-inspector]').first().evaluate((el) => el.scrollTo({ top: 700, behavior: 'smooth' }))
await beat(3000)
await page.keyboard.press('Escape')
await beat(900)

// what is the town talking about?
await page.locator('[data-chip-close]').first().click({ force: true }).catch(() => {})
await beat(600)
await page.keyboard.press('h')
await beat(3500)
await page.locator('[data-society]').first().evaluate((el) => el.scrollTo({ top: 320, behavior: 'smooth' }))
await beat(3000)
await page.locator('[data-society]').first().evaluate((el) => el.scrollTo({ top: 720, behavior: 'smooth' }))
await beat(2800)
await page.keyboard.press('Escape')
await beat(900)

await context.close()
await browser.close()

const videos = readdirSync(outDir).filter((f) => f.endsWith('.webm'))
const newest = videos.map((f) => path.join(outDir, f)).sort()[videos.length - 1]
const final = path.join(outDir, 'luma-haven-demo.webm')
if (newest && newest !== final) renameSync(newest, final)
console.log(`\nrecorded ${final}\n`)

/**
 * demo — record a short walkthrough of the real game.
 *
 *   node scripts/demo.mjs [outDir]
 *
 * Drives the actual page, through the actual UI, and records the viewport.
 * Movement and the camera are driven through `window.luma` because a script
 * cannot hold a pointer lock, but everything the video shows — the replies,
 * the learning, the fear — is the game doing its own thing.
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const outDir = process.argv[2] ?? '/tmp/demo'
mkdirSync(outDir, { recursive: true })
const url = process.env.LUMA_URL ?? 'http://localhost:5173/'

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome',
  headless: true,
  args: [
    '--disable-crash-reporter', '--disable-crashpad',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
})

const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
})
const page = await context.newPage()

const wait = (ms) => page.waitForTimeout(ms)

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.luma, null, { timeout: 60_000 })
await wait(4000)

// swiftshader cannot manage the default preset; the game is the same either way
await page.evaluate(() => window.luma.view.setQuality('low'))
await wait(1500)
await page.getByRole('button', { name: 'Go outside' }).click()
await wait(1200)

// --- arrive, and look at the hamlet ---------------------------------------
await page.evaluate(() => {
  const { sim, view } = window.luma
  sim.time = 400
  view.teleport(0, 30)
  view.lookAt(0, 0)
})
await wait(2500)

// walk in, turning gently, the way somebody would
await page.evaluate(async () => {
  const { view } = window.luma
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
  const start = Date.now()
  while (Date.now() - start < 5000) {
    view.player.yaw += Math.sin((Date.now() - start) / 900) * 0.004
    await new Promise((r) => requestAnimationFrame(r))
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
})
await wait(1500)

// --- walk up to somebody --------------------------------------------------
const name = await page.evaluate(async () => {
  const { sim, view } = window.luma
  const target = [...sim.creatures]
    .sort((a, b) => sim.playerDistance(a) - sim.playerDistance(b))[0]
  view.teleport(target.x + 5.5, target.z + 5.5)
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    view.lookAt(target.x, target.z)
    const gaze = view.currentGaze()
    if (gaze.kind === 'luma' && gaze.inReach) break
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    await new Promise((r) => setTimeout(r, 90))
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
  view.lookAt(target.x, target.z)
  return target.name
})
await wait(1800)

// --- talk to them ---------------------------------------------------------
await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }))
})
await wait(1600)

const input = page.locator('.chat-input input')
async function say(line) {
  await input.click()
  for (const ch of line) {
    await input.press(ch === ' ' ? 'Space' : ch)
    await wait(45)
  }
  await input.press('Enter')
  await wait(2600)
}

await say('hello')
await say('how are you')
await say('what are you doing')
// teaching a word is a thing you type, so it belongs on screen
await say('this is a berry')

// --- watch the mind -------------------------------------------------------
await page.getByRole('button', { name: 'mind' }).click()
await wait(6000)
await page.locator('.panel.wide .body').hover()
await page.mouse.wheel(0, 500)
await wait(3500)
await page.mouse.wheel(0, 600)
await wait(3500)
await page.keyboard.press('Escape')
await wait(1500)

// --- feed them, with the key the player would press ------------------------
await page.evaluate((creature) => {
  const c = window.luma.sim.creatures.find((x) => x.name === creature)
  c.drives.hunger = 0.9
}, name)
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }))
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' }))
  })
  await wait(1800)
}
await wait(1200)

// open the mind again: the word is in there now. They may have drifted while
// eating, so step back into reach and look at them first.
await page.evaluate((creature) => {
  const { sim, view } = window.luma
  const c = sim.creatures.find((x) => x.name === creature)
  view.teleport(c.x + 1.8, c.z + 1.8)
  view.lookAt(c.x, c.z)
}, name)
await wait(1600)
await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }))
})
await wait(1600)

const mind = page.getByRole('button', { name: 'mind' })
if (await mind.count()) {
  await mind.click()
  await wait(2000)
  await page.locator('.panel.wide .body').hover()
  await page.mouse.wheel(0, 1100)
  await wait(5000)
  await page.keyboard.press('Escape')
  await wait(1500)
}

// --- and what happens if you are unkind -----------------------------------
// keep them in frame, then swat, and watch them go
await page.evaluate((creature) => {
  const { sim, view } = window.luma
  const c = sim.creatures.find((x) => x.name === creature)
  view.teleport(c.x + 2, c.z + 2)
  view.lookAt(c.x, c.z)
}, name)
await wait(2500)

await page.evaluate((creature) => {
  const { sim } = window.luma
  sim.strike(sim.creatures.find((x) => x.name === creature))
}, name)

// follow them with the camera as they bolt, so the alarm and the run are seen
await page.evaluate(async (creature) => {
  const { sim, view } = window.luma
  const c = sim.creatures.find((x) => x.name === creature)
  const until = Date.now() + 9000
  while (Date.now() < until) {
    view.lookAt(c.x, c.z)
    await new Promise((r) => requestAnimationFrame(r))
  }
}, name)
await wait(2500)

await context.close()
await browser.close()
console.log(`recorded a session with ${name} into ${outDir}`)

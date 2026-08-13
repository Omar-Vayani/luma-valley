/**
 * playtest — drive the real game in a real browser and check it works.
 *
 *   node scripts/playtest.mjs [--shots DIR]
 *
 * This is not a unit test with the world mocked out; it loads the built page,
 * takes hold of the same `Sim` and `WorldView` the player is using, and walks
 * through the things somebody would do in their first few minutes: find a
 * Luma, talk to it, feed it, teach it a word, frighten it, and check that the
 * brain changed in the way it should have.
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const shotsAt = process.argv.includes('--shots')
  ? process.argv[process.argv.indexOf('--shots') + 1]
  : null
if (shotsAt) mkdirSync(shotsAt, { recursive: true })

const url = process.env.LUMA_URL ?? 'http://127.0.0.1:5173/'

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
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

let shot = 0
async function screenshot(name) {
  if (!shotsAt) return
  const path = `${shotsAt}/${String(++shot).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path })
}

console.log(`\nplaytest: ${url}\n`)

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
// a fresh valley every run, so a previous run cannot make this one pass
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })

await page.waitForFunction(() => !!window.luma, null, { timeout: 60_000 })
await page.waitForTimeout(4000)

// There is no GPU in CI, so everything is drawn by swiftshader on the CPU.
// Shadows, MSAA and the post chain are far too expensive for that, and a
// one-frame-per-second page cannot be used to test anything that involves
// holding a key down. The low preset is still the whole game.
const quality = process.env.PLAYTEST_QUALITY ?? 'low'
await page.evaluate((q) => window.luma.view.setQuality(q), quality)
await page.waitForTimeout(1500)

// ---------------------------------------------------------------- the world

const world = await page.evaluate(() => {
  const { sim } = window.luma
  return {
    creatures: sim.creatures.length,
    buildings: sim.village.buildings.length,
    solids: sim.grid.size,
    doorWidths: sim.village.buildings.map((b) => b.width),
    time: sim.time,
    hour: Math.floor((sim.dayPhase * 24) % 24),
  }
})
check('the valley has creatures in it', world.creatures === 6, `${world.creatures} Luma`)
check('the hamlet is built', world.buildings === 6, `${world.buildings} buildings`)
check('everything solid is registered', world.solids > 250, `${world.solids} solids`)
check('a new valley opens in daylight', world.hour >= 8 && world.hour <= 11, `${world.hour}:00`)

// close the guide
await page.getByRole('button', { name: 'Go outside' }).click()
await page.waitForTimeout(500)
await screenshot('valley')

// ---------------------------------------------------------------- the clock

const before = await page.evaluate(() => window.luma.sim.time)
await page.waitForTimeout(2500)
const after = await page.evaluate(() => window.luma.sim.time)
check('the simulation is running', after > before + 1, `+${(after - before).toFixed(1)}s`)

// ---------------------------------------------------------------- movement

const walked = await page.evaluate(async () => {
  const { view } = window.luma
  view.teleport(0, 14)
  const from = view.playerPosition()
  view.lookAt(0, 0)
  // hold W for a moment, through the real input path
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
  await new Promise((r) => setTimeout(r, 1200))
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
  const to = view.playerPosition()
  return Math.hypot(to.x - from.x, to.z - from.z)
})
check('the player walks', walked > 1.5, `${walked.toFixed(1)} m`)

// walls are solid: try to walk into the back of a building
const blocked = await page.evaluate(async () => {
  const { view, sim } = window.luma
  const b = sim.village.buildings[0]
  // stand behind it and walk at the back wall
  const bx = b.x - Math.sin(b.rot) * (b.depth / 2 + 2)
  const bz = b.z - Math.cos(b.rot) * (b.depth / 2 + 2)
  view.teleport(bx, bz)
  view.lookAt(b.x, b.z)
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
  await new Promise((r) => setTimeout(r, 2000))
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
  const p = view.playerPosition()
  const cos = Math.cos(b.rot)
  const sin = Math.sin(b.rot)
  const lx = (p.x - b.x) * cos - (p.z - b.z) * sin
  const lz = (p.x - b.x) * sin + (p.z - b.z) * cos
  return Math.abs(lx) > b.width / 2 - 0.3 || Math.abs(lz) > b.depth / 2 - 0.3
})
check('walls cannot be walked through', blocked)

// ---------------------------------------------------------------- a Luma

const found = await page.evaluate(async () => {
  const { view, sim } = window.luma
  const c = sim.creatures[0]

  // start a few metres off and walk in, keeping them in view — which is what
  // a player does, and unlike a teleport it cannot land inside the scenery
  view.teleport(c.x + 5, c.z + 5)
  await new Promise((r) => setTimeout(r, 300))

  const deadline = Date.now() + 12000
  let gaze = view.currentGaze()
  while (Date.now() < deadline) {
    view.lookAt(c.x, c.z)
    gaze = view.currentGaze()
    if (gaze.kind === 'luma' && gaze.inReach) break
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    await new Promise((r) => setTimeout(r, 120))
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
  view.lookAt(c.x, c.z)
  await new Promise((r) => setTimeout(r, 200))
  gaze = view.currentGaze()

  return {
    kind: gaze.kind,
    inReach: gaze.inReach,
    prompt: gaze.prompt,
    name: c.name,
    id: c.id,
    distance: sim.playerDistance(c),
  }
})
check('you can walk up to a Luma', found.kind === 'luma' && found.inReach,
  `${found.prompt} at ${found.distance.toFixed(1)} m`)
await screenshot('close-to-a-luma')

// open the chat with the real key
await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }))
})
await page.waitForTimeout(700)
const chatOpen = await page.locator('.chat-input input').count()
check('E opens the chat', chatOpen === 1)

// Whoever is under the crosshair is who you end up talking to, and it is not
// necessarily the one this script set out to reach — another may have wandered
// in front. Take the name off the panel rather than assuming.
let talkingTo = found
if (chatOpen === 1) {
  const name = (await page.locator('.panel.side header h2').innerText()).trim()
  const id = await page.evaluate(
    (n) => window.luma.sim.creatures.find((c) => c.name === n)?.id ?? null,
    name,
  )
  if (id != null) talkingTo = { ...found, name, id }
}

// ---------------------------------------------------------------- talking

if (chatOpen === 1) {
  const input = page.locator('.chat-input input')
  const started = Date.now()
  await input.fill('hello')
  await input.press('Enter')
  await page.waitForSelector('.chat-line.them', { timeout: 5000 })
  const took = Date.now() - started
  const reply = await page.locator('.chat-line.them').last().innerText()
  check('a greeting is answered', reply.length > 0, reply)
  check('the answer is immediate', took < 1200, `${took} ms`)

  await input.fill('how are you')
  await input.press('Enter')
  await page.waitForTimeout(300)
  const feeling = await page.locator('.chat-line.them').last().innerText()
  check('it says how it feels', feeling.length > 0, feeling)

  const lineCount = await page.locator('.chat-line').count()
  check('both sides are in the transcript', lineCount === 4, `${lineCount} lines`)
  await screenshot('chat')

  // the mind opens from the chat
  await page.getByRole('button', { name: 'mind' }).click()
  await page.waitForTimeout(700)
  const lobes = await page.locator('.lobe h3').allInnerTexts()
  check(
    'the neural interface opens',
    lobes.length >= 5,
    lobes.map((l) => l.split('\n')[0]).join(', '),
  )
  await screenshot('neural-interface')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // The transcript has to survive a reload, not just a panel close. This is
  // the whole of the "it does not save chat" complaint: the log used to live
  // in React state and went with it.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.luma, null, { timeout: 60_000 })
  await page.waitForTimeout(4000)
  await page.evaluate((q) => window.luma.view.setQuality(q), quality)
  await page.getByRole('button', { name: 'Go outside' }).click()
  await page.waitForTimeout(600)

  // first: is it on disk at all?
  const stored = await page.evaluate((id) => {
    const raw = localStorage.getItem('luma.chat.v3')
    if (!raw) return 0
    const log = JSON.parse(raw)
    return (log[id] ?? []).length
  }, talkingTo.id)
  check('the conversation is written to disk', stored === 4, `${stored} lines stored`)

  // then: does it come back on screen? Stand next to them so they appear in
  // the nearby list, and open the chat from there.
  await page.evaluate((id) => {
    const { sim, view } = window.luma
    const c = sim.creature(id)
    if (c) view.teleport(c.x + 1.6, c.z + 1.6)
  }, talkingTo.id)
  await page.waitForTimeout(1200)

  const reopened = page.locator('.corner.bottom-left .nearby-row', { hasText: talkingTo.name })
  const rows = await reopened.count()
  if (rows) {
    await reopened.first().click()
    await page.waitForTimeout(800)
  }
  const kept = await page.locator('.chat-line').count()
  check('the conversation comes back on screen', kept === 4,
    `${kept} lines shown${rows ? '' : ' (no nearby row to click)'}`)
  await screenshot('chat-after-reload')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
}

// ---------------------------------------------------------------- learning

const learning = await page.evaluate(async () => {
  const { sim } = window.luma
  const c = sim.creatures[1]

  // teach it a word by feeding it while saying it
  sim.player.berries = 9
  const trustBefore = c.trust
  for (let i = 0; i < 5; i++) {
    c.drives.hunger = 0.8
    sim.speakTo(c, ['dinner'])
    sim.feed(c)
    await new Promise((r) => setTimeout(r, 120))
  }
  const understood = sim.command(c, ['dinner'])

  return {
    trustBefore,
    trustAfter: c.trust,
    obeyed: understood.obeyed,
    understanding: understood.understanding,
    words: [...c.brain.words.keys()],
  }
})
check('feeding earns trust', learning.trustAfter > learning.trustBefore + 0.2,
  `${learning.trustBefore.toFixed(2)} → ${learning.trustAfter.toFixed(2)}`)
check('a word said while feeding is learned', learning.words.includes('dinner'),
  learning.words.join(', '))
check('the learned word then means something', learning.obeyed === 'eat',
  `${learning.obeyed} (${Math.round(learning.understanding * 100)}%)`)

// ---------------------------------------------------------------- fear

const fear = await page.evaluate(async () => {
  const { sim, view } = window.luma
  const c = sim.creatures[2]
  view.teleport(c.x, c.z + 1.5)
  await new Promise((r) => setTimeout(r, 200))

  const distanceBefore = sim.playerDistance(c)
  const threatBefore = c.threat
  sim.strike(c)
  const actionAfterHit = c.action
  await new Promise((r) => setTimeout(r, 2500))

  return {
    threatBefore,
    threatAfter: c.threat,
    actionAfterHit,
    distanceBefore,
    distanceAfter: sim.playerDistance(c),
    alarm: c.alarm,
  }
})
check('being hit is noticed', fear.threatAfter > fear.threatBefore,
  `fear of you ${fear.threatBefore.toFixed(2)} → ${fear.threatAfter.toFixed(2)}`)
check('being hit makes them run', fear.actionAfterHit === 'flee')
check('they actually get away', fear.distanceAfter > fear.distanceBefore + 2,
  `${fear.distanceBefore.toFixed(1)} m → ${fear.distanceAfter.toFixed(1)} m`)
check('the alarm shows', fear.alarm > 0.5, fear.alarm.toFixed(2))

// ---------------------------------------------------------------- stuck

const wandering = await page.evaluate(async () => {
  const { sim } = window.luma
  const start = sim.creatures.map((c) => ({ x: c.x, z: c.z }))
  await new Promise((r) => setTimeout(r, 12000))
  let stuck = 0
  let insideSomething = 0
  sim.creatures.forEach((c, i) => {
    if (Math.hypot(c.x - start[i].x, c.z - start[i].z) < 0.4 && !c.asleep) stuck++
    if (!sim.grid.isClear(c.x, c.z, 0.2)) insideSomething++
  })
  return { stuck, insideSomething, total: sim.creatures.length }
})
check('nobody is wedged in the scenery', wandering.insideSomething === 0,
  `${wandering.insideSomething} of ${wandering.total}`)
check('the valley keeps moving', wandering.stuck <= 2,
  `${wandering.stuck} of ${wandering.total} stayed put`)

// ---------------------------------------------------------------- frames

const perf = await page.evaluate(async () => {
  let frames = 0
  const start = performance.now()
  await new Promise((resolve) => {
    const tick = () => {
      frames++
      if (performance.now() - start > 3000) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  return (frames / (performance.now() - start)) * 1000
})
// software rendering in CI, so this is a "not broken" check rather than a
// performance target
check('it renders continuously', perf > 8, `${perf.toFixed(0)} fps under swiftshader`)
await screenshot('after-play')

// ---------------------------------------------------------------- errors

const realErrors = errors.filter(
  (e) => !/DevTools|deprecat|Deprecat|WebGL|willReadFrequently/.test(e),
)
check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))

await browser.close()

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed\n`)
process.exit(failed.length === 0 ? 0 : 1)

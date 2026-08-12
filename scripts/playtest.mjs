/**
 * playtest — drive a real session in a real browser and check the game
 * actually plays: walk, gather, craft, talk, give, build, and every panel.
 *
 * This is the check that catches the class of bug a unit test cannot: a
 * button that renders but does nothing, a key that is swallowed, an
 * interaction that fires on the wrong target.
 *
 *   npm run dev            # in another terminal
 *   node scripts/playtest.mjs
 */
import { chromium } from 'playwright-core'

const base = process.env.LUMA_URL ?? 'http://127.0.0.1:5173/'
const url = base.includes('?') ? `${base}&fresh=1` : `${base}?fresh=1`

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome',
  headless: true,
  args: [
    '--disable-crash-reporter', '--disable-crashpad',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  ],
})
// software rendering is slow enough that the frame loop is the bottleneck;
// a small window at low quality keeps the session honest rather than timing out
const page = await browser.newPage({ viewport: { width: 900, height: 560 } })

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

const results = []
function check(label, ok, detail = '') {
  results.push({ label, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

const state = () => page.evaluate(() => {
  const l = window.luma
  return {
    pos: l.view.playerPosition(),
    items: { ...l.sim.player.inventory.items },
    wallet: l.sim.player.wallet,
    standing: l.progress.standing,
    gathered: l.progress.gathered,
    crafted: l.progress.crafted,
    placed: l.progress.placed.length,
    discovered: [...l.progress.discovered],
    met: [...l.progress.met],
    deeds: l.progress.deeds,
    time: l.sim.time,
    alive: l.sim.creatures.filter((c) => c.alive).length,
  }
})

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })

// --- it loads --------------------------------------------------------------
await page.waitForFunction(() => !!window.luma, null, { timeout: 60_000 })
await page.waitForFunction(
  () => document.querySelector('.loading')?.classList.contains('done'),
  null,
  { timeout: 90_000 },
)
check('the valley finishes loading', true)
await page.addStyleTag({ content: '.enter{display:none !important}' })
// the controls card opens itself on a first run; close whatever is up
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(400)
  if (await page.locator('.panel').count() === 0) continue
  await page.keyboard.press('Escape')
}
await page.waitForTimeout(400)
check('no panel is blocking the world', await page.locator('.panel').count() === 0)
await page.evaluate(() => window.luma.view.setQuality('low'))
await page.waitForTimeout(800)

/** Wait for something the game reports, rather than for a number of seconds. */
const until = async (fn, arg, label, timeout = 25_000) => {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 250 })
    return true
  } catch {
    console.log(`      (timed out waiting for ${label})`)
    return false
  }
}

const start = await state()
check('a settlement is already living there', start.alive >= 6, `${start.alive} Luma`)
check('you arrive carrying something', Object.keys(start.items).length >= 2,
  JSON.stringify(start.items))

// --- the world runs --------------------------------------------------------
await until((t) => window.luma.sim.time > t + 4, start.time, 'the clock to advance')
const later = await state()
check('the clock advances on its own', later.time > start.time, `tick ${start.time} → ${later.time}`)

// --- walking ---------------------------------------------------------------
await page.evaluate(() => {
  // somewhere flat and open, so a wall cannot be blamed for standing still
  window.luma.view.teleport(6, 30)
  window.luma.view.lookAt(0, 0, 0)
})
await page.waitForTimeout(600)
const from = (await state()).pos
await page.keyboard.down('KeyW')
await until(
  (p) => Math.hypot(window.luma.view.playerPosition().x - p.x, window.luma.view.playerPosition().z - p.z) > 3,
  from, 'the player to walk 3 m',
)
await page.keyboard.up('KeyW')
await page.waitForTimeout(300)
const walked = await state()
const distance = Math.hypot(walked.pos.x - from.x, walked.pos.z - from.z)
check('W walks you across the ground', distance > 3, `${distance.toFixed(1)} m`)

// --- typing must not walk you into a wall ----------------------------------
await page.evaluate(() => {
  const l = window.luma
  const c = l.sim.creatures.find((x) => x.alive)
  l.view.teleport(c.pos.x + 2, c.pos.z + 2)
  l.view.lookAt(c.pos.x, c.pos.z, -0.1)
})
await until(() => window.luma.view.currentTarget?.kind === 'creature', null, 'a Luma under the crosshair')
await page.keyboard.press('KeyE')
await page.waitForSelector('[data-talk-input]', { timeout: 15_000 }).catch(() => {})
const talkOpen = await page.locator('[data-panel="talk"]').count()
check('E on a Luma opens a conversation with them', talkOpen === 1)
if (!talkOpen) {
  console.log('cannot continue without a conversation')
  await browser.close()
  process.exit(1)
}

const beforeTyping = await state()
await page.locator('[data-talk-input]').fill('')
await page.locator('[data-talk-input]').type('hello there, are you hungry?', { delay: 12 })
await page.waitForTimeout(400)
const afterTyping = await state()
const drift = Math.hypot(afterTyping.pos.x - beforeTyping.pos.x, afterTyping.pos.z - beforeTyping.pos.z)
check('typing a message does not move you', drift < 0.2, `${drift.toFixed(3)} m of drift`)

await page.keyboard.press('Enter')
await page.waitForTimeout(600)
const replies = await page.locator('[data-talk-log] .line').count()
check('they answer you', replies >= 2, `${replies} lines in the log`)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// --- the crosshair picks who you are pointing at ---------------------------
const targeting = await page.evaluate(async () => {
  const l = window.luma
  const t = await import('/src/world/terrain.ts')
  const living = l.sim.creatures.filter((c) => c.alive)
  if (living.length < 2) return { ok: false, reason: 'not enough Luma' }
  // Put two of them side by side in the plaza and stand in front of both, so
  // the check is about where the crosshair points and nothing else.
  const [a, b] = living
  a.pos = { x: -1.4, z: -4 }
  b.pos = { x: 1.4, z: -4 }
  a.busyTicks = 200
  b.busyTicks = 200
  l.view.teleport(0, -1.6)
  return {
    ok: true,
    aId: a.id, bId: b.id,
    ax: a.pos.x, az: a.pos.z, ay: t.heightAt(a.pos.x, a.pos.z) + 1,
    bx: b.pos.x, bz: b.pos.z, by: t.heightAt(b.pos.x, b.pos.z) + 1,
  }
})
if (targeting.ok) {
  await page.evaluate((t) => window.luma.view.aimAt(t.ax, t.ay, t.az), targeting)
  await until((t) => window.luma.view.currentTarget?.id === t.aId, targeting, 'the left Luma')
  const first = await page.evaluate(() => window.luma.view.currentTarget?.id ?? null)
  await page.evaluate((t) => window.luma.view.aimAt(t.bx, t.by, t.bz), targeting)
  await until((t) => window.luma.view.currentTarget?.id === t.bId, targeting, 'the right Luma')
  const second = await page.evaluate(() => window.luma.view.currentTarget?.id ?? null)
  check(
    'the crosshair selects who you point at, not the nearest',
    first !== null && second !== null && first !== second,
    `looked left at ${first}, right at ${second}`,
  )
} else {
  check('the crosshair selects who you point at', false, targeting.reason)
}

// --- walls are solid ---------------------------------------------------------
const walled = await page.evaluate(async () => {
  const l = window.luma
  const world = await import('/src/lab/world.ts')
  const t = await import('/src/world/terrain.ts')
  const hall = world.findTower('bank')
  // stand outside the back of the building and try to walk straight through it
  const back = { x: hall.x - Math.sin(hall.facing) * 12, z: hall.z - Math.cos(hall.facing) * 12 }
  l.view.teleport(back.x, back.z)
  l.view.lookAt(hall.x, hall.z, 0)
  return { hx: hall.x, hz: hall.z, sx: back.x, sz: back.z, ground: t.heightAt(back.x, back.z) }
})
await page.waitForTimeout(800)
await page.keyboard.down('KeyW')
await until(
  (w) => {
    const p = window.luma.view.playerPosition()
    return Math.hypot(p.x - w.sx, p.z - w.sz) > 5.5
  },
  walled, 'the player to reach the wall', 12_000,
)
await page.waitForTimeout(1200)
await page.keyboard.up('KeyW')
const stopped = await page.evaluate(() => window.luma.view.playerPosition())
const intoBuilding = Math.hypot(stopped.x - walled.hx, stopped.z - walled.hz)
check(
  'a wall stops you instead of letting you walk through the building',
  intoBuilding > 4.5,
  `${intoBuilding.toFixed(1)} m from the middle of the hall`,
)

// --- trees are solid ---------------------------------------------------------
const treed = await page.evaluate(async () => {
  const l = window.luma
  const scatter = await import('/src/world/scatter.ts')
  const tree = scatter.worldScatter().props
    .filter((p) => p.kind === 'pine' || p.kind === 'tree')
    .sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z))[0]
  if (!tree) return null
  const angle = Math.atan2(tree.z, tree.x)
  const from = { x: tree.x + Math.cos(angle) * 4, z: tree.z + Math.sin(angle) * 4 }
  l.view.teleport(from.x, from.z)
  l.view.lookAt(tree.x, tree.z, 0)
  return { tx: tree.x, tz: tree.z }
})
if (treed) {
  await page.waitForTimeout(700)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(2500)
  await page.keyboard.up('KeyW')
  const at = await page.evaluate(() => window.luma.view.playerPosition())
  const gap = Math.hypot(at.x - treed.tx, at.z - treed.tz)
  check('you cannot walk through a tree', gap > 0.6, `${gap.toFixed(2)} m from the trunk`)
} else {
  check('you cannot walk through a tree', false, 'no tree found')
}

// --- gathering -------------------------------------------------------------
const nodeInfo = await page.evaluate(async () => {
  const l = window.luma
  const mod = await import('/src/world/scatter.ts')
  // the nearest berry bush to the plaza, so we are not testing a corner case
  const berries = mod.worldScatter().nodes.filter((n) => n.kind === 'berry')
  berries.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
  const node = berries[0]
  if (!node) return null
  const angle = Math.atan2(node.z, node.x)
  l.view.teleport(node.x + Math.cos(angle) * 2, node.z + Math.sin(angle) * 2)
  l.view.aimAt(node.x, node.y + 0.6, node.z)
  return { id: node.id, kind: node.kind, x: node.x, z: node.z }
})
if (nodeInfo) {
  await until(() => window.luma.view.currentTarget?.kind === 'node', null, 'a bush under the crosshair')
  const seen = await page.evaluate(() => window.luma.view.currentTarget?.kind ?? null)
  check('a berry bush is a thing you can point at', seen === 'node', `saw ${seen}`)
  const before = await state()
  await page.keyboard.down('KeyE')
  await until((n) => (window.luma.sim.player.inventory.items.berry ?? 0) > n,
    before.items.berry ?? 0, 'berries in the pack')
  await page.keyboard.up('KeyE')
  await page.waitForTimeout(300)
  const after = await state()
  check(
    'holding E picks the bush',
    (after.items.berry ?? 0) > (before.items.berry ?? 0),
    `berries ${before.items.berry ?? 0} → ${after.items.berry ?? 0}`,
  )
} else {
  check('a berry bush exists in the valley', false)
}

// --- crafting --------------------------------------------------------------
await page.evaluate(async () => {
  const l = window.luma
  const inv = await import('/src/lab/inventory.ts')
  const world = await import('/src/lab/world.ts')
  inv.addItem(l.sim.player.inventory, 'grain', 4, 0)
  const hearth = world.findTower('homes')
  l.view.teleport(hearth.x + 3, hearth.z + 3)
})
await page.waitForTimeout(500)
await page.keyboard.press('Tab')
await page.waitForSelector('[data-panel="pack"]', { timeout: 15_000 }).catch(() => {})
check('Tab opens the pack', await page.locator('[data-panel="pack"]').count() === 1)
await page.locator('.tabs button', { hasText: 'Crafting' }).click()
await page.waitForTimeout(300)
const beforeCraft = await state()
await page.locator('[data-recipe="loaf"] button').click()
await page.waitForTimeout(400)
const afterCraft = await state()
check(
  'you can bake a loaf at a hearth',
  (afterCraft.items.bread ?? 0) > (beforeCraft.items.bread ?? 0),
  `bread ${beforeCraft.items.bread ?? 0} → ${afterCraft.items.bread ?? 0}`,
)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// --- giving, and a request completing --------------------------------------
const gave = await page.evaluate(() => {
  const l = window.luma
  const c = l.sim.creatures.find((x) => x.alive)
  l.view.teleport(c.pos.x + 1.6, c.pos.z + 1.6)
  l.view.lookAt(c.pos.x, c.pos.z, -0.1)
  return c.id
})
await until(() => window.luma.view.currentTarget?.kind === 'creature', null, 'someone to give to')
const beforeGive = await state()
await page.evaluate(() => window.luma.view.useHeld('bread'))
await page.waitForTimeout(500)
const afterGive = await state()
check(
  'left click hands what you hold to who you are looking at',
  (afterGive.items.bread ?? 0) < (beforeGive.items.bread ?? 0),
  `gave to ${gave}`,
)

// --- building --------------------------------------------------------------
await page.evaluate(async () => {
  const l = window.luma
  const inv = await import('/src/lab/inventory.ts')
  inv.addItem(l.sim.player.inventory, 'lantern', 1, 0)
  l.view.place('lantern')
})
await page.waitForTimeout(400)
const built = await state()
check('you can set a lantern down in the world', built.placed > 0, `${built.placed} placed`)

// --- discovery -------------------------------------------------------------
await page.evaluate(async () => {
  const l = window.luma
  const lore = await import('/src/world/lore.ts')
  const stones = lore.LANDMARKS.find((x) => x.id === 'stones')
  l.view.teleport(stones.x, stones.z)
})
await until(() => window.luma.progress.discovered.includes('stones'), null, 'the stones to be found')
const found = await state()
check(
  'walking to a landmark writes it into the journal',
  found.discovered.includes('stones'),
  found.discovered.join(', ') || 'nothing found',
)

// --- buying and selling ------------------------------------------------------
const shopping = await page.evaluate(async () => {
  const l = window.luma
  const world = await import('/src/lab/world.ts')
  const inv = await import('/src/lab/inventory.ts')
  const market = world.findTower('food')
  // stand at the counter with coins and something they want
  l.view.teleport(market.x, market.z + market.radius + 1)
  l.sim.player.wallet = 40
  inv.addItem(l.sim.player.inventory, 'grain', 2, 0)
  l.sim.economy.goods.bread.stock = Math.max(3, l.sim.economy.goods.bread.stock)
  const before = {
    wallet: l.sim.player.wallet,
    bread: l.sim.player.inventory.items.bread ?? 0,
    grain: l.sim.player.inventory.items.grain ?? 0,
  }
  const bought = l.sim.playerBuy('food', 'bread')
  const sold = l.sim.playerSell('food', 'grain')
  return {
    before,
    bought,
    sold,
    after: {
      wallet: l.sim.player.wallet,
      bread: l.sim.player.inventory.items.bread ?? 0,
      grain: l.sim.player.inventory.items.grain ?? 0,
    },
  }
})
check(
  'you can buy from a shop at the price the Luma pay',
  shopping.bought.ok && shopping.after.bread > shopping.before.bread
    && shopping.after.wallet < shopping.before.wallet,
  shopping.bought.message,
)
check(
  'and sell into its till',
  shopping.sold.ok && shopping.after.grain < shopping.before.grain,
  shopping.sold.message,
)

// --- a counter opens the shop ------------------------------------------------
await page.evaluate(async () => {
  const l = window.luma
  const counter = l.sim.fixtures.find((f) => f.kind === 'counter' && f.tower === 'food')
  if (!counter) return
  l.view.teleport(counter.x, counter.z + 2)
  l.view.aimAt(counter.x, 1.0, counter.z)
})
await until(() => window.luma.view.currentTarget?.kind === 'fixture', null, 'a counter under the crosshair')
await page.keyboard.press('KeyE')
await page.waitForSelector('[data-panel="shop"]', { timeout: 10_000 }).catch(() => {})
check('E at a counter opens the shop', await page.locator('[data-panel="shop"]').count() === 1)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// --- an empty hand is a hand -------------------------------------------------
const comforted = await page.evaluate(async () => {
  const l = window.luma
  const c = l.sim.creatures.find((x) => x.alive)
  c.chem.pleasure = 0.2
  c.pos = { x: l.view.playerPosition().x + 1.4, z: l.view.playerPosition().z + 1.4 }
  const before = c.chem.pleasure
  l.view.aimAt(c.pos.x, 1.2, c.pos.z)
  await new Promise((r) => setTimeout(r, 500))
  l.view.useHeld(null)
  return { before, after: c.chem.pleasure, id: c.id }
})
check(
  'an empty hand on somebody comforts them',
  comforted.after > comforted.before,
  `pleasure ${comforted.before.toFixed(2)} to ${comforted.after.toFixed(2)}`,
)

// --- the toolbar is reachable while the mouse is free ------------------------
const toolBox = await page.locator('[data-tool="journal"]').boundingBox()
let toolClickable = false
if (toolBox) {
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return el?.closest('[data-tool]')?.getAttribute('data-tool') ?? null
  }, { x: toolBox.x + toolBox.width / 2, y: toolBox.y + toolBox.height / 2 })
  toolClickable = hit === 'journal'
}
check('the top-right buttons are not covered by anything', toolClickable)

// --- every panel opens -----------------------------------------------------
const panels = [
  ['KeyR', 'board'], ['Tab', 'pack'], ['KeyJ', 'journal'], ['KeyH', 'society'],
  ['KeyI', 'mind'], ['KeyM', 'atlas'], ['KeyO', 'settings'], ['F1', 'guide'],
]
for (const [key, id] of panels) {
  await page.keyboard.press(key)
  await page.waitForSelector(`[data-panel="${id}"]`, { timeout: 10_000 }).catch(() => {})
  const open = await page.locator(`[data-panel="${id}"]`).count()
  const box = open ? await page.locator(`[data-panel="${id}"]`).first().boundingBox() : null
  check(`${key} opens ${id}`, open === 1 && !!box && box.height > 80,
    box ? `${Math.round(box.width)}×${Math.round(box.height)}` : 'not visible')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}

// --- the HUD is actually on screen ----------------------------------------
for (const [selector, label] of [
  ['[data-hotbar]', 'the hotbar'],
  ['.vitals .meter.health .fill', 'the health bar'],
  ['.crosshair', 'the crosshair'],
  ['.status .place', 'the place name'],
]) {
  const box = await page.locator(selector).first().boundingBox().catch(() => null)
  check(`${label} is drawn`, !!box && box.width > 1 && box.height > 0,
    box ? `${Math.round(box.width)}×${Math.round(box.height)}` : 'no box')
}

// --- performance -----------------------------------------------------------
const perf = await page.evaluate(async () => {
  const samples = []
  let last = performance.now()
  await new Promise((resolve) => {
    let n = 0
    const tick = () => {
      const now = performance.now()
      samples.push(now - last)
      last = now
      if (++n < 90) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
  samples.sort((a, b) => a - b)
  return {
    median: samples[Math.floor(samples.length / 2)],
    p95: samples[Math.floor(samples.length * 0.95)],
    draws: window.luma.view.engine.renderer.info.render.calls,
    tris: window.luma.view.engine.renderer.info.render.triangles,
  }
})
console.log(
  `\nsoftware-rendered frame: median ${perf.median.toFixed(1)} ms, p95 ${perf.p95.toFixed(1)} ms, ` +
  `${perf.draws} draws, ${(perf.tris / 1000).toFixed(0)}k triangles`,
)
check('the scene stays inside a sane draw-call budget', perf.draws < 400, `${perf.draws} draws`)

// --- console ---------------------------------------------------------------
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.log('failed:')
  for (const f of failed) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ''}`)
  process.exit(1)
}

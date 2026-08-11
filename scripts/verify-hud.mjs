/**
 * verify-hud — a headless check that the HUD the player needs is actually on
 * screen and clickable. Catches the class of bug where an element exists in
 * the markup but is collapsed, hidden, or covered.
 *
 *   node scripts/verify-hud.mjs            # against http://127.0.0.1:5173/
 *   LUMA_URL=... node scripts/verify-hud.mjs
 */
import { chromium } from 'playwright-core'

const url = `${process.env.LUMA_URL ?? 'http://127.0.0.1:5173/'}?fresh=1`
const executablePath = process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome'

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--disable-crash-reporter', '--disable-crashpad', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
await page.waitForTimeout(4000)

const failures = []
const notes = []

async function visible(selector, label) {
  const el = page.locator(selector).first()
  const count = await el.count()
  if (count === 0) {
    failures.push(`${label}: not in the page at all (${selector})`)
    return false
  }
  const box = await el.boundingBox()
  if (!box || box.width < 2 || box.height < 2) {
    failures.push(`${label}: present but collapsed to ${box ? `${box.width}x${box.height}` : 'no box'}`)
    return false
  }
  notes.push(`${label}: ${Math.round(box.width)}x${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)}`)
  return true
}

// the controls card greets a first-time player
await visible('[data-help]', 'controls card')
await page.locator('[data-help-close]').first().click({ force: true })
await page.waitForTimeout(300)

// the player HUD and its per-item give/drop controls
await visible('[data-player-hud]', 'player HUD')
await visible('[data-player-inv]', 'inventory strip')
await visible('[data-player-give="bread"]', 'give button')
await visible('[data-player-drop="bread"]', 'drop button')

// settings: the save controls must be reachable, not just present
await page.locator('[data-settings-btn]').first().click({ force: true })
await page.waitForTimeout(300)
await visible('[data-settings]', 'settings panel')
await visible('[data-save-slots]', 'save slots row')
await visible('[data-save-slot="1"]', 'save slot 1 button')
await visible('[data-export-save]', 'export button')
await visible('[data-import-save]', 'import button')
await visible('[data-manual-save]', 'save now button')
await page.locator('[data-settings-close]').first().click({ force: true })

// society panel with its story feed
await page.locator('[data-society-btn]').first().click({ force: true })
await page.waitForTimeout(300)
await visible('[data-society]', 'society panel')
await visible('[data-society-stories]', 'story feed')
await page.locator('[data-society-close]').first().click({ force: true })

// talking to somebody
await page.locator('[data-talk-btn]').first().click({ force: true })
await page.waitForTimeout(300)
await visible('[data-talk-input]', 'talk input')
await page.locator('[data-talk-input]').first().fill('hello')
await page.locator('[data-talk-submit]').first().click({ force: true })
await page.waitForTimeout(500)
const reply = await page.locator('[data-talk-reply]').first().textContent().catch(() => null)
if (!reply || reply.trim().length < 3) failures.push('talk: no reply rendered')
else notes.push(`talk reply: ${reply.trim().slice(0, 70)}`)

// every panel must be reachable from the keyboard, and Esc must close them
const keyPanels = [
  ['t', '[data-talk]', 'T opens talk'],
  ['i', '[data-inspector]', 'I opens the inspector'],
  ['h', '[data-society]', 'H opens Haven'],
  ['g', '[data-settings]', 'G opens settings'],
  ['m', '[data-market]', 'M opens the market'],
  ['?', '[data-help]', '? opens the controls card'],
]
// the inspector needs somebody selected first
await page.evaluate(() => {
  const lab = window.__lab
  if (lab?.sim?.creatures?.length) lab.view.callbacks?.onTapCreature?.(lab.sim.creatures[0].id, 0, 0)
})
await page.keyboard.press('Escape')
for (const [key, selector, label] of keyPanels) {
  await page.keyboard.press(key)
  await page.waitForTimeout(250)
  const shown = await page.locator(selector).first().count()
  if (shown === 0) failures.push(`${label}: nothing appeared`)
  else notes.push(label)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  if (await page.locator(selector).first().count()) failures.push(`${label}: Escape did not close it`)
}

// F3 shows the per-subsystem breakdown
await page.keyboard.press('F3')
await page.waitForTimeout(300)
if (await page.locator('[data-perf-phases]').first().count() === 0) {
  failures.push('F3: no per-phase breakdown')
} else {
  notes.push('F3 shows the phase breakdown')
}
await page.keyboard.press('F3')

// let the simulation run a while and make sure nothing throws
await page.locator('[data-speed="10"]').first().click({ force: true })
await page.waitForTimeout(8000)

await browser.close()

console.log('\nHUD check\n')
for (const n of notes) console.log(`  ok    ${n}`)
for (const f of failures) console.log(`  FAIL  ${f}`)
if (consoleErrors.length) {
  console.log('\nconsole errors:')
  for (const e of consoleErrors.slice(0, 10)) console.log(`  ${e}`)
}
const bad = failures.length + consoleErrors.filter((e) => !/WebGL|webgl|GPU|Failed to load resource/i.test(e)).length
console.log(`\n${bad === 0 ? 'PASS' : `FAIL (${bad} problems)`}\n`)
process.exit(bad === 0 ? 0 : 1)

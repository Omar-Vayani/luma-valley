import { chromium } from 'playwright-core'

const executablePath = '/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'
const url = process.env.LUMA_URL ?? process.env.BASE_URL ?? 'http://localhost:5210/'
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--disable-crash-reporter', '--disable-crashpad'],
})

const results = {}
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

async function startGame(page) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.getByRole('button', { name: /Enter the City|New Valley/ }).first().click()
  await page.waitForFunction(() => window.__luma?.view?.fps, null, { timeout: 20_000 })
  const explore = page.locator('.fpv-hint button')
  if (await explore.count()) await explore.click()
  await page.waitForTimeout(800)
}

async function state(page) {
  return page.evaluate(() => {
    const view = window.__luma.view
    const direction = view.camera.position.clone()
    view.camera.getWorldDirection(direction)
    return {
      yaw: view.fps.yaw,
      pitch: view.fps.pitch,
      direction,
      renderedYaw: Math.atan2(direction.x, direction.z),
      renderedPitch: Math.asin(direction.y),
      quaternion: view.camera.quaternion.toArray(),
      position: view.fps.position.toArray(),
    }
  })
}

try {
  const mobile = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })
  const page = await mobile.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await startGame(page)

  results.mobileUi = await page.evaluate(() => ({
    lookSurface: !!document.querySelector('.look-surface'),
    joystick: !!document.querySelector('.joystick'),
    lookStick: !!document.querySelector('.lookstick'),
    jump: !!document.querySelector('.jump-btn'),
    interact: !!document.querySelector('.interact-btn'),
    initialCarePanel: !!document.querySelector('.panel'),
  }))
  assert(results.mobileUi.lookSurface, 'full-screen look surface is missing')
  assert(results.mobileUi.joystick, 'movement joystick is missing')
  assert(!results.mobileUi.lookStick, 'a second joystick was rendered')
  assert(!results.mobileUi.initialCarePanel, 'care panel blocks the initial mobile playfield')

  const cdp = await mobile.newCDPSession(page)

  // Direct manipulation: drag right and the world pans right under the finger,
  // which means camera yaw/rendered direction decrease.
  const rightBefore = await state(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 220, y: 270, id: 11 }] })
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 220 + i * 9, y: 270, id: 11 }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const rightAfter = await state(page)
  assert(rightAfter.yaw < rightBefore.yaw - 0.2, 'drag right did not pan the world right')
  assert(rightAfter.renderedYaw < rightBefore.renderedYaw - 0.2, 'rendered world did not pan right under the finger')
  assert(Math.abs(rightAfter.renderedYaw - rightAfter.yaw) < 0.001, 'rendered camera yaw diverged from controls')
  results.slideRight = { yawDelta: rightAfter.yaw - rightBefore.yaw, renderedYawDelta: rightAfter.renderedYaw - rightBefore.renderedYaw }

  // Real touch drag up: pitch and actual world-direction Y must both look up.
  const upBefore = await state(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 220, y: 330, id: 12 }] })
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 220, y: 330 - i * 9, id: 12 }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const upAfter = await state(page)
  assert(upAfter.pitch > upBefore.pitch + 0.2, 'slide up did not increase pitch')
  assert(upAfter.direction.y > upBefore.direction.y + 0.15, 'rendered camera did not visibly look up')
  assert(Math.abs(upAfter.renderedPitch - upAfter.pitch) < 0.001, 'rendered camera pitch diverged from controls')
  results.slideUp = { pitchDelta: upAfter.pitch - upBefore.pitch, renderedPitchDelta: upAfter.renderedPitch - upBefore.renderedPitch }

  // Two-thumb path: hold movement joystick while a second finger drags the look surface.
  const joystick = await page.locator('.joystick').boundingBox()
  assert(joystick, 'joystick has no layout box')
  const jx = joystick.x + joystick.width / 2
  const jy = joystick.y + joystick.height / 2
  const simultaneousBefore = await state(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy, id: 21 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy, id: 21 }, { x: 250, y: 300, id: 22 }] })
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: jx, y: jy - 32, id: 21 },
        { x: 250 + i * 7, y: 300 - i * 4, id: 22 },
      ],
    })
    await page.waitForTimeout(25)
  }
  await page.waitForTimeout(350)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const simultaneousAfter = await state(page)
  const movedDistance = Math.hypot(
    simultaneousAfter.position[0] - simultaneousBefore.position[0],
    simultaneousAfter.position[2] - simultaneousBefore.position[2],
  )
  assert(movedDistance > 0.5, 'joystick did not move during simultaneous touch')
  assert(simultaneousAfter.yaw < simultaneousBefore.yaw - 0.1, 'second finger did not direct-manipulate look during simultaneous touch')
  results.twoThumb = { movedDistance, yawDelta: simultaneousAfter.yaw - simultaneousBefore.yaw }

  // Care interaction: selecting opens the panel, sharing bread consumes inventory,
  // and the close button restores the unobstructed playfield.
  const breadBefore = await page.evaluate(() => {
    const view = window.__luma.view
    const firstId = view.game.creatures.find((creature) => creature.alive)?.id
    view.select(firstId)
    return view.game.player.inventory.items.bread ?? 0
  })
  await page.locator('.panel').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: /Share bread/ }).click()
  const breadAfter = await page.evaluate(() => window.__luma.view.game.player.inventory.items.bread ?? 0)
  assert(breadAfter === breadBefore - 1, 'Share bread did not consume exactly one loaf')
  await page.getByRole('button', { name: 'Close creature care' }).click()
  assert(!(await page.locator('.panel').isVisible()), 'care panel did not close')
  results.careInteraction = { breadBefore, breadAfter, panelClosed: true }

  // Focused text fields must isolate desktop interaction hotkeys.
  await page.evaluate(() => {
    const view = window.__luma.view
    const firstId = view.game.creatures.find((creature) => creature.alive)?.id
    view.select(firstId)
    window.__interactCalls = 0
    const originalInteract = view.interact.bind(view)
    view.interact = (...args) => {
      window.__interactCalls += 1
      return originalInteract(...args)
    }
  })
  await page.getByRole('button', { name: /Mind, memories & teaching/ }).click()
  const teachInput = page.getByPlaceholder('teach a word…')
  await teachInput.focus()
  assert(await teachInput.evaluate((input) => document.activeElement === input), 'teach input could not receive focus')
  await teachInput.press('f')
  const interactCallsWhileTyping = await page.evaluate(() => window.__interactCalls)
  assert(interactCallsWhileTyping === 0, 'F interacted with the world while typing')
  await page.getByRole('button', { name: 'Close creature care' }).click()

  // The topbar must stay above the look surface so Menu remains tappable.
  await page.getByRole('button', { name: 'Menu' }).click()
  assert(await page.getByRole('heading', { name: 'Menu' }).isVisible(), 'look surface intercepted the Menu button')
  await page.keyboard.press('f')
  const interactCallsWithModalOpen = await page.evaluate(() => window.__interactCalls)
  assert(interactCallsWithModalOpen === 0, 'F interacted with the world through an open modal')
  await page.getByRole('button', { name: 'Close' }).click()
  results.uiIsolation = { interactCallsWhileTyping, interactCallsWithModalOpen, menuOpened: true }

  results.mobileErrors = errors
  assert(errors.length === 0, `mobile page errors: ${errors.join('; ')}`)
  await mobile.close()

  // Desktop regression: real mouse motion still rotates the rendered camera.
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const desktopPage = await desktop.newPage()
  await startGame(desktopPage)
  const desktopBefore = await state(desktopPage)
  await desktopPage.mouse.move(650, 320)
  await desktopPage.mouse.move(780, 250, { steps: 12 })
  const desktopAfter = await state(desktopPage)
  assert(desktopAfter.yaw > desktopBefore.yaw + 0.1, 'desktop mouse did not turn right')
  assert(desktopAfter.pitch > desktopBefore.pitch + 0.05, 'desktop mouse did not look up')
  results.desktop = {
    yawDelta: desktopAfter.yaw - desktopBefore.yaw,
    pitchDelta: desktopAfter.pitch - desktopBefore.pitch,
  }
  await desktop.close()

  console.log(`PASS mobile controls and rendered camera\n${JSON.stringify(results, null, 2)}`)
} finally {
  await browser.close()
}

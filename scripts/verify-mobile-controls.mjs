import { chromium } from 'playwright-core'

const executablePath = '/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--disable-crash-reporter', '--disable-crashpad', '--disable-gpu'],
})

async function startGame(page) {
  await page.goto('http://localhost:5210/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /New Valley/ }).click()
  await page.waitForFunction(() => window.__luma?.view?.fps)
}

async function angles(page) {
  return page.evaluate(() => ({
    yaw: window.__luma.view.fps.yaw,
    pitch: window.__luma.view.fps.pitch,
  }))
}

function changed(before, after) {
  return before.yaw !== after.yaw || before.pitch !== after.pitch
}

try {
  const mobile = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await mobile.newPage()
  await startGame(page)

  const rendered = await page.locator('.lookstick').isVisible()
  if (!rendered) throw new Error('lookstick was not rendered in touch context')

  const stick = page.locator('.lookstick')
  const box = await stick.boundingBox()
  if (!box) throw new Error('lookstick has no bounding box')
  const sx = box.x + box.width / 2
  const sy = box.y + box.height / 2
  const stickBefore = await angles(page)
  await stick.dispatchEvent('pointerdown', { pointerId: 41, pointerType: 'touch', clientX: sx, clientY: sy, bubbles: true })
  await stick.dispatchEvent('pointermove', { pointerId: 41, pointerType: 'touch', clientX: sx + 32, clientY: sy - 18, bubbles: true })
  await stick.dispatchEvent('pointerup', { pointerId: 41, pointerType: 'touch', clientX: sx + 32, clientY: sy - 18, bubbles: true })
  const stickAfter = await angles(page)
  if (!changed(stickBefore, stickAfter)) throw new Error('lookstick did not rotate camera')

  const canvas = page.locator('canvas')
  const canvasBox = await canvas.boundingBox()
  if (!canvasBox) throw new Error('canvas has no bounding box')
  const cx = canvasBox.x + canvasBox.width * 0.72
  const cy = canvasBox.y + canvasBox.height * 0.35
  const cdp = await mobile.newCDPSession(page)
  const canvasBefore = await angles(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 7 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 45, y: cy + 24, id: 7 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const canvasAfter = await angles(page)
  if (!changed(canvasBefore, canvasAfter)) throw new Error('canvas touch drag did not rotate camera')
  await mobile.close()

  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const desktopPage = await desktop.newPage()
  await startGame(desktopPage)
  const desktopBefore = await angles(desktopPage)
  await desktopPage.mouse.move(700, 300)
  await desktopPage.mouse.move(755, 325)
  const desktopAfter = await angles(desktopPage)
  if (!changed(desktopBefore, desktopAfter)) throw new Error('desktop mouse did not rotate camera')
  await desktop.close()

  console.log(JSON.stringify({ rendered, stick: { before: stickBefore, after: stickAfter }, canvas: { before: canvasBefore, after: canvasAfter }, desktop: { before: desktopBefore, after: desktopAfter } }, null, 2))
} finally {
  await browser.close()
}

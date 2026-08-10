// App observer-UI copy test. This repo has no DOM test environment
// (no jsdom/happy-dom installed), so this asserts the REAL App source —
// exactly the copy and structure the player sees. Same approach as the
// pre-rebuild app.test.ts.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/App.tsx', 'utf8')
const css = readFileSync('src/lab.css', 'utf8')

describe('App test-lab UI', () => {
  it('wires the renderer and sim: LabView + createSim', () => {
    expect(app).toContain("import { LabView } from './render/labview'")
    expect(app).toContain("import { createSim, type Sim } from './lab/sim'")
    expect(app).toContain('new LabView(')
    expect(app).toContain('createSim(seed)')
    expect(app).toContain('viewRef.current?.dispose()')
    expect(app).toContain('export default function App')
  })

  it('has the dock and the full tool set (spawn/bread/money + benevolence + malice)', () => {
    expect(app).toContain('data-dock')
    expect(app).toContain('data-dock-group="benevolence"')
    expect(app).toContain('data-dock-group="malice"')
    expect(app).toContain('data-lab-tool="spawn"')
    expect(app).toContain('data-lab-tool="bread"')
    expect(app).toContain('data-lab-tool="money"')
    for (const id of ['comfort', 'heal', 'gift', 'poke', 'hit', 'scare', 'rob']) {
      expect(app).toContain(`'${id}'`)
      expect(app).toContain(`data-lab-tool={def.id}`)
    }
    expect(app).toContain('aria-pressed')
  })

  it('shows the selection chip with name, emotion, needs, wallet, gang, action', () => {
    expect(app).toContain('data-chip')
    expect(app).toContain('data-chip-close')
    expect(app).toContain('deriveEmotion(')
    expect(app).toContain('selected.chem.hunger')
    expect(app).toContain('selected.chem.energy')
    expect(app).toContain('selected.chem.strength')
    expect(app).toContain('selected.chem.fear')
    expect(app).toContain('selected.wallet')
    expect(app).toContain('selected.banked')
    expect(app).toContain('selected.weapon')
    expect(app).toContain('selected.gangId')
    expect(app).toContain('selected.action')
    expect(app).toContain('selected.gratitude[0]')
    expect(app).toContain('partner.name')
  })

  it('shows live count and speed controls in the top bar', () => {
    expect(app).toContain('data-topbar')
    expect(app).toContain('Luma Lab')
    expect(app).toContain('data-count="alive"')
    expect(app).toContain('setPaused')
    expect(app).toContain('setSpeed')
    expect(app).toContain('data-speed="pause"')
    expect(app).toContain('data-speed="1"')
    expect(app).toContain('data-speed="2"')
    expect(app).toContain('data-speed="10"')
    expect(app).toContain('data-sound=')
  })

  it('has zero action-message text or toasts — the world is the feedback', () => {
    expect(app).not.toContain('pushMessage')
    expect(app).not.toContain('setMessages')
    expect(app).not.toContain('data-msg-stack')
    expect(app).not.toContain('toast')
    expect(app).not.toContain('You fed')
    expect(app).not.toContain('you fed')
    expect(app).not.toContain('has died')
    expect(app).not.toContain('message')
  })

  it('does not touch save/load — sim has none, App must not invent them', () => {
    expect(app).not.toContain('.save()')
    expect(app).not.toContain('.load(')
    expect(app).not.toContain('idbSave')
    expect(app).not.toContain('localStorage')
  })

  it('has first-person mode: always-on player, joystick, look zone, pointer lock, social dock', () => {
    expect(app).toContain('data-view-mode="first-person"')
    expect(app).toContain('data-move')
    expect(app).toContain('data-look')
    expect(app).toContain('data-pointerlock')
    expect(app).toContain('data-lab-tool="social"')
    expect(app).toContain('setFirstPerson')
    expect(app).toContain('playerSocialize')
    expect(app).toContain("import { LabView } from './render/labview'")
    expect(css).toContain('.view-toggle')
    expect(css).toContain('.fp-move')
    expect(css).toContain('.fp-look')
    expect(css).toContain('.fp-btn')
  })

  it('lab.css provides the dock, chip, 56px buttons, and safe-area insets', () => {
    expect(css).toContain('.dock')
    expect(css).toContain('.chip')
    expect(css).toContain('56px')
    expect(css).toContain('safe-area-inset')
    expect(css).toContain('.dock-btn-active')
    expect(css).toContain('40vh')
  })
})

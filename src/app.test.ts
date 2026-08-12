/**
 * The UI contract, asserted against the real source.
 *
 * There is no DOM here; the useful checks that need one live in
 * `scripts/playtest.mjs`, which drives a real browser. What this file is for
 * is the wiring that is easy to break silently in a refactor: that the shell
 * still owns the world, that the panels still exist and are reachable, and
 * that the two input rules the game depends on are still written down.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const app = readFileSync('src/App.tsx', 'utf8')
const hud = readFileSync('src/ui/Hud.tsx', 'utf8')
const css = readFileSync('src/ui/theme.css', 'utf8')
const input = readFileSync('src/game/input.ts', 'utf8')
const targeting = readFileSync('src/game/targeting.ts', 'utf8')
const controller = readFileSync('src/game/controller.ts', 'utf8')
const worldView = readFileSync('src/render/world-view.ts', 'utf8')

describe('the shell owns the world and nothing else', () => {
  it('builds one WorldView over one Sim', () => {
    expect(app).toContain("import { WorldView, type HudSnapshot } from './render/world-view'")
    expect(app).toContain("import { createSim, type Sim } from './lab/sim'")
    expect(app).toContain('new WorldView(')
    expect(app).toContain('view.dispose()')
    expect(app).toContain('export default function App')
  })

  it('keeps React out of the scene', () => {
    // if React starts importing three directly, the split has broken
    expect(app).not.toContain("from 'three'")
    expect(hud).not.toContain("from 'three'")
  })

  it('persists the world and the visit separately', () => {
    expect(app).toContain('saveSim')
    expect(app).toContain('saveWorldBlob')
    expect(app).toContain('loadWorldBlob')
    expect(app).toContain('loadWorldBackup')
    expect(app).toContain('saveProgress')
    expect(app).toContain('migrateProgress')
  })

  it('seeds a settlement with history on a fresh world', () => {
    expect(app).toContain('seedStarterSociety')
    expect(app).toContain('equipTraveller')
    const seed = readFileSync('src/game/seed.ts', 'utf8')
    expect(seed).toContain('ensureCoupleHousehold')
    expect(seed).toContain('adoptChild')
    expect(seed).toContain('transmitCulture')
  })
})

describe('input: typing is typing, and walking is walking', () => {
  it('has exactly one place that decides whether a key reaches the world', () => {
    expect(input).toContain('private get typing()')
    expect(input).toContain("tag === 'INPUT'")
    expect(input).toContain("tag === 'TEXTAREA'")
    expect(input).toContain('isContentEditable')
    expect(input).toContain('uiCaptured')
    // and it lets go of anything held down, rather than leaving it stuck
    expect(input).toContain('this.releaseAll()')
  })

  it('stops the world hearing the keyboard while a panel is open', () => {
    expect(app).toContain('setUiCaptured(panel !== null)')
    expect(worldView).toContain('setUiCaptured(captured: boolean)')
    expect(worldView).toContain('this.input.exitLock()')
  })

  it('does not silently pause the simulation when you open a panel', () => {
    expect(app).toContain('viewRef.current?.setPaused(paused)')
    expect(app).not.toContain('setPaused(paused || panel !== null)')
  })
})

describe('targeting: the crosshair means what it looks like it means', () => {
  it('casts down the middle of the screen rather than taking the nearest', () => {
    expect(targeting).toContain('export function pickTarget')
    expect(targeting).toContain('function against(')
    expect(targeting).toContain('lateral')
    expect(targeting).not.toContain('nearestCreature')
  })

  it('can point at people, plants, furniture, drops, your own buildings and water', () => {
    for (const kind of ['creature', 'node', 'fixture', 'drop', 'placed', 'water']) {
      expect(targeting).toContain(`kind: '${kind}'`)
    }
  })
})

describe('the feel of it', () => {
  it('has gravity, a jump, a sprint, a crouch and swimming', () => {
    for (const bit of ['GRAVITY', 'JUMP_SPEED', 'SPRINT', 'EYE_CROUCH', 'swimming', 'COYOTE']) {
      expect(controller).toContain(bit)
    }
  })

  it('bobs the camera and plays a footstep on the ground you are on', () => {
    expect(controller).toContain('bobPhase')
    expect(controller).toContain('onFootstep')
    expect(worldView).toContain('STEP_SOUNDS')
  })

  it('holds E for the slow jobs', () => {
    expect(worldView).toContain('updateHold')
    expect(worldView).toContain('effortFor')
    expect(hud).toContain('hold')
  })
})

describe('the HUD says where, when, who and what', () => {
  it('draws the crosshair, prompt, clock, place, vitals and hotbar', () => {
    for (const bit of ['crosshair', 'data-prompt', 'data-hotbar', 'className="vitals"', 'sun-dial']) {
      expect(hud).toContain(bit)
    }
    expect(hud).toContain('standing')
    expect(hud).toContain('data-perf-overlay')
  })

  it('uses drawn icons rather than whatever emoji font is installed', () => {
    expect(hud).toContain("import { Icon, type IconName } from './Icon'")
    expect(readdirSync('src/ui')).toContain('Icon.tsx')
  })

  it('never lays out a bar inside an inline span', () => {
    // the class of bug where a meter renders as nothing at all
    const meterFill = css.slice(css.indexOf('.meter .fill'), css.indexOf('.meter .fill') + 120)
    expect(meterFill).toContain('display: block')
  })
})

describe('every panel exists and is reachable', () => {
  const panels = ['Talk', 'Pack', 'Journal', 'Society', 'Mind', 'Board', 'Atlas', 'Settings', 'Guide']

  it('has a file for each', () => {
    const files = readdirSync('src/ui/panels')
    for (const p of panels) expect(files).toContain(`${p}.tsx`)
  })

  it('is wired into the shell', () => {
    for (const p of panels) expect(app).toContain(`<${p}`)
  })

  it('is bound to a key', () => {
    for (const key of ['Tab', 'KeyR', 'KeyJ', 'KeyH', 'KeyI', 'KeyM', 'KeyO', 'F1']) {
      expect(app).toContain(key)
    }
    expect(app).toContain("code === 'Escape'")
  })

  it('closes on Escape from inside a text field', () => {
    const panel = readFileSync('src/ui/Panel.tsx', 'utf8')
    expect(panel).toContain("e.key === 'Escape'")
    expect(panel).toContain('onClose()')
  })
})

describe('the player has things to do', () => {
  it('can gather, craft, build and be asked for help', () => {
    expect(worldView).toContain('completeHarvest')
    expect(worldView).toContain('place(item: ItemId | null)')
    expect(app).toContain('scanRequests')
    expect(app).toContain('onGive(')
    expect(app).toContain('onTalk(')
    expect(app).toContain('onLandmark(')
  })

  it('keeps a journal of a valley that had a history before you got there', () => {
    const journal = readFileSync('src/ui/panels/Journal.tsx', 'utf8')
    expect(journal).toContain('LANDMARKS')
    expect(journal).toContain('TIMELINE')
    expect(app).toContain('onDiscover')
  })
})

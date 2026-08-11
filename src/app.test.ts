/**
 * App UI contract for Luma Haven — asserts the real App source structure.
 * No DOM environment; this keeps the HUD surface area intentional.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/App.tsx', 'utf8')
const css = readFileSync('src/lab.css', 'utf8')

describe('App Luma Haven UI', () => {
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
    expect(app).toContain('Luma Haven')
    expect(app).toContain('data-count="alive"')
    expect(app).toContain('setPaused')
    expect(app).toContain('setSpeed')
    expect(app).toContain('data-speed="pause"')
    expect(app).toContain('data-speed="1"')
    expect(app).toContain('data-speed="2"')
    expect(app).toContain('data-speed="10"')
    expect(app).toContain('data-sound=')
  })

  it('has no toast feed for scripted action announcements', () => {
    expect(app).not.toContain('pushMessage')
    expect(app).not.toContain('setMessages')
    expect(app).not.toContain('data-msg-stack')
    expect(app).not.toContain('You fed')
    expect(app).not.toContain('you fed')
    expect(app).not.toContain('has died')
  })

  it('persists the world via saveSim / saveWorldBlob (not ad-hoc idbSave)', () => {
    expect(app).toContain('saveSim')
    expect(app).toContain('saveWorldBlob')
    expect(app).toContain('loadWorldBlob')
    expect(app).not.toContain('idbSave')
  })

  it('has first-person mode: always-on player, joystick, look zone, pointer lock, social dock', () => {
    expect(app).toContain('data-view-mode={viewMode}')
    expect(app).toContain('data-move')
    expect(app).toContain('data-look')
    expect(app).toContain('data-pointerlock')
    expect(app).toContain('data-lab-tool="social"')
    expect(app).toContain('setFirstPerson')
    expect(app).toContain('playerSocialize')
    expect(css).toContain('.view-toggle')
    expect(css).toContain('.fp-move')
    expect(css).toContain('.fp-look')
    expect(css).toContain('.fp-btn')
  })

  it('supports typed talk, mind inspector, and settings', () => {
    expect(app).toContain('data-talk')
    expect(app).toContain('playerTalk')
    expect(app).toContain('data-inspector')
    expect(app).toContain('inspectCreature')
    expect(app).toContain('data-settings')
    expect(app).toContain('populationCap')
    expect(css).toContain('.talk')
    expect(css).toContain('.inspector')
    expect(css).toContain('.settings')
  })

  it('shows the society pulse: norms, jobs, overheard talk, chronicle', () => {
    expect(app).toContain('data-society')
    expect(app).toContain('inspectSociety')
    expect(app).toContain('data-society-norms')
    expect(app).toContain('data-society-jobs')
    expect(app).toContain('data-society-overheard')
    expect(css).toContain('.society')
  })

  it('exposes debugging depth: beliefs, habits, family, promises, perf overlay', () => {
    expect(app).toContain('data-inspector-beliefs')
    expect(app).toContain('data-inspector-habits')
    expect(app).toContain('data-inspector-family')
    expect(app).toContain('data-inspector-promises')
    expect(app).toContain('data-perf-overlay')
    expect(app).toContain('data-perf-phases')
    expect(app).toContain("case 'F3'")
    expect(css).toContain('.perf')
  })

  it('manages saves: slots, export, import, and graceful recovery', () => {
    expect(app).toContain('data-save-slots')
    expect(app).toContain('data-export-save')
    expect(app).toContain('data-import-save')
    expect(app).toContain('loadWorldBackup')
    expect(app).toContain('hasWorldSlot')
  })

  it('surfaces stories: feed, since-last-visit, shortages, and a life story', () => {
    expect(app).toContain('data-society-stories')
    expect(app).toContain('data-society-since')
    expect(app).toContain('data-society-shortages')
    expect(app).toContain('data-inspector-life')
    expect(app).toContain('markSeen')
    expect(css).toContain('.story-because')
  })

  it('lets the player hand things over, drop them, and read the controls', () => {
    expect(app).toContain('data-player-give')
    expect(app).toContain('data-player-drop')
    expect(app).toContain('playerGive')
    expect(app).toContain('playerDrop')
    expect(app).toContain('data-help')
    expect(app).toContain('data-help-btn')
    expect(css).toContain('.help-list')
  })

  it('keeps the optional dialogue service opt-in with its own endpoint', () => {
    expect(app).toContain('data-cloud-ai')
    expect(app).toContain('data-cloud-endpoint')
    expect(app).toContain('createCloudProvider')
    expect(app).toContain('polishTurn')
    // and says out loud which voice is speaking
    expect(app).toContain('data-talk-voice')
    expect(app).toContain("Haven's own")
  })

  it('reaches every panel from the keyboard', () => {
    for (const key of ["case 't'", "case 'i'", "case 'h'", "case 'g'", "case 'm'", "case '?'"]) {
      expect(app).toContain(key)
    }
    expect(app).toContain("case 'Escape'")
    expect(app).toContain('help-keys')
  })

  it('seeds a starter society with households and children', () => {
    expect(app).toContain('seedStarterSociety')
    expect(app).toContain('ensureCoupleHousehold')
    expect(app).toContain('adoptChild')
    expect(app).toContain('transmitCulture')
  })

  it('lab.css provides the dock, chip, 56px buttons, and safe-area insets', () => {
    expect(css).toContain('.dock')
    expect(css).toContain('.chip')
    expect(css).toContain('56px')
    expect(css).toContain('safe-area-inset')
  })
})

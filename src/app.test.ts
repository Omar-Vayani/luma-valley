// App observer-UI copy test. This repo has no DOM test environment
// (no jsdom/happy-dom installed), so — like pwa.test.ts — this asserts the
// REAL App source, which is exactly the copy and structure the player sees.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/App.tsx', 'utf8')
const gameview = readFileSync('src/render/gameview.ts', 'utf8')

describe('App observer UI', () => {
  it('wires all six overseer tools to useOverseerTool', () => {
    expect(app).toContain('useOverseerTool')
    for (const tool of ['feed', 'heal', 'comfort', 'amuse', 'stick', 'whip']) {
      expect(app).toContain(`id: '${tool}'`)
      expect(app).toContain(`data-tool={tool.id}`)
    }
  })

  it('groups tools into beneficial and harmful sets with no placeholders', () => {
    expect(app).toContain('data-tools="beneficial"')
    expect(app).toContain('data-tools="harmful"')
    expect(app).not.toContain('arrives with the observer update')
    expect(app).not.toContain('tool.ready')
    expect(app).not.toContain('data-tool-ready={tool.ready}')
  })

  it('removes the quest pill and objective checklist from the visible HUD', () => {
    expect(app).not.toContain('quest-pill')
    expect(app).not.toContain('data-status="quest"')
    expect(app).not.toContain('questText')
    expect(app).not.toContain('activeQuest')
    expect(app).not.toContain('questProgress')
    expect(app).not.toContain('STORY_LINES')
    expect(app).not.toContain('progress</')
  })

  it('removes player pouch/inventory/labor UI', () => {
    expect(app).not.toContain('pouchItems')
    expect(app).not.toContain('your pouch')
    expect(app).not.toContain('Share bread')
    expect(app).not.toContain('search the city')
    expect(app).not.toContain('data-economy')
    expect(app).not.toContain("game.player.inventory.items['bread']")
  })

  it('shows real society summary data on the Society tab', () => {
    expect(app).toContain('societySummary()')
    expect(app).toContain('data-society="market"')
    expect(app).toContain('data-society="bonds"')
    expect(app).toContain('data-society="fears"')
    expect(app).toContain('data-society="events"')
    expect(app).toContain('recentEvents')
  })

  it('shows wallet, six traits, and relationships in the People profile', () => {
    expect(app).toContain('societyProfile')
    expect(app).toContain('data-society-brief')
    expect(app).toContain('profile.traits.trust')
    expect(app).toContain('profile.traits.attachment')
    expect(app).toContain('profile.traits.love')
    expect(app).toContain('profile.traits.betrayal')
    expect(app).toContain('profile.traits.fear')
    expect(app).toContain('profile.traits.greed')
    expect(app).toContain('relationships')
    expect(app).toContain('rel-row')
  })

  it('keeps one dismissible message and a combined minimal top strip', () => {
    expect(app).toContain('dismissMessage')
    expect(app).toContain('msg-close')
    expect(app).toContain('data-msg-stack')
    expect(app).toContain('setMessages([{ id, text, kind }])')
    expect(app).toContain('data-status="city"')
    expect(app).not.toContain('data-status="population"')
    expect(app).not.toContain('data-status="day"')
  })

  it('keeps the city panels behind one dock button and exposes an equippable stick slot', () => {
    expect(app).toContain('data-hud-dock')
    expect(app).toContain('data-hud="city"')
    expect(app).toContain('data-equipped={game?.equippedTool')
    expect(app).toContain('toggleStick')
    expect(app).toContain('handleStrike')
    expect(app).toContain('onToggleStick: () => toggleStick()')
    expect(gameview).toContain("event.code === 'Digit1'")
    expect(gameview).toContain('this.callbacks.onToggleStick?.()')
    expect(app).not.toContain('className="hud-tabs"')
  })
})

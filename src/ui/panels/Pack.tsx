/**
 * Pack — what you are carrying, and what you can make out of it.
 *
 * Crafting needs a place for everything but the simplest recipe, which is on
 * purpose: it sends you into the smithy and the apothecary while their keepers
 * are working, and standing in someone's shop is how you end up talking to
 * them.
 */
import { useMemo, useState } from 'react'
import type { Sim } from '../../lab/sim'
import { countItem, inventoryCapacity, inventoryWeight, type ItemId } from '../../lab/inventory'
import { itemDef, itemName } from '../../lab/items'
import { nearestTower } from '../../lab/world'
import { craft, hasInputs, RECIPES, STATION_LABEL, STATION_TOWERS } from '../../game/craft'
import { HOTBAR_SLOTS, type PlayerProgress } from '../../game/progress'
import { Panel } from '../Panel'
import { itemGradient } from '../item-visuals'

export interface PackProps {
  sim: Sim
  progress: PlayerProgress
  playerX: number
  playerZ: number
  onClose: () => void
  onChanged: () => void
  onToast: (text: string, kind: 'info' | 'good' | 'bad') => void
}

export function Pack({
  sim, progress, playerX, playerZ, onClose, onChanged, onToast,
}: PackProps): React.ReactElement {
  const [tab, setTab] = useState('carry')
  const [picked, setPicked] = useState<ItemId | null>(null)

  const inv = sim.player.inventory
  const items = useMemo(
    () => (Object.entries(inv.items) as [ItemId, number][]).filter(([, n]) => n > 0),
    // the inventory mutates in place, so re-read whenever the panel re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inv, tab, picked],
  )

  const here = nearestTower(playerX, playerZ)
  const atHere = Math.hypot(here.x - playerX, here.z - playerZ) < here.radius + 4

  const weight = inventoryWeight(inv)
  const capacity = inventoryCapacity(inv)

  const assign = (slot: number): void => {
    if (!picked) return
    progress.hotbar[slot] = picked
    setPicked(null)
    onChanged()
  }

  return (
    <Panel
      title="Pack"
      hint={`${weight.toFixed(1)} / ${capacity} carried · ${sim.player.wallet} coins`}
      onClose={onClose}
      testId="pack"
      tabs={[{ id: 'carry', label: 'Carrying' }, { id: 'craft', label: 'Crafting' }]}
      activeTab={tab}
      onTab={setTab}
    >
      {tab === 'carry' && (
        <>
          {items.length === 0 && <p className="muted">Nothing but your hands. Try a berry bush.</p>}
          <div className="pack-grid" data-pack-grid>
            {items.map(([id, n]) => (
              <button
                key={id}
                className={`pack-item${picked === id ? ' on' : ''}`}
                onClick={() => setPicked(picked === id ? null : id)}
                title={itemDef(id)?.effect}
              >
                <span className="icon" style={{ background: itemGradient(id) }} />
                <span className="name">{itemName(id)}</span>
                <span className="count">×{n}</span>
              </button>
            ))}
          </div>

          <h3 className="section">Hotbar</h3>
          <p className="small faint" style={{ marginTop: -4 }}>
            {picked
              ? `Choose a slot for ${itemName(picked)}.`
              : 'Pick something above, then choose a slot. Or press 1–9 in the world.'}
          </p>
          <div className="row" style={{ gap: 5, flexWrap: 'wrap' }} data-hotbar-editor>
            {Array.from({ length: HOTBAR_SLOTS }, (_, i) => {
              const id = progress.hotbar[i]
              return (
                <button
                  key={i}
                  className={`slot${picked ? '' : ' empty'}`}
                  onClick={() => (picked ? assign(i) : (progress.hotbar[i] = null, onChanged()))}
                  title={picked ? 'Put it here' : 'Clear this slot'}
                >
                  <span className="n">{i + 1}</span>
                  {id && <span className="icon" style={{ background: itemGradient(id) }} />}
                </button>
              )
            })}
          </div>
        </>
      )}

      {tab === 'craft' && (
        <>
          <p className="small faint" style={{ marginTop: 0 }}>
            Standing at <b>{here.label}</b>{atHere ? '' : ' (not close enough to work here)'}.
          </p>
          <div className="grid">
            {RECIPES.map((r) => {
              const stationOk = r.station === 'anywhere'
                || (atHere && STATION_TOWERS[r.station].includes(here.id))
              const ready = hasInputs(inv, r) && stationOk
              return (
                <div className="recipe" key={r.id} data-recipe={r.id}>
                  <span className="out" style={{ background: itemGradient(r.output.id) }} />
                  <div className="info">
                    <b>{r.name}</b>
                    <p>{r.note}</p>
                    <div className="cost">
                      {r.inputs.map((i) => (
                        <span key={i.id} className={countItem(inv, i.id) < i.n ? 'short' : ''}>
                          {i.n}× {itemName(i.id)}{' '}
                        </span>
                      ))}
                      {r.station !== 'anywhere' && (
                        <span className={stationOk ? '' : 'short'}> · {STATION_LABEL[r.station]}</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn primary"
                    disabled={!ready}
                    onClick={() => {
                      const result = craft(inv, r, stationOk)
                      onToast(result.message, result.ok ? 'good' : 'bad')
                      if (result.ok) {
                        progress.crafted++
                        onChanged()
                      }
                    }}
                  >
                    Make
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Panel>
  )
}

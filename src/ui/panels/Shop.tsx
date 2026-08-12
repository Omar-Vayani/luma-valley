/**
 * Shop — the other side of the counter.
 *
 * Haven always had an economy; the player just had no way into it beyond
 * giving things away. Prices here are the same scarcity-driven prices the
 * Luma pay, the stock is the same stock they empty, and the coins you are
 * paid come out of that building's till — so a shop that has taken nothing
 * today genuinely cannot buy your fish.
 */
import { useState } from 'react'
import type { Sim } from '../../lab/sim'
import type { TowerId } from '../../lab/world'
import { countItem, type ItemId } from '../../lab/inventory'
import { itemDef, itemName } from '../../lab/items'
import { Panel } from '../Panel'
import { ItemIcon } from '../ItemIcon'

export interface ShopProps {
  sim: Sim
  tower: TowerId
  onClose: () => void
  onToast: (text: string, kind: 'info' | 'good' | 'bad') => void
  onChanged: () => void
}

/** Market goods are named by their good id; show the item they become. */
function asItem(good: string): ItemId {
  return good === 'weapon' ? 'stick' : (good as ItemId)
}

export function Shop({ sim, tower, onClose, onToast, onChanged }: ShopProps): React.ReactElement {
  const [, force] = useState(0)
  const offer = sim.shopAt(tower)

  if (!offer) {
    return (
      <Panel title="Trade" narrow onClose={onClose} testId="shop">
        <p className="muted">Nobody trades here.</p>
      </Panel>
    )
  }

  const redraw = (): void => {
    force((n) => n + 1)
    onChanged()
  }

  const carrying = (Object.entries(sim.player.inventory.items) as [ItemId, number][])
    .filter(([, n]) => n > 0)

  return (
    <Panel
      title={offer.label}
      hint={`${sim.player.wallet} coins · till ${offer.till}${offer.keeper ? ` · ${offer.keeper} keeps it` : ' · unstaffed'}`}
      onClose={onClose}
      testId="shop"
    >
      {!offer.open && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--bad)' }}>
          The door is shut. Come back when they open.
        </div>
      )}
      {!offer.keeper && (
        <p className="small faint" style={{ marginTop: 0 }}>
          Nobody has claimed this trade, so the shelves only fill when somebody does.
        </p>
      )}

      <h3 className="section">For sale</h3>
      <div className="grid" data-shop-sells>
        {offer.sells.map((line) => {
          const id = asItem(line.id)
          const affordable = sim.player.wallet >= line.price && line.stock > 0 && offer.open
          return (
            <div className="recipe" key={line.id} data-shop-good={line.id}>
              <span className="out" style={{ display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.05)' }}>
                <ItemIcon id={id} size={24} />
              </span>
              <div className="info">
                <b>{itemName(id)}</b>
                <p>{itemDef(id)?.effect ?? ''}</p>
                <div className="cost">
                  {line.price} coins · {line.stock > 0 ? `${line.stock} left` : <span className="short">sold out</span>}
                </div>
              </div>
              <button
                className="btn primary"
                disabled={!affordable}
                onClick={() => {
                  const result = sim.playerBuy(tower, line.id)
                  onToast(result.message, result.ok ? 'good' : 'bad')
                  redraw()
                }}
              >
                Buy
              </button>
            </div>
          )
        })}
      </div>

      <h3 className="section">They will buy</h3>
      {offer.buys.length === 0 && <p className="muted small">Nothing you are likely to have.</p>}
      <div className="grid" data-shop-buys>
        {offer.buys.map((line) => {
          const held = countItem(sim.player.inventory, line.id)
          return (
            <div className="recipe" key={line.id}>
              <span className="out" style={{ display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.05)' }}>
                <ItemIcon id={line.id} size={24} />
              </span>
              <div className="info">
                <b>{itemName(line.id)}</b>
                <p>{held > 0 ? `You are carrying ${held}.` : 'You have none on you.'}</p>
                <div className="cost">{line.price} coins each</div>
              </div>
              <button
                className="btn"
                disabled={held <= 0 || !offer.open || offer.till < 1}
                onClick={() => {
                  const result = sim.playerSell(tower, line.id)
                  onToast(result.message, result.ok ? 'good' : 'bad')
                  redraw()
                }}
              >
                Sell
              </button>
            </div>
          )
        })}
      </div>

      {carrying.length > 0 && (
        <>
          <h3 className="section">In your pack</h3>
          <div className="row small muted" style={{ flexWrap: 'wrap', gap: 10 }}>
            {carrying.map(([id, n]) => (
              <span key={id} className="row" style={{ gap: 4 }}>
                <ItemIcon id={id} size={16} />{itemName(id)} ×{n}
              </span>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}

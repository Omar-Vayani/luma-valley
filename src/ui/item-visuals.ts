/**
 * item-visuals — one place that decides what an item looks like in the UI.
 *
 * No icon files: each item gets a colour and a simple two-tone treatment, so
 * a new item in the catalogue shows up in the pack and the hotbar without
 * anybody drawing anything.
 */
import type { ItemId } from '../lab/inventory'

export const ITEM_COLOR: Record<ItemId, string> = {
  bread: '#c98a3d',
  water: '#4f9fd0',
  medicine: '#d8e8e0',
  brew: '#8a5a2a',
  herb: '#6aa84f',
  spark: '#ffd166',
  tonic: '#b06ad0',
  stick: '#8a6a45',
  cloak: '#7a5aa0',
  trinket: '#d0a84f',
  gem: '#6fd0d8',
  satchel: '#9a7a52',
  timber: '#8a5e3b',
  grain: '#d8c070',
  berry: '#b0455f',
  stone: '#8d8a82',
  fish: '#9fc4d8',
  lantern: '#ffcf80',
}

export function itemGradient(id: ItemId): string {
  const c = ITEM_COLOR[id] ?? '#9a9a9a'
  return `linear-gradient(160deg, ${c}, ${shade(c, -0.35)})`
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(Math.min(255, Math.max(0, ((n >> 16) & 255) * (1 + amount))))
  const g = Math.round(Math.min(255, Math.max(0, ((n >> 8) & 255) * (1 + amount))))
  const b = Math.round(Math.min(255, Math.max(0, (n & 255) * (1 + amount))))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

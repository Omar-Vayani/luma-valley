/**
 * ItemIcon — what each thing you can carry looks like.
 *
 * Every item used to be a coloured square, which meant the hotbar was a row
 * of swatches you had to memorise. These are drawn shapes: a loaf is a loaf,
 * a fish is a fish. Still no image files — it is all SVG, so it scales, tints
 * with the theme, and costs nothing to load.
 */
import type { ItemId } from '../lab/inventory'

interface Art {
  /** the body colour, also used for the slot's glow */
  tint: string
  paths: React.ReactElement
}

const S = { strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

const ART: Record<ItemId, Art> = {
  bread: {
    tint: '#c98a3d',
    paths: (
      <>
        <path d="M4 13c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6 0 1.7-1.3 3-3 3H7c-1.7 0-3-1.3-3-3Z" fill="#d19a4e" stroke="#8a5a26" />
        <path d="M8 9.5 6.5 12M12 9.2 10.5 12M16 9.5 14.5 12" stroke="#8a5a26" fill="none" />
      </>
    ),
  },
  water: {
    tint: '#4f9fd0',
    paths: (
      <>
        <path d="M9 3h6v2.5l2 2.5v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8l2-2.5V3Z" fill="#5aa8d8" stroke="#2d6a92" />
        <path d="M7 12h10v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6Z" fill="#8fd0f0" stroke="none" />
        <path d="M9 3h6" stroke="#2d6a92" />
      </>
    ),
  },
  medicine: {
    tint: '#d8e8e0',
    paths: (
      <>
        <path d="M8 3h8v3H8zM9.5 6h5v13a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V6Z" fill="#e6f0ec" stroke="#7f9a92" />
        <path d="M9.5 13h5v6a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-6Z" fill="#7fc98a" stroke="none" />
        <path d="M12 15v4M10 17h4" stroke="#fff" />
      </>
    ),
  },
  brew: {
    tint: '#8a5a2a',
    paths: (
      <>
        <path d="M5 8h11v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8Z" fill="#a86f34" stroke="#5d3a18" />
        <path d="M5 8h11v4H5z" fill="#f2e3c4" stroke="none" />
        <path d="M16 10h2.5a2.5 2.5 0 0 1 0 5H16" fill="none" stroke="#5d3a18" />
      </>
    ),
  },
  herb: {
    tint: '#6aa84f',
    paths: (
      <>
        <path d="M12 21V9" stroke="#4a7a34" fill="none" />
        <path d="M12 13c-4 0-6-2-6-6 4 0 6 2 6 6ZM12 11c4 0 6-2 6-6-4 0-6 2-6 6Z" fill="#6fb055" stroke="#3f6b2c" />
      </>
    ),
  },
  spark: {
    tint: '#ffd166',
    paths: (
      <>
        <path d="M12 2 14.5 9 21 11l-6.5 2L12 20l-2.5-7L3 11l6.5-2Z" fill="#ffd97a" stroke="#c98f22" />
        <circle cx="12" cy="11" r="1.6" fill="#fff8dc" stroke="none" />
      </>
    ),
  },
  tonic: {
    tint: '#b06ad0',
    paths: (
      <>
        <path d="M10 3h4v4l3 6.5V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5.5L10 7V3Z" fill="#c184dc" stroke="#71428a" />
        <path d="M7.6 13h8.8v6a2 2 0 0 1-2 2H9.6a2 2 0 0 1-2-2v-6Z" fill="#8f4bb0" stroke="none" />
        <path d="M10 3h4" stroke="#71428a" />
      </>
    ),
  },
  stick: {
    tint: '#8a6a45',
    paths: (
      <>
        <path d="M5 20 18 5" stroke="#8a6a45" strokeWidth={2.6} fill="none" />
        <path d="M12 12.5 15 11M10 15l-2.5-1" stroke="#6b5033" fill="none" />
      </>
    ),
  },
  cloak: {
    tint: '#7a5aa0',
    paths: (
      <>
        <path d="M9 3h6l4 5-3 1.5V21H8V9.5L5 8Z" fill="#8a68b0" stroke="#4f3a6b" />
        <path d="M9 3c0 1.7 1.3 3 3 3s3-1.3 3-3" fill="none" stroke="#4f3a6b" />
      </>
    ),
  },
  trinket: {
    tint: '#d0a84f',
    paths: (
      <>
        <path d="M5 7h14M8 7c0 6 1.6 12 4 12s4-6 4-12" fill="none" stroke="#a8842f" />
        <circle cx="12" cy="13" r="3.4" fill="#e0bb63" stroke="#a8842f" />
      </>
    ),
  },
  gem: {
    tint: '#6fd0d8',
    paths: (
      <>
        <path d="M7 4h10l4 6-9 11-9-11Z" fill="#7ad9e0" stroke="#2f8c94" />
        <path d="m3 10 9 11 9-11M7 4l5 6 5-6M12 10 3 10" fill="none" stroke="#2f8c94" />
      </>
    ),
  },
  satchel: {
    tint: '#9a7a52',
    paths: (
      <>
        <path d="M6 9h12l1 10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" fill="#a8875c" stroke="#6b5436" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" fill="none" stroke="#6b5436" />
        <path d="M10.5 13h3v3.5h-3z" fill="#6b5436" stroke="none" />
      </>
    ),
  },
  timber: {
    tint: '#8a5e3b',
    paths: (
      <>
        <rect x="3" y="8" width="18" height="8" rx="2" fill="#96683f" stroke="#5f4026" />
        <ellipse cx="19" cy="12" rx="2" ry="4" fill="#c49a6a" stroke="#5f4026" />
        <ellipse cx="19" cy="12" rx="0.8" ry="1.8" fill="none" stroke="#5f4026" />
      </>
    ),
  },
  grain: {
    tint: '#d8c070',
    paths: (
      <>
        <path d="M12 21V8" fill="none" stroke="#a8913f" />
        <path d="M12 8c-2.5 0-3.5-1.6-3.5-4C11 4 12 5.6 12 8ZM12 8c2.5 0 3.5-1.6 3.5-4C13 4 12 5.6 12 8ZM12 13c-2.5 0-3.5-1.6-3.5-4C11 9 12 10.6 12 13ZM12 13c2.5 0 3.5-1.6 3.5-4C13 9 12 10.6 12 13Z" fill="#e0cd82" stroke="#a8913f" />
      </>
    ),
  },
  berry: {
    tint: '#b0455f',
    paths: (
      <>
        <circle cx="9" cy="15" r="3.6" fill="#bd4f68" stroke="#7c2d40" />
        <circle cx="15" cy="16" r="3" fill="#a8405a" stroke="#7c2d40" />
        <path d="M9 11V7M9 8c-2 0-3-1-3-3 2 0 3 1 3 3Z" fill="#6aa84f" stroke="#3f6b2c" />
      </>
    ),
  },
  stone: {
    tint: '#8d8a82',
    paths: (
      <>
        <path d="M5 14 8 6h7l4 6-3 7H7Z" fill="#9b978e" stroke="#63605a" />
        <path d="m8 6 3 5 5 1M11 11 7 19" fill="none" stroke="#63605a" />
      </>
    ),
  },
  fish: {
    tint: '#9fc4d8',
    paths: (
      <>
        <path d="M3 12c3.5-4.5 8-6 12-6s6 3 6 6-2 6-6 6-8.5-1.5-12-6Z" fill="#a9cddf" stroke="#5b7f92" />
        <path d="M3 12c1.5-1 2.5-3 2.5-4.5C7 9 7 11 7 12s0 3-1.5 4.5C5.5 15 4.5 13 3 12Z" fill="#8bb6cc" stroke="#5b7f92" />
        <circle cx="17" cy="10.5" r="1" fill="#33505e" stroke="none" />
      </>
    ),
  },
  lantern: {
    tint: '#ffcf80',
    paths: (
      <>
        <path d="M9 3h6M12 3v2" fill="none" stroke="#6b5436" />
        <path d="M8 6h8l1 3v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9Z" fill="#a8875c" stroke="#6b5436" />
        <rect x="9" y="9" width="6" height="7" rx="1" fill="#ffd98f" stroke="#c99a44" />
      </>
    ),
  },
}

export function itemTint(id: ItemId): string {
  return ART[id]?.tint ?? '#9a9a9a'
}

export function ItemIcon({ id, size = 26 }: { id: ItemId; size?: number }): React.ReactElement {
  const art = ART[id]
  if (!art) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="3" fill="#9a9a9a" />
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth={1.2}
      aria-hidden="true"
      focusable="false"
      style={S}
    >
      {art.paths}
    </svg>
  )
}

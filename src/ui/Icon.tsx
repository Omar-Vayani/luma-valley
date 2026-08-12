/**
 * Icon — a small set of line icons drawn in SVG.
 *
 * Emoji were doing this job, which meant the interface changed shape depending
 * on which font the machine happened to have, and rendered as empty boxes on
 * anything without a colour emoji font. These are always the same.
 */

export type IconName =
  | 'board' | 'pack' | 'journal' | 'village' | 'mind' | 'map' | 'settings' | 'help'
  | 'heart' | 'food' | 'coin' | 'star'

const PATHS: Record<IconName, React.ReactElement> = {
  board: (
    <>
      <path d="M4 3h12a1 1 0 0 1 1 1v13l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1Z" />
      <path d="M7 7h6M7 10h6" />
    </>
  ),
  pack: (
    <>
      <path d="M6 7V5a4 4 0 0 1 8 0v2" />
      <path d="M4 7h12l1 9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2l1-9Z" />
    </>
  ),
  journal: (
    <>
      <path d="M4 4a2 2 0 0 1 2-2h9v16H6a2 2 0 0 0-2 2V4Z" />
      <path d="M4 16h11" />
    </>
  ),
  village: (
    <>
      <path d="M2 9l4-4 4 4v7H2V9Z" />
      <path d="M10 11l4-4 4 4v5h-8" />
    </>
  ),
  mind: (
    <>
      <path d="M10 3a4 4 0 0 0-4 4v1a3 3 0 0 0 0 6v2a2 2 0 0 0 4 0V3Z" />
      <path d="M10 3a4 4 0 0 1 4 4v1a3 3 0 0 1 0 6v2a2 2 0 0 1-4 0" />
    </>
  ),
  map: (
    <>
      <path d="M2 5l5-2 6 2 5-2v12l-5 2-6-2-5 2V5Z" />
      <path d="M7 3v12M13 5v12" />
    </>
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M15.7 4.3l-1.4 1.4M5.7 14.3l-1.4 1.4" />
    </>
  ),
  help: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.8 7.6a2.3 2.3 0 1 1 3 2.2c-.5.2-.8.7-.8 1.2v.5" />
      <path d="M10 14.6v.01" />
    </>
  ),
  heart: <path d="M10 16S3 11.6 3 7.4A3.4 3.4 0 0 1 10 5.6 3.4 3.4 0 0 1 17 7.4C17 11.6 10 16 10 16Z" />,
  food: (
    <>
      <path d="M5 4v5a2 2 0 0 0 4 0V4M7 9v7" />
      <path d="M14 4c-1.5 1-2 3-2 5s1 2 2 2v5" />
    </>
  ),
  coin: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v8M8 8h3a1.6 1.6 0 0 1 0 3.2H8" />
    </>
  ),
  star: <path d="M10 2.5l2.3 4.9 5.2.7-3.8 3.7 1 5.2L10 14.6l-4.7 2.4 1-5.2L2.5 8.1l5.2-.7L10 2.5Z" />,
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

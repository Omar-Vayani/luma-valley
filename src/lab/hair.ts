/**
 * hair — genetic visual identity for ball creatures.
 * Maps the genome to a simple hairstyle so each ball reads as an individual,
 * and children inherit their parents' look through the genome itself.
 */
import type { Genome } from './genetics'

export interface HairStyle {
  style: 'spiky' | 'tuft' | 'buzz' | 'long' | 'curly' | 'bald'
  color: string
  size: number // 0..1 — how big/pronounced the hair is
}

const HAIR_COLORS = ['#5a3a20', '#7a5230', '#3a3a30', '#8a6a40', '#2a2a22', '#6a4a2a', '#4a3424']

/** Derive a hairstyle from genes. Aggression → spiky, sociability → curly, etc. */
export function hairStyle(g: Genome, idHue = 0): HairStyle {
  const aggression = g.aggression
  const sociability = g.sociability
  const energy = g.energy
  const courage = g.courage

  let style: HairStyle['style'] = 'tuft'
  if (aggression > 0.75) style = 'spiky'
  else if (sociability > 0.75) style = 'curly'
  else if (energy < 0.25) style = 'buzz'
  else if (courage > 0.7 && aggression > 0.4) style = 'long'
  else if (aggression < 0.2 && energy < 0.3) style = 'bald'

  const color = HAIR_COLORS[Math.abs(idHue) % HAIR_COLORS.length]
  const size = 0.45 + aggression * 0.3 + energy * 0.15 + (style === 'bald' ? -0.6 : 0)
  return { style, color, size: Math.min(1, Math.max(0.15, size)) }
}

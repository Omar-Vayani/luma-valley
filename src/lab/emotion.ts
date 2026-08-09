/**
 * emotion — a derived mood the renderer turns into a face + color.
 * The creature's genes (aggression, fearfulness, courage, sociability,
 * lovePropensity) bias which emotion wins when needs conflict.
 */
import type { ChemState } from './chem'
import type { Genome } from './genetics'

export type EmotionType =
  | 'content'
  | 'happy'
  | 'angry'
  | 'afraid'
  | 'sad'
  | 'sleepy'
  | 'loving'

export interface Emotion {
  type: EmotionType
  color: string
  intensity: number // 0..1 — how strongly the face should show it
}

const PALETTE: Record<EmotionType, string> = {
  content: '#8fbf7f',
  happy: '#ffd75e',
  angry: '#e05252',
  afraid: '#9fc7e8',
  sad: '#7f9fd0',
  sleepy: '#b9a9c8',
  loving: '#f08fb0',
}

export function deriveEmotion(c: ChemState, g: Genome): Emotion {
  // mourning / grief dominates — depression
  if (c.grief > 0.4) {
    return { type: 'sad', color: PALETTE.sad, intensity: Math.min(1, c.grief) }
  }
  // starving / exhausted / terrified override everything
  if (c.energy < 0.18) return { type: 'sleepy', color: PALETTE.sleepy, intensity: 1 }
  if (c.fear > 0.6 && g.courage < 0.5) {
    return { type: 'afraid', color: PALETTE.afraid, intensity: c.fear }
  }
  if (c.bond > 0.7 && g.lovePropensity > 0.5) {
    return { type: 'loving', color: PALETTE.loving, intensity: c.bond }
  }
  if (c.hunger < 0.2 && g.aggression > 0.6 && g.fearfulness < 0.5) {
    return { type: 'angry', color: PALETTE.angry, intensity: 1 - c.hunger }
  }
  if (c.social < 0.2 && g.sociability > 0.6) {
    return { type: 'sad', color: PALETTE.sad, intensity: 1 - c.social }
  }
  if (c.pleasure > 0.75 && c.hunger > 0.5 && c.energy > 0.5) {
    return { type: 'happy', color: PALETTE.happy, intensity: c.pleasure }
  }
  if (c.hunger < 0.35 || c.thirst < 0.3 || c.health < 0.3) {
    return { type: 'sad', color: PALETTE.sad, intensity: 0.7 }
  }
  return { type: 'content', color: PALETTE.content, intensity: 0.5 }
}

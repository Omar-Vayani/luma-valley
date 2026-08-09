import type { RNG } from './rng'

export type CityPlaceId = 'market' | 'tavern' | 'park' | 'apothecary' | 'homes' | 'watch' | 'back-alley'
export type CityResource = 'bread' | 'water' | 'ale' | 'cigarettes' | 'medicine' | 'dream-dust' | 'rest' | 'company' | 'safety'

export interface CityPlace {
  id: CityPlaceId
  name: string
  purpose: string
  pos: { x: number; z: number }
  radius: number
  provides: CityResource[]
  danger: number
}

export const CITY_PLACES: CityPlace[] = [
  { id: 'market', name: 'Old Market', purpose: 'Food and trade', pos: { x: -18, z: 12 }, radius: 7, provides: ['bread', 'company'], danger: 0.05 },
  { id: 'tavern', name: 'The Crooked Tankard', purpose: 'Ale, smoke and company', pos: { x: -18, z: -14 }, radius: 7, provides: ['ale', 'cigarettes', 'company'], danger: 0.28 },
  { id: 'park', name: 'Ashen Park', purpose: 'Water, calm and conversation', pos: { x: 0, z: -17 }, radius: 8, provides: ['water', 'rest', 'company'], danger: 0.02 },
  { id: 'apothecary', name: 'Saint Orra Apothecary', purpose: 'Medicine and recovery', pos: { x: 18, z: -13 }, radius: 6, provides: ['medicine', 'rest'], danger: 0.04 },
  { id: 'homes', name: 'Lantern Row', purpose: 'Sleep and shelter', pos: { x: 18, z: 13 }, radius: 9, provides: ['rest', 'safety'], danger: 0.01 },
  { id: 'watch', name: 'Old Watch Yard', purpose: 'Safety and order', pos: { x: 0, z: 18 }, radius: 7, provides: ['safety', 'company'], danger: 0.03 },
  { id: 'back-alley', name: 'Moth Alley', purpose: 'Illegal dream-dust', pos: { x: -31, z: -2 }, radius: 5, provides: ['dream-dust'], danger: 0.72 },
]

export interface PlaceKnowledge {
  provides: CityResource[]
  pos: { x: number; z: number }
  confidence: number
  valence: number
  lastVisited: number
}

export interface EmotionState {
  joy: number
  sadness: number
  anger: number
  fear: number
  empathy: number
  intoxication: number
}

export interface UrbanState {
  knownPlaces: Partial<Record<CityPlaceId, PlaceKnowledge>>
  emotions: EmotionState
  intoxication: number
  judgment: number
  carriedItem: CityResource | null
  currentGoal: CityPlaceId | null
  socialCooldown: number
}

export function createUrbanState(): UrbanState {
  return {
    knownPlaces: {},
    emotions: { joy: 0.35, sadness: 0.1, anger: 0.05, fear: 0, empathy: 0.55, intoxication: 0 },
    intoxication: 0,
    judgment: 1,
    carriedItem: null,
    currentGoal: null,
    socialCooldown: 0,
  }
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export function learnPlace(state: UrbanState, place: CityPlace, tick: number, valence = 0): void {
  const known = state.knownPlaces[place.id]
  state.knownPlaces[place.id] = {
    provides: [...place.provides],
    pos: { ...place.pos },
    confidence: clamp01((known?.confidence ?? 0) + 0.35),
    valence: clamp01(((known?.valence ?? 0) + valence + 1) / 2) * 2 - 1,
    lastVisited: tick,
  }
}

export function updateEmotions(
  state: UrbanState,
  input: { pleasure: number; fear: number; pain: number; loneliness: number; health: number; empathy: number },
): EmotionState {
  const sadness = clamp01(input.loneliness * 0.55 + (1 - input.health) * 0.45 + input.pain * 0.2 - input.pleasure * 0.2)
  const anger = clamp01(input.pain * 0.65 + input.loneliness * 0.2 + state.intoxication * 0.22 - input.empathy * 0.18)
  const joy = clamp01(input.pleasure * 0.75 + input.empathy * 0.15 - sadness * 0.45 - input.pain * 0.3)
  state.emotions = {
    joy,
    sadness,
    anger,
    fear: clamp01(input.fear),
    empathy: clamp01(input.empathy),
    intoxication: clamp01(state.intoxication),
  }
  state.judgment = clamp01(1 - state.intoxication * 0.72 - anger * 0.18 - input.fear * 0.12)
  return state.emotions
}

function knownProvider(state: UrbanState, resource: CityResource): CityPlaceId | null {
  let best: { id: CityPlaceId; score: number } | null = null
  for (const place of CITY_PLACES) {
    const knowledge = state.knownPlaces[place.id]
    if (!knowledge?.provides.includes(resource)) continue
    const score = knowledge.confidence + knowledge.valence * 0.25 - place.danger * 0.35
    if (!best || score > best.score) best = { id: place.id, score }
  }
  return best?.id ?? null
}

export function decideCityGoal(
  state: UrbanState,
  needs: { hunger: number; health: number; loneliness: number; boredom: number; fear: number; withdrawal: 'alcohol' | 'nicotine' | 'drug' | null },
): CityPlaceId | null {
  let goal: CityPlaceId | null = null
  if (needs.health < 0.5) goal = knownProvider(state, 'medicine')
  else if (needs.withdrawal === 'alcohol') goal = knownProvider(state, 'ale')
  else if (needs.withdrawal === 'nicotine') goal = knownProvider(state, 'cigarettes')
  else if (needs.withdrawal === 'drug') goal = knownProvider(state, 'dream-dust')
  else if (needs.hunger > 0.58) goal = knownProvider(state, 'bread')
  else if (needs.fear > 0.55) goal = knownProvider(state, 'safety') ?? knownProvider(state, 'rest')
  else if (needs.loneliness > 0.62) goal = knownProvider(state, 'company')
  else if (needs.boredom > 0.7) goal = knownProvider(state, 'company') ?? knownProvider(state, 'rest')
  if (goal) state.currentGoal = goal
  return goal
}

export type SocialOutcome = 'share' | 'fight' | 'talk' | 'avoid'

export function resolveSocialEncounter(a: UrbanState, b: UrbanState, affinity: number, rng: RNG): SocialOutcome {
  if (a.carriedItem && a.emotions.empathy > 0.65 && b.emotions.sadness > 0.4 && affinity > 0.35) {
    b.carriedItem = a.carriedItem
    a.carriedItem = null
    return 'share'
  }
  const hostility = (a.emotions.anger + b.emotions.anger) / 2 + (a.intoxication + b.intoxication) * 0.2 - affinity * 0.45
  if (hostility > 0.8 && rng() < 0.5) return 'fight'
  if (affinity < -0.3 || a.emotions.fear > 0.7 || b.emotions.fear > 0.7) return 'avoid'
  return 'talk'
}

export function nearestCityPlace(pos: { x: number; z: number }): CityPlace {
  return CITY_PLACES.reduce((best, place) =>
    Math.hypot(place.pos.x - pos.x, place.pos.z - pos.z) < Math.hypot(best.pos.x - pos.x, best.pos.z - pos.z) ? place : best,
  )
}

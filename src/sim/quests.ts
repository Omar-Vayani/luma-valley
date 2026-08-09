/**
 * Quests — the story mission engine. A quest log with objective counters;
 * events from gameplay advance objectives; completed quests unlock the next.
 */

export type QuestEvent =
  | 'feed'
  | 'teach'
  | 'pickBerry'
  | 'craftTorch'
  | 'lightTorch'
  | 'adult'
  | 'repelShadow'
  | 'lightShrine'
  | 'birth'
  | 'rescue'
  | 'poisoned'
  | 'gaveItem'
  | 'terrorised'
  | 'visitMarket'
  | 'meetCitizen'
  | 'visitPark'
  | 'visitTavern'
  | 'visitApothecary'
  | 'visitAlley'
  | 'visitWatch'

export type QuestKind = QuestEvent

export interface QuestDef {
  id: string
  title: string
  blurb: string
  kind: QuestKind
  goal: number
  next?: string
}

export interface QuestLogState {
  active: string | null
  progress: Record<string, number>
  completed: string[]
  unlocked: string[]
}

export const QUEST_CHAIN: QuestDef[] = [
  {
    id: 'q1_feed',
    title: 'The Old Market',
    blurb: 'Find the Old Market and take bread for a citizen.',
    kind: 'visitMarket',
    goal: 1,
    next: 'q2_teach',
  },
  {
    id: 'q2_teach',
    title: 'Meet a Citizen',
    blurb: 'Approach a visible citizen and inspect their needs and feelings.',
    kind: 'meetCitizen',
    goal: 1,
    next: 'q3_berry',
  },
  {
    id: 'q3_berry',
    title: 'A Shared Meal',
    blurb: 'Give market bread to a hungry citizen.',
    kind: 'feed',
    goal: 1,
    next: 'q4_torch',
  },
  {
    id: 'q4_torch',
    title: 'A Quiet Place',
    blurb: 'Visit Lantern Park, where citizens recover and socialise.',
    kind: 'visitPark',
    goal: 1,
    next: 'q5_light',
  },
  {
    id: 'q5_light',
    title: 'The Crooked Cup',
    blurb: 'Visit the tavern. Ale and cigarettes calm briefly but create dependence.',
    kind: 'visitTavern',
    goal: 1,
    next: 'q6_adult',
  },
  {
    id: 'q6_adult',
    title: 'Remedy and Cost',
    blurb: 'Find the apothecary and collect medicine.',
    kind: 'visitApothecary',
    goal: 1,
    next: 'q7_shadow',
  },
  {
    id: 'q7_shadow',
    title: 'The Back Alley',
    blurb: 'Enter the dangerous alley and learn where dream-dust is traded.',
    kind: 'visitAlley',
    goal: 1,
    next: 'q8_shrine',
  },
  {
    id: 'q8_shrine',
    title: 'Safety of the Watch',
    blurb: 'Visit the Watch Yard, a safer refuge after dark.',
    kind: 'visitWatch',
    goal: 1,
    next: 'q9_birth',
  },
  {
    id: 'q9_birth',
    title: 'A Living City',
    blurb: 'Keep the citizens alive and social until a new child is born.',
    kind: 'birth',
    goal: 1,
  },
]

export function createQuestLog(): QuestLogState {
  return { active: 'q1_feed', progress: {}, completed: [], unlocked: ['q1_feed'] }
}

export function questEvent(log: QuestLogState, kind: QuestKind, amount = 1): string[] {
  const events: string[] = []
  if (!log.active) return events
  const def = QUEST_CHAIN.find((q) => q.id === log.active)
  if (!def || def.kind !== kind) return events
  log.progress[def.id] = (log.progress[def.id] ?? 0) + amount
  if (log.progress[def.id] >= def.goal) {
    log.completed.push(def.id)
    events.push(`quest:${def.id}`)
    if (def.next) {
      log.active = def.next
      log.unlocked.push(def.next)
      events.push(`quest:${def.next}`)
    } else {
      log.active = null
      events.push('quest:all')
    }
  }
  return events
}

export function activeQuest(log: QuestLogState): QuestDef | null {
  if (!log.active) return null
  return QUEST_CHAIN.find((q) => q.id === log.active) ?? null
}

export function questProgress(log: QuestLogState, questId: string): number {
  return log.progress[questId] ?? 0
}

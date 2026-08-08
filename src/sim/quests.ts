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
    title: 'First Meal',
    blurb: 'The Luma are hungry. Approach one and feed it a berry.',
    kind: 'feed',
    goal: 1,
    next: 'q2_teach',
  },
  {
    id: 'q2_teach',
    title: 'A Word of Friendship',
    blurb: 'Teach a Luma the word "come". It will follow you forever after.',
    kind: 'teach',
    goal: 1,
    next: 'q3_berry',
  },
  {
    id: 'q3_berry',
    title: 'Gatherer',
    blurb: 'Pick 3 berries from the bushes to fill your pouch.',
    kind: 'pickBerry',
    goal: 3,
    next: 'q4_torch',
  },
  {
    id: 'q4_torch',
    title: 'Light Against the Dark',
    blurb: 'Craft a torch (2 wood). Night is when the Shadow walks.',
    kind: 'craftTorch',
    goal: 1,
    next: 'q5_light',
  },
  {
    id: 'q5_light',
    title: 'Keep it Burning',
    blurb: 'Light your torch and hold the darkness back.',
    kind: 'lightTorch',
    goal: 1,
    next: 'q6_adult',
  },
  {
    id: 'q6_adult',
    title: 'Growing Up',
    blurb: 'Raise a Luma to adulthood (age 600). Feed it, keep it safe.',
    kind: 'adult',
    goal: 1,
    next: 'q7_shadow',
  },
  {
    id: 'q7_shadow',
    title: 'Face the Shadow',
    blurb: 'Repel a Shadow Beast with your torch. They fear the light.',
    kind: 'repelShadow',
    goal: 1,
    next: 'q8_shrine',
  },
  {
    id: 'q8_shrine',
    title: 'Light the Old Shrine',
    blurb: 'Deep in the cave, the Old Shrine waits. Bring your torch and light it.',
    kind: 'lightShrine',
    goal: 1,
    next: 'q9_birth',
  },
  {
    id: 'q9_birth',
    title: 'New Life',
    blurb: 'Two adult Luma will breed. Let the valley grow again.',
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

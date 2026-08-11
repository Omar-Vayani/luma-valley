/**
 * jobs — creatures operate the institutions.
 *
 * A role is claimed by a creature, pays wages from the institution's till, and
 * gates the service: an unstaffed shop cannot restock, an unstaffed clinic
 * treats nobody (the player can still self-serve basic goods). Production
 * feeds the shelves, so scarcity has a cause the player can trace.
 */
import type { Creature } from './creature'
import type { Economy } from './economy'
import type { TowerId } from './world'

export type JobId = 'shopkeep' | 'healer' | 'bartender' | 'farmer' | 'porter' | 'teacher'

export interface JobDef {
  id: JobId
  tower: TowerId
  title: string
  /** coins paid per completed shift */
  wage: number
  /** which good this role puts on the shelf each shift (if any) */
  produces?: string
  /** which good a shift consumes to make it — the link in the chain */
  consumes?: string
  /** aptitude gene that makes a creature suited to it */
  aptitude: (c: Creature) => number
}

/**
 * Haven's production chain:
 *   farmer grows grain → shopkeeper bakes grain into bread
 *   porter hauls timber → apothecary work turns it into medicine stock
 *   bartender brews from grain
 * Break a link and the shortage travels downstream to whoever needed it.
 */
export const JOBS: JobDef[] = [
  {
    id: 'shopkeep', tower: 'food', title: 'shopkeeper', wage: 9, produces: 'bread', consumes: 'grain',
    aptitude: (c) => 0.4 + c.genome.sociability * 0.4 + (1 - c.genome.theft) * 0.2,
  },
  {
    id: 'healer', tower: 'clinic', title: 'healer', wage: 11, produces: 'medicine', consumes: 'herb',
    aptitude: (c) => 0.3 + c.genome.learning * 0.5 + c.genome.loyalty * 0.2,
  },
  {
    id: 'bartender', tower: 'tavern', title: 'bartender', wage: 8, produces: 'brew', consumes: 'grain',
    aptitude: (c) => 0.3 + c.genome.sociability * 0.6,
  },
  {
    id: 'farmer', tower: 'farm', title: 'farmer', wage: 7, produces: 'grain',
    aptitude: (c) => 0.4 + c.genome.energy * 0.4 + (1 - c.genome.curiosity) * 0.2,
  },
  {
    id: 'porter', tower: 'work', title: 'porter', wage: 8, produces: 'herb',
    aptitude: (c) => 0.4 + c.genome.energy * 0.5,
  },
  {
    id: 'teacher', tower: 'school', title: 'teacher', wage: 9,
    aptitude: (c) => 0.3 + c.genome.learning * 0.5 + c.genome.sociability * 0.3,
  },
]

export interface JobBoard {
  /** jobId -> creature id holding it */
  holders: Partial<Record<JobId, number>>
  /** jobId -> ticks of shift progress */
  progress: Partial<Record<JobId, number>>
}

export const SHIFT_TICKS = 24

export function createJobBoard(): JobBoard {
  return { holders: {}, progress: {} }
}

export function jobDef(id: JobId): JobDef | undefined {
  return JOBS.find((j) => j.id === id)
}

export function jobForTower(tower: TowerId): JobDef | undefined {
  return JOBS.find((j) => j.tower === tower)
}

export function holderOf(board: JobBoard, id: JobId): number | undefined {
  return board.holders[id]
}

export function isStaffed(board: JobBoard, id: JobId): boolean {
  return board.holders[id] !== undefined
}

/** Vacant jobs this creature could claim, best fit first. */
export function openJobsFor(board: JobBoard, c: Creature): JobDef[] {
  return JOBS
    .filter((j) => board.holders[j.id] === undefined)
    .sort((a, b) => b.aptitude(c) - a.aptitude(c))
}

/** Claim a vacant role. Returns false when it is already taken. */
export function claimJob(board: JobBoard, c: Creature, id: JobId): boolean {
  if (board.holders[id] !== undefined) return false
  // leaving a previous role frees it
  if (c.job) releaseJob(board, c)
  board.holders[id] = c.id
  board.progress[id] = 0
  c.job = id
  return true
}

export function releaseJob(board: JobBoard, c: Creature): void {
  if (!c.job) return
  const id = c.job as JobId
  if (board.holders[id] === c.id) {
    delete board.holders[id]
    delete board.progress[id]
  }
  c.job = null
}

/** Clean up roles held by the dead. */
export function pruneJobs(board: JobBoard, creatures: Creature[]): void {
  const alive = new Set(creatures.filter((c) => c.alive).map((c) => c.id))
  for (const j of JOBS) {
    const holder = board.holders[j.id]
    if (holder !== undefined && !alive.has(holder)) {
      delete board.holders[j.id]
      delete board.progress[j.id]
    }
  }
}

export interface ShiftResult {
  paid: number
  produced: string | null
  /** the shift ran but the inputs were missing */
  blockedFor?: string
}

/**
 * Advance a worker's shift while they stand at their workplace.
 *
 * Production is a chain, not a spawn: the baker needs grain the farmer grew,
 * so a missing farmer eventually empties the bread shelf. A completed shift
 * pays wages and moves one unit down the chain.
 */
export function workShiftAt(
  board: JobBoard,
  economy: Economy,
  c: Creature,
  id: JobId,
): ShiftResult {
  const def = jobDef(id)
  if (!def || board.holders[id] !== c.id) return { paid: 0, produced: null }
  const progress = (board.progress[id] ?? 0) + 1
  board.progress[id] = progress
  if (progress < SHIFT_TICKS) return { paid: 0, produced: null }

  board.progress[id] = 0
  const skill = 1 + c.education * 0.12

  let produced: string | null = null
  let blockedFor: string | undefined
  if (def.produces) {
    const good = economy.goods[def.produces]
    const input = def.consumes ? economy.goods[def.consumes] : undefined
    const hasInput = !def.consumes || (input !== undefined && input.stock > 0)
    if (!hasInput) {
      blockedFor = def.consumes
    } else if (good && good.stock < good.maxStock) {
      if (input) input.stock -= 1
      good.stock += 1
      produced = def.produces
    }
  }

  // an unproductive shift still earns something, but less: you get paid for
  // the work you actually completed
  const pay = Math.round(def.wage * skill * (blockedFor ? 0.4 : 1))
  c.wallet += pay
  return { paid: pay, produced, blockedFor }
}

/** Nobody at the counter means nothing arrives on the shelf. */
export function isProducedGoodStaffed(board: JobBoard, goodId: string): boolean {
  const job = JOBS.find((j) => j.produces === goodId)
  if (!job) return true // goods nobody makes (imports) restock on their own
  return isStaffed(board, job.id)
}

/** Which role is responsible for a good, if any. */
export function producerOf(goodId: string): JobDef | undefined {
  return JOBS.find((j) => j.produces === goodId)
}

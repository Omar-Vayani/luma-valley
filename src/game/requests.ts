/**
 * requests — the things Haven asks of you.
 *
 * Not a quest script. Every request is read off the live simulation: someone
 * is hungry and broke, a shelf is empty because the farmer died, two
 * neighbours have been resenting each other for a week. Fix the cause and the
 * request closes; ignore it and it expires, and the underlying problem goes on
 * being a problem.
 */
import type { Sim } from '../lab/sim'
import type { Creature } from '../lab/creature'
import type { ItemId } from '../lab/inventory'
import { LANDMARKS } from '../world/lore'
import { adjustStanding, type PlayerProgress } from './progress'

export type RequestKind =
  | 'feed' | 'heal' | 'gift' | 'company' | 'deliver' | 'restock' | 'visit' | 'mediate' | 'mourn'

export interface Request {
  id: string
  kind: RequestKind
  giverId: number
  giverName: string
  targetId?: number
  targetName?: string
  itemId?: ItemId
  landmarkId?: string
  title: string
  detail: string
  coins: number
  standing: number
  offeredAt: number
  expiresAt: number
  accepted: boolean
  /** for two-part requests like mediation */
  step: number
}

export interface RequestBoard {
  open: Request[]
  active: Request[]
  closed: { id: string; title: string; tick: number; ok: boolean }[]
  nextId: number
  lastScan: number
}

export const MAX_ACTIVE = 3
const MAX_OPEN = 5
const SCAN_EVERY = 60
const LIFETIME = 2600

export function createBoard(): RequestBoard {
  return { open: [], active: [], closed: [], nextId: 1, lastScan: -999 }
}

/** Anything you could carry that counts as a meal. */
const FOODS: ItemId[] = ['bread', 'fish', 'berry']

function alive(sim: Sim, id: number): Creature | undefined {
  const c = sim.creatureById(id)
  return c && c.alive ? c : undefined
}

function has(board: RequestBoard, kind: RequestKind, giverId: number): boolean {
  return (
    board.open.some((r) => r.kind === kind && r.giverId === giverId) ||
    board.active.some((r) => r.kind === kind && r.giverId === giverId)
  )
}

function push(board: RequestBoard, r: Omit<Request, 'id' | 'accepted' | 'step'>): void {
  if (board.open.length >= MAX_OPEN) return
  board.open.push({ ...r, id: `r${board.nextId++}`, accepted: false, step: 0 })
}

/**
 * Look over the settlement and post what it needs. Cheap enough to run every
 * ten seconds of game time; deliberately conservative about how much it posts,
 * because a board of twenty errands is a chore list, not a village.
 */
export function scanRequests(sim: Sim, board: RequestBoard, tick: number): void {
  if (tick - board.lastScan < SCAN_EVERY) return
  board.lastScan = tick

  // expire the stale
  board.open = board.open.filter((r) => tick < r.expiresAt)
  for (const r of [...board.active]) {
    if (tick >= r.expiresAt) failRequest(board, r.id, tick)
  }

  const living = sim.creatures.filter((c) => c.alive)
  if (!living.length) return

  for (const c of living) {
    if (board.open.length >= MAX_OPEN) break

    // hungry and unable to pay for it
    if (c.chem.hunger < 0.3 && c.wallet < 3 && !has(board, 'feed', c.id)) {
      push(board, {
        kind: 'feed', giverId: c.id, giverName: c.name, itemId: 'bread',
        title: `${c.name} is hungry`,
        detail: 'Hungry, and short of coin. Anything to eat would do.',
        coins: 0, standing: 0.05,
        offeredAt: tick, expiresAt: tick + LIFETIME,
      })
      continue
    }

    // ill enough that it is going somewhere bad
    if (c.illness > 0.42 && !has(board, 'heal', c.id)) {
      push(board, {
        kind: 'heal', giverId: c.id, giverName: c.name, itemId: 'medicine',
        title: `${c.name} has a fever`,
        detail: 'The infirmary is a walk away and they are not walking well.',
        coins: 4, standing: 0.07,
        offeredAt: tick, expiresAt: tick + LIFETIME,
      })
      continue
    }

    // grieving, and nobody has come by
    if (c.chem.grief > 0.45 && !has(board, 'company', c.id)) {
      push(board, {
        kind: 'company', giverId: c.id, giverName: c.name,
        title: `${c.name} is grieving`,
        detail: 'Not asking for anything. Sit with them a while.',
        coins: 0, standing: 0.06,
        offeredAt: tick, expiresAt: tick + LIFETIME,
      })
      continue
    }

    // lonely: low belonging, few bonds
    if (c.psyche.belonging < 0.28 && c.psyche.mood === 'lonely' && !has(board, 'gift', c.id)) {
      push(board, {
        kind: 'gift', giverId: c.id, giverName: c.name, itemId: 'trinket',
        title: `${c.name} keeps to themselves`,
        detail: 'A small gift, given without a reason, changes what someone thinks of a place.',
        coins: 0, standing: 0.06,
        offeredAt: tick, expiresAt: tick + LIFETIME,
      })
      continue
    }
  }

  // an empty shelf is everyone's problem
  const bread = sim.economy.goods.bread
  if (bread && bread.stock <= 0 && board.open.length < MAX_OPEN) {
    const keeper = living.find((c) => c.job === 'shopkeep') ?? living[0]
    if (keeper && !has(board, 'restock', keeper.id)) {
      push(board, {
        kind: 'restock', giverId: keeper.id, giverName: keeper.name, itemId: 'grain',
        title: 'Market Row has no bread',
        detail: 'Grain from the fields would get the ovens going again.',
        coins: 8, standing: 0.08,
        offeredAt: tick, expiresAt: tick + LIFETIME,
      })
    }
  }

  // a feud worth stepping into
  if (board.open.length < MAX_OPEN) {
    outer: for (const a of living) {
      for (const b of living) {
        if (a.id >= b.id) continue
        const ab = a.social[b.id]
        const ba = b.social[a.id]
        if (!ab || !ba) continue
        if (ab.resentment > 0.55 && ba.resentment > 0.45 && !has(board, 'mediate', a.id)) {
          push(board, {
            kind: 'mediate', giverId: a.id, giverName: a.name, targetId: b.id, targetName: b.name,
            title: `${a.name} and ${b.name} are not speaking`,
            detail: 'Talk to both of them. It will not fix it, but it starts something.',
            coins: 6, standing: 0.09,
            offeredAt: tick, expiresAt: tick + LIFETIME,
          })
          break outer
        }
      }
    }
  }

  // somewhere worth being told about
  if (board.open.length < MAX_OPEN) {
    const child = living.find((c) => c.stage === 'child' || c.stage === 'adolescent')
    if (child && !has(board, 'visit', child.id)) {
      const unseen = LANDMARKS[Math.floor(sim.rng() * LANDMARKS.length)]
      push(board, {
        kind: 'visit', giverId: child.id, giverName: child.name, landmarkId: unseen.id,
        title: `${child.name} has never seen ${unseen.name}`,
        detail: `Go there and come back with something to tell them. ${unseen.short}`,
        coins: 3, standing: 0.05,
        offeredAt: tick, expiresAt: tick + LIFETIME * 2,
      })
    }
  }
}

export function acceptRequest(board: RequestBoard, id: string): Request | null {
  if (board.active.length >= MAX_ACTIVE) return null
  const i = board.open.findIndex((r) => r.id === id)
  if (i < 0) return null
  const r = board.open.splice(i, 1)[0]
  r.accepted = true
  board.active.push(r)
  return r
}

export function abandonRequest(board: RequestBoard, id: string): void {
  const i = board.active.findIndex((r) => r.id === id)
  if (i < 0) return
  const r = board.active.splice(i, 1)[0]
  r.accepted = false
  board.open.push(r)
}

function failRequest(board: RequestBoard, id: string, tick: number): void {
  const i = board.active.findIndex((r) => r.id === id)
  if (i < 0) return
  const r = board.active.splice(i, 1)[0]
  board.closed.unshift({ id: r.id, title: r.title, tick, ok: false })
  if (board.closed.length > 40) board.closed.length = 40
}

export interface RequestOutcome {
  request: Request
  message: string
  coins: number
}

/** Pay out and record. */
function complete(
  sim: Sim, board: RequestBoard, progress: PlayerProgress, r: Request, tick: number, message: string,
): RequestOutcome {
  const i = board.active.findIndex((x) => x.id === r.id)
  if (i >= 0) board.active.splice(i, 1)
  board.closed.unshift({ id: r.id, title: r.title, tick, ok: true })
  if (board.closed.length > 40) board.closed.length = 40

  const giver = alive(sim, r.giverId)
  let paid = 0
  if (giver && r.coins > 0) {
    paid = Math.min(r.coins, giver.wallet)
    giver.wallet -= paid
    sim.player.wallet += paid
  }
  if (giver) {
    giver.gratitude[0] = Math.min(1, (giver.gratitude[0] ?? 0) + 0.35)
    giver.playerBond = Math.min(1, giver.playerBond + 0.12)
  }
  adjustStanding(progress, r.standing)
  progress.deeds++
  return { request: r, message, coins: paid }
}

/** Call when the player hands something to a creature. */
export function onGive(
  sim: Sim, board: RequestBoard, progress: PlayerProgress,
  targetId: number, itemId: ItemId, tick: number,
): RequestOutcome | null {
  for (const r of [...board.active]) {
    if (r.kind === 'feed' && r.giverId === targetId && FOODS.includes(itemId)) {
      return complete(sim, board, progress, r, tick, `${r.giverName} eats, and looks at you differently.`)
    }
    if (r.kind === 'heal' && r.giverId === targetId && itemId === 'medicine') {
      const c = alive(sim, targetId)
      if (c) c.illness = Math.max(0, c.illness - 0.6)
      return complete(sim, board, progress, r, tick, `${r.giverName}'s fever will break by morning.`)
    }
    if (r.kind === 'gift' && r.giverId === targetId && (itemId === 'trinket' || itemId === 'gem' || itemId === 'lantern')) {
      const c = alive(sim, targetId)
      if (c) c.psyche.belonging = Math.min(1, c.psyche.belonging + 0.2)
      return complete(sim, board, progress, r, tick, `${r.giverName} turns it over twice before putting it away.`)
    }
    if (r.kind === 'restock' && r.giverId === targetId && itemId === 'grain') {
      const bread = sim.economy.goods.bread
      if (bread) bread.stock = Math.min(bread.maxStock, bread.stock + 3)
      return complete(sim, board, progress, r, tick, 'The ovens are lit again.')
    }
    if (r.kind === 'deliver' && r.targetId === targetId && r.itemId === itemId) {
      return complete(sim, board, progress, r, tick, `Delivered to ${r.targetName}.`)
    }
  }
  return null
}

/** Call when the player finishes a conversation with a creature. */
export function onTalk(
  sim: Sim, board: RequestBoard, progress: PlayerProgress, targetId: number, tick: number,
): RequestOutcome | null {
  for (const r of [...board.active]) {
    if (r.kind === 'company' && r.giverId === targetId) {
      const c = alive(sim, targetId)
      if (c) {
        c.chem.grief = Math.max(0, c.chem.grief - 0.25)
        c.chem.social = Math.min(1, c.chem.social + 0.3)
      }
      return complete(sim, board, progress, r, tick, `${r.giverName} says less than you expected, and means it.`)
    }
    if (r.kind === 'mediate') {
      const first = r.giverId
      const second = r.targetId
      if (targetId === first && r.step === 0) {
        r.step = 1
        return null
      }
      if (targetId === second && r.step === 1) {
        const a = alive(sim, first)
        const b = alive(sim, second)
        if (a && b) {
          const ab = a.social[b.id]
          const ba = b.social[a.id]
          if (ab) ab.resentment = Math.max(0, ab.resentment - 0.3)
          if (ba) ba.resentment = Math.max(0, ba.resentment - 0.3)
        }
        return complete(sim, board, progress, r, tick, `${r.giverName} and ${r.targetName} are still angry, but at the problem now.`)
      }
    }
    if (r.kind === 'visit' && r.giverId === targetId && r.step === 1) {
      return complete(sim, board, progress, r, tick, `${r.giverName} makes you describe it twice.`)
    }
  }
  return null
}

/** Call when the player discovers a landmark. */
export function onLandmark(board: RequestBoard, landmarkId: string): Request | null {
  for (const r of board.active) {
    if (r.kind === 'visit' && r.landmarkId === landmarkId && r.step === 0) {
      r.step = 1
      return r
    }
  }
  return null
}

/** A one-line hint for the objective tracker. */
export function objectiveFor(r: Request): string {
  switch (r.kind) {
    case 'feed': return `Give ${r.giverName} something to eat`
    case 'heal': return `Bring ${r.giverName} a remedy`
    case 'gift': return `Give ${r.giverName} a small gift`
    case 'company': return `Talk with ${r.giverName}`
    case 'restock': return `Bring grain to ${r.giverName}`
    case 'mediate': return r.step === 0
      ? `Talk to ${r.giverName}`
      : `Now talk to ${r.targetName}`
    case 'visit': return r.step === 0
      ? `Find ${LANDMARKS.find((l) => l.id === r.landmarkId)?.name ?? 'the place'}`
      : `Tell ${r.giverName} what you saw`
    case 'deliver': return `Take ${r.itemId} to ${r.targetName}`
    case 'mourn': return `Visit the grave`
  }
}

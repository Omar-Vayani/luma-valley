/**
 * targeting — what you are pointing at.
 *
 * The old build picked whoever was nearest, which is why talking to a crowd
 * kept answering with the same Luma no matter where you looked. This casts a
 * short cylinder down the middle of the screen and takes the first thing it
 * hits, so the crosshair means exactly what it looks like it means.
 */
import * as THREE from 'three'
import type { Sim } from '../lab/sim'
import type { Fixture } from '../lab/interact'
import { itemName } from '../lab/items'
import type { ResourceNode } from '../world/scatter'
import { heightAt, isUnderwater, WATER_LEVEL } from '../world/terrain'
import { landmarkNear, type Landmark } from '../world/lore'
import { HARVEST, nodeReady } from './gather'
import { PLACEABLE_LABEL, type PlacedProp, type PlayerProgress } from './progress'

export type Target =
  | { kind: 'creature'; id: number; label: string; verb: string; point: THREE.Vector3; distance: number }
  | { kind: 'node'; node: ResourceNode; label: string; verb: string; point: THREE.Vector3; distance: number; hold: number }
  | { kind: 'fixture'; fixture: Fixture; label: string; verb: string; point: THREE.Vector3; distance: number }
  | { kind: 'drop'; index: number; label: string; verb: string; point: THREE.Vector3; distance: number }
  | { kind: 'placed'; prop: PlacedProp; label: string; verb: string; point: THREE.Vector3; distance: number }
  | { kind: 'landmark'; landmark: Landmark; label: string; verb: string; point: THREE.Vector3; distance: number }
  | { kind: 'water'; label: string; verb: string; point: THREE.Vector3; distance: number }

export const REACH = 4.2
/** How far away a name will appear over someone's head when you look at them. */
export const GAZE_RANGE = 34

interface Hit {
  t: number
  lateral: number
}

/** Cylinder cast: how far along the ray, and how far off its axis. */
function against(
  eye: THREE.Vector3, dir: THREE.Vector3,
  x: number, y: number, z: number, radius: number, reach: number,
): Hit | null {
  const dx = x - eye.x
  const dy = y - eye.y
  const dz = z - eye.z
  const t = dx * dir.x + dy * dir.y + dz * dir.z
  if (t < -0.6 || t > reach) return null
  const px = dx - dir.x * t
  const py = dy - dir.y * t
  const pz = dz - dir.z * t
  const lateral = Math.hypot(px, py, pz)
  if (lateral > radius) return null
  return { t: Math.max(0, t), lateral }
}

export interface TargetContext {
  sim: Sim
  progress: PlayerProgress
  nodes: ResourceNode[]
  eye: THREE.Vector3
  dir: THREE.Vector3
  tick: number
  /** what is in the player's hand, for context-sensitive verbs */
  holding: string | null
}

/**
 * The thing the crosshair is on, or null. Ordered by how far down the ray it
 * sits, so a Luma standing in front of a berry bush wins.
 */
export function pickTarget(ctx: TargetContext): Target | null {
  const { sim, eye, dir } = ctx
  let best: Target | null = null
  let bestT = Infinity

  const take = (t: Target, hit: Hit): void => {
    // a slight bias toward whatever is closest to the centre of the screen
    const score = hit.t + hit.lateral * 0.6
    if (score < bestT) {
      bestT = score
      best = t
    }
  }

  for (const c of sim.creatures) {
    if (!c.alive) continue
    const y = heightAt(c.pos.x, c.pos.z) + 1.0
    const hit = against(eye, dir, c.pos.x, y, c.pos.z, 0.85, REACH)
    if (!hit) continue
    take({
      kind: 'creature', id: c.id, label: c.name,
      verb: c.sleeping ? 'Wake' : 'Talk to',
      point: new THREE.Vector3(c.pos.x, y, c.pos.z),
      distance: hit.t,
    }, hit)
  }

  for (const node of ctx.nodes) {
    if (!nodeReady(ctx.progress, node.id, ctx.tick)) continue
    const rule = HARVEST[node.kind]
    const hit = against(eye, dir, node.x, node.y + 0.6, node.z, 0.9, REACH)
    if (!hit) continue
    take({
      kind: 'node', node, label: rule.noun, verb: rule.verb,
      point: new THREE.Vector3(node.x, node.y + 0.6, node.z),
      distance: hit.t, hold: rule.effort,
    }, hit)
  }

  for (const f of sim.fixtures) {
    const y = heightAt(f.x, f.z) + 0.6
    const hit = against(eye, dir, f.x, y, f.z, 0.8, REACH)
    if (!hit) continue
    const verb =
      f.kind === 'bed' ? 'Rest in'
        : f.kind === 'door' ? (f.open ? 'Close' : 'Open')
          : f.kind === 'container' ? 'Open'
            : f.kind === 'counter' ? 'Trade at' : 'Sit on'
    take({
      kind: 'fixture', fixture: f, label: f.kind, verb,
      point: new THREE.Vector3(f.x, y, f.z), distance: hit.t,
    }, hit)
  }

  sim.drops.forEach((d, index) => {
    const y = heightAt(d.x, d.z) + 0.3
    const hit = against(eye, dir, d.x, y, d.z, 0.7, REACH)
    if (!hit) return
    take({
      kind: 'drop', index, label: d.kind === 'money' ? `${d.amount} coins` : 'food',
      verb: 'Pick up', point: new THREE.Vector3(d.x, y, d.z), distance: hit.t,
    }, hit)
  })

  for (const p of ctx.progress.placed) {
    const hit = against(eye, dir, p.x, p.y + 0.5, p.z, 0.7, REACH)
    if (!hit) continue
    take({
      kind: 'placed', prop: p, label: PLACEABLE_LABEL[p.kind], verb: 'Take back',
      point: new THREE.Vector3(p.x, p.y + 0.5, p.z), distance: hit.t,
    }, hit)
  }

  // water you can drink or fish from, when you are looking down at it
  if (!best && dir.y < -0.05) {
    const t = (WATER_LEVEL - eye.y) / dir.y
    if (t > 0 && t < REACH) {
      const wx = eye.x + dir.x * t
      const wz = eye.z + dir.z * t
      if (isUnderwater(wx, wz)) {
        best = {
          kind: 'water', label: 'clear water', verb: 'Drink from',
          point: new THREE.Vector3(wx, WATER_LEVEL, wz), distance: t,
        }
      }
    }
  }

  return best
}

/** The Luma you are looking at from any reasonable distance, for name tags. */
export function pickGaze(sim: Sim, eye: THREE.Vector3, dir: THREE.Vector3): number | null {
  let bestId: number | null = null
  let bestScore = Infinity
  for (const c of sim.creatures) {
    if (!c.alive) continue
    const y = heightAt(c.pos.x, c.pos.z) + 1.0
    const hit = against(eye, dir, c.pos.x, y, c.pos.z, 1.4, GAZE_RANGE)
    if (!hit) continue
    const score = hit.lateral * 4 + hit.t * 0.05
    if (score < bestScore) {
      bestScore = score
      bestId = c.id
    }
  }
  return bestId
}

/** The landmark close enough to read, used for discovery. */
export function landmarkAt(x: number, z: number): Landmark | null {
  return landmarkNear(x, z)
}

/** Human-readable prompt line under the crosshair. */
export function promptFor(target: Target, holding: string | null): string {
  switch (target.kind) {
    case 'creature': return `${target.verb} ${target.label}`
    case 'node': return `${target.verb} ${target.label}`
    case 'fixture': return `${target.verb} the ${target.label}`
    case 'drop': return `${target.verb} ${target.label}`
    case 'placed': return `${target.verb} the ${target.label}`
    case 'landmark': return `Read ${target.label}`
    case 'water': return holding === 'water' ? 'Fill your flask' : 'Drink'
  }
}

export { itemName }

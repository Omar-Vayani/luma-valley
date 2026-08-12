/**
 * collision — what you cannot walk through.
 *
 * The valley has a few thousand solid things in it: buildings, trees, rocks,
 * fence posts, market stalls, the well, standing stones, and whatever you have
 * set down yourself. Testing all of them every frame would be silly, and
 * testing only the buildings — which is what used to happen — meant walking
 * through an oak.
 *
 * A uniform grid solves it: everything is filed into eight-metre cells once at
 * load, and a step only ever asks the handful of cells it could reach.
 */

export interface Solid {
  x: number
  z: number
  /** radius on the ground */
  r: number
  /** how high it stands; you can step or jump over a low wall */
  height: number
  /** what it is, for footstep and interaction feedback */
  kind?: string
}

const CELL = 8

export class CollisionGrid {
  private cells = new Map<number, Solid[]>()
  private minX = 0
  private minZ = 0
  private cols = 0
  private count = 0

  constructor(halfExtent = 240) {
    this.minX = -halfExtent
    this.minZ = -halfExtent
    this.cols = Math.ceil((halfExtent * 2) / CELL) + 1
  }

  get size(): number {
    return this.count
  }

  private key(cx: number, cz: number): number {
    return cz * this.cols + cx
  }

  private cellOf(x: number, z: number): { cx: number; cz: number } {
    return {
      cx: Math.floor((x - this.minX) / CELL),
      cz: Math.floor((z - this.minZ) / CELL),
    }
  }

  add(solid: Solid): void {
    if (solid.r <= 0) return
    // a thing wider than a cell has to be filed in every cell it touches
    const lo = this.cellOf(solid.x - solid.r, solid.z - solid.r)
    const hi = this.cellOf(solid.x + solid.r, solid.z + solid.r)
    for (let cz = lo.cz; cz <= hi.cz; cz++) {
      for (let cx = lo.cx; cx <= hi.cx; cx++) {
        const k = this.key(cx, cz)
        const list = this.cells.get(k)
        if (list) list.push(solid)
        else this.cells.set(k, [solid])
      }
    }
    this.count++
  }

  addAll(solids: Solid[]): void {
    for (const s of solids) this.add(s)
  }

  /** Everything that could touch a circle at this point. */
  near(x: number, z: number, radius: number, out: Solid[] = []): Solid[] {
    out.length = 0
    const lo = this.cellOf(x - radius, z - radius)
    const hi = this.cellOf(x + radius, z + radius)
    for (let cz = lo.cz; cz <= hi.cz; cz++) {
      for (let cx = lo.cx; cx <= hi.cx; cx++) {
        const list = this.cells.get(this.key(cx, cz))
        if (!list) continue
        for (const s of list) {
          if (!out.includes(s)) out.push(s)
        }
      }
    }
    return out
  }

  /**
   * Push a body out of anything it has ended up inside.
   *
   * `feet` is how high off the ground the body's lowest point is, so a jump
   * clears a fence and a step clears a kerb. Returns whether anything moved,
   * because the caller wants to kill the velocity it was carrying.
   */
  resolve(
    pos: { x: number; z: number }, radius: number, feet: number, scratch: Solid[] = [],
  ): boolean {
    const solids = this.near(pos.x, pos.z, radius + 2, scratch)
    let moved = false
    // two passes, so being squeezed between two things settles rather than
    // oscillating between them
    for (let pass = 0; pass < 2; pass++) {
      for (const s of solids) {
        if (feet >= s.height) continue
        const dx = pos.x - s.x
        const dz = pos.z - s.z
        const min = s.r + radius
        const d2 = dx * dx + dz * dz
        if (d2 >= min * min) continue
        const d = Math.sqrt(d2)
        if (d < 1e-4) {
          // dead centre: pick a direction rather than dividing by zero
          pos.x += min
          moved = true
          continue
        }
        const push = (min - d) / d
        pos.x += dx * push
        pos.z += dz * push
        moved = true
      }
    }
    return moved
  }

  /** Is this spot clear for something of this size? */
  isClear(x: number, z: number, radius: number, scratch: Solid[] = []): boolean {
    for (const s of this.near(x, z, radius + 1, scratch)) {
      const min = s.r + radius
      if ((s.x - x) ** 2 + (s.z - z) ** 2 < min * min) return false
    }
    return true
  }
}

/**
 * How solid each kind of scattered thing is. Undergrowth you walk through;
 * trunks and boulders you do not. The radius is a fraction of the model's
 * own scale, tuned so you can brush past a tree without being shoved.
 */
export const PROP_SOLIDITY: Record<string, { r: number; height: number } | undefined> = {
  pine: { r: 0.42, height: 9 },
  pineSnow: { r: 0.42, height: 9 },
  tree: { r: 0.4, height: 8 },
  treeAutumn: { r: 0.4, height: 8 },
  birch: { r: 0.32, height: 9 },
  willow: { r: 0.44, height: 7 },
  deadTree: { r: 0.3, height: 7 },
  rock: { r: 0.7, height: 1.4 },
  mossRock: { r: 0.68, height: 1.3 },
  snowRock: { r: 0.72, height: 1.5 },
  stump: { r: 0.42, height: 0.8 },
  log: { r: 0.4, height: 0.7 },
  // bushes, grass, flowers, crops and lilies are all walk-through
}

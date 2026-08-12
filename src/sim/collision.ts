/**
 * collision — one grid, used by everybody.
 *
 * The bug this file exists to kill is having two ideas of what is solid: the
 * player was pushed out of buildings by one system while creatures were
 * steered by another, so they walked into walls, wedged themselves in door
 * frames and stood inside the furniture. Now the village, the props and the
 * player all file into the same grid, and both the player controller and the
 * creatures resolve against it with the same function.
 *
 * Two shapes are enough for a valley. Trees, rocks, barrels and creatures are
 * circles. Walls are boxes, because a wall with a doorway in it cannot be
 * approximated by circles without either sealing the doorway or leaking.
 */

export interface CircleSolid {
  shape: 'circle'
  x: number
  z: number
  r: number
  /** how high it stands — you can jump over a low thing */
  height: number
  kind: string
}

export interface BoxSolid {
  shape: 'box'
  x: number
  z: number
  /** half-extents along the box's own axes */
  hw: number
  hd: number
  /** yaw, radians */
  rot: number
  height: number
  kind: string
}

export type Solid = CircleSolid | BoxSolid

export function circle(x: number, z: number, r: number, height: number, kind = 'prop'): CircleSolid {
  return { shape: 'circle', x, z, r, height, kind }
}

export function box(
  x: number, z: number, hw: number, hd: number, rot: number, height: number, kind = 'wall',
): BoxSolid {
  return { shape: 'box', x, z, hw, hd, rot, height, kind }
}

/** Bounding radius, for filing into the grid. */
function reach(s: Solid): number {
  return s.shape === 'circle' ? s.r : Math.hypot(s.hw, s.hd)
}

const CELL = 6

export class CollisionGrid {
  private cells = new Map<number, Solid[]>()
  private cols: number
  private min: number
  private count = 0

  constructor(halfExtent = 120) {
    this.min = -halfExtent
    this.cols = Math.ceil((halfExtent * 2) / CELL) + 1
  }

  get size(): number {
    return this.count
  }

  clear(): void {
    this.cells.clear()
    this.count = 0
  }

  private key(cx: number, cz: number): number {
    return cz * this.cols + cx
  }

  private cellIndex(v: number): number {
    return Math.floor((v - this.min) / CELL)
  }

  add(solid: Solid): void {
    const r = reach(solid)
    if (r <= 0) return
    const x0 = this.cellIndex(solid.x - r)
    const x1 = this.cellIndex(solid.x + r)
    const z0 = this.cellIndex(solid.z - r)
    const z1 = this.cellIndex(solid.z + r)
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
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

  /** Everything that could touch a circle here. */
  near(x: number, z: number, radius: number, out: Solid[] = []): Solid[] {
    out.length = 0
    const x0 = this.cellIndex(x - radius)
    const x1 = this.cellIndex(x + radius)
    const z0 = this.cellIndex(z - radius)
    const z1 = this.cellIndex(z + radius)
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.cells.get(this.key(cx, cz))
        if (!list) continue
        for (const s of list) if (!out.includes(s)) out.push(s)
      }
    }
    return out
  }

  /**
   * Push a body out of anything it is inside. `feet` is how far off the ground
   * the body's lowest point is, so a jump clears a low fence.
   *
   * Two passes, so a body squeezed between two things settles instead of
   * bouncing between them for ever.
   */
  resolve(pos: { x: number; z: number }, radius: number, feet: number, scratch: Solid[] = []): boolean {
    const solids = this.near(pos.x, pos.z, radius + 2.5, scratch)
    let moved = false
    for (let pass = 0; pass < 2; pass++) {
      for (const s of solids) {
        if (feet >= s.height) continue
        if (s.shape === 'circle' ? pushOutOfCircle(pos, radius, s) : pushOutOfBox(pos, radius, s)) {
          moved = true
        }
      }
    }
    return moved
  }

  /** Is a body of this size free to stand here? */
  isClear(x: number, z: number, radius: number, scratch: Solid[] = []): boolean {
    for (const s of this.near(x, z, radius + 1, scratch)) {
      if (s.height < 0.4) continue
      if (s.shape === 'circle') {
        const min = s.r + radius
        if ((s.x - x) ** 2 + (s.z - z) ** 2 < min * min) return false
      } else if (boxPenetration(x, z, radius, s) > 0) {
        return false
      }
    }
    return true
  }

  /** Does the straight line a→b stay clear? Used for "can I just walk there". */
  lineClear(ax: number, az: number, bx: number, bz: number, radius: number): boolean {
    const d = Math.hypot(bx - ax, bz - az)
    const steps = Math.max(1, Math.ceil(d / 0.6))
    const scratch: Solid[] = []
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      if (!this.isClear(ax + (bx - ax) * t, az + (bz - az) * t, radius, scratch)) return false
    }
    return true
  }
}

function pushOutOfCircle(pos: { x: number; z: number }, radius: number, s: CircleSolid): boolean {
  const dx = pos.x - s.x
  const dz = pos.z - s.z
  const min = s.r + radius
  const d2 = dx * dx + dz * dz
  if (d2 >= min * min) return false
  const d = Math.sqrt(d2)
  if (d < 1e-4) {
    pos.x += min
    return true
  }
  const push = (min - d) / d
  pos.x += dx * push
  pos.z += dz * push
  return true
}

/** How deep a circle is inside a box, 0 if outside. */
function boxPenetration(x: number, z: number, radius: number, s: BoxSolid): number {
  const cos = Math.cos(-s.rot)
  const sin = Math.sin(-s.rot)
  const dx = x - s.x
  const dz = z - s.z
  const lx = dx * cos - dz * sin
  const lz = dx * sin + dz * cos
  const ox = Math.abs(lx) - s.hw
  const oz = Math.abs(lz) - s.hd
  if (ox > radius || oz > radius) return 0
  if (ox > 0 && oz > 0) {
    const corner = Math.hypot(ox, oz)
    return corner < radius ? radius - corner : 0
  }
  return radius - Math.max(ox, oz)
}

function pushOutOfBox(pos: { x: number; z: number }, radius: number, s: BoxSolid): boolean {
  const cos = Math.cos(-s.rot)
  const sin = Math.sin(-s.rot)
  const dx = pos.x - s.x
  const dz = pos.z - s.z
  // into the box's own frame
  let lx = dx * cos - dz * sin
  let lz = dx * sin + dz * cos

  const ox = Math.abs(lx) - s.hw
  const oz = Math.abs(lz) - s.hd
  if (ox > radius || oz > radius) return false

  if (ox > 0 && oz > 0) {
    // nearest feature is a corner
    const corner = Math.hypot(ox, oz)
    if (corner >= radius) return false
    const push = (radius - corner) / corner
    lx += Math.sign(lx) * ox * push
    lz += Math.sign(lz) * oz * push
  } else if (ox > oz) {
    lx = Math.sign(lx || 1) * (s.hw + radius)
  } else {
    lz = Math.sign(lz || 1) * (s.hd + radius)
  }

  // back out to world space
  const c2 = Math.cos(s.rot)
  const s2 = Math.sin(s.rot)
  pos.x = s.x + lx * c2 - lz * s2
  pos.z = s.z + lx * s2 + lz * c2
  return true
}

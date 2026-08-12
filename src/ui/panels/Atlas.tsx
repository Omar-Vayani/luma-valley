/**
 * Atlas — a map of the valley, drawn from the same height function the world
 * is built from, so it cannot disagree with the terrain.
 *
 * Rendered once into an offscreen canvas and cached: the base is expensive
 * (a few tens of thousands of noise samples) but it never changes. Only the
 * markers and the little arrow that is you are redrawn.
 */
import { useEffect, useRef } from 'react'
import { TOWERS } from '../../lab/world'
import { LANDMARKS } from '../../world/lore'
import {
  heightAt, ROADS, surfaceAt, TERRAIN_HALF, WATER_LEVEL,
} from '../../world/terrain'
import type { PlayerProgress } from '../../game/progress'
import { Panel } from '../Panel'

const RES = 256

const SURFACE_COLOR: Record<string, string> = {
  road: '#a08b6a', sand: '#c8b183', grass: '#5f8f43', meadow: '#6da34a',
  farm: '#8a6a3e', forest: '#3a6331', rock: '#7d7a72', snow: '#e2e9ee',
  marsh: '#4e7048',
}

let baseCanvas: HTMLCanvasElement | null = null

function buildBase(): HTMLCanvasElement {
  if (baseCanvas) return baseCanvas
  const canvas = document.createElement('canvas')
  canvas.width = RES
  canvas.height = RES
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const image = ctx.createImageData(RES, RES)
  const scale = (TERRAIN_HALF * 2) / RES

  for (let py = 0; py < RES; py++) {
    for (let px = 0; px < RES; px++) {
      const x = -TERRAIN_HALF + px * scale
      const z = -TERRAIN_HALF + py * scale
      const h = heightAt(x, z)
      let r: number
      let g: number
      let b: number
      if (h < WATER_LEVEL) {
        const depth = Math.min(1, (WATER_LEVEL - h) / 8)
        r = 40 - depth * 22
        g = 96 - depth * 50
        b = 130 - depth * 50
      } else {
        const hex = SURFACE_COLOR[surfaceAt(x, z, h)] ?? '#5f8f43'
        const n = parseInt(hex.slice(1), 16)
        // fake relief with a north-west light
        const shade = 0.72 + Math.max(-0.4, Math.min(0.4, (h - heightAt(x - 3, z - 3)) * 0.16))
        r = ((n >> 16) & 255) * shade
        g = ((n >> 8) & 255) * shade
        b = (n & 255) * shade
      }
      const i = (py * RES + px) * 4
      image.data[i] = r
      image.data[i + 1] = g
      image.data[i + 2] = b
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)

  // roads on top, as pale threads
  ctx.strokeStyle = 'rgba(214, 196, 160, 0.55)'
  ctx.lineWidth = 1.6
  ctx.lineJoin = 'round'
  for (const road of ROADS) {
    ctx.beginPath()
    road.forEach((p, i) => {
      const px = ((p.x + TERRAIN_HALF) / (TERRAIN_HALF * 2)) * RES
      const py = ((p.z + TERRAIN_HALF) / (TERRAIN_HALF * 2)) * RES
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
  }

  baseCanvas = canvas
  return canvas
}

export interface AtlasProps {
  progress: PlayerProgress
  player: { x: number; z: number; yaw: number }
  onClose: () => void
}

export function Atlas({ progress, player, onClose }: AtlasProps): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = 512
    canvas.height = 512
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(buildBase(), 0, 0, 512, 512)

    const toPx = (x: number, z: number): [number, number] => [
      ((x + TERRAIN_HALF) / (TERRAIN_HALF * 2)) * 512,
      ((z + TERRAIN_HALF) / (TERRAIN_HALF * 2)) * 512,
    ]

    // buildings
    for (const t of TOWERS) {
      const [px, py] = toPx(t.x, t.z)
      ctx.fillStyle = t.color
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.rect(px - 3.5, py - 3.5, 7, 7)
      ctx.fill()
      ctx.stroke()
      if (t.kind !== 'house') {
        ctx.fillStyle = 'rgba(236, 231, 219, 0.9)'
        ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.shadowColor = 'rgba(0,0,0,0.9)'
        ctx.shadowBlur = 4
        ctx.fillText(t.label, px, py - 7)
        ctx.shadowBlur = 0
      }
    }

    // landmarks you have found
    for (const l of LANDMARKS) {
      if (!progress.discovered.includes(l.id)) continue
      const [px, py] = toPx(l.x, l.z)
      ctx.fillStyle = '#e8a44c'
      ctx.beginPath()
      ctx.moveTo(px, py - 5)
      ctx.lineTo(px + 4, py + 3)
      ctx.lineTo(px - 4, py + 3)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(236, 231, 219, 0.75)'
      ctx.font = '500 9px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.shadowColor = 'rgba(0,0,0,0.9)'
      ctx.shadowBlur = 4
      ctx.fillText(l.name, px, py + 14)
      ctx.shadowBlur = 0
    }

    // things you have set down
    ctx.fillStyle = 'rgba(255, 209, 128, 0.9)'
    for (const p of progress.placed) {
      const [px, py] = toPx(p.x, p.z)
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3)
    }

    // you
    const [ux, uy] = toPx(player.x, player.z)
    ctx.save()
    ctx.translate(ux, uy)
    ctx.rotate(-player.yaw + Math.PI)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, -8)
    ctx.lineTo(5.5, 6)
    ctx.lineTo(0, 3)
    ctx.lineTo(-5.5, 6)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }, [progress, player])

  return (
    <Panel
      title="The Valley"
      hint={`${Math.round(player.x)}, ${Math.round(player.z)}`}
      onClose={onClose}
      testId="atlas"
    >
      <div className="atlas" data-atlas>
        <canvas ref={ref} />
      </div>
      <div className="legend">
        <span><i style={{ background: '#e8a44c' }} />landmark you have found</span>
        <span><i style={{ background: '#c98a3d' }} />building</span>
        <span><i style={{ background: '#2f6a86' }} />water</span>
        <span><i style={{ background: '#a08b6a' }} />road</span>
        <span>{progress.discovered.length} of {LANDMARKS.length} places found</span>
      </div>
    </Panel>
  )
}

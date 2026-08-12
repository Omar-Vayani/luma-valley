/**
 * sky — light, air and the time of day.
 *
 * The brief for this build was "chill", and most of that is here rather than
 * in the systems. The day is twenty minutes long and moves slowly; the light
 * is warm at every hour; the fill light is generous, so shadows never go to
 * black; and the fog is close enough to soften the valley rim without hiding
 * the hamlet.
 */
import * as THREE from 'three'
import { HALF } from '../sim/terrain'

interface Keyframe {
  at: number
  sky: string
  horizon: string
  sun: string
  sunIntensity: number
  ambient: string
  ambientIntensity: number
  fog: string
  fogDensity: number
}

/** The day, in five keys. Warm at noon, blue and soft at night. */
const DAY: Keyframe[] = [
  {
    at: 0, sky: '#243252', horizon: '#3d4f70', sun: '#b9cbe8', sunIntensity: 0.8,
    ambient: '#8496bd', ambientIntensity: 1.9, fog: '#354260', fogDensity: 0.006,
  },
  {
    at: 0.24, sky: '#7fa3c4', horizon: '#e8b98a', sun: '#ffcf9a', sunIntensity: 0.95,
    ambient: '#a8bcd2', ambientIntensity: 1.25, fog: '#c8b49a', fogDensity: 0.006,
  },
  {
    at: 0.5, sky: '#8dc0e6', horizon: '#cfe3f0', sun: '#fff1d6', sunIntensity: 1.5,
    ambient: '#b3c8dd', ambientIntensity: 1.35, fog: '#c5dcec', fogDensity: 0.0035,
  },
  {
    at: 0.76, sky: '#6f8fbe', horizon: '#e9a877', sun: '#ffbe83', sunIntensity: 0.9,
    ambient: '#a2b3cc', ambientIntensity: 1.2, fog: '#c9a98d', fogDensity: 0.006,
  },
  {
    at: 1, sky: '#243252', horizon: '#3d4f70', sun: '#b9cbe8', sunIntensity: 0.8,
    ambient: '#8496bd', ambientIntensity: 1.9, fog: '#354260', fogDensity: 0.006,
  },
]

function lerpKey(a: Keyframe, b: Keyframe, t: number): Keyframe {
  const mix = (x: string, y: string): string =>
    `#${new THREE.Color(x).lerp(new THREE.Color(y), t).getHexString()}`
  return {
    at: 0,
    sky: mix(a.sky, b.sky),
    horizon: mix(a.horizon, b.horizon),
    sun: mix(a.sun, b.sun),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t,
    ambient: mix(a.ambient, b.ambient),
    ambientIntensity: a.ambientIntensity + (b.ambientIntensity - a.ambientIntensity) * t,
    fog: mix(a.fog, b.fog),
    fogDensity: a.fogDensity + (b.fogDensity - a.fogDensity) * t,
  }
}

function sample(phase: number): Keyframe {
  const p = ((phase % 1) + 1) % 1
  for (let i = 0; i < DAY.length - 1; i++) {
    const a = DAY[i]
    const b = DAY[i + 1]
    if (p >= a.at && p <= b.at) {
      const t = (p - a.at) / Math.max(1e-6, b.at - a.at)
      return lerpKey(a, b, t * t * (3 - 2 * t))
    }
  }
  return DAY[0]
}

export class Sky {
  readonly sun: THREE.DirectionalLight
  readonly ambient: THREE.HemisphereLight
  readonly dome: THREE.Mesh
  private fog: THREE.FogExp2
  private skyMaterial: THREE.ShaderMaterial
  /** 0 in daylight, 1 in the small hours. Read by the grade. */
  night = 0

  constructor(scene: THREE.Scene, shadowDistance: number) {
    this.sun = new THREE.DirectionalLight('#fff1d6', 1.4)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.035
    this.setShadowDistance(shadowDistance)
    scene.add(this.sun)
    scene.add(this.sun.target)

    this.ambient = new THREE.HemisphereLight('#b3c8dd', '#7a7f60', 1.35)
    scene.add(this.ambient)

    this.fog = new THREE.FogExp2('#c5dcec', 0.0035)
    scene.fog = this.fog

    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#8dc0e6') },
        bottom: { value: new THREE.Color('#cfe3f0') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 bottom;
        varying vec3 vPos;
        void main() {
          float h = clamp(normalize(vPos).y * 1.6 + 0.28, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottom, top, h), 1.0);
        }
      `,
    })
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(HALF * 3.2, 24, 16), this.skyMaterial)
    this.dome.name = 'sky'
    this.dome.frustumCulled = false
    scene.add(this.dome)
  }

  setShadowDistance(distance: number): void {
    const cam = this.sun.shadow.camera
    cam.left = -distance
    cam.right = distance
    cam.top = distance
    cam.bottom = -distance
    cam.near = 1
    cam.far = distance * 4
    cam.updateProjectionMatrix()
  }

  setShadowMapSize(size: number): void {
    this.sun.shadow.mapSize.set(size, size)
    this.sun.shadow.map?.dispose()
    this.sun.shadow.map = null
  }

  /** `phase` is 0 at midnight, 0.5 at noon. `focus` is where the camera is. */
  update(phase: number, focus: THREE.Vector3): void {
    const key = sample(phase)

    // The sun never comes from directly overhead and never sits exactly on the
    // horizon: a low warm key at dawn and dusk, high and soft at noon.
    const angle = (phase - 0.25) * Math.PI * 2
    const elevation = Math.sin(angle)
    const height = Math.max(0.12, elevation) * 90 + 12
    this.sun.position.set(
      focus.x + Math.cos(angle) * 70,
      focus.y + height,
      focus.z + 34,
    )
    this.sun.target.position.copy(focus)
    this.sun.color.set(key.sun)
    this.sun.intensity = key.sunIntensity

    this.ambient.color.set(key.ambient)
    this.ambient.intensity = key.ambientIntensity

    this.fog.color.set(key.fog)
    this.fog.density = key.fogDensity

    this.skyMaterial.uniforms.top.value.set(key.sky)
    this.skyMaterial.uniforms.bottom.value.set(key.horizon)
    this.dome.position.copy(focus)

    this.night = Math.max(0, Math.min(1, -elevation * 1.4 + 0.35))
  }

  dispose(): void {
    this.dome.geometry.dispose()
    this.skyMaterial.dispose()
  }
}

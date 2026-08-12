/**
 * atmosphere — the sky, the light, and the time of day.
 *
 * The settlement already keeps hours: shops shut, Luma go to bed. This makes
 * that visible. A day is 1200 ticks, about three and a half minutes, so you
 * see dawn and dusk often enough that they need to be worth looking at —
 * hence a real sun arc, a moon on the other side of it, stars that come out,
 * and a fog colour that agrees with the horizon instead of fighting it.
 */
import * as THREE from 'three'
import { DAY_LENGTH, timeOfDay } from '../lab/institutions'

interface SkyKey {
  /** position in the day, 0 dawn .. 1 end of night */
  t: number
  zenith: number
  horizon: number
  fog: number
  sun: number
  sunIntensity: number
  ambient: number
  ambientIntensity: number
  /** 0 day .. 1 night, for the grade and for window lights */
  night: number
}

/** Keyframes through the day, filled in below as readable hex triples. */
const KEYS: SkyKey[] = []

function key(
  t: number, zenith: string, horizon: string, fog: string, sun: string,
  sunIntensity: number, ambient: string, ambientIntensity: number, night: number,
): void {
  KEYS.push({
    t,
    zenith: parseInt(zenith, 16),
    horizon: parseInt(horizon, 16),
    fog: parseInt(fog, 16),
    sun: parseInt(sun, 16),
    sunIntensity,
    ambient: parseInt(ambient, 16),
    ambientIntensity,
    night,
  })
}

// Shadow side matters as much as sun side in a flat-shaded world: with a thin
// ambient the underside of every roof goes to black and the settlement reads
// as a pile of silhouettes. The fill here is deliberately generous.
//   time  zenith    horizon   fog       sunlight  int   ambient   int   night
key(0.00, '090e24', '182648', '1a2843', '93a8e2', 0.30, '3a4c7d', 0.70, 1.00)
key(0.08, '1e3565', '5c5c88', '4a5178', 'c79db0', 0.62, '6a78a4', 1.10, 0.74)
key(0.13, '2f4c86', 'f0a06a', 'a98a80', 'ffb478', 1.25, '95a1c4', 1.40, 0.34)
key(0.22, '3d78c4', 'c3ddf0', 'c6dbec', 'ffdcae', 1.55, 'b3c8de', 1.05, 0.06)
key(0.50, '2f7ad6', 'bfe0f6', 'cae3f4', 'fff4e2', 1.70, 'bcd3e8', 1.12, 0.00)
key(0.78, '3a72c0', 'ccd9ea', 'ccd8e6', 'ffe6bc', 1.50, 'b6c8dd', 1.05, 0.05)
// dusk carries a lot of the fill: a low sun lights almost nothing that faces
// upward, and a valley you cannot read is not atmospheric, it is just dark
key(0.88, '35478a', 'ff8d52', 'c09080', 'ffa268', 1.25, '93a0c6', 1.45, 0.36)
key(0.95, '19244c', '4a4064', '3a4060', 'a596c4', 0.60, '6a78aa', 1.15, 0.84)
key(1.00, '090e24', '182648', '1a2843', '93a8e2', 0.30, '3a4c7d', 0.70, 1.00)

function lerpKey(t: number): SkyKey {
  let a = KEYS[0]
  let b = KEYS[KEYS.length - 1]
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (t >= KEYS[i].t && t <= KEYS[i + 1].t) {
      a = KEYS[i]
      b = KEYS[i + 1]
      break
    }
  }
  const span = b.t - a.t || 1
  const k = Math.min(1, Math.max(0, (t - a.t) / span))
  const mix = (x: number, y: number) => x + (y - x) * k
  const mixColor = (x: number, y: number) => {
    const ca = new THREE.Color(x)
    const cb = new THREE.Color(y)
    return ca.lerp(cb, k).getHex()
  }
  return {
    t,
    zenith: mixColor(a.zenith, b.zenith),
    horizon: mixColor(a.horizon, b.horizon),
    fog: mixColor(a.fog, b.fog),
    sun: mixColor(a.sun, b.sun),
    sunIntensity: mix(a.sunIntensity, b.sunIntensity),
    ambient: mixColor(a.ambient, b.ambient),
    ambientIntensity: mix(a.ambientIntensity, b.ambientIntensity),
    night: mix(a.night, b.night),
  }
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`

const SKY_FRAG = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 sunColor;
  uniform vec3 sunDir;
  uniform vec3 moonDir;
  uniform float night;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 dir = normalize(vDir);
    float up = clamp(dir.y, -1.0, 1.0);

    // gradient: tight near the horizon, broad overhead
    float band = pow(clamp(up * 0.5 + 0.5, 0.0, 1.0), 0.9);
    vec3 col = mix(horizon, zenith, smoothstep(0.48, 0.92, band));
    // a warm lip right on the skyline
    col = mix(col, horizon, pow(1.0 - clamp(abs(up) * 4.0, 0.0, 1.0), 3.0) * 0.6);

    // the sun: a disc with a wide, soft bloom around it
    float sd = max(dot(dir, sunDir), 0.0);
    col += sunColor * pow(sd, 380.0) * 6.0;
    col += sunColor * pow(sd, 8.0) * 0.28;
    col += sunColor * pow(sd, 2.0) * 0.06;

    // the moon: smaller, colder, only worth drawing at night
    float md = max(dot(dir, moonDir), 0.0);
    col += vec3(0.85, 0.9, 1.0) * pow(md, 2200.0) * 5.0 * night;
    col += vec3(0.5, 0.6, 0.85) * pow(md, 24.0) * 0.12 * night;

    // stars, thickening as the light goes
    if (night > 0.01 && up > -0.05) {
      vec3 cell = floor(dir * 260.0);
      float h = hash(cell);
      float star = smoothstep(0.9975, 1.0, h);
      float twinkle = 0.65 + 0.35 * sin(h * 90.0);
      col += vec3(star * twinkle) * night * smoothstep(-0.05, 0.35, up) * 1.4;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`

export interface SkyState {
  /** 0 dawn .. 1 end of night */
  t: number
  night: number
  sunDir: THREE.Vector3
  fogColor: THREE.Color
  /** what the sky looks like near the skyline, for reflections */
  horizon: THREE.Color
  /** the colour of the sunlight itself */
  sunColor: THREE.Color
  /** how brightly windows and lanterns should burn */
  lampLight: number
}

export class Atmosphere {
  readonly sun: THREE.DirectionalLight
  readonly hemi: THREE.HemisphereLight
  readonly ambient: THREE.AmbientLight
  readonly state: SkyState = {
    t: 0.5,
    night: 0,
    sunDir: new THREE.Vector3(0, 1, 0),
    fogColor: new THREE.Color(0xcae3f4),
    horizon: new THREE.Color(0xbfe0f6),
    sunColor: new THREE.Color(0xfff2da),
    lampLight: 0,
  }

  private dome: THREE.Mesh
  private uniforms: Record<string, THREE.IUniform>
  private clouds: THREE.InstancedMesh
  private cloudSeeds: { x: number; y: number; z: number; s: number; drift: number }[] = []
  private scene: THREE.Scene
  private shadowDistance = 120

  constructor(scene: THREE.Scene) {
    this.scene = scene

    this.uniforms = {
      zenith: { value: new THREE.Color(0x2f7ad6) },
      horizon: { value: new THREE.Color(0xbfe0f6) },
      sunColor: { value: new THREE.Color(0xfff2da) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      moonDir: { value: new THREE.Vector3(0, -1, 0) },
      night: { value: 0 },
    }
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 20),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    )
    this.dome.frustumCulled = false
    this.dome.renderOrder = -1000
    scene.add(this.dome)

    this.sun = new THREE.DirectionalLight(0xfff2da, 2)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.6
    scene.add(this.sun)
    scene.add(this.sun.target)

    this.hemi = new THREE.HemisphereLight(0xbfe0f6, 0x4a5136, 0.66)
    scene.add(this.hemi)

    this.ambient = new THREE.AmbientLight(0xa8c4dc, 0.3)
    scene.add(this.ambient)

    scene.fog = new THREE.Fog(0xcae3f4, 90, 620)

    this.clouds = this.makeClouds()
    scene.add(this.clouds)
  }

  private makeClouds(): THREE.InstancedMesh {
    // a cloud is four overlapping lumps; low-poly enough to read as a shape
    const geo = new THREE.IcosahedronGeometry(1, 1)
    // unlit on purpose: a shaded cloud reads as a grey rock in the sky, and
    // the sun colour is mixed into them each frame anyway
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      fog: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
    const COUNT = 96
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT)
    mesh.frustumCulled = false
    mesh.castShadow = false
    mesh.receiveShadow = false
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    let i = 0
    for (let c = 0; c < COUNT / 4; c++) {
      const cx = (Math.random() - 0.5) * 1600
      const cz = (Math.random() - 0.5) * 1600
      const cy = 220 + Math.random() * 130
      const scale = 46 + Math.random() * 64
      const drift = 0.5 + Math.random() * 0.9
      for (let p = 0; p < 4; p++) {
        const ox = (Math.random() - 0.5) * scale * 1.9
        const oy = (Math.random() - 0.5) * scale * 0.35
        const oz = (Math.random() - 0.5) * scale * 1.3
        const s = scale * (0.5 + Math.random() * 0.6)
        this.cloudSeeds.push({ x: cx + ox, y: cy + oy, z: cz + oz, s, drift })
        m.compose(
          new THREE.Vector3(cx + ox, cy + oy, cz + oz),
          q,
          new THREE.Vector3(s, s * 0.55, s * 0.8),
        )
        mesh.setMatrixAt(i++, m)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    return mesh
  }

  setShadowDistance(d: number): void {
    this.shadowDistance = d
    const cam = this.sun.shadow.camera
    cam.left = -d
    cam.right = d
    cam.top = d
    cam.bottom = -d
    cam.near = 1
    cam.far = d * 4
    cam.updateProjectionMatrix()
  }

  setShadowMapSize(size: number): void {
    this.sun.shadow.mapSize.set(size, size)
    this.sun.shadow.map?.dispose()
    this.sun.shadow.map = null
  }

  /**
   * Advance the sky. `tick` is simulation time; `focus` is where the camera is,
   * so the shadow frustum and the sky dome follow the player around.
   */
  update(tick: number, focus: THREE.Vector3, elapsed: number): SkyState {
    const t = timeOfDay(tick)
    const k = lerpKey(t)

    // The sun clears the eastern ridge just after the settlement wakes and is
    // still above the western one at closing time. It used to drop under the
    // horizon while the sky was still orange, which left dusk unplayably dark.
    const p = (t - 0.05) / 0.9
    const altitude = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI) * 1.28 - 0.02
    const azimuth = -1.9 + p * 2.9
    const cosA = Math.cos(altitude)
    const sunDir = new THREE.Vector3(
      cosA * Math.sin(azimuth),
      Math.sin(altitude),
      cosA * Math.cos(azimuth),
    ).normalize()
    const moonDir = sunDir.clone().negate()

    const zenith = new THREE.Color(k.zenith)
    const horizon = new THREE.Color(k.horizon)
    const sunColor = new THREE.Color(k.sun)
    const fog = new THREE.Color(k.fog)

    ;(this.uniforms.zenith.value as THREE.Color).copy(zenith)
    ;(this.uniforms.horizon.value as THREE.Color).copy(horizon)
    ;(this.uniforms.sunColor.value as THREE.Color).copy(sunColor)
    ;(this.uniforms.sunDir.value as THREE.Vector3).copy(sunDir)
    ;(this.uniforms.moonDir.value as THREE.Vector3).copy(moonDir)
    this.uniforms.night.value = k.night

    // during the night the "sun" is the moon: same rig, colder and dimmer
    const lightDir = k.night > 0.55 ? moonDir : sunDir
    this.sun.color.copy(sunColor)
    this.sun.intensity = k.sunIntensity
    this.sun.position.copy(focus).addScaledVector(lightDir, this.shadowDistance * 1.6)
    this.sun.target.position.copy(focus)
    this.sun.target.updateMatrixWorld()

    this.hemi.color.copy(horizon)
    this.hemi.groundColor.set(k.night > 0.5 ? 0x2a3348 : 0x6d7a52)
    this.hemi.intensity = k.ambientIntensity
    this.ambient.color.set(k.ambient)
    this.ambient.intensity = k.ambientIntensity * 0.55

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(fog)
      this.scene.fog.near = 110
      this.scene.fog.far = 520 + (1 - k.night) * 260
    }

    this.dome.position.copy(focus)
    this.clouds.position.set(focus.x, 0, focus.z)
    const cloudMat = this.clouds.material as THREE.MeshBasicMaterial
    cloudMat.color.copy(horizon).lerp(sunColor, 0.35).multiplyScalar(k.night > 0.6 ? 0.5 : 1.05)
    cloudMat.opacity = 0.42 + (1 - k.night) * 0.4
    this.driftClouds(elapsed)

    this.state.t = t
    this.state.night = k.night
    this.state.sunDir.copy(sunDir)
    this.state.fogColor.copy(fog)
    this.state.horizon.copy(horizon)
    this.state.sunColor.copy(sunColor)
    this.state.lampLight = Math.min(1, Math.max(0, (k.night - 0.15) / 0.5))
    return this.state
  }

  private driftClouds(elapsed: number): void {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const v = new THREE.Vector3()
    const s = new THREE.Vector3()
    for (let i = 0; i < this.cloudSeeds.length; i++) {
      const c = this.cloudSeeds[i]
      const x = ((c.x + elapsed * c.drift * 2 + 900) % 1800) - 900
      v.set(x, c.y, c.z)
      s.set(c.s, c.s * 0.55, c.s * 0.8)
      m.compose(v, q, s)
      this.clouds.setMatrixAt(i, m)
    }
    this.clouds.instanceMatrix.needsUpdate = true
  }

  /** Readable clock for the HUD: "06:20", plus a word for the part of day. */
  static clock(tick: number): { time: string; phase: string; day: number } {
    const t = timeOfDay(tick)
    // dawn sits at 05:00 and dusk at 21:00, so the numbers match the light
    const hours24 = (t * 19.2 + 4.8) % 24
    const h = Math.floor(hours24)
    const m = Math.floor((hours24 - h) * 60)
    const phase =
      t < 0.08 ? 'night' :
      t < 0.16 ? 'dawn' :
      t < 0.42 ? 'morning' :
      t < 0.58 ? 'midday' :
      t < 0.8 ? 'afternoon' :
      t < 0.92 ? 'dusk' : 'night'
    return {
      time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      phase,
      day: Math.floor(tick / DAY_LENGTH) + 1,
    }
  }
}

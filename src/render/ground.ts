/**
 * ground — the valley floor and the water in it.
 *
 * The terrain is one flat-shaded mesh with per-facet colours baked from the
 * height function: grass, packed road dirt, ploughed field, shore sand, bare
 * rock and snow, plus enough per-triangle variation that a hillside is not one
 * flat green. Because the colour is in the vertices there are no textures to
 * load and no seams to hide.
 */
import * as THREE from 'three'
import {
  TERRAIN_HALF, WATER_LEVEL, heightAt, slopeAt, surfaceAt, roadStrength, plazaStrength,
} from '../world/terrain'

/** Cell size in metres. Small enough to read as ground, large enough to be cheap. */
const CELL = 2.75

const PALETTE = {
  grass: new THREE.Color('#5f8f43'),
  grassDry: new THREE.Color('#7e9a48'),
  meadow: new THREE.Color('#6da34a'),
  forest: new THREE.Color('#3f6b35'),
  farm: new THREE.Color('#8a6a3e'),
  road: new THREE.Color('#a08b6a'),
  sand: new THREE.Color('#c8b183'),
  marsh: new THREE.Color('#4e7048'),
  rock: new THREE.Color('#7d7a72'),
  rockDark: new THREE.Color('#5e5c58'),
  snow: new THREE.Color('#e8eef2'),
  paving: new THREE.Color('#918b7e'),
  pavingAlt: new THREE.Color('#7b756a'),
}

function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** The colour of the ground at a point, before lighting. */
function groundColor(x: number, z: number, out: THREE.Color): THREE.Color {
  const h = heightAt(x, z)
  const slope = slopeAt(x, z)
  const surface = surfaceAt(x, z, h)

  switch (surface) {
    case 'road': out.copy(PALETTE.road); break
    case 'sand': out.copy(PALETTE.sand); break
    case 'farm': out.copy(PALETTE.farm); break
    case 'marsh': out.copy(PALETTE.marsh); break
    case 'forest': out.copy(PALETTE.forest); break
    case 'meadow': out.copy(PALETTE.meadow); break
    case 'snow': out.copy(PALETTE.snow); break
    case 'rock': out.copy(slope > 0.6 ? PALETTE.rockDark : PALETTE.rock); break
    default: out.copy(PALETTE.grass); break
  }

  // steep ground shows its bones
  if (surface !== 'snow' && surface !== 'road' && slope > 0.34) {
    out.lerp(PALETTE.rock, Math.min(0.85, (slope - 0.34) * 2.4))
  }
  // higher ground goes dry, then bare
  if (h > 22 && surface !== 'snow') out.lerp(PALETTE.rock, Math.min(0.5, (h - 22) / 30))
  if (h > 42) out.lerp(PALETTE.snow, Math.min(0.85, (h - 42) / 14))
  // the verge either side of a road is worn
  const road = roadStrength(x, z)
  if (road > 0 && surface !== 'road') out.lerp(PALETTE.road, road * 0.7)

  // the plaza is laid with stone, in slabs big enough to see
  const plaza = plazaStrength(x, z)
  if (plaza > 0) {
    const slab = hash(Math.floor(x / 4.2), Math.floor(z / 4.2))
    const stone = slab > 0.5 ? PALETTE.paving : PALETTE.pavingAlt
    out.lerp(stone, Math.min(1, plaza * 1.6))
  }

  // and a little noise so no two facets match
  const n = (hash(Math.floor(x * 0.7), Math.floor(z * 0.7)) - 0.5) * 0.13
  out.offsetHSL(n * 0.04, n * 0.12, n)
  return out
}

export interface TerrainMesh {
  mesh: THREE.Mesh
  /** triangle count, for the perf overlay */
  triangles: number
}

export function buildTerrain(): TerrainMesh {
  const cells = Math.ceil((TERRAIN_HALF * 2) / CELL)
  const size = cells * CELL
  const origin = -size / 2

  const heights: Float32Array = new Float32Array((cells + 1) * (cells + 1))
  for (let iz = 0; iz <= cells; iz++) {
    for (let ix = 0; ix <= cells; ix++) {
      heights[iz * (cells + 1) + ix] = heightAt(origin + ix * CELL, origin + iz * CELL)
    }
  }

  const triangles = cells * cells * 2
  const positions = new Float32Array(triangles * 3 * 3)
  const colors = new Float32Array(triangles * 3 * 3)
  const color = new THREE.Color()

  let p = 0
  let c = 0
  const put = (x: number, y: number, z: number) => {
    positions[p++] = x
    positions[p++] = y
    positions[p++] = z
  }
  const putColor = (col: THREE.Color) => {
    for (let i = 0; i < 3; i++) {
      colors[c++] = col.r
      colors[c++] = col.g
      colors[c++] = col.b
    }
  }

  for (let iz = 0; iz < cells; iz++) {
    for (let ix = 0; ix < cells; ix++) {
      const x0 = origin + ix * CELL
      const z0 = origin + iz * CELL
      const x1 = x0 + CELL
      const z1 = z0 + CELL
      const h00 = heights[iz * (cells + 1) + ix]
      const h10 = heights[iz * (cells + 1) + ix + 1]
      const h01 = heights[(iz + 1) * (cells + 1) + ix]
      const h11 = heights[(iz + 1) * (cells + 1) + ix + 1]

      // alternate the diagonal so the tessellation does not read as a weave
      const flip = ((ix + iz) & 1) === 0
      if (flip) {
        put(x0, h00, z0); put(x0, h01, z1); put(x1, h11, z1)
        putColor(groundColor((x0 + x0 + x1) / 3, (z0 + z1 + z1) / 3, color))
        put(x0, h00, z0); put(x1, h11, z1); put(x1, h10, z0)
        putColor(groundColor((x0 + x1 + x1) / 3, (z0 + z1 + z0) / 3, color))
      } else {
        put(x0, h00, z0); put(x0, h01, z1); put(x1, h10, z0)
        putColor(groundColor((x0 + x0 + x1) / 3, (z0 + z1 + z0) / 3, color))
        put(x1, h10, z0); put(x0, h01, z1); put(x1, h11, z1)
        putColor(groundColor((x1 + x0 + x1) / 3, (z0 + z1 + z1) / 3, color))
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  mesh.castShadow = false
  mesh.name = 'terrain'
  return { mesh, triangles }
}

// ---------------------------------------------------------------- water

const WATER_VERT = /* glsl */ `
  uniform float time;
  attribute float depth;
  varying float vDepth;
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vDepth = depth;
    vec3 pos = position;
    // two crossing swells, damped where the water is shallow
    float damp = clamp(depth * 1.6, 0.0, 1.0);
    float w1 = sin(pos.x * 0.09 + time * 0.9) * 0.11;
    float w2 = sin(pos.y * 0.13 - time * 0.7 + pos.x * 0.04) * 0.08;
    pos.z += (w1 + w2) * damp;

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorld = world.xyz;

    // slope of the swell, for a cheap moving normal
    float dx = cos(pos.x * 0.09 + time * 0.9) * 0.09 * 0.11;
    float dy = cos(pos.y * 0.13 - time * 0.7 + pos.x * 0.04) * 0.13 * 0.08;
    vNormal = normalize(vec3(-dx * damp, -dy * damp, 1.0));

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const WATER_FRAG = /* glsl */ `
  uniform vec3 shallowColor;
  uniform vec3 deepColor;
  uniform vec3 skyColor;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform vec3 cameraPosition_;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  uniform float time;
  varying float vDepth;
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec3 n = normalize(vec3(vNormal.x, vNormal.z, vNormal.y));
    vec3 viewDir = normalize(cameraPosition_ - vWorld);

    float shallow = 1.0 - clamp(vDepth / 3.2, 0.0, 1.0);
    vec3 base = mix(deepColor, shallowColor, shallow);

    // fresnel: the water is a mirror at a glance and glass underfoot
    float f = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);
    vec3 col = mix(base, skyColor, clamp(f * 0.85, 0.0, 0.8));

    // a hard little sun glint
    vec3 h = normalize(sunDir + viewDir);
    col += sunColor * pow(max(dot(n, h), 0.0), 90.0) * 1.4;

    // foam where the swell meets the shore
    float edge = 1.0 - smoothstep(0.0, 0.52, vDepth);
    float ripple = sin(vWorld.x * 1.4 + vWorld.z * 1.1 + time * 2.4) * 0.5 + 0.5;
    col = mix(col, vec3(0.95, 0.98, 1.0), edge * (0.35 + ripple * 0.45));

    float alpha = mix(0.72, 0.94, clamp(vDepth * 0.6, 0.0, 1.0));

    float d = length(cameraPosition_ - vWorld);
    float fogAmount = smoothstep(fogNear, fogFar, d);
    col = mix(col, fogColor, fogAmount);

    gl_FragColor = vec4(col, alpha);
  }
`

export class Water {
  readonly mesh: THREE.Mesh
  private uniforms: Record<string, THREE.IUniform>

  constructor() {
    const step = 4.5
    const cells = Math.ceil((TERRAIN_HALF * 2) / step)
    const geo = new THREE.PlaneGeometry(cells * step, cells * step, cells, cells)
    const pos = geo.attributes.position
    const depth = new Float32Array(pos.count)
    for (let i = 0; i < pos.count; i++) {
      // the plane is built in XY and rotated into place, so y here is world z
      const x = pos.getX(i)
      const z = pos.getY(i)
      depth[i] = Math.max(0, WATER_LEVEL - heightAt(x, -z))
    }
    geo.setAttribute('depth', new THREE.BufferAttribute(depth, 1))

    this.uniforms = {
      time: { value: 0 },
      shallowColor: { value: new THREE.Color('#4c9fb5') },
      deepColor: { value: new THREE.Color('#12384f') },
      skyColor: { value: new THREE.Color('#bfe0f6') },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color('#fff2da') },
      cameraPosition_: { value: new THREE.Vector3() },
      fogColor: { value: new THREE.Color('#cae3f4') },
      fogNear: { value: 110 },
      fogFar: { value: 620 },
    }

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })

    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.y = WATER_LEVEL
    this.mesh.renderOrder = 5
    this.mesh.name = 'water'
  }

  update(
    elapsed: number,
    camera: THREE.Vector3,
    sky: { sunDir: THREE.Vector3; fogColor: THREE.Color; night: number },
    fogNear: number,
    fogFar: number,
  ): void {
    this.uniforms.time.value = elapsed
    ;(this.uniforms.cameraPosition_.value as THREE.Vector3).copy(camera)
    ;(this.uniforms.sunDir.value as THREE.Vector3).copy(sky.sunDir)
    ;(this.uniforms.fogColor.value as THREE.Color).copy(sky.fogColor)
    ;(this.uniforms.skyColor.value as THREE.Color).copy(sky.fogColor)
    this.uniforms.fogNear.value = fogNear
    this.uniforms.fogFar.value = fogFar
    const night = sky.night
    ;(this.uniforms.shallowColor.value as THREE.Color)
      .set('#4c9fb5').lerp(new THREE.Color('#16283c'), night)
    ;(this.uniforms.deepColor.value as THREE.Color)
      .set('#12384f').lerp(new THREE.Color('#080f1c'), night)
  }
}

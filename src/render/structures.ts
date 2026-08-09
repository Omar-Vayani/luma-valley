import * as THREE from 'three'
import { CITY_PLACES, type CityPlace, type CityPlaceId } from '../sim/city'

export interface CityStructures {
  group: THREE.Group
  interactionMeshes: THREE.Object3D[]
  lanterns: THREE.PointLight[]
}

const MAT = {
  stone: new THREE.MeshLambertMaterial({ color: '#655f55' }),
  dark: new THREE.MeshLambertMaterial({ color: '#302e2b' }),
  roof: new THREE.MeshLambertMaterial({ color: '#403a36' }),
  wood: new THREE.MeshLambertMaterial({ color: '#5e412c' }),
  amber: new THREE.MeshLambertMaterial({ color: '#ffc15c', emissive: '#a95818', emissiveIntensity: 1.1 }),
  green: new THREE.MeshLambertMaterial({ color: '#354b39' }),
  purple: new THREE.MeshLambertMaterial({ color: '#9854c7', emissive: '#55206f', emissiveIntensity: 0.8 }),
  cloth: new THREE.MeshLambertMaterial({ color: '#7d5035' }),
}

function box(group: THREE.Group, size: [number, number, number], pos: [number, number, number], material: THREE.Material, ry = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...pos)
  mesh.rotation.y = ry
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

function building(group: THREE.Group, x: number, z: number, w: number, d: number, floors: number, entrance: 'n' | 's' | 'e' | 'w'): void {
  const h = floors * 2.6
  box(group, [w, h, d], [x, h / 2, z], MAT.stone)
  box(group, [w + 0.35, 0.55, d + 0.35], [x, h + 0.25, z], MAT.roof)
  const doorPos: [number, number, number] = entrance === 'n' ? [x, 1.05, z - d / 2 - 0.02] : entrance === 's' ? [x, 1.05, z + d / 2 + 0.02] : entrance === 'e' ? [x - w / 2 - 0.02, 1.05, z] : [x + w / 2 + 0.02, 1.05, z]
  box(group, entrance === 'n' || entrance === 's' ? [1.3, 2.1, 0.12] : [0.12, 2.1, 1.3], doorPos, MAT.dark)
}

function labelSprite(place: CityPlace): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 96
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(26,24,22,.9)'; ctx.roundRect(8, 8, 496, 80, 14); ctx.fill()
  ctx.strokeStyle = '#c49b58'; ctx.lineWidth = 3; ctx.stroke()
  ctx.fillStyle = '#fff0cc'; ctx.font = '700 29px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText(place.name, 256, 43)
  ctx.fillStyle = '#d2c4a5'; ctx.font = '19px system-ui, sans-serif'; ctx.fillText(place.purpose, 256, 70)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }))
  sprite.scale.set(6.8, 1.28, 1)
  return sprite
}

function marker(group: THREE.Group, place: CityPlace, interactionMeshes: THREE.Object3D[]): void {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.6, 8), MAT.wood)
  post.position.set(place.pos.x, 1.3, place.pos.z)
  post.userData = { interact: 'place', placeId: place.id }
  group.add(post)
  const label = labelSprite(place)
  label.position.set(place.pos.x, 3.25, place.pos.z)
  label.userData = post.userData
  group.add(label)
  interactionMeshes.push(post, label)
}

function lantern(group: THREE.Group, lanterns: THREE.PointLight[], x: number, z: number): void {
  box(group, [0.12, 2.7, 0.12], [x, 1.35, z], MAT.dark)
  const lamp = box(group, [0.4, 0.55, 0.4], [x, 2.65, z], MAT.amber)
  lamp.castShadow = false
  const light = new THREE.PointLight(0xff9e3d, 1.25, 9, 2)
  light.position.set(x, 2.7, z); group.add(light); lanterns.push(light)
}

function district(group: THREE.Group, place: CityPlace): void {
  const { x, z } = place.pos
  if (place.id === 'market') {
    for (const dx of [-3, 0, 3]) { box(group, [2.3, .75, 1.4], [x + dx, .38, z + 2], MAT.wood); box(group, [2.6, .12, 1.8], [x + dx, 2.1, z + 2], MAT.cloth); box(group, [.55, .35, .35], [x + dx, .95, z + 2], MAT.amber) }
  } else if (place.id === 'tavern') {
    building(group, x, z + 2, 7, 5, 2, 'n')
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.65, .65, 1.2, 12), MAT.wood); barrel.rotation.z = Math.PI / 2; barrel.position.set(x - 2.5, .65, z - 1); group.add(barrel)
    box(group, [1.8, 1.1, .12], [x + 2.2, 2.5, z - .55], MAT.dark)
    // cigarette pictogram: pale stem and ember, clearly a warning-style trade sign.
    box(group, [1.05, .12, .12], [x + 2.2, 2.55, z - .64], new THREE.MeshLambertMaterial({ color: '#d9d1bd' }), .18)
  } else if (place.id === 'park') {
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 1, 16), MAT.stone); well.position.set(x, .5, z); group.add(well)
    box(group, [3.3, .25, .7], [x + 3, .7, z + 2], MAT.wood)
    for (const [dx, dz] of [[-3, -2], [3, -2], [-3, 3]] as const) { const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.3, .45, 2.5, 7), MAT.wood); trunk.position.set(x + dx, 1.25, z + dz); group.add(trunk); const crown = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.8, 8), MAT.green); crown.position.set(x + dx, 3.3, z + dz); group.add(crown) }
  } else if (place.id === 'apothecary') {
    building(group, x + 1, z + 1, 6, 5, 2, 'n')
    box(group, [.55, 2, .18], [x - 1.2, 3.2, z - 1.55], MAT.green); box(group, [2, .55, .18], [x - 1.2, 3.2, z - 1.55], MAT.green)
    for (const dx of [-2, -1.2, -.4]) { const bottle = new THREE.Mesh(new THREE.CylinderGeometry(.15, .22, .65, 8), MAT.amber); bottle.position.set(x + dx, .35, z - 2); group.add(bottle) }
  } else if (place.id === 'homes') {
    for (const [dx, floors] of [[-4, 2], [0, 3], [4, 2]] as const) { building(group, x + dx, z + 2, 3.4, 5, floors, 'n'); box(group, [2.1, .4, 1], [x + dx, .35, z - 1.2], MAT.wood) }
  } else if (place.id === 'watch') {
    building(group, x + 4, z + 2, 4, 4, 3, 'n')
    const brazier = new THREE.Mesh(new THREE.CylinderGeometry(.65, .45, .7, 8), MAT.dark); brazier.position.set(x - 2.2, .5, z); group.add(brazier)
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.35, 1.1, 8), MAT.amber); flame.position.set(x - 2.2, 1.3, z); group.add(flame)
    for (const dx of [-2, 0, 2]) box(group, [.18, 2.2, .18], [x + dx, 1.1, z + 3], MAT.wood)
  } else {
    box(group, [6, 4.2, 1], [x - 2, 2.1, z + 2.5], MAT.dark, -.15)
    const contraband = new THREE.Mesh(new THREE.OctahedronGeometry(.8, 0), MAT.purple); contraband.position.set(x, 1.15, z); contraband.userData = { interact: 'place', placeId: place.id }; group.add(contraband)
  }
}

export function buildCityStructures(): CityStructures {
  const group = new THREE.Group()
  const interactionMeshes: THREE.Object3D[] = []
  const lanterns: THREE.PointLight[] = []
  for (const place of CITY_PLACES) { district(group, place); marker(group, place, interactionMeshes) }
  for (const [x, z] of [[-8, 8], [8, 8], [-8, -8], [8, -8], [0, 29], [29, 0], [-29, 0]] as const) lantern(group, lanterns, x, z)
  return { group, interactionMeshes, lanterns }
}

export function cityPlaceById(id: string): CityPlace | undefined {
  return CITY_PLACES.find((place) => place.id === id as CityPlaceId)
}

/** Flat terrain compatibility for older callers. */
export function groundY(_world: { height: (x: number, z: number) => number }, _x: number, _z: number): number { return 0 }

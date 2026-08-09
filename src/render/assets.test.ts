import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { cleanModelStem, collapseStaticModel, hasRenderableGeometry, natureModelUrls, normalizeModel } from './assets'

describe('model asset safeguards', () => {
  it('never doubles an OBJ extension and pairs the same MTL variant', () => {
    expect(cleanModelStem('PineTree_1.obj')).toBe('PineTree_1')
    expect(natureModelUrls('PineTree_1.obj')).toEqual({
      obj: '/models/nature/PineTree_1.obj',
      mtl: '/models/nature/PineTree_1.mtl',
    })
  })

  it('rejects empty groups and normalizes visible geometry to feet at zero', () => {
    expect(hasRenderableGeometry(new THREE.Group())).toBe(false)
    const group = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2))
    mesh.position.set(4, 5, -3)
    group.add(mesh)
    expect(hasRenderableGeometry(group)).toBe(true)
    normalizeModel(group, 1.8)
    const bounds = new THREE.Box3().setFromObject(group)
    expect(bounds.min.y).toBeCloseTo(0)
    expect(bounds.max.y).toBeCloseTo(1.8)
    expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0)
    expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(0)
  })

  it('collapses repeated static scenery into one vertex-coloured draw mesh', () => {
    const group = new THREE.Group()
    const red = new THREE.MeshLambertMaterial({ color: 0xff5544 })
    const blue = new THREE.MeshLambertMaterial({ color: 0x4488ff })
    const left = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red)
    left.position.x = -1
    const right = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 6), blue)
    right.position.x = 1
    group.add(left, right)
    const collapsed = collapseStaticModel(group)
    const meshes: THREE.Mesh[] = []
    collapsed.traverse((object) => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh) })
    expect(meshes).toHaveLength(1)
    expect(meshes[0].geometry.getAttribute('color')).toBeDefined()
    expect(meshes[0].geometry.getAttribute('position').count).toBeGreaterThan(30)
  })
})

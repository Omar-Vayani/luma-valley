/**
 * engine — renderer, camera, and the post chain everything is drawn through.
 *
 * The look we are after is stylised low-poly: flat-shaded geometry, saturated
 * but not cartoon colours, soft shadows, a little bloom on the warm things,
 * and a tone curve that keeps the sky from clipping. All of that is cheap;
 * the quality presets mostly trade shadow resolution and draw distance.
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { QUALITY, type QualityPreset, type QualityProfile } from './quality'

/**
 * A warm filmic grade with a vignette. Subtle — the job is to stop the flat
 * shading from looking like a CAD viewport, not to make it look like a filter.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    warmth: { value: 0.05 },
    contrast: { value: 1.04 },
    saturation: { value: 1.14 },
    vignette: { value: 0.42 },
    lift: { value: 0.018 },
    night: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float warmth;
    uniform float contrast;
    uniform float saturation;
    uniform float vignette;
    uniform float night;
    uniform float lift;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = texel.rgb;

      // gentle S-curve, with the blacks lifted off zero so shadowed geometry
      // still shows its shape
      c = (c - 0.5) * contrast + 0.5;
      c = c * (1.0 - lift) + lift;

      // push warmth into the highlights, cool the shadows a touch
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c.r += warmth * luma;
      c.b -= warmth * luma * 0.6;
      c.b += 0.04 * (1.0 - luma);

      // at night, drain colour the way eyes do
      float sat = mix(saturation, 0.72, night);
      c = mix(vec3(luma), c, sat);

      // vignette
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * vignette;
      c *= v;

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), texel.a);
    }
  `,
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly canvas: HTMLCanvasElement

  private composer: EffectComposer | null = null
  private bloomPass: UnrealBloomPass | null = null
  private gradePass: ShaderPass | null = null
  private renderPass: RenderPass | null = null
  private profile: QualityProfile = QUALITY.high
  private width = 1
  private height = 1

  /** Set by the atmosphere each frame; drives the grade's night handling. */
  nightAmount = 0

  constructor(container: HTMLElement, quality: QualityPreset = 'high') {
    this.canvas = document.createElement('canvas')
    this.canvas.style.display = 'block'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    container.appendChild(this.canvas)

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.06
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    // every post pass calls render() again, and each call would zero the
    // counters; reset once a frame so the overlay reports the whole frame
    this.renderer.info.autoReset = false

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1400)
    this.camera.rotation.order = 'YXZ'

    this.setQuality(quality)
  }

  get quality(): QualityProfile {
    return this.profile
  }

  setQuality(preset: QualityPreset): void {
    this.profile = QUALITY[preset] ?? QUALITY.medium
    const p = this.profile
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatio))

    const shadowsChanged = this.renderer.shadowMap.enabled !== p.shadows
    this.renderer.shadowMap.enabled = p.shadows
    if (shadowsChanged) this.recompileMaterials()

    this.buildComposer()
    this.resize(this.width, this.height)
  }

  /**
   * Turning the shadow map on or off changes the defines every material was
   * compiled with, and three.js will not notice on its own — the programs stay
   * as they were and some of them stop drawing anything at all. Dropping the
   * graphics setting used to make the walls and roofs of every building
   * vanish, which is a strange enough symptom to be worth the note.
   */
  private recompileMaterials(): void {
    this.scene.traverse((object) => {
      const material = (object as THREE.Mesh).material
      if (!material) return
      if (Array.isArray(material)) for (const m of material) m.needsUpdate = true
      else material.needsUpdate = true
    })
  }

  private buildComposer(): void {
    this.composer?.dispose()
    const p = this.profile
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: p.msaa,
      colorSpace: THREE.LinearSRGBColorSpace,
    })
    const composer = new EffectComposer(this.renderer, target)
    this.renderPass = new RenderPass(this.scene, this.camera)
    composer.addPass(this.renderPass)

    if (p.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), p.bloomStrength, 0.7, 0.82)
      composer.addPass(this.bloomPass)
    } else {
      this.bloomPass = null
    }

    if (p.grade) {
      this.gradePass = new ShaderPass(GradeShader)
      composer.addPass(this.gradePass)
    } else {
      this.gradePass = null
    }

    composer.addPass(new OutputPass())
    this.composer = composer
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.width, this.height, false)
    this.composer?.setSize(this.width, this.height)
    this.bloomPass?.setSize(this.width, this.height)
  }

  /** Field of view, animated for sprinting. */
  setFov(fov: number): void {
    if (Math.abs(this.camera.fov - fov) < 0.01) return
    this.camera.fov = fov
    this.camera.updateProjectionMatrix()
  }

  render(): void {
    this.renderer.info.reset()
    if (this.gradePass) {
      this.gradePass.uniforms.night.value = this.nightAmount
    }
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.composer?.dispose()
    this.renderer.dispose()
    this.canvas.remove()
  }
}

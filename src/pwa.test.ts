// Config test for the installable PWA shell. Reads the REAL artifacts
// (manifest, service worker, icons, index.html, main.tsx) and asserts the
// installability contract and the dev/HMR safety guarantees.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

interface Manifest {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  theme_color: string
  background_color: string
  icons: ManifestIcon[]
}

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as Manifest
const sw = readFileSync('public/sw.js', 'utf8')
const html = readFileSync('index.html', 'utf8')
const main = readFileSync('src/main.tsx', 'utf8')

describe('PWA manifest', () => {
  it('is valid JSON with the required installability fields', () => {
    expect(manifest.name.length).toBeGreaterThan(0)
    expect(manifest.short_name.length).toBeGreaterThan(0)
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
    expect(manifest.start_url).toBeTruthy()
    expect(manifest.scope).toBeTruthy()
    expect(manifest.display).toBe('standalone')
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('keeps start_url inside scope', () => {
    const base = new URL('https://luma.example/manifest.webmanifest')
    const start = new URL(manifest.start_url, base)
    const scope = new URL(manifest.scope, base)
    expect(start.pathname.startsWith(scope.pathname)).toBe(true)
  })

  it('matches the game palette (theme + world background)', () => {
    expect(manifest.theme_color.toLowerCase()).toBe('#30271f') // existing meta theme-color
    expect(manifest.background_color.toLowerCase()).toBe('#79766e') // world DAY sky color
  })

  it('declares 192/512 "any" icons plus a maskable 512', () => {
    const sizes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose ?? 'any'}`)
    expect(sizes).toContain('192x192:any')
    expect(sizes).toContain('512x512:any')
    expect(sizes).toContain('512x512:maskable')
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png')
      const path = icon.src.replace(/^\.\//, 'public/')
      expect(readFileSync(path).length).toBeGreaterThan(0)
    }
  })
})

describe('PWA icons', () => {
  it('are real RGBA PNGs at the declared sizes', () => {
    const cases: Array<[string, number]> = [
      ['public/icons/icon-192.png', 192],
      ['public/icons/icon-512.png', 512],
      ['public/icons/maskable-512.png', 512],
    ]
    for (const [path, size] of cases) {
      const bytes = readFileSync(path)
      const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      for (let i = 0; i < magic.length; i++) expect(bytes[i]).toBe(magic[i])
      const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]
      const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
      expect(width).toBe(size)
      expect(height).toBe(size)
      expect(bytes[25]).toBe(6) // color type RGBA
    }
  })
})

describe('service worker', () => {
  it('precaches the shell and discovers hashed entry assets', () => {
    expect(sw).toContain('luma-shell-')
    expect(sw).toContain('cache.addAll')
    expect(sw).toContain('manifest.webmanifest')
    expect(sw).toContain('assets')
  })

  it('uses network-first for navigations and cache-first for assets', () => {
    expect(sw).toContain("request.mode === 'navigate'")
    expect(sw).toContain('networkFirst')
    expect(sw).toContain('cacheFirst')
  })

  it('never caches dev/HMR, cross-origin, or non-GET traffic', () => {
    expect(sw).toContain('IS_DEV_ORIGIN')
    expect(sw).toContain('localhost')
    expect(sw).toContain('127.0.0.1')
    expect(sw).toContain('@vite')
    expect(sw).toContain('node_modules')
    expect(sw).toContain("request.method !== 'GET'")
    expect(sw).toContain('url.origin !== self.location.origin')
  })

  it('cleans up old cache versions on activation', () => {
    expect(sw).toContain('caches.delete(key)')
    expect(sw).toContain('clients.claim')
    expect(sw).toContain('skipWaiting')
  })
})

describe('index.html', () => {
  it('links the manifest and touch icon for installability', () => {
    expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest" />')
    expect(html).toContain('apple-touch-icon')
  })

  it('declares a safe-area-aware viewport and matching theme color', () => {
    expect(html).toContain('viewport-fit=cover')
    expect(html).toContain('<meta name="theme-color" content="#30271f" />')
  })
})

describe('main.tsx registration', () => {
  it('registers the worker only in production, never in dev', () => {
    expect(main).toContain('import.meta.env.PROD')
    expect(main).toContain("'serviceWorker' in navigator")
    expect(main).toContain('register(')
  })
})

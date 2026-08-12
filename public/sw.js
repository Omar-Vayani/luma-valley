/* Luma Haven service worker (dependency-free, no build step).
 *
 * Registered ONLY from production builds (src/main.tsx guards with
 * import.meta.env.PROD), so Vite dev/HMR traffic never touches this worker.
 * The dev-origin guards below make even an accidental manual registration
 * in dev harmless: nothing is cached and all requests pass straight through.
 *
 * Strategy:
 *   - install: precache the app shell (index.html, manifest, icons) and the
 *     hashed JS/CSS entry assets referenced by the built index.html, so the
 *     exact shell for this build is available offline without hard-coding
 *     content hashes that change on every build.
 *   - navigation: network-first, falling back to the cached shell offline.
 *   - same-origin GET assets: cache-first with a bounded runtime cache
 *     (3D models/textures are cached on demand; nothing cross-origin).
 *   - never cache dev-server URLs, cross-origin requests, or non-GET methods.
 */

const VERSION = 'v4'
const SHELL_CACHE = `luma-shell-${VERSION}`
const RUNTIME_CACHE = `luma-runtime-${VERSION}`
const KEEP_CACHES = [SHELL_CACHE, RUNTIME_CACHE]

const SHELL_URLS = [
  './',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
]

// Vite dev-server artifacts that must never enter a cache.
const DEV_URL_PATTERNS = [
  /\/@vite\//,
  /\/@fs\//,
  /\/node_modules\//,
  /\/@react-refresh/,
  /\.hot-update\./,
  /[?&]t=\d+/,
]

const isDevUrl = (url) => DEV_URL_PATTERNS.some((re) => re.test(url))

// Hard safety valve: never cache anything when running on a dev origin.
const IS_DEV_ORIGIN = ['localhost', '127.0.0.1'].includes(self.location.hostname)

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE)
  await cache.addAll(SHELL_URLS)
  // The built index.html references hashed entry assets (./assets/index-*.js);
  // discover and precache them so the shell works fully offline.
  const response = await fetch('./', { cache: 'no-store' })
  if (!response.ok) return
  const html = await response.text()
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((url) =>
      url &&
      !url.startsWith('#') &&
      !url.startsWith('data:') &&
      !url.startsWith('http') &&
      !isDevUrl(url),
    )
  await Promise.allSettled(assetUrls.map(async (url) => {
    try {
      await cache.add(url)
    } catch {
      // A missing optional asset must not fail the whole install.
    }
  }))
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
  if (IS_DEV_ORIGIN) return
  event.waitUntil(precacheShell().catch(() => { /* install may still succeed */ }))
})

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    const shell = await caches.match('./')
    return shell ?? new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (response.ok && contentLength < 32 * 1024 * 1024) {
      const cache = await caches.open(RUNTIME_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  if (IS_DEV_ORIGIN) return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isDevUrl(url.href)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }
  event.respondWith(cacheFirst(request))
})

async function trimRuntimeCache(limit = 400) {
  const cache = await caches.open(RUNTIME_CACHE)
  const keys = await cache.keys()
  if (keys.length > limit) {
    await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)))
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set(KEEP_CACHES)
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)))
    if (!IS_DEV_ORIGIN) await trimRuntimeCache()
    await self.clients.claim()
  })())
})

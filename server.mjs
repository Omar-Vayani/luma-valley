/**
 * A tiny static server for the built game, with no dependencies at all.
 *
 * Hosts that only know `npm start` can serve Luma Haven with this: it needs
 * nothing but Node, so `npm ci --omit=dev` is enough to run a built copy.
 *
 *   npm run build && npm start
 *   PORT=8080 HOST=0.0.0.0 node server.mjs
 *
 * It serves ./dist, falls back to index.html so deep links work, caches the
 * hashed assets hard and the shell not at all — which is what lets a redeploy
 * actually reach people who already have the app installed.
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(process.env.STATIC_DIR ?? path.join(here, 'dist'))
const port = Number(process.env.PORT ?? 4173)
const host = process.env.HOST ?? '0.0.0.0'

if (!existsSync(path.join(root, 'index.html'))) {
  console.error(`No build found in ${root}. Run "npm run build" first.`)
  process.exit(1)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/**
 * Vite fingerprints the files it builds, so those can be cached forever. The
 * shell and the service worker must not be, or an update never arrives.
 */
function cacheHeaderFor(pathname) {
  if (pathname === '/sw.js' || pathname.endsWith('.webmanifest')) return 'no-cache'
  if (pathname === '/' || pathname.endsWith('.html')) return 'no-cache'
  if (pathname.includes('/assets/')) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}

/** Keep requests inside the build directory, whatever the URL claims. */
function resolveSafely(pathname) {
  const decoded = decodeURIComponent(pathname.split('?')[0])
  const candidate = path.resolve(path.join(root, decoded))
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null
  return candidate
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end('method not allowed')
    return
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  let filePath = resolveSafely(url.pathname)
  if (!filePath) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }

  // a single-page app: anything that is not a file is the app itself
  if (!existsSync(filePath)) {
    if (path.extname(url.pathname)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('not found')
      return
    }
    filePath = path.join(root, 'index.html')
  }

  const type = TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const headers = {
    'content-type': type,
    'cache-control': cacheHeaderFor(url.pathname),
    'x-content-type-options': 'nosniff',
  }

  if (req.method === 'HEAD') {
    res.writeHead(200, { ...headers, 'content-length': statSync(filePath).size })
    res.end()
    return
  }

  // small files go out in one piece; anything larger streams
  const size = statSync(filePath).size
  if (size < 64 * 1024) {
    res.writeHead(200, headers)
    res.end(await readFile(filePath))
    return
  }
  res.writeHead(200, headers)
  createReadStream(filePath).pipe(res)
})

server.listen(port, host, () => {
  console.log(`Luma Haven is being served from ${root}`)
  console.log(`  http://localhost:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}

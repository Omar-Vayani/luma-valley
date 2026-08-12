# Hosting Luma Haven

The game is a **static browser bundle**. There is no backend, no database, no
API keys, and nothing to configure — it runs entirely in the visitor's browser
and keeps saves in their own local storage. Anything that can serve files can
host it.

## Build

```bash
npm ci
npm run build      # type-checks, then writes ./dist
```

`dist/` is the whole site. Node 20 or newer is needed to build; nothing is
needed to run it beyond a file server.

## Serve it

### A static host (simplest)

Upload `dist/` and point the host at it. Two requirements:

1. **Rewrite unknown paths to `/index.html`** — it is a single-page app.
   A Netlify config doing exactly this is already in [`netlify.toml`](netlify.toml).
2. **Do not cache `index.html`, `sw.js`, or `manifest.webmanifest`.**
   Everything under `/assets/` is content-hashed and can be cached forever.
   Getting this wrong means visitors keep an old build after a deploy.

The build uses relative asset paths, so it works at a domain root *or* in a
subdirectory (`https://example.com/haven/`) with no changes.

### A Node server

```bash
npm run build
npm start          # PORT=4173 HOST=0.0.0.0 by default
```

`server.mjs` uses only the Node standard library — no dependencies, not even in
production. It handles the SPA fallback, MIME types, and the caching rules
above. Override with `PORT`, `HOST`, or `STATIC_DIR`.

```bash
PORT=8080 npm start
```

### Docker

```bash
docker build -t luma-haven .
docker run -p 4173:4173 luma-haven
```

The runtime image is `node:22-alpine` plus `dist/` and `server.mjs`, running as
the `node` user with a health check on `/`.

### GitHub Pages

Already wired: [`.github/workflows/pages.yml`](.github/workflows/pages.yml)
builds on every push to `main`. **Publishing needs one owner click** (the
Actions token cannot turn Pages on for you):

1. Open **Settings → Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Re-run **Publish Luma Haven**, or push to `main`

Until that is done, the workflow still runs tests and produces a build; it
just skips the deploy step instead of failing.

## After a deploy

Visitors who have used the game before have a service worker installed. It is
network-first for the page itself, so a new build reaches them on their next
visit — provided the host is not caching `index.html` or `sw.js`. The cache
name is versioned in [`public/sw.js`](public/sw.js); bump `VERSION` there if you
ever need to force every client to discard its cached assets.

## Checking a deployment

```bash
LUMA_URL=https://your-host.example/ npm run verify:hud
```

That drives a real browser against the deployed URL and fails if any control is
missing, collapsed, or covered by something else. It needs the dev dependencies
and a Chrome binary (set `CHROME_PATH` if it is not at
`/usr/local/bin/google-chrome`).

A quick manual check, in order: the controls card appears on a first visit, the
world renders, pressing **H** lists what people are talking about, and pressing
**T** gets a reply from a neighbour.

## What it does not need

- No environment variables, secrets, or accounts
- No outbound network access — the optional dialogue service is off by default
  and blank; players opt in and supply their own endpoint
- No sticky sessions or shared state: every visitor's world is their own, held
  in their browser
- No WebSocket or long-lived connections

## Sizes

The bundle is roughly 1.8 MB of JavaScript (about 470 KB gzipped), dominated by
Three.js and TensorFlow.js, plus a few small icons. Serve it compressed if the
host makes that easy.

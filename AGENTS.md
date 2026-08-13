# Luma Haven — notes for agents

A browser game: Vite + React 19 + three.js + TypeScript, no backend. Standard
commands are in `package.json` and described in [`README.md`](README.md).
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains the layering.

## Cursor Cloud specific instructions

### Running it

`npm run dev` serves on port 5173. If something is already holding that port
Vite silently moves to 5174 and the playtest, which defaults to
`http://127.0.0.1:5173/`, will fail with `ERR_CONNECTION_REFUSED` — check the
port Vite actually printed, or pass `LUMA_URL`.

### Testing it

- `npm test` covers the simulation, the creature rig and the audio rules. It is
  fast (a few seconds) because `src/sim` has no three.js in it and can run a
  fifteen-minute day in about two seconds. Prefer adding coverage there.
- `npm run playtest` is the end-to-end check and needs the dev server up. It
  drives the real page through `window.luma` (exposed by `App.tsx`), which
  holds the same `Sim` and `WorldView` the player is using.

### Rendering in this VM

There is no GPU here: Chrome falls back to swiftshader and renders on the CPU.

- At the default `high` preset the page runs at roughly **one frame a second**.
  Anything that involves holding a key down, or waiting for the simulation to
  advance, will appear broken because the loop is barely turning — the sim is
  stepped from the render frame.
- Call `window.luma.view.setQuality('low')` after load before doing anything
  timing-dependent. That gets it to 10–15 fps, which is enough. The playtest
  does this already; override with `PLAYTEST_QUALITY`.
- Do not read performance numbers from this VM as if they meant anything about
  a real machine.

### Screenshots

`node scripts/playtest.mjs --shots DIR` writes screenshots as it goes, which is
usually easier than driving the browser by hand. Chrome is at
`/usr/local/bin/google-chrome`; the launch flags the scripts already use
(`--use-angle=swiftshader --enable-unsafe-swiftshader`) are required.

Clear `localStorage` before taking any screenshot or running any playtest. The
game autosaves the world and the chat log, so a stale save from an earlier run
will quietly change what you are looking at.

### Two traps worth knowing about

**Changing the graphics preset needs materials recompiled.** Toggling
`renderer.shadowMap.enabled` changes the defines every material was built with,
and three.js will not notice on its own. `Engine.setQuality` handles it; if you
add another renderer-level toggle, remember that the symptom is not a subtle
one — whole walls and roofs stop drawing.

**`mergeGeometries` returns null rather than throwing** when the buffers do not
have matching attributes, which happens as soon as an extruded shape shares a
material with a pile of boxes. `mergeByMaterial` in `src/render/buildings.ts`
falls back to unmerged meshes rather than dropping the bucket; do not
"simplify" that away.

### Where the game is described

The village exists once, in `src/sim/village.ts`. Both the meshes and the
collision grid are generated from it. If you add a building or a prop, add it
there and both will follow — placing geometry directly in `src/render` is how
you get something you can see but walk through, or a doorway nothing fits down.
Loose props go through the `put()` guard in `buildVillage`, which refuses to
site anything in a doorway approach.

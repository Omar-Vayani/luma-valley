# Playing Luma Haven

Three ways in, easiest first. You need [Node.js](https://nodejs.org) 20 or newer
for the first two; nothing else, and no account.

## 1. Just play it

```bash
npm install
npm run play
```

Open the address it prints (usually <http://localhost:4173>). That is the real
build — the same files that would go on a web server.

`npm run play` also serves on your local network, so the address ending in your
machine's LAN IP works from a phone or tablet on the same Wi‑Fi.

## 2. Play while changing things

```bash
npm install
npm run dev
```

Same game at <http://localhost:5173>, but edits to the code appear immediately.
Handy URLs:

| URL | What it does |
|---|---|
| `?fresh=1` | start a brand new Haven, ignoring the saved one |
| `?seed=1234` | generate a specific world |

## 3. Put it on the web

The repository ships a workflow that publishes the game to GitHub Pages.

1. On GitHub, open **Settings → Pages**.
2. Under **Source**, choose **GitHub Actions**.
3. Push to `main` (or run the "Publish Luma Haven" workflow by hand).

You will get a link like `https://<you>.github.io/luma-valley/` that works on
any device. The game is a PWA: open that link on a phone, choose "Add to home
screen", and it runs offline afterwards.

## Your first ten minutes

You wake in the plaza with two loaves, some water, a trinket, and a few coins.
Somebody is standing nearby.

1. **Say hello.** Press **T**, type `hello`, press Enter. Then try
   `how are you feeling?` — the answer depends on whether they are hungry,
   frightened, or in love.
2. **Ask to buy something.** `can i buy bread` — the price depends on how much
   they need it, how wealthy they are, and what they think of you. Being
   refused is a normal outcome.
3. **Give something away.** Walk up to a hungry Luma and press 🤝 next to the
   bread. They will eat it and remember you did that.
4. **Ask why.** Press **I** to open the mind inspector on the nearest Luma:
   what they need, what they are choosing between, who they trust, what they
   believe, and the events that shaped them.
5. **Read the town.** Press **H**. Haven tells you what people are talking
   about, each line with the reason behind it, plus norms, work roles, and
   shortages with the name of whoever is missing.
6. **Leave and come back.** The world autosaves. Next time you open **H** it
   summarises what changed while you were away.

## Controls

| Input | Action |
|---|---|
| **W A S D** | walk |
| **🔒 button** | capture the mouse for looking (desktop) |
| left / right half of the screen | move / look (touch) |
| click a Luma | select them |
| **T** | talk |
| **I** | inspect the nearest (or selected) Luma |
| **H** | Haven: stories, norms, work, shortages |
| **M** | market prices |
| **G** | settings and saves |
| **?** | controls card |
| **Space** | pause · **1 2 3** speed · **Esc** close panels |
| **F3** | performance overlay |
| 🤝 ⤵️ | hand an item over · drop it |
| 😴 🚪 🫳 📦 | appear when a bed, door, or chest is in reach |

## Saves

Autosaves to the browser every twenty seconds, with a backup in case a save is
interrupted. In **settings** there are three manual slots plus **export to a
file** and **import a file** — that is how you move a world to another machine.

Different browsers keep separate worlds. Clearing site data deletes them, so
export anything you want to keep.

## If something looks wrong

- **Everything is dark / nothing renders** — your browser needs WebGL. Chrome,
  Edge, Firefox and Safari all support it; a very old integrated GPU with
  hardware acceleration turned off may not.
- **It feels heavy** — press **G** and drop quality to *low*, or lower the
  population cap. **F3** shows where the time is going.
- **You want a clean start** — add `?fresh=1` to the URL.

## Tuning it for your machine

```bash
npm run bench                       # simulation cost at several populations
npm run bench -- --pops 8,16,32     # widen the sweep
```

The defaults (medium, 16 Luma) are chosen so the simulation stays well under a
sixtieth of a second per frame, leaving the rest for drawing.

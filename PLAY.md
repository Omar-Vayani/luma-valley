# Playing Luma Haven

You need [Node.js](https://nodejs.org) 20 or newer. Nothing else, and no account.

## Start it

```bash
npm install
npm run play
```

Open the address it prints, usually <http://localhost:4173>. That is the real
build — the same files that would go on a web server. It also serves on your
local network, so the address ending in your machine's LAN IP works from a
phone or tablet on the same Wi-Fi.

While you are changing things:

```bash
npm run dev        # hot reload, http://localhost:5173
```

Add `?fresh=1` to the address to start a new valley and throw away the save.

## The first ten minutes

**Click once** to take the mouse. Escape gives it back.

1. **Walk down into Haven.** You start on the South Road above the settlement.
   Sprint with Shift. The place name in the top-left changes as you cross into
   somewhere new.

2. **Read the notice board** in the plaza — the wooden frame beside the well, or
   just press **R**. Everything on it was read off the settlement a moment ago:
   somebody is genuinely hungry, a shelf is genuinely empty. Take one.

3. **Pick some berries.** The hedges around the edge of the basin are berry
   bushes. Point at one and *hold* **E** — the crosshair fills while you work.
   Grain grows in the western fields, herbs in the woods, fallen wood in the
   Northwood, stone in the rocky ground, fish in the lake shallows.

4. **Bake something.** Press **Tab**, then Crafting. Two grain make a loaf, but
   only at a hearth — the Commons Hall, the tavern, Market Row or a cottage.
   Remedies need the apothecary. Lanterns need the smithy.

5. **Give it to somebody.** Look at a Luma and **left click** with the loaf in
   your hand. They will remember it. If they were the one who asked, that closes
   the request and Haven thinks a little better of you.

6. **Trade.** Point at a shop counter and press **E**. You buy at the same
   prices the Luma pay and sell into that building's till, which can be empty.

7. **Talk.** Look at someone and press **E**. Type in ordinary language: greet
   them, ask how they are, ask where the bread is, warn them about somebody,
   offer help. They answer out of what they actually know and feel, and they can
   refuse you or lie to you. (Typing is typing — the keys do not move you.)

8. **Ask why.** Still looking at them, press **I**. That is the state their last
   decision came out of: needs, the scores the utility function produced, their
   beliefs and how sure they are, who they trust.

9. **Walk out of the valley.** There are sixteen places with a story attached.
   The Founders' Stones on the western plateau, the Burned Beacon on the hill
   south-west, the Old Bridge over the Coldrun, a sunken boat in Mirror Lake.
   Getting close writes each one into your journal (**J**).

10. **Stay out after dark.** The shops shut, the windows light, the lamps come
   on, and the Luma go home. A day is about three and a half minutes.

## Controls

| Input | Action |
|---|---|
| W A S D | Move |
| Mouse | Look |
| Shift | Sprint |
| Space | Jump |
| Ctrl or C | Crouch |
| E | Interact. Hold it for chopping, mining and fishing |
| Left click | Give what you hold to whoever you look at. Empty-handed it is a hand on their shoulder; with a stick it is a stick |
| Right click | Set a lantern, fence post or stone marker down |
| Q | Drop what you are holding |
| 1–9 or scroll | Choose a hotbar slot |
| Tab | Pack and crafting |
| R | Notice board |
| J | Journal |
| H | Haven — chronicle, norms, work, trade |
| I | Mind of whoever you are looking at |
| M | Map |
| O | Settings |
| P | Pause · `,` and `.` for speed |
| F3 | Performance overlay |
| Esc | Close anything, or release the mouse |

## Making it run well

Settings (**O**) has four quality presets. **High** is the default and is aimed
at a gaming laptop; **medium** will hold sixty frames on most integrated
graphics; **low** turns off shadows and post-processing. The population cap and
how many minds get a full re-think per tick are in there too — those cost CPU
rather than GPU.

If the frame rate is fine but the settlement feels sluggish, raise *minds per
tick*. If the frame rate is poor, drop the quality preset first.

## Saves

The world autosaves to your browser every twenty seconds, with a one-deep
backup, plus three manual slots and export/import to a `.luma.json` file
(Settings). Your own progress — what you have found, made and been thanked for —
is saved alongside it.

Nothing leaves your machine. There is no server.

## If something looks wrong

- **Everything is black on load.** Give it a moment: the valley builds its
  terrain and loads its models before it starts.
- **The mouse will not lock.** Click the world once. Some browsers refuse
  pointer lock until you have interacted with the page.
- **It runs slowly.** Settings → quality → medium or low. Then check F3: if
  *sim* is the large number rather than *frame*, lower the population cap.
- **You want to start over.** Add `?fresh=1` to the address.

# Luma Haven — Design Direction

**Direction:** stylised low-poly. Flat-shaded, untextured, saturated but not
cartoon. A valley that looks made rather than generated, warm at midday and
legible at midnight.

## The rules that keep it coherent

1. **No textures anywhere.** Every surface is a flat-shaded material or a vertex
   colour. It means the loaded nature models and the generated buildings belong
   to the same world, and there are no seams, no atlases and no filtering
   decisions to get wrong.
2. **Facets are the style, not a compromise.** Terrain is tessellated at 2.75 m
   with alternating diagonals and one colour per triangle. Nothing is smoothed.
3. **Warm key, cool fill.** Sunlight is warm at every hour; the ambient that
   fills the shadow side is cool. This is what stops a flat-shaded scene from
   reading as a CAD viewport.
4. **Shadows must never go to black.** A dark shape you cannot read is not
   atmosphere. The fill light is generous, and the grade lifts the blacks off
   zero.
5. **Readability before fidelity.** You should be able to tell from thirty
   metres that someone is frightened, carrying something, or asleep.

## Palette

| Thing | Colour |
|---|---|
| Meadow / grass | `#6da34a` · `#5f8f43` |
| Forest floor | `#3f6b35` |
| Ploughed field | `#8a6a3e` |
| Road, packed dirt | `#a08b6a` |
| Plaza paving | `#918b7e` / `#7b756a` in alternating slabs |
| Shore sand | `#c8b183` |
| Bare rock | `#7d7a72` → `#5e5c58` on the steep faces |
| Snow | `#e8eef2` |
| Water | `#4c9fb5` shallow → `#12384f` deep |
| Plaster | `#d9cdb4` · `#e2c9a2` |
| Timber | `#8a5e3b` · `#5d3d28` |
| Roof tile | `#8e4436` · slate `#5d6b74` |
| Lamp light | `#ffb14a` emissive, rising after dusk |

Sky, sunlight and ambient are keyframed through the day in
`src/render/atmosphere.ts` rather than fixed.

## The Luma

Rounded low-poly bodies with a real skeleton underneath: hips, torso, a neck
that separates the head from the shoulders, long ears, short arms, a tail. Big
eyes with pupils that track what the head is looking at, a brow line, a small
snout. Colour, size, crest and build all come from the genome, so siblings
resemble each other.

Everything they do is posed from simulation state, never keyframed: gait from
measured speed, lean from mood, ears flat when frightened, tail wagging when
happy, a bob and a moving mouth while talking, curled up asleep, slumped when
grieving.

## Architecture

Generated in code from a small kit: stone footing, plastered walls, half-timber
framing, gabled or hipped roofs with real overhangs, chimneys, a hanging sign
painted in the building's own colour, windows that light after dark. Around
them: barrels, crates, carts, woodpiles, garden fences, washing lines,
scarecrows and market awnings, so a settlement looks inhabited rather than
sited.

## Interface

Dark, slightly warm glass over the world, one amber accent, and type that knows
what it is. Numbers are tabular, labels are small and quiet, and the only things
allowed to shout are the crosshair prompt and a toast. Icons are drawn in SVG,
never borrowed from an emoji font. The HUD never boxes the screen in; anything
that needs reading is a panel.

## Sound

Procedural: a few oscillators and filtered noise. Footsteps know what ground you
are standing on. There is no music, and nothing is voice-acted.

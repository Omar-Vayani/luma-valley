# Luma Valley — Design Direction

**Direction:** low-poly, warm, vibrant-light nature. Cozy, not sterile; colorful, not neon.

## Palette (OKLCH, warm daylight)

- Sky: soft warm blue `oklch(0.85 0.05 220)` → golden `oklch(0.92 0.10 80)` at sunset
- Grass: fresh lawn green `oklch(0.78 0.12 135)` (light) / `oklch(0.55 0.11 135)` (shadow)
- Water: clear cyan `oklch(0.80 0.06 195)`
- Berries/food: tomato red `oklch(0.60 0.19 25)` + sunny amber `oklch(0.80 0.14 75)`
- Den/cave: warm umber `oklch(0.55 0.06 55)`
- Creatures: pastel body colors seeded by genome (mint, peach, butter, lilac, sky), big dark eyes, white belly
- UI: white cards `oklch(1 0 0 / 0.92)`, dark text `oklch(0.28 0.02 60)`, green accents

## Shapes

- Creatures: rounded low-poly blobs (icosahedron-ish), big sphere eyes with blinking, small ears/tail, color-coded by genome, size from genes
- Plants: low-poly bushes with berry clusters; stream of flat-shaded water planes
- Terrain: low-poly heightfield from value noise, soft vertex colors

## Mood

- Cozy, gentle, "little lives in a little valley". Day/night cycle with warm light.
- Sound: procedural squeaks/coos per creature (seeded by genome), soft ambience (water, wind, birds).

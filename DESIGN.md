# Luma Haven — Design Direction

**Direction:** stylised low-poly, and calm. Flat-shaded, untextured, warm at
midday and readable at midnight. The brief for this build was "chill", and most
of the work was taking things out.

## The rules that keep it coherent

1. **No textures anywhere.** Every surface is a flat-shaded material or a
   vertex colour, so the loaded nature models and the generated buildings
   belong to the same world.
2. **Facets are the style.** Terrain is tessellated at 2.5 m with alternating
   diagonals and one colour per triangle. Nothing is smoothed.
3. **Warm key, cool fill.** Sunlight is warm at every hour; the ambient that
   fills the shadow side is cool and generous.
4. **Shadows must never go to black.** A dark shape you cannot read is not
   atmosphere. The hemisphere light is strong enough that the shaded side of a
   building still shows its planks.
5. **Nothing on screen shouts.** No bars, no feed, no hotbar. The time, what
   you are carrying, who is nearby, and what pressing a key would do.
6. **Readability before fidelity.** You should be able to tell from twenty
   metres that a Luma is frightened.

## Palette

| Thing | Colour |
|---|---|
| Meadow / grass | `#6f9e52` · `#5f8c47` |
| Worn ground round the well | `#9a8460` · `#8d7855` |
| Paving | `#8e8a80` · `#807c73` |
| Bare rock | `#7b776e` |
| Snow on the rim | `#e6ecef` |
| Water | `#4f93a6` |
| Timber, walls | `#b98a5c` · `#a97b50` · `#c49365` · `#9f7248` |
| Beams and posts | `#7d5a36` · `#6d4e30` |
| Shingles | `#8b6a45` · `#79593a` |
| Stone footing | `#9a958c` |
| Interface accent | `#e0b062` |

Sky, sunlight and fog are keyframed through the day in `src/render/sky.ts`. The
day is twenty minutes long, which is slow enough to be scenery rather than an
event.

## The Luma

Rounded low-poly bodies on a real skeleton: pelvis, spine, chest, neck, head,
two-segment arms and two-segment legs, long ears and a tail. They are waist
high and clearly not people.

Everything they do is posed from simulation state, never keyframed: gait from
measured speed, ears flat and eyes wide when frightened, ears forward when
listening to you, tail wagging when content, curled up asleep, head turned to
whoever is talking.

**Knees bend backwards.** With the shin hanging down −Y and the face looking
down +Z, that is a positive rotation about X. The previous rig negated it, so
from the knee down every leg swung forwards, and it was the first thing anybody
noticed.

## Architecture

Generated in code from a small timber kit: a stone footing sunk below the
lowest corner of the ground beneath it, plank-course walls, corner posts, a
shingled roof with a real overhang, a gable at each end, and a doorway with a
framed lintel.

Every door in the valley is 1.2 m wide and 2.15 m high, from one constant, and
the front wall is generated as two cheeks either side of that opening. A
building cannot have a door the width of its own frontage because there is
nowhere for that number to come from.

## Interface

Dark, slightly warm glass over the world, one amber accent, and type that knows
what it is. The only things allowed to move are the crosshair prompt and a
toast. The neural interface is the one dense screen in the game, and it earns
it by being a live read of the network rather than a summary of it.

## Sound

Procedural: a few oscillators and filtered noise, quiet and short. Everything
is positional, fades to nothing at a range you set yourself, and every sound
has a cooldown per creature so one frightened Luma cannot hold a noise on
repeat. There is no music.

# Architecture

Four layers, and one rule about which may import which.

```
src/sim      pure TypeScript. The world, the creatures, the brains.
             Imports nothing from render, game, ui or three.js.
src/render   three.js. Draws what sim describes, and owns the game loop.
src/game     input and the first-person controller.
src/audio    a procedural mixer.
src/ui       React. Reads a snapshot; never touches the scene graph.
```

`src/sim` not knowing that a renderer exists is what makes the simulation
testable at a thousand times real speed, and is why the tests can run a
fifteen-minute day in two seconds.

## src/sim

| File | What it is |
|---|---|
| `brain.ts` | The neural network: perception, concept and decision lobes, Hebbian association, reinforcement with eligibility traces, the word lobe, instincts, and the snapshot the interface draws. |
| `drives.ts` | Eight drives, how fast each rises, and the weighting that turns them into one number for the reward. |
| `creature.ts` | A Luma: a genome, a body, a brain, and the state of whatever it is currently doing. |
| `sim.ts` | The tick. Sense, decide, move, act, learn — plus everything the player can do to a creature. |
| `village.ts` | The hamlet, described once: buildings, doors, furniture, places and solids. |
| `terrain.ts` | One height function. Everything else asks it where the ground is. |
| `collision.ts` | A uniform grid of circles and boxes, shared by the player and the creatures. |
| `speech.ts` | Reading a line of English, and answering it out of live state. Synchronous. |
| `save.ts` | The world and the conversation log, in two keys with different write rates. |

### The tick

```
for each creature:
  drives rise, fear responds to whether you are close
  senses are gathered and pushed through the concept lobe
  Hebbian association runs
  if the current action is finished (or fear interrupts):
      the last action is paid its reward — the change in discomfort
      a new action is chosen from concept × learned weights + words + reflexes
  the body moves along its route and resolves against the collision grid
  the action does its work
```

Two details in there are load-bearing and were bugs before they were details.

**A journey is not a decision.** The dwell timer starts when the walking
finishes, not when the action is chosen. Counting travel against it meant no
errand longer than one deliberation could ever be completed: a creature would
set off for a bed on the far side of the green and change its mind halfway,
for ever.

**The reward snapshot is taken after the cause, not before.** When a creature
is struck, the pain lands first and the "how bad are things" reading is taken
second, so running away is judged on the fear that follows rather than blamed
for the blow that preceded it. Getting this backwards taught them that fleeing
was the worst thing they could possibly do.

### Getting about

There is no navmesh. Buildings are convex and there are six of them, so routing
is three rules:

1. A trip that crosses a wall is broken into legs that go via the doorway —
   outside step, threshold, inside step — because the threshold waypoint is
   what lines a creature up with a 1.2 m gap.
2. A leg that passes through a building is bent around it, treating the
   building as a circle.
3. Contact makes a body slide along the surface rather than stop against it,
   and a body that has been trying to move and has not for a second gives up
   and steps around.

## src/render

`view.ts` owns the loop: player, then a fixed-step simulation, then the world,
then the frame. It publishes a small HUD snapshot ten times a second, which is
the only thing React sees.

`buildings.ts` generates the hamlet from `sim/village.ts` in the same local
frame the collision boxes were computed in, then merges each building into one
mesh per material. The merge matters: a building is honestly described as a
couple of hundred planks, and drawing it that way cost a draw call each.

`luma-view.ts` is the creature rig. Nothing is keyframed; every pose is
computed from simulation state. Knees fold backwards, which with the shin
hanging down −Y and the face looking down +Z is a *positive* rotation about X.
There is a test for it.

## Tests

`npm test` runs the simulation, the rig and the audio rules. `npm run playtest`
loads the built page in a real browser, takes hold of the same `Sim` and
`WorldView` the player is using through `window.luma`, and plays through a
first session: walk up to a creature, talk to it, teach it a word, frighten it,
and check the brain changed in the way it should have.

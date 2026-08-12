# Luma Haven

A quiet valley with six creatures in it. Each one is run by a small neural
network — real weights, learned in the browser while you watch — and none of
their behaviour is scripted.

It is built in the spirit of *Creatures* (1996): the interest is in the minds,
not in the number of systems. Feed one and it learns that you are worth walking
towards. Hit one and it learns the opposite, and will keep away from you long
after the bruise has faded. Say a word while something is happening and the
word attaches itself to whatever the creature's mind was doing at that moment.

**Runs in any modern browser, offline, with no account.**

```bash
npm install
npm run dev          # http://localhost:5173
```

---

## What you do

You arrive on the road south of a small timber hamlet: six buildings round a
green, a well in the middle, a fire pit, berry bushes at the edges, woods and a
pond beyond. Six Luma live there.

| | |
|---|---|
| <kbd>W A S D</kbd> | walk · <kbd>Shift</kbd> to jog · <kbd>Space</kbd> to jump |
| <kbd>E</kbd> | talk to a Luma · hold on a bush to pick berries |
| <kbd>F</kbd> | offer a berry to whoever you are facing |
| Left click | a hand on the head — they like it, and they learn from it |
| Right click | a swat — they will not forget it |
| <kbd>N</kbd> | open the mind of the Luma you are looking at |
| <kbd>O</kbd> · <kbd>F1</kbd> | settings · controls |

Nothing is on a timer, nothing is failable, and nobody dies. The day is twenty
minutes long. That is the whole of the game loop: it is somewhere to be, and
six minds to get to know.

## The minds

Every Luma has three lobes wired in series, and you can watch all of them live
by pressing <kbd>N</kbd>.

**Perception** is one neuron per sense: the eight drives it is carrying —
hunger, thirst, fatigue, loneliness, boredom, fear, pain, cold — plus what it
can see, and what it has learned to feel about you.

**Concept** is a sparse association layer trained by Hebb's rule, in Oja's
normalising form so weights cannot run away. Senses that keep firing together
come to share a neuron. Only the strongest few stay lit each tick, so a
situation is three concepts rather than a smear across sixteen — which is what
makes the readout legible instead of a heat haze.

**Decision** is one neuron per action, trained by reinforcement. Each choice
leaves an eligibility trace, and when the drives fall a moment later the reward
is paid into whatever the trace is still holding. That delay is the point:
eating is rewarding because hunger drops a second afterwards, not because a
rule somewhere says eating is good.

Two things sit either side of that stack. A **word lobe** binds anything you say
to whichever concepts were lit when you said it, so vocabulary is learned the
same way as everything else, and a word that has been learned can then drive
behaviour on its own. And a thin layer of **reflexes** sits underneath, which
only wake when a drive is already desperate — a brain trained purely by reward
can learn itself into a corner, and an animal that has never happened to eat
while hungry should not starve for want of the idea.

Newborns are not blank. As in *Creatures*, instincts are trained in rather than
consulted: they arrive as ordinary synapse strength, and experience can argue
with them and win.

## Repository

```
src/sim/      the simulation: brain, drives, creatures, village, collision — no three.js
src/render/   the valley on screen: engine, terrain, buildings, the Luma rig
src/game/     input and the first-person controller
src/audio/    a small procedural mixer
src/ui/       React overlay: the HUD, chat, and the neural interface
```

`src/sim` never imports from `src/render`. The village is described once, in
`src/sim/village.ts`, and both the meshes and the collision grid are built from
that description — which is why there is no wall you can walk through and no
doorway too narrow to fit down.

## Commands

| | |
|---|---|
| `npm run dev` | the game, with hot reload |
| `npm test` | the simulation and rig tests |
| `npm run lint` | oxlint |
| `npm run build` | typecheck and bundle |
| `npm run playtest` | drive the real game in a real browser and check it works |

`npm run playtest` needs the dev server running. It walks up to a Luma, talks
to it, teaches it a word, frightens it, and asserts that the brain changed in
the way it should have.

[`PLAY.md`](PLAY.md) walks through a first session. [`DESIGN.md`](DESIGN.md) is
the visual direction, [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) is how it
is put together, and [`HOSTING.md`](HOSTING.md) covers putting it on the web.

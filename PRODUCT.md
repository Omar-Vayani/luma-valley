# Luma Haven

A first-person artificial-life game in the spirit of *Creatures* (1996): six
creatures in a quiet valley, each run by a small neural network you can open
up and watch learn.

Runs offline in the browser. See [`README.md`](README.md) to play,
[`PLAY.md`](PLAY.md) for a first session,
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it is put together and
[`DESIGN.md`](DESIGN.md) for the visual direction.

## What it is

- **Six minds, no scripts.** Perception, concept and decision lobes; Hebbian
  association; reinforcement with eligibility traces so a reward can arrive
  after the action that earned it. Instincts are trained in at birth, and
  experience can overwrite them.
- **Learning you can cause.** Feeding builds trust, a swat builds fear, and
  both show up in the weights within seconds. A creature that has been hit
  keeps its distance long afterwards.
- **Words that are learned, not looked up.** Anything you say binds to whatever
  the mind was doing when it heard it. The interface tells you what a creature
  thinks a word means by asking the network.
- **A neural interface.** Every lobe, live, at ten frames a second.
- **A place rather than a task list.** A timber hamlet, a pond, woods, and a
  twenty-minute day. Nothing is failable and nobody dies.

## What it deliberately is not

An earlier version of this repository had an economy with scarcity pricing, a
job board, opening hours and tills, courtship and partnership state machines,
gossip and reputation networks, addiction and withdrawal, emergent cultural
norms, inheritance, a crafting tree, a quest board and a chronicle — around
28,000 lines of simulation, most of which the player could not see and none of
which made a creature more interesting to meet.

It is now about 6,000, and the creatures are the game.

# Luma Valley

A 3D artificial-life game inspired by the original *Creatures* (1996): real neural-network brains, biochemistry, heritable genetics, and creatures you can raise, teach, and emotionally bond with. Low-poly, warm vibrant-light art direction. Runs in the browser (desktop + mobile).

See PLAN.md (research) and DESIGN.md (visual direction).

## The systems (all pure TS, TDD)

- **Brain** — neural-net lobes (perception → decision → motor), neurons with stimulation/threshold/state/leak, dendrite weights, Hebbian reinforcement gated by pleasure/pain chemistry. Creatures *learn from experience* and can be trained.
- **Biochemistry** — blood chemicals (hunger, thirst, fatigue, boredom, loneliness, fear, pleasure, pain, health) with synthesis, reactions, half-life. Drives are chemicals feeding the brain.
- **Genetics** — chromosomes, genes for chemical rates, brain params, temperament, appearance, lifespan. Breeding = crossover + mutation; traits are heritable.
- **World** — procedural low-poly valley: terrain, stream, plants/berries, den, day/night. Fixed per save (your world is yours).
- **Language lite** — teach words by speaking near a creature; they associate word → object/action and respond.
- **Persistence** — IndexedDB autosave + export/import `.lumavalley` save file (target < 300 KB per world).

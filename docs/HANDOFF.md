# LATTICE: engineer handoff

A browser tower defense roguelike. You build a maze with cheap walls, convert walls into
towers (nodes), and wire pairs of nodes together with beams that hurt whatever crosses them.

## What's in here

| File | What it is |
| --- | --- |
| `LATTICE-spec.pdf` | The full spec with diagrams. Start here. |
| `LATTICE-spec.md` | Same spec as Markdown (diagrams omitted), for the repo or for diffing. |
| `balance-sim/` | Headless Node prototype used to validate the spec. Starting point for `/tools/balance`. |

## Where to start

1. Read **Summary**, **The hook**, **Core loop**, then **Build order** in the spec.
2. Build milestones 1 and 2 (grid, pathing, nodes, beams, first 10 Proving Ground waves) and
   playtest before anything else. The hook lives or dies there.
3. The roguelike layer (Expedition, drafts, procedural maps, meta) is milestones 6 to 8.

## balance-sim

Plain Node, no dependencies. Prototype quality, not production code.

| File | Purpose | Run |
| --- | --- | --- |
| `sim.js` | Core rules at 30 Hz: grid, flow field, walls, nodes, beams, enemies, waves, economy | (library) |
| `bot3.js` | Scripted player: serpentine maze, wall conversion, line-of-sight beam wiring, anti-air, upgrades | (library) |
| `cal.js` | Main evaluation: builds x beams on/off x Overclocks, 8 seeds, Proving Ground | `node cal.js` (~3 min) |
| `micro.js` | Single-beam benchmark and beam counter matrix | `node micro.js` or `node micro.js late 20 2` |
| `mapgen.js` | Procedural map generator with all validation checks, incl. maze potential | `node mapgen.js` |
| `planner.js` | Picks the best of 16 serpentine wall layouts for a map (used by the bot on random maps) | (library) |
| `fair2.js` | Plays the bot across 80 generated maps to check map fairness | `node fair2.js` (~1 min) |

Final-rule flags for `Game`: `{ los: true, wardScale: true, hpg: 1.10 }`.

Known gaps between this prototype and the spec (all make the prototype slightly optimistic or simpler):
- Enemies re-pick their next tile every tick; the spec commits them to the next tile center and forbids reversal.
- Mortar shells track their target perfectly; the spec lands them at a predicted point.
- Not modelled: mid-wave rewiring and its 4 s charge, selling, interest banking, early calls,
  stop effects, and the whole Expedition layer (acts, forks, drafts, bosses other than the Colossus).
- Use `Math.hypot` here only; the real sim must use `sqrt(dx*dx + dy*dy)` for cross-browser determinism.

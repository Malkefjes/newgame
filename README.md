# LATTICE

A browser tower defense where towers are **nodes** you wire together with **beams**. Nodes block
the path and shoot; beams hurt anything that walks through them. Build the maze, then wire the trap.

The full design is in [`docs/LATTICE-spec.md`](docs/LATTICE-spec.md) (PDF with diagrams alongside).
The original handoff notes are in [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # sim unit tests, replay determinism, no-trap fuzz
npm run build      # typecheck + static build in dist/
```

## Status

Milestones 1 and 2 from the spec's build order are in, plus most of milestone 3, so the whole
20-wave Proving Ground on Canyon is playable with placeholder art:

- Grid, flow-field pathing, placement validation with reasons, path preview with length change,
  beams that a placement would cut highlighted in red.
- Walls (drag to paint), Bolt / Frost / Mortar nodes, three tiers, Wall conversion, sell (build phase
  only, 100% refund for this phase), First / Strongest targeting.
- Links with line of sight, slots, 4 s mid-wave charge-up, all six beams and their statuses
  (slow, Brittle, Charged with queued explosions, Armor Shred), Minefield trip-mines.
- All seven enemies including Warden shields and the Colossus, the full wave table, spawn B from wave 11.
- Gold, bounties, clear bonus, interest with the rising cap, early call (max 2 waves on board),
  Overclock picks after waves 4, 8, 12 and 16.
- Link preview with beam name, level and path exposure; hover tooltips; per-wave stats panel
  (damage per node and per beam, beam share); kill / leak / blast feedback; flyer flight lines
  before Flyer waves; hold Tab for the beam damage heat overlay; pause and 1× / 2× / 3×.

Not yet built: audio and final art (milestone 4), the CI balance harness (milestone 5; the
prototype is in [`tools/balance`](tools/balance) unchanged), and the Expedition layer (milestones 6 to 8).

## Controls

| Action | Mouse | Key |
| --- | --- | --- |
| Pick Wall / Bolt / Frost / Mortar | Build bar card | Q / 1 / 2 / 3 |
| Place | Left-click (Shift keeps the piece; drag with Wall to paint) | |
| Convert a Wall | Click it with a node selected, or use the panel | |
| Link two nodes | Drag from one node to another | |
| Remove a beam | Right-click it, or ✕ in the node panel | |
| Upgrade / Sell / Target mode | Node panel | U / S / T |
| Start wave or call early | Start button | Space |
| Pause / speed | Top bar | P / F |
| Cancel | Right-click | Esc |

## Code layout

- `src/sim/` is the deterministic simulation: a pure function of seed, content and commands.
  `content.ts` holds every number from the spec. `game.ts` runs the fixed 30 Hz step in the
  spec's documented order. Only `+ − × ÷` and `Math.sqrt` are used for geometry.
- `src/ui/` reads the sim and turns input into commands. Canvas 2D board, plain DOM for the HUD.
- `tests/` covers path lengths, placement rules, line of sight, economy, 20 seeded replays that must
  match bit for bit, and a 200-seed random-command fuzz that checks no enemy is ever trapped.

## Spec calls made while building

- **Compound Interest** in the Proving Ground table says "cap 45", which would be lower than the
  normal rising cap from wave 7 on. It uses the Expedition relic's rule instead: 15% at 1.5× the normal cap.
- **Interest** is computed on gold held minus the clear bonuses paid since the last build phase.
- **Sell refund** after converting or upgrading a piece earlier the same build phase: the money spent
  this phase refunds 100%, the rest 70%.
- **Frost** pulses only when something is in range, so its first pulse isn't wasted.
- **Mortar** shells land at the target's predicted position along its path, and **enemies commit**
  to the next tile center and never reverse unless it is their only way out (both per spec, unlike the prototype).
- Build-phase time is frozen in the sim, so a replay doesn't depend on how long the player planned.

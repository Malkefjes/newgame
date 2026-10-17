# Tower Defense Core Loop Spec

Oct 17, 2026 · @Erik Malkenes

## Summary

**LATTICE** (working title) is a browser tower defense game where towers are *nodes* that you wire together with *beams*. Nodes block the path and shoot; beams cross the path and hurt anything walking through them. You win by building a maze that forces enemies to cross the right beams, again and again.

This spec defines a complete roguelike: 3 node types, 6 beam types, 7 enemies plus 3 bosses, and an Expedition mode of 3 acts on procedurally generated maps. Runs differ through route forks, 27 tunings, 24 relics, 4 loadouts and 10 Heat levels. The fixed 20-wave Canyon run is kept as the tutorial and balance reference. Every rule was validated in a headless simulator with scripted bots and then attacked by an independent design review. Recommendation: build milestones 1 and 2, then playtest the core before building the roguelike layer on top. Target session is a 40 to 50 minute run on desktop with mouse and keyboard. Every number here is a starting value. The playtest section lists how to tune them.

## First principles

Tower defense is fun when the player makes a spatial plan, watches it get tested, and understands exactly why it held or broke. Everything else serves that loop. The principles below are what that requires, and the failure each one prevents.

| # | Principle | What it means in practice | Genre failure it prevents |
| --- | --- | --- | --- |
| 1 | Plan, then watch it get tested | The fun is the gap between prediction and outcome. The player must be able to predict, so threats are previewed and rules are deterministic. | Random outcomes the player can't learn from |
| 2 | Space is the main decision | Where you build matters more than what you build. The player shapes the path itself. | Fixed-path maps where placement is solved |
| 3 | Scarcity forces tradeoffs | You can never afford everything. Every gold spent is gold not saved (interest) or spent elsewhere. | Building everything; no real choices |
| 4 | Combinations beat stats | A small set of parts that combine (3 nodes give 6 beams) creates discovery without content bloat. | Dominant single-tower spam |
| 5 | Every counter has a counter | Each enemy punishes one lazy strategy: flyers punish pure mazing, runners punish beam-only defense, brutes punish no armor shred. | One build that wins every run |
| 6 | Failure is legible | When an enemy leaks, the player sees where and why. Per-wave damage stats show what worked. | "I lost and don't know why" quits |
| 7 | Thinking beats clicking | Pause and build at any time. Reward decisions, not hand speed. | APM walls that exclude planners |
| 8 | Stay engaged during waves | Beams can be rewired mid-wave, so waves have decisions, not just watching. | The genre's classic dead time |
| 9 | Player owns the tempo | Call waves early for gold, speed up to 3x, pause freely. | Boredom in easy waves, panic in hard ones |
| 10 | Runs differ | Run upgrades drafted from a pool make each run's best plan different. | A solved, single optimal build order |
| 11 | Feedback is juicy and readable | Hits, kills, gold and leaks all have clear visual and audio signals. Readability first, flash second. | Mushy, unsatisfying combat |
| 12 | Deterministic core | Same seed plus same inputs gives the same result. This makes bugs reproducible and balance testable. | Untestable balance, unfixable bugs |

**Design pillars** distilled from the table, used to settle any future argument about a feature:

1. **Draw the maze, wire the trap.** Space and connections are the game.
2. **Read it, then beat it.** Everything important is visible before it hurts you.
3. **Small parts, deep combos.** Add combinations before adding content.

## The hook: nodes and beams

The novel idea is that every armed tower does two jobs at once. As a **node**, it is a wall that shapes the maze and a turret that shoots. As an **anchor**, it holds beams that stretch across the path to other nodes. This joins the two best ideas in the genre, mazing (Desktop TD, Element TD) and combination towers (Kingdom Rush, Bloons paths), into one spatial puzzle.

**Why it works:**

- **One action, two consequences.** Every wall changes the path, and every path change moves where your beams cross it. Every placement is a real decision.
- **Geometry is the skill.** A beam that crosses a corridor at a right angle touches an enemy for a fraction of a second. A beam that runs *along* a straight corridor touches it for seconds. Players discover this and start designing corridors around beams.
- **3 parts, 6 combos.** Three node types make six beam pairs, each with a distinct effect. The roster stays small enough to learn in one run and deep enough for fifty.
- **Mid-wave decisions.** Beams can be unwired and rewired during a wave, with a 4-second charge-up. Swapping a slow beam to a damage beam when a brute walks in is the game's active skill.
- **Instantly readable.** Beams are visible lines. Players see their trap, and they see enemies cross it.

**The fantasy:** you are an engineer stringing a web of light across a canyon. The enemies walk your maze, and the maze is the weapon.

## Evidence: what the simulation showed

Every rule here was implemented in a headless simulator at 30 Hz, played by scripted bots, attacked by an independent design review, and revised until it held. Under the final rules, the most diverse build wins **7 of 8** seeds with Overclocks and 3 of 8 without. With beams turned off, the same bots won **0 of 80** best-policy runs and averaged wave 9 to 16. Be clear about what that proves: beams were tuned up until they mattered, so "beams matter" is partly by construction. What the simulation shows beyond that is that the system has **no dominant strategy, rewards diversity and geometry, and survives the obvious exploits.** Whether it is fun can only be settled by the milestone-2 playtest.

&#91;embedded content: LATTICE balance simulator · 5 builds × 8 seeds, beams on and off, final rules\]

Without Overclocks the gap holds: the diverse build wins 3 of 8 with beams, and nothing wins without them.

**What the bots did:** built a 5-column serpentine of walls (spawn A's path grows from 23 to 83 tiles), converted walls to nodes where coverage and line-of-sight beam potential were best, wired beams greedily by path exposure, upgraded by damage per gold, and placed anti-air before flyer waves. Each strategy was run with its best of several build policies across 8 seeds. The bots never rewired mid-wave, banked for interest, or called waves early. A good human does all three, so human results should beat these.

**What it confirmed:**

| Question | Result |
| --- | --- |
| Is there a dominant tower? | No. With Overclocks: diverse build 7 of 8 wins, Bolt + Bolt + Mortar 5 of 8, Bolt + Mortar 3 of 8, Bolt-only 2 of 8, Mortar-only 1 of 8. Frost + Mortar can't kill flyers and stalls. |
| Does geometry matter? | Yes. The same beam pair scored 1.2 tiles of path exposure across a corridor and 2.8 on a diagonal. |
| Is any beam dead? | Not after tuning. One max-tier beam across a path lifts a test defense from 30% of wave HP removed to 60 to 81%, for all six. Damage beams lead early; Tar, Chill and Minefield lead late against armor, when a big kill zone sits downstream. |
| Do the counters work? | Yes. A pure ground maze lost every life to Flyers until the bot read the wave preview and placed Bolts along the flight line. |
| Can beams be stacked over walls? | They could, and the best builds relied on it: a bot unaware of line of sight fell from about 30 beams to 10 once it was enforced. Line of sight now caps stacking by geometry. A bot that places nodes facing each other across corridors recovered to the same performance. |
| Can enemies be juggled? | They could, by building and selling mid-wave to flip routes. Fixed by build-phase-only selling and a no-reversal rule. |
| Is the run the right length? | Yes. Wave time totals 11 to 16 minutes; with build phases a run lands at 20 to 25 minutes. |

**What the simulation and review changed:** cheap Walls (a maze was unaffordable without them), a spawn-spacing ramp (wave 1 was unwinnable), about 2.5× stronger beams with one-tile contact (beams were under 5% of damage), Minefield as a trip-mine, a lingering Chill (the weakest beam), line of sight for beams, build-phase-only selling, a 4 s mid-wave charge-up, a rising interest cap, wave-scaled Warden shields, a lighter wave 13, and HP growth eased from 1.11 to 1.10.

**Where the simulator differs from this spec:** it picks the next tile from the enemy's current tile every tick, and its Mortar shells track their target perfectly. Both make it slightly optimistic. The spec's rules are the ones to build.

**What it can't tell you:** whether it *feels* good, and whether mid-wave rewiring is a decision or busywork. Those are the milestone-2 playtest's job; the kill criteria are under playtest metrics. Keep the simulator as the balance harness (see Technical architecture).

## Core loop

The game runs three nested loops, each with its own question for the player. The wave loop is the heart: plan, test, learn, adjust.

&#91;embedded content: core loop · 3 nested loops\]

| Loop | Length | Player question | Satisfaction comes from |
| --- | --- | --- | --- |
| Moment (inside a wave) | 2 to 10 s | "That brute is getting through. Rewire Arc to Tar, or build a Bolt?" | Watching a fix land in real time |
| Wave | 60 to 120 s including build | "Where does my maze leak, and what does the next wave need?" | A plan that holds; a clear stats panel when it doesn't |
| Run | 40 to 50 min | "Which fork, which draft, and which archetype is this run becoming?" | Choosing a route and drafts that add up to a build that felt like mine, then beating the Phase Walker with it |

The build phase is untimed, so planning is never rushed. Tempo pressure comes from the early-call bonus and interest instead of a timer.

## Map, grid, and pathing

The board is a 24 × 14 tile grid at 48 px per tile (1152 × 672 px). Enemies walk the shortest path from spawn to core, and nodes are walls, so the player builds the path. The one rule that keeps mazing fair: **a placement that would fully block any route is rejected.**

**Launch map "Canyon"** (`.` open, `#` rock, `A`/`B` spawns, `C` core):

```
           1111111111222
 01234567890123456789 0123
0 ...........BB...........
1 ........................
2 ....##..........##......
3 ....##..........##......
4 .........#..............
5 .........#.........#....
6 A..................#..CC
7 A.....#...............CC
8 ......#..........#......
9 .................#......
10...##...................
11...##.........##........
12..............##........
13........................
```

With no nodes, the path from A is 23 tiles and from B is 17 tiles. A well-built maze should stretch A to 60 to 90 tiles.

**Rules**

| Rule | Value |
| --- | --- |
| Spawn A | Left edge, rows 6 to 7. Active from wave 1. |
| Spawn B | Top edge, columns 11 to 12. Active from wave 11. Shown as a sealed gate with a countdown before then. |
| Core | 2 × 2 at columns 22 to 23, rows 6 to 7. 20 lives. |
| Unbuildable | Rock, spawn tiles, core tiles, and every tile orthogonally adjacent to a spawn or core. |
| Ground movement | 4-directional. Enemies follow a flow field (distance-to-core per tile) toward the neighbor with the lowest distance. Ties break in a fixed order: right, down, up, left. |
| Movement smoothing | Enemies steer toward the center of the next tile, so they cut no corners and never clip rock. |
| Air movement | Flyers ignore the grid and fly a straight line from their spawn to the core center. |
| Placement check | On every build, recompute the flow field on a copy of the grid. Reject if any spawn tile (active or not yet open), or any tile with a living ground enemy, has no path to the core. Reject if a ground enemy's current tile or the next tile it is walking into is the target tile. |
| Rerouting | Building mid-wave is allowed; selling is not (see Economy). Each enemy finishes walking to the tile center it is heading for, then follows the new flow field. Anti-juggle rule: an enemy never steps back onto the tile it just left, unless that is its only neighbor with a path. |
| Path preview | While placing, draw the new path from every active spawn, plus the path length change (for example "+6 tiles"). Before wave 11, spawn B's path draws dimmed, so a "Blocks path" rejection near it is never a mystery. Flyer flight lines draw during any build phase before a wave containing Flyers. |

**Why one map:** the hook lives in the player-built maze, not in the map. One open map with a few rocks and a second spawn that opens halfway is enough to force a mid-run rethink. More maps are content for later.

## Towers: nodes and beams

The player builds two things: cheap **Walls** that shape the maze, and three types of **nodes** that shoot and anchor beams. Any Wall can later be converted into a node by paying the difference. So the rhythm is: draw the maze cheaply, then arm it where it matters. Every node has 3 tiers. Nodes have 2 link slots at tiers 1 and 2, and 3 at tier 3.

### Walls

| Piece | Cost | Behavior |
| --- | --- | --- |
| **Wall** | 10 gold | Blocks the path. No attack, no link slots. Convert to any node for (node cost − 10). Sells like any node. |

Walls were added after simulation. With nodes as the only walls, a real maze cost over 600 gold and never formed before wave 10, so the hook never switched on. Cheap walls are the proven fix from Desktop TD and Element TD.

### Nodes

| Node | Role | Cost T1 / T2 / T3 (gold) | Damage T1 / T2 / T3 | Fire rate | Range (tiles) | Targets | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Bolt** | Single-target, anti-air | 50 / +60 / +100 | 9 / 16 / 26 per hit | 2.0 shots/s | 3.0 / 3.5 / 4.0 | Ground + air | Projectile 12 tiles/s, homing. Never misses. |
| **Frost** | Crowd slow | 45 / +55 / +90 | 4 / 7 / 11 per pulse | 1 pulse/s | Radius 1.75 / 2.0 / 2.25 | Ground + air | Each pulse slows all in radius 30% / 35% / 40% for 1.5 s. |
| **Mortar** | Splash | 75 / +85 / +130 | 40 / 70 / 115 per shell | 0.5 shells/s | 1.5 min to 5.5 max | Ground only | Lands 0.8 s after firing at the target's predicted position along its path. Splash radius 1.0 / 1.1 / 1.25. |

Targeting defaults to **First** (closest to the core by flow distance). The player can switch any node to **Strongest** (highest current HP). The two modes are enough for the core loop.

### Links

- **Make a link:** drag from one node to another. Allowed when both have a free slot, the centers are at most **4.5 tiles** apart, the pair isn't already linked, and there is line of sight. Walls can't link.
- **Line of sight:** the segment between the two node centers must not pass through any tile holding rock, a Wall or another node. Beams may cross each other. If a new placement would cut an existing beam, the placement preview highlights that beam in red, and placing removes it, freeing both slots. This rule caps beam stacking with geometry: in any serpentine, a beam can only span the one open corridor between its two anchors. Without it, one beam reaching over walls crossed 2 or 3 corridor passes, and the best simulated builds relied on that.
- **Charge-up:** links made during the build phase are active at once. A link made while enemies are on the board takes **4 s** to charge and draws as a dashed line until then. Mid-wave rewiring is a commitment, not a per-enemy toggle.
- **Remove a link:** right-click the beam, or use the node panel. It is instant and free.
- **Cost:** links are free. Slots are the budget. This keeps the economy to one resource and makes the choice *which* pair, not *whether* to afford it.
- **Contact:** a ground enemy is on a beam when its center is within **0.5 tiles** of the segment between the two node centers, so a beam is one tile wide. Beams never hit flyers.
- **Strength:** beam level L = tier A + tier B (2 to 6). Scaling multiplier m = 1 + 0.5 × (L − 2), so m runs 1.0, 1.5, 2.0, 2.5, 3.0. Upgrading a node strengthens all its beams.
- **Selling a node** removes its beams.

### Beams

| Pair | Beam | Effect while an enemy is on it (m = strength multiplier) | Job |
| --- | --- | --- | --- |
| Bolt + Bolt | **Arc** | 45 × m damage per second | Raw damage |
| Frost + Frost | **Chill** | Slow 45% (+5% per L above 2, max 60%), lingering **3 s** after leaving. 12 × m dps. | Freeze zone that feeds everything downstream |
| Mortar + Mortar | **Minefield** | Trip-mine. The first ground enemy to touch an armed beam detonates it for 80 × m damage to all ground enemies within 1 tile of that enemy. Rearms after 2 s. | Crowd burst |
| Bolt + Frost | **Shatter** | 25 × m dps, and applies Brittle: +30% damage taken from all sources for 3 s | Damage amplifier |
| Bolt + Mortar | **Overload** | 20 × m dps, and applies Charged for 4 s. A Charged enemy that dies explodes for 40 × m damage to ground enemies within 1 tile. | Chain kills on swarms |
| Frost + Mortar | **Tar** | Slow 20% (1 s linger), 20 × m dps, and Armor Shred: −30 armor points while on and for 3 s after | Anti-armor |

Beam damage per second is much higher than node damage on purpose. A beam crossing a corridor touches each enemy for under a second, but it hits everyone who crosses and never has to pick a target. Simulation showed that at roughly a third of these values, beams were under 5% of total damage and irrelevant.

### Status rules

- **Slow** never stacks. The strongest active slow applies; a weaker slow can't overwrite a stronger one until the stronger one expires. The global cap is 60%; bosses cap at 30%.
- **Brittle, Charged and Armor Shred** refresh their duration on reapply and don't stack. Stops (from tunings and relics) follow the rules in Draft pool, including 3 s of stop immunity afterward. Charged keeps the highest m among the Overload beams that applied it.
- **Damage order:** base damage × Brittle (1.3 if active) × (1 − effective armor %), then shield absorbs first, then HP.
- Damage-over-time ticks every sim step (1/30 s) as dps × dt.
- **Overkill:** damage beyond remaining HP and shield is discarded, and it doesn't count in damage stats.
- **Overload explosions** are queued, not resolved inside the damage call. After the damage pass, process the queue in order. An explosion can kill another Charged enemy, which adds its own explosion to the end of the queue. Each enemy explodes at most once.
- **Deep Freeze** (Overclock) adds +10 points to every Frost slow, Chill included, and raises Chill's cap to 70%.
- **Beam damage credit:** for stats and upgrade advice, each beam's damage is split half to each of its two nodes.

## Enemies

There are seven enemies, and each one punishes one lazy strategy. Armor is a percent damage reduction, so Tar's −30 points takes a 40% Brute to 10%, with a floor of 0%.

| Enemy | Base HP | Speed (tiles/s) | Armor | Lives lost on leak | Bounty (gold) | Behavior | It punishes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Grunt** | 60 | 1.2 | 0% | 1 | 4 | Walks the path | Nothing; the baseline |
| **Runner** | 35 | 2.4 | 0% | 1 | 3 | Walks fast | Beam-only defenses, since it spends little time on each beam |
| **Brute** | 300 | 0.7 | 40% | 3 | 15 | Walks slowly | Having no Tar or Brittle |
| **Swarmling** | 18 | 1.6 | 0% | 1 | 1 | Spawns in packs of 10, spaced 0.15 s apart | Single-target-only defenses |
| **Flyer** | 60 | 1.3 | 0% | 2 | 6 | Flies straight from the midpoint of its spawn's two tiles to the core center, over everything, so each spawn has exactly one flight line. Immune to beams and Mortar, unless a tuning says otherwise. | Pure mazing |
| **Warden** | 150 | 1.0 | 20% | 2 | 12 | Every 5 s, gives itself and all enemies within 2 tiles a shield of 40 × the wave HP multiplier (no stacking above that). | Ignoring target priority |
| **Colossus** (boss) | 6,000 at wave 10, 20,000 at wave 20 (not wave-scaled) | 0.5 | 30% | All lives (a leak ends the run) | 150 | Slow cap 30%. Shows a health bar at the top of the screen. | Weak total damage |

**Scaling:** HP at wave w = base HP × 1.10^(w − 1), so wave 10 is 2.36× and wave 20 is 6.12×. Bounty at wave w = base bounty × (1 + 0.04 × (w − 1)), rounded down. The Colossus is the exception: its HP and its 150 bounty are fixed. Ground enemies in a group alternate between their spawn's two tiles, starting with the upper one, so spawning uses no randomness. Bounties grow slower than HP on purpose, so later waves demand smarter builds, not just more gold.

**Readability:** each enemy has a unique silhouette that reads at 48 px with color off: Grunt circle, Runner arrowhead, Brute square, Swarmling small dot, Flyer diamond with a shadow, Warden hexagon with an aura ring, Colossus large octagon. Every enemy shows an HP bar once damaged. Shield draws as a white outline segment over the HP bar.

## Economy

The game has one currency, **gold**, and one health pool, **lives** (20). One currency keeps every tradeoff comparable: a node, an upgrade, or savings.

| Source or sink | Rule |
| --- | --- |
| Starting gold | 250, enough for about 10 walls and 3 nodes |
| Kill bounty | Per enemy, per the enemy table, scaled by wave |
| Wave clear bonus | 20 + 5 × wave number, paid when the last enemy of the wave dies or leaks |
| Interest | Paid once each time the board empties and the build phase begins: 10% of gold held, computed before that phase's clear bonuses are added, capped at 15 + 5 × the last cleared wave (20 at wave 1, 115 at wave 20). The rising cap keeps "build now or bank" a real choice all run. |
| Early call | Starting the next wave while enemies are still alive pays 5 gold plus 1 gold per whole second left in the current wave's spawn schedule, so calling sooner pays more. At most 2 waves can be on the board at once; Start is disabled otherwise. Each wave pays its own clear bonus when its last enemy dies or leaks. |
| Build | Pay the Wall or node cost. The tile blocks at once. Converting a Wall to a node costs the node cost minus 10. |
| Upgrade | Pay the tier cost. The node's stats and its beams' strength update at once. Upgrades are allowed mid-wave. |
| Sell | Build phase only; the Sell button reads "Sell after wave" while enemies are on the board. This closes the build-and-sell path-juggling exploit. Refund 100% for anything placed during the current build phase (undo). Otherwise refund 70% of everything spent on it. |
| Links | Free. Limited by slots. |

**Target curve:** a player who neither banks nor calls early earns about 5,000 to 5,500 gold over the run. In simulation, winning bots had spent about 1,350 gold by wave 10 and 3,000 by wave 16: roughly 55 walls, 25 nodes and 20 beams by the end. HP grows 1.10× per wave while bounties grow 4% per wave, so late efficiency has to come from beam geometry and combos, not spending alone. The bots never banked or called early, so interest and early calls are the first economy levers to check in playtest.

## Proving Ground: the reference run

The Proving Ground is 20 hand-authored waves on the fixed Canyon map. It is built first (milestones 1 to 3), doubles as the tutorial, and is the balance reference: the Expedition's scaling curves are taken directly from it. Each wave introduces or combines threats so the player's maze is tested in a new way. Pressure rises in a sawtooth: a spike wave, then a breather where the player can rebuild.

### Wave table

Groups spawn in the order listed. Base spacing within a group: Grunt 0.8 s, Runner 0.5 s, Brute 2.0 s, Flyer 1.0 s, Warden 3.0 s. Multiply base spacing by max(1, 2 − 0.1 × (wave − 1)), so wave 1 enemies arrive twice as far apart and spacing reaches normal at wave 11. Without this ramp, no opening build survived wave 1 in simulation. Swarm packs are 10 Swarmlings, 0.15 s apart, with 3 s between packs. There is a 2 s gap between groups. From wave 11, groups alternate between spawn A and spawn B, starting with A.

| Wave | Composition | What it tests |
| --- | --- | --- |
| 1 | 10 Grunt | Build a first maze |
| 2 | 14 Grunt | Make the maze longer |
| 3 | 8 Grunt, 6 Runner | Speed |
| 4 | 6 Grunt, 12 Runner | Speed in volume. **Run upgrade pick after.** |
| 5 | 10 Grunt, 3 Brute | Armor (first Brute) |
| 6 | 6 Grunt, 3 Swarm packs | Splash and Overload |
| 7 | 10 Grunt, 6 Flyer | Air (first Flyer). The maze doesn't help. |
| 8 | 12 Grunt, 3 Brute, 2 Warden | Shields and priority. **Run upgrade pick after.** |
| 9 | 15 Runner, 2 Swarm packs, 4 Flyer | Mixed breadth |
| 10 | 12 Grunt, then Colossus | **Boss 1.** Total damage and slow |
| 11 | 16 Grunt, 8 Runner | Spawn B opens. Rethink the maze. |
| 12 | 8 Grunt, 6 Brute, 2 Warden | Armor wall. **Run upgrade pick after.** |
| 13 | 3 Swarm packs, 6 Flyer | Splash plus air |
| 14 | 8 Grunt, 20 Runner, 3 Warden | Fast shielded rush |
| 15 | 10 Grunt, 8 Brute, 3 Warden | Heavy armor spike |
| 16 | 3 Swarm packs, 12 Flyer | Air spike. **Run upgrade pick after.** |
| 17 | 16 Runner, 6 Brute, 6 Flyer, 2 Warden | Everything at once |
| 18 | 20 Runner, 10 Brute, 4 Warden | Pre-boss pressure |
| 19 | 10 Runner, 10 Brute, 4 Warden, 10 Flyer, 3 Swarm packs | Final exam |
| 20 | 6 Brute, 4 Warden, 6 Flyer, then Colossus | **Boss 2.** Win condition |

### Wave flow

- **Build phase:** untimed. The next wave's composition shows as icons with counts, and arrows mark which spawns are active. The player presses Start.
- **Wave phase:** enemies spawn per the table. Building, upgrading, selling and rewiring all stay allowed.
- **Wave clear:** when every enemy from a wave has died or leaked, pay that wave's clear bonus. When the board is empty and nothing is left to spawn, pay interest, show the stats panel for the waves just finished, and return to the build phase. If wave 4, 8, 12 or 16 was cleared since the last build phase, the Overclock picker opens first.
- **Win:** clear wave 20 with at least 1 life left.
- **Lose:** lives reach 0. The run ends at once.

### Run upgrades (Overclocks)

After waves 4, 8, 12 and 16, the player picks 1 of 3 random Overclocks from the pool, without repeats. They last for the whole run. This makes each run's best maze different and adds the run-to-run variety that brings players back.

| Overclock | Effect |
| --- | --- |
| Long Tethers | Link range +1.5 tiles |
| Extra Slot | All nodes +1 link slot |
| Hair Trigger | Bolt fire rate +30% |
| Deep Freeze | Frost slows +10 points. The Chill cap rises to 70%; the global cap stays 60% for everything else. |
| Big Shells | Mortar splash radius +40% |
| Conductive | All beam damage +25% |
| Instant Charge | Link charge-up time is 0 |
| Bounty Hunter | Kill bounty +25% |
| Compound Interest | Interest rate 15%, cap 45 |
| Salvage | Selling always refunds 100% (still build phase only) |
| Reinforced Core | +8 lives now |
| Resonance | A node with every link slot filled gets +25% to its own damage |

## Roguelike run: the Expedition

The main mode is an **Expedition**: 3 acts on 3 freshly generated maps, about 40 to 50 minutes. You pick your route through forks, draft tools that change how beams behave, and carry your towers from act to act. Losing all lives ends the run; unlocks persist. The fixed 20-wave Canyon run above stays in the game as the **Proving Ground** (tutorial and practice) and remains the balance reference.

&#91;embedded content: Expedition run structure · 3 acts, 18 steps\]

### Acts

| Act | Map biome | Spawns | Enemy pool | Boss (step 6) |
| --- | --- | --- | --- | --- |
| 1 | Canyon: 7 to 10 rock clusters | 1 (spawn B stays sealed) | Grunt, Runner, Brute, Swarmling | **Colossus** |
| 2 | Ruins: 9 to 13 clusters, 3 Conduit tiles | 2 (B opens at step 3) | Adds Flyer and Warden | **Hive Queen** |
| 3 | Rift: 10 to 14 clusters, 3 Conduit tiles | 2 from the start | All, elites more common | **Phase Walker** |

Each act has 6 steps: an opening wave, 4 forks, then the boss. Difficulty follows a **depth** value D. It starts at 1, rises by 1 after each Combat, Elite or boss step, and by 0.5 after each Shop, Forge or Event step. Depth maps onto the Proving Ground's validated curves, stretched so an all-combat route meets the last boss at reference wave 20: **w = 1 + (D − 1) × 19/17**. Then HP multiplier = 1.10^(w − 1), spacing multiplier = max(1, 2 − 0.1 × (w − 1)), bounty multiplier = 1 + 0.04 × (w − 1), clear bonus = 20 + 5w, and the interest cap = 15 + 5w (round w down for gold). Because non-combat steps add only half a step of depth, skipping a fight trades income for an easier road, which keeps routing a real decision.

**Conduit tile:** a buildable tile. A node standing on it adds +1 to the level of every beam it anchors. Beam level is capped at 7 from all sources (m at most 3.5).

### Forks

After each step, the player picks the next step from 3 face-up cards (2 at the first fork of the run). Each card shows exactly what it is, its enemies if any, and its reward, so routing is a planning decision, never a gamble.

| Card | Offer weight | Rules | Reward |
| --- | --- | --- | --- |
| **Combat** | 55% | A generated wave (see Wave generation) | Bounty and clear bonus, then pick 1 of 3: two tunings or 60 gold |
| **Elite** | 15% (25% in Act 3), from run step 3 | Threat budget × 1.6 plus 1 elite modifier | Pick 1 of 3: relics (uncommon or rare), or a blueprint if you lack one and none was taken this act. Plus 50 gold. |
| **Shop** | 10% | Entering pays 40 + 4w gold. Offers 4 items (tunings 90 to 140, relics 160 to 260, at most 1 blueprint at 120) plus services: +3 lives for 60, remove a tuning for 75. | What you buy |
| **Forge** | 10% | Upgrade two nodes a tier for free, or change one node to another type you hold a blueprint for, keeping its tier | The upgrades |
| **Event** | 10% | Entering pays 40 + 4w gold, then one of 8 short choices with a cost, for example "Unstable Conduit: all Arc beams +1 level this act, lose 3 lives" | As written |

Fork rules: every fork offers at least one Combat or Elite card; never more than 2 non-combat steps in a row; each act offers at least one Elite and one Shop. Blueprints come only from Elites and Shops, at most one per act, so a loadout's identity lasts. **Timing:** the next fork is chosen during the current wave, once its last group has spawned. If the chosen card is Combat or Elite, the player may call it early as usual; drafts are picked at the next build phase.

### Wave generation

- **Threat budget:** B = 10 + 2 × (w − 1) + 0.25 × (w − 1)², using w from depth. Elites × 1.6. This reproduces the validated wave table's size at reference waves 1, 8 and 19 (10, 36, 127 against 10, 38, 109).
- **Threat cost per enemy:** Grunt 1, Runner 0.8, Swarm pack 3, Flyer 1.6, Warden 4, Brute 6.
- **Templates:** each wave draws 1 of 10 templates (Column, Rush, Phalanx, Swarm, Air Raid, Escort, Pincer, Siege, Stagger, Mixed). A template sets the share of the budget each enemy type gets and the group order. No template repeats within an act.
- **Introduction gates (by w):** Runner from 3, Brute 5, Swarmling 6, Flyer 9, Warden 10. A type's first wave puts it in a group of its own, so the player learns it in isolation.
- **Spawns:** with 2 open spawns, groups alternate spawns starting with A, as in the Proving Ground.

**Elite modifiers** (one per Elite wave, shown on the card): *Shielded*, every enemy starts with a shield of 30% of its HP; *Hasty*, +30% speed; *Splitting*, enemies split into 2 copies at 30% HP on death (copies don't split, pay no bounty, and cost 1 life each if they leak); *Armored*, +20 armor; *Regenerating*, enemies heal 2% of max HP per second when not damaged for 2 s.

### Bosses

A boss that reaches the core deals 15 lives of damage and is destroyed. Any slow on a boss is clamped to 30%, and stops don't affect bosses. Boss HP is fixed (not scaled by depth). Bounties: 150, 300 and 500.

| Boss | Act | HP | Speed (tiles/s) | Armor | Mechanic | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| **Colossus** | 1 | 2,500 | 0.5 | 30% | None; a pure damage check | Total damage |
| **Hive Queen** | 2 | 8,000 | 0.45 | 20% | Every 8 s, releases a pack of 6 Swarmlings (scaled by depth) at her position, at most 10 packs | Splash under pressure |
| **Phase Walker** | 3 | 16,000 | 0.5 | 30% | Every 10 s, marks a spot 4 tiles ahead on its path for 2 s, then blinks there. Never blinks into the last 6 tiles. | A single kill zone isn't enough |

### Between acts

- **Nodes** go into an inventory with their tiers and tunings. At the next act's setup, the player places them for free.
- **Ghost layout:** at setup, the previous act's layout is shown as a ghost aligned to the new core. One click places every piece that is still legal on the new map; then the player adjusts. This keeps act transitions to a minute of decisions, not five minutes of clicking.
- **Walls** are refunded 100%, so rebuilding the maze costs nothing net.
- **Gold, relics and tunings** carry over. Links are rewired fresh.
- **Lives** carry over (max 20, or 28 with Reinforced Core). Between acts, lives heal by 5 and to at least 12, so one boss leak doesn't doom the next act.
- **Act reward:** pick 1 of 3 boss relics (rare).
- **Setup phase** at each act start is untimed and shows the opening wave. Once per act, before placing anything, the player can **reroll the map**.

**Saving:** the run autosaves at every step boundary as seed plus command log. Resuming replays it deterministically, so there is no separate save format to maintain. The run seed derives one independent RNG stream each for maps, forks, drafts, shops, events and wave templates, so a map reroll never shifts what the forks or drafts would have offered.

## Draft pool

Runs differ because of what you draft. There are three kinds of drafts. **Blueprints** unlock a node type. **Tunings** change how one beam or node type behaves. **Relics** bend a global rule. Tunings and relics never stack with themselves; each can be held once per run. Rarity weights for normal drafts: common 60%, uncommon 30%, rare 10%.

### Blueprints

A run starts with Walls and the loadout's two node types. The third type must be drafted, and blueprints appear only in Elite rewards and Shops, at most one per act. Until then, only the beams your two types can make exist. This alone makes runs play differently: an Engineer (Bolt + Frost) has Arc, Chill and Shatter but no answer to swarms except Bolts, and may go a whole act without Mortar.

### Tunings (32)

| Target | Common | Uncommon | Rare |
| --- | --- | --- | --- |
| **Arc** | *Overcharge*: +30% damage to enemies above 50% HP | *Forked Arc*: also hits the nearest off-beam enemy within 1.5 tiles for 40% | *Static Field*: Arc also hits Flyers |
| **Chill** | *Permafrost*: linger 3 s → 5 s | *Shatterpoint*: enemies slowed 50% or more take +20% from Bolts | *Cryo Net*: Chill also hits Flyers |
| **Minefield** | *Quick Fuse*: rearm 2 s → 1.2 s | *Cluster Mines*: blast radius 1 → 1.6 tiles | *Seismic*: blasts also stop enemies for 0.5 s (bosses immune) |
| **Shatter** | *Deep Cracks*: Brittle +30% → +45% | *Lingering Fracture*: Brittle lasts 6 s | *Glass Cannon*: Brittle enemies take 1.5× from all explosions |
| **Overload** | *Short Circuit*: explosion radius 1 → 1.5 | *Cascade*: explosions apply Charged to what they hit (each enemy still explodes once) | *Capacitor*: explosion damage +2% per kill this wave, max +60% |
| **Tar** | *Corrode*: Shred 30 → 50 | *Sticky*: Tar slow 20% → 35% | *Flammable*: Mortar shells on Tarred enemies deal +50% and leave fire (15 dps, 2 s) |
| **Bolt** | *Fast Hands*: +20% fire rate | *Piercing*: each bolt also hits 1 enemy behind its target | *Railgun*: every 5th shot deals 4× |
| **Frost** | *Wide Pulse*: radius +0.5 | *Hailstorm*: pulses deal 2× to Flyers | *Absolute Zero*: every 4th pulse stops enemies for 0.6 s (bosses slowed 30% instead) |
| **Mortar** | *Napalm*: shells leave burning ground (1 tile, 10 × tier dps, 2 s) | *Airburst*: can target Flyers for 50% damage | *Siege Shells*: +1.5 max range and +25% damage |

**Volatile tunings** (uncommon, 5 more) carry a real cost, which is what makes "remove a tuning" in the Shop worth having:

| Tuning | Upside | Cost |
| --- | --- | --- |
| *Overdrive* (Arc) | +60% Arc damage | Arc ignores enemies with any armor |
| *Hair-Trigger Mines* (Minefield) | Rearm 2 s → 0.8 s | Mine damage −40% |
| *Glass Shells* (Mortar) | +60% shell damage | Max range −1.5 tiles |
| *Unstable Core* (Overload) | Explosion damage ×2 | Overload beams take 8 s to charge mid-wave |
| *Brittle Frost* (Frost) | Pulses apply Brittle | Frost slows −15 points |

A **stop** is a slow of 100% that ignores the 60% cap; it is the only effect allowed to. After any stop ends, that enemy is immune to stops for 3 s, so stops can't be chained into a permanent lock. Bosses are immune to stops. Tunings that let beams hit Flyers (*Static Field*, *Cryo Net*) override the Flyer's beam immunity.

### Relics (24)

The 12 Overclocks of the Proving Ground become common and uncommon relics. Twelve new ones are added, weighted toward rule-benders, because those make runs feel different rather than just stronger.

| Relic | Rarity | Effect |
| --- | --- | --- |
| Long Tethers, Extra Slot, Hair Trigger, Deep Freeze, Big Shells, Conductive, Instant Charge, Bounty Hunter, Compound Interest, Salvage, Reinforced Core, Resonance | Common / uncommon | As in the Proving Ground's Overclocks, except: Instant Charge becomes a 1.5 s mid-wave charge; Compound Interest gives 15% interest with 1.5× the normal cap; Reinforced Core raises max lives to 28 and heals 8 |
| **Prism Lens** | Rare | Beams may pass through one Wall tile (not rock or nodes); beam damage on the far side of that wall is halved |
| **Tripwire** | Uncommon | The first non-elite, non-boss enemy each wave to touch any beam is stopped for 2 s |
| **Siphon** | Uncommon | 1 gold per 100 beam damage dealt, max 40 per wave |
| **Wide Grid** | Rare | Tier-1 nodes get +1 link slot |
| **Cheap Stone** | Common | Walls cost 7 |
| **Bounty Board** | Common | Elite waves pay +100 gold |
| **War Chest** | Uncommon | +150 gold now |
| **Lucky Draft** | Uncommon | Every draft offers 4 options |
| **Field Medic** | Common | Heal 3 lives at the start of each act |
| **Overflow** | Rare | Bolt overkill damage jumps to the next enemy within 2 tiles |
| **Conduit Mastery** | Uncommon | Conduit tiles give +2 beam levels instead of +1 |
| **Momentum** | Uncommon | Each early call gives +5% damage for the rest of the act, max +30% |

### Archetypes the pool supports

The pool is designed so that a few drafts point a run toward a recognizable build, so players chase a plan rather than just bigger numbers.

| Archetype | Core drafts | How it plays |
| --- | --- | --- |
| **Cryo Lattice** | Chill, Permafrost, Shatterpoint, Deep Freeze | Long freeze corridors feeding Bolts |
| **Chain Reactor** | Overload, Cascade, Short Circuit, Capacitor | Swarms detonate each other |
| **Minefield Carpet** | Minefield, Quick Fuse, Cluster Mines, Wide Grid | Many short Mortar pairs across every corridor |
| **Tar Pit** | Tar, Corrode, Flammable, Napalm | Armor melts in burning ground |
| **Railgun** | Bolt, Railgun, Overflow, Hair Trigger | Few, heavily upgraded Bolts with long sightlines |
| **Prism Weaver** | Arc, Prism Lens, Long Tethers, Conductive | Beams through walls; geometry-heavy |

The balance harness should include one bot per archetype. No archetype's win rate should beat the median archetype's by more than 15 points.

## Procedural maps

Every act generates a fresh 24 × 14 map from the run seed. Because players build the maze around the rocks, a new rock layout is a new puzzle, which is the cheapest source of replayability this design has. The generator below is implemented in mapgen.js (in the zip) and tested: across 3,000 seeds with all checks on it never failed, needed at most 14 attempts, and averaged about 30 ms per map.

### Generator (canonical orientation: core on the right)

1. **Core:** 2 × 2 on the right edge, top row chosen from rows 3 to 9.
2. **Spawn A:** 2 tiles on the left edge, top row from 1 to 11. **Spawn B:** 2 tiles on the top or bottom edge, left column from 6 to 15.
3. **Rocks:** place N rectangular clusters (1 to 2 by 1 to 3 tiles, either orientation), N per the act's biome. Skip any cluster within 2 tiles of a core or spawn tile.
4. **Validate**, or retry with the next random draw:
   - both spawns reach the core;
   - open path length from A is 20 to 34 (Act 1), 20 to 36 (Act 2) or 22 to 38 (Act 3), and from B 12 to 34 in every act;
   - at most 4 open tiles are unreachable from the core;
   - **maze potential is at least 75 tiles** from A and 35 from B (below).
5. **Conduits** (Acts 2 and 3): 3 buildable tiles within 3 tiles of A's open path, at least 4 tiles apart.
6. **Presentation:** mirror the map horizontally on a 50% coin flip so the core is sometimes on the left. Mirroring is display-only; the sim always runs the canonical orientation.

### Maze potential (the fairness check)

Try 16 standard serpentine wall layouts (column spacing 3 or 4, every offset, gaps starting top or bottom), build each on a scratch grid while keeping both spawns connected, and keep the layout with the best (A path + half the B path). Reject the map if that layout's path is under 75 tiles from A or under 35 from B. Without the B floor, 10% of maps let spawn B's enemies skip most of any maze (best B path 22 to 26 tiles). Generate the next act's map in a Web Worker during the boss wave so the transition is instant.

**Why the check exists:** a bot played 80 runs across 40 generated maps. Its results on random maps were no worse than on the hand-made Canyon with the same plan. But the weakest maps all had a low maze potential (49 to 67 tiles), and filtering at 75 removed half of the maps where the bot never got past wave 9. The free reroll once per act covers the rest.

**What the playtest must still check:** the bot's generic plan is crude, so map-to-map spread for humans is unknown. Log the seed with every run and flag any seed whose win rate is more than 20 points below the mean once data exists.

## Meta-progression

Meta-progression widens your options; it never makes you stronger. A veteran's run and a new player's run on the same seed and loadout start with identical power. This keeps every win earned and keeps daily seeds fair.

### Loadouts

Each loadout sets the two starting blueprints, 2 free tier-1 nodes in the inventory, and one starting tuning or relic. Starting gold is 250 for all.

| Loadout | Blueprints | Free nodes | Starts with | Unlock | Plays as |
| --- | --- | --- | --- | --- | --- |
| **Engineer** | Bolt, Frost | Bolt, Frost | *Fast Hands* | Default | Forgiving all-rounder |
| **Sapper** | Bolt, Mortar | Bolt, Mortar | *Quick Fuse* | Defeat the Act 2 boss once | Splash and mines |
| **Alchemist** | Frost, Mortar | Frost, Mortar | *Corrode* | Win once | No Bolt: must draft one or find anti-air another way |
| **Architect** | Bolt only | 2 Bolts | *Cheap Stone* and *Long Tethers* | Win at Heat 3 | Huge mazes, few node types |

### Unlock track

Each run earns Expedition XP equal to its score. Fifteen levels each add 2 or 3 items (tunings, relics, events, elite modifiers) to the draft pools. A new profile starts with about 70% of the content, so early runs stay readable and later runs keep surprising. Level costs: 1,000 XP rising by 250 per level (41,250 XP in total). A losing run scores about 1,000 to 2,500 and a win 5,000 or more, so all content unlocks in roughly 15 to 25 runs.

### Heat (difficulty levels)

Winning unlocks the next Heat level. Each level adds its rule on top of all lower ones.

| Heat | Rule added |
| --- | --- |
| 1 | Elite waves +20% HP |
| 2 | Start with 175 gold |
| 3 | Shops offer 2 items instead of 4 |
| 4 | Bosses +25% HP |
| 5 | Start with 15 lives |
| 6 | Shop prices +25% |
| 7 | Enemies +10% speed |
| 8 | No interest |
| 9 | One extra Elite per act, forced |
| 10 | The Act 3 boss is followed by a second Phase Walker at full HP |

### Score, daily seed and summary

- **Score:** 100 per Combat, Shop, Forge or Event step, 300 per Elite, 1,000 per boss, 50 per life left at the end, all × (1 + 0.1 × Heat).
- **Daily Expedition:** one shared seed per UTC day, Engineer loadout, Heat 0, the full content pool regardless of unlocks (so every player sees the same offers), one attempt. The leaderboard is local for now; the deterministic command log makes an online, verifiable leaderboard a later add.
- **Run summary screen:** score, seed (copyable), loadout, a timeline of the route taken, drafts in order, damage share by node and beam, and the wave that ended the run.
- **Profile:** one versioned JSON object in localStorage holding unlocks, Heat, XP, stats and settings. Offer export and import as a text string, since browser storage can be cleared.

## Controls, UI, and feedback

Every action works with the mouse alone. Hotkeys make it faster. Every action also works while paused, so planning never needs fast hands.

### Controls

| Action | Mouse | Key |
| --- | --- | --- |
| Choose a node to build | Click its card in the build bar | Q Wall, 1 Bolt, 2 Frost, 3 Mortar |
| Place | Left-click a tile. Shift + click keeps the same piece selected. With Wall selected, left-drag paints a line of walls: each tile is validated in order, and painting stops at the first tile that would block the path. |  |
| Cancel placing or linking | Right-click | Esc |
| Link two nodes | Left-drag from one node to another |  |
| Select a node | Left-click it |  |
| Upgrade selected | Panel button | U |
| Sell selected | Panel button | S |
| Toggle target mode | Panel button | T |
| Remove a beam | Right-click the beam |  |
| Start wave or call early | Start button | Space |
| Pause | Pause button | P |
| Game speed 1×, 2×, 3× | Speed button | F to cycle |

### Screen layout

- **Top bar:** lives, gold, wave "7 / 20", the next wave preview (icons with counts), Start, speed and pause.
- **Board:** center, 1152 × 672 px. The layout scales to fit with whole-pixel scaling where possible.
- **Build bar** (bottom): a Wall card and 3 node cards showing cost and hotkey. Selecting a placed Wall shows a Convert row with the 3 node types and their conversion costs. A card grays out when the player can't afford it.
- **Node panel** (right, on select): tier, stats, beams with their names and levels, target mode, upgrade cost, sell value.
- **Overclock picker:** a modal with 3 cards. The game pauses while it is open.

### Previews (the readability contract)

- **Placing:** a ghost node, its range circle, the new path from each active spawn as a dotted line, and the path change in tiles. An invalid tile shows red with the reason ("Blocks path" or "Enemy here").
- **Linking:** while dragging, the beam draws in its color with its name ("Shatter"), its level, and its **path exposure**, the total tiles of current ground path within contact range of the beam (for example "Path under beam: 3.5 tiles"). This one number teaches the geometry skill. Out of range or no free slot shows red with the reason.
- **Hover on a node or beam:** a tooltip with its stats and the damage it dealt last wave.

### Feedback

- **Hits:** a white flash on the enemy for 1 frame and a small particle burst at impact. Mortar shells show a shadow at the landing point during flight.
- **Beams:** Each beam type has a color and a distinct line pattern (solid, dashed, dotted, double, zigzag, chain), so beams read without color. A beam brightens while an enemy is on it. A beam with no path under it draws at 30% opacity. Holding Tab shows a damage heat overlay: each path tile tinted by the total beam damage per second on it.
- **Statuses:** Slow tints the enemy blue. Brittle shows cracks. Charged shows a yellow spark. Shred shows a broken armor pip.
- **Kills:** a death pop and a floating "+4" gold text that drifts up and fades over 0.6 s.
- **Leaks:** the core shakes, a red edge vignette flashes, and the lives counter pulses. A red marker stays for 3 s where the enemy left the maze.
- **Wave stats panel** (after each wave): damage dealt per node and per beam as a sorted bar list, kills, leaks, and gold earned. This is how players learn why they won or lost.
- **Audio:** distinct short sounds for each node fire, beam contact (a soft hum that rises with load), kill, leak, wave start, and wave clear. Limit to 8 simultaneous sound effects, with a cap per sound type.

## Technical architecture

The core rule: **the simulation is a pure, deterministic function of (seed, content data, input commands)**, and nothing else touches game state. Rendering, UI and audio only read it. This one decision buys reproducible bugs, a headless balance harness, replays, and server-checkable leaderboards later, at almost no cost now.

&#91;embedded content: runtime architecture · 9 parts\]

Players and the balance harness drive the same simulation through the same commands, so every balance result is a result about the real game.

### Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, strict mode | Type-safe content data and sim state |
| Build | Vite | Fast dev loop, static output, deploys to any static host |
| Rendering | Canvas 2D, one canvas | Peak load is about 150 enemies, 60 nodes and 40 beams, well inside Canvas 2D limits. Move to PixiJS only if profiling demands it. |
| UI | Plain DOM overlay (top bar, build bar, panels, modals) | Crisp text, accessible buttons, no framework needed at this size |
| Audio | Web Audio API, preloaded short buffers | Low latency, per-sound voice caps |
| Persistence | localStorage: settings and best result only | No accounts or backend for the core loop |
| Tests | Vitest, running the sim headless in Node | Unit tests plus scripted full-run balance tests |

### Simulation

- **Fixed timestep** of 1/30 s. The render loop runs at display rate, accumulates real time × game speed, and runs as many sim steps as fit (at most 8 per frame). It renders with interpolation between the last two states.
- **Seeded RNG** (mulberry32), owned by the sim, with a separate stream per use so a change in one system never shifts another. In the core loop the only random draw is the Overclock offers. `Math.random` is banned in sim code.
- **Commands, not mutations.** UI input becomes commands such as `Build{type,c,r}`, `Convert{id,type}`, `Upgrade{id}`, `Sell{id}`, `Link{a,b}`, `Unlink{a,b}`, `SetTarget{id,mode}`, `StartWave`, and `PickOverclock{i}`. A command issued during frame N applies at the start of the next sim tick and is validated against the state at that moment; the sim rejects invalid commands with a reason code the UI shows. The log records each command with that tick. A replay is just the seed plus the command log.
- **Step order each tick** (fixed, documented, tested): (1) apply queued commands, (2) spawn, (3) beam status pass: apply slow, Brittle, Charged and Shred from every active beam, (4) node attacks, (5) shells that land this tick, (6) beam damage pass, (7) resolve the explosion queue, (8) Warden shields, (9) movement and leaks, (10) remove dead enemies, then check wave clear, win and loss. Splitting statuses from damage means results never depend on the order links were made.
- **State layout:** plain arrays of plain objects (an ECS-lite), with stable integer ids. Grid occupancy is a `Uint8Array`; the flow field is an `Int32Array`.
- **Pathing:** BFS flow field from the core tiles, 4-neighbor, with a fixed tie-break order (right, down, up, left). Recompute on any build or sell (336 tiles, well under 1 ms). Placement validation runs BFS on a scratch copy.
- **Beam contact:** a point-to-segment distance check per ground enemy per active beam per tick. At peak that is about 150 × 40 checks, which is cheap. Add a uniform grid bucket only if profiling says so.
- **Floating point:** use only + − × ÷ and `Math.sqrt` in the sim. Write distances as `sqrt(dx*dx + dy*dy)`, never `Math.hypot`, whose results can differ between JS engines. These operations are bit-exact across browsers under IEEE 754, which keeps replays and future leaderboards verifiable.

### Content as data

All numbers in this spec live in one typed `content.ts`: nodes, the Wall, beams, enemies, waves, Overclocks, map and economy constants. Designers tune without touching logic. The sim reads content through a frozen object, so a balance build can load an alternate content file.

### Balance harness (keep from day one)

Port the prototype simulator used to validate this spec into the repo as `/tools/balance`. It runs the real sim headless with scripted bot strategies, across many seeds, and prints win rate, wave reached, damage share by source, leaks by enemy type, and run length. CI runs it on every content change over 200 seeds and fails if the reference strategy's win rate moves by more than 10 points without a matching change to the expected values file. Add adversarial bots alongside the reference one: a dense maze builder, an early caller, a mid-wave rewirer, and a mid-wave builder trying to juggle enemies. Any adversarial bot beating the reference bot's win rate by 20 or more points is a balance bug.

## Build order, acceptance criteria, and playtest

Build in eight milestones. Each one ends playable, and the riskiest question gets answered first: does wiring beams across a maze feel good?

1. **Grid and pathing.** Map, Walls, flow field, placement validation with reasons, path preview, Grunts walking to the core, lives, and the loss screen. *Done when* you can build any legal maze and never trap an enemy.
2. **Nodes, beams and the loop.** All three nodes, links with charge-up, all six beams, statuses, the wave table, gold, build and wave phases, and the win screen. Use placeholder art. *Done when* someone can play waves 1 to 10 and has a reason to rewire. **First playtest happens here.** The hook lives or dies at this milestone.
3. **Proving Ground complete.** All seven enemies, waves 11 to 20, spawn B, upgrades, sell and undo, Wall conversion, target modes, Overclocks, interest and early call.
4. **Readability and juice.** Link preview with path exposure, the wave preview, the per-wave stats panel, hit and kill feedback, audio, pause and speed controls, and final art.
5. **Balance harness.** Port the simulator, add the adversarial bots, wire CI.
6. **Expedition skeleton.** Map generator with the maze-potential check, acts, forks with Combat and Elite cards, wave generation, inventory carry-over, the three bosses, autosave and resume. *Done when* a full 3-act run is playable with no drafts. **Second playtest here:** do random maps and forks feel good?
7. **Drafts and shops.** Blueprints, all 27 tunings, all 24 relics, Shop, Forge, Events, and the run summary.
8. **Meta and polish.** Loadouts, the unlock track, Heat 1 to 10, the daily Expedition, profile export, and a balance pass with one harness bot per archetype.

### Acceptance criteria for the core loop

- [ ] A full run from wave 1 to win or loss works with mouse only, and every action also works while paused.
- [ ] Same seed plus same command log gives an identical final state (checked by an automated test, 100 replays).
- [ ] No legal input can trap an enemy or soft-lock the game. Fuzz test: 10,000 random command sequences.
- [ ] Every rejected action shows its reason within 1 frame.
- [ ] Link preview shows beam name, level and path exposure while dragging.
- [ ] The wave stats panel shows damage per node and per beam after every wave.
- [ ] 60 fps at 3× speed during wave 19 on a 2020 mid-range laptop in Chrome, Firefox and Safari.
- [ ] Under 2 s from page load to first input, and under 5 MB total download.
- [ ] Over 200 seeds, the harness's reference strategy wins 25 to 50% without Overclocks and 60 to 90% with them, and no single-node-type strategy wins more than 30%.

**Roguelike layer:**

- [ ] The same run seed and command log reproduce the same maps, fork offers, drafts and outcome.
- [ ] Quitting mid-run and resuming lands on the exact same state.
- [ ] 10,000 generated maps pass validation with no failures, and generation including the maze-potential check stays under 150 ms per map.
- [ ] Every fork satisfies the fork rules (combat always offered, at least one Elite and Shop per act) across 10,000 seeded acts.
- [ ] Meta-progression never changes a stat: the same seed and loadout give identical starting power on a new and a maxed profile.

### Playtest metrics and targets

| Metric | Target | If it misses |
| --- | --- | --- |
| First-run win rate (new players) | 20 to 40% | Too low: soften waves 7, 10 and 13 first. Too high: raise HP growth from 1.10 toward 1.11. |
| Win rate by a player's third run | 50 to 70% | If it doesn't rise, the game isn't teaching. Check that path exposure is visible and understood. |
| Run length (Proving Ground / Expedition) | 20 to 25 min / 40 to 50 min | Tune group spacing and steps per act, not HP. |
| Beam share of damage in winning runs | 25 to 45% | Low: beams are ignored, so check the link UX before the numbers. High: nodes feel pointless. |
| Each beam type used in 30%+ of winning runs | All 6 | Buff a beam's niche, not its raw damage. |
| Each node type in 50%+ of winning runs | All 3 | Watch Frost hardest; it relies on synergy. |
| Mid-wave rewires per run | 3 or more for winners | If near 0, rewiring isn't worth it. Try a shorter charge-up before cutting the feature. |
| Deaths attributed to "didn't know why" (exit survey) | Under 15% | Improve leak markers and the stats panel. |

**Open risks to watch in the first playtest:** (1) whether the geometry skill is fun or fiddly, so watch players use the exposure number; (2) whether placing about 55 walls feels tedious even with drag-to-paint; (3) whether Flyer waves feel unfair, in which case show the flight line during the build phase; and (4) whether mid-wave rewiring feels like a decision or busywork.

**Roguelike metrics** (from milestone 6 on):

| Metric | Target | If it misses |
| --- | --- | --- |
| Runs before a new player's first win | 5 to 10 | Fewer: raise Act 1 budgets or add Heat earlier. More: lower Act 2 boss HP first. |
| Players who start another run within 2 minutes of a loss | 60% or more | The loss felt unfair or slow: check the summary screen and the seeds that killed them. |
| Pick rate per fork card type | Every type 10 to 60% | Never picked: raise its reward. Always picked: it's mandatory, so lower it. |
| Pick rate per tuning or relic when offered | 15 to 60% | Outside the band: rework the effect, not just its numbers. |
| Win-rate spread across archetype bots | Within 15 points of the median | Buff the weakest archetype's rare. |
| Win rate by map seed | No seed 20+ points below the mean | Tighten the generator's checks. |

## Out of scope, and where it grows

The core loop above is complete without any of these. The architecture leaves a clean seam for each.

| Later feature | Why it's deferred | Seam that makes it easy |
| --- | --- | --- |
| A 4th node type | Takes beams from 6 to 10 pairs; add only once the 6 are balanced | Pair table is data |
| More bosses and biomes | 3 bosses and 3 biomes prove the structure | Boss and biome tables are data |
| Online leaderboards for the daily seed | Needs a server to re-simulate submitted runs | Deterministic sim plus command log is a verifiable replay |
| Endless mode after Act 3 | Needs a tuned Heat curve first | Step k and the threat budget already extend past 21 |
| Touch and mobile | Drag-to-link and hover tooltips need a rethink | Commands are input-agnostic |
| Replays and sharing | Not needed to prove fun | Seed plus command log |
| Co-op | Large scope | Command stream is network-ready |

**One rule for adding content:** add combinations before adding parts. A new enemy should punish a strategy the current six don't. A new Overclock should change *where* you build, not just add numbers.

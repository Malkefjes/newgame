// The LATTICE simulation: a pure, deterministic function of (seed, content, commands).
// Rendering, UI and audio only read it. Fixed timestep of 1/30 s.

import {
  CONTENT, beamFor,
  type BeamType, type Content, type EnemyType, type NodeType, type OverclockId, type PieceType,
} from './content';
import { dist, segDist, segHitsTile } from './geom';
import { CANYON, type MapDef } from './map';
import { stream, type Rng } from './rng';

export type TargetMode = 'first' | 'strongest';
export type Phase = 'build' | 'wave' | 'won' | 'lost';

export type Command =
  | { t: 'build'; type: PieceType; c: number; r: number }
  | { t: 'convert'; id: number; type: NodeType }
  | { t: 'upgrade'; id: number }
  | { t: 'sell'; id: number }
  | { t: 'link'; a: number; b: number }
  | { t: 'unlink'; a: number; b: number }
  | { t: 'target'; id: number; mode: TargetMode }
  | { t: 'start' }
  | { t: 'pick'; i: number };

export type Result = { ok: true } | { ok: false; reason: string };

export interface Piece {
  id: number;
  type: PieceType;
  tier: number;
  c: number;
  r: number;
  x: number;
  y: number;
  cd: number;
  spent: number;
  spentThisPhase: number;
  mode: TargetMode;
  /** Damage from the node's own attacks, plus half of each of its beams', this wave phase. */
  dmgPhase: number;
  dmgLast: number;
}

export interface Link {
  id: number;
  a: number;
  b: number;
  beam: BeamType;
  charge: number;
  mineTimer: number;
  load: number;
  dmgPhase: number;
  dmgLast: number;
}

export interface Enemy {
  id: number;
  type: EnemyType;
  wave: number;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  shield: number;
  speed: number;
  armor: number;
  leak: number;
  bounty: number;
  air: boolean;
  boss: boolean;
  tc: number;
  tr: number;
  pc: number;
  pr: number;
  slowV: number;
  slowU: number;
  brittleU: number;
  chargedU: number;
  chargedM: number;
  chargedLink: number;
  shredU: number;
  wardT: number;
  alive: boolean;
  exploded: boolean;
  hitTick: number;
}

export interface Shell {
  x: number;
  y: number;
  sx: number;
  sy: number;
  fireTick: number;
  landTick: number;
  damage: number;
  radius: number;
  node: number;
}

export interface Projectile {
  x: number;
  y: number;
  px: number;
  py: number;
  target: number;
  damage: number;
  node: number;
}

interface SpawnEvent { at: number; type: EnemyType; spawn: 'A' | 'B'; slot: number }

export interface ActiveWave {
  num: number;
  startTick: number;
  schedule: SpawnEvent[];
  next: number;
  remaining: number;
  cleared: boolean;
  duration: number;
}

export interface StatLine { key: string; label: string; kind: 'node' | 'beam'; dmg: number }

export interface PhaseSummary {
  waves: number[];
  lines: StatLine[];
  kills: number;
  leaks: number;
  gold: number;
  interest: number;
}

export type GameEvent =
  | { k: 'kill'; x: number; y: number; gold: number }
  | { k: 'leak'; x: number; y: number }
  | { k: 'blast'; x: number; y: number; r: number; kind: 'shell' | 'mine' | 'overload' }
  | { k: 'frost'; x: number; y: number; r: number }
  | { k: 'hit'; x: number; y: number }
  | { k: 'summary'; summary: PhaseSummary };

const NEIGHBORS: [number, number][] = [[1, 0], [0, 1], [0, -1], [-1, 0]];

export interface GameOptions {
  seed?: number;
  content?: Content;
  map?: MapDef;
  /** Overrides the content's starting gold (balance and test harnesses). */
  startGold?: number;
}

export class Game {
  readonly C: Content;
  readonly map: MapDef;
  readonly cols: number;
  readonly rows: number;
  readonly dt: number;
  readonly seed: number;
  private ocRng: Rng;

  /** 1 = rock. */
  readonly rock: Uint8Array;
  readonly noBuild: Uint8Array;
  readonly isCore: Uint8Array;
  /** Piece id per tile, 0 if none. */
  readonly occ: Int32Array;
  flow: Int32Array;
  readonly coreCenter: { x: number; y: number };

  tick = 0;
  phase: Phase = 'build';
  gold: number;
  lives: number;
  maxLives: number;
  /** Highest wave number started. */
  wave = 0;
  lastCleared = 0;

  pieces: Piece[] = [];
  links: Link[] = [];
  enemies: Enemy[] = [];
  shells: Shell[] = [];
  projectiles: Projectile[] = [];
  activeWaves: ActiveWave[] = [];

  overclocks: OverclockId[] = [];
  offer: OverclockId[] | null = null;
  private pendingOffers = 0;

  log: { tick: number; cmd: Command }[] = [];
  events: GameEvent[] = [];
  lastSummary: PhaseSummary | null = null;

  private nextId = 1;
  private bonusThisPhase = 0;
  private stats = new Map<string, StatLine>();
  private phaseKills = 0;
  private phaseLeaks = 0;
  private phaseGold = 0;
  private phaseWaves: number[] = [];
  private explodeQueue: Enemy[] = [];
  private contact = new Map<number, Enemy[]>();

  constructor(opts: GameOptions = {}) {
    this.C = opts.content ?? CONTENT;
    this.map = opts.map ?? CANYON;
    this.seed = opts.seed ?? 1;
    this.ocRng = stream(this.seed, 'overclocks');
    this.dt = 1 / this.C.tickRate;
    this.rows = this.map.rows.length;
    this.cols = this.map.rows[0].length;
    const n = this.cols * this.rows;
    this.rock = new Uint8Array(n);
    this.noBuild = new Uint8Array(n);
    this.isCore = new Uint8Array(n);
    this.occ = new Int32Array(n);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = this.map.rows[r][c];
        if (ch === '#') this.rock[this.idx(c, r)] = 1;
        if (ch !== '.') this.noBuild[this.idx(c, r)] = 1;
      }
    }
    for (const [c, r] of [...this.map.spawnA, ...this.map.spawnB, ...this.map.core]) {
      for (const [dc, dr] of [[0, 0], ...NEIGHBORS]) {
        if (this.inside(c + dc, r + dr)) this.noBuild[this.idx(c + dc, r + dr)] = 1;
      }
    }
    for (const [c, r] of this.map.core) this.isCore[this.idx(c, r)] = 1;
    let sx = 0, sy = 0;
    for (const [c, r] of this.map.core) { sx += c + 0.5; sy += r + 0.5; }
    this.coreCenter = { x: sx / this.map.core.length, y: sy / this.map.core.length };
    this.gold = opts.startGold ?? this.C.economy.startGold;
    this.lives = this.C.economy.lives;
    this.maxLives = this.lives;
    this.flow = this.computeFlow(-1);
  }

  // ---------------------------------------------------------------- grid helpers

  idx(c: number, r: number): number { return r * this.cols + c; }
  inside(c: number, r: number): boolean { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }
  blocked(i: number): boolean { return this.rock[i] === 1 || this.occ[i] !== 0; }

  /** BFS distance-to-core per tile. `extra` is a tile index to treat as blocked (or -1). */
  computeFlow(extra: number, freed = -1): Int32Array {
    const d = new Int32Array(this.cols * this.rows).fill(-1);
    const q: number[] = [];
    for (const [c, r] of this.map.core) { const i = this.idx(c, r); d[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], c = i % this.cols, r = (i / this.cols) | 0;
      for (const [dc, dr] of NEIGHBORS) {
        const cc = c + dc, rr = r + dr;
        if (!this.inside(cc, rr)) continue;
        const j = this.idx(cc, rr);
        if (d[j] >= 0 || j === extra || (j !== freed && this.blocked(j))) continue;
        d[j] = d[i] + 1;
        q.push(j);
      }
    }
    return d;
  }

  spawnBOpen(): boolean { return this.wave >= this.C.spawning.spawnBOpensAt; }
  /** Spawn B is shown as open in the build phase right before it activates. */
  spawnBActiveNext(): boolean { return this.wave + 1 >= this.C.spawning.spawnBOpensAt || this.spawnBOpen(); }

  /** Tile centers from (c, r) to the core along the flow field. */
  pathFrom(c: number, r: number, flow = this.flow): [number, number][] {
    const pts: [number, number][] = [];
    if (flow[this.idx(c, r)] < 0) return pts;
    let guard = 0;
    while (guard++ < 2000) {
      pts.push([c + 0.5, r + 0.5]);
      if (this.isCore[this.idx(c, r)]) break;
      const nx = this.bestNeighbor(c, r, -1, -1, flow);
      if (!nx) break;
      [c, r] = nx;
    }
    return pts;
  }

  /** Next tile per the flow field. Ties break right, down, up, left. Never steps back onto
   * (pc, pr) unless that is the only neighbor with a path. */
  private bestNeighbor(c: number, r: number, pc: number, pr: number, flow = this.flow): [number, number] | null {
    let best: [number, number] | null = null, bd = Infinity;
    let back: [number, number] | null = null;
    for (const [dc, dr] of NEIGHBORS) {
      const cc = c + dc, rr = r + dr;
      if (!this.inside(cc, rr)) continue;
      const v = flow[this.idx(cc, rr)];
      if (v < 0) continue;
      if (cc === pc && rr === pr) { back = [cc, rr]; continue; }
      if (v < bd) { bd = v; best = [cc, rr]; }
    }
    return best ?? back;
  }

  piece(id: number): Piece | undefined { return this.pieces.find(p => p.id === id); }
  pieceAt(c: number, r: number): Piece | undefined {
    if (!this.inside(c, r)) return undefined;
    const id = this.occ[this.idx(c, r)];
    return id ? this.piece(id) : undefined;
  }
  linksOf(id: number): Link[] { return this.links.filter(l => l.a === id || l.b === id); }

  // ---------------------------------------------------------------- derived stats

  has(oc: OverclockId): boolean { return this.overclocks.includes(oc); }
  slots(p: Piece): number {
    if (p.type === 'wall') return 0;
    return this.C.links.slots[p.tier] + (this.has('extraSlot') ? 1 : 0);
  }
  linkRange(): number { return this.C.links.range + (this.has('longTethers') ? 1.5 : 0); }
  beamLevel(l: Link): number { return this.piece(l.a)!.tier + this.piece(l.b)!.tier + 2; }
  beamMult(l: Link): number {
    return (1 + this.C.links.levelStep * (this.beamLevel(l) - 2)) * (this.has('conductive') ? 1.25 : 1);
  }
  range(p: Piece): number {
    return p.type === 'wall' ? 0 : this.C.nodes[p.type].range[p.tier];
  }
  splash(p: Piece): number {
    return this.C.nodes.mortar.splash![p.tier] * (this.has('bigShells') ? 1.4 : 1);
  }
  fireRate(p: Piece): number {
    if (p.type === 'wall') return 0;
    return this.C.nodes[p.type].rate * (p.type === 'bolt' && this.has('hairTrigger') ? 1.3 : 1);
  }
  ownDamageMult(p: Piece): number {
    return this.has('resonance') && this.linksOf(p.id).length >= this.slots(p) ? 1.25 : 1;
  }
  hpMult(w: number): number { return Math.pow(this.C.economy.hpGrowth, w - 1); }
  chillSlow(l: Link): number {
    const R = this.C.beamRules;
    let s = R.chillSlow + R.chillSlowPerLevel * (this.beamLevel(l) - 2);
    if (s > R.chillCap) s = R.chillCap;
    return s + (this.has('deepFreeze') ? 0.1 : 0);
  }
  interestCap(w: number): number {
    const base = this.C.economy.interestCapBase + this.C.economy.interestCapPerWave * w;
    return this.has('compoundInterest') ? Math.floor(base * 1.5) : base;
  }
  sellValue(p: Piece): number {
    if (this.has('salvage')) return p.spent;
    return p.spentThisPhase + Math.floor((p.spent - p.spentThisPhase) * this.C.economy.sellRefund);
  }
  upgradeCost(p: Piece): number | null {
    if (p.type === 'wall' || p.tier >= 2) return null;
    return this.C.nodes[p.type].cost[p.tier + 1];
  }
  pieceCost(type: PieceType): number {
    return type === 'wall' ? this.C.wall.cost : this.C.nodes[type].cost[0];
  }
  convertCost(type: NodeType): number { return this.C.nodes[type].cost[0] - this.C.wall.cost; }
  waveCount(): number { return this.C.waves.length; }
  /** Seconds left in the newest wave's spawn schedule. */
  scheduleLeft(): number {
    const w = this.activeWaves[this.activeWaves.length - 1];
    if (!w) return 0;
    const left = w.duration - (this.tick - w.startTick) * this.dt;
    return left > 0 ? left : 0;
  }
  earlyCallBonus(): number {
    return this.C.economy.earlyCallBase + this.C.economy.earlyCallPerSecond * Math.floor(this.scheduleLeft());
  }
  canStart(): Result {
    if (this.phase === 'won' || this.phase === 'lost') return { ok: false, reason: 'Run is over' };
    if (this.offer) return { ok: false, reason: 'Pick an Overclock first' };
    if (this.wave >= this.waveCount()) return { ok: false, reason: 'No waves left' };
    const onBoard = this.activeWaves.filter(w => !w.cleared).length;
    if (onBoard >= this.C.economy.maxWavesOnBoard) return { ok: false, reason: 'Two waves already on the board' };
    return { ok: true };
  }

  // ---------------------------------------------------------------- validation

  checkBuild(type: PieceType, c: number, r: number): { ok: true; flow: Int32Array; cuts: Link[] } | { ok: false; reason: string } {
    if (this.phase === 'won' || this.phase === 'lost') return { ok: false, reason: 'Run is over' };
    if (!this.inside(c, r)) return { ok: false, reason: 'Off the board' };
    const i = this.idx(c, r);
    if (this.rock[i]) return { ok: false, reason: 'Rock' };
    if (this.occ[i]) return { ok: false, reason: 'Occupied' };
    if (this.noBuild[i]) return { ok: false, reason: 'Too close to a spawn or core' };
    for (const e of this.enemies) {
      if (!e.alive || e.air) continue;
      if ((e.tc === c && e.tr === r) || (Math.floor(e.x) === c && Math.floor(e.y) === r)) {
        return { ok: false, reason: 'Enemy here' };
      }
    }
    const flow = this.computeFlow(i);
    for (const [sc, sr] of [...this.map.spawnA, ...this.map.spawnB]) {
      if (flow[this.idx(sc, sr)] < 0) return { ok: false, reason: 'Blocks path' };
    }
    for (const e of this.enemies) {
      if (!e.alive || e.air) continue;
      if (flow[this.idx(e.tc, e.tr)] < 0 || flow[this.idx(Math.floor(e.x), Math.floor(e.y))] < 0) {
        return { ok: false, reason: 'Blocks path' };
      }
    }
    if (this.gold < this.pieceCost(type)) return { ok: false, reason: 'Not enough gold' };
    const cuts = this.links.filter(l => {
      const a = this.piece(l.a)!, b = this.piece(l.b)!;
      return segHitsTile(a.x, a.y, b.x, b.y, c, r);
    });
    return { ok: true, flow, cuts };
  }

  lineOfSight(a: Piece, b: Piece): boolean {
    const c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c);
    const r0 = Math.min(a.r, b.r), r1 = Math.max(a.r, b.r);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if ((c === a.c && r === a.r) || (c === b.c && r === b.r)) continue;
        if (!this.blocked(this.idx(c, r))) continue;
        if (segHitsTile(a.x, a.y, b.x, b.y, c, r)) return false;
      }
    }
    return true;
  }

  checkLink(aId: number, bId: number): Result {
    if (this.phase === 'won' || this.phase === 'lost') return { ok: false, reason: 'Run is over' };
    const a = this.piece(aId), b = this.piece(bId);
    if (!a || !b) return { ok: false, reason: 'No node there' };
    if (a === b) return { ok: false, reason: 'Same node' };
    if (a.type === 'wall' || b.type === 'wall') return { ok: false, reason: "Walls can't link" };
    if (this.links.some(l => (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id))) {
      return { ok: false, reason: 'Already linked' };
    }
    if (dist(a.x, a.y, b.x, b.y) > this.linkRange() + 1e-9) return { ok: false, reason: 'Out of range' };
    if (this.linksOf(a.id).length >= this.slots(a) || this.linksOf(b.id).length >= this.slots(b)) {
      return { ok: false, reason: 'No free slot' };
    }
    if (!this.lineOfSight(a, b)) return { ok: false, reason: 'No line of sight' };
    return { ok: true };
  }

  /** Tiles of current ground path within contact range of segment a-b, summed over active spawns. */
  exposure(ax: number, ay: number, bx: number, by: number): number {
    const spawns = [this.map.spawnA[0]];
    if (this.spawnBActiveNext()) spawns.push(this.map.spawnB[0]);
    let s = 0;
    for (const [c, r] of spawns) {
      const path = this.pathFrom(c, r);
      for (let i = 0; i + 1 < path.length; i++) {
        const [x0, y0] = path[i], [x1, y1] = path[i + 1];
        for (let k = 0; k < 10; k++) {
          const u = (k + 0.5) / 10;
          if (segDist(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, ax, ay, bx, by) <= this.C.links.contact) s += 0.1;
        }
      }
    }
    return Math.round(s * 10) / 10;
  }

  // ---------------------------------------------------------------- commands

  /** Apply a command between ticks. Logged with the current tick for replay. */
  apply(cmd: Command): Result {
    this.log.push({ tick: this.tick, cmd });
    return this.exec(cmd);
  }

  private exec(cmd: Command): Result {
    switch (cmd.t) {
      case 'build': return this.cmdBuild(cmd.type, cmd.c, cmd.r);
      case 'convert': return this.cmdConvert(cmd.id, cmd.type);
      case 'upgrade': return this.cmdUpgrade(cmd.id);
      case 'sell': return this.cmdSell(cmd.id);
      case 'link': return this.cmdLink(cmd.a, cmd.b);
      case 'unlink': return this.cmdUnlink(cmd.a, cmd.b);
      case 'target': return this.cmdTarget(cmd.id, cmd.mode);
      case 'start': return this.cmdStart();
      case 'pick': return this.cmdPick(cmd.i);
    }
  }

  private cmdBuild(type: PieceType, c: number, r: number): Result {
    const chk = this.checkBuild(type, c, r);
    if (!chk.ok) return chk;
    for (const l of chk.cuts) this.removeLink(l);
    const cost = this.pieceCost(type);
    this.gold -= cost;
    const p: Piece = {
      id: this.nextId++, type, tier: 0, c, r, x: c + 0.5, y: r + 0.5, cd: 0, spent: cost,
      spentThisPhase: cost, mode: 'first', dmgPhase: 0, dmgLast: 0,
    };
    this.pieces.push(p);
    this.occ[this.idx(c, r)] = p.id;
    this.flow = chk.flow;
    return { ok: true };
  }

  private cmdConvert(id: number, type: NodeType): Result {
    if (this.phase === 'won' || this.phase === 'lost') return { ok: false, reason: 'Run is over' };
    const p = this.piece(id);
    if (!p) return { ok: false, reason: 'No piece there' };
    if (p.type !== 'wall') return { ok: false, reason: 'Only Walls convert' };
    const cost = this.convertCost(type);
    if (this.gold < cost) return { ok: false, reason: 'Not enough gold' };
    this.gold -= cost;
    p.type = type;
    p.tier = 0;
    p.spent += cost;
    p.spentThisPhase += cost;
    p.cd = 0;
    return { ok: true };
  }

  private cmdUpgrade(id: number): Result {
    if (this.phase === 'won' || this.phase === 'lost') return { ok: false, reason: 'Run is over' };
    const p = this.piece(id);
    if (!p) return { ok: false, reason: 'No piece there' };
    if (p.type === 'wall') return { ok: false, reason: 'Convert the Wall first' };
    const cost = this.upgradeCost(p);
    if (cost === null) return { ok: false, reason: 'Max tier' };
    if (this.gold < cost) return { ok: false, reason: 'Not enough gold' };
    this.gold -= cost;
    p.tier++;
    p.spent += cost;
    p.spentThisPhase += cost;
    return { ok: true };
  }

  private cmdSell(id: number): Result {
    if (this.phase !== 'build') return { ok: false, reason: 'Sell after wave' };
    const p = this.piece(id);
    if (!p) return { ok: false, reason: 'No piece there' };
    for (const l of this.linksOf(id)) this.removeLink(l);
    this.gold += this.sellValue(p);
    this.occ[this.idx(p.c, p.r)] = 0;
    this.pieces = this.pieces.filter(x => x !== p);
    this.flow = this.computeFlow(-1);
    return { ok: true };
  }

  private cmdLink(a: number, b: number): Result {
    const chk = this.checkLink(a, b);
    if (!chk.ok) return chk;
    const pa = this.piece(a)!, pb = this.piece(b)!;
    const charge = this.phase === 'wave' && !this.has('instantCharge') ? this.C.links.chargeTime : 0;
    this.links.push({
      id: this.nextId++, a, b, beam: beamFor(pa.type as NodeType, pb.type as NodeType),
      charge, mineTimer: 0, load: 0, dmgPhase: 0, dmgLast: 0,
    });
    return { ok: true };
  }

  private cmdUnlink(a: number, b: number): Result {
    const l = this.links.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    if (!l) return { ok: false, reason: 'No beam there' };
    this.removeLink(l);
    return { ok: true };
  }

  private removeLink(l: Link): void {
    this.links = this.links.filter(x => x !== l);
  }

  private cmdTarget(id: number, mode: TargetMode): Result {
    const p = this.piece(id);
    if (!p || p.type === 'wall') return { ok: false, reason: 'Not a node' };
    p.mode = mode;
    return { ok: true };
  }

  private cmdStart(): Result {
    const can = this.canStart();
    if (!can.ok) return can;
    if (this.phase === 'wave') {
      const bonus = this.earlyCallBonus();
      this.addGold(bonus);
    } else {
      this.phase = 'wave';
      this.bonusThisPhase = 0;
      this.stats = new Map();
      this.phaseKills = 0;
      this.phaseLeaks = 0;
      this.phaseGold = 0;
      this.phaseWaves = [];
      for (const p of this.pieces) p.dmgPhase = 0;
      for (const l of this.links) l.dmgPhase = 0;
    }
    this.wave++;
    this.phaseWaves.push(this.wave);
    this.activeWaves.push(this.buildSchedule(this.wave));
    return { ok: true };
  }

  private cmdPick(i: number): Result {
    if (!this.offer) return { ok: false, reason: 'No Overclock offered' };
    const oc = this.offer[i];
    if (!oc) return { ok: false, reason: 'No such card' };
    this.overclocks.push(oc);
    if (oc === 'reinforcedCore') { this.lives += 8; this.maxLives += 8; }
    this.offer = null;
    this.pendingOffers--;
    if (this.pendingOffers > 0) this.rollOffer();
    return { ok: true };
  }

  private rollOffer(): void {
    const pool = (Object.keys(this.C.overclocks) as OverclockId[]).filter(o => !this.overclocks.includes(o));
    const pick: OverclockId[] = [];
    while (pick.length < 3 && pool.length) {
      const j = Math.floor(this.ocRng() * pool.length);
      pick.push(pool.splice(j, 1)[0]);
    }
    this.offer = pick.length ? pick : null;
    if (!this.offer) this.pendingOffers = 0;
  }

  buildSchedule(w: number): ActiveWave {
    const S = this.C.spawning;
    const ramp = Math.max(1, 2 - 0.1 * (w - 1));
    const list: SpawnEvent[] = [];
    let t = 0, g = 0;
    for (const [type, n] of this.C.waves[w - 1]) {
      const spawn: 'A' | 'B' = w >= S.spawnBOpensAt && g % 2 === 1 ? 'B' : 'A';
      let end = t;
      if (type === 'swarm') {
        let k = 0;
        for (let pack = 0; pack < n; pack++) {
          for (let j = 0; j < S.swarmPackSize; j++) {
            end = t + j * this.C.enemies.swarm.spacing;
            list.push({ at: end, type, spawn, slot: k++ % 2 });
          }
          t = end + S.swarmPackGap;
        }
      } else {
        const sp = this.C.enemies[type].spacing * ramp;
        for (let k = 0; k < n; k++) {
          end = t + k * sp;
          list.push({ at: end, type, spawn, slot: k % 2 });
        }
      }
      t = end + S.groupGap;
      g++;
    }
    return {
      num: w, startTick: this.tick, schedule: list, next: 0, remaining: list.length, cleared: false,
      duration: list.length ? list[list.length - 1].at : 0,
    };
  }

  // ---------------------------------------------------------------- simulation

  /** Advance one fixed step. A no-op outside the wave phase, so build time never shifts the log. */
  step(): void {
    if (this.phase !== 'wave') return;
    const t = this.tick * this.dt;
    for (const e of this.enemies) { e.px = e.x; e.py = e.y; }
    for (const p of this.projectiles) { p.px = p.x; p.py = p.y; }

    // (2) spawn
    for (const w of this.activeWaves) {
      const local = (this.tick - w.startTick) * this.dt + 1e-9;
      while (w.next < w.schedule.length && w.schedule[w.next].at <= local) this.spawn(w.schedule[w.next++], w.num);
    }

    // (3) beam status pass
    this.contact.clear();
    const R = this.C.beamRules;
    for (const l of this.links) {
      l.load = 0;
      if (l.charge > 0) continue;
      const a = this.piece(l.a)!, b = this.piece(l.b)!;
      const m = this.beamMult(l);
      const hits: Enemy[] = [];
      for (const e of this.enemies) {
        if (!e.alive || e.air) continue;
        if (segDist(e.x, e.y, a.x, a.y, b.x, b.y) > this.C.links.contact) continue;
        hits.push(e);
        switch (l.beam) {
          case 'chill': this.slow(e, this.chillSlow(l), R.chillLinger, this.has('deepFreeze') ? 0.7 : 0.6, t); break;
          case 'shatter': e.brittleU = t + R.brittleDuration; break;
          case 'overload':
            if (t >= e.chargedU || m >= e.chargedM) { e.chargedM = m; e.chargedLink = l.id; }
            e.chargedU = t + R.chargedDuration;
            break;
          case 'tar': this.slow(e, R.tarSlow, R.tarLinger, this.C.status.slowCap, t); e.shredU = t + R.shredLinger; break;
          default: break;
        }
      }
      l.load = hits.length;
      this.contact.set(l.id, hits);
    }

    // (4) node attacks
    for (const p of this.pieces) {
      if (p.type === 'wall') continue;
      p.cd -= this.dt;
      if (p.cd > 0) continue;
      const fired = this.attack(p, t);
      p.cd = fired ? p.cd + 1 / this.fireRate(p) : 0;
    }
    this.moveProjectiles();

    // (5) shells that land this tick
    const keep: Shell[] = [];
    for (const s of this.shells) {
      if (s.landTick > this.tick) { keep.push(s); continue; }
      this.events.push({ k: 'blast', x: s.x, y: s.y, r: s.radius, kind: 'shell' });
      for (const e of this.enemies) {
        if (e.alive && !e.air && dist(e.x, e.y, s.x, s.y) <= s.radius) this.hurt(e, s.damage, s.node, -1);
      }
    }
    this.shells = keep;

    // (6) beam damage pass
    for (const l of this.links) {
      if (l.charge > 0) { l.charge -= this.dt; if (l.charge < 0) l.charge = 0; continue; }
      const m = this.beamMult(l);
      if (l.beam === 'minefield') {
        if (l.mineTimer > 0) l.mineTimer -= this.dt;
        const first = (this.contact.get(l.id) ?? []).find(e => e.alive);
        if (first && l.mineTimer <= 0) {
          l.mineTimer = R.mineRearm;
          this.events.push({ k: 'blast', x: first.x, y: first.y, r: R.mineRadius, kind: 'mine' });
          const cx = first.x, cy = first.y;
          for (const o of this.enemies) {
            if (o.alive && !o.air && dist(o.x, o.y, cx, cy) <= R.mineRadius) this.hurt(o, R.mineDamage * m, -1, l.id);
          }
        }
        continue;
      }
      const dps = this.C.beams[l.beam].dps * m;
      for (const e of this.contact.get(l.id) ?? []) if (e.alive) this.hurt(e, dps * this.dt, -1, l.id);
    }

    // (7) explosion queue
    for (let i = 0; i < this.explodeQueue.length; i++) {
      const e = this.explodeQueue[i];
      const r = R.overloadRadius;
      this.events.push({ k: 'blast', x: e.x, y: e.y, r, kind: 'overload' });
      const link = this.links.find(l => l.id === e.chargedLink);
      for (const o of this.enemies) {
        if (o !== e && o.alive && !o.air && dist(o.x, o.y, e.x, e.y) <= r) {
          this.hurt(o, R.overloadBlast * e.chargedM, -1, link ? link.id : -1, 'Overload blasts');
        }
      }
    }
    this.explodeQueue.length = 0;

    // (8) Warden shields
    const W = this.C.warden;
    for (const e of this.enemies) {
      if (!e.alive || e.type !== 'warden') continue;
      e.wardT -= this.dt;
      if (e.wardT > 0) continue;
      e.wardT += W.interval;
      const s = W.shield * this.hpMult(e.wave);
      for (const o of this.enemies) if (o.alive && dist(o.x, o.y, e.x, e.y) <= W.radius && o.shield < s) o.shield = s;
    }

    // (9) movement and leaks
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const slow = t < e.slowU ? e.slowV : 0;
      let v = e.speed * (1 - slow) * this.dt;
      if (e.air) {
        const d = dist(e.x, e.y, this.coreCenter.x, this.coreCenter.y);
        if (d <= v) { this.leak(e); continue; }
        e.x += (this.coreCenter.x - e.x) / d * v;
        e.y += (this.coreCenter.y - e.y) / d * v;
        continue;
      }
      for (let guard = 0; guard < 4 && v > 0; guard++) {
        const tx = e.tc + 0.5, ty = e.tr + 0.5;
        const d = dist(e.x, e.y, tx, ty);
        if (d > v) { e.x += (tx - e.x) / d * v; e.y += (ty - e.y) / d * v; break; }
        e.x = tx; e.y = ty; v -= d;
        if (this.isCore[this.idx(e.tc, e.tr)]) { this.leak(e); break; }
        const nx = this.bestNeighbor(e.tc, e.tr, e.pc, e.pr);
        if (!nx) break;
        e.pc = e.tc; e.pr = e.tr;
        [e.tc, e.tr] = nx;
      }
    }

    // (10) remove dead, check wave clear, win and loss
    this.enemies = this.enemies.filter(e => e.alive);
    this.projectiles = this.projectiles.filter(p => this.enemies.some(e => e.id === p.target));
    this.tick++;
    if (this.lives <= 0) { this.lives = 0; this.phase = 'lost'; this.finishPhase(); return; }
    for (const w of this.activeWaves) {
      if (!w.cleared && w.remaining === 0 && w.next >= w.schedule.length) {
        w.cleared = true;
        const bonus = this.C.economy.clearBonusBase + this.C.economy.clearBonusPerWave * w.num;
        this.addGold(bonus);
        this.bonusThisPhase += bonus;
        if (w.num > this.lastCleared) this.lastCleared = w.num;
        if (this.C.overclockWaves.includes(w.num)) this.pendingOffers++;
      }
    }
    if (this.activeWaves.every(w => w.cleared) && this.enemies.length === 0) this.endWavePhase();
  }

  private endWavePhase(): void {
    const E = this.C.economy;
    const rate = this.has('compoundInterest') ? 0.15 : E.interestRate;
    const base = Math.max(0, this.gold - this.bonusThisPhase);
    const interest = Math.min(Math.floor(base * rate), this.interestCap(this.lastCleared));
    this.addGold(interest);
    this.activeWaves = [];
    this.shells = [];
    this.projectiles = [];
    for (const l of this.links) { l.charge = 0; l.mineTimer = 0; l.load = 0; }
    for (const p of this.pieces) { p.spentThisPhase = 0; p.cd = 0; }
    this.phase = this.lastCleared >= this.waveCount() ? 'won' : 'build';
    this.finishPhase(interest);
    if (this.phase === 'build' && this.pendingOffers > 0 && !this.offer) this.rollOffer();
  }

  private finishPhase(interest = 0): void {
    for (const p of this.pieces) p.dmgLast = p.dmgPhase;
    for (const l of this.links) l.dmgLast = l.dmgPhase;
    const lines = [...this.stats.values()].filter(s => s.dmg > 0).sort((a, b) => b.dmg - a.dmg);
    const summary: PhaseSummary = {
      waves: this.phaseWaves.slice(), lines, kills: this.phaseKills, leaks: this.phaseLeaks,
      gold: this.phaseGold, interest,
    };
    this.lastSummary = summary;
    this.events.push({ k: 'summary', summary });
  }

  private addGold(n: number): void {
    this.gold += n;
    this.phaseGold += n;
  }

  private spawn(s: SpawnEvent, w: number): void {
    const D = this.C.enemies[s.type];
    const hp = D.boss ? (this.C.bossHp[w] ?? D.hp) : D.hp * this.hpMult(w);
    const tiles = s.spawn === 'A' ? this.map.spawnA : this.map.spawnB;
    let x: number, y: number, c = 0, r = 0;
    if (D.air) {
      x = (tiles[0][0] + tiles[1][0]) / 2 + 0.5;
      y = (tiles[0][1] + tiles[1][1]) / 2 + 0.5;
    } else {
      [c, r] = tiles[s.slot];
      x = c + 0.5; y = r + 0.5;
    }
    const bounty = D.boss ? D.bounty : Math.floor(D.bounty * (1 + this.C.economy.bountyGrowth * (w - 1)));
    this.enemies.push({
      id: this.nextId++, type: s.type, wave: w, x, y, px: x, py: y, hp, maxHp: hp, shield: 0,
      speed: D.speed, armor: D.armor, leak: D.leak,
      bounty: this.has('bountyHunter') ? Math.floor(bounty * 1.25) : bounty,
      air: !!D.air, boss: !!D.boss, tc: c, tr: r, pc: -1, pr: -1,
      slowV: 0, slowU: 0, brittleU: 0, chargedU: 0, chargedM: 0, chargedLink: -1, shredU: 0, wardT: 0,
      alive: true, exploded: false, hitTick: -99,
    });
  }

  private slow(e: Enemy, s: number, dur: number, cap: number, t: number): void {
    if (s > cap) s = cap;
    if (e.boss && s > this.C.status.bossSlowCap) s = this.C.status.bossSlowCap;
    if (t >= e.slowU || s > e.slowV) { e.slowV = s; e.slowU = t + dur; }
    else if (s === e.slowV && t + dur > e.slowU) e.slowU = t + dur;
  }

  /** Apply damage. Credit goes to node `node` or beam `link` (split half to each anchor). */
  private hurt(e: Enemy, amount: number, node: number, link: number, label?: string): void {
    if (!e.alive) return;
    const t = this.tick * this.dt;
    const brittle = t < e.brittleU ? this.C.beamRules.brittle : 1;
    let armor = e.armor - (t < e.shredU ? this.C.beamRules.shred : 0);
    if (armor < 0) armor = 0;
    let a = amount * brittle * (1 - armor / 100);
    const credited = Math.min(a, e.hp + e.shield);
    this.credit(credited, node, link, label);
    if (e.shield > 0) { const s = Math.min(e.shield, a); e.shield -= s; a -= s; }
    e.hp -= a;
    e.hitTick = this.tick;
    if (e.hp <= 0) this.kill(e);
  }

  private credit(dmg: number, node: number, link: number, label?: string): void {
    if (dmg <= 0) return;
    if (node > 0) {
      const p = this.piece(node);
      if (p) {
        p.dmgPhase += dmg;
        const key = 'n' + p.id;
        let s = this.stats.get(key);
        if (!s) { s = { key, label: `${this.C.nodes[p.type as NodeType].name} #${p.id}`, kind: 'node', dmg: 0 }; this.stats.set(key, s); }
        s.dmg += dmg;
      }
    } else if (link > 0) {
      const l = this.links.find(x => x.id === link);
      if (l) {
        l.dmgPhase += dmg;
        const a = this.piece(l.a), b = this.piece(l.b);
        if (a) a.dmgPhase += dmg / 2;
        if (b) b.dmgPhase += dmg / 2;
        const key = 'l' + l.id + (label ?? '');
        let s = this.stats.get(key);
        if (!s) { s = { key, label: label ?? `${this.C.beams[l.beam].name} #${l.a}-${l.b}`, kind: 'beam', dmg: 0 }; this.stats.set(key, s); }
        s.dmg += dmg;
      }
    }
  }

  private kill(e: Enemy): void {
    e.alive = false;
    this.addGold(e.bounty);
    this.phaseKills++;
    this.waveDone(e);
    this.events.push({ k: 'kill', x: e.x, y: e.y, gold: e.bounty });
    if (!e.air && !e.exploded && this.tick * this.dt < e.chargedU) {
      e.exploded = true;
      this.explodeQueue.push(e);
    }
  }

  private leak(e: Enemy): void {
    e.alive = false;
    this.lives -= e.boss ? this.lives : e.leak;
    this.phaseLeaks++;
    this.waveDone(e);
    this.events.push({ k: 'leak', x: e.x, y: e.y });
  }

  private waveDone(e: Enemy): void {
    const w = this.activeWaves.find(x => x.num === e.wave);
    if (w) w.remaining--;
  }

  /** Progress metric for "First": lower is closer to the core. */
  private toCore(e: Enemy): number {
    if (e.air) return dist(e.x, e.y, this.coreCenter.x, this.coreCenter.y);
    return this.flow[this.idx(e.tc, e.tr)] + dist(e.x, e.y, e.tc + 0.5, e.tr + 0.5);
  }

  private pickTarget(p: Piece, air: boolean, minR: number, maxR: number): Enemy | null {
    let best: Enemy | null = null, bv = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || (e.air && !air)) continue;
      const d = dist(e.x, e.y, p.x, p.y);
      if (d > maxR || d < minR) continue;
      const v = p.mode === 'strongest' ? -e.hp : this.toCore(e);
      if (v < bv) { bv = v; best = e; }
    }
    return best;
  }

  private attack(p: Piece, t: number): boolean {
    const N = this.C.nodes;
    const mult = this.ownDamageMult(p);
    if (p.type === 'bolt') {
      const e = this.pickTarget(p, true, 0, this.range(p));
      if (!e) return false;
      this.projectiles.push({ x: p.x, y: p.y, px: p.x, py: p.y, target: e.id, damage: N.bolt.damage[p.tier] * mult, node: p.id });
      return true;
    }
    if (p.type === 'frost') {
      const r = this.range(p);
      const inRange = this.enemies.filter(e => e.alive && dist(e.x, e.y, p.x, p.y) <= r);
      if (!inRange.length) return false;
      const s = N.frost.slow![p.tier] + (this.has('deepFreeze') ? 0.1 : 0);
      this.events.push({ k: 'frost', x: p.x, y: p.y, r });
      for (const e of inRange) {
        this.slow(e, s, N.frost.slowDuration!, this.C.status.slowCap, t);
        this.hurt(e, N.frost.damage[p.tier] * mult, p.id, -1);
      }
      return true;
    }
    if (p.type === 'mortar') {
      const e = this.pickTarget(p, false, N.mortar.minRange, this.range(p));
      if (!e) return false;
      const flight = N.mortar.shellFlight!;
      const slow = t < e.slowU ? e.slowV : 0;
      const [x, y] = this.predictGround(e, e.speed * (1 - slow) * flight);
      this.shells.push({
        x, y, sx: p.x, sy: p.y, fireTick: this.tick, landTick: this.tick + Math.round(flight * this.C.tickRate),
        damage: N.mortar.damage[p.tier] * mult, radius: this.splash(p), node: p.id,
      });
      return true;
    }
    return false;
  }

  /** Where a ground enemy will be after walking `d` tiles along its path. */
  predictGround(e: Enemy, d: number): [number, number] {
    let x = e.x, y = e.y, tc = e.tc, tr = e.tr, pc = e.pc, pr = e.pr;
    for (let guard = 0; guard < 16 && d > 0; guard++) {
      const tx = tc + 0.5, ty = tr + 0.5;
      const s = dist(x, y, tx, ty);
      if (s > d) { x += (tx - x) / s * d; y += (ty - y) / s * d; break; }
      x = tx; y = ty; d -= s;
      if (this.isCore[this.idx(tc, tr)]) break;
      const nx = this.bestNeighbor(tc, tr, pc, pr);
      if (!nx) break;
      pc = tc; pr = tr;
      [tc, tr] = nx;
    }
    return [x, y];
  }

  private moveProjectiles(): void {
    const v = (this.C.nodes.bolt.projectileSpeed ?? 12) * this.dt;
    for (const pr of this.projectiles) {
      const e = this.enemies.find(x => x.id === pr.target);
      if (!e || !e.alive) { pr.target = -1; continue; }
      const d = dist(pr.x, pr.y, e.x, e.y);
      if (d <= v) {
        this.events.push({ k: 'hit', x: e.x, y: e.y });
        this.hurt(e, pr.damage, pr.node, -1);
        pr.target = -1;
      } else {
        pr.x += (e.x - pr.x) / d * v;
        pr.y += (e.y - pr.y) / d * v;
      }
    }
  }

  // ---------------------------------------------------------------- replay

  /** Plain snapshot of the state that matters, for determinism checks. */
  snapshot(): string {
    return JSON.stringify({
      tick: this.tick, phase: this.phase, gold: this.gold, lives: this.lives, wave: this.wave,
      pieces: this.pieces, links: this.links, enemies: this.enemies, shells: this.shells,
      projectiles: this.projectiles, overclocks: this.overclocks, offer: this.offer,
    });
  }

  static replay(seed: number, log: { tick: number; cmd: Command }[], untilTick: number, opts: GameOptions = {}): Game {
    const g = new Game({ ...opts, seed });
    let i = 0;
    while (true) {
      while (i < log.length && log[i].tick === g.tick) g.apply(log[i++].cmd);
      if (g.tick >= untilTick || (g.phase !== 'wave' && i >= log.length)) break;
      if (g.phase !== 'wave') {
        // Build phase: time is frozen, so the next command must share this tick.
        if (i < log.length && log[i].tick !== g.tick) throw new Error('replay desync');
        continue;
      }
      g.step();
    }
    return g;
  }
}

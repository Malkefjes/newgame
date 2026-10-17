// LATTICE headless balance sim. Implements the spec's rules at 30 Hz.
'use strict';
const DT = 1 / 30;
const MAP = [
  '...........BB...........',
  '........................',
  '....##..........##......',
  '....##..........##......',
  '.........#..............',
  '.........#.........#....',
  'A..................#..CC',
  'A.....#...............CC',
  '......#..........#......',
  '.................#......',
  '...##...................',
  '...##.........##........',
  '..............##........',
  '........................',
];
const H = MAP.length, W = MAP[0].length;
const idx = (c, r) => r * W + c;
const SP_A = [[0, 6], [0, 7]], SP_B = [[11, 0], [12, 0]];
const CORE = [[22, 6], [23, 6], [22, 7], [23, 7]];
const CORE_C = { x: 23, y: 7 };

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const NODE = {
  bolt: { cost: [50, 60, 100], dmg: [9, 16, 26], rate: 2, range: [3, 3.5, 4], air: true },
  frost: { cost: [45, 55, 90], dmg: [4, 7, 11], rate: 1, range: [1.75, 2, 2.25], slow: [.3, .35, .4], air: true },
  mortar: { cost: [75, 85, 130], dmg: [40, 70, 115], rate: .5, rmin: 1.5, range: [5.5, 5.5, 5.5], splash: [1, 1.1, 1.25], air: false },
};
NODE.wall = { cost: [10], wall: true };
const ENEMY = {
  grunt: { hp: 60, spd: 1.2, armor: 0, leak: 1, bounty: 4 },
  runner: { hp: 35, spd: 2.4, armor: 0, leak: 1, bounty: 3 },
  brute: { hp: 300, spd: 0.7, armor: 40, leak: 3, bounty: 15 },
  swarm: { hp: 18, spd: 1.6, armor: 0, leak: 1, bounty: 1 },
  flyer: { hp: 60, spd: 1.3, armor: 0, leak: 2, bounty: 6, air: true },
  warden: { hp: 150, spd: 1.0, armor: 20, leak: 2, bounty: 12 },
  colossus: { hp: 0, spd: 0.5, armor: 30, leak: 999, bounty: 150, boss: true },
};
const GAP = { grunt: .8, runner: .5, brute: 2, flyer: 1, warden: 3, colossus: 0 };
const WAVES = [
  [['grunt', 10]], [['grunt', 14]], [['grunt', 8], ['runner', 6]], [['grunt', 6], ['runner', 12]],
  [['grunt', 10], ['brute', 3]], [['grunt', 6], ['swarm', 3]], [['grunt', 10], ['flyer', 6]],
  [['grunt', 12], ['brute', 3], ['warden', 2]], [['runner', 15], ['swarm', 2], ['flyer', 4]],
  [['grunt', 12], ['colossus', 1]], [['grunt', 16], ['runner', 8]], [['grunt', 8], ['brute', 6], ['warden', 2]],
  [['swarm', 3], ['flyer', 6]], [['grunt', 8], ['runner', 20], ['warden', 3]], [['grunt', 10], ['brute', 8], ['warden', 3]],
  [['swarm', 3], ['flyer', 12]], [['runner', 16], ['brute', 6], ['flyer', 6], ['warden', 2]],
  [['runner', 20], ['brute', 10], ['warden', 4]], [['runner', 10], ['brute', 10], ['warden', 4], ['flyer', 10], ['swarm', 3]],
  [['brute', 6], ['warden', 4], ['flyer', 6], ['colossus', 1]],
];
const BOSS_HP = { 10: 6000, 20: 20000 };
const B = { contact: .5, arc: 45, chill: 12, chillLinger: 3, shred: 30, shredLinger: 3, mine: 80, mineRearm: 2, shatter: 25, brittle: 1.3, overload: 20, overloadBoom: 40, tar: 20 };
const PAIR = (a, b) => { const k = [a, b].sort().join('+'); return { 'bolt+bolt': 'arc', 'frost+frost': 'chill', 'mortar+mortar': 'mine', 'bolt+frost': 'shatter', 'bolt+mortar': 'overload', 'frost+mortar': 'tar' }[k]; };
const OVERCLOCKS = ['long', 'slot', 'hair', 'deep', 'shells', 'conductive', 'instant', 'bounty', 'interest', 'salvage', 'core', 'resonance'];

class Game {
  constructor(opts = {}) {
    this.o = opts; this.R = rng(opts.seed || 1);
    this.block = new Uint8Array(W * H);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (MAP[r][c] === '#') this.block[idx(c, r)] = 1;
    this.noBuild = new Uint8Array(W * H);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (MAP[r][c] !== '.') this.noBuild[idx(c, r)] = 1;
    for (const [c, r] of [...SP_A, ...SP_B, ...CORE]) for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const cc = c + dc, rr = r + dr; if (cc >= 0 && rr >= 0 && cc < W && rr < H) this.noBuild[idx(cc, rr)] = 1; }
    this.isCore = new Uint8Array(W * H); for (const [c, r] of CORE) this.isCore[idx(c, r)] = 1;
    this.nodes = []; this.links = []; this.enemies = []; this.gold = opts.startGold ?? 250; this.lives = 20; this.wave = 0; this.t = 0;
    this.oc = new Set(opts.overclocks || []); this.stats = {}; this.waveStats = {};
    this.dist = this.flow(this.block);
  }
  flow(block) {
    const d = new Int32Array(W * H).fill(-1); const q = [];
    for (const [c, r] of CORE) { d[idx(c, r)] = 0; q.push(idx(c, r)); }
    for (let h = 0; h < q.length; h++) { const i = q[h], c = i % W, r = (i / W) | 0;
      for (const [dc, dr] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue; const j = idx(cc, rr); if (block[j] || d[j] >= 0) continue; d[j] = d[i] + 1; q.push(j); } }
    return d;
  }
  canBuild(c, r) {
    const i = idx(c, r); if (this.noBuild[i] || this.block[i]) return null;
    for (const e of this.enemies) if (!e.air && Math.floor(e.x) === c && Math.floor(e.y) === r) return null;
    this.block[i] = 1; const d = this.flow(this.block); this.block[i] = 0;
    for (const [sc, sr] of [...SP_A, ...SP_B]) if (d[idx(sc, sr)] < 0) return null;
    for (const e of this.enemies) if (!e.air && d[idx(Math.floor(e.x), Math.floor(e.y))] < 0) return null;
    return d;
  }
  build(type, c, r) {
    const cost = NODE[type].cost[0]; if (this.gold < cost) return false;
    const d = this.canBuild(c, r); if (!d) return false;
    this.gold -= cost; this.block[idx(c, r)] = 1; this.dist = d;
    const n = { id: this.nodes.length + 1, type, tier: 0, x: c + .5, y: r + .5, c, r, cd: 0, spent: cost, dmgLast: 0, mode: 'first' };
    this.nodes.push(n); return n;
  }
  convert(n, type) { const cost = NODE[type].cost[0] - 10; if (n.type !== 'wall' || this.gold < cost) return false; this.gold -= cost; n.spent += cost; n.type = type; n.tier = 0; return true; }
  upgrade(n) { if (n.type === 'wall') return false; if (n.tier >= 2) return false; const cost = NODE[n.type].cost[n.tier + 1]; if (this.gold < cost) return false; this.gold -= cost; n.spent += cost; n.tier++; return true; }
  slots(n) { return (n.tier === 2 ? 3 : 2) + (this.oc.has('slot') ? 1 : 0); }
  linkRange() { return 4.5 + (this.oc.has('long') ? 1.5 : 0); }
  linksOf(n) { return this.links.filter(l => l.a === n || l.b === n); }
  los(a, b) { if (!this.o.los) return true; const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05); for (let k = 1; k < n; k++) { const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n; const c = Math.floor(x), r = Math.floor(y); if ((c === a.c && r === a.r) || (c === b.c && r === b.r)) continue; if (this.block[idx(c, r)]) return false; } return true; }
  canLink(a, b) { if (a === b || a.type === 'wall' || b.type === 'wall') return false; if (!this.los(a, b)) return false; if (Math.hypot(a.x - b.x, a.y - b.y) > this.linkRange() + 1e-9) return false; if (this.linksOf(a).length >= this.slots(a) || this.linksOf(b).length >= this.slots(b)) return false; return !this.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a)); }
  link(a, b) { if (!this.canLink(a, b)) return null; const l = { a, b, type: PAIR(a.type, b.type), charge: this.oc.has('instant') ? 0 : 1.5, timer: 0 }; this.links.push(l); return l; }
  unlink(l) { this.links = this.links.filter(x => x !== l); }
  pathFrom(sc, sr, dist = this.dist) {
    const pts = []; let c = sc, r = sr, guard = 0;
    while (!this.isCore[idx(c, r)] && guard++ < 2000) { pts.push([c + .5, r + .5]); let best = null, bd = 1e9;
      for (const [dc, dr] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue; const v = dist[idx(cc, rr)]; if (v >= 0 && v < bd) { bd = v; best = [cc, rr]; } }
      if (!best) break; [c, r] = best; }
    pts.push([c + .5, r + .5]); return pts;
  }
  // --- wave spawning ---
  startWave() {
    this.wave++; const w = this.wave; const list = []; const gm = Math.max(1, 2 - 0.1 * (w - 1)); let t = 0; let g = 0;
    for (const [type, n] of WAVES[w - 1]) {
      const sp = (w >= 11 && g % 2 === 1) ? 'B' : 'A';
      if (type === 'swarm') { for (let p = 0; p < n; p++) { for (let k = 0; k < 10; k++) list.push({ t: t + k * .15, type, sp }); t += 1.35 + 3; } }
      else { for (let k = 0; k < n; k++) { list.push({ t, type, sp }); t += GAP[type] * gm; } }
      t += 2; g++;
    }
    this.spawnQ = list; this.waveT = 0; this.waveLeft = list.length;
    this.waveStats = {}; for (const n of this.nodes) n.dmgLast = 0;
  }
  spawn(s) {
    const E = ENEMY[s.type]; const w = this.wave;
    const hp = E.boss ? BOSS_HP[w] : E.hp * Math.pow(this.o.hpg || 1.11, w - 1);
    const sps = s.sp === 'A' ? SP_A : SP_B; const [c, r] = sps[(this.R() * 2) | 0];
    const e = { type: s.type, x: c + .5, y: r + .5, hp, max: hp, spd: E.spd, armor: E.armor, air: !!E.air, boss: !!E.boss,
      leak: E.leak, bounty: Math.floor(E.bounty * (1 + .04 * (w - 1)) * (this.oc.has('bounty') ? 1.25 : 1)),
      slowV: 0, slowU: 0, brittleU: 0, chargeU: 0, chargeM: 1, shredU: 0, shield: 0, wardT: 0, alive: true };
    if (e.air) { e.sx = e.x; e.sy = e.y; }
    this.enemies.push(e);
  }
  slow(e, s, dur, cap = .6) { s = Math.min(s, e.boss ? .3 : cap); if (this.t >= e.slowU || s >= e.slowV) { if (this.t >= e.slowU || s > e.slowV) e.slowU = this.t + dur; else e.slowU = Math.max(e.slowU, this.t + dur); e.slowV = s; } }
  hurt(e, amt, src, owner) {
    if (!e.alive) return; const brit = this.t < e.brittleU ? B.brittle : 1; const arm = Math.max(0, e.armor - (this.t < e.shredU ? B.shred : 0)) / 100;
    let a = amt * brit * (1 - arm); const tot = Math.min(a, e.hp + e.shield);
    this.stats[src] = (this.stats[src] || 0) + tot; if (owner) { if (Array.isArray(owner)) { owner[0].dmgLast += tot / 2; owner[1].dmgLast += tot / 2; } else owner.dmgLast += tot; } this.waveStats[src] = (this.waveStats[src] || 0) + tot;
    if (e.shield > 0) { const s = Math.min(e.shield, a); e.shield -= s; a -= s; }
    e.hp -= a; if (e.hp <= 0) this.kill(e);
  }
  kill(e) {
    e.alive = false; this.gold += e.bounty; this.waveLeft--;
    if (this.t < e.chargeU) { for (const o of this.enemies) if (o.alive && !o.air && Math.hypot(o.x - e.x, o.y - e.y) <= 1) this.hurt(o, B.overloadBoom * e.chargeM, 'overload'); }
  }
  inRangeFirst(n, R, rmin, air, mode) {
    let best = null, bv = 1e9;
    for (const e of this.enemies) { if (!e.alive || (e.air && !air)) continue; const d = Math.hypot(e.x - n.x, e.y - n.y); if (d > R || d < (rmin || 0)) continue;
      const v = mode === 'strong' ? -e.hp : (e.air ? Math.hypot(e.x - CORE_C.x, e.y - CORE_C.y) : this.dist[idx(Math.floor(e.x), Math.floor(e.y))] + 0.0001 * d);
      if (v < bv) { bv = v; best = e; } }
    return best;
  }
  beamM(l) { const L = l.a.tier + l.b.tier + 2; return (1 + .5 * (L - 2)) * (this.oc.has('conductive') ? 1.25 : 1); }
  step() {
    const t = this.t;
    while (this.spawnQ.length && this.spawnQ[0].t <= this.waveT) this.spawn(this.spawnQ.shift());
    // nodes
    for (const n of this.nodes) {
      if (n.type === 'wall' || n.passive) continue; const N = NODE[n.type]; n.cd -= DT; if (n.cd > 0) continue;
      const res = this.oc.has('resonance') && this.linksOf(n).length >= this.slots(n) ? 1.25 : 1;
      if (n.type === 'bolt') { const e = this.inRangeFirst(n, N.range[n.tier], 0, true, n.mode); if (e) { this.hurt(e, N.dmg[n.tier] * res, 'bolt', n); n.cd = 1 / (N.rate * (this.oc.has('hair') ? 1.3 : 1)); } }
      else if (n.type === 'frost') { let any = false; const s = N.slow[n.tier] + (this.oc.has('deep') ? .1 : 0);
        for (const e of this.enemies) if (e.alive && Math.hypot(e.x - n.x, e.y - n.y) <= N.range[n.tier]) { any = true; this.hurt(e, N.dmg[n.tier] * res, 'frost', n); this.slow(e, s, 1.5); }
        n.cd = 1; }
      else { const e = this.inRangeFirst(n, N.range[n.tier], N.rmin, false, n.mode); if (e) { (this.shells = this.shells || []).push({ e, t: t + .8, dmg: N.dmg[n.tier] * res, rad: N.splash[n.tier] * (this.oc.has('shells') ? 1.4 : 1), x: e.x, y: e.y, n }); n.cd = 2; } }
    }
    // shells (perfect prediction: land on target's position at impact, else last known)
    if (this.shells) { const keep = []; for (const s of this.shells) { if (s.e.alive) { s.x = s.e.x; s.y = s.e.y; } if (s.t <= t) { for (const e of this.enemies) if (e.alive && !e.air && Math.hypot(e.x - s.x, e.y - s.y) <= s.rad) this.hurt(e, s.dmg, 'mortar', s.n); } else keep.push(s); } this.shells = keep; }
    // beams
    for (const l of this.links) {
      if (l.charge > 0) { l.charge -= DT; continue; }
      const ab = [l.a, l.b]; const m = this.beamM(l); const L = l.a.tier + l.b.tier + 2; if (l.type === 'mine') l.timer -= DT;
      for (const e of this.enemies) {
        if (!e.alive || e.air) continue; if (segDist(e.x, e.y, l.a.x, l.a.y, l.b.x, l.b.y) > B.contact) continue;
        switch (l.type) {
          case 'arc': this.hurt(e, B.arc * m * DT, 'arc', ab); break;
          case 'chill': this.slow(e, .45 + .05 * (L - 2) + (this.oc.has('deep') ? .1 : 0), B.chillLinger, this.oc.has('deep') ? .7 : .6); this.hurt(e, B.chill * m * DT, 'chill', ab); break;
          case 'mine': if (l.timer <= 0) { l.timer = B.mineRearm; for (const o of this.enemies) if (o.alive && !o.air && Math.hypot(o.x - e.x, o.y - e.y) <= 1) this.hurt(o, B.mine * m, 'mine', ab); } break;
          case 'shatter': e.brittleU = t + 3; this.hurt(e, B.shatter * m * DT, 'shatter', ab); break;
          case 'overload': e.chargeU = t + 4; e.chargeM = m; this.hurt(e, B.overload * m * DT, 'overload', ab); break;
          case 'tar': this.slow(e, .2, 1); e.shredU = t + B.shredLinger; this.hurt(e, B.tar * m * DT, 'tar', ab); break;
        }
      }
    }
    // enemies move
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.type === 'warden') { e.wardT -= DT; if (e.wardT <= 0) { e.wardT = 5; for (const o of this.enemies) if (o.alive && Math.hypot(o.x - e.x, o.y - e.y) <= 2) o.shield = Math.max(o.shield, 40 * (this.o.wardScale ? Math.pow(this.o.hpg || 1.11, this.wave - 1) : 1)); } }
      const sl = t < e.slowU ? e.slowV : 0; const v = e.spd * (1 - sl) * DT;
      if (e.air) { const dx = CORE_C.x - e.x, dy = CORE_C.y - e.y, d = Math.hypot(dx, dy); if (d <= v) { this.leak(e); continue; } e.x += dx / d * v; e.y += dy / d * v; continue; }
      const c = Math.floor(e.x), r = Math.floor(e.y); if (this.isCore[idx(c, r)]) { this.leak(e); continue; }
      let best = null, bd = 1e9; for (const [dc, dr] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue; const dv = this.dist[idx(cc, rr)]; if (dv >= 0 && dv < bd) { bd = dv; best = [cc, rr]; } }
      if (!best) continue; const tx = best[0] + .5, ty = best[1] + .5; const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
      if (d <= v) { e.x = tx; e.y = ty; } else { e.x += dx / d * v; e.y += dy / d * v; }
    }
    this.enemies = this.enemies.filter(e => e.alive);
    this.t += DT; this.waveT += DT;
  }
  leak(e) { e.alive = false; this.waveLeft--; this.lives -= e.leak; this.leaks = (this.leaks || 0) + 1; this.leakBy = this.leakBy || {}; this.leakBy[e.type] = (this.leakBy[e.type] || 0) + 1; }
  runWave(maxT = 600) {
    this.startWave(); let guard = 0;
    while ((this.spawnQ.length || this.enemies.length) && this.lives > 0 && guard++ < maxT * 30) this.step();
    const clear = 20 + 5 * this.wave; const rate = this.oc.has('interest') ? .15 : .1, cap = this.oc.has('interest') ? 45 : 25;
    const intr = Math.min(Math.floor(this.gold * rate), cap); this.gold += clear + intr; this.waveTime = this.waveT;
    return this.lives > 0;
  }
}
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy; let u = ((px - ax) * dx + (py - ay) * dy) / L2; u = Math.max(0, Math.min(1, u)); return Math.hypot(px - ax - u * dx, py - ay - u * dy); }
function exposure(path, ax, ay, bx, by) { const CT = B.contact; let s = 0; for (let i = 0; i + 1 < path.length; i++) { const [x0, y0] = path[i], [x1, y1] = path[i + 1]; for (let k = 0; k < 10; k++) { const u = (k + .5) / 10; if (segDist(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, ax, ay, bx, by) <= CT) s += .1; } } return s; }
function setMap(m) { MAP.length = 0; MAP.push(...m.rows); SP_A.length = 0; SP_A.push(...m.spA); SP_B.length = 0; SP_B.push(...m.spB); CORE.length = 0; CORE.push(...m.core); CORE_C.x = (m.core[0][0] + m.core[3][0]) / 2 + .5; CORE_C.y = (m.core[0][1] + m.core[3][1]) / 2 + .5; }
const CANYON = { rows: [...MAP], spA: SP_A.map(p => [...p]), spB: SP_B.map(p => [...p]), core: CORE.map(p => [...p]) };
module.exports = { setMap, CANYON, CORE, CORE_C, B, BOSS_HP, GAP, ENEMY_T: null, Game, NODE, ENEMY, WAVES, MAP, W, H, idx, SP_A, SP_B, segDist, exposure, PAIR, OVERCLOCKS, rng };

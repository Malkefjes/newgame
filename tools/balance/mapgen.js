'use strict';
// LATTICE procedural map generator (canonical orientation: core on the right edge).
const W = 24, H = 14;
let MIN_POT_A = 75, MIN_POT_B = 35;
const BIOME = {
  1: { clusters: [7, 10], lenA: [20, 34], lenB: [12, 34], conduits: 0 },
  2: { clusters: [9, 13], lenA: [20, 36], lenB: [12, 34], conduits: 3 },
  3: { clusters: [10, 14], lenA: [22, 38], lenB: [12, 34], conduits: 3 },
};
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const ri = (R, a, b) => a + Math.floor(R() * (b - a + 1));
function bfs(grid, core) { const d = new Int32Array(W * H).fill(-1); const q = []; for (const [c, r] of core) { d[r * W + c] = 0; q.push(r * W + c); }
  for (let h = 0; h < q.length; h++) { const i = q[h], c = i % W, r = (i / W) | 0; for (const [dc, dr] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue; const j = rr * W + cc; if (grid[j] === '#' || d[j] >= 0) continue; d[j] = d[i] + 1; q.push(j); } } return d; }
function generate(seed, act) {
  const B = BIOME[act]; const R = rng(seed * 9973 + act * 31);
  for (let attempt = 1; attempt <= 200; attempt++) {
    const g = Array(W * H).fill('.');
    const r0 = ri(R, 3, 9); const core = [[22, r0], [23, r0], [22, r0 + 1], [23, r0 + 1]];
    const a0 = ri(R, 1, 11); const spA = [[0, a0], [0, a0 + 1]];
    const top = R() < .5, b0 = ri(R, 6, 15); const br = top ? 0 : H - 1; const spB = [[b0, br], [b0 + 1, br]];
    const protectedT = [...core, ...spA, ...spB]; const near = (c, r, k) => protectedT.some(([pc, pr]) => Math.abs(pc - c) <= k && Math.abs(pr - r) <= k);
    const n = ri(R, B.clusters[0], B.clusters[1]); let rocks = 0;
    for (let k = 0; k < n; k++) { let w = ri(R, 1, 2), h = ri(R, 1, 3); if (R() < .5) [w, h] = [h, w]; const c = ri(R, 1, W - 3 - w), r = ri(R, 0, H - h);
      let ok = true; for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (near(x, y, 2)) ok = false; if (!ok) continue;
      for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (g[y * W + x] !== '#') { g[y * W + x] = '#'; rocks++; } }
    const d = bfs(g, core); const len = sp => Math.min(...sp.map(([c, r]) => d[r * W + c]));
    const lA = len(spA), lB = len(spB);
    if (lA < 0 || lB < 0 || lA < B.lenA[0] || lA > B.lenA[1] || lB < B.lenB[0] || lB > B.lenB[1]) continue;
    let open = 0, reach = 0; for (let i = 0; i < W * H; i++) if (g[i] !== '#') { open++; if (d[i] >= 0) reach++; }
    if (reach < open - 4) continue; // no wasted pockets bigger than 4 tiles
    // conduits: buildable tiles within 3 tiles of the open path from A, at least 4 apart
    const conduits = [];
    if (B.conduits) { const path = []; let c = spA[0][0], r = spA[0][1]; while (d[r * W + c] > 0) { path.push([c, r]); let best = null, bd = 1e9; for (const [dc, dr] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue; const v = d[rr * W + cc]; if (v >= 0 && v < bd) { bd = v; best = [cc, rr]; } } [c, r] = best; }
      for (let t = 0; t < 60 && conduits.length < B.conduits; t++) { const [pc, pr] = path[ri(R, 2, path.length - 3)]; const c2 = pc + ri(R, -3, 3), r2 = pr + ri(R, -3, 3); if (c2 < 1 || r2 < 0 || c2 > W - 3 || r2 >= H || g[r2 * W + c2] !== '.' || near(c2, r2, 1)) continue; if (conduits.some(([x, y]) => Math.abs(x - c2) + Math.abs(y - r2) < 4)) continue; conduits.push([c2, r2]); } }
    for (const [c, r] of core) g[r * W + c] = 'C'; for (const [c, r] of spA) g[r * W + c] = 'A'; for (const [c, r] of spB) g[r * W + c] = 'B';
    const rows = []; for (let r = 0; r < H; r++) rows.push(g.slice(r * W, r * W + W).join(''));
    const pot = (typeof MIN_POT_A === 'number') ? mazePotential(rows, core, spA, spB) : null;
    if (pot && (pot.a < MIN_POT_A || pot.b < MIN_POT_B)) continue;
    return { seed, act, attempt, rows, core, spA, spB, conduits, lenA: lA, lenB: lB, rockPct: Math.round(100 * rocks / (W * H)), potA: pot && pot.a, potB: pot && pot.b };
  }
  return null;
}
// Maze potential: try 16 serpentine wall layouts on a scratch grid; return best path lengths from A and B.
function mazePotential(rows, core, spA, spB) {
  const TOP = [...Array(12).keys()].map(i => i + 2), BOT = [...Array(12).keys()];
  const prot = new Set(); for (const [c, r] of [...core, ...spA, ...spB]) for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) prot.add((r + dr) * W + (c + dc));
  let best = { a: 0, b: 0, score: -1 };
  for (const sp of [3, 4]) for (let o = 0; o < sp; o++) for (const startTop of [true, false]) {
    const g = rows.join('').split(''); let k = 0;
    for (let c = 2 + o; c <= 20; c += sp, k++) for (const r of ((k % 2 === 0) === startTop ? TOP : BOT)) { const i = r * W + c; if (g[i] !== '.' || prot.has(i)) continue; g[i] = '#'; const d = bfs(g, core); if ([...spA, ...spB].some(([x, y]) => d[y * W + x] < 0)) g[i] = '.'; }
    const d = bfs(g, core); const a = Math.min(...spA.map(([x, y]) => d[y * W + x])), b = Math.min(...spB.map(([x, y]) => d[y * W + x]));
    if (a + 0.5 * b > best.score) best = { a, b, score: a + 0.5 * b };
  }
  return best;
}
module.exports = { generate, BIOME, mazePotential };
if (require.main === module) {
  for (const act of [1, 2, 3]) { const t0 = Date.now(); let fail = 0, att = [], lA = [], lB = [], rp = []; const N = 2000;
    for (let s = 1; s <= N; s++) { const m = generate(s, act); if (!m) { fail++; continue; } att.push(m.attempt); lA.push(m.lenA); lB.push(m.lenB); rp.push(m.rockPct); }
    const st = a => { a.sort((x, y) => x - y); return `min ${a[0]} p50 ${a[a.length >> 1]} max ${a.at(-1)}`; };
    console.log(`act ${act}: ${N} seeds, failures ${fail}, attempts [${st(att)}], pathA [${st(lA)}], pathB [${st(lB)}], rock% [${st(rp)}], ${((Date.now() - t0) / N).toFixed(2)} ms/map`); }
  const m = generate(7, 2); console.log(m.rows.join('\n'), '\nconduits', JSON.stringify(m.conduits));
}

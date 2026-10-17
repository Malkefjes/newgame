'use strict';
const { Game, NODE, W, H, idx, SP_A, SP_B, CORE_C, exposure, PAIR, OVERCLOCKS, rng } = require('./sim.js');
const TOPGAP = [...Array(12).keys()].map(i => i + 2), BOTGAP = [...Array(12).keys()];
const T_STD = [[3, TOPGAP], [7, BOTGAP], [10, TOPGAP], [14, BOTGAP], [18, TOPGAP]];
const T_DENSE = [[2, TOPGAP], [4, BOTGAP], [6, TOPGAP], [8, BOTGAP], [10, TOPGAP], [14, BOTGAP], [16, TOPGAP], [18, BOTGAP], [20, TOPGAP]];
function template(t) { return (t || T_STD).map(([c, rows]) => rows.map(r => [c, r])); }
module.exports.T_DENSE = T_DENSE;
module.exports.T_GEN = [[3, TOPGAP], [7, BOTGAP], [11, TOPGAP], [15, BOTGAP], [19, TOPGAP]];
const { WAVES } = require('./sim.js');
function flyLines(w) { const fl = []; if (WAVES[w - 1] && WAVES[w - 1].some(([t]) => t === 'flyer')) { const L = (x0, y0) => { const pts = []; for (let k = 0; k <= 30; k++) pts.push([x0 + (CORE_C.x - x0) * k / 30, y0 + (CORE_C.y - y0) * k / 30]); return pts; }; fl.push(L((SP_A[0][0] + SP_A[1][0]) / 2 + .5, (SP_A[0][1] + SP_A[1][1]) / 2 + .5)); if (w >= 11) fl.push(L((SP_B[0][0] + SP_B[1][0]) / 2 + .5, (SP_B[0][1] + SP_B[1][1]) / 2 + .5)); } return fl; }
const pathsFor = (g, dist, wave) => wave >= 10 ? [g.pathFrom(SP_A[0][0], SP_A[0][1], dist), g.pathFrom(SP_B[0][0], SP_B[0][1], dist)] : [g.pathFrom(SP_A[0][0], SP_A[0][1], dist)];
function covScore(g, n, type, paths) { if (NODE[type].air) paths = [...paths, ...flyLines(g.wave + 1), ...flyLines(g.wave + 1)]; const N = NODE[type]; const R = N.range[0], rmin = N.rmin || 0; let cov = 0; for (const p of paths) for (const [x, y] of p) { const d = Math.hypot(x - n.x, y - n.y); if (d <= R && d >= rmin) cov++; } return cov; }
function bestConvert(g, type, st) {
  const paths = pathsFor(g, g.dist, g.wave + 1); let best = null, bs = -1;
  for (const n of g.nodes) { if (n.type !== 'wall') continue; let s = covScore(g, n, type, paths);
    if (st.links) { let lk = 0; for (const m of g.nodes) { if (m.type === 'wall' || m === n || Math.hypot(m.x - n.x, m.y - n.y) > g.linkRange() || !g.los(m, n) || g.linksOf(m).length >= g.slots(m)) continue; let ex = 0; for (const p of paths) ex += exposure(p, m.x, m.y, n.x, n.y); lk = Math.max(lk, ex); } s += st.lk * lk * (st.lkW || 3); }
    s += g.R() * .01; if (s > bs) { bs = s; best = n; } }
  return best;
}
function relink(g, st) {
  g.links = []; if (!st.links) return; const paths = pathsFor(g, g.dist, g.wave + 1); const cand = []; const ns = g.nodes.filter(n => n.type !== 'wall');
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) { const a = ns[i], b = ns[j]; if (Math.hypot(a.x - b.x, a.y - b.y) > g.linkRange()) continue; let ex = 0; for (const p of paths) ex += exposure(p, a.x, a.y, b.x, b.y); if (ex < .25) continue; const nw = WAVES[g.wave] || []; const has = t => nw.some(([k]) => k === t); const pw = { arc: 1, shatter: 1, overload: has('swarm') ? 1.2 : .7, tar: has('brute') || has('colossus') ? 1.2 : .6, chill: .7, mine: has('swarm') ? 1.1 : .7 }; cand.push({ a, b, s: ex * (st.pairW?.[PAIR(a.type, b.type)] ?? pw[PAIR(a.type, b.type)]) * (1 + .5 * (a.tier + b.tier)) }); }
  cand.sort((x, y) => y.s - x.s); for (const k of cand) { const l = g.link(k.a, k.b); if (l) l.charge = 0; }
}
function playRun(st, seed, opts = {}) {
  const g = new Game({ seed, los: st.los, wardScale: st.wardScale, hpg: st.hpg, ...opts }); if (opts.gold) g.gold = opts.gold;
  const R = rng(seed * 7 + 3); const pool = [...OVERCLOCKS];
  const cols = template(st.tmpl).flat();
  let ti = 0; const log = [];
  for (let w = 1; w <= 20; w++) {
    // 1. walls: up to wallBudget(w) gold this phase
    let wallGold = st.maze ? st.wallBudget(w, g.gold) : 0;
    for (const [c, r] of cols) { if (wallGold < 10) break; if (g.block[idx(c, r)] || g.noBuild[idx(c, r)]) continue; if (g.build('wall', c, r)) wallGold -= 10; }
    // anti-air: if next wave has flyers, ensure per-flyer damage on the flight line >= 1.6x flyer HP
    if (st.antiAir !== false) { const nw = WAVES[w - 1]; if (nw.some(([k]) => k === 'flyer')) {
      const fhp = 60 * Math.pow(1.11, w - 1) * (st.hpg ? Math.pow(st.hpg / 1.11, w - 1) : 1);
      const lines = flyLines(w); const airDmg = () => { let tot = 1e9; for (const L of lines) { let d = 0; for (const n of g.nodes) { if (n.type !== 'bolt' && n.type !== 'frost') continue; const N = NODE[n.type]; const R = N.range[n.tier]; let inR = 0; for (let k = 0; k + 1 < L.length; k++) { const [x, y] = L[k]; if (Math.hypot(x - n.x, y - n.y) <= R) inR += Math.hypot(L[k + 1][0] - x, L[k + 1][1] - y); } d += (n.type === 'bolt' ? N.dmg[n.tier] * 2 : N.dmg[n.tier]) * inR / 1.3; } tot = Math.min(tot, d); } return tot; };
      if (process.env.DBG) console.log("w", w, "air", Math.round(airDmg()), "need", Math.round(1.6 * fhp));
      let gg = 0; while (airDmg() < (st.airK || 3) * fhp && gg++ < 20) {
        let best = null, bs = -1; for (const L of lines) for (let r = 0; r < 14; r++) for (let c = 0; c < 24; c++) { const i = idx(c, r); const isWall = g.nodes.find(n => n.c === c && n.r === r && n.type === 'wall'); if (!isWall && (g.block[i] || g.noBuild[i])) continue; let inR = 0; for (const [x, y] of L) if (Math.hypot(x - c - .5, y - r - .5) <= 3) inR++; let near = 0; for (const n of g.nodes) if (n.type === 'bolt' && Math.hypot(n.x - c - .5, n.y - r - .5) < 4) near++; const s = inR + (isWall ? 3 : 0) - 6 * near; if (s > bs && (isWall || g.canBuild(c, r))) { bs = s; best = [c, r, isWall]; } }
        if (!best) break; if (best[2]) { if (!g.convert(best[2], 'bolt')) { const u = g.nodes.filter(n => n.type === 'bolt' && n.tier < 2).sort((a, b) => a.tier - b.tier)[0]; if (!u || !g.upgrade(u)) break; } } else if (!g.build('bolt', best[0], best[1])) break; }
    } }
    // nomaze: walls placed nowhere; nodes placed at best coverage tiles anywhere
    let guard = 0;
    while (guard++ < 300) {
      const armed = g.nodes.filter(n => n.type !== 'wall').length; const target = st.nodeTarget(w); let type = st.types[ti % st.types.length]; if (st.fallback && g.gold < NODE[type].cost[0] - 10) { const cheap = [...new Set(st.types)].filter(t => g.gold >= NODE[t].cost[0] - 10).sort((a, b) => NODE[a].cost[0] - NODE[b].cost[0])[0]; if (cheap) type = cheap; }
      if (armed < target && g.gold >= NODE[type].cost[0] - (st.maze ? 10 : 0)) {
        if (st.maze && !(st.openFree && w <= 3)) { let n = bestConvert(g, type, st); if (!n) { for (const [c, r] of cols) { if (!g.block[idx(c, r)] && !g.noBuild[idx(c, r)] && g.gold >= NODE[type].cost[0]) { const nn = g.build(type, c, r); if (nn) { ti++; n = 'built'; break; } } } if (n === 'built') continue; if (!n) break; } else { g.convert(n, type); ti++; continue; } }
        else { // place freely near path for coverage
          const paths = pathsFor(g, g.dist, w); let best = null, bs = -1; for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { if (g.block[idx(c, r)] || g.noBuild[idx(c, r)]) continue; const d = g.canBuild(c, r); if (!d) continue; const cov = covScore(g, { x: c + .5, y: r + .5 }, type, pathsFor(g, d, w)); let lk = 0; if (st.links) for (const m of g.nodes) { if (Math.hypot(m.x - c - .5, m.y - r - .5) > g.linkRange()) continue; let ex = 0; for (const p of pathsFor(g, d, w)) ex += exposure(p, m.x, m.y, c + .5, r + .5); lk = Math.max(lk, ex); } const s = cov + 3 * lk + g.R() * .01; if (s > bs) { bs = s; best = [c, r]; } }
          if (best && g.build(type, best[0], best[1])) { ti++; continue; } break; }
      }
      let best = null, bs = -1;
      for (const n of g.nodes) { if (n.type === 'wall' || n.tier >= 2) continue; const cost = NODE[n.type].cost[n.tier + 1]; if (cost > g.gold) continue; const s = (n.dmgLast + 50) * (1 + .5 * g.linksOf(n).length) / cost; if (s > bs) { bs = s; best = n; } }
      if (best && (armed >= target * st.upAt || g.gold > 300)) { g.upgrade(best); continue; }
      break;
    }
    relink(g, st);
    const ok = g.runWave();
    log.push({ w, lives: g.lives, gold: g.gold, walls: g.nodes.filter(n => n.type === 'wall').length, armed: g.nodes.filter(n => n.type !== 'wall').length, links: g.links.length, pathA: g.pathFrom(SP_A[0][0], SP_A[0][1]).length, pathB: g.pathFrom(SP_B[0][0], SP_B[0][1]).length, time: Math.round(g.waveTime), stats: { ...g.waveStats }, spent: g.nodes.reduce((a, n) => a + n.spent, 0) });
    if (!ok) return { won: false, wave: w, lives: 0, g, log };
    if ([4, 8, 12, 16].includes(w) && st.overclocks) { const offer = []; while (offer.length < 3 && pool.length) offer.push(pool.splice((R() * pool.length) | 0, 1)[0]); const pick = offer[0]; g.oc.add(pick); if (pick === 'core') g.lives += 8; for (const o of offer) if (o !== pick) pool.push(o); }
  }
  return { won: true, wave: 20, lives: g.lives, g, log };
}
module.exports.playRun = playRun;

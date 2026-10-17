const S = require('./sim.js'); const { generate } = require('./mapgen.js'); const bot = require('./bot3.js'); const { plan } = require('./planner.js');
const st = { los: true, wardScale: true, hpg: 1.10, maze: 1, cov: .3, lk: 1, links: true, nodeTarget: w => Math.min(40, 2 + 1.6 * w), upAt: .4, wallBudget: (w, g) => Math.min(g * .5, 150), types: ['bolt', 'frost', 'bolt', 'mortar', 'bolt', 'frost'], overclocks: true, fallback: true };
const rows = [];
for (let s = 1; s <= 80; s++) { const m = generate(s, 2); S.setMap(m); const t0 = Date.now(); const p = plan(); const pt = Date.now() - t0;
  const g = new S.Game({ seed: 1 }); g.gold = 1e9; for (const [c, rs] of p.tmpl) for (const r of rs) g.build('wall', c, r); const potA = g.dist[S.idx(S.SP_A[0][0], S.SP_A[0][1])];
  const rs = [1, 2].map(sd => bot.playRun({ ...st, tmpl: p.tmpl }, sd, { startGold: 350 })); rows.push({ s, potA, waves: rs.map(r => r.wave), wins: rs.filter(r => r.won).length, pt }); }
for (const cut of [0, 60, 70, 75]) { const keep = rows.filter(r => r.potA >= cut); const w = keep.flatMap(r => r.waves).sort((a, b) => a - b);
  console.log(`potential >= ${cut}: maps kept ${keep.length}/80, win rate ${Math.round(100 * keep.reduce((a, r) => a + r.wins, 0) / (2 * keep.length))}%, wave p10 ${w[Math.floor(w.length * .1)]} p50 ${w[w.length >> 1]}, maps with 0 wins & avg wave < 9: ${keep.filter(r => r.wins === 0 && (r.waves[0] + r.waves[1]) / 2 < 9).length}`); }
console.log('planner ms per map: max', Math.max(...rows.map(r => r.pt)));

const { playRun } = require('./bot3.js');
const mixes = { mix6: ['bolt', 'frost', 'bolt', 'mortar', 'bolt', 'frost'], bbm: ['bolt', 'bolt', 'mortar'], bm: ['bolt', 'mortar'], b: ['bolt'], m: ['mortar'] };
for (const hpg of [1.10, 1.105]) for (const links of [true, false]) for (const oc of [false, true]) for (const [mk, types] of Object.entries(mixes)) {
  let best = null;
  for (const a of [1.3, 1.6]) for (const wc of [80, 150]) {
    const st = { los: true, wardScale: true, hpg, maze: 1, cov: .3, lk: links ? 1 : 0, links, nodeTarget: w => Math.min(40, 2 + a * w), upAt: .4, wallBudget: (w, g) => Math.min(g * .5, wc), types, overclocks: oc };
    const rs = []; for (let s = 1; s <= 8; s++) rs.push(playRun(st, s));
    const stats = {}; for (const r of rs) for (const [k, v] of Object.entries(r.g.stats)) stats[k] = (stats[k] || 0) + v; const tot = Object.values(stats).reduce((x, y) => x + y, 0);
    const beam = ['arc', 'chill', 'mine', 'shatter', 'overload', 'tar'].reduce((x, k) => x + (stats[k] || 0), 0);
    const res = { wins: rs.filter(r => r.won).length, avgW: +(rs.reduce((x, r) => x + r.wave, 0) / 8).toFixed(1), beamPct: Math.round(100 * beam / tot), min: +(rs.reduce((x, r) => x + r.log.reduce((y, l) => y + l.time, 0), 0) / 8 / 60).toFixed(1) };
    if (!best || res.wins > best.wins || (res.wins === best.wins && res.avgW > best.avgW)) best = res;
  }
  console.log('hpg', hpg, links ? 'beams ' : 'NObeam', oc ? 'OC' : '--', mk.padEnd(5), JSON.stringify(best));
}

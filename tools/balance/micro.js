const S = require('./sim.js'); const { Game, exposure } = S;
function bench(pair, geometry, tier = 0, comp = [['grunt', 15], ['brute', 4], ['swarm', 2]], wave = 10, late = false) {
  const g = new Game({ seed: 1 }); g.gold = 1e6;
  // reference battery: 4 bolts T1 near the core
  for (const [c, r] of [[20, 4], [20, 9], [16, 4], [16, 9], [14, 4], [14, 9]]) { const n = g.build('bolt', c, r); if (late) n.tier = 2; } if (late) for (const [c, r] of [[17, 4], [15, 4], [15, 9], [13, 9], [13, 4]]) { const n = g.build('mortar', c, r); if (n) n.tier = 2; }
  const types = { arc: ['bolt', 'bolt'], chill: ['frost', 'frost'], mine: ['mortar', 'mortar'], shatter: ['bolt', 'frost'], overload: ['bolt', 'mortar'], tar: ['frost', 'mortar'] }[pair];
  let ex = 0;
  if (types) { const pos = geometry === 'cross' ? [[11, 4], [11, 8]] : [[11, 4], [14, 7]];
    const a = g.build(types[0], ...pos[0]), b = g.build(types[1], ...pos[1]); a.passive = b.passive = true; a.tier = b.tier = tier; const l = g.link(a, b); if (!l) { console.log('nolink', pair); return; } l.charge = 0; ex = exposure(g.pathFrom(0, 6), a.x, a.y, b.x, b.y); }
  // custom wave
  S.WAVES[wave - 1] = comp; g.wave = wave - 1; g.startWave(); let guard = 0; const totHP = (() => 0)();
  let spawned = 0; const hp0 = []; const orig = g.spawn.bind(g); g.spawn = s => { orig(s); hp0.push(g.enemies.at(-1).max); };
  while ((g.spawnQ.length || g.enemies.length) && guard++ < 30 * 600) g.step();
  const total = hp0.reduce((x, y) => x + y, 0); const dealt = Object.values(g.waveStats).reduce((x, y) => x + y, 0);
  return { pair, geometry, tier, exposure: +ex.toFixed(1), pctHPRemoved: Math.round(100 * dealt / total), leaks: g.leaks || 0, beamOwn: Math.round(g.waveStats[pair] || 0) };
}
const base = JSON.parse(JSON.stringify(S.WAVES));
console.log('path', JSON.stringify(new Game({}).pathFrom(0, 6).map(([x, y]) => [x - .5, y - .5])));
for (const tier of [0, 2]) for (const geo of ['cross', 'along']) for (const p of ['none', 'arc', 'chill', 'mine', 'shatter', 'overload', 'tar']) { console.log(JSON.stringify(bench(p, geo, tier))); S.WAVES.splice(0, 20, ...JSON.parse(JSON.stringify(base))); }
console.log('--- counter matrix (% wave HP removed, cross geometry) ---');
const K = +(process.argv[4] || 1); const comps = { swarm: [['swarm', 5 * K]], armor: [['brute', 10 * K]], runners: [['runner', 30 * K]], mixed: [['grunt', 15 * K], ['brute', 4 * K], ['swarm', 2 * K]] };
for (const tier of [0, 2]) { const rows = {}; for (const [cn, comp] of Object.entries(comps)) for (const p of ['none', 'arc', 'chill', 'mine', 'shatter', 'overload', 'tar']) { const r = bench(p, 'cross', tier, comp, +(process.argv[3] || 15), process.argv[2] === 'late'); S.WAVES.splice(0, 20, ...JSON.parse(JSON.stringify(base))); (rows[p] = rows[p] || {})[cn] = r.pctHPRemoved; }
  console.log('tier', tier + 1); for (const [p, v] of Object.entries(rows)) console.log(' ', p.padEnd(9), JSON.stringify(v)); }

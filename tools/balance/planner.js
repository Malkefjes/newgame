const S = require('./sim.js');
const TOP = [...Array(12).keys()].map(i => i + 2), BOT = [...Array(12).keys()];
function variants() { const out = []; for (const sp of [3, 4]) for (let o = 0; o < sp; o++) for (const startTop of [true, false]) { const cols = []; for (let c = 2 + o, k = 0; c <= 20; c += sp, k++) cols.push([c, (k % 2 === 0) === startTop ? TOP : BOT]); out.push(cols); } return out; }
function plan() { let best = null, bl = -1;
  for (const v of variants()) { const g = new S.Game({ seed: 1 }); g.gold = 1e9; for (const [c, rows] of v) for (const r of rows) g.build('wall', c, r);
    const L = g.dist[S.idx(S.SP_A[0][0], S.SP_A[0][1])] + 0.5 * g.dist[S.idx(S.SP_B[0][0], S.SP_B[0][1])]; if (L > bl) { bl = L; best = v; } }
  return { tmpl: best, len: bl }; }
module.exports = { plan };

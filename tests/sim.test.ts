import { describe, expect, it } from 'vitest';
import { Game, type Command } from '../src/sim/game';
import { mulberry32 } from '../src/sim/rng';
import type { PieceType } from '../src/sim/content';

function runPhase(g: Game, maxTicks = 30 * 600): void {
  let n = 0;
  while (g.phase === 'wave' && n++ < maxTicks) g.step();
}

/** A simple scripted opening: a serpentine of walls, a few nodes and beams. */
function scriptedBuild(g: Game): void {
  for (let c = 3; c <= 19; c += 4) {
    const fromTop = ((c - 3) / 4) % 2 === 0;
    for (let k = 0; k < 11; k++) {
      const r = fromTop ? k : 13 - k;
      g.apply({ t: 'build', type: 'wall', c, r });
    }
  }
}

describe('grid and pathing', () => {
  it('matches the spec path lengths on an empty Canyon', () => {
    const g = new Game();
    expect(g.flow[g.idx(0, 6)]).toBe(23);
    expect(g.flow[g.idx(11, 0)]).toBe(17);
  });

  it('rejects a placement that blocks every route', () => {
    const g = new Game({ seed: 1 });
    g.gold = 10_000;
    let rejected: string | null = null;
    for (let r = 0; r < 14; r++) {
      const res = g.apply({ t: 'build', type: 'wall', c: 8, r });
      if (!res.ok) rejected = res.reason;
    }
    expect(rejected).toBe('Blocks path');
    expect(g.flow[g.idx(0, 6)]).toBeGreaterThan(0);
  });

  it('rejects building on unbuildable tiles with a reason', () => {
    const g = new Game();
    expect(g.apply({ t: 'build', type: 'wall', c: 1, r: 6 })).toEqual({ ok: false, reason: 'Too close to a spawn or core' });
    expect(g.apply({ t: 'build', type: 'wall', c: 4, r: 2 })).toEqual({ ok: false, reason: 'Rock' });
  });

  it('a serpentine stretches the path', () => {
    const g = new Game();
    g.gold = 10_000;
    scriptedBuild(g);
    expect(g.flow[g.idx(0, 6)]).toBeGreaterThan(50);
  });
});

describe('waves and economy', () => {
  it('an undefended wave 1 leaks all 10 grunts and pays the clear bonus', () => {
    const g = new Game();
    expect(g.apply({ t: 'start' }).ok).toBe(true);
    runPhase(g);
    expect(g.phase).toBe('build');
    expect(g.lives).toBe(10);
    // 250 + clear bonus 25 + interest min(floor(250 * 0.1), 20)
    expect(g.gold).toBe(250 + 25 + 20);
  });

  it('selling is build-phase only, with full refund for this phase', () => {
    const g = new Game();
    g.apply({ t: 'build', type: 'bolt', c: 5, r: 6 });
    const id = g.pieces[0].id;
    expect(g.gold).toBe(200);
    g.apply({ t: 'start' });
    g.step();
    expect(g.apply({ t: 'sell', id })).toEqual({ ok: false, reason: 'Sell after wave' });
    runPhase(g);
    const before = g.gold;
    expect(g.apply({ t: 'sell', id }).ok).toBe(true);
    expect(g.gold).toBe(before + 35);
  });

  it('a beam across the path damages ground enemies', () => {
    const g = new Game();
    g.gold = 1000;
    g.apply({ t: 'build', type: 'bolt', c: 8, r: 5 });
    g.apply({ t: 'build', type: 'bolt', c: 8, r: 8 });
    const [a, b] = g.pieces;
    expect(g.apply({ t: 'link', a: a.id, b: b.id })).toEqual({ ok: true });
    expect(g.links[0].beam).toBe('arc');
    g.apply({ t: 'start' });
    runPhase(g);
    expect(g.links[0].dmgLast).toBeGreaterThan(0);
  });

  it('line of sight blocks links through walls', () => {
    const g = new Game();
    g.gold = 1000;
    g.apply({ t: 'build', type: 'bolt', c: 8, r: 5 });
    g.apply({ t: 'build', type: 'wall', c: 8, r: 6 });
    g.apply({ t: 'build', type: 'bolt', c: 8, r: 8 });
    const nodes = g.pieces.filter(p => p.type === 'bolt');
    expect(g.apply({ t: 'link', a: nodes[0].id, b: nodes[1].id })).toEqual({ ok: false, reason: 'No line of sight' });
  });

  it('a placement that cuts a beam removes it', () => {
    const g = new Game();
    g.gold = 1000;
    g.apply({ t: 'build', type: 'bolt', c: 8, r: 5 });
    g.apply({ t: 'build', type: 'bolt', c: 8, r: 8 });
    g.apply({ t: 'link', a: g.pieces[0].id, b: g.pieces[1].id });
    expect(g.links.length).toBe(1);
    g.apply({ t: 'build', type: 'wall', c: 8, r: 7 });
    expect(g.links.length).toBe(0);
  });
});

describe('run flow', () => {
  it('offers Overclocks after wave 4 and a Colossus leak ends the run', () => {
    const g = new Game({ seed: 3 });
    g.lives = 1_000_000;
    for (let w = 1; w <= 4; w++) { g.apply({ t: 'start' }); runPhase(g); }
    expect(g.offer?.length).toBe(3);
    expect(g.apply({ t: 'start' })).toEqual({ ok: false, reason: 'Pick an Overclock first' });
    expect(g.apply({ t: 'pick', i: 1 }).ok).toBe(true);
    expect(g.overclocks.length).toBe(1);
    for (let w = 5; w <= 10 && g.phase !== 'lost'; w++) {
      if (g.offer) g.apply({ t: 'pick', i: 0 });
      g.apply({ t: 'start' });
      runPhase(g);
    }
    expect(g.phase).toBe('lost');
    expect(g.wave).toBe(10);
  });

  it('early call pays a bonus and allows at most two waves on the board', () => {
    const g = new Game();
    g.apply({ t: 'start' });
    for (let i = 0; i < 30; i++) g.step();
    const gold = g.gold;
    expect(g.apply({ t: 'start' }).ok).toBe(true);
    expect(g.gold).toBeGreaterThan(gold + 5);
    expect(g.apply({ t: 'start' })).toEqual({ ok: false, reason: 'Two waves already on the board' });
  });
});

function randomCommand(g: Game, R: () => number): Command {
  const x = R();
  const pick = <T>(a: T[]): T | undefined => a[Math.floor(R() * a.length)];
  if (x < 0.55) {
    const types: PieceType[] = ['wall', 'wall', 'wall', 'bolt', 'frost', 'mortar'];
    return { t: 'build', type: pick(types)!, c: Math.floor(R() * g.cols), r: Math.floor(R() * g.rows) };
  }
  const nodes = g.pieces.filter(p => p.type !== 'wall');
  if (x < 0.75 && nodes.length > 1) return { t: 'link', a: pick(nodes)!.id, b: pick(nodes)!.id };
  if (x < 0.8 && g.pieces.length) return { t: 'convert', id: pick(g.pieces)!.id, type: pick(['bolt', 'frost', 'mortar'] as const)! };
  if (x < 0.85 && nodes.length) return { t: 'upgrade', id: pick(nodes)!.id };
  if (x < 0.88 && g.pieces.length) return { t: 'sell', id: pick(g.pieces)!.id };
  if (x < 0.9 && g.links.length) { const l = pick(g.links)!; return { t: 'unlink', a: l.a, b: l.b }; }
  if (x < 0.92 && g.offer) return { t: 'pick', i: Math.floor(R() * 3) };
  return { t: 'start' };
}

/** Plays random commands, interleaving ticks. Returns the game and how many ticks it ran. */
function fuzz(seed: number, maxTicks: number): { g: Game; ticks: number } {
  const R = mulberry32(seed * 7919);
  const g = new Game({ seed, startGold: 600 });
  let ticks = 0;
  while (ticks < maxTicks && g.phase !== 'won' && g.phase !== 'lost') {
    if (g.offer) g.apply({ t: 'pick', i: 0 });
    const n = g.phase === 'build' ? 8 : R() < 0.02 ? 1 : 0;
    for (let k = 0; k < n; k++) g.apply(randomCommand(g, R));
    if (g.phase === 'build') g.apply({ t: 'start' });
    g.step();
    ticks++;
    for (const e of g.enemies) {
      if (e.air) continue;
      if (g.flow[g.idx(e.tc, e.tr)] < 0) throw new Error(`enemy trapped (seed ${seed})`);
    }
  }
  return { g, ticks };
}

describe('determinism and fuzz', () => {
  it('replaying seed + command log gives an identical state', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { g } = fuzz(seed, 30 * 120);
      const r = Game.replay(seed, g.log, g.tick, { startGold: 600 });
      expect(r.snapshot()).toBe(g.snapshot());
    }
  });

  it('random command sequences never trap an enemy or soft-lock', () => {
    for (let seed = 100; seed < 300; seed++) {
      const { g } = fuzz(seed, 30 * 60 * 40);
      expect(['won', 'lost', 'build', 'wave']).toContain(g.phase);
      for (const s of [...g.map.spawnA, ...g.map.spawnB]) expect(g.flow[g.idx(s[0], s[1])]).toBeGreaterThan(0);
    }
  }, 120_000);
});

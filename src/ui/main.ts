// Bootstrap, game loop, input and DOM HUD. UI input becomes sim commands; nothing here
// mutates game state directly.

import type { EnemyType, NodeType, PieceType } from '../sim/content';
import { Game, type Command, type Piece } from '../sim/game';
import { BEAM_COLOR, ENEMY_COLOR, NODE_COLOR, Renderer } from './render';
import { newUiState, type UiState } from './state';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const top = $<HTMLElement>('#top');
const panel = $<HTMLElement>('#panel');
const buildbar = $<HTMLElement>('#buildbar');
const modal = $<HTMLElement>('#modal');
const canvas = $<HTMLCanvasElement>('#board');
const wrap = $<HTMLElement>('#board-wrap');

const GLYPH: Record<EnemyType, string> = {
  grunt: '●', runner: '➤', brute: '■', swarm: '∴', flyer: '◆', warden: '⬢', colossus: '✹',
};

let game: Game;
let ui: UiState;
let renderer: Renderer;
let acc = 0;
let lastFrame = performance.now() / 1000;
let shownModal = '';

function newRun(seed = (Math.random() * 2 ** 31) | 0): void {
  game = new Game({ seed });
  ui = newUiState();
  renderer = new Renderer(canvas, game.cols, game.rows);
  acc = 0;
  shownModal = '';
  modal.hidden = true;
  fit();
}

function fit(): void {
  const w = wrap.clientWidth - 16, h = wrap.clientHeight - 16;
  let s = Math.min(w / renderer.width, h / renderer.height);
  if (s >= 1) s = Math.max(1, Math.floor(s * 4) / 4);
  renderer.resize(Math.max(0.3, s));
}
window.addEventListener('resize', () => fit());

// ------------------------------------------------------------------ commands

function now(): number { return performance.now() / 1000; }

function run(cmd: Command, at?: { x: number; y: number }): boolean {
  const res = game.apply(cmd);
  if (!res.ok) {
    const p = at ?? ui.mouse ?? { x: game.cols / 2, y: 1 };
    ui.flash = { text: res.reason, x: p.x, y: p.y, until: now() + 1.4 };
  }
  return res.ok;
}

function selectedPiece(): Piece | undefined {
  return ui.selected ? game.piece(ui.selected) : undefined;
}

function setTool(t: PieceType | null): void {
  ui.tool = t;
  ui.drag = null;
  if (t) ui.selected = null;
}

function cancel(): void {
  ui.tool = null;
  ui.drag = null;
  ui.selected = null;
}

// ------------------------------------------------------------------ input

function tileOf(e: MouseEvent): { x: number; y: number; c: number; r: number } {
  const m = renderer.toTile(e.clientX, e.clientY);
  return { ...m, c: Math.floor(m.x), r: Math.floor(m.y) };
}

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousedown', e => {
  const m = tileOf(e);
  ui.mouse = { x: m.x, y: m.y };
  if (e.button === 2) {
    const beam = renderer.beamAt(game, ui.mouse);
    if (beam && !ui.tool && !ui.drag) run({ t: 'unlink', a: beam.a, b: beam.b });
    else cancel();
    return;
  }
  if (e.button !== 0) return;
  const piece = game.pieceAt(m.c, m.r);
  if (ui.tool) {
    if (piece?.type === 'wall' && ui.tool !== 'wall') {
      if (run({ t: 'convert', id: piece.id, type: ui.tool }) && !e.shiftKey) { ui.tool = null; ui.selected = piece.id; }
      return;
    }
    if (!piece) {
      const ok = run({ t: 'build', type: ui.tool, c: m.c, r: m.r });
      if (ui.tool === 'wall') ui.drag = { kind: 'paint', last: `${m.c},${m.r}` };
      else if (ok && !e.shiftKey) ui.tool = null;
      return;
    }
    ui.tool = null;
  }
  if (piece && piece.type !== 'wall') { ui.drag = { kind: 'link', from: piece.id, moved: false }; return; }
  ui.selected = piece ? piece.id : null;
});

window.addEventListener('mousemove', e => {
  const m = tileOf(e);
  const inside = m.x >= 0 && m.y >= 0 && m.x < game.cols && m.y < game.rows;
  ui.mouse = inside || ui.drag ? { x: m.x, y: m.y } : null;
  const d = ui.drag;
  if (d?.kind === 'link') {
    const from = game.piece(d.from);
    if (from && (from.c !== m.c || from.r !== m.r)) d.moved = true;
  } else if (d?.kind === 'paint' && inside) {
    paintTo(m.c, m.r);
  }
});

/** Paint walls in 4-connected steps from the last painted tile, stopping at the first block. */
function paintTo(c: number, r: number): void {
  const d = ui.drag;
  if (d?.kind !== 'paint') return;
  let [lc, lr] = d.last.split(',').map(Number);
  let guard = 0;
  while ((lc !== c || lr !== r) && guard++ < 64) {
    if (Math.abs(c - lc) >= Math.abs(r - lr)) lc += Math.sign(c - lc); else lr += Math.sign(r - lr);
    d.last = `${lc},${lr}`;
    if (game.pieceAt(lc, lr)) continue;
    const chk = game.checkBuild('wall', lc, lr);
    if (!chk.ok) {
      if (chk.reason === 'Blocks path' || chk.reason === 'Not enough gold') {
        ui.flash = { text: chk.reason, x: lc + 0.5, y: lr + 0.5, until: now() + 1.4 };
        ui.drag = null;
        return;
      }
      continue;
    }
    run({ t: 'build', type: 'wall', c: lc, r: lr });
  }
}

window.addEventListener('mouseup', e => {
  if (e.button !== 0) return;
  const d = ui.drag;
  ui.drag = null;
  if (!d) return;
  if (d.kind === 'paint') { if (!e.shiftKey) ui.tool = null; return; }
  const m = tileOf(e);
  const target = game.pieceAt(m.c, m.r);
  if (d.moved && target && target.id !== d.from) {
    run({ t: 'link', a: d.from, b: target.id }, { x: m.x, y: m.y });
    ui.selected = d.from;
  } else {
    ui.selected = d.from;
  }
});

canvas.addEventListener('mouseleave', () => { if (!ui.drag) ui.mouse = null; });

window.addEventListener('keydown', e => {
  if (!modal.hidden && shownModal.startsWith('offer')) {
    const k = Number(e.key);
    if (k >= 1 && k <= 3) run({ t: 'pick', i: k - 1 });
    return;
  }
  const key = e.key.toLowerCase();
  if (e.key === 'Tab') { e.preventDefault(); ui.heat = true; return; }
  if (e.key === ' ') { e.preventDefault(); run({ t: 'start' }); return; }
  if (e.key === 'Escape') { cancel(); return; }
  const sel = selectedPiece();
  switch (key) {
    case 'q': setTool('wall'); break;
    case '1': setTool('bolt'); break;
    case '2': setTool('frost'); break;
    case '3': setTool('mortar'); break;
    case 'p': ui.paused = !ui.paused; break;
    case 'f': ui.speed = ui.speed === 3 ? 1 : (ui.speed + 1) as 2 | 3; break;
    case 'u': if (sel) run({ t: 'upgrade', id: sel.id }, sel); break;
    case 's': if (sel && run({ t: 'sell', id: sel.id }, sel)) ui.selected = null; break;
    case 't': if (sel && sel.type !== 'wall') run({ t: 'target', id: sel.id, mode: sel.mode === 'first' ? 'strongest' : 'first' }); break;
  }
});
window.addEventListener('keyup', e => {
  if (e.key === 'Tab') ui.heat = false;
});
window.addEventListener('blur', () => { ui.heat = false; });

// ------------------------------------------------------------------ DOM actions

document.addEventListener('click', e => {
  const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!el || (el as HTMLButtonElement).disabled) return;
  const [act, a1, a2] = el.dataset.act!.split(':');
  const sel = selectedPiece();
  switch (act) {
    case 'start': run({ t: 'start' }); break;
    case 'pause': ui.paused = !ui.paused; break;
    case 'speed': ui.speed = ui.speed === 3 ? 1 : (ui.speed + 1) as 2 | 3; break;
    case 'tool': setTool(ui.tool === a1 ? null : a1 as PieceType); break;
    case 'upgrade': if (sel) run({ t: 'upgrade', id: sel.id }, sel); break;
    case 'sell': if (sel && run({ t: 'sell', id: sel.id }, sel)) ui.selected = null; break;
    case 'target': if (sel) run({ t: 'target', id: sel.id, mode: sel.mode === 'first' ? 'strongest' : 'first' }); break;
    case 'convert': if (sel) run({ t: 'convert', id: sel.id, type: a1 as NodeType }, sel); break;
    case 'unlink': run({ t: 'unlink', a: Number(a1), b: Number(a2) }); break;
    case 'close': ui.selected = null; break;
    case 'pick': run({ t: 'pick', i: Number(a1) }); break;
    case 'restart': newRun(); break;
    case 'retry': newRun(game.seed); break;
  }
  (document.activeElement as HTMLElement | null)?.blur?.();
});

// ------------------------------------------------------------------ events -> juice

function drainEvents(t: number): void {
  for (const ev of game.events) {
    switch (ev.k) {
      case 'kill':
        ui.fx.push({ k: 'pop', x: ev.x, y: ev.y, color: '#ffffff', t0: t, dur: 0.35 });
        ui.fx.push({ k: 'text', x: ev.x, y: ev.y, text: `+${ev.gold}`, color: '#ffd447', t0: t, dur: 0.6 });
        break;
      case 'leak':
        ui.fx.push({ k: 'leak', x: ev.x, y: ev.y, t0: t, dur: 3 });
        ui.shakeUntil = t + 0.35;
        ui.vignetteUntil = t + 0.5;
        ui.livesPulseUntil = t + 0.5;
        break;
      case 'blast': {
        const color = ev.kind === 'shell' ? '#ff9a50' : ev.kind === 'mine' ? BEAM_COLOR.minefield : BEAM_COLOR.overload;
        ui.fx.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r, color, t0: t, dur: 0.3 });
        break;
      }
      case 'frost':
        ui.fx.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r, color: 'rgba(98,208,255,0.6)', t0: t, dur: 0.4 });
        break;
      case 'hit':
        ui.fx.push({ k: 'pop', x: ev.x, y: ev.y, color: '#fff3b0', t0: t, dur: 0.15 });
        break;
      case 'summary':
        break;
    }
  }
  game.events.length = 0;
  ui.fx = ui.fx.filter(f => t - f.t0 < f.dur);
  if (ui.fx.length > 400) ui.fx.splice(0, ui.fx.length - 400);
}

// ------------------------------------------------------------------ HUD

let lastTop = '', lastPanel = '', lastBar = '';

function waveChips(w: number): string {
  const groups = game.C.waves[w - 1];
  if (!groups) return '';
  const counts = new Map<EnemyType, number>();
  for (const [t, n] of groups) counts.set(t, (counts.get(t) ?? 0) + (t === 'swarm' ? n * game.C.spawning.swarmPackSize : n));
  return [...counts].map(([t, n]) =>
    `<span class="chip" title="${game.C.enemies[t].name}"><i style="color:${ENEMY_COLOR[t]}">${GLYPH[t]}</i>${n}</span>`).join('');
}

function renderTop(t: number): void {
  const g = game;
  const can = g.canStart();
  let startLabel: string;
  if (g.phase === 'build') startLabel = `Start wave ${g.wave + 1} <kbd>Space</kbd>`;
  else if (g.phase === 'wave' && can.ok) startLabel = `Call wave ${g.wave + 1} early +${g.earlyCallBonus()}g`;
  else if (g.phase === 'wave') startLabel = g.wave >= g.waveCount() ? 'Final wave' : 'Two waves on board';
  else startLabel = 'Run over';
  const nextNum = g.phase === 'build' ? g.wave + 1 : g.wave + 1 <= g.waveCount() ? g.wave + 1 : 0;
  const spawns = nextNum >= g.C.spawning.spawnBOpensAt ? 'A + B' : 'A';
  const html = `
    <span class="brand">LATTICE</span>
    <span class="stat lives ${t < ui.livesPulseUntil ? 'pulse' : ''}">♥ ${g.lives}<small>lives</small></span>
    <span class="stat gold">◈ ${g.gold}<small>gold</small></span>
    <span class="stat">${Math.max(g.wave, 0)} / ${g.waveCount()}<small>wave</small></span>
    ${nextNum ? `<span class="preview">Next: wave ${nextNum} ${waveChips(nextNum)} <small>from ${spawns}</small></span>` : ''}
    <span class="spacer"></span>
    <span class="controls">
      <button class="primary" data-act="start" ${can.ok ? '' : 'disabled'}>${startLabel}</button>
      <button data-act="speed">${ui.speed}× <kbd>F</kbd></button>
      <button data-act="pause">${ui.paused ? '▶ Resume' : '❚❚ Pause'} <kbd>P</kbd></button>
    </span>`;
  if (html !== lastTop) { top.innerHTML = html; lastTop = html; }
}

function renderBar(): void {
  const g = game;
  const cards: [PieceType, string, string, string][] = [
    ['wall', 'Wall', 'Q', 'Blocks the path. Convert later.'],
    ['bolt', 'Bolt', '1', 'Single target · hits air'],
    ['frost', 'Frost', '2', 'Pulse slow · hits air'],
    ['mortar', 'Mortar', '3', 'Splash · ground only'],
  ];
  const html = cards.map(([type, name, key, desc]) => {
    const cost = g.pieceCost(type);
    const col = type === 'wall' ? '#5b6170' : NODE_COLOR[type];
    return `<button class="card ${ui.tool === type ? 'active' : ''}" data-act="tool:${type}" ${g.gold < cost ? 'disabled' : ''}>
      <span class="t"><span class="dot" style="background:${col}"></span>${name} <kbd>${key}</kbd></span>
      <span class="c">${cost}g</span><span class="d">${desc}</span></button>`;
  }).join('') + `<span class="hint">Drag node → node to link a beam · Right-click a beam to remove<br>
    Shift+click keeps the piece · Drag with Wall to paint · Hold <kbd>Tab</kbd> for beam heat</span>`;
  if (html !== lastBar) { buildbar.innerHTML = html; lastBar = html; }
}

function nodeStats(p: Piece): string {
  const g = game;
  if (p.type === 'wall') return '';
  const N = g.C.nodes[p.type];
  const rows: [string, string][] = [];
  const mult = g.ownDamageMult(p);
  if (p.type === 'bolt') {
    rows.push(['Damage', `${(N.damage[p.tier] * mult).toFixed(0)} per hit`], ['Fire rate', `${g.fireRate(p).toFixed(1)}/s`], ['Range', `${g.range(p)} tiles`], ['Targets', 'Ground + air']);
  } else if (p.type === 'frost') {
    rows.push(['Damage', `${(N.damage[p.tier] * mult).toFixed(0)} per pulse`], ['Slow', `${Math.round((N.slow![p.tier] + (g.has('deepFreeze') ? 0.1 : 0)) * 100)}% for 1.5 s`], ['Radius', `${g.range(p)} tiles`], ['Targets', 'Ground + air']);
  } else {
    rows.push(['Damage', `${(N.damage[p.tier] * mult).toFixed(0)} per shell`], ['Splash', `${g.splash(p).toFixed(2)} tiles`], ['Range', `${N.minRange}–${g.range(p)} tiles`], ['Targets', 'Ground only']);
  }
  rows.push(['Damage last wave', Math.round(p.dmgLast).toLocaleString()]);
  return rows.map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join('');
}

function renderPanel(): void {
  const g = game;
  const p = selectedPiece();
  let html: string;
  if (p) {
    const name = p.type === 'wall' ? 'Wall' : g.C.nodes[p.type].name;
    const sellOk = g.phase === 'build';
    const sellBtn = `<button data-act="sell" ${sellOk ? '' : 'disabled'}>${sellOk ? `Sell +${g.sellValue(p)}g` : 'Sell after wave'} <kbd>S</kbd></button>`;
    if (p.type === 'wall') {
      const conv = (['bolt', 'frost', 'mortar'] as NodeType[]).map(t =>
        `<button data-act="convert:${t}" ${g.gold < g.convertCost(t) ? 'disabled' : ''}><span class="dot" style="background:${NODE_COLOR[t]}"></span> ${g.C.nodes[t].name} ${g.convertCost(t)}g</button>`).join('');
      html = `<h2>Wall</h2><div class="muted">Blocks the path. No attack, no link slots.</div>
        <h3>Convert</h3><div class="buttons">${conv}</div>
        <div class="buttons">${sellBtn}<button data-act="close">Close</button></div>`;
    } else {
      const links = g.linksOf(p.id);
      const beams = links.map(l => {
        const other = l.a === p.id ? l.b : l.a;
        const expo = renderer.linkExposure(g, l);
        return `<div class="beam"><span class="sw" style="background:${BEAM_COLOR[l.beam]}"></span>
          <span class="name">${g.C.beams[l.beam].name} L${g.beamLevel(l)} → #${other}<br><span class="muted">${expo.toFixed(1)} tiles under · ${Math.round(l.dmgLast)} dmg last wave${l.charge > 0 ? ' · charging' : ''}</span></span>
          <button data-act="unlink:${l.a}:${l.b}" title="Remove beam">✕</button></div>`;
      }).join('') || '<div class="muted">No beams. Drag from this node to another node.</div>';
      const up = g.upgradeCost(p);
      const upBtn = up === null ? '<button disabled>Max tier</button>'
        : `<button data-act="upgrade" ${g.gold < up ? 'disabled' : ''}>Upgrade to T${p.tier + 2} ${up}g <kbd>U</kbd></button>`;
      html = `<h2><span class="dot" style="background:${NODE_COLOR[p.type]}"></span> ${name} #${p.id} · T${p.tier + 1}</h2>
        ${nodeStats(p)}
        <h3>Beams ${links.length} / ${g.slots(p)}</h3>${beams}
        <div class="buttons"><button data-act="target">Target: ${p.mode === 'first' ? 'First' : 'Strongest'} <kbd>T</kbd></button></div>
        <div class="buttons">${upBtn}</div>
        <div class="buttons">${sellBtn}<button data-act="close">Close</button></div>`;
    }
  } else {
    html = summaryHtml() + helpHtml();
  }
  if (html !== lastPanel) { panel.innerHTML = html; lastPanel = html; }
}

function summaryHtml(): string {
  const s = game.lastSummary;
  if (!s) return '';
  const max = s.lines[0]?.dmg ?? 1;
  const bars = s.lines.slice(0, 14).map(l => {
    const color = l.kind === 'beam' ? beamColorFromLabel(l.label) : '#9aa4b8';
    return `<div class="bar"><span class="fill" style="width:${(l.dmg / max * 100).toFixed(1)}%;background:${color}"></span>
      <span>${l.label}</span><span>${Math.round(l.dmg).toLocaleString()}</span></div>`;
  }).join('') || '<div class="muted">No damage dealt.</div>';
  const total = s.lines.reduce((a, l) => a + l.dmg, 0);
  const beamShare = total ? Math.round(s.lines.filter(l => l.kind === 'beam').reduce((a, l) => a + l.dmg, 0) / total * 100) : 0;
  return `<h3>Wave ${s.waves.join(' + ')} stats</h3>
    <div class="row"><span>Kills</span><span>${s.kills}</span></div>
    <div class="row"><span>Leaks</span><span style="color:${s.leaks ? 'var(--bad)' : 'inherit'}">${s.leaks}</span></div>
    <div class="row"><span>Gold earned</span><span>${s.gold} (interest ${s.interest})</span></div>
    <div class="row"><span>Beam share</span><span>${beamShare}%</span></div>
    <h3>Damage</h3><div class="bars">${bars}</div>`;
}

function beamColorFromLabel(label: string): string {
  for (const [k, v] of Object.entries(game.C.beams)) if (label.startsWith(v.name)) return BEAM_COLOR[k as keyof typeof BEAM_COLOR];
  return BEAM_COLOR.overload;
}

function helpHtml(): string {
  return `<h3>How to play</h3><div class="help">
    <p><b>Draw the maze, wire the trap.</b> Enemies walk the shortest path to your core. Walls and nodes block it, so you build the path.</p>
    <p>Build cheap <b>Walls</b> (<kbd>Q</kbd>, drag to paint), then convert the best ones into <b>Bolt</b>, <b>Frost</b> or <b>Mortar</b> nodes.</p>
    <p><b>Drag between two nodes</b> to string a beam. Beams hurt every ground enemy that walks through them, so run them <i>along</i> corridors, not across.</p>
    <p>Pairs: Bolt+Bolt Arc · Frost+Frost Chill · Mortar+Mortar Minefield · Bolt+Frost Shatter · Bolt+Mortar Overload · Frost+Mortar Tar.</p>
    <p>Beams made mid-wave take 4 s to charge. Selling is build phase only. Calling a wave early pays gold.</p>
  </div>`;
}

function renderModal(): void {
  const g = game;
  let key = '';
  if (g.phase === 'won' || g.phase === 'lost') key = g.phase;
  else if (g.offer) key = 'offer' + g.offer.join(',');
  if (key === shownModal) return;
  shownModal = key;
  if (!key) { modal.hidden = true; modal.innerHTML = ''; return; }
  modal.hidden = false;
  if (g.offer) {
    const cards = g.offer.map((id, i) => `<button data-act="pick:${i}"><b>${g.C.overclocks[id].name}</b><span>${g.C.overclocks[id].text}</span><kbd>${i + 1}</kbd></button>`).join('');
    modal.innerHTML = `<div class="box"><h1>Overclock</h1><div class="muted">Pick one. It lasts the whole run.</div><div class="cards">${cards}</div></div>`;
    return;
  }
  const won = g.phase === 'won';
  let best = 0;
  try {
    best = Number(localStorage.getItem('lattice.bestWave') ?? 0);
    const reached = won ? g.waveCount() + 1 : g.wave;
    if (reached > best) { localStorage.setItem('lattice.bestWave', String(reached)); best = reached; }
  } catch { /* storage unavailable */ }
  const ocs = g.overclocks.map(o => g.C.overclocks[o].name).join(', ') || 'none';
  modal.innerHTML = `<div class="box"><h1>${won ? 'The lattice held' : 'The core fell'}</h1>
    <div class="row"><span class="muted">${won ? `Cleared all ${g.waveCount()} waves with ${g.lives} lives left.` : `Lost on wave ${g.wave}.`}</span></div>
    <p class="muted">Seed ${g.seed} · Overclocks: ${ocs} · Best: ${best > g.waveCount() ? 'won' : `wave ${best}`}</p>
    <div class="actions"><button data-act="retry">Retry seed</button><button class="primary" data-act="restart">New run</button></div></div>`;
}

// ------------------------------------------------------------------ loop

function frame(): void {
  const t = now();
  const real = Math.min(0.25, t - lastFrame);
  lastFrame = t;
  if (game.phase === 'wave' && !ui.paused && !game.offer) {
    acc += real * ui.speed;
    let n = 0;
    while (acc >= game.dt && n < 8 && game.phase === 'wave') { game.step(); acc -= game.dt; n++; }
    if (n === 8 && acc > game.dt) acc = game.dt;
  } else if (game.phase !== 'wave') {
    acc = 0;
  }
  const alpha = game.phase === 'wave' ? Math.min(1, acc / game.dt) : 1;
  drainEvents(t);
  renderer.draw(game, ui, alpha, t);
  drawHover();
  if (ui.paused) renderer.label('PAUSED  ·  every action still works', game.cols / 2, game.rows - 0.6, '#7cc8ff');
  renderTop(t);
  renderBar();
  renderPanel();
  renderModal();
  canvas.style.cursor = ui.tool ? 'crosshair' : 'default';
  requestAnimationFrame(frame);
}

/** Tooltip for a hovered beam or node: stats and last-wave damage. */
function drawHover(): void {
  const m = ui.mouse;
  if (!m || ui.drag || ui.tool) return;
  const beam = renderer.beamAt(game, m);
  if (beam) {
    const exp = renderer.linkExposure(game, beam);
    renderer.label(`${game.C.beams[beam.beam].name} L${game.beamLevel(beam)} · ${exp.toFixed(1)} tiles under · ${Math.round(beam.dmgLast)} dmg last wave · right-click to remove`, m.x, m.y - 0.5, BEAM_COLOR[beam.beam]);
    return;
  }
  const p = game.pieceAt(Math.floor(m.x), Math.floor(m.y));
  if (p && p.type !== 'wall' && p.id !== ui.selected) {
    renderer.label(`${game.C.nodes[p.type].name} T${p.tier + 1} · ${game.linksOf(p.id).length}/${game.slots(p)} beams · ${Math.round(p.dmgLast)} dmg last wave`, p.x, p.y - 0.75, '#ffffff');
  }
}

newRun();
requestAnimationFrame(frame);

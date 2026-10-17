// Canvas 2D renderer. Reads game state; never mutates it.

import { beamFor, type BeamType, type EnemyType, type NodeType } from '../sim/content';
import type { Enemy, Game, Link, Piece } from '../sim/game';
import { dist, segDist } from '../sim/geom';
import type { UiState } from './state';

export const TILE = 48;

export const BEAM_COLOR: Record<BeamType, string> = {
  arc: '#ffd447',
  chill: '#62d0ff',
  minefield: '#ff8a3d',
  shatter: '#c792ff',
  overload: '#8cf25a',
  tar: '#c08a5a',
};

export const NODE_COLOR: Record<NodeType, string> = {
  bolt: '#f5c542',
  frost: '#5cc8f0',
  mortar: '#f07c3c',
};

export const ENEMY_COLOR: Record<EnemyType, string> = {
  grunt: '#e8e2d4',
  runner: '#ffb35c',
  brute: '#d06a5a',
  swarm: '#e2a0ff',
  flyer: '#7fe0c4',
  warden: '#8fb4ff',
  colossus: '#ff5e7a',
};

const BG = '#14171f';
const GRID = 'rgba(255,255,255,0.035)';
const ROCK = '#3a3530';
const ROCK_EDGE = '#4d463e';
const NOBUILD = 'rgba(255,255,255,0.025)';

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private scale = 1;
  private expoCache = new WeakMap<Int32Array, Map<number, number>>();

  constructor(readonly canvas: HTMLCanvasElement, readonly cols: number, readonly rows: number) {
    this.ctx = canvas.getContext('2d')!;
  }

  get width(): number { return this.cols * TILE; }
  get height(): number { return this.rows * TILE; }

  resize(cssScale: number): void {
    this.scale = cssScale;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${Math.round(this.width * cssScale)}px`;
    this.canvas.style.height = `${Math.round(this.height * cssScale)}px`;
    this.canvas.width = Math.round(this.width * cssScale * dpr);
    this.canvas.height = Math.round(this.height * cssScale * dpr);
  }

  /** Converts a client point to tile units. */
  toTile(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / (r.width / this.cols), y: (clientY - r.top) / (r.height / this.rows) };
  }

  linkExposure(g: Game, l: Link): number {
    let m = this.expoCache.get(g.flow);
    if (!m) { m = new Map(); this.expoCache.set(g.flow, m); }
    let v = m.get(l.id);
    if (v === undefined) {
      const a = g.piece(l.a)!, b = g.piece(l.b)!;
      v = g.exposure(a.x, a.y, b.x, b.y);
      m.set(l.id, v);
    }
    return v;
  }

  draw(g: Game, ui: UiState, alpha: number, now: number): void {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const s = this.scale * dpr;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    let ox = 0, oy = 0;
    if (now < ui.shakeUntil) {
      const k = (ui.shakeUntil - now) / 0.35;
      ox = Math.sin(now * 90) * 4 * k;
      oy = Math.cos(now * 70) * 3 * k;
    }
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(ox, oy);
    this.drawTerrain(g, now);
    if (ui.heat) this.drawHeat(g);
    this.drawPaths(g, ui);
    this.drawBeams(g, ui, now);
    this.drawPieces(g, ui);
    this.drawShells(g, alpha);
    this.drawEnemies(g, alpha, now);
    this.drawProjectiles(g, alpha);
    this.drawFx(ui, now);
    this.drawPreview(g, ui);
    ctx.restore();
    this.drawBossBar(g);
    if (now < ui.vignetteUntil) this.drawVignette((ui.vignetteUntil - now) / 0.5);
    if (ui.flash && now < ui.flash.until) this.drawFlash(ui.flash.text, ui.flash.x, ui.flash.y);
  }

  // ------------------------------------------------------------ terrain

  private drawTerrain(g: Game, now: number): void {
    const ctx = this.ctx;
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const i = g.idx(c, r);
        const x = c * TILE, y = r * TILE;
        if (g.rock[i]) {
          ctx.fillStyle = ROCK;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = ROCK_EDGE;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
        } else if (g.noBuild[i] && !g.isCore[i]) {
          ctx.fillStyle = NOBUILD;
          ctx.fillRect(x, y, TILE, TILE);
        }
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      }
    }
    // Core
    const cc = g.coreCenter;
    const pulse = 0.5 + 0.5 * Math.sin(now * 2.5);
    ctx.fillStyle = '#1f2b3d';
    ctx.fillRect((cc.x - 1) * TILE, (cc.y - 1) * TILE, 2 * TILE, 2 * TILE);
    ctx.strokeStyle = `rgba(120,200,255,${0.5 + 0.4 * pulse})`;
    ctx.lineWidth = 3;
    ctx.strokeRect((cc.x - 1) * TILE + 4, (cc.y - 1) * TILE + 4, 2 * TILE - 8, 2 * TILE - 8);
    ctx.fillStyle = '#7cc8ff';
    this.poly(cc.x * TILE, cc.y * TILE, 6, 18, now * 0.6);
    ctx.fill();
    // Spawns
    this.drawSpawn(g.map.spawnA, 'A', true);
    const bOpen = g.spawnBOpen() || g.spawnBActiveNext();
    this.drawSpawn(g.map.spawnB, bOpen ? 'B' : `B · wave ${g.C.spawning.spawnBOpensAt}`, bOpen);
  }

  private drawSpawn(tiles: [number, number][], label: string, open: boolean): void {
    const ctx = this.ctx;
    for (const [c, r] of tiles) {
      ctx.fillStyle = open ? 'rgba(255,90,90,0.22)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      if (!open) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        for (let k = 8; k < TILE; k += 10) {
          ctx.beginPath(); ctx.moveTo(c * TILE + k, r * TILE + 4); ctx.lineTo(c * TILE + k, r * TILE + TILE - 4); ctx.stroke();
        }
      }
    }
    const x = (tiles[0][0] + tiles[1][0] + 1) / 2 * TILE, y = (tiles[0][1] + tiles[1][1] + 1) / 2 * TILE;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = open ? '#ff9a9a' : 'rgba(255,255,255,0.5)';
    const lx = tiles[0][0] === 0 ? x + 4 : x, ly = tiles[0][1] === 0 ? y + 2 : y;
    ctx.fillText(label, lx, ly);
  }

  private drawHeat(g: Game): void {
    const ctx = this.ctx;
    const spawns = [g.map.spawnA[0]];
    if (g.spawnBActiveNext()) spawns.push(g.map.spawnB[0]);
    const seen = new Set<number>();
    for (const [sc, sr] of spawns) {
      for (const [x, y] of g.pathFrom(sc, sr)) {
        const i = g.idx(Math.floor(x), Math.floor(y));
        if (seen.has(i)) continue;
        seen.add(i);
        let dps = 0;
        for (const l of g.links) {
          const a = g.piece(l.a)!, b = g.piece(l.b)!;
          if (segDist(x, y, a.x, a.y, b.x, b.y) > g.C.links.contact) continue;
          dps += l.beam === 'minefield' ? g.C.beamRules.mineDamage * g.beamMult(l) / g.C.beamRules.mineRearm : g.C.beams[l.beam].dps * g.beamMult(l);
        }
        if (dps <= 0) continue;
        const k = Math.min(1, dps / 250);
        ctx.fillStyle = `rgba(255,${Math.round(200 - 150 * k)},60,${0.15 + 0.45 * k})`;
        ctx.fillRect(Math.floor(x) * TILE, Math.floor(y) * TILE, TILE, TILE);
      }
    }
  }

  private pathLine(pts: [number, number][], color: string, width: number, dash: number[]): void {
    if (pts.length < 2) return;
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * TILE, pts[0][1] * TILE);
    for (const [x, y] of pts) ctx.lineTo(x * TILE, y * TILE);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawPaths(g: Game, ui: UiState): void {
    const placing = !!ui.tool && !!ui.mouse;
    const bActive = g.spawnBActiveNext();
    const alphaA = placing ? 0.18 : 0.3;
    this.pathLine(g.pathFrom(g.map.spawnA[0][0], g.map.spawnA[0][1]), `rgba(255,120,120,${alphaA})`, 3, [2, 6]);
    this.pathLine(g.pathFrom(g.map.spawnB[0][0], g.map.spawnB[0][1]), `rgba(255,120,120,${bActive ? alphaA : 0.1})`, 3, [2, 6]);
    // Flyer flight lines before a wave with Flyers.
    const next = g.C.waves[g.wave];
    if (g.phase === 'build' && next && next.some(([t]) => t === 'flyer')) {
      const spawnsUsed: [number, number][][] = [g.map.spawnA];
      if (g.wave + 1 >= g.C.spawning.spawnBOpensAt) spawnsUsed.push(g.map.spawnB);
      for (const sp of spawnsUsed) {
        const x = (sp[0][0] + sp[1][0]) / 2 + 0.5, y = (sp[0][1] + sp[1][1]) / 2 + 0.5;
        this.pathLine([[x, y], [g.coreCenter.x, g.coreCenter.y]], 'rgba(127,224,196,0.55)', 2, [10, 6]);
      }
    }
  }

  // ------------------------------------------------------------ beams

  private drawBeams(g: Game, ui: UiState, now: number): void {
    const hoverBeam = this.beamAt(g, ui.mouse);
    for (const l of g.links) {
      const a = g.piece(l.a)!, b = g.piece(l.b)!;
      const exposed = this.linkExposure(g, l) > 0;
      let alpha = exposed ? 0.85 : 0.3;
      if (l.load > 0) alpha = 1;
      const hot = hoverBeam === l;
      this.beamLine(l.beam, a.x, a.y, b.x, b.y, alpha, l.charge > 0 ? l.charge / g.C.links.chargeTime : 0, now, hot || l.load > 0, g.beamLevel(l));
    }
  }

  beamLine(beam: BeamType, ax: number, ay: number, bx: number, by: number, alpha: number, charging: number, now: number, glow: boolean, level: number): void {
    const ctx = this.ctx;
    const x0 = ax * TILE, y0 = ay * TILE, x1 = bx * TILE, y1 = by * TILE;
    const len = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) || 1;
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    const w = 2 + level * 0.6;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = BEAM_COLOR[beam];
    ctx.fillStyle = BEAM_COLOR[beam];
    ctx.lineCap = 'round';
    if (glow) { ctx.shadowColor = BEAM_COLOR[beam]; ctx.shadowBlur = 12; }
    if (charging > 0) {
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -now * 30;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.setLineDash([]);
      const k = 1 - charging;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.lineWidth = w;
    switch (beam) {
      case 'arc':
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        break;
      case 'chill':
        ctx.setLineDash([14, 8]);
        ctx.lineDashOffset = -now * 12;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        break;
      case 'minefield': {
        const n = Math.max(2, Math.floor(len / 12));
        for (let k = 0; k <= n; k++) {
          ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, w * 0.9, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'shatter':
        ctx.lineWidth = Math.max(1.5, w * 0.55);
        for (const o of [-3, 3]) {
          ctx.beginPath(); ctx.moveTo(x0 + nx * o, y0 + ny * o); ctx.lineTo(x1 + nx * o, y1 + ny * o); ctx.stroke();
        }
        break;
      case 'overload': {
        const n = Math.max(2, Math.floor(len / 10));
        ctx.lineWidth = Math.max(1.5, w * 0.7);
        ctx.beginPath(); ctx.moveTo(x0, y0);
        for (let k = 1; k < n; k++) {
          const o = (k % 2 ? 5 : -5);
          ctx.lineTo(x0 + (x1 - x0) * k / n + nx * o, y0 + (y1 - y0) * k / n + ny * o);
        }
        ctx.lineTo(x1, y1); ctx.stroke();
        break;
      }
      case 'tar': {
        const n = Math.max(2, Math.floor(len / 12));
        ctx.lineWidth = Math.max(1.5, w * 0.6);
        for (let k = 0; k < n; k++) {
          const cx = x0 + (x1 - x0) * (k + 0.5) / n, cy = y0 + (y1 - y0) * (k + 0.5) / n;
          ctx.beginPath();
          ctx.ellipse(cx, cy, len / n * 0.55, 4, Math.atan2(y1 - y0, x1 - x0), 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
    }
    ctx.restore();
  }

  /** The beam nearest the mouse within a third of a tile, if any. */
  beamAt(g: Game, m: { x: number; y: number } | null): Link | null {
    if (!m) return null;
    let best: Link | null = null, bd = 0.3;
    for (const l of g.links) {
      const a = g.piece(l.a)!, b = g.piece(l.b)!;
      const d = segDist(m.x, m.y, a.x, a.y, b.x, b.y);
      if (d < bd && dist(m.x, m.y, a.x, a.y) > 0.4 && dist(m.x, m.y, b.x, b.y) > 0.4) { bd = d; best = l; }
    }
    return best;
  }

  // ------------------------------------------------------------ pieces

  private drawPieces(g: Game, ui: UiState): void {
    for (const p of g.pieces) this.drawPiece(g, p, 1, p.id === ui.selected);
    const sel = ui.selected ? g.piece(ui.selected) : undefined;
    if (sel && sel.type !== 'wall') this.rangeCircle(sel, g.range(sel), sel.type === 'mortar' ? g.C.nodes.mortar.minRange : 0);
  }

  drawPiece(g: Game, p: Pick<Piece, 'type' | 'tier' | 'x' | 'y'> & { id?: number }, alpha: number, selected: boolean): void {
    const ctx = this.ctx;
    const x = p.x * TILE, y = p.y * TILE;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (p.type === 'wall') {
      ctx.fillStyle = '#5b6170';
      ctx.fillRect(x - 21, y - 21, 42, 42);
      ctx.fillStyle = '#6d7484';
      ctx.fillRect(x - 21, y - 21, 42, 6);
      ctx.strokeStyle = selected ? '#fff' : '#454a56';
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.strokeRect(x - 21, y - 21, 42, 42);
      ctx.restore();
      return;
    }
    const col = NODE_COLOR[p.type];
    ctx.fillStyle = '#232836';
    ctx.fillRect(x - 21, y - 21, 42, 42);
    ctx.strokeStyle = selected ? '#ffffff' : col;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeRect(x - 20, y - 20, 40, 40);
    ctx.fillStyle = col;
    if (p.type === 'bolt') {
      ctx.beginPath(); ctx.moveTo(x, y - 13); ctx.lineTo(x + 11, y + 9); ctx.lineTo(x - 11, y + 9); ctx.closePath(); ctx.fill();
    } else if (p.type === 'frost') {
      ctx.lineWidth = 3; ctx.strokeStyle = col;
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 12, y - Math.sin(a) * 12); ctx.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12); ctx.stroke();
      }
    } else {
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#232836';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
    // Tier pips
    ctx.fillStyle = '#fff';
    for (let k = 0; k <= p.tier; k++) ctx.fillRect(x - 14 + k * 10, y + 14, 7, 3);
    // Free slot dots
    if (p.id !== undefined) {
      const piece = g.piece(p.id);
      if (piece) {
        const free = g.slots(piece) - g.linksOf(piece.id).length;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (let k = 0; k < free; k++) { ctx.beginPath(); ctx.arc(x + 15 - k * 6, y - 15, 2, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.restore();
  }

  rangeCircle(p: { x: number; y: number }, r: number, minR: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.arc(p.x * TILE, p.y * TILE, r * TILE, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (minR > 0) { ctx.beginPath(); ctx.arc(p.x * TILE, p.y * TILE, minR * TILE, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  // ------------------------------------------------------------ enemies

  private drawEnemies(g: Game, alpha: number, now: number): void {
    const ctx = this.ctx;
    const t = g.tick * g.dt;
    for (const e of g.enemies) {
      const x = (e.px + (e.x - e.px) * alpha) * TILE, y = (e.py + (e.y - e.py) * alpha) * TILE;
      const flash = e.hitTick >= g.tick - 1;
      const slowed = t < e.slowU && e.slowV > 0;
      const col = flash ? '#ffffff' : slowed ? mix(ENEMY_COLOR[e.type], '#5fb8ff', 0.55) : ENEMY_COLOR[e.type];
      ctx.save();
      ctx.fillStyle = col;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2;
      const ang = Math.atan2(e.y - e.py, e.x - e.px);
      switch (e.type) {
        case 'grunt': ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
        case 'runner':
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
          ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-9, 9); ctx.lineTo(-4, 0); ctx.lineTo(-9, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
          break;
        case 'brute': ctx.fillRect(x - 13, y - 13, 26, 26); ctx.strokeRect(x - 13, y - 13, 26, 26); break;
        case 'swarm': ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); break;
        case 'flyer':
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath(); ctx.ellipse(x + 6, y + 12, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(x, y - 13); ctx.lineTo(x + 11, y); ctx.lineTo(x, y + 13); ctx.lineTo(x - 11, y); ctx.closePath(); ctx.fill(); ctx.stroke();
          break;
        case 'warden':
          ctx.strokeStyle = 'rgba(143,180,255,0.35)';
          ctx.beginPath(); ctx.arc(x, y, g.C.warden.radius * TILE, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          this.poly(x, y, 6, 13, 0); ctx.fill(); ctx.stroke();
          break;
        case 'colossus':
          this.poly(x, y, 8, 24, Math.PI / 8); ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
          break;
      }
      // Status marks
      if (t < e.brittleU) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x - 6, y - 7); ctx.lineTo(x - 1, y - 1); ctx.lineTo(x - 4, y + 5); ctx.moveTo(x - 1, y - 1); ctx.lineTo(x + 6, y - 3); ctx.stroke();
      }
      if (t < e.chargedU) {
        ctx.fillStyle = '#ffee44';
        const k = (now * 8) % (Math.PI * 2);
        ctx.beginPath(); ctx.arc(x + Math.cos(k) * 12, y + Math.sin(k) * 12, 2.5, 0, Math.PI * 2); ctx.fill();
      }
      if (t < e.shredU && e.armor > 0) {
        ctx.fillStyle = '#ff6a3d';
        ctx.fillRect(x + 9, y - 15, 3, 5); ctx.fillRect(x + 13, y - 13, 3, 5);
      }
      ctx.restore();
      if (e.hp < e.maxHp || e.shield > 0) this.hpBar(e, x, y);
    }
  }

  private hpBar(e: Enemy, x: number, y: number): void {
    const ctx = this.ctx;
    const w = e.boss ? 44 : 24, top = y - (e.boss ? 32 : 19);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - w / 2 - 1, top - 1, w + 2, 5);
    const k = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = k > 0.5 ? '#6fe06f' : k > 0.25 ? '#ffd23f' : '#ff5a4a';
    ctx.fillRect(x - w / 2, top, w * k, 3);
    if (e.shield > 0) {
      const sk = Math.min(1, e.shield / e.maxHp);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - w / 2, top - 1, w * sk, 5);
    }
  }

  private drawProjectiles(g: Game, alpha: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#fff3b0';
    for (const p of g.projectiles) {
      const x = (p.px + (p.x - p.px) * alpha) * TILE, y = (p.py + (p.y - p.py) * alpha) * TILE;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawShells(g: Game, alpha: number): void {
    const ctx = this.ctx;
    for (const s of g.shells) {
      const k = Math.min(1, (g.tick + alpha - s.fireTick) / (s.landTick - s.fireTick));
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeStyle = 'rgba(255,138,61,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x * TILE, s.y * TILE, s.radius * TILE * (0.4 + 0.6 * k), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const x = s.sx + (s.x - s.sx) * k, y = s.sy + (s.y - s.sy) * k - Math.sin(k * Math.PI) * 1.2;
      ctx.fillStyle = '#ffb070';
      ctx.beginPath(); ctx.arc(x * TILE, y * TILE, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ------------------------------------------------------------ effects and overlays

  private drawFx(ui: UiState, now: number): void {
    const ctx = this.ctx;
    for (const f of ui.fx) {
      const k = (now - f.t0) / f.dur;
      if (k < 0 || k > 1) continue;
      ctx.save();
      if (f.k === 'text') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x * TILE, f.y * TILE - 14 - k * 22);
      } else if (f.k === 'ring') {
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x * TILE, f.y * TILE, f.r * TILE * (0.5 + 0.5 * k), 0, Math.PI * 2); ctx.stroke();
      } else if (f.k === 'pop') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        for (let j = 0; j < 6; j++) {
          const a = j * Math.PI / 3;
          ctx.beginPath(); ctx.arc(f.x * TILE + Math.cos(a) * 16 * k, f.y * TILE + Math.sin(a) * 16 * k, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.globalAlpha = 1 - k * 0.7;
        ctx.strokeStyle = '#ff3b3b';
        ctx.lineWidth = 4;
        const x = f.x * TILE, y = f.y * TILE;
        ctx.beginPath(); ctx.moveTo(x - 10, y - 10); ctx.lineTo(x + 10, y + 10); ctx.moveTo(x + 10, y - 10); ctx.lineTo(x - 10, y + 10); ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawPreview(g: Game, ui: UiState): void {
    const ctx = this.ctx;
    const m = ui.mouse;
    if (!m) return;
    // Link drag preview
    if (ui.drag?.kind === 'link' && ui.drag.moved) {
      const a = g.piece(ui.drag.from);
      if (!a) return;
      const target = g.pieceAt(Math.floor(m.x), Math.floor(m.y));
      if (target && target.id !== a.id && target.type !== 'wall' && a.type !== 'wall') {
        const chk = g.checkLink(a.id, target.id);
        const beam = beamFor(a.type as NodeType, target.type as NodeType);
        const level = a.tier + target.tier + 2;
        if (chk.ok) {
          this.beamLine(beam, a.x, a.y, target.x, target.y, 1, 0, 0, true, level);
          const expo = g.exposure(a.x, a.y, target.x, target.y);
          this.label(`${g.C.beams[beam].name} · level ${level} · path under beam: ${expo.toFixed(1)} tiles`, (a.x + target.x) / 2, (a.y + target.y) / 2, BEAM_COLOR[beam]);
        } else {
          this.redLine(a.x, a.y, target.x, target.y);
          this.label(`${g.C.beams[beam].name}: ${chk.reason}`, (a.x + target.x) / 2, (a.y + target.y) / 2, '#ff6b6b');
        }
      } else {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x * TILE, a.y * TILE); ctx.lineTo(m.x * TILE, m.y * TILE); ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.arc(a.x * TILE, a.y * TILE, g.linkRange() * TILE, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      return;
    }
    if (!ui.tool) return;
    const c = Math.floor(m.x), r = Math.floor(m.y);
    if (!g.inside(c, r)) return;
    const existing = g.pieceAt(c, r);
    if (existing && existing.type === 'wall' && ui.tool !== 'wall') {
      const cost = g.convertCost(ui.tool);
      this.drawPiece(g, { type: ui.tool, tier: 0, x: c + 0.5, y: r + 0.5 }, 0.6, false);
      this.rangeCircle({ x: c + 0.5, y: r + 0.5 }, g.C.nodes[ui.tool].range[0], ui.tool === 'mortar' ? g.C.nodes.mortar.minRange : 0);
      this.label(g.gold >= cost ? `Convert: ${cost}g` : `Convert: ${cost}g · Not enough gold`, c + 0.5, r - 0.2, g.gold >= cost ? '#ffffff' : '#ff6b6b');
      return;
    }
    const chk = g.checkBuild(ui.tool, c, r);
    if (!chk.ok) {
      ctx.fillStyle = 'rgba(255,60,60,0.35)';
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      this.label(chk.reason, c + 0.5, r - 0.2, '#ff6b6b');
      return;
    }
    // New path from each spawn and the change in length.
    const parts: string[] = [];
    const spawns: [string, [number, number], boolean][] = [['A', g.map.spawnA[0], true], ['B', g.map.spawnB[0], g.spawnBActiveNext()]];
    for (const [name, [sc, sr], active] of spawns) {
      const pts = g.pathFrom(sc, sr, chk.flow);
      this.pathLine(pts, active ? 'rgba(255,240,160,0.85)' : 'rgba(255,240,160,0.3)', 2.5, [3, 5]);
      const delta = chk.flow[g.idx(sc, sr)] - g.flow[g.idx(sc, sr)];
      if (delta !== 0 && active) parts.push(`${name} ${delta > 0 ? '+' : ''}${delta} tiles`);
    }
    for (const l of chk.cuts) {
      const a = g.piece(l.a)!, b = g.piece(l.b)!;
      this.redLine(a.x, a.y, b.x, b.y);
    }
    if (ui.tool !== 'wall') this.rangeCircle({ x: c + 0.5, y: r + 0.5 }, g.C.nodes[ui.tool].range[0], ui.tool === 'mortar' ? g.C.nodes.mortar.minRange : 0);
    this.drawPiece(g, { type: ui.tool, tier: 0, x: c + 0.5, y: r + 0.5 }, 0.6, false);
    if (chk.cuts.length) parts.push(`cuts ${chk.cuts.length} beam${chk.cuts.length > 1 ? 's' : ''}`);
    if (parts.length) this.label(parts.join(' · '), c + 0.5, r - 0.2, '#fff0a0');
  }

  private redLine(ax: number, ay: number, bx: number, by: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(ax * TILE, ay * TILE); ctx.lineTo(bx * TILE, by * TILE); ctx.stroke();
    ctx.restore();
  }

  label(text: string, x: number, y: number, color: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 14;
    let px = x * TILE, py = y * TILE;
    px = Math.max(w / 2 + 2, Math.min(this.width - w / 2 - 2, px));
    py = Math.max(14, Math.min(this.height - 14, py));
    ctx.fillStyle = 'rgba(10,12,18,0.88)';
    roundRect(ctx, px - w / 2, py - 11, w, 22, 6);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, px, py + 1);
    ctx.restore();
  }

  private drawFlash(text: string, x: number, y: number): void {
    this.label(text, x, y - 0.4, '#ff6b6b');
  }

  private drawBossBar(g: Game): void {
    const boss = g.enemies.find(e => e.boss);
    if (!boss) return;
    const ctx = this.ctx;
    const w = this.width * 0.5, x = (this.width - w) / 2, y = 10;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 2, y - 2, w + 4, 16);
    ctx.fillStyle = '#ff5e7a';
    ctx.fillRect(x, y, w * Math.max(0, boss.hp / boss.maxHp), 12);
    ctx.fillStyle = '#fff';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`COLOSSUS  ${Math.ceil(boss.hp).toLocaleString()} / ${boss.maxHp.toLocaleString()}`, this.width / 2, y + 6.5);
  }

  private drawVignette(k: number): void {
    const ctx = this.ctx;
    const grd = ctx.createRadialGradient(this.width / 2, this.height / 2, this.height * 0.35, this.width / 2, this.height / 2, this.width * 0.65);
    grd.addColorStop(0, 'rgba(255,0,0,0)');
    grd.addColorStop(1, `rgba(255,30,30,${0.45 * k})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private poly(x: number, y: number, n: number, r: number, rot: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const a = rot + k * Math.PI * 2 / n;
      if (k === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mix(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

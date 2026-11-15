// =============================================================
//  NavGrid — mapa de caminhos do bot. Com mapas grandes e salas de
//  spawn, andar "em linha reta até o inimigo" faz o bot travar na parede.
//
//  Ao trocar de mapa: espalha pontos numa grade, descarta os que caem
//  dentro de caixa/parede (raio de cima pra baixo) e liga vizinhos que
//  se enxergam (raio na altura da cintura e do peito). Obstáculos móveis
//  (carros, barra, paredes deslizantes) não contam: eles se mexem.
//  Caminho: A* na grade.
// =============================================================

import * as CANNON from 'cannon-es';
import { GROUP } from '../physics/PhysicsWorld.js';

const STEP = 2.2;  // espaçamento da grade (m)
const CLEAR = 0.45; // folga lateral do boneco

export class NavGrid {
  constructor(game) {
    this.game = game;
    this.mapId = null;
    this.nodes = [];
    this._a = new CANNON.Vec3();
    this._b = new CANNON.Vec3();
  }

  ensure() {
    const a = this.game.arena;
    if (a.mapId !== this.mapId) this.build();
    return this;
  }

  build() {
    const a = this.game.arena;
    this.mapId = a.mapId;
    this.movers = new Set(a.movers.map((m) => m.body));
    // caixas de colisão dos obstáculos fixos (ignora chão, teto e coisas no alto, tipo batente de porta)
    this.solids = a.bodies
      .filter((b) => b !== a.floor && !this.movers.has(b))
      .map((b) => { b.updateAABB(); return b.aabb; })
      .filter((bb) => bb.lowerBound.y < 2.0 && bb.upperBound.y > 0.2 && bb.lowerBound.y > -1);
    this.nodes = [];
    const grid = new Map();
    const nx = Math.floor((a.W - 1.6) / STEP), nz = Math.floor((a.D - 1.6) / STEP);
    const x0 = -((nx - 1) * STEP) / 2, z0 = -((nz - 1) * STEP) / 2;
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        const x = x0 + i * STEP, z = z0 + k * STEP;
        if (this._blocked(x, z)) continue;
        const n = { x, z, i, k, id: this.nodes.length, links: [] };
        this.nodes.push(n);
        grid.set(`${i},${k}`, n);
      }
    }
    for (const n of this.nodes) {
      for (const [di, dk] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const m = grid.get(`${n.i + di},${n.k + dk}`);
        if (m && this.clear(n, m)) {
          const d = Math.hypot(n.x - m.x, n.z - m.z);
          n.links.push([m, d]);
          m.links.push([n, d]);
        }
      }
    }
  }

  /** O boneco (coluna de 0,45 m de raio, até 2 m de altura) cabe nesse ponto? */
  _blocked(x, z) {
    for (const bb of this.solids) {
      if (x + CLEAR > bb.lowerBound.x && x - CLEAR < bb.upperBound.x && z + CLEAR > bb.lowerBound.z && z - CLEAR < bb.upperBound.z) return true;
    }
    return false;
  }

  /** Dá pra ir em linha reta de p até q? (cintura e peito, com folga dos lados) */
  clear(p, q) {
    const dx = q.x - p.x, dz = q.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const sx = (-dz / len) * CLEAR * 0.8, sz = (dx / len) * CLEAR * 0.8;
    for (const [ox, oz, y] of [[0, 0, 0.5], [0, 0, 1.4], [sx, sz, 0.8], [-sx, -sz, 0.8]]) {
      if (this._hitsSolid(this._a.set(p.x + ox, y, p.z + oz), this._b.set(q.x + ox, y, q.z + oz))) return false;
    }
    return true;
  }

  _hitsSolid(from, to) {
    const a = this.game.arena;
    let hit = false;
    this.game.physics.world.raycastAll(from, to, { collisionFilterMask: GROUP.ENV, skipBackfaces: true }, (r) => {
      if (r.body !== a.floor && !this.movers.has(r.body)) { hit = true; r.abort(); }
    });
    return hit;
  }

  /** Ponto da grade mais perto de pos que dá pra alcançar em linha reta. */
  nearest(pos) {
    const sorted = this.nodes
      .map((n) => [n, (n.x - pos.x) ** 2 + (n.z - pos.z) ** 2])
      .sort((u, v) => u[1] - v[1]);
    for (let k = 0; k < Math.min(8, sorted.length); k++) {
      if (this.clear(pos, sorted[k][0])) return sorted[k][0];
    }
    return sorted[0]?.[0] ?? null;
  }

  /** A* de from até to. Devolve lista de pontos {x,z} (sem o ponto de partida). */
  path(from, to) {
    this.ensure();
    const s = this.nearest(from), t = this.nearest(to);
    if (!s || !t) return null;
    const g = new Map([[s, 0]]);
    const prev = new Map();
    const open = new Set([s]);
    const h = (n) => Math.hypot(n.x - t.x, n.z - t.z);
    const f = new Map([[s, h(s)]]);
    let guard = 0;
    while (open.size && guard++ < 4000) {
      let cur = null, best = Infinity;
      for (const n of open) { const v = f.get(n); if (v < best) { best = v; cur = n; } }
      if (cur === t) break;
      open.delete(cur);
      for (const [m, d] of cur.links) {
        const ng = g.get(cur) + d;
        if (ng < (g.get(m) ?? Infinity)) {
          g.set(m, ng);
          f.set(m, ng + h(m));
          prev.set(m, cur);
          open.add(m);
        }
      }
    }
    if (!prev.has(t) && s !== t) return null;
    const out = [];
    for (let n = t; n && n !== s; n = prev.get(n)) out.push(n);
    out.push(s);
    out.reverse();
    out.push({ x: to.x, z: to.z });
    return out;
  }
}

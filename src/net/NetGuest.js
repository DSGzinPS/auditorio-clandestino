// =============================================================
//  Lado do CONVIDADO (quem entrou com o código): não simula nada.
//  • lê o controle local e manda a intenção pro host (60x/s);
//  • a mira é local (sem atraso no mouse/dedo) e vai pronta (setYaw/setPitch);
//  • aplica os snapshots: bonecos, objetos voando, obstáculos, vida, arma;
//  • repete as chamadas de HUD, sons e efeitos que o host mandou.
// =============================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { WEAPONS } from '../data/catalog.js';
import { blankIntent } from '../core/Controls.js';
import { buildDuckMesh, buildRocketMesh } from '../entities/ProjectileSystem.js';
import { decode } from './serialize.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Cópia leve da partida do host, com os mesmos métodos que o HUD usa. */
class MatchMirror {
  constructor(players) {
    this.players = players;
    this.money = players.map(() => 0);
    this.roundsWon = { 0: 0, 1: 0 };
    this.restrictions = players.map(() => null);
    this.kills = players.map(() => 0);
    this.deaths = players.map(() => 0);
    this.quizCorrect = players.map(() => 0);
    this.teams = [0, 1];
  }

  canShop(i) { return this.restrictions[i] === null; }
  teamName(t) { return this.players.filter((p) => p.team === t).map((p) => p.name).join(' + '); }
  winnerTeams() {
    const best = Math.max(...Object.values(this.roundsWon));
    return this.teams.filter((t) => this.roundsWon[t] === best);
  }
}

export class NetGuest {
  constructor(game, session, localIndex = 1) {
    this.game = game;
    this.session = session;
    this.local = localIndex;
    this.snap = null;
    this.queue = [];
    this.dyn = new Map(); // id → mesh
    this.lastEpoch = -1;
    this.pendingHud = blankIntent();
    this.mirror = new MatchMirror(game.players);
    this.recoilDebt = 0;
    this.sinceShot = 1;
    session.onMessage = (m) => this._onMessage(m);
    this._bindHud();
  }

  /** Cliques no HUD (quiz, loja, revanche…) viram intenção enviada ao host. */
  _bindHud() {
    const h = this.game.hud;
    const q = this.pendingHud;
    h.onAnswer = (pi, oi) => { if (pi === this.local) q.answer = oi; };
    h.onRps = (pi, oi) => { if (pi === this.local) q.answer = oi; };
    h.onBuy = (pi, id) => { if (pi === this.local) q.buyId = id; };
    h.onTab = (pi, tab) => { if (pi === this.local) q.setTab = tab; };
    h.onReady = (pi) => { if (pi === this.local) q.ready = true; };
    h.onVote = (pi, v) => { if (pi === this.local) q[v] = true; };
  }

  _onMessage(m) {
    this.session.touch();
    if (m.t === 'f') this.queue.push(m);
    else if (m.t === 'bye') this.session._lost('O host fechou a sala');
    else if (m.t === 'full') this.session._lost('A sala já está cheia');
  }

  // ---------------------------------------------------------------- por frame
  update(dt) {
    const g = this.game;
    // 1) aplica tudo que chegou (em ordem)
    const msgs = this.queue.splice(0);
    for (const m of msgs) {
      if (m.s?.mt) Object.assign(this.mirror, m.s.mt); // placar antes das telas que mostram ele
      for (const [name, args] of m.c ?? []) this._hud(name, args);
      for (const e of m.e ?? []) this._event(e);
      if (m.s) this.snap = m.s;
    }
    if (this.snap) this._apply(this.snap);

    // 2) controle local → mira local + intenção pro host
    const me = g.players[this.local];
    const it = g.paused ? blankIntent() : g.schemes[this.local].read(dt);
    const s = this.snap?.p[this.local];
    if (s && s.lk && !g.paused) {
      me.yaw -= it.lookX;
      me.pitch = clamp(me.pitch - it.lookY, -1.45, 1.45);
      // o recuo volta sozinho, igual no host
      this.sinceShot += dt;
      if (this.recoilDebt > 0 && this.sinceShot > 0.12) {
        const back = Math.min(this.recoilDebt, 0.45 * dt);
        me.pitch -= back;
        this.recoilDebt -= back;
      }
    }
    const q = this.pendingHud;
    const out = {
      ...it,
      lookX: 0, lookY: 0,
      setYaw: Math.round(me.yaw * 1e4) / 1e4,
      setPitch: Math.round(me.pitch * 1e4) / 1e4,
      answer: q.answer ?? it.answer,
      buyId: q.buyId ?? it.buyId,
      setTab: q.setTab ?? null,
      ready: q.ready || it.ready,
      rematch: q.rematch || it.rematch || (g.sm.currentName === 'MATCH_END_STATE' && it.ready),
      leave: q.leave || it.leave,
    };
    Object.assign(this.pendingHud, blankIntent(), { setTab: undefined });
    this.session.send({ t: 'i', i: out });

    g.hud.setLockHint(g._fighting() && !g.input.locked && !g.paused);
    g.effects.update(dt);
  }

  _hud(name, args) {
    const g = this.game;
    const fn = g.hud[name];
    if (typeof fn !== 'function') return;
    try {
      fn.apply(g.hud, args.map((a) => decode(a, g)));
    } catch (e) {
      console.warn('HUD remoto:', name, e);
    }
  }

  _event(e) {
    const g = this.game;
    if (e[0] === 's') {
      const [, name, at, o] = e;
      const opts = decode(o ?? {}, g);
      const pos = at ? { x: at[0], y: at[1], z: at[2] } : null;
      g.sfx(name, pos, opts);
      // animação da arma na mão do convidado (recuo/soco do viewmodel)
      if (opts.who !== undefined) {
        const w = g.players[opts.who]?.weapon;
        if (name === 'shot') w?.onFire?.(WEAPONS[opts.wid] ?? w.def);
        if (name === 'swing') w?.onMelee?.();
      }
    } else if (e[0] === 'e') {
      g.effects.replay(e[1], e[2]);
    } else if (e[0] === 'r') { // recuo na MINHA mira
      const me = g.players[this.local];
      me.pitch = Math.min(1.45, me.pitch + e[1]);
      me.yaw += e[2];
      this.recoilDebt += e[1] * 0.55;
      this.sinceShot = 0;
    }
  }

  // ---------------------------------------------------------------- snapshot
  _apply(s) {
    const g = this.game;
    g.sm.currentName = s.st;
    g.meleeOnly = !!s.mel;
    if (s.map && g.arena.mapId !== s.map) g.arena.setMap(s.map);
    if (s.mt) Object.assign(this.mirror, s.mt);
    g.flow.match = this.mirror;
    const labels = s.p.map((p) => p.lbl);
    g.weaponLabel = labels.some((l) => l !== null) ? (p) => labels[p.index] ?? p.weapon.def.name : null;

    s.p.forEach((d, i) => this._applyPlayer(g.players[i], d, i === this.local));
    s.mv?.forEach((t, k) => {
      const b = g.arena.movers[k]?.body;
      if (b) { b.position.set(t[0], t[1], t[2]); b.quaternion.set(t[3], t[4], t[5], t[6]); }
    });
    this._applyDynamic(s.dyn ?? []);
    g.physics.sync();
  }

  _applyPlayer(p, d, isMe) {
    p.mode = d.m ? 'ragdoll' : 'controlled';
    p.hp = d.hp;
    p.armor = d.ar;
    p.dead = !!d.d;
    p.frozen = !!d.f;
    p.crouchT = d.c;
    p.grounded = !!d.gr;
    p.controller.position.set(d.cp[0], d.cp[1], d.cp[2]);
    p.controller.velocity.set(d.cv[0], d.cv[1], d.cv[2]);
    const parts = Object.values(p.parts);
    d.parts.forEach((t, k) => {
      const b = parts[k]?.body;
      if (b) { b.position.set(t[0], t[1], t[2]); b.quaternion.set(t[3], t[4], t[5], t[6]); }
    });
    // mira: a minha é local, a não ser que o host tenha me teleportado / travado a câmera
    if (!isMe || !d.lk || d.ae !== this.lastEpoch) {
      p.yaw = d.y;
      p.pitch = d.pi;
      if (isMe) { this.lastEpoch = d.ae; this.recoilDebt = 0; }
    }
    // arma
    const [id, ammo, reserve, reloading, ads, spin, spread] = d.w;
    const w = p.weapon;
    if (w.def.id !== id) { w.def = WEAPONS[id] ?? WEAPONS.none; }
    w.ammo = ammo;
    w.reserve = reserve < 0 ? Infinity : reserve;
    w.reloading = reloading;
    w.ads = !!ads;
    w.spin = spin;
    w._netSpread = spread;
    w.currentSpread = () => w._netSpread;
    if (p.lookId !== d.look) p.setWeaponLook(WEAPONS[d.look] ?? WEAPONS.none);
    // viewmodel especial (bola do basquete, só soco no desempate)
    const v = this.game.views.find((x) => x.character === p);
    if (v) {
      v.forceFists = d.vm === 'fists';
      v.viewOverride = d.vm === 'ball' || d.vm === 'none' ? () => d.vm : null;
    }
  }

  _applyDynamic(list) {
    const g = this.game;
    const seen = new Set();
    for (const [id, kind, x, y, z, qx, qy, qz, qw, radius, color] of list) {
      seen.add(id);
      let mesh = this.dyn.get(id);
      if (!mesh) {
        mesh = this._buildDyn(kind, radius, color);
        g.scene.add(mesh);
        this.dyn.set(id, mesh);
      }
      mesh.position.set(x, y, z);
      mesh.quaternion.set(qx, qy, qz, qw);
    }
    for (const [id, mesh] of this.dyn) {
      if (!seen.has(id)) { g.scene.remove(mesh); this.dyn.delete(id); }
    }
  }

  _buildDyn(kind, radius, color) {
    if (kind === 'duck') return buildDuckMesh(radius || 0.22);
    if (kind === 'rocket') return buildRocketMesh();
    const r = kind === 'bball' ? CONFIG.basketball.ballRadius : kind === 'grenade' ? 0.14 : radius || 0.1;
    const c = kind === 'bball' ? 0xff7a1a : kind === 'grenade' ? 0x3a7d2c : color || 0xb08850;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
    m.castShadow = true;
    return m;
  }

  dispose() {
    for (const mesh of this.dyn.values()) this.game.scene.remove(mesh);
    this.dyn.clear();
  }
}

// =============================================================
//  Lado do HOST (quem criou a sala): roda a simulação de verdade.
//  • o jogador remoto vira um "esquema de controle" (RemoteScheme) que
//    devolve a intenção recebida pela rede — igual ao teclado ou ao bot;
//  • a cada frame manda um snapshot (posições, vida, arma, partida…);
//  • toda chamada ao HUD, som e efeito visual é copiada e enviada,
//    assim o outro aparelho mostra exatamente as mesmas telas.
// =============================================================

import { blankIntent } from '../core/Controls.js';
import { encode, pack3, pack7 } from './serialize.js';

/** Métodos do HUD que NÃO vão pela rede (cada aparelho cuida do seu). */
const LOCAL_ONLY = new Set(['update', 'editables', 'setLockHint']);
/** Chamados todo frame: só a última chamada do frame é enviada. */
const COALESCE = new Set(['setPhase', 'setQuizTimer', 'updateShop', 'setCrosshairs']);

const BOOL_KEYS = ['fire', 'melee', 'ads', 'reload', 'rematch', 'leave', 'jump', 'sprint', 'crouch', 'ready'];

/** Intenção do jogador remoto. Toques rápidos entre dois frames não se perdem. */
export class RemoteScheme {
  constructor() {
    this.latest = blankIntent();
    this.pending = blankIntent();
  }

  push(it) {
    this.latest = it;
    const p = this.pending;
    for (const k of BOOL_KEYS) p[k] = p[k] || !!it[k];
    if (it.answer !== null && it.answer !== undefined && p.answer === null) p.answer = it.answer;
    if (it.buy !== null && it.buy !== undefined && p.buy === null) p.buy = it.buy;
    if (it.buyId && !p.buyId) p.buyId = it.buyId;
    if (it.setTab !== undefined && it.setTab !== null) p.setTab = it.setTab;
    p.tab += it.tab || 0;
  }

  read() {
    const l = this.latest, p = this.pending;
    const it = { ...blankIntent(), moveX: l.moveX || 0, moveZ: l.moveZ || 0 };
    for (const k of BOOL_KEYS) it[k] = !!l[k] || p[k];
    // ações de "apertar" só valem uma vez
    for (const k of ['reload', 'rematch', 'leave', 'jump', 'ready']) it[k] = p[k];
    it.answer = p.answer;
    it.buy = p.buy;
    it.buyId = p.buyId;
    it.tab = p.tab;
    it.setTab = p.setTab ?? null;
    if (typeof l.setYaw === 'number') { it.setYaw = l.setYaw; it.setPitch = l.setPitch; }
    this.pending = blankIntent();
    return it;
  }
}

export class NetHost {
  constructor(game, session, remoteIndex = 1) {
    this.game = game;
    this.session = session;
    this.remote = remoteIndex;
    this.scheme = new RemoteScheme();
    this.calls = [];
    this.events = [];
    this.frame = 0;
    this.ids = new WeakMap();
    this.nextId = 1;
    this._wrapHud();
    this._hooks();
    session.onMessage = (m) => this._onMessage(m);
  }

  // ---------------------------------------------------------------- ganchos
  _wrapHud() {
    const g = this.game;
    const real = g.hud;
    this.realHud = real;
    const calls = this.calls;
    g.hud = new Proxy(real, {
      get: (t, k) => {
        const v = t[k];
        if (typeof v !== 'function' || LOCAL_ONLY.has(k) || typeof k !== 'string' || k.startsWith('_')) return typeof v === 'function' ? v.bind(t) : v;
        return (...args) => {
          const enc = args.map((a) => encode(a, g));
          if (COALESCE.has(k)) {
            const i = calls.findIndex((c) => c[0] === k);
            if (i >= 0) calls.splice(i, 1);
          }
          calls.push([k, enc]);
          return v.apply(t, args);
        };
      },
      set: (t, k, v) => { t[k] = v; return true; },
    });
  }

  _hooks() {
    const g = this.game;
    const sfx = g.sfx;
    this._origSfx = sfx;
    g.sfx = (name, at = null, o = {}) => {
      this.events.push(['s', name, at ? pack3(at) : null, encode(o, g)]);
      sfx(name, at, o);
    };
    g.effects.onEmit = (kind, d) => this.events.push(['e', kind, d]);
    for (const p of g.players) {
      p.onRecoil = (dp, dy) => { if (p.index === this.remote) this.events.push(['r', dp, dy]); };
    }
  }

  unhook() {
    const g = this.game;
    g.hud = this.realHud;
    g.sfx = this._origSfx;
    g.effects.onEmit = null;
    g.players.forEach((p) => { p.onRecoil = null; });
  }

  _onMessage(m) {
    this.session.touch();
    if (m.t === 'i') this.scheme.push(m.i);
    else if (m.t === 'bye') this.session._lost('O outro jogador saiu da sala');
    else if (m.t === 'hello') this.session.send({ t: 'welcome', you: this.remote });
  }

  // ---------------------------------------------------------------- snapshot
  _id(obj) {
    let id = this.ids.get(obj);
    if (!id) { id = this.nextId++; this.ids.set(obj, id); }
    return id;
  }

  _dynamic() {
    const g = this.game;
    const out = [];
    for (const p of g.projectiles.items) {
      const kind = p.def.id === 'duck' ? 'duck' : p.rocket ? 'rocket' : 'stone';
      out.push([this._id(p), kind, ...pack7(p.body.position, p.body.quaternion), p.def.radius ?? 0.1, p.def.color ?? 0]);
    }
    for (const b of g.basketball?.balls ?? []) if (!b.done) out.push([this._id(b), 'bball', ...pack7(b.body.position, b.body.quaternion), 0, 0]);
    for (const n of g.grenades.items) out.push([this._id(n), 'grenade', ...pack7(n.body.position, n.body.quaternion), 0, 0]);
    return out;
  }

  _player(p) {
    const g = this.game;
    const w = p.weapon;
    const parts = Object.values(p.parts).map((part) => pack7(part.body.position, part.body.quaternion));
    const vm = g.meleeOnly ? 'fists'
      : g.basketball ? (g.basketball.ready(p) && p.mode === 'controlled' ? 'ball' : 'none') : null;
    return {
      m: p.mode === 'ragdoll' ? 1 : 0,
      hp: Math.round(p.hp * 10) / 10,
      ar: Math.round(p.armor * 10) / 10,
      d: p.dead ? 1 : 0,
      f: p.frozen ? 1 : 0,
      lk: p.mode === 'controlled' && !p.dead && (!p.frozen || p.canLook) ? 1 : 0,
      y: Math.round(p.yaw * 1e4) / 1e4,
      pi: Math.round(p.pitch * 1e4) / 1e4,
      ae: p.aimEpoch ?? 0,
      c: Math.round(p.crouchT * 100) / 100,
      gr: p.grounded ? 1 : 0,
      cp: pack3(p.controller.position),
      cv: pack3(p.controller.velocity),
      parts,
      w: [w.def.id, w.ammo, w.reserve === Infinity ? -1 : w.reserve, Math.round(w.reloading * 100) / 100, w.ads ? 1 : 0,
        Math.round(w.spin * 100) / 100, Math.round(w.currentSpread() * 1e4) / 1e4],
      look: p.lookId ?? w.def.id,
      lbl: g.weaponLabel ? g.weaponLabel(p) : null,
      vm,
    };
  }

  _match() {
    const m = this.game.flow.match;
    if (!m) return null;
    return { money: m.money, roundsWon: m.roundsWon, restrictions: m.restrictions, kills: m.kills, deaths: m.deaths, quizCorrect: m.quizCorrect, teams: m.teams };
  }

  /** Chamar depois de cada passo de simulação. */
  flush() {
    const g = this.game;
    this.frame++;
    if (!this.session.connected) return;
    const snap = this.session.congested ? null : {
      st: g.sm.currentName,
      map: g.arena.mapId,
      mel: g.meleeOnly ? 1 : 0,
      p: g.players.map((p) => this._player(p)),
      dyn: this._dynamic(),
      mv: g.arena.movers.map((mv) => pack7(mv.body.position, mv.body.quaternion)),
      mt: this.frame % 6 === 0 || this.calls.length ? this._match() : undefined,
      menu: g.inMenu ? 1 : 0,
    };
    if (!snap && !this.calls.length && !this.events.length) return;
    this.session.send({ t: 'f', n: this.frame, s: snap, c: this.calls.splice(0), e: this.events.splice(0) });
  }
}

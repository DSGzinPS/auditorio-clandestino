// =============================================================
//  BotController — "jogador de outro PC" offline.
//  Tem a MESMA interface dos esquemas de teclado/gamepad: read(dt)
//  devolve uma intenção (andar, mirar, atirar, socar, responder,
//  comprar). O boneco do bot passa pelo mesmo código que o seu.
// =============================================================

import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { GameStates } from '../core/StateMachine.js';
import { blankIntent } from '../core/Controls.js';
import { GROUP } from '../physics/PhysicsWorld.js';
import { MELEE, SHOP_ORDER, shopItem } from '../data/catalog.js';

export const BOT_PRESETS = {
  facil:   { quizAccuracy: 0.5, turnSpeed: 2.0, aimError: 0.12, reactionTime: 0.7, fireConeDeg: 4, leadSkill: 0.3 },
  normal:  { quizAccuracy: 0.7, turnSpeed: 3.5, aimError: 0.05, reactionTime: 0.35, fireConeDeg: 5, leadSkill: 0.8 },
  dificil: { quizAccuracy: 0.9, turnSpeed: 6.0, aimError: 0.02, reactionTime: 0.15, fireConeDeg: 6, leadSkill: 1.0 },
};

export function applyBotPreset(name = CONFIG.bot.difficulty) {
  if (BOT_PRESETS[name]) Object.assign(CONFIG.bot, BOT_PRESETS[name]);
}

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const DEG = Math.PI / 180;

export class BotController {
  /**
   * @param game   instância do Game (estado atual, mundo físico, partida)
   * @param self   Character controlado pelo bot
   */
  constructor(game, self) {
    this.game = game;
    this.self = self;
    this.isBot = true;

    this.quiz = null;
    this.shopping = null;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 0;
    this.stuckTimer = 0;
    this.seeTimer = 0;
    this.aimOffset = { yaw: 0, pitch: 0 };
    this.aimOffsetTimer = 0;

    this._eye = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this._goal = new THREE.Vector3();
    this._from = new CANNON.Vec3();
    this._to = new CANNON.Vec3();
    this._ray = new CANNON.RaycastResult();
  }

  // ---------------------------------------------------------------- ganchos dos estados
  onQuizStart(question) {
    const b = CONFIG.bot;
    const hit = Math.random() < b.quizAccuracy;
    this.quiz = {
      elapsed: 0,
      answerAt: rand(b.quizDelayMin, Math.min(b.quizDelayMax, CONFIG.quiz.timeLimit - 0.3)),
      choice: hit ? question.correctIndex : 1 - question.correctIndex,
      sent: false,
    };
  }

  onRpsStart() {
    this.rps = { at: rand(0.8, 3.5), t: 0, pick: Math.floor(Math.random() * 3), sent: false };
  }

  /** Planeja as compras: melhor arma que cabe no bolso, depois o melhor colete com o troco. */
  onBuyPhase() {
    const m = this.game.flow.match;
    const i = this.self.index;
    const plan = [];
    if (m.canShop(i)) {
      let money = m.money[i];
      const weapons = SHOP_ORDER.map(shopItem).filter((it) => it.kind === 'weapon').sort((a, b) => b.price - a.price);
      const current = this.self.weapon.def.price ?? 0;
      const w = weapons.find((it) => it.price <= money && it.price > current);
      if (w) { plan.push(w.id); money -= w.price; }
      const armors = SHOP_ORDER.map(shopItem).filter((it) => it.kind === 'armor').sort((a, b) => b.price - a.price);
      const a = armors.find((it) => it.price <= money && it.points > this.self.armor);
      if (a) plan.push(a.id);
    }
    this.shopping = { plan, delay: rand(1, 4) }; // "olha a loja" um pouco antes de comprar
  }

  read(dt) {
    const it = blankIntent();
    const sm = this.game.sm;
    if (sm.is(GameStates.QUIZ)) this._quiz(dt, it);
    else if (sm.is(GameStates.BUY)) this._buy(dt, it);
    else if (sm.is(GameStates.RPS)) this._rps(dt, it);
    else if (sm.is(GameStates.BASKETBALL)) this._basketball(dt, it);
    else if (sm.is(GameStates.ROUND) || sm.is(GameStates.TIEBREAK)) this._combat(dt, it);
    return it;
  }

  // ---------------------------------------------------------------- quiz / loja
  _quiz(dt, it) {
    const q = this.quiz;
    if (!q || q.sent) return;
    q.elapsed += dt;
    if (q.elapsed >= q.answerAt) {
      it.answer = q.choice;
      q.sent = true;
    }
  }

  _buy(dt, it) {
    const s = this.shopping;
    if (!s) return;
    s.delay -= dt;
    if (s.delay > 0) return;
    if (s.plan.length) {
      it.buy = SHOP_ORDER.indexOf(s.plan.shift());
      s.delay = rand(0.3, 0.8);
    } else {
      it.ready = true;
    }
  }

  _rps(dt, it) {
    const r = this.rps;
    if (!r || r.sent) return;
    r.t += dt;
    if (r.t >= r.at) { it.answer = r.pick; r.sent = true; }
  }

  // ---------------------------------------------------------------- basquete
  /** Gira a mira rumo a (yaw, pitch) com velocidade limitada. */
  _turnTo(dt, it, yaw, pitch) {
    const me = this.self;
    const dYaw = wrapAngle(yaw - me.yaw);
    const dPitch = pitch - me.pitch;
    const maxTurn = CONFIG.bot.turnSpeed * dt;
    it.lookX = -clamp(dYaw, -maxTurn, maxTurn);
    it.lookY = -clamp(dPitch, -maxTurn, maxTurn);
    return { dYaw, dPitch };
  }

  _basketball(dt, it) {
    const g = this.game, me = this.self, ball = g.basketball, b = CONFIG.bot;
    if (!ball || me.mode !== 'controlled' || me.frozen) return;
    const eye = me.getEyePosition(this._eye);
    const err = b.aimError * 0.35;
    this.aimOffsetTimer -= dt;
    if (this.aimOffsetTimer <= 0) {
      this.aimOffset.yaw = rand(-1, 1) * err;
      this.aimOffset.pitch = rand(-1, 1) * err;
      this.aimOffsetTimer = rand(0.5, 1);
    }

    // COM A BOLA: chega a uma distância boa da cesta e arremessa em parábola alta
    if (ball.holder === me) {
      const hoop = (g.arena.extras.hoops ?? []).find((h) => h.forTeam === me.team);
      if (!hoop) return;
      const c = hoop.center;
      const dx = c.x - eye.x, dz = c.z - eye.z, d = Math.hypot(dx, dz);
      const h = c.y + 0.3 - eye.y;
      const v = CONFIG.basketball.throwSpeed, gg = -CONFIG.physics.gravity;
      const disc = v ** 4 - gg * (gg * d * d + 2 * h * v * v);
      let mz = 0;
      if (d > 7.5 || disc < 0) mz = 1;
      else if (d < 3.5) mz = -1;
      const pitch = disc >= 0 ? Math.atan((v * v + Math.sqrt(disc)) / (gg * d)) : 0.6;
      const { dYaw, dPitch } = this._turnTo(dt, it, Math.atan2(-dx, -dz) + this.aimOffset.yaw, pitch + this.aimOffset.pitch);
      it.moveZ = mz;
      const steady = Math.hypot(me.controller.velocity.x, me.controller.velocity.z) < 1.5;
      if (mz === 0 && steady && disc >= 0 && Math.abs(dYaw) < 0.025 && Math.abs(dPitch) < 0.025) it.fire = true;
      return;
    }

    const bp = ball.body.position;
    // BOLA SOLTA: corre atrás dela
    if (!ball.holder) {
      const dx = bp.x - eye.x, dz = bp.z - eye.z;
      this._turnTo(dt, it, Math.atan2(-dx, -dz), Math.atan2(bp.y - eye.y, Math.hypot(dx, dz)) * 0.5);
      it.moveZ = 1;
      return;
    }

    // ADVERSÁRIO COM A BOLA: persegue, soca de perto, granada de longe
    const foe = ball.holder;
    if (foe.team === me.team) return;
    const fp = foe.controller.position;
    const dx = fp.x - eye.x, dz = fp.z - eye.z, flat = Math.hypot(dx, dz);
    const lob = flat > 4 ? 0.18 + flat * 0.01 : Math.atan2(fp.y - eye.y, flat);
    const { dYaw, dPitch } = this._turnTo(dt, it, Math.atan2(-dx, -dz) + this.aimOffset.yaw, lob);
    it.moveZ = flat > 1.1 ? 1 : 0;
    it.moveX = this.strafeDir * 0.3;
    if (flat < MELEE.range && Math.abs(dYaw) < 0.5) it.melee = true;
    else if (flat > 4.5 && flat < 13 && g.grenades.ready(me) && Math.abs(dYaw) < 0.06 && Math.abs(dPitch) < 0.08) it.fire = true;
  }

  // ---------------------------------------------------------------- combate
  _nearestEnemy() {
    const me = this.self;
    let best = null, bestD = Infinity;
    for (const p of this.game.players) {
      if (p === me || p.team === me.team || p.dead) continue;
      if (this.game.sm.is(GameStates.TIEBREAK) && p.frozen) continue;
      const a = me.controller.position, b = p.centerPosition(this._aim);
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  _combat(dt, it) {
    const me = this.self, b = CONFIG.bot;
    if (me.mode !== 'controlled' || me.dead || me.frozen) { this.seeTimer = 0; return; }
    const foe = this._nearestEnemy();
    if (!foe) return;

    const g = this.game;
    const def = g.meleeOnly ? { type: 'none' } : me.weapon.def;
    const unarmed = def.type === 'none';
    const eye = me.getEyePosition(this._eye);
    const aim = this._targetPoint(foe, this._aim);

    // Sem arma e o patinho está no chão? vai buscar (se não tiver ninguém em cima)
    const duck = me.weapon.thrownDuck;
    const duckOnFloor = unarmed && !g.meleeOnly && duck && g.projectiles.isAlive(duck);

    const dx = aim.x - eye.x, dy = aim.y - eye.y, dz = aim.z - eye.z;
    const flat = Math.hypot(dx, dz);
    const dist = Math.hypot(flat, dy);

    // Compensação: queda do projétil + movimento do alvo
    const speed = def.speed ?? 30;
    const t = dist / speed;
    const drop = unarmed ? 0 : 0.5 * -CONFIG.physics.gravity * t * t * b.leadSkill;
    const fv = foe.velocity;
    const lx = dx + fv.x * t * b.leadSkill;
    const lz = dz + fv.z * t * b.leadSkill;

    this.aimOffsetTimer -= dt;
    if (this.aimOffsetTimer <= 0) {
      this.aimOffset.yaw = rand(-1, 1) * b.aimError;
      this.aimOffset.pitch = rand(-1, 1) * b.aimError * 0.6;
      this.aimOffsetTimer = rand(0.4, 0.9);
    }

    // Para onde olhar: o inimigo, ou o patinho se for buscá-lo
    let lookX = lx, lookY = dy + drop, lookZ = lz;
    if (duckOnFloor && flat > 4) {
      const d = duck.body.position;
      lookX = d.x - eye.x; lookY = d.y - eye.y; lookZ = d.z - eye.z;
    }
    const desiredYaw = Math.atan2(-lookX, -lookZ) + this.aimOffset.yaw;
    const desiredPitch = Math.atan2(lookY, Math.hypot(lookX, lookZ)) + this.aimOffset.pitch;
    const dYaw = wrapAngle(desiredYaw - me.yaw);
    const dPitch = desiredPitch - me.pitch;
    const maxTurn = b.turnSpeed * dt;
    it.lookX = -clamp(dYaw, -maxTurn, maxTurn); // Character faz yaw -= lookX
    it.lookY = -clamp(dPitch, -maxTurn, maxTurn);

    const sees = this._lineOfSight(eye, aim);
    this.seeTimer = sees ? this.seeTimer + dt : 0;
    const cone = b.fireConeDeg * DEG;
    const onTarget = Math.abs(dYaw) < cone && Math.abs(dPitch) < cone * 1.5;
    const allowed = foe.mode === 'controlled' || b.shootRagdolls;
    const reacted = this.seeTimer > b.reactionTime;

    // Ataque
    const [rMin, rMax] = unarmed ? [0, 1.2] : def.botRange ?? [b.rangeMin, b.rangeMax];
    if (!unarmed) it.fire = sees && allowed && onTarget && reacted && dist < Math.max(rMax * 1.6, b.maxFireRange * 0.5);
    if (flat < MELEE.range && Math.abs(dYaw) < 0.6 && reacted) it.melee = true; // colou, soca

    // Movimento
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      if (Math.random() < 0.7) this.strafeDir *= -1;
      this.strafeTimer = rand(b.strafeMin, b.strafeMax);
    }
    let mz = 0, mx = 0;
    if (duckOnFloor && flat > 4) {
      mz = 1; // corre até o patinho (ele está olhando pra ele)
    } else if (unarmed) {
      mz = flat > 1.1 ? 1 : 0; // vai pra cima pra socar
      mx = this.strafeDir * 0.35;
    } else {
      if (!sees || flat > rMax) mz = 1;
      else if (flat < rMin) mz = -1;
      mx = sees ? this.strafeDir : this.strafeDir * 0.5;
    }

    const v = me.controller.velocity;
    if (Math.hypot(v.x, v.z) < 1 && (mz !== 0 || mx !== 0)) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.4) {
        this.strafeDir *= -1;
        this.strafeTimer = rand(b.strafeMin, b.strafeMax);
        this.stuckTimer = 0;
        mx = this.strafeDir;
      }
    } else {
      this.stuckTimer = 0;
    }
    it.moveX = mx;
    it.moveZ = mz;
  }

  _targetPoint(foe, out) {
    if (foe.mode === 'controlled') {
      const c = foe.controller.position;
      return out.set(c.x, c.y + 0.3, c.z); // peito
    }
    const t = foe.parts.torso.body.position;
    return out.set(t.x, t.y, t.z);
  }

  _lineOfSight(from, to) {
    this._from.set(from.x, from.y, from.z);
    this._to.set(to.x, to.y, to.z);
    this._ray.reset();
    const blocked = this.game.physics.world.raycastClosest(this._from, this._to, {
      collisionFilterMask: GROUP.ENV,
      skipBackfaces: true,
    }, this._ray);
    return !blocked;
  }
}

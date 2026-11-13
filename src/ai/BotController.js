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
    this.voteAt = null;
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

  /** Planeja as compras: melhor arma que cabe no bolso (guardando pro colete), depois o colete. */
  onBuyPhase() {
    const m = this.game.flow.match;
    const i = this.self.index;
    const plan = [];
    if (m.canShop(i)) {
      let money = m.money[i];
      const weapons = SHOP_ORDER.map(shopItem).filter((it) => it.kind === 'weapon').sort((a, b) => b.price - a.price);
      const current = this.self.weapon.def.price ?? 0;
      const keep = this.self.armor < 25 && money >= 1000 ? 400 : 0; // CS: arma + colete
      const w = weapons.find((it) => it.price <= money - keep && it.price > current)
        ?? weapons.find((it) => it.price <= money && it.price > current);
      if (w) { plan.push(w.id); money -= w.price; }
      const armors = SHOP_ORDER.map(shopItem).filter((it) => it.kind === 'armor').sort((a, b) => b.price - a.price);
      const a = armors.find((it) => it.price <= money && it.points > this.self.armor);
      if (a) plan.push(a.id);
    }
    this.shopping = { plan, delay: rand(1, 4) }; // "olha a loja" um pouco antes de comprar
  }

  /** Fim de partida: o bot sempre topa a revanche (depois de "pensar" um pouco). */
  onMatchEnd() {
    this.voteAt = rand(1.2, 2.8);
  }

  read(dt) {
    const it = blankIntent();
    const sm = this.game.sm;
    if (sm.is(GameStates.MATCH_END)) {
      if (this.voteAt !== null && (this.voteAt -= dt) <= 0) { it.rematch = true; this.voteAt = null; }
      return it;
    }
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
      it.buyId = s.plan.shift();
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

  /** Ângulo de lançamento p/ acertar um ponto a d (horizontal) e h (altura). high = parábola alta. */
  _launchAngle(d, h, v, high) {
    const g = -CONFIG.physics.gravity;
    const disc = v ** 4 - g * (g * d * d + 2 * h * v * v);
    if (disc < 0 || d < 1e-3) return null;
    return Math.atan((v * v + (high ? 1 : -1) * Math.sqrt(disc)) / (g * d));
  }

  _basketball(dt, it) {
    const g = this.game, me = this.self, balls = g.basketball, b = CONFIG.bot;
    if (!balls || me.mode !== 'controlled' || me.frozen) return;
    const eye = me.getEyePosition(this._eye);
    const v = CONFIG.basketball.throwSpeed;
    const err = b.aimError * 0.35;
    this.aimOffsetTimer -= dt;
    if (this.aimOffsetTimer <= 0) {
      this.aimOffset.yaw = rand(-1, 1) * err;
      this.aimOffset.pitch = rand(-1, 1) * err;
      this.aimOffsetTimer = rand(0.5, 1);
    }

    const foe = this._nearestEnemy();
    const fp = foe?.mode === 'controlled' ? foe.controller.position : foe?.parts.torso.body.position;
    const foeDist = fp ? Math.hypot(fp.x - eye.x, fp.z - eye.z) : Infinity;

    // de tempos em tempos decide: cesta ou bomba no adversário
    this.bbTimer = (this.bbTimer ?? 0) - dt;
    if (this.bbTimer <= 0) {
      this.bbTarget = foe && foe.mode === 'controlled' && foeDist < 9 && Math.random() < 0.4 ? 'foe' : 'hoop';
      this.bbTimer = rand(1, 2.2);
    }

    if (foe && foeDist < MELEE.range && Math.random() < 0.5) it.melee = true; // colou: empurra

    if (this.bbTarget === 'foe' && fp) {
      // bomba no pé do adversário (parábola baixa)
      const dx = fp.x - eye.x, dz = fp.z - eye.z;
      const ang = this._launchAngle(foeDist, (fp.y - 0.7) - eye.y, v, false);
      const { dYaw, dPitch } = this._turnTo(dt, it, Math.atan2(-dx, -dz) + this.aimOffset.yaw, (ang ?? 0.3) + this.aimOffset.pitch);
      it.moveZ = ang === null ? 1 : foeDist < 3 ? -1 : 0;
      it.moveX = this.strafeDir * 0.5;
      if (ang !== null && balls.ready(me) && Math.abs(dYaw) < 0.04 && Math.abs(dPitch) < 0.05) it.fire = true;
      return;
    }

    // cesta: chega a uma distância boa e arremessa em parábola alta
    const hoop = (g.arena.extras.hoops ?? []).find((h) => h.forTeam === me.team);
    if (!hoop) return;
    const c = hoop.center;
    const dx = c.x - eye.x, dz = c.z - eye.z, d = Math.hypot(dx, dz);
    const ang = this._launchAngle(d, c.y + 0.3 - eye.y, v, true);
    let mz = 0;
    if (d > 7.5 || ang === null) mz = 1;
    else if (d < 3.5) mz = -1;
    const { dYaw, dPitch } = this._turnTo(dt, it, Math.atan2(-dx, -dz) + this.aimOffset.yaw, (ang ?? 0.6) + this.aimOffset.pitch);
    it.moveZ = mz;
    it.sprint = d > 10;
    const steady = Math.hypot(me.controller.velocity.x, me.controller.velocity.z) < 1.5;
    if (mz === 0 && steady && ang !== null && balls.ready(me) && Math.abs(dYaw) < 0.025 && Math.abs(dPitch) < 0.025) it.fire = true;
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

    // Compensação: bala instantânea mira direto; projétil cai e precisa de "lead"
    const hitscan = def.type === 'hitscan';
    const rocket = def.type === 'rocket';
    const speed = hitscan ? Infinity : def.speed ?? 30;
    const t = dist / speed;
    const drop = unarmed || hitscan || rocket ? 0 : 0.5 * -CONFIG.physics.gravity * t * t * b.leadSkill;
    if (rocket && foe.mode === 'controlled') aim.y -= 1.1; // foguete no pé (o raio pega de qualquer jeito)
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
    const w = me.weapon;
    let want = !unarmed && sees && allowed && onTarget && reacted && dist < Math.max(rMax * 1.6, b.maxFireRange * 0.5);
    if (rocket && dist < 5) want = false; // não se explode junto
    if (want && def.type !== 'throw' && !def.auto) {
      // semi-automática: precisa soltar e apertar de novo (no ritmo de um humano)
      this.semiT = (this.semiT ?? 0) - dt;
      if (this.semiT <= 0 && !this.lastFire) { it.fire = true; this.semiT = rand(0.12, 0.3); }
    } else {
      it.fire = want;
    }
    if (def.spinUp && sees && dist < rMax * 2) it.fire = true; // minigun: já gira antes de mirar
    this.lastFire = it.fire;
    it.ads = !unarmed && sees && reacted && dist > 11 && ['pistol', 'rifle', 'heavy'].includes(def.category) && !def.spinUp;
    if (!sees && w.ammo < (def.mag ?? 0) * 0.4 && w.reserve > 0) it.reload = true; // recarrega escondido
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
        it.jump = Math.random() < 0.5; // às vezes pula o obstáculo
      }
    } else {
      this.stuckTimer = 0;
    }
    it.moveX = mx;
    it.moveZ = mz;
    it.sprint = mz > 0 && (!sees || flat > rMax * 1.3 || (duckOnFloor && flat > 4));
    if (sees && Math.random() < dt * 0.25) it.jump = true; // pulinho de vez em quando, pra dificultar a mira
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

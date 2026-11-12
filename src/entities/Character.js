// =============================================================
//  Character — objeto inanimado com ragdoll de juntas.
//
//  Arquitetura "proxy de controle + ragdoll":
//   • controller: corpo DINÂMICO invisível (duas esferas empilhadas,
//     rotação travada). É ele que anda com WASD e segura o boneco de pé.
//   • parts: tronco, braços, antebraços, pernas e arma. Enquanto o
//     jogador controla, são KINEMÁTICAS e seguem o controller numa pose
//     fixa. Ao virar ragdoll, viram DINÂMICAS e as juntas assumem.
// =============================================================

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { GROUP, playerGroup, ALL_PLAYERS_MASK } from '../physics/PhysicsWorld.js';

export const STAND_HEIGHT = 0.85; // centro do controller acima do chão
const EYE_OFFSET = 0.75;           // olho acima do centro do controller
const UP = new CANNON.Vec3(0, 1, 0);
const V = (x, y, z) => new CANNON.Vec3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Medidas (metros). Posições "rest" são relativas ao centro do controller.
const TORSO = { radius: 0.42, height: 0.9, y: 0.2, mass: 5 };
const UPPER_ARM = { half: [0.04, 0.2, 0.04], x: 0.48, y: 0.3, mass: 0.4 };
const FOREARM = { half: [0.035, 0.18, 0.035], x: 0.48, y: -0.08, mass: 0.3 };
const LEG = { radius: 0.07, length: 0.55, x: 0.2, y: -0.525, mass: 0.5 };
const WEAPON = { half: [0.07, 0.09, 0.28], pos: [0.28, 0.25, -0.6], mass: 0.8 };

export class Character {
  /**
   * @param {{index:number, name:string, color:number, variant:'radio'|'fone',
   *          scene:THREE.Scene, physics:import('../physics/PhysicsWorld.js').PhysicsWorld,
   *          arena:import('../world/Arena.js').Arena}} opts
   */
  constructor({ index, name, color, variant, scene, physics, arena }) {
    Object.assign(this, { index, name, color, variant, scene, physics, arena });

    this.mode = 'controlled';   // 'controlled' | 'ragdoll'
    this.frozen = true;         // travado: sem andar (QUIZ, loja)
    this.canLook = false;       // travado mas pode olhar em volta (loja)
    this.team = index;          // 1v1 hoje; com 8 jogadores, vários por time
    this.isBot = false;
    this.hp = CONFIG.player.maxHp;
    this.armor = 0;
    this.dead = false;
    this.flinch = new CANNON.Vec3();
    this.autoRecover = true;
    this.yaw = 0;
    this.pitch = 0;
    this.ragdollTimer = 0;
    this.spawn = { position: V(0, 0, 0), yaw: 0 };
    this.weapon = null;         // injetado pelo Game

    // Máscaras de colisão por modo
    this.group = playerGroup(index);
    this.maskOthers = ALL_PLAYERS_MASK & ~this.group;
    this.maskController = GROUP.ENV | GROUP.PROJECTILE | this.maskOthers;
    this.maskKinematic = GROUP.PROJECTILE | this.maskOthers;            // não perde tempo com o chão
    this.maskRagdoll = GROUP.ENV | GROUP.PROJECTILE | this.maskOthers;  // sem autocolisão

    this.parts = {};
    this.partList = [];
    this.constraints = [];
    this.layer = 1 + index; // a própria câmera esconde esse layer em 1ª pessoa

    this._q = new CANNON.Quaternion();
    this._v = new CANNON.Vec3();

    this._buildController();
    this._buildParts();
    this.poseParts();      // as peças PRECISAM estar na pose antes das juntas
    this._buildJoints();

    this.totalMass = this.partList.reduce((s, p) => s + p.body.mass, 0);
    for (const p of this.partList) p.mesh.traverse((o) => o.layers.set(this.layer));
  }

  // ------------------------------------------------------------------ build
  _buildController() {
    const body = new CANNON.Body({
      mass: 80,
      material: this.physics.materials.controller,
      fixedRotation: true,
      linearDamping: 0,
      collisionFilterGroup: this.group,
      collisionFilterMask: this.maskController,
    });
    body.addShape(new CANNON.Sphere(0.42), V(0, -0.43, 0)); // pé encosta em y=0
    body.addShape(new CANNON.Sphere(0.42), V(0, 0.35, 0));
    body.userData = { character: this, part: 'controller' };
    this.controller = this.physics.addBody(body);
  }

  _addPart(name, shape, mass, restPos, mesh) {
    const body = new CANNON.Body({
      mass,
      type: CANNON.Body.KINEMATIC,
      material: this.physics.materials.ragdoll,
      collisionFilterGroup: this.group,
      collisionFilterMask: this.maskKinematic,
      linearDamping: 0.01,
      angularDamping: 0.05,
    });
    body.addShape(shape);
    body.userData = { character: this, part: name };
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(mesh);
    this.physics.addBody(body, mesh);
    const part = { name, body, mesh, restPos, restQuat: new CANNON.Quaternion() };
    this.parts[name] = part;
    this.partList.push(part);
    return part;
  }

  _buildParts() {
    const skin = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1e1d24, roughness: 0.8 });
    const limb = new THREE.MeshStandardMaterial({ color: 0xd9d9e0, roughness: 0.7 });

    // Tronco (cilindro)
    const torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(TORSO.radius, TORSO.radius, TORSO.height, 24), skin);
    this._decorateTorso(torsoMesh, dark, skin);
    this._addPart('torso', new CANNON.Cylinder(TORSO.radius, TORSO.radius, TORSO.height, 12), TORSO.mass, V(0, TORSO.y, 0), torsoMesh);

    for (const side of [-1, 1]) {
      const s = side < 0 ? 'L' : 'R';
      const [ux, uy, uz] = UPPER_ARM.half;
      this._addPart(`upperArm${s}`, new CANNON.Box(V(ux, uy, uz)), UPPER_ARM.mass,
        V(UPPER_ARM.x * side, UPPER_ARM.y, 0), new THREE.Mesh(new THREE.BoxGeometry(ux * 2, uy * 2, uz * 2), limb));

      const [fx, fy, fz] = FOREARM.half;
      this._addPart(`forearm${s}`, new CANNON.Box(V(fx, fy, fz)), FOREARM.mass,
        V(FOREARM.x * side, FOREARM.y, 0), new THREE.Mesh(new THREE.BoxGeometry(fx * 2, fy * 2, fz * 2), limb));

      this._addPart(`leg${s}`, new CANNON.Cylinder(LEG.radius, LEG.radius, LEG.length, 8), LEG.mass,
        V(LEG.x * side, LEG.y, 0), new THREE.Mesh(new THREE.CylinderGeometry(LEG.radius, LEG.radius, LEG.length, 10), limb));
    }

    const [wx, wy, wz] = WEAPON.half;
    this._addPart('weapon', new CANNON.Box(V(wx, wy, wz)), WEAPON.mass, V(...WEAPON.pos), buildWeaponMesh(this.color, wx, wy, wz));
  }

  _decorateTorso(torso, dark, skin) {
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      torso.add(m);
      return m;
    };
    // "Visor" frontal (-Z) para deixar claro para onde o boneco olha
    add(new THREE.BoxGeometry(0.5, 0.16, 0.06), dark, 0, 0.22, -TORSO.radius + 0.02);

    if (this.variant === 'radio') {
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 24), dark, 0, -0.1, -TORSO.radius + 0.01, Math.PI / 2);
      const antenna = add(new THREE.CylinderGeometry(0.015, 0.015, 0.75, 6), dark, 0.22, 0.75, 0.05, 0, 0, -0.35);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin);
      tip.position.y = 0.38;
      antenna.add(tip);
    } else {
      // fone de ouvido: arco + conchas
      add(new THREE.TorusGeometry(0.46, 0.05, 8, 28, Math.PI), dark, 0, 0.12, 0);
      add(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 20), dark, -0.47, 0.1, 0, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 20), dark, 0.47, 0.1, 0, 0, 0, Math.PI / 2);
    }
  }

  // ------------------------------------------------------------------ joints
  _buildJoints() {
    const L = CONFIG.chaos.jointLooseness;
    const cone = (a) => Math.min(a * L, Math.PI * 0.95);
    const torso = this.parts.torso.body;

    for (const side of [-1, 1]) {
      const s = side < 0 ? 'L' : 'R';
      const upper = this.parts[`upperArm${s}`].body;
      const fore = this.parts[`forearm${s}`].body;
      const leg = this.parts[`leg${s}`].body;

      // OMBRO — cone-twist: gira em cone ao redor do eixo "para baixo", com torção limitada
      this._joint(new CANNON.ConeTwistConstraint(torso, upper, {
        pivotA: V(UPPER_ARM.x * side, UPPER_ARM.y - TORSO.y + UPPER_ARM.half[1], 0), // topo do braço, no frame do tronco
        pivotB: V(0, UPPER_ARM.half[1], 0),
        axisA: V(0, -1, 0), axisB: V(0, -1, 0),
        angle: cone(Math.PI * 0.6), twistAngle: cone(Math.PI * 0.35),
        collideConnected: false,
      }));

      // COTOVELO — dobradiça no eixo X. Cannon não limita ângulo de hinge,
      // então o cotovelo dobra para os dois lados: bizarro de propósito.
      this._joint(new CANNON.HingeConstraint(upper, fore, {
        pivotA: V(0, -UPPER_ARM.half[1], 0),
        pivotB: V(0, FOREARM.half[1], 0),
        axisA: V(1, 0, 0), axisB: V(1, 0, 0),
        collideConnected: false,
      }));

      // QUADRIL — cone-twist mais fechado que o ombro
      this._joint(new CANNON.ConeTwistConstraint(torso, leg, {
        pivotA: V(LEG.x * side, -TORSO.height / 2, 0),
        pivotB: V(0, LEG.length / 2, 0),
        axisA: V(0, -1, 0), axisB: V(0, -1, 0),
        angle: cone(Math.PI * 0.4), twistAngle: cone(Math.PI * 0.2),
        collideConnected: false,
      }));
    }

    // ARMA — lock: solidária ao tronco (usa a pose atual como referência)
    this._joint(new CANNON.LockConstraint(torso, this.parts.weapon.body));
  }

  _joint(c) {
    this.constraints.push(c);
    this.physics.addConstraint(c);
  }

  // ------------------------------------------------------------------ pose
  /** Coloca as peças kinemáticas na pose "de pé" seguindo o controller. */
  poseParts() {
    const q = this._q.setFromAxisAngle(UP, this.yaw);
    const base = this.controller.position;
    for (const p of this.partList) {
      q.vmult(p.restPos, this._v);
      p.body.position.set(base.x + this._v.x, base.y + this._v.y, base.z + this._v.z);
      q.mult(p.restQuat, p.body.quaternion);
      p.body.velocity.copy(this.controller.velocity);
      p.body.angularVelocity.setZero();
    }
  }

  // ------------------------------------------------------------------ modos
  goRagdoll() {
    if (this.mode === 'ragdoll') return;
    this.mode = 'ragdoll';
    this.ragdollTimer = 0;
    const inherited = this.controller.velocity.clone();

    // controller sai de cena: congelado e sem colidir com nada
    this.controller.type = CANNON.Body.KINEMATIC;
    this.controller.velocity.setZero();
    this.controller.collisionFilterMask = 0;

    for (const p of this.partList) {
      const b = p.body;
      b.type = CANNON.Body.DYNAMIC;
      b.collisionFilterMask = this.maskRagdoll;
      b.updateMassProperties();
      b.velocity.copy(inherited);
      b.angularVelocity.setZero();
      b.wakeUp();
    }
  }

  _leaveRagdoll() {
    this.mode = 'controlled';
    this.ragdollTimer = 0;
    const c = this.controller;
    c.type = CANNON.Body.DYNAMIC;
    c.collisionFilterMask = this.maskController;
    c.updateMassProperties();
    c.velocity.setZero();
    for (const p of this.partList) {
      p.body.type = CANNON.Body.KINEMATIC;
      p.body.collisionFilterMask = this.maskKinematic;
      p.body.velocity.setZero();
      p.body.angularVelocity.setZero();
    }
  }

  /** Levanta onde o tronco caiu (dentro da arena). */
  recover() {
    if (this.mode !== 'ragdoll') return;
    const t = this.parts.torso.body.position;
    const y = Math.min(Math.max(0, t.y - 0.4), this.arena.H - 2); // em cima de caixa? levanta em cima dela
    const ground = this.arena.clampInside(new CANNON.Vec3(t.x, y, t.z), 0.9);
    ground.y = y;
    this.teleport(ground, this.yaw);
  }

  /** @param ground posição no CHÃO (y = altura do piso) */
  teleport(ground, yaw = this.yaw) {
    if (this.mode === 'ragdoll') this._leaveRagdoll();
    this.controller.position.set(ground.x, ground.y + STAND_HEIGHT, ground.z);
    this.controller.velocity.setZero();
    this.flinch.setZero();
    this.yaw = yaw;
    this.pitch = 0;
    this.poseParts();
  }

  // ------------------------------------------------------------------ vida
  get alive() { return !this.dead; }

  /** Colete absorve primeiro, depois HP. */
  takeDamage(amount) {
    if (this.dead) return { killed: false, dealt: 0 };
    const absorbed = Math.min(this.armor, amount);
    this.armor -= absorbed;
    this.hp = Math.max(0, this.hp - (amount - absorbed));
    if (this.hp <= 0) {
      this.dead = true;
      this.goRagdoll(); // corpo fica no chão até o fim do round
      return { killed: true, dealt: amount };
    }
    return { killed: false, dealt: amount };
  }

  /** Volta à vida cheia (início de round / desempate). keepArmor = sobreviveu. */
  revive(keepArmor = false) {
    this.dead = false;
    this.hp = CONFIG.player.maxHp;
    if (!keepArmor) this.armor = 0;
  }

  /** "Tranco" para armas que não derrubam: empurra o controller por um instante. */
  addFlinch(direction, knockback) {
    if (this.mode !== 'controlled') return;
    const k = knockback * CONFIG.chaos.flinchScale;
    this.flinch.x += direction.x * k;
    this.flinch.z += direction.z * k;
  }

  centerPosition(out) {
    const p = this.mode === 'controlled' ? this.controller.position : this.parts.torso.body.position;
    return out.set(p.x, p.y, p.z);
  }

  /** Cor da faixa / visibilidade da arma presa ao corpo, conforme a arma equipada. */
  setWeaponLook(def) {
    const m = this.parts.weapon.mesh;
    m.visible = def.type === 'projectile';
    if (m.userData.accent && def.color !== undefined) m.userData.accent.color.setHex(def.color);
  }

  /** Impulso distribuído por massa (o boneco inteiro voa junto) + giro aleatório. */
  applyChaosImpulse(impulse, spin) {
    const c = CONFIG.chaos;
    for (const p of this.partList) {
      const b = p.body;
      const share = impulse.scale(b.mass / this.totalMass);
      const isTorso = p.name === 'torso';
      const j = isTorso ? c.offCenterJitter : 0; // torque fora do centro só no tronco (estável)
      b.applyImpulse(share, V(rand(-j, j), rand(-j, j), rand(-j, j)));
      const s = spin * (isTorso ? 1 : c.limbSpinMultiplier);
      b.angularVelocity.x += rand(-s, s);
      b.angularVelocity.y += rand(-s, s);
      b.angularVelocity.z += rand(-s, s);
    }
  }

  // ------------------------------------------------------------------ loop
  /** Antes do passo físico: mira e velocidade do controller. */
  preStep(dt, intent) {
    if (this.mode === 'ragdoll') {
      this.ragdollTimer += dt;
      return;
    }
    const v = this.controller.velocity;
    if (this.frozen) {
      v.x = 0;
      v.z = 0;
      this.flinch.setZero();
      if (this.canLook) {
        this.yaw -= intent.lookX;
        this.pitch = clamp(this.pitch - intent.lookY, -1.45, 1.45);
      }
      return;
    }
    this.yaw -= intent.lookX;
    this.pitch = clamp(this.pitch - intent.lookY, -1.45, 1.45);

    let mx = intent.moveX, mz = intent.moveZ;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const speed = CONFIG.character.moveSpeed;
    // frente = (-sin, -cos) · direita = (cos, -sin)
    v.x = (-sin * mz + cos * mx) * speed + this.flinch.x;
    v.z = (-cos * mz - sin * mx) * speed + this.flinch.z;
    this.flinch.scale(Math.exp(-dt * 6), this.flinch); // o tranco some rápido
  }

  /** Depois do passo físico: pose kinemática ou regras do ragdoll. */
  postStep() {
    if (this.mode === 'controlled') {
      this.poseParts();
      return;
    }
    const cfg = CONFIG.physics;
    for (const p of this.partList) {
      const b = p.body;
      const sp = b.velocity.length();
      if (sp > cfg.maxRagdollSpeed) b.velocity.scale(cfg.maxRagdollSpeed / sp, b.velocity);
      const w = b.angularVelocity.length();
      if (w > cfg.maxAngularSpeed) b.angularVelocity.scale(cfg.maxAngularSpeed / w, b.angularVelocity);
    }

    const torso = this.parts.torso.body;
    const out = torso.position.y < -3 || Math.abs(torso.position.x) > this.arena.W
      || Math.abs(torso.position.z) > this.arena.D || Number.isNaN(torso.position.x);
    if (out) {
      this.teleport(this.spawn.position, this.spawn.yaw); // caiu do mundo: volta pro spawn
      if (this.dead) this.goRagdoll();
      return;
    }

    const ch = CONFIG.character;
    if (this.autoRecover && !this.dead && this.ragdollTimer > ch.recoverTime &&
        (torso.velocity.length() < ch.recoverSpeedThreshold || this.ragdollTimer > ch.recoverMaxTime)) {
      this.recover();
    }
  }

  // ------------------------------------------------------------------ mira
  getEyePosition(target = new THREE.Vector3()) {
    if (this.mode === 'controlled') {
      const c = this.controller.position;
      return target.set(c.x, c.y + EYE_OFFSET, c.z);
    }
    const t = this.parts.torso.body;
    const top = t.quaternion.vmult(V(0, TORSO.height / 2 + 0.1, 0));
    return target.set(t.position.x + top.x, t.position.y + top.y, t.position.z + top.z);
  }

  getAimDirection(target = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return target.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  get velocity() {
    return this.mode === 'controlled' ? this.controller.velocity : this.parts.torso.body.velocity;
  }
}

function buildWeaponMesh(color, hx, hy, hz) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2a33, roughness: 0.5, metalness: 0.2 });
  const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -hz - 0.1;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(hx * 2.05, 0.04, hz * 1.2), accent);
  stripe.position.y = hy * 0.4;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(hx * 1.6, 0.18, 0.09), dark);
  grip.position.set(0, -hy - 0.07, hz * 0.45);
  g.add(body, barrel, stripe, grip);
  g.userData.accent = accent;
  return g;
}

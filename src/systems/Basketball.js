// BOLA-BOMBA do basquete: todo mundo tem a sua (volta pra mão depois de um
// instante). Entrou na cesta → ponto. Bateu no chão ou num jogador → EXPLODE e
// arremessa quem estiver perto (sem dano). Aro, tabela e paredes: quica.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { GROUP } from '../physics/PhysicsWorld.js';

export class Basketball {
  constructor(game) {
    this.game = game;
    this.balls = [];
    this.reload = new Map();
    this.onScore = null;   // (hoop, thrower) => void
    this.onExplode = null; // (ball) => void
    const r = CONFIG.basketball.ballRadius;
    this.geo = new THREE.SphereGeometry(r, 20, 14);
    this.seamGeo = new THREE.TorusGeometry(r * 1.002, r * 0.05, 4, 24);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7, emissive: 0x220800 });
    this.seamMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  }

  ready(p) {
    return (this.reload.get(p) ?? 0) <= 0;
  }

  reloadLeft(p) {
    return Math.max(0, this.reload.get(p) ?? 0);
  }

  /** Arremessa a bola da mão na direção da mira. */
  throw(p) {
    if (!this.ready(p) || p.mode !== 'controlled' || p.frozen || p.dead) return false;
    const cfg = CONFIG.basketball;
    this.reload.set(p, cfg.reload);
    const eye = p.getEyePosition(new THREE.Vector3());
    const dir = p.getAimDirection(new THREE.Vector3());
    const body = new CANNON.Body({
      mass: 0.6,
      material: this.game.physics.materials.projectile,
      collisionFilterGroup: GROUP.PROJECTILE,
      collisionFilterMask: GROUP.ENV | GROUP.PROJECTILE | p.maskOthers, // não bate em quem jogou
      linearDamping: 0.03,
    });
    body.addShape(new CANNON.Sphere(cfg.ballRadius));
    body.position.set(eye.x + dir.x * 0.8, eye.y + dir.y * 0.8 - 0.1, eye.z + dir.z * 0.8);
    const v = p.velocity;
    body.velocity.set(dir.x * cfg.throwSpeed + v.x * 0.5, dir.y * cfg.throwSpeed, dir.z * cfg.throwSpeed + v.z * 0.5);
    // backspin na direção do arremesso (igual pros dois lados da quadra)
    const sx = -dir.z, sz = dir.x, sl = Math.hypot(sx, sz) || 1;
    body.angularVelocity.set((sx / sl) * 8, 0, (sz / sl) * 8);

    const mesh = new THREE.Group();
    const s1 = new THREE.Mesh(this.seamGeo, this.seamMat);
    const s2 = s1.clone();
    s2.rotation.y = Math.PI / 2;
    mesh.add(new THREE.Mesh(this.geo, this.mat), s1, s2);
    mesh.traverse((o) => { o.castShadow = true; });
    this.game.scene.add(mesh);
    this.game.physics.addBody(body, mesh);

    const ball = { body, mesh, owner: p, age: 0, prevY: body.position.y, boom: false, done: false };
    body.addEventListener('collide', (e) => {
      if (ball.done) return;
      const other = e.body;
      if (other === this.game.arena.floor || other?.userData?.character) ball.boom = true;
    });
    this.balls.push(ball);
    return true;
  }

  /** Depois do passo físico: recarga, cestas e explosões. */
  update(dt) {
    for (const [p, t] of this.reload) this.reload.set(p, t - dt);
    const hoops = this.game.arena.extras.hoops ?? [];
    for (const b of [...this.balls]) {
      b.age += dt;
      const pos = b.body.position;
      // cesta: cruzou a altura do aro descendo, por dentro do aro
      for (const hoop of hoops) {
        const c = hoop.center;
        if (b.prevY > c.y && pos.y <= c.y && b.body.velocity.y < 0 && Math.hypot(pos.x - c.x, pos.z - c.z) < hoop.radius * 0.95) {
          this._remove(b);
          this.onScore?.(hoop, b.owner);
          break;
        }
      }
      if (b.done) continue;
      b.prevY = pos.y;
      if (b.boom || b.age > CONFIG.basketball.ballFuse) this._explode(b);
    }
  }

  _explode(b) {
    const c = b.body.position.clone();
    this._remove(b);
    const cfg = CONFIG.basketball;
    this.game.grenades.explodeAt(c, cfg.blastRadius, cfg.blastKnock);
    this.onExplode?.(b);
  }

  _remove(b) {
    b.done = true;
    this.game.physics.removeBody(b.body);
    this.game.scene.remove(b.mesh);
    this.balls.splice(this.balls.indexOf(b), 1);
  }

  clear() {
    [...this.balls].forEach((b) => this._remove(b));
    this.reload.clear();
  }

  destroy() {
    this.clear();
  }
}

// Mundo físico (cannon-es): gravidade, materiais, grupos de colisão
// e sincronização corpo físico → malha do Three.js.

import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';

// Grupos de colisão (bitmask). Cada jogador tem um bit próprio,
// assim as peças de um mesmo boneco não colidem entre si
// (as juntas já cuidam disso) e o projétil ignora o próprio dono.
export const GROUP = {
  ENV: 1,
  PROJECTILE: 2,
  PLAYER_BASE: 4,
};
export const playerGroup = (index) => GROUP.PLAYER_BASE << index;
export const ALL_PLAYERS_MASK = 0xffff & ~GROUP.ENV & ~GROUP.PROJECTILE;

export class PhysicsWorld {
  constructor() {
    const cfg = CONFIG.physics;
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, cfg.gravity, 0) });
    this.world.allowSleep = false;
    this.world.solver.iterations = cfg.solverIterations;
    this.world.defaultContactMaterial.friction = 0.3;
    this.world.defaultContactMaterial.restitution = 0.1;

    this.materials = {
      ground: new CANNON.Material('ground'),
      controller: new CANNON.Material('controller'),
      ragdoll: new CANNON.Material('ragdoll'),
      projectile: new CANNON.Material('projectile'),
    };
    const m = this.materials;
    // Controlador sem atrito: quem manda na velocidade é o input, não o chão.
    this._contact(m.ground, m.controller, { friction: 0, restitution: 0 });
    this._contact(m.controller, m.controller, { friction: 0, restitution: 0 });
    this.ragdollGround = this._contact(m.ground, m.ragdoll, { friction: 0.5, restitution: cfg.ragdollBounciness });
    this._contact(m.ragdoll, m.ragdoll, { friction: 0.4, restitution: 0.3 });
    this._contact(m.ground, m.projectile, { friction: 0.3, restitution: 0.55 });
    this._contact(m.ragdoll, m.projectile, { friction: 0.2, restitution: 0.3 });

    this.links = []; // { body, mesh }
  }

  _contact(a, b, opts) {
    const cm = new CANNON.ContactMaterial(a, b, opts);
    this.world.addContactMaterial(cm);
    return cm;
  }

  addBody(body, mesh = null) {
    this.world.addBody(body);
    if (mesh) this.links.push({ body, mesh });
    return body;
  }

  removeBody(body) {
    this.world.removeBody(body);
    this.links = this.links.filter((l) => l.body !== body);
  }

  addConstraint(c) {
    this.world.addConstraint(c);
    return c;
  }

  step(dt) {
    const cfg = CONFIG.physics;
    // Valores relidos a cada frame → ajuste ao vivo pelo painel.
    this.world.gravity.y = cfg.gravity;
    this.ragdollGround.restitution = cfg.ragdollBounciness;
    this.world.step(cfg.fixedTimeStep, dt, cfg.maxSubSteps);
  }

  sync() {
    for (const { body, mesh } of this.links) {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    }
  }
}

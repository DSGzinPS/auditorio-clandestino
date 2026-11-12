// Teste headless (sem navegador): roda só física + entidades.
// Uso: node tests/physics-sim.mjs
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { Arena } from '../src/world/Arena.js';
import { Character, STAND_HEIGHT } from '../src/entities/Character.js';
import { ProjectileSystem } from '../src/entities/ProjectileSystem.js';
import { Weapon } from '../src/entities/Weapon.js';
import { punishLaunch, shotKnockback } from '../src/physics/ChaosForces.js';
import { blankIntent } from '../src/core/Controls.js';
import { CONFIG } from '../src/config.js';

const scene = new THREE.Scene();
const physics = new PhysicsWorld();
const arena = new Arena(scene, physics);
const projectiles = new ProjectileSystem(scene, physics);
const players = [0, 1].map((index) => {
  const p = new Character({ index, name: `P${index}`, color: 0xffffff, variant: index ? 'fone' : 'radio', scene, physics, arena });
  p.spawn = arena.spawns[index];
  p.weapon = new Weapon(p, projectiles);
  p.teleport(p.spawn.position, p.spawn.yaw);
  return p;
});

const dt = 1 / 60;
const step = (frames, intents = [blankIntent(), blankIntent()], onFrame) => {
  for (let f = 0; f < frames; f++) {
    players.forEach((p, i) => { p.weapon.update(dt); p.preStep(dt, intents[i]); });
    physics.step(dt);
    players.forEach((p) => p.postStep(dt));
    projectiles.update(dt);
    onFrame?.(f);
  }
};
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✔' : '✘'} ${msg}`); if (!ok) fails++; };

// 1) De pé e estável no quiz
step(120);
const y0 = players[0].controller.position.y;
check(Math.abs(y0 - STAND_HEIGHT) < 0.05, `controller em pé estável (y=${y0.toFixed(3)})`);
check(players[0].mode === 'controlled', 'modo controlado no início');

// 2) Punição: chega no teto?
punishLaunch(players[0]);
let maxY = 0;
step(150, undefined, () => { maxY = Math.max(maxY, players[0].parts.torso.body.position.y); });
check(maxY > arena.H - 1.2, `punição arremessa até o teto (pico tronco y=${maxY.toFixed(2)}, teto=${arena.H})`);
check(players[0].mode === 'ragdoll', 'continua em ragdoll logo após a queda');
const shoulderGap = (() => {
  const t = players[0].parts.torso.body, u = players[0].parts.upperArmR.body;
  return t.position.distanceTo(u.position);
})();
check(shoulderGap < 0.8, `juntas seguram o braço preso (dist tronco–braço=${shoulderGap.toFixed(2)})`);

// 3) Recupera sozinho
step(60 * 6);
check(players[0].mode === 'controlled', 'levantou sozinho depois do recoverTime');
const cy = players[0].controller.position.y;
check(cy > 0.5 && cy < arena.H, `posição de recuperação válida (y=${cy.toFixed(2)})`);

// 4) Tiro: P0 atira em P1 a 6 m de distância
players[0].teleport({ x: 0, y: 0, z: 3 }, 0);
players[1].teleport({ x: 0, y: 0, z: -3 }, Math.PI);
players.forEach((p) => { p.frozen = false; });
step(10);
players[0].pitch = -0.06;
check(players[0].weapon.tryFire(), 'disparo criado');
let hit = null;
step(60, undefined, () => projectiles.drainHits((h) => { hit ??= h; shotKnockback(h.target, h.direction); }));
check(!!hit && hit.target === players[1], `projétil acertou P1 (tipo: ${hit?.kind})`);
const startZ = -3;
let minZ = 0, maxY2 = 0;
step(90, undefined, () => {
  const t = players[1].parts.torso.body.position;
  minZ = Math.min(minZ, t.z); maxY2 = Math.max(maxY2, t.y);
});
check(players[1].mode === 'ragdoll' || minZ < startZ - 2, `P1 ejetado para trás (Δz=${(minZ - startZ).toFixed(2)} m, pico y=${maxY2.toFixed(2)})`);

// 5) Projétil não acerta o próprio dono
const before = projectiles.pendingHits.length;
players[1].teleport(players[1].spawn.position, players[1].spawn.yaw);
players[1].pitch = -1.4; // atira pro próprio pé
players[1].weapon.cooldown = 0;
players[1].weapon.tryFire();
step(30, undefined, () => projectiles.drainHits((h) => { if (h.target === players[1]) fails++, console.log('✘ acertou o próprio dono'); }));
check(players[1].mode === 'controlled', 'tiro no próprio pé não derruba o dono');

// 6) Estabilidade com caos x5
CONFIG.chaos.master = 5;
punishLaunch(players[0]); shotKnockback(players[1], { x: 0, z: -1 });
let nan = false, escaped = false;
step(300, undefined, () => players.forEach((p) => p.partList.forEach(({ body }) => {
  if (Number.isNaN(body.position.x)) nan = true;
  if (Math.abs(body.position.x) > arena.W / 2 + 0.5 || body.position.y > arena.H + 0.5) escaped = true;
})));
check(!nan, 'sem NaN com caos x5');
check(!escaped, 'nenhuma peça atravessou parede/teto com caos x5');

console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo.');
process.exit(fails ? 1 : 0);

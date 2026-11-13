// Balística de FPS no jogo de verdade (headless): hitscan, headshot, queda de dano,
// pente/recarga, recuo, chumbo da escopeta, colete e explosão do RPG.
// Uso: node tests/ballistics-sim.mjs
import * as THREE from 'three';
import { Game } from '../src/core/Game.js';
import { GameStates } from '../src/core/StateMachine.js';
import { blankIntent } from '../src/core/Controls.js';
import { CONFIG } from '../src/config.js';
import { WEAPONS } from '../src/data/catalog.js';
import { falloffMult } from '../src/systems/Ballistics.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✔' : '✘'} ${msg}`); if (!ok) fails++; };
const dt = 1 / 60;

/** P1 atira mirando num ponto do P2 (parado). aimAt: 'chest' | 'head' | 'feet' | fn */
function duel(weapon, { dist = 9, aimAt = 'chest', fire = () => true, lockAim = true } = {}) {
  const g = new Game(null, null, { headless: true, bots: [] });
  g.flow.skipToPvp();
  const [a, b] = g.players;
  a.weapon.equip(weapon);
  b.weapon.equip('none');
  g.sm.change(GameStates.ROUND);
  a.teleport({ x: 0, y: 0, z: 3 }, 0);
  b.teleport({ x: 0, y: 0, z: 3 - dist }, Math.PI);
  const eye = new THREE.Vector3();
  const state = { frames: 0, aimed: null };
  g.schemes[0] = {
    read: () => {
      const it = blankIntent();
      a.getEyePosition(eye);
      const c = b.controller.position;
      const ty = aimAt === 'head' ? b.headY() + 0.12 : aimAt === 'feet' ? c.y - 0.8 : c.y + 0.15;
      const dx = c.x - eye.x, dy = ty - eye.y, dz = c.z - eye.z;
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      if (lockAim || state.aimed === null) { it.setYaw = yaw; it.setPitch = pitch; state.aimed = { yaw, pitch }; }
      it.fire = fire(state.frames++);
      return it;
    },
  };
  g.schemes[1] = { read: () => blankIntent() };
  return { g, a, b, state };
}

const run = (g, sec, until = () => false) => {
  for (let f = 0; f < sec * 60; f++) { g.step(dt); if (until()) return f / 60; }
  return null;
};
const once = (f) => f >= 20 && f < 22; // um clique depois de sacar a arma
const spreadOff = () => { CONFIG.weapon.spreadMult = 0; CONFIG.weapon.recoilMult = 0; };
const spreadOn = () => { CONFIG.weapon.spreadMult = 1; CONFIG.weapon.recoilMult = 1; };

// 1) AK no peito a 9 m: um tiro = dano cheio, sem projétil físico
{
  spreadOff();
  const { g, b } = duel('ak47', { fire: once });
  let projectiles = 0;
  const orig = g.projectiles.spawn.bind(g.projectiles);
  g.projectiles.spawn = (...x) => { projectiles++; return orig(...x); };
  run(g, 0.5);
  check(b.hp === 100 - WEAPONS.ak47.damage && projectiles === 0, `AK no peito: HP ${b.hp} (esperado ${100 - WEAPONS.ak47.damage}), bala instantânea`);
}

// 2) AK na cabeça: headshot mata de uma vez
{
  spreadOff();
  const { g, b } = duel('ak47', { aimAt: 'head', fire: once });
  let hs = false;
  g.damage.onHit = (ctx) => { hs = hs || ctx.headshot; };
  run(g, 0.5);
  check(hs && b.dead, `AK na cabeça: headshot=${hs}, caiu=${b.dead}`);
}

// 3) Colete: absorve metade do dano até acabar
{
  spreadOff();
  const { g, b } = duel('usp', { fire: once });
  b.armor = 50;
  run(g, 0.5);
  const dmg = WEAPONS.usp.damage;
  check(b.hp === 100 - dmg / 2 && b.armor === 50 - dmg / 2, `USP com colete 50: HP ${b.hp}, colete ${b.armor} (absorveu ${CONFIG.player.armorAbsorb * 100}%)`);
}

// 4) Queda de dano por distância
{
  const d = WEAPONS.mp5;
  check(falloffMult(d, 5) === 1 && falloffMult(d, 100) === d.falloff[2] && falloffMult(d, 23) < 1,
    `MP5 perde dano de longe (5 m ×1 · 23 m ×${falloffMult(d, 23).toFixed(2)} · 100 m ×${d.falloff[2]})`);
}

// 5) Pente, recarga automática e reserva
{
  spreadOn();
  const { g, a, b } = duel('mp7', { fire: () => true });
  b.hp = 1e9;
  let shots = 0;
  a.weapon.onFire = () => shots++;
  const mag = WEAPONS.mp7.mag;
  const tEmpty = run(g, 6, () => a.weapon.reloading > 0);
  const expected = 0.25 + (mag - 1) / (WEAPONS.mp7.rpm / 60); // sacar + intervalo entre tiros
  check(shots === mag && tEmpty !== null && Math.abs(tEmpty - expected) < 0.25,
    `MP7: ${shots} tiros em ${tEmpty?.toFixed(2)} s (pente ${mag} a ${WEAPONS.mp7.rpm} rpm ≈ ${expected.toFixed(2)} s)`);
  run(g, WEAPONS.mp7.reload + 0.1, () => a.weapon.ammo > 0 && a.weapon.reloading <= 0);
  check(a.weapon.ammo === mag && a.weapon.reserve === WEAPONS.mp7.reserve - mag, `recarregou sozinho: ${a.weapon.ammo}/${a.weapon.reserve}`);
}

// 6) Recuo: rajada sobe a mira; soltou, ela volta
{
  spreadOn();
  let firing = true;
  const { g, a, b } = duel('ak47', { fire: () => firing, lockAim: false });
  b.hp = 1e9;
  run(g, 0.1);
  const p0 = a.pitch;
  run(g, 1.2);
  const climbed = a.pitch - p0;
  firing = false;
  run(g, 1.5);
  const back = a.pitch - p0;
  check(climbed > 0.08 && back < climbed * 0.6, `AK em rajada: mira subiu ${(climbed * 57.3).toFixed(1)}°, voltou p/ ${(back * 57.3).toFixed(1)}°`);
}

// 7) Semi-automática: segurar o gatilho dá um tiro só
{
  const { g, a, b } = duel('deagle', { fire: (f) => f >= 20 });
  b.hp = 1e9;
  let shots = 0;
  a.weapon.onFire = () => shots++;
  run(g, 1.5);
  check(shots === 1, `Desert Eagle segurando o gatilho: ${shots} tiro (semi)`);
}

// 8) Escopeta de perto: vários chumbos acertam e derruba
{
  spreadOn();
  const { g, b } = duel('pump', { dist: 3.5, fire: once });
  let pellets = 0;
  g.damage.onHit = () => pellets++;
  run(g, 0.4);
  check(pellets >= 4 && b.mode === 'ragdoll', `Pump a 3,5 m: ${pellets}/${WEAPONS.pump.pellets} chumbos, derrubou=${b.mode === 'ragdoll'}`);
}

// 9) Parede bloqueia a bala
{
  spreadOff();
  const { g, a, b } = duel('ak47', { fire: () => true });
  a.teleport({ x: -8.2, y: 0, z: 0 }, 0);
  b.teleport({ x: -3.0, y: 0, z: 0 }, 0);
  b.hp = 1e9;
  let hits = 0;
  g.damage.onHit = () => hits++;
  run(g, 1);
  check(hits === 0, `atrás da caixa: ${hits} acertos`);
}

// 10) RPG: foguete no pé explode, dá dano em área e arremessa
{
  spreadOff();
  const { g, a, b } = duel('rpg7', { dist: 12, aimAt: 'feet', fire: once });
  let exploded = false;
  const orig = g.ballistics.explode.bind(g.ballistics);
  g.ballistics.explode = (...x) => { exploded = true; return orig(...x); };
  run(g, 2, () => exploded);
  run(g, 0.2);
  check(exploded && b.hp < 100 && b.mode === 'ragdoll' && a.hp === 100, `RPG: explodiu=${exploded}, alvo HP ${Math.max(0, Math.round(b.hp))} e voou=${b.mode === 'ragdoll'}, atirador intacto`);
}

// 11) Minigun precisa girar antes de atirar
{
  const { g, a, b } = duel('minigun', { fire: () => true });
  b.hp = 1e9;
  let first = null;
  a.weapon.onFire = () => { if (first === null) first = g.time; };
  const t0 = g.time;
  run(g, 1.5);
  check(first !== null && first - t0 >= WEAPONS.minigun.spinUp * 0.9, `Minigun: 1º tiro após ${(first - t0).toFixed(2)} s girando`);
}

spreadOn();
console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo.');
process.exit(fails ? 1 : 0);

// As duas forças "assinatura" do jogo. Ficam isoladas aqui para que
// estados, debug e futuras armas usem exatamente a mesma receita.

import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';

const rand = (a, b) => a + Math.random() * (b - a);

/** Errou o quiz: ragdoll + foguete vertical rumo ao teto. */
export function punishLaunch(character) {
  const c = CONFIG.chaos;
  character.goRagdoll();
  const side = c.punishImpulse * 0.12; // um pouquinho de deriva lateral
  const impulse = new CANNON.Vec3(rand(-side, side), c.punishImpulse, rand(-side, side)).scale(c.master);
  character.applyChaosImpulse(impulse, c.punishSpin * c.master);
}

/**
 * Foi atingido: ragdoll + ejeção para trás na direção do projétil.
 * @param scale 1 = impulso cheio do CONFIG (armas usam knockback/100)
 */
export function shotKnockback(character, direction, scale = 1) {
  const c = CONFIG.chaos;
  character.goRagdoll();
  const dir = new CANNON.Vec3(direction.x, 0, direction.z);
  if (dir.length() < 1e-4) dir.set(0, 0, 1);
  dir.normalize();
  const impulse = dir.scale(c.shotImpulse).vadd(new CANNON.Vec3(0, c.shotLift, 0)).scale(c.master * scale);
  character.applyChaosImpulse(impulse, c.shotSpin * c.master * Math.min(1.5, scale));
}

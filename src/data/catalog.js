// =============================================================
//  CATÁLOGO — armas, coletes e soco. Tudo dado puro: para criar
//  uma arma nova é só adicionar uma entrada aqui (e no SHOP_ORDER).
//
//  damage        dano por projétil (HP)
//  headshotMult  multiplicador de dano na cabeça
//  speed/radius/mass  física do projétil
//  pellets/spread     quantos projéteis por disparo e abertura (rad)
//  knockback     força do empurrão (100 = CONFIG.chaos.shotImpulse cheio)
//  ragdoll       true = cada acerto derruba · false = só "tranco"
//  botRange      distância que o bot prefere com essa arma [min, max]
// =============================================================

export const WEAPONS = {
  none: {
    id: 'none', name: 'Mãos vazias', type: 'none', price: null,
  },
  duck: {
    id: 'duck', name: 'Patinho de Borracha', type: 'throw', price: null,
    damage: 5, headshotMult: 2, speed: 17, radius: 0.22, mass: 0.4, cooldown: 0.6,
    pellets: 1, spread: 0, knockback: 25, ragdoll: false, color: 0xffd23f, botRange: [3, 10],
  },
  slingshot: {
    id: 'slingshot', name: 'Estilingue de Feira', type: 'projectile', price: 0,
    damage: 12, headshotMult: 2, speed: 30, radius: 0.12, mass: 0.3, cooldown: 0.55,
    pellets: 1, spread: 0.012, knockback: 30, ragdoll: false, color: 0xb08850, botRange: [5, 13],
    view: { len: 0.3, thick: 0.08 },
  },
  pistol: {
    id: 'pistol', name: 'Pistola de Bolinha', type: 'projectile', price: 300,
    damage: 20, headshotMult: 2.5, speed: 40, radius: 0.14, mass: 0.4, cooldown: 0.3,
    pellets: 1, spread: 0.008, knockback: 45, ragdoll: false, color: 0x3dd6ff, botRange: [5, 14],
    view: { len: 0.34, thick: 0.1 },
  },
  shotgun: {
    id: 'shotgun', name: 'Escopeta de Confete', type: 'projectile', price: 650,
    damage: 14, headshotMult: 1.5, speed: 34, radius: 0.1, mass: 0.25, cooldown: 0.95,
    pellets: 7, spread: 0.09, knockback: 35, ragdoll: true, color: 0xff2e88, botRange: [2, 7],
    view: { len: 0.55, thick: 0.13 },
  },
  smg: {
    id: 'smg', name: 'Metralhadora de Quermesse', type: 'projectile', price: 900,
    damage: 11, headshotMult: 2, speed: 42, radius: 0.11, mass: 0.25, cooldown: 0.09,
    pellets: 1, spread: 0.03, knockback: 12, ragdoll: false, color: 0x8a5cff, botRange: [4, 12],
    view: { len: 0.5, thick: 0.09 },
  },
  cannon: {
    id: 'cannon', name: 'Canhão de Melancia', type: 'projectile', price: 1300,
    damage: 75, headshotMult: 1.5, speed: 30, radius: 0.32, mass: 3, cooldown: 1.5,
    pellets: 1, spread: 0, knockback: 160, ragdoll: true, color: 0x4caf50, botRange: [6, 18],
    view: { len: 0.6, thick: 0.2 },
  },
};

export const MELEE = {
  id: 'fists', name: 'Soco', type: 'melee',
  damage: 34, headshotMult: 1, range: 1.9, cooldown: 0.6, knockback: 140, ragdoll: true,
};

export const ARMORS = {
  vest: { id: 'vest', name: 'Colete de Isopor', price: 250, points: 25 },
  heavy: { id: 'heavy', name: 'Colete de Colchão', price: 450, points: 50 },
};

/** Ordem na loja = teclas 1..6 */
export const SHOP_ORDER = ['pistol', 'shotgun', 'smg', 'cannon', 'vest', 'heavy'];

export function shopItem(id) {
  if (WEAPONS[id]) return { kind: 'weapon', ...WEAPONS[id] };
  if (ARMORS[id]) return { kind: 'armor', ...ARMORS[id] };
  return null;
}

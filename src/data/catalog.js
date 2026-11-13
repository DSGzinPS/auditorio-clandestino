// =============================================================
//  CATÁLOGO — armas, coletes e soco. Dados puros: para criar uma
//  arma nova é só adicionar uma entrada aqui e em SHOP_TABS.
//
//  type        'hitscan' (bala instantânea por raio) | 'projectile' (física, ex.: estilingue)
//              'rocket' (RPG: projétil reto que explode) | 'throw' (patinho) | 'none'
//  damage      dano por bala/chumbo · headshotMult: multiplicador na cabeça
//  falloff     [começa a cair (m), para de cair (m), multiplicador mínimo]
//  rpm         cadência (tiros por minuto) · auto: segurar = rajada (false = semi)
//  mag / reserve / reload   pente, munição reserva, segundos de recarga
//  pellets     balas por disparo (escopetas)
//  spread      dispersão parado sem mirar (rad) · adsSpread: mirando · moveSpread: somada andando
//  bloom       quanto cada tiro abre a dispersão · bloomMax · bloomRecover (rad/s)
//  recoil      [subida da mira por tiro (rad), tremida lateral (rad)]
//  adsFov      campo de visão mirando (zoom) · speedMult: velocidade carregando a arma
//  knockback   empurrão (100 = tiro cheio do CONFIG.chaos) · ragdoll: cada acerto derruba
//  model       modelo 3D (Quaternius Ultimate Gun Pack, CC0) ou 'proc:*' (feito em código)
//  viewLen / worldLen       tamanho na mão (1ª pessoa) / no corpo (m)
// =============================================================

const pistol = { category: 'pistol', type: 'hitscan', auto: false, pellets: 1, range: 80, ragdoll: false, speedMult: 1, botRange: [4, 18] };
const smg = { category: 'smg', type: 'hitscan', auto: true, pellets: 1, range: 80, ragdoll: false, speedMult: 0.97, botRange: [4, 16] };
const rifle = { category: 'rifle', type: 'hitscan', auto: true, pellets: 1, range: 120, ragdoll: false, speedMult: 0.92, botRange: [6, 26] };
const shotgun = { category: 'shotgun', type: 'hitscan', auto: false, range: 40, ragdoll: true, speedMult: 0.94, bloom: 0, bloomMax: 0, bloomRecover: 1, botRange: [2, 8] };

export const WEAPONS = {
  none: { id: 'none', name: 'Mãos vazias', type: 'none', category: 'special', price: null },

  duck: {
    id: 'duck', name: 'Patinho de Borracha', type: 'throw', category: 'special', price: null,
    damage: 5, headshotMult: 2, speed: 17, radius: 0.22, mass: 0.4, rpm: 100, auto: false,
    mag: 1, reserve: 0, reload: 0, pellets: 1, spread: 0, knockback: 25, ragdoll: false,
    color: 0xffd23f, botRange: [3, 10], sound: 'duck',
  },

  slingshot: {
    id: 'slingshot', name: 'Estilingue', type: 'projectile', category: 'pistol', price: 0,
    damage: 18, headshotMult: 2, speed: 34, radius: 0.1, mass: 0.3, rpm: 110, auto: false,
    mag: 8, reserve: Infinity, reload: 1.4, pellets: 1, spread: 0.01, adsSpread: 0.004, moveSpread: 0.02,
    bloom: 0, bloomMax: 0, bloomRecover: 1, recoil: [0.012, 0.004], adsFov: 62, knockback: 30, ragdoll: false,
    color: 0xb08850, botRange: [5, 13], model: 'proc:slingshot', viewLen: 0.11, worldLen: 0.12, sound: 'slingshot', speedMult: 1,
  },

  // ---------------------------------------------------------------- pistolas
  glock: {
    ...pistol, id: 'glock', name: 'Glock', price: 200,
    damage: 22, headshotMult: 2.6, falloff: [12, 35, 0.55], rpm: 420, mag: 17, reserve: 68, reload: 1.7,
    spread: 0.007, adsSpread: 0.003, moveSpread: 0.025, bloom: 0.012, bloomMax: 0.05, bloomRecover: 0.2,
    recoil: [0.02, 0.008], adsFov: 62, knockback: 30, model: 'Pistol_1', viewLen: 0.21, worldLen: 0.19, sound: 'pistol',
  },
  usp: {
    ...pistol, id: 'usp', name: 'USP', price: 300,
    damage: 30, headshotMult: 2.6, falloff: [15, 40, 0.6], rpm: 350, mag: 12, reserve: 48, reload: 1.9,
    spread: 0.005, adsSpread: 0.002, moveSpread: 0.022, bloom: 0.012, bloomMax: 0.045, bloomRecover: 0.2,
    recoil: [0.026, 0.008], adsFov: 60, knockback: 35, model: 'Pistol_6', viewLen: 0.25, worldLen: 0.22, sound: 'pistol',
  },
  revolver38: {
    ...pistol, id: 'revolver38', name: 'Revólver .38', price: 350,
    damage: 42, headshotMult: 2.5, falloff: [15, 45, 0.6], rpm: 130, mag: 6, reserve: 30, reload: 2.6,
    spread: 0.006, adsSpread: 0.002, moveSpread: 0.03, bloom: 0.02, bloomMax: 0.06, bloomRecover: 0.15,
    recoil: [0.055, 0.012], adsFov: 58, knockback: 55, model: 'Revolver_1', viewLen: 0.26, worldLen: 0.24, sound: 'revolver',
  },
  deagle: {
    ...pistol, id: 'deagle', name: 'Desert Eagle', price: 700,
    damage: 58, headshotMult: 2.4, falloff: [18, 50, 0.65], rpm: 240, mag: 7, reserve: 28, reload: 2.1,
    spread: 0.008, adsSpread: 0.002, moveSpread: 0.05, bloom: 0.03, bloomMax: 0.09, bloomRecover: 0.12,
    recoil: [0.085, 0.02], adsFov: 56, knockback: 70, model: 'Pistol_4', viewLen: 0.27, worldLen: 0.25, sound: 'deagle',
  },

  // ---------------------------------------------------------------- submetralhadoras
  mp7: {
    ...smg, id: 'mp7', name: 'MP7', price: 1000,
    damage: 18, headshotMult: 2.2, falloff: [10, 30, 0.55], rpm: 950, mag: 40, reserve: 160, reload: 2.1,
    spread: 0.011, adsSpread: 0.005, moveSpread: 0.015, bloom: 0.003, bloomMax: 0.035, bloomRecover: 0.35,
    recoil: [0.009, 0.007], adsFov: 60, knockback: 15, model: 'SubmachineGun_4', viewLen: 0.36, worldLen: 0.38, sound: 'smg',
  },
  mp5: {
    ...smg, id: 'mp5', name: 'MP5', price: 1100,
    damage: 21, headshotMult: 2.2, falloff: [12, 35, 0.55], rpm: 800, mag: 30, reserve: 120, reload: 2.4,
    spread: 0.012, adsSpread: 0.006, moveSpread: 0.02, bloom: 0.004, bloomMax: 0.04, bloomRecover: 0.3,
    recoil: [0.011, 0.008], adsFov: 58, knockback: 20, model: 'SubmachineGun_5', viewLen: 0.44, worldLen: 0.52, sound: 'smg',
  },
  ump45: {
    ...smg, id: 'ump45', name: 'UMP-45', price: 1200,
    damage: 27, headshotMult: 2.2, falloff: [12, 32, 0.55], rpm: 600, mag: 25, reserve: 100, reload: 2.6,
    spread: 0.014, adsSpread: 0.007, moveSpread: 0.022, bloom: 0.005, bloomMax: 0.045, bloomRecover: 0.3,
    recoil: [0.015, 0.01], adsFov: 58, knockback: 25, model: 'SubmachineGun_2', viewLen: 0.45, worldLen: 0.5, sound: 'smg_heavy',
  },

  // ---------------------------------------------------------------- fuzis
  ak47: {
    ...rifle, id: 'ak47', name: 'AK-47', price: 1900,
    damage: 36, headshotMult: 3.5, falloff: [25, 70, 0.72], rpm: 600, mag: 30, reserve: 120, reload: 2.5,
    spread: 0.009, adsSpread: 0.003, moveSpread: 0.05, bloom: 0.007, bloomMax: 0.06, bloomRecover: 0.25,
    recoil: [0.024, 0.014], adsFov: 52, knockback: 35, model: 'AssaultRifle_2', viewLen: 0.6, worldLen: 0.88, sound: 'ak',
  },
  m4: {
    ...rifle, id: 'm4', name: 'M4', price: 2100,
    damage: 31, headshotMult: 3.5, falloff: [25, 70, 0.7], rpm: 800, mag: 30, reserve: 120, reload: 2.2,
    spread: 0.007, adsSpread: 0.002, moveSpread: 0.04, bloom: 0.005, bloomMax: 0.05, bloomRecover: 0.3,
    recoil: [0.016, 0.011], adsFov: 50, knockback: 30, model: 'AssaultRifle2_1', viewLen: 0.58, worldLen: 0.84, sound: 'rifle',
  },
  hk416: {
    ...rifle, id: 'hk416', name: 'HK416', price: 2300,
    damage: 32, headshotMult: 3.5, falloff: [25, 70, 0.7], rpm: 760, mag: 30, reserve: 120, reload: 2.3,
    spread: 0.006, adsSpread: 0.0018, moveSpread: 0.04, bloom: 0.005, bloomMax: 0.05, bloomRecover: 0.3,
    recoil: [0.017, 0.01], adsFov: 50, knockback: 30, model: 'AssaultRifle2_3', viewLen: 0.52, worldLen: 0.74, sound: 'rifle',
  },

  // ---------------------------------------------------------------- escopetas
  sawedoff: {
    ...shotgun, id: 'sawedoff', name: 'Cano Serrado', price: 700,
    damage: 14, pellets: 10, headshotMult: 1.3, falloff: [4, 14, 0.2], rpm: 360, mag: 2, reserve: 24, reload: 2.3,
    spread: 0.11, adsSpread: 0.095, moveSpread: 0.02, recoil: [0.12, 0.03], adsFov: 66, knockback: 35,
    model: 'Shotgun_SawedOff', viewLen: 0.45, worldLen: 0.6, sound: 'shotgun_big',
  },
  pump: {
    ...shotgun, id: 'pump', name: 'Escopeta Pump', price: 900,
    damage: 15, pellets: 8, headshotMult: 1.4, falloff: [6, 22, 0.25], rpm: 68, mag: 6, reserve: 30, reload: 3.0,
    spread: 0.065, adsSpread: 0.05, moveSpread: 0.02, recoil: [0.08, 0.02], adsFov: 62, knockback: 28,
    model: 'Shotgun_1', viewLen: 0.62, worldLen: 0.95, sound: 'shotgun',
  },
  semishotgun: {
    ...shotgun, id: 'semishotgun', name: 'Escopeta Semiautomática', price: 1500,
    damage: 12, pellets: 7, headshotMult: 1.4, falloff: [6, 20, 0.25], rpm: 240, mag: 7, reserve: 35, reload: 3.2,
    spread: 0.07, adsSpread: 0.055, moveSpread: 0.02, recoil: [0.06, 0.02], adsFov: 62, knockback: 24,
    model: 'Shotgun_ShortStock', viewLen: 0.55, worldLen: 0.8, sound: 'shotgun',
  },

  // ---------------------------------------------------------------- pesadas
  rpg7: {
    id: 'rpg7', name: 'RPG-7', type: 'rocket', category: 'heavy', price: 3200, auto: false, pellets: 1,
    damage: 0, headshotMult: 1, explosive: { radius: 4.5, damage: 130, knock: 2.6 }, speed: 42, radius: 0.12, mass: 2,
    rpm: 40, mag: 1, reserve: 4, reload: 3.2, spread: 0.004, adsSpread: 0.002, moveSpread: 0.03,
    bloom: 0, bloomMax: 0, bloomRecover: 1, recoil: [0.05, 0.01], adsFov: 55, knockback: 0, ragdoll: true,
    model: 'proc:rpg', viewLen: 0.85, worldLen: 1.0, speedMult: 0.85, color: 0x556b2f, botRange: [8, 30], sound: 'rpg',
  },
  minigun: {
    id: 'minigun', name: 'Minigun', type: 'hitscan', category: 'heavy', price: 4000, auto: true, pellets: 1, range: 90,
    damage: 13, headshotMult: 2, falloff: [15, 45, 0.6], rpm: 2000, spinUp: 0.7, mag: 200, reserve: 200, reload: 5,
    spread: 0.035, adsSpread: 0.03, moveSpread: 0.03, bloom: 0, bloomMax: 0, bloomRecover: 1,
    recoil: [0.004, 0.01], adsFov: 70, knockback: 12, ragdoll: false,
    model: 'proc:minigun', viewLen: 0.6, worldLen: 0.95, speedMult: 0.6, botRange: [5, 22], sound: 'minigun',
  },
};

export const MELEE = {
  id: 'fists', name: 'Soco', type: 'melee',
  damage: 34, headshotMult: 1, range: 1.9, cooldown: 0.6, knockback: 140, ragdoll: true,
};

export const ARMORS = {
  vest: { id: 'vest', name: 'Colete Leve', price: 400, points: 25 },
  heavy: { id: 'heavy', name: 'Colete Pesado', price: 700, points: 50 },
};

/** Abas da loja (teclas 1–9 escolhem dentro da aba; Q/E trocam de aba). */
export const SHOP_TABS = [
  { id: 'pistol', name: 'Pistolas', items: ['glock', 'usp', 'revolver38', 'deagle'] },
  { id: 'smg', name: 'Submetralhadoras', items: ['mp7', 'mp5', 'ump45'] },
  { id: 'rifle', name: 'Fuzis', items: ['ak47', 'm4', 'hk416'] },
  { id: 'shotgun', name: 'Escopetas', items: ['sawedoff', 'pump', 'semishotgun'] },
  { id: 'heavy', name: 'Pesadas', items: ['rpg7', 'minigun'] },
  { id: 'gear', name: 'Colete', items: ['vest', 'heavy'] },
];
export const SHOP_ORDER = SHOP_TABS.flatMap((t) => t.items);

export function shopItem(id) {
  if (WEAPONS[id]) return { kind: 'weapon', ...WEAPONS[id] };
  if (ARMORS[id]) return { kind: 'armor', ...ARMORS[id] };
  return null;
}

/** Cooldown entre tiros (s) a partir do RPM. */
export const cooldownOf = (def) => 60 / (def.rpm || 60);

// =============================================================
//  Visuais dos personagens ("skins"). A física (hitbox) é a MESMA para
//  todos — só muda o que se vê. Cada peça do ragdoll tem um "suporte"
//  (THREE.Group) ligado ao corpo físico; aqui a gente enche esses suportes.
//
//  Variantes:
//    radio · fone · tv · mic   → objetos do programa (cor do jogador)
//    davi                      → o Davi: colete tático, headset, camiseta
//                                branca, luva sem dedo e o rosto da foto
// =============================================================

import * as THREE from 'three';

export const LOOKS = {
  radio: { name: 'RÁDIO', label: 'Rádio' },
  fone: { name: 'FONE', label: 'Fone' },
  tv: { name: 'TV', label: 'TV' },
  mic: { name: 'MICROFONE', label: 'Microfone' },
  davi: { name: 'DAVI', label: 'Davi', human: true },
};
export const LOOK_IDS = Object.keys(LOOKS);

// rosto do Davi: carregado só no navegador (os testes rodam sem imagem)
const FACE_MAT = new THREE.MeshStandardMaterial({ color: 0xb47a52, roughness: 0.85 });
let faceRequested = false;
export async function loadAvatarTextures() {
  if (faceRequested) return;
  faceRequested = true;
  const { AVATAR_URLS } = await import('./avatarAssets.js');
  const tex = await new THREE.TextureLoader().loadAsync(AVATAR_URLS['davi-face']);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; // pixelado de propósito (cara de PS1)
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  FACE_MAT.map = tex;
  FACE_MAT.color.set(0xffffff);
  FACE_MAT.needsUpdate = true;
}

const matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${opts.roughness ?? ''}|${opts.metalness ?? ''}|${opts.emissive ?? ''}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color, roughness: opts.roughness ?? 0.7, metalness: opts.metalness ?? 0,
      emissive: opts.emissive ?? 0x000000, flatShading: !!opts.flat,
    }));
  }
  return matCache.get(key);
}

function add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/**
 * Enche os suportes de cada peça com o visual da variante.
 * @param holders { torso, upperArmL, upperArmR, forearmL, forearmR, legL, legR } (THREE.Group)
 * @param dims    medidas da física (TORSO, UPPER_ARM, FOREARM, LEG)
 */
export function buildLook(variant, color, holders, dims) {
  for (const h of Object.values(holders)) {
    for (const c of [...h.children]) h.remove(c);
  }
  if (variant === 'davi') return buildDavi(holders, dims);
  return buildObject(variant, color, holders, dims);
}

// ------------------------------------------------------------------ objetos
function buildObject(variant, color, H, { TORSO, UPPER_ARM, FOREARM, LEG }) {
  const skin = mat(color, { roughness: 0.55 });
  const dark = mat(0x1e1d24, { roughness: 0.8 });
  const limb = mat(0xd9d9e0);
  const R = TORSO.radius;

  if (variant === 'tv') {
    // TV de tubo: caixa com tela e anteninha
    add(H.torso, box(R * 2, TORSO.height, R * 1.5), skin);
    add(H.torso, box(R * 1.5, TORSO.height * 0.62, 0.04), mat(0x10202a, { emissive: 0x0b3a4a, roughness: 0.2 }), -0.06, 0.06, -R * 0.75 - 0.01);
    add(H.torso, new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10), dark, 0.32, -0.16, -R * 0.75 - 0.02, Math.PI / 2);
    add(H.torso, new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10), dark, 0.32, -0.3, -R * 0.75 - 0.02, Math.PI / 2);
    add(H.torso, new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), dark, -0.12, 0.65, 0, 0, 0, 0.5);
    add(H.torso, new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), dark, 0.12, 0.65, 0, 0, 0, -0.5);
  } else {
    add(H.torso, new THREE.CylinderGeometry(R, R, TORSO.height, 24), skin);
    add(H.torso, box(0.5, 0.16, 0.06), dark, 0, 0.22, -R + 0.02); // "visor": pra onde o boneco olha
    if (variant === 'radio') {
      add(H.torso, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 24), dark, 0, -0.1, -R + 0.01, Math.PI / 2);
      const antenna = add(H.torso, new THREE.CylinderGeometry(0.015, 0.015, 0.75, 6), dark, 0.22, 0.75, 0.05, 0, 0, -0.35);
      add(antenna, new THREE.SphereGeometry(0.05, 10, 8), skin, 0, 0.38, 0);
    } else if (variant === 'fone') {
      add(H.torso, new THREE.TorusGeometry(0.46, 0.05, 8, 28, Math.PI), dark, 0, 0.12, 0);
      add(H.torso, new THREE.CylinderGeometry(0.17, 0.17, 0.12, 20), dark, -0.47, 0.1, 0, 0, 0, Math.PI / 2);
      add(H.torso, new THREE.CylinderGeometry(0.17, 0.17, 0.12, 20), dark, 0.47, 0.1, 0, 0, 0, Math.PI / 2);
    } else if (variant === 'mic') {
      // microfone de auditório: globo de grade em cima, anel no meio
      add(H.torso, new THREE.SphereGeometry(0.3, 14, 10), mat(0x9a9aa6, { metalness: 0.6, roughness: 0.35, flat: true }), 0, 0.6, 0);
      add(H.torso, new THREE.TorusGeometry(R + 0.01, 0.035, 8, 24), dark, 0, 0.05, 0, Math.PI / 2);
      add(H.torso, new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), mat(0xff3b30, { emissive: 0x550000 }), 0, -0.18, -R - 0.005, Math.PI / 2);
    }
  }
  for (const s of ['L', 'R']) {
    add(H[`upperArm${s}`], box(UPPER_ARM.half[0] * 2, UPPER_ARM.half[1] * 2, UPPER_ARM.half[2] * 2), limb);
    add(H[`forearm${s}`], box(FOREARM.half[0] * 2, FOREARM.half[1] * 2, FOREARM.half[2] * 2), limb);
    add(H[`leg${s}`], new THREE.CylinderGeometry(LEG.radius, LEG.radius, LEG.length, 10), limb);
  }
}

// ------------------------------------------------------------------ Davi
// Proporções "PS1": blocos simples, rosto da foto numa caixa.
// A física continua a mesma: a cabeça fica dentro da faixa de headshot.
function buildDavi(H, { TORSO, UPPER_ARM, FOREARM, LEG }) {
  const skin = mat(0xb47a52, { roughness: 0.85 });
  const hair = mat(0x2a211c, { roughness: 0.95 });
  const vest = mat(0x232a26, { roughness: 0.9 });
  const vestPanel = mat(0x34443a, { roughness: 0.9 });
  const shirt = mat(0xe8e8ea, { roughness: 0.9 });
  const patch = mat(0x3355aa, { roughness: 0.8 });
  const black = mat(0x141416, { roughness: 0.85 });
  const pants = mat(0x1c1d20, { roughness: 0.9 });
  const metal = mat(0xb8b8bc, { metalness: 0.7, roughness: 0.3 });
  const T = H.torso;
  const top = TORSO.height / 2; // 0.45

  // quadril, cinto e fivela
  add(T, box(0.6, 0.2, 0.34), pants, 0, -top + 0.1, 0);
  add(T, box(0.62, 0.065, 0.36), black, 0, -top + 0.215, 0);
  add(T, box(0.09, 0.055, 0.02), metal, 0, -top + 0.215, -0.185);
  // camiseta branca por baixo + colete tático
  add(T, box(0.6, 0.44, 0.32), shirt, 0, -0.03, 0);
  add(T, box(0.66, 0.42, 0.38), vest, 0, -0.04, 0);
  add(T, box(0.24, 0.3, 0.03), vestPanel, -0.15, -0.06, -0.195); // placas do colete
  add(T, box(0.24, 0.3, 0.03), vestPanel, 0.15, -0.06, -0.195);
  add(T, box(0.5, 0.06, 0.03), black, 0, -0.2, -0.198);           // faixa da barriga
  add(T, box(0.12, 0.08, 0.4), vest, -0.22, 0.2, 0);               // alças nos ombros
  add(T, box(0.12, 0.08, 0.4), vest, 0.22, 0.2, 0);
  add(T, box(0.62, 0.38, 0.03), vestPanel, 0, -0.05, 0.195);       // costas
  add(T, box(0.2, 0.05, 0.05), shirt, 0, 0.18, -0.12);             // gola branca
  // ombros (manga branca encaixando no braço)
  for (const side of [-1, 1]) add(T, box(0.2, 0.16, 0.2), shirt, side * 0.38, 0.12, 0);
  // pescoço e cabeça (rosto da foto na frente)
  add(T, new THREE.CylinderGeometry(0.075, 0.08, 0.07, 10), skin, 0, 0.205, 0);
  const headW = 0.25, headH = 0.29, headD = 0.27, headY = 0.32;
  add(T, box(headW, headH, headD), [skin, skin, hair, skin, hair, FACE_MAT], 0, headY, 0);
  // cabelo: topete, laterais e nuca
  add(T, box(headW + 0.025, 0.07, headD + 0.02), hair, 0, headY + headH / 2 + 0.015, 0.005);
  add(T, box(headW + 0.03, 0.12, 0.07), hair, 0, headY + 0.08, headD / 2 - 0.02);
  add(T, box(0.03, 0.1, headD * 0.7), hair, -headW / 2 - 0.004, headY + 0.08, 0.03);
  add(T, box(0.03, 0.1, headD * 0.7), hair, headW / 2 + 0.004, headY + 0.08, 0.03);
  add(T, box(0.03, 0.04, 0.05), skin, -headW / 2 - 0.01, headY, 0.02); // orelhas
  add(T, box(0.03, 0.04, 0.05), skin, headW / 2 + 0.01, headY, 0.02);
  // headset: arco por cima, concha na orelha direita e haste até a boca
  add(T, new THREE.TorusGeometry(headW / 2 + 0.035, 0.012, 6, 16, Math.PI), black, 0, headY + 0.06, 0.02);
  add(T, new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), black, headW / 2 + 0.03, headY + 0.01, 0.02, 0, 0, Math.PI / 2);
  add(T, box(0.012, 0.012, 0.15), black, headW / 2 + 0.035, headY - 0.05, -0.07, 0.45, 0, 0);
  add(T, new THREE.SphereGeometry(0.018, 8, 6), black, headW / 2 - 0.01, headY - 0.08, -0.145);

  for (const s of ['L', 'R']) {
    const side = s === 'L' ? -1 : 1;
    // braço: manga branca com emblema, depois pele
    const ua = H[`upperArm${s}`];
    const uh = UPPER_ARM.half[1];
    add(ua, box(0.12, 0.16, 0.12), shirt, 0, uh - 0.08, 0);
    add(ua, box(0.012, 0.07, 0.07), patch, side * 0.062, uh - 0.08, 0);
    add(ua, box(0.095, uh * 2 - 0.15, 0.095), skin, 0, -0.075, 0);
    // antebraço + luva sem dedo
    const fa = H[`forearm${s}`];
    const fh = FOREARM.half[1];
    add(fa, box(0.09, fh * 2 - 0.1, 0.09), skin, 0, 0.05, 0);
    add(fa, box(0.105, 0.12, 0.105), black, 0, -fh + 0.06, 0);
    add(fa, box(0.07, 0.035, 0.06), skin, 0, -fh - 0.005, -0.01); // pontinha dos dedos
    // perna: calça escura e bota
    const lg = H[`leg${s}`];
    add(lg, new THREE.CylinderGeometry(LEG.radius + 0.02, LEG.radius + 0.01, LEG.length - 0.1, 10), pants, 0, 0.05, 0);
    add(lg, box(0.15, 0.11, 0.24), black, 0, -LEG.length / 2 + 0.045, -0.04);
  }
}

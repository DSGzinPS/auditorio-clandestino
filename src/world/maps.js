// Mapas do jogo. Cada mapa: tamanho, spawns de minigame, distância dos spawns
// de PvP e uma função build(arena) que monta tudo com os construtores do Arena.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const V = (x, y, z) => new CANNON.Vec3(x, y, z);
const boxShape = (w, h, d, ox = 0, oy = 0, oz = 0) => ({ shape: new CANNON.Box(V(w / 2, h / 2, d / 2)), offset: V(ox, oy, oz) });

/**
 * "Salas de spawn": nos dois fundos do mapa, uma parede com 2 portas e um divisor
 * no meio → 4 salas (uma por canto). Ninguém nasce vendo ninguém.
 * As portas do lado de trás são o espelho (ponto) das da frente: justo pros dois times.
 * @param doors centros X das portas do lado +Z [salaEsquerda, salaDireita]
 */
function spawnRooms(a, { zIn, doors, h = 4, door = 3.6, color, trim, crate }) {
  const W = a.W, D = a.D;
  for (const s of [1, -1]) {
    const gaps = doors.map((x) => [s * x - door / 2, s * x + door / 2]).sort((u, v) => u[0] - v[0]);
    let x0 = -W / 2;
    for (const [g0, g1] of [...gaps, [W / 2, W / 2]]) {
      if (g0 - x0 > 0.05) a.box(g0 - x0, h, 0.6, (x0 + g0) / 2, h / 2, s * zIn, color);
      x0 = g1;
    }
    // batente colorido em cima das portas
    for (const [g0, g1] of gaps) a.box(g1 - g0, 0.5, 0.7, (g0 + g1) / 2, h - 0.25, s * zIn, trim, { cast: false });
    const depth = D / 2 - zIn;
    a.box(0.6, h, depth, 0, h / 2, s * (zIn + depth / 2), color); // divisor entre as duas salas
    // uma caixa em cada sala pra ninguém ficar de bobeira na porta
    for (const sx of [-1, 1]) a.box(1.4, 1.2, 1.4, sx * W / 4 + sx * 3, 0.6, s * (zIn + depth * 0.35), crate);
  }
}

export const MAPS = {
  // ------------------------------------------------------------------ ESTÚDIO
  // Palco do quiz e do pedra-papel-tesoura; PvP da etapa 2.
  estudio: {
    name: 'Estúdio',
    size: { W: 40, D: 46, H: 10 },
    background: 0x15121c,
    // quiz/pedra-papel-tesoura: púlpitos no palco do meio (vagas 0 e 2 de um lado, 1 e 3 do outro)
    spawns: [{ x: -2.2, z: 8, yaw: 0 }, { x: 2.2, z: -8, yaw: Math.PI }, { x: 2.2, z: 8, yaw: 0 }, { x: -2.2, z: -8, yaw: Math.PI }],
    rooms: { zIn: 13 },
    build(a) {
      a.shell({ floor: 0x55535e, wall: 0x3b3846, ceil: 0x2a2733 });
      const prop = 0x8a8796, podium = 0xffd23f, set = 0x4a4658;
      for (const [x, z] of [[-2.2, 6.6], [2.2, 6.6], [-2.2, -6.6], [2.2, -6.6]]) a.box(1.6, 1.1, 0.6, x, 0.55, z, podium); // púlpitos
      spawnRooms(a, { zIn: 13, doors: [-15, 7], color: set, trim: 0xff2e88, crate: prop });
      // palco: caixas, colunas e painéis de cenário (cobertura no meio)
      a.box(2, 2, 2, -8, 1, 0, prop);
      a.box(2, 2, 2, 8, 1, 0, prop);
      a.box(3, 1.4, 1, -12, 0.7, -6, prop);
      a.box(3, 1.4, 1, 12, 0.7, 6, prop);
      a.box(1, 3.5, 1, -5, 1.75, -3, prop);
      a.box(1, 3.5, 1, 5, 1.75, 3, prop);
      a.box(5, 3, 0.4, -14, 1.5, 4, set);
      a.box(5, 3, 0.4, 14, 1.5, -4, set);
      a.box(0.4, 3, 5, -17, 1.5, -2, set);
      a.box(0.4, 3, 5, 17, 1.5, 2, set);
      a.lights();
      const title = [['PROGRAMA DE AUDITÓRIO', 76], ['CLANDESTINO', 104]];
      a.sign(title, { x: -a.W / 2 + 0.02, z: 0, rotY: Math.PI / 2 });
      a.sign(title, { x: a.W / 2 - 0.02, z: 0, rotY: -Math.PI / 2 });
    },
  },

  // ------------------------------------------------------------------ BASTIDORES (etapa 4)
  // Mais apertado: corredores, caixotes, barra giratória no centro e paredes que deslizam.
  bastidores: {
    name: 'Bastidores',
    size: { W: 44, D: 52, H: 7 },
    background: 0x0d0b10,
    spawns: [{ x: -2.2, z: 6, yaw: 0 }, { x: 2.2, z: -6, yaw: Math.PI }, { x: 2.2, z: 6, yaw: 0 }, { x: -2.2, z: -6, yaw: Math.PI }],
    rooms: { zIn: 15 },
    build(a) {
      a.shell({ floor: 0x4a3c33, wall: 0x2b2a30, ceil: 0x1d1b20 });
      const crate = 0x9c7a4f, wallc = 0x5a5560;
      spawnRooms(a, { zIn: 15, doors: [-6, 16], color: wallc, trim: 0xff8a3d, crate });
      // corredores escalonados
      a.box(0.6, 3, 10, -9, 1.5, -7, wallc);
      a.box(0.6, 3, 10, 9, 1.5, 7, wallc);
      a.box(10, 3, 0.6, -14, 1.5, 5, wallc);
      a.box(10, 3, 0.6, 14, 1.5, -5, wallc);
      a.box(0.6, 3, 7, -17, 1.5, -9, wallc);
      a.box(0.6, 3, 7, 17, 1.5, 9, wallc);
      // caixotes
      for (const [x, z, s] of [[-3, 10, 1.5], [3, -10, 1.5], [-12, 11, 1.5], [12, -11, 1.5], [-14, -1, 2], [14, 1, 2],
        [-5, -12, 1.2], [5, 12, 1.2], [11, 9, 1.5], [-11, -9, 1.5], [-19, 8, 1.5], [19, -8, 1.5]]) {
        a.box(s, s, s, x, s / 2, z, crate);
      }
      a.box(1.5, 1.5, 1.5, 11, 2.25, 9, crate); // pilha
      a.box(1.5, 1.5, 1.5, -11, 2.25, -9, crate);
      // eixo central + barra giratória (derruba quem estiver no caminho)
      a.box(1, 2.4, 1, 0, 1.2, 0, 0xff2e88);
      const barMesh = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 0.5), a.mat(0xffd23f, { emissive: 0x332200 }));
      a.mover({ kind: 'spin', shapes: [boxShape(11, 0.5, 0.5)], mesh: barMesh, y: 0.6, speed: 1.1, knock: 1 });
      // paredes deslizantes na frente das portas
      for (const [z, phase] of [[12.5, 0], [-12.5, Math.PI]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 0.6), a.mat(0x3dd6ff, { emissive: 0x002233 }));
        a.mover({ kind: 'slide', shapes: [boxShape(4, 2.2, 0.6)], mesh: m, x: 0, y: 1.1, z, amplitude: 9, period: 6, phase, knock: 0.7 });
      }
      a.lights({ hemi: 0.8, key: 1.2, colors: [0xff8a3d, 0x8a5cff, 0xff2e88, 0x3dd6ff], point: 45 });
      a.sign([['BASTIDORES', 110]], { x: -a.W / 2 + 0.02, z: 0, y: 4.6, rotY: Math.PI / 2, w: 8, h: 2, bg: '#2b2a30', fg: '#ff8a3d' });
      a.sign([['BASTIDORES', 110]], { x: a.W / 2 - 0.02, z: 0, y: 4.6, rotY: -Math.PI / 2, w: 8, h: 2, bg: '#2b2a30', fg: '#ff8a3d' });
    },
  },

  // ------------------------------------------------------------------ QUADRA (etapa 5)
  quadra: {
    name: 'Quadra',
    size: { W: 18, D: 30, H: 11 },
    background: 0x111a24,
    spawns: [{ x: -1.5, z: 6, yaw: 0 }, { x: 1.5, z: -6, yaw: Math.PI }, { x: 1.5, z: 6, yaw: 0 }, { x: -1.5, z: -6, yaw: Math.PI }],
    pvpZ: 10,
    build(a) {
      a.shell({ floor: 0x9a6a3c, wall: 0x2e3a48, ceil: 0x1b232c, grid: false });
      // linhas da quadra
      a.decal(a.W - 1, 0.02, 0.12, 0, 0.011, 0, 0xffffff);
      a.decal(0.12, 0.02, a.D - 1, -a.W / 2 + 0.5, 0.011, 0, 0xffffff);
      a.decal(0.12, 0.02, a.D - 1, a.W / 2 - 0.5, 0.011, 0, 0xffffff);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.06, 6, 40), a.mat(0xffffff));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.012;
      a.group.add(ring);
      // cestas: tabela + aro de esferas (a bola bate no aro de verdade)
      a.extras.hoops = [];
      for (const side of [-1, 1]) {
        const zb = side * 13.7;
        a.box(0.25, 3.4, 0.25, 0, 1.7, side * 14.3, 0x555555); // poste
        a.box(2, 1.2, 0.12, 0, 3.55, zb, 0xffffff);              // tabela
        a.decal(0.7, 0.5, 0.02, 0, 3.4, zb - side * 0.07, 0xff3b30);
        const center = { x: 0, y: 3.05, z: side * 13.0 };
        const R = 0.62;
        for (let i = 0; i < 14; i++) {
          const t = (i / 14) * Math.PI * 2;
          a.sphere(0.05, center.x + Math.cos(t) * R, center.y, center.z + Math.sin(t) * R, 0xff6a00);
        }
        a.box(0.1, 0.1, 0.55, 0, center.y, side * 13.45, 0xff6a00, { cast: false }); // haste do aro
        // a cesta do lado NEGATIVO é o alvo do time 0 (que nasce no lado positivo)
        a.extras.hoops.push({ center, radius: R, forTeam: side < 0 ? 0 : 1 });
      }
      a.lights({ hemi: 1.2, key: 1.4, colors: [0xffffff, 0xffd23f, 0xffffff, 0x3dd6ff], point: 50 });
      a.sign([['BASQUETE COM BOLA-BOMBA', 88]], { x: -a.W / 2 + 0.02, z: 0, y: 6, rotY: Math.PI / 2, w: 10, h: 2.2, bg: '#ff6a00', fg: '#111111' });
      a.sign([['BASQUETE COM BOLA-BOMBA', 88]], { x: a.W / 2 - 0.02, z: 0, y: 6, rotY: -Math.PI / 2, w: 10, h: 2.2, bg: '#ff6a00', fg: '#111111' });
    },
  },

  // ------------------------------------------------------------------ RUA (etapa 6)
  // "Sapo atravessando a rua": carros só derrubam. Quem mata é tiro.
  rua: {
    name: 'Rua',
    size: { W: 60, D: 52, H: 12 },
    background: 0x6fa8dc,
    spawns: [{ x: -2.2, z: 14, yaw: 0 }, { x: 2.2, z: -14, yaw: Math.PI }, { x: 2.2, z: 14, yaw: 0 }, { x: -2.2, z: -14, yaw: Math.PI }],
    rooms: { zIn: 17 },
    build(a) {
      a.shell({ floor: 0x8a8a8a, wall: 0x3a3f47, ceil: 0x6fa8dc, ceilingVisible: false, grid: false });
      // calçadas e asfalto (só visual; o chão físico é um só)
      a.decal(a.W, 0.04, 23.4, 0, 0.02, 0, 0x2c2c30);
      a.decal(a.W, 0.06, 2, 0, 0.03, 0, 0xb5b5b5); // canteiro central
      for (const side of [-1, 1]) {
        for (const lane of [4.5, 8]) {
          for (let x = -a.W / 2 + 1; x < a.W / 2; x += 4) a.decal(2, 0.05, 0.15, x + 1, 0.045, side * lane, 0xf2f2f2);
        }
        a.decal(a.W, 0.05, 0.2, 0, 0.045, side * 11.6, 0xffd23f);
        // faixa de pedestre
        for (let k = -3; k <= 3; k++) a.decal(0.6, 0.05, 22, side * 18 + k * 1.1, 0.04, 0, 0xeeeeee);
      }
      // "lojas" nos dois lados da rua = salas de spawn
      spawnRooms(a, { zIn: 17, doors: [-20, 9], h: 4.5, color: 0xc9b79c, trim: 0x2e7d32, crate: 0x6d4c41 });
      for (const s of [1, -1]) {
        a.decal(a.W, 0.6, 0.65, 0, 5, s * 17, 0x8d6e63); // marquise
      }
      // carros: 3 faixas de cada lado, sentidos alternados
      const lanes = [
        { z: 2.75, speed: 8 }, { z: 6.25, speed: -11 }, { z: 9.75, speed: 14 },
        { z: -2.75, speed: -9 }, { z: -6.25, speed: 12 }, { z: -9.75, speed: -7 },
      ];
      const colors = [0xff3b30, 0x34c759, 0x007aff, 0xffcc00, 0xaf52de, 0xff9500, 0x5ac8fa];
      const limit = a.W / 2 + 2;
      let n = 0;
      for (const l of lanes) {
        for (let k = 0; k < 3; k++) {
          const color = colors[n++ % colors.length];
          const g = new THREE.Group();
          const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.1, 1.9), a.mat(color, { roughness: 0.5 }));
          const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 1.7), a.mat(0x1d2530, { roughness: 0.3 }));
          cabin.position.set(-0.2, 0.9, 0);
          for (const wx of [-1.25, 1.25]) for (const wz of [-0.95, 0.95]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12), a.mat(0x111111));
            wheel.rotation.x = Math.PI / 2;
            wheel.position.set(wx, -0.5, wz);
            g.add(wheel);
          }
          g.add(body, cabin);
          if (l.speed < 0) g.rotation.y = Math.PI;
          a.mover({
            kind: 'car', mesh: g, x: -limit + k * (limit * 2 / 3) + (n % 3) * 4, y: 0.9, z: l.z, speed: l.speed, limit, knock: 1.3,
            shapes: [boxShape(3.8, 1.1, 1.9), boxShape(2, 0.75, 1.7, -0.2, 0.9, 0)],
          });
        }
      }
      // coberturas: pontos de ônibus, bancas, lixeiras, vasos no canteiro
      const stop = 0x3a6ea5, bin = 0x2e7d32, planter = 0x6d4c41, kiosk = 0xd84315;
      for (const side of [-1, 1]) {
        a.box(3.5, 2.4, 0.4, -12 * side, 1.2, side * 14.2, stop);
        a.box(3.5, 2.4, 0.4, 14 * side, 1.2, side * 14.2, stop);
        a.box(2.2, 2.6, 2.2, 2 * side, 1.3, side * 14.2, kiosk); // banca de jornal
        for (const x of [-24, -6, 22]) a.box(0.8, 1.1, 0.8, x * side, 0.55, side * 13, bin);
      }
      for (const x of [-21, -12, -4, 4, 12, 21]) a.box(1.6, 1.1, 1, x, 0.55, 0, planter);
      // "túneis" por onde os carros entram e saem
      for (const sx of [-1, 1]) a.decal(0.3, 3, 23.4, sx * (a.W / 2 - 0.1), 1.5, 0, 0x111111);
      a.lights({ hemi: 1.5, key: 2.2, colors: [0xffffff], point: 0 });
    },
  },
};

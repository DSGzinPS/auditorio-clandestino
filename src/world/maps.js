// Mapas do jogo. Cada mapa: tamanho, spawns de minigame, distância dos spawns
// de PvP e uma função build(arena) que monta tudo com os construtores do Arena.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const V = (x, y, z) => new CANNON.Vec3(x, y, z);
const boxShape = (w, h, d, ox = 0, oy = 0, oz = 0) => ({ shape: new CANNON.Box(V(w / 2, h / 2, d / 2)), offset: V(ox, oy, oz) });

export const MAPS = {
  // ------------------------------------------------------------------ ESTÚDIO
  // Palco do quiz e do pedra-papel-tesoura; PvP da etapa 2.
  estudio: {
    name: 'Estúdio',
    size: { W: 26, D: 30, H: 9 },
    background: 0x15121c,
    spawns: [{ x: 0, z: 8, yaw: 0 }, { x: 0, z: -8, yaw: Math.PI }],
    pvpZ: 12.5,
    build(a) {
      a.shell({ floor: 0x55535e, wall: 0x3b3846, ceil: 0x2a2733 });
      const prop = 0x8a8796, podium = 0xffd23f;
      a.box(1.6, 1.1, 0.6, 0, 0.55, 6.6, podium); // púlpitos
      a.box(1.6, 1.1, 0.6, 0, 0.55, -6.6, podium);
      a.box(2, 2, 2, -6, 1, 0, prop);
      a.box(2, 2, 2, 6, 1, 0, prop);
      a.box(3, 1.4, 1, -5, 0.7, -9, prop);
      a.box(3, 1.4, 1, 5, 0.7, 9, prop);
      a.box(1, 3.5, 1, -2.5, 1.75, -3, prop);
      a.box(1, 3.5, 1, 2.5, 1.75, 3, prop);
      a.lights();
      const title = [['PROGRAMA DE AUDITÓRIO', 76], ['CLANDESTINO', 104]];
      a.sign(title, { z: -a.D / 2 + 0.02 });
      a.sign(title, { z: a.D / 2 - 0.02, rotY: Math.PI });
    },
  },

  // ------------------------------------------------------------------ BASTIDORES (etapa 4)
  // Mais apertado: corredores, caixotes, barra giratória no centro e paredes que deslizam.
  bastidores: {
    name: 'Bastidores',
    size: { W: 30, D: 34, H: 7 },
    background: 0x0d0b10,
    spawns: [{ x: 0, z: 15, yaw: 0 }, { x: 0, z: -15, yaw: Math.PI }],
    pvpZ: 15,
    build(a) {
      a.shell({ floor: 0x4a3c33, wall: 0x2b2a30, ceil: 0x1d1b20 });
      const crate = 0x9c7a4f, wallc = 0x5a5560;
      // corredores escalonados
      a.box(0.6, 3, 9, -7, 1.5, -6, wallc);
      a.box(0.6, 3, 9, 7, 1.5, 6, wallc);
      a.box(9, 3, 0.6, -9, 1.5, 5, wallc);
      a.box(9, 3, 0.6, 9, 1.5, -5, wallc);
      // caixotes
      for (const [x, z, s] of [[-3, 9, 1.5], [3, -9, 1.5], [-11, 12, 1.5], [11, -12, 1.5], [-12, -1, 2], [12, 1, 2],
        [-4, -13, 1.2], [4, 13, 1.2], [10, 9, 1.5], [-10, -9, 1.5]]) {
        a.box(s, s, s, x, s / 2, z, crate);
      }
      a.box(1.5, 1.5, 1.5, 10, 2.25, 9, crate); // pilha
      a.box(1.5, 1.5, 1.5, -10, 2.25, -9, crate);
      // eixo central + barra giratória (derruba quem estiver no caminho)
      a.box(1, 2.4, 1, 0, 1.2, 0, 0xff2e88);
      const barMesh = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 0.5), a.mat(0xffd23f, { emissive: 0x332200 }));
      a.mover({ kind: 'spin', shapes: [boxShape(11, 0.5, 0.5)], mesh: barMesh, y: 0.6, speed: 1.1, knock: 1 });
      // paredes deslizantes na saída dos spawns
      for (const [z, phase] of [[11, 0], [-11, Math.PI]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 0.6), a.mat(0x3dd6ff, { emissive: 0x002233 }));
        a.mover({ kind: 'slide', shapes: [boxShape(4, 2.2, 0.6)], mesh: m, x: 0, y: 1.1, z, amplitude: 7, period: 6, phase, knock: 0.7 });
      }
      a.lights({ hemi: 0.8, key: 1.2, colors: [0xff8a3d, 0x8a5cff, 0xff2e88, 0x3dd6ff], point: 45 });
      a.sign([['BASTIDORES', 110]], { z: -a.D / 2 + 0.02, y: 4.6, w: 8, h: 2, bg: '#2b2a30', fg: '#ff8a3d' });
      a.sign([['BASTIDORES', 110]], { z: a.D / 2 - 0.02, y: 4.6, rotY: Math.PI, w: 8, h: 2, bg: '#2b2a30', fg: '#ff8a3d' });
    },
  },

  // ------------------------------------------------------------------ QUADRA (etapa 5)
  quadra: {
    name: 'Quadra',
    size: { W: 18, D: 30, H: 11 },
    background: 0x111a24,
    spawns: [{ x: 0, z: 6, yaw: 0 }, { x: 0, z: -6, yaw: Math.PI }],
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
    size: { W: 40, D: 36, H: 12 },
    background: 0x6fa8dc,
    spawns: [{ x: 0, z: 15.5, yaw: 0 }, { x: 0, z: -15.5, yaw: Math.PI }],
    pvpZ: 15.5,
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
      }
      // carros: 3 faixas de cada lado, sentidos alternados
      const lanes = [
        { z: 2.75, speed: 8 }, { z: 6.25, speed: -11 }, { z: 9.75, speed: 14 },
        { z: -2.75, speed: -9 }, { z: -6.25, speed: 12 }, { z: -9.75, speed: -7 },
      ];
      const colors = [0xff3b30, 0x34c759, 0x007aff, 0xffcc00, 0xaf52de, 0xff9500, 0x5ac8fa];
      let n = 0;
      for (const l of lanes) {
        for (let k = 0; k < 2; k++) {
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
            kind: 'car', mesh: g, x: -22 + k * 22 + (n % 3) * 4, y: 0.9, z: l.z, speed: l.speed, limit: 22, knock: 1.3,
            shapes: [boxShape(3.8, 1.1, 1.9), boxShape(2, 0.75, 1.7, -0.2, 0.9, 0)],
          });
        }
      }
      // coberturas: pontos de ônibus, lixeiras, vasos no canteiro
      const stop = 0x3a6ea5, bin = 0x2e7d32, planter = 0x6d4c41;
      for (const side of [-1, 1]) {
        a.box(3, 2.4, 0.4, -9, 1.2, side * 14.5, stop);
        a.box(3, 2.4, 0.4, 9, 1.2, side * 14.5, stop);
        a.box(0.8, 1.1, 0.8, -15, 0.55, side * 13, bin);
        a.box(0.8, 1.1, 0.8, 15, 0.55, side * 13, bin);
        a.box(0.8, 1.1, 0.8, 4.5, 0.55, side * 16.5, bin);
      }
      for (const x of [-14, -5, 5, 14]) a.box(1.6, 1.1, 1, x, 0.55, 0, planter);
      // "túneis" por onde os carros entram e saem
      for (const sx of [-1, 1]) a.decal(0.3, 3, 23.4, sx * (a.W / 2 - 0.1), 1.5, 0, 0x111111);
      a.lights({ hemi: 1.5, key: 2.2, colors: [0xffffff], point: 0 });
    },
  },
};

// Agarrão (agarrar, arrastar e arremessar), 4 jogadores e caminho dos bots nos mapas grandes.
// Uso: node tests/grab-sim.mjs
import { Game } from '../src/core/Game.js';
import { GameStates } from '../src/core/StateMachine.js';
import { blankIntent } from '../src/core/Controls.js';
import { CONFIG } from '../src/config.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✔' : '✘'} ${msg}`); if (!ok) fails++; };
const dt = 1 / 60;

function arena() {
  const g = new Game(null, null, { headless: true, bots: [] });
  g.flow.skipToPvp();
  g.sm.change(GameStates.ROUND);
  const [a, b] = g.players;
  a.teleport({ x: 0, y: 0, z: 4 }, 0);
  b.teleport({ x: 0, y: 0, z: 2.6 }, Math.PI);
  a.weapon.equip('usp');
  const intents = [blankIntent(), blankIntent()];
  g.schemes = [{ read: () => intents[0] }, { read: () => intents[1] }];
  const run = (sec, each) => { for (let f = 0; f < sec * 60; f++) { each?.(f); g.step(dt); intents.forEach((it) => Object.assign(it, blankIntent())); } };
  return { g, a, b, intents, run };
}

console.log('=== Agarrão ===');
{
  const { g, a, b, intents, run } = arena();
  run(0.2);
  let shots = 0;
  a.weapon.onFire = () => shots++;
  intents[0].grab = true;
  run(0.1);
  check(g.grab.holding(a) === b && b.mode === 'ragdoll', 'E perto e de frente: agarrou (ele virou ragdoll)');
  // anda pra frente segurando: o agarrado vai junto
  run(1.2, () => { intents[0].moveZ = 1; });
  const ax = a.controller.position, bt = b.parts.torso.body.position;
  const gap = Math.hypot(ax.x - bt.x, ax.z - bt.z);
  check(g.grab.holding(a) === b && gap < 2.2 && a.controller.position.z < 2, `arrastou junto (distância ${gap.toFixed(2)} m)`);
  // clique = arremesso, não tiro
  intents[0].fire = true;
  run(0.05);
  const v = b.parts.torso.body.velocity;
  check(!g.grab.holding(a) && Math.hypot(v.x, v.z) > 8 && shots === 0, `clique arremessou a ${Math.hypot(v.x, v.z).toFixed(1)} m/s (sem disparar a arma)`);
  run(4);
  check(b.mode === 'controlled', 'arremessado levanta depois');
}
{
  const { g, a, b, intents, run } = arena();
  run(0.2);
  intents[0].grab = true;
  run(0.1);
  let t = 0;
  run(5, (f) => { t = f / 60; if (f % 6 === 0) intents[1].jump = true; });
  check(!g.grab.holding(a), 'agarrado se debatendo (pulando) escapa antes do tempo');
}
{
  const { g, a, b, intents, run } = arena();
  b.teleport({ x: 0, y: 0, z: 8 }, Math.PI); // atrás de quem agarra
  run(0.2);
  intents[0].grab = true;
  run(0.1);
  check(!g.grab.holding(a), 'não agarra quem está atrás de você');
}
{
  const g = new Game(null, null, { headless: true, bots: [] });
  g.flow.newMatch(); // quiz: ninguém agarra ninguém
  const intents = [blankIntent(), blankIntent()];
  g.schemes = [{ read: () => ({ ...intents[0], grab: true }) }, { read: () => intents[1] }];
  for (let f = 0; f < 30; f++) g.step(dt);
  check(!g.grab.holding(g.players[0]), 'no quiz não dá pra agarrar');
}

console.log('\n=== 4 jogadores ===');
{
  const g = new Game(null, null, { headless: true, bots: [0, 1, 2, 3], count: 4, teamMode: 'teams' });
  check(g.players.length === 4 && g.players.map((p) => p.team).join() === '0,1,0,1', `2 contra 2: times ${g.players.map((p) => p.team).join(',')}`);
  g.flow.skipToPvp();
  g.sm.change(GameStates.BUY);
  const pos = g.players.map((p) => p.controller.position);
  const d02 = Math.hypot(pos[0].x - pos[2].x, pos[0].z - pos[2].z), d01 = Math.hypot(pos[0].x - pos[1].x, pos[0].z - pos[1].z);
  check(d02 < 4 && d01 > 25, `colegas nascem juntos (${d02.toFixed(1)} m), adversários longe (${d01.toFixed(1)} m)`);

  const f = new Game(null, null, { headless: true, bots: [0, 1, 2, 3], count: 4, teamMode: 'ffa' });
  f.flow.skipToPvp();
  f.sm.change(GameStates.BUY);
  const fp = f.players.map((p) => p.controller.position);
  let minD = Infinity;
  for (let i = 0; i < 4; i++) for (let k = i + 1; k < 4; k++) minD = Math.min(minD, Math.hypot(fp[i].x - fp[k].x, fp[i].z - fp[k].z));
  check(new Set(f.players.map((p) => p.team)).size === 4 && minD > 15, `cada um por si: 4 times, cada um numa sala (mais perto: ${minD.toFixed(1)} m)`);
  const off = new Game(null, null, { headless: true, bots: [0, 1], count: 2 });
  check(off.allPlayers[3].controller.position.y < -40 && off.players.length === 2, 'vagas sobrando ficam fora do mapa');
}

console.log('\n=== Partida inteira com 4 bots ===');
for (const teamMode of ['teams', 'ffa']) {
  const g = new Game(null, null, { headless: true, bots: [0, 1, 2, 3], count: 4, teamMode });
  g.flow.newMatch();
  const seen = new Set();
  let t = 0;
  const limit = teamMode === 'teams' ? 1500 : 400;
  while (t < limit && !g.sm.is(GameStates.MATCH_END)) {
    g.step(dt);
    t += dt;
    seen.add(g.sm.currentName);
    if (teamMode === 'ffa' && g.flow.stageIndex >= 2) break; // cada um por si: até o pedra-papel-tesoura
  }
  const m = g.flow.match;
  if (teamMode === 'teams') {
    check(g.sm.is(GameStates.MATCH_END), `2 contra 2: partida inteira terminou em ${Math.round(t)} s · placar ${JSON.stringify(m.roundsWon)}`);
  } else {
    check(g.flow.stageIndex >= 2 && seen.has(GameStates.ROUND), `cada um por si: quiz + PvP rodaram (${m.totalRounds} rounds, kills ${m.kills.join('/')})`);
  }
}

console.log('\n=== Bots acham o caminho nos mapas grandes ===');
for (const map of ['estudio', 'bastidores', 'rua']) {
  const g = new Game(null, null, { headless: true, bots: [1] });
  g.schemes[0] = { read: () => blankIntent() };
  g.flow.skipToPvp();
  g.arena.setMap(map);
  const [a, b] = g.players;
  a.weapon.equip('none');
  b.weapon.equip('ak47');
  g.sm.change(GameStates.ROUND);
  const sa = g.arena.pvpSpawn(a, 0), sb = g.arena.pvpSpawn(b, 0);
  a.teleport(sa.position, sa.yaw);
  b.teleport(sb.position, sb.yaw);
  a.hp = 1e9;
  let t = 0, first = null;
  b.weapon.onFire = () => { if (first === null) first = t; };
  while (t < 45 && first === null) { g.step(dt); t += dt; }
  check(first !== null, `${map}: o bot saiu da sala e achou você em ${first?.toFixed(1) ?? '—'} s`);
}

console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo.');
process.exit(fails ? 1 : 0);

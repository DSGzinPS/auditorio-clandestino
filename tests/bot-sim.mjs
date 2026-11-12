// Teste headless do bot dentro do jogo de verdade (Game headless).
// P1 = "humano" parado (sem input) · P2 = bot. Uso: node tests/bot-sim.mjs
import { Game } from '../src/core/Game.js';
import { GameStates } from '../src/core/StateMachine.js';
import { applyBotPreset } from '../src/ai/BotController.js';
import { blankIntent } from '../src/core/Controls.js';
import { CONFIG } from '../src/config.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✔' : '✘'} ${msg}`); if (!ok) fails++; };
const dt = 1 / 60;

/** Coloca direto num round de PvP, com a arma escolhida para cada lado. */
function roundSetup({ botWeapon = 'pistol', humanIntent = () => blankIntent(), level = 'normal' } = {}) {
  applyBotPreset(level);
  const g = new Game(null, null, { headless: true, bots: [1] });
  g.schemes[0] = { read: humanIntent };
  g.flow.skipToPvp();              // → BUY
  g.players[1].weapon.equip(botWeapon);
  g.sm.change(GameStates.ROUND);   // pula a loja
  return g;
}

function run(g, seconds, until = () => false) {
  for (let f = 0; f < seconds * 60; f++) {
    g.step(dt);
    if (until()) return f / 60;
  }
  return null;
}

// 1) Quiz: responde a tempo, com a precisão configurada
{
  applyBotPreset('normal');
  const g = new Game(null, null, { headless: true, bots: [1] });
  const bot = g.schemes[1];
  g.sm.current = { }; g.sm.currentName = GameStates.QUIZ;
  let right = 0, answered = 0;
  for (let n = 0; n < 200; n++) {
    const q = { correctIndex: Math.random() < 0.5 ? 0 : 1 };
    bot.onQuizStart(q);
    for (let f = 0; f < CONFIG.quiz.timeLimit * 60; f++) {
      const it = bot.read(dt);
      if (it.answer !== null) { answered++; if (it.answer === q.correctIndex) right++; break; }
    }
  }
  check(answered === 200, 'respondeu as 200 perguntas antes do tempo');
  check(Math.abs(right / 200 - CONFIG.bot.quizAccuracy) < 0.12, `acerto ≈ ${CONFIG.bot.quizAccuracy} (obtido ${(right / 200).toFixed(2)})`);
}

// 2) Mata um alvo parado em cada dificuldade
for (const level of ['facil', 'normal', 'dificil']) {
  const g = roundSetup({ level, botWeapon: 'pistol' });
  const t = run(g, 60, () => g.players[0].dead);
  check(t !== null, `[${level}] pistola: matou você parado em ${t?.toFixed(1)} s`);
}

// 3) Sem arma (patinho jogado) → vai pra cima e soca
{
  const g = roundSetup({ botWeapon: 'none' });
  g.players[0].teleport({ x: 0, y: 0, z: 2 }, 0);
  g.players[1].teleport({ x: 0, y: 0, z: -6 }, Math.PI);
  let punches = 0;
  g.damage.onHit = (ctx) => { if (ctx.kind === 'melee') punches++; };
  const t = run(g, 40, () => g.players[0].dead);
  check(punches > 0 && t !== null, `de mãos vazias: ${punches} socos, te derrubou em ${t?.toFixed(1)} s`);
}

// 4) Patinho: arremessa, fica sem nada e volta para pegar
{
  const g = roundSetup({ botWeapon: 'duck' });
  g.players[0].teleport({ x: 0, y: 0, z: 0 }, 0);
  g.players[1].teleport({ x: 0, y: 0, z: -7 }, Math.PI);
  let threw = false, recovered = false;
  run(g, 25, () => {
    const d = g.players[1].weapon.def.id;
    if (d === 'none') threw = true;
    if (threw && d === 'duck') recovered = true;
    return recovered;
  });
  check(threw, 'jogou o patinho (ficou de mãos vazias)');
  check(recovered, 'foi buscar e pegou o patinho de volta');
}

// 5) Alvo andando de um lado pro outro → acerta às vezes, não sempre
{
  let shots = 0, hits = 0;
  const g = roundSetup({ botWeapon: 'pistol', humanIntent: () => ({ ...blankIntent(), moveX: Math.floor(g.time / 1.2) % 2 ? 1 : -1 }) });
  g.players[0].hp = 1e9; // não morre: só contamos
  const orig = g.projectiles.spawn.bind(g.projectiles);
  g.projectiles.spawn = (...a) => { if (a[0] === g.players[1]) shots++; return orig(...a); };
  g.damage.onHit = (ctx) => { if (ctx.target === g.players[0]) hits++; };
  run(g, 25);
  check(hits > 0 && hits < shots, `alvo em movimento: ${hits} acertos em ${shots} tiros (não é aimbot)`);
}

// 6) Atrás da cobertura → não atira
{
  const g = roundSetup({ botWeapon: 'pistol' });
  g.players[0].teleport({ x: -8.2, y: 0, z: 0 }, 0);
  g.players[1].teleport({ x: -3.0, y: 0, z: 0 }, 0);
  let shots = 0;
  const orig = g.projectiles.spawn.bind(g.projectiles);
  g.projectiles.spawn = (...a) => { shots++; return orig(...a); };
  // mantém o bot parado no lugar
  const bot = g.schemes[1];
  const read = bot.read.bind(bot);
  bot.read = (d) => ({ ...read(d), moveX: 0, moveZ: 0 });
  run(g, 3);
  check(shots === 0, `atrás da caixa o bot não atira (${shots} tiros)`);
}

// 7) Loja: compra a melhor arma que cabe no bolso + colete com o troco
{
  applyBotPreset('normal');
  const g = new Game(null, null, { headless: true, bots: [1] });
  g.flow.skipToPvp();
  g.flow.match.money[1] = 1200;
  g.sm.change(GameStates.BUY);
  run(g, 8, () => g.sm.is(GameStates.ROUND) || g.players[1].armor > 0);
  const p = g.players[1];
  check(p.weapon.def.id === 'smg' && p.armor === 25 && g.flow.match.money[1] === 50,
    `com $1200 comprou ${p.weapon.def.id} + colete ${p.armor}, sobrou $${g.flow.match.money[1]}`);
}

console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo.');
process.exit(fails ? 1 : 0);

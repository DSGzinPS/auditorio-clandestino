// Partida inteira bot × bot, sem navegador. Confere as regras das etapas 1 e 2.
// Uso: node tests/match-sim.mjs
import { Game } from '../src/core/Game.js';
import { GameStates } from '../src/core/StateMachine.js';
import { CONFIG } from '../src/config.js';
import { BOT_PRESETS } from '../src/ai/BotController.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✔' : '✘'} ${msg}`); if (!ok) fails++; };
const dt = 1 / 60;

function playMatch({ accuracies, label, maxSeconds = 900 }) {
  console.log(`\n=== ${label} ===`);
  const g = new Game(null, null, { headless: true, bots: [0, 1] });
  // força a precisão do quiz de cada bot (o preset é global, então sobrescreve por instância)
  g.schemes.forEach((s, i) => {
    const orig = s.onQuizStart.bind(s);
    s.onQuizStart = (q) => {
      const keep = CONFIG.bot.quizAccuracy;
      CONFIG.bot.quizAccuracy = accuracies[i];
      orig(q);
      CONFIG.bot.quizAccuracy = keep;
    };
  });

  const log = [];
  const snap = {};
  g.sm.onChange((name, prev) => {
    log.push(name);
    const m = g.flow.match;
    if (name === GameStates.BUY && prev !== GameStates.ROUND_END) {
      snap.afterQuiz = { money: [...m.money], correct: [...m.quizCorrect], restrictions: [...m.restrictions] };
    }
    if (name === GameStates.ROUND) {
      (snap.roundLoadouts ??= []).push(g.players.map((p) => ({ w: p.weapon.def.id, armor: p.armor, hp: p.hp })));
    }
    if (name === GameStates.TIEBREAK) snap.tiebreak = true;
    if (name === GameStates.MATCH_END) {
      snap.end = { roundsWon: { ...m.roundsWon }, kills: [...m.kills], deaths: [...m.deaths], money: [...m.money], totalRounds: m.totalRounds };
    }
  });

  g.flow.newMatch();
  let t = 0;
  while (!snap.end && t < maxSeconds) { g.step(dt); t += dt; }
  const m = g.flow.match;
  return { g, log, snap, t, m };
}

// ---------------------------------------------------------------- 1) quiz com perdedor claro
{
  const { log, snap, t } = playMatch({ accuracies: [1, 0], label: 'Bot A acerta tudo, bot B erra tudo' });
  const quizzes = log.filter((s) => s === GameStates.QUIZ).length;
  check(quizzes === 1, `quiz roda uma vez como etapa (${quizzes})`);
  check(snap.afterQuiz?.correct.join() === '3,0', `3 perguntas: acertos ${snap.afterQuiz?.correct}`);
  check(snap.afterQuiz?.money[0] === 3 * CONFIG.economy.quizCorrect && snap.afterQuiz?.money[1] === 0,
    `dinheiro do quiz: A=$${snap.afterQuiz?.money[0]}, B=$${snap.afterQuiz?.money[1]} (errar só deixa de ganhar)`);
  check(snap.afterQuiz?.restrictions.join() === ',duck', `B errou todas → patinho (${snap.afterQuiz?.restrictions})`);
  check(!snap.tiebreak, 'sem desempate quando há perdedor claro');
  const rounds = snap.roundLoadouts ?? [];
  check(rounds.length === 4, `4 rounds jogados (${rounds.length})`);
  check(rounds.every((r) => r[1].w === 'duck' && r[1].armor === 0), 'B começa TODO round com o patinho e sem colete (não compra)');
  check(rounds[0][0].w !== 'slingshot', `A comprou na 1ª loja: ${rounds[0][0].w}, colete ${rounds[0][0].armor}`);
  check(rounds.every((r) => r.every((p) => p.hp === 100)), 'todo round começa com 100 de HP');
  check(!!snap.end, `partida terminou em ${t.toFixed(0)} s de jogo`);
  const won = Object.values(snap.end?.roundsWon ?? {}).reduce((a, b) => a + b, 0);
  check(won <= 4 && snap.end?.totalRounds === 4, `placar de rounds ${JSON.stringify(snap.end?.roundsWon)} · kills ${snap.end?.kills}`);
  check(log.at(-1) === GameStates.MATCH_END, `fluxo: ${[...new Set(log)].map((s) => s.replace('_STATE', '')).join(' → ')}`);
}

// ---------------------------------------------------------------- 2) empate no quiz → soco
{
  const { snap, log } = playMatch({ accuracies: [1, 1], label: 'Os dois acertam tudo (empate)' });
  check(!!snap.tiebreak, 'empate leva ao DESEMPATE NA MÃO');
  const r = snap.afterQuiz?.restrictions ?? [];
  const losers = r.filter(Boolean);
  check(losers.length <= 1 && losers.every((x) => x === 'weak'),
    `perdedor do soco (acertou ≥1) fica só com o estilingue: ${JSON.stringify(r)}`);
  const idx = r.findIndex(Boolean);
  if (idx >= 0) {
    check((snap.roundLoadouts ?? []).every((rd) => rd[idx].w === 'slingshot' && rd[idx].armor === 0),
      'perdedor do desempate não compra nada nos 4 rounds');
  }
  check(log.includes(GameStates.MATCH_END), 'partida chegou ao fim');
}

// ---------------------------------------------------------------- 3) economia de kill
{
  const g = new Game(null, null, { headless: true, bots: [0, 1] });
  g.flow.newMatch();
  const m = g.flow.match;
  m.time = 100;
  const [a, b] = g.players;
  const base = CONFIG.economy.killReward;
  let r = m.rewardKill({ attacker: a, headshot: true, kind: 'projectile', weapon: { id: 'pistol' } });
  check(r.amount === base * CONFIG.economy.headshotMult, `headshot: $${r.amount}`);
  m.time += 2;
  r = m.rewardKill({ attacker: a, headshot: false, kind: 'melee', weapon: { id: 'fists' } });
  check(r.amount === Math.round(base * CONFIG.economy.meleeMult * CONFIG.economy.doubleKillMult) && r.tags.includes('DOUBLE KILL'),
    `soco + double kill: $${r.amount} [${r.tags}]`);
  m.time += 30;
  r = m.rewardKill({ attacker: b, headshot: false, kind: 'duck', weapon: { id: 'duck' } });
  check(r.amount === base * CONFIG.economy.duckKillMult, `kill com patinho: $${r.amount}`);

  // colete absorve primeiro, máximo 50
  b.revive(false); b.armor = 50;
  b.takeDamage(30);
  check(b.armor === 20 && b.hp === 100, `colete absorve antes do HP (colete ${b.armor}, HP ${b.hp})`);
  b.takeDamage(40);
  check(b.armor === 0 && b.hp === 80, `depois desconta do HP (colete ${b.armor}, HP ${b.hp})`);

  // loja: restrição e saldo
  m.restrictions = [null, 'weak'];
  m.money = [2000, 2000];
  check(m.buy(1, 'pistol').ok === false, 'restrito não compra mesmo com dinheiro');
  check(m.buy(0, 'cannon').ok && a.weapon.def.id === 'cannon' && m.money[0] === 700, `compra desconta: $${m.money[0]}`);
  check(m.buy(0, 'heavy').ok && a.armor === 50 && m.money[0] === 250, `colete de $450 com $700 → colete ${a.armor}, sobra $${m.money[0]}`);
  check(m.buy(0, 'vest').ok === false, 'não compra colete pior do que o que já tem');
}

console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo.');
process.exit(fails ? 1 : 0);

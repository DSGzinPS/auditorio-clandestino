// Partida inteira (6 etapas) bot × bot, sem navegador. Confere as regras.
// Uso: node tests/match-sim.mjs
import { Game } from '../src/core/Game.js';
import { GameStates } from '../src/core/StateMachine.js';
import { CONFIG } from '../src/config.js';
import { resolveRps } from '../src/states/RpsState.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✔' : '✘'} ${msg}`); if (!ok) fails++; };
const dt = 1 / 60;

/** Força o resultado dos minigames por bot (acerto no quiz e escolha no RPS). */
function rig(g, { quiz = [null, null], rps = [null, null] } = {}) {
  g.schemes.forEach((s, i) => {
    if (quiz[i] !== null) {
      const orig = s.onQuizStart.bind(s);
      s.onQuizStart = (q) => {
        const keep = CONFIG.bot.quizAccuracy;
        CONFIG.bot.quizAccuracy = quiz[i];
        orig(q);
        CONFIG.bot.quizAccuracy = keep;
      };
    }
    if (rps[i] !== null) {
      const orig = s.onRpsStart.bind(s);
      s.onRpsStart = () => { orig(); s.rps.pick = rps[i]; };
    }
  });
}

function playMatch(label, rigging, maxSeconds = 3000) {
  console.log(`\n=== ${label} ===`);
  const g = new Game(null, null, { headless: true, bots: [0, 1] });
  rig(g, rigging);
  const log = [];
  const pvpStarts = []; // restrições + armas no 1º round de cada etapa de PvP
  let lastMap = null;
  g.sm.onChange((name) => {
    log.push(`${name.replace('_STATE', '')}@${g.arena.mapId}`);
    const m = g.flow.match;
    if (name === GameStates.ROUND && lastMap !== g.arena.mapId) {
      lastMap = g.arena.mapId;
      pvpStarts.push({ map: g.arena.mapId, restrictions: [...m.restrictions], weapons: g.players.map((p) => p.weapon.def.id) });
    }
  });
  g.flow.newMatch();
  let t = 0;
  while (!g.sm.is(GameStates.MATCH_END) && t < maxSeconds) { g.step(dt); t += dt; }
  return { g, m: g.flow.match, log, pvpStarts, t };
}

// ---------------------------------------------------------------- pedra, papel e tesoura (regra)
{
  console.log('\n=== Regras do pedra-papel-tesoura ===');
  check(resolveRps([0, 2]).join() === '0', 'pedra quebra tesoura');
  check(resolveRps([1, 0]).join() === '0', 'papel embrulha pedra');
  check(resolveRps([2, 1]).join() === '0', 'tesoura corta papel');
  check(resolveRps([1, 1]).length === 0, 'iguais = empate');
  check(resolveRps([0, null]).join() === '0', 'quem não escolhe perde');
  check(resolveRps([0, 1, 2]).length === 0, '3 jogadores, 3 símbolos = empate');
  check(resolveRps([2, 2, 1]).join() === '0,1', '3 jogadores: as duas tesouras ganham do papel');
}

// ---------------------------------------------------------------- partida completa
{
  // A acerta tudo no quiz e sempre joga papel; B erra tudo e sempre joga pedra
  const { m, log, pvpStarts, t } = playMatch('Partida completa: A domina os minigames', { quiz: [1, 0], rps: [1, 0] });
  const stages = [...new Set(log.map((l) => l.split('@')[0]))];
  check(['QUIZ', 'RPS', 'BASKETBALL', 'BUY', 'ROUND', 'MATCH_END'].every((s) => stages.includes(s)), `passou por todas as etapas: ${stages.join(', ')}`);
  const maps = pvpStarts.map((p) => p.map);
  check(maps.join() === 'estudio,bastidores,rua', `PvP nos 3 mapas, em ordem: ${maps.join(' → ')}`);
  check(m.totalRounds === 12, `12 rounds de PvP no total (${m.totalRounds})`);
  check(m.quizCorrect.join() === '3,0', `quiz: acertos ${m.quizCorrect}`);
  check(pvpStarts[0]?.restrictions[1] === 'duck' && pvpStarts[0]?.weapons[1] === 'duck', 'PvP 1: B (0 no quiz) com patinho');
  check(pvpStarts[1]?.restrictions.join() === ',duck', `PvP 2: B perdeu o RPS de 2×0 → patinho (${JSON.stringify(pvpStarts[1]?.restrictions)})`);
  const bk = m.minigameScores?.kind === 'basketball' ? m.minigameScores.scores : null;
  console.log(`   basquete terminou ${bk?.join(' × ')} · restrição no PvP 3: ${JSON.stringify(pvpStarts[2]?.restrictions)}`);
  if (bk && bk[0] !== bk[1]) {
    const loser = bk[0] < bk[1] ? 0 : 1;
    check(pvpStarts[2]?.restrictions[loser] === (bk[loser] === 0 ? 'duck' : 'weak'), 'PvP 3: perdedor do basquete restrito');
  }
  const winners = m.winnerTeams();
  check(log.at(-1).startsWith('MATCH_END'), `placar final ${JSON.stringify(m.roundsWon)} → ${winners.length > 1 ? 'empate' : 'vence o time ' + winners[0]} (${t.toFixed(0)} s de jogo)`);
}

// ---------------------------------------------------------------- empate no quiz → soco
{
  const { log, pvpStarts } = playMatch('Empate no quiz (os dois acertam tudo)', { quiz: [1, 1] });
  check(log.includes('TIEBREAK@estudio'), 'empate leva ao DESEMPATE NA MÃO');
  const r = pvpStarts[0]?.restrictions ?? [];
  check(r.filter(Boolean).length <= 1 && r.filter(Boolean).every((x) => x === 'weak'), `perdedor do soco (acertou ≥1) só com estilingue: ${JSON.stringify(r)}`);
}

// ---------------------------------------------------------------- economia, colete e loja
{
  console.log('\n=== Economia, colete e loja ===');
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
  check(r.amount === Math.round(base * CONFIG.economy.meleeMult * CONFIG.economy.doubleKillMult) && r.tags.includes('DOUBLE KILL'), `soco + double kill: $${r.amount}`);
  m.time += 30;
  r = m.rewardKill({ attacker: b, headshot: false, kind: 'duck', weapon: { id: 'duck' } });
  check(r.amount === base * CONFIG.economy.duckKillMult, `kill com patinho: $${r.amount}`);
  b.revive(false); b.armor = 50;
  b.takeDamage(30);
  check(b.armor === 20 && b.hp === 100, `colete absorve antes do HP (colete ${b.armor}, HP ${b.hp})`);
  m.restrictions = [null, 'weak'];
  m.money = [2000, 2000];
  check(m.buy(1, 'pistol').ok === false, 'restrito não compra mesmo com dinheiro');
  check(m.buy(0, 'cannon').ok && m.money[0] === 700, `compra desconta: $${m.money[0]}`);
}

// ---------------------------------------------------------------- basquete isolado
{
  console.log('\n=== Basquete bot × bot (3 partidas) ===');
  let baskets = 0, finished = 0;
  for (let k = 0; k < 3; k++) {
    const g = new Game(null, null, { headless: true, bots: [0, 1] });
    g.flow.jumpTo(CONFIG.match.stages.findIndex((s) => s.type === 'basketball'));
    let nades = 0;
    const orig = g.grenades.throw.bind(g.grenades);
    g.grenades.throw = (p) => { const ok = orig(p); if (ok) nades++; return ok; };
    let t = 0;
    while (g.sm.is(GameStates.BASKETBALL) && t < 200) { g.step(dt); t += dt; }
    const sc = g.flow.match.minigameScores?.scores ?? [];
    baskets += sc.reduce((x, y) => x + y, 0);
    if (!g.sm.is(GameStates.BASKETBALL)) finished++;
    console.log(`   partida ${k + 1}: ${sc.join(' × ')} em ${t.toFixed(0)} s · ${nades} granadas · dinheiro ${g.flow.match.money}`);
  }
  check(finished === 3, 'as 3 partidas de basquete terminaram');
  check(baskets > 0, `bots fizeram cestas (${baskets} no total)`);
}

// ---------------------------------------------------------------- obstáculos: derrubam sem tirar vida
{
  console.log('\n=== Obstáculos ===');
  for (const [map, place, what] of [['rua', { x: 0, y: 0, z: 6.25 }, 'carro'], ['bastidores', { x: 3, y: 0, z: 1.5 }, 'barra giratória']]) {
    const g = new Game(null, null, { headless: true, bots: [] });
    g.flow.newMatch();
    g.sm.current = null; g.sm.currentName = 'TEST'; // sem estado: só física
    g.arena.setMap(map);
    const p = g.players[0];
    p.teleport(place, 0);
    p.frozen = false;
    g.players[1].teleport({ x: 0, y: 0, z: -15 }, 0);
    let knocked = false;
    for (let f = 0; f < 60 * 8 && !knocked; f++) { g.step(dt); if (p.mode === 'ragdoll') knocked = true; }
    check(knocked && p.hp === 100, `${map}: ${what} derrubou sem tirar vida (HP ${p.hp})`);
  }
}

console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo.');
process.exit(fails ? 1 : 0);

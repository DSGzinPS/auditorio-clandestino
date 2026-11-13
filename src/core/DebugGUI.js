// Painel "Força do Caos" (lil-gui). Mexe direto no objeto CONFIG,
// então o próximo tiro/punição já usa o valor novo. Tecla G mostra/esconde.

import GUI from 'lil-gui';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { punishLaunch, shotKnockback } from '../physics/ChaosForces.js';
import { applyBotPreset } from '../ai/BotController.js';

export function createDebugGUI(game) {
  const gui = new GUI({ title: 'Força do Caos  [G]' });

  const c = gui.addFolder('Caos');
  c.add(CONFIG.chaos, 'master', 0, 5, 0.05).name('Multiplicador global');
  c.add(CONFIG.chaos, 'punishImpulse', 0, 800, 5).name('Punição (N·s)');
  c.add(CONFIG.chaos, 'punishSpin', 0, 80, 1).name('Giro punição');
  c.add(CONFIG.chaos, 'shotImpulse', 0, 800, 5).name('Tiro (N·s)');
  c.add(CONFIG.chaos, 'shotLift', 0, 300, 5).name('Tiro: sobe');
  c.add(CONFIG.chaos, 'shotSpin', 0, 80, 1).name('Giro tiro');
  c.add(CONFIG.chaos, 'limbSpinMultiplier', 0, 5, 0.1).name('Giro dos membros');
  c.add(CONFIG.chaos, 'offCenterJitter', 0, 0.4, 0.01).name('Cambalhota');

  const f = gui.addFolder('Física');
  f.add(CONFIG.physics, 'gravity', -40, 0, 0.1).name('Gravidade');
  f.add(CONFIG.physics, 'ragdollBounciness', 0, 1.2, 0.01).name('Quique do ragdoll');
  f.add(CONFIG.physics, 'maxRagdollSpeed', 10, 120, 1).name('Vel. máx ragdoll');

  const p = gui.addFolder('Personagem / Arma');
  p.add(CONFIG.character, 'moveSpeed', 1, 20, 0.5).name('Velocidade');
  p.add(CONFIG.character, 'recoverTime', 0.5, 8, 0.1).name('Tempo p/ levantar');
  p.add(CONFIG.character, 'ragdollCamera', ['chase', 'head']).name('Câmera no ragdoll');
  p.add(CONFIG.weapon, 'damageMult', 0.2, 3, 0.05).name('Dano das armas ×');
  p.add(CONFIG.weapon, 'recoilMult', 0, 3, 0.05).name('Recuo ×');
  p.add(CONFIG.weapon, 'spreadMult', 0, 3, 0.05).name('Dispersão ×');
  p.add(CONFIG.player, 'armorAbsorb', 0, 1, 0.05).name('Colete absorve');

  if (game.mode === 'vsBot') {
    const b = gui.addFolder('Bot');
    const ctrls = [];
    b.add(CONFIG.bot, 'difficulty', ['facil', 'normal', 'dificil', 'custom']).name('Dificuldade')
      .onChange((v) => { applyBotPreset(v); ctrls.forEach((c) => c.updateDisplay()); });
    ctrls.push(
      b.add(CONFIG.bot, 'quizAccuracy', 0, 1, 0.05).name('Acerto no quiz'),
      b.add(CONFIG.bot, 'aimError', 0, 0.4, 0.005).name('Erro de mira'),
      b.add(CONFIG.bot, 'turnSpeed', 0.5, 12, 0.1).name('Giro da mira'),
      b.add(CONFIG.bot, 'reactionTime', 0, 2, 0.05).name('Reação'),
      b.add(CONFIG.bot, 'fireConeDeg', 1, 20, 0.5).name('Cone de tiro (°)'),
      b.add(CONFIG.bot, 'leadSkill', 0, 1, 0.05).name('Compensação'),
    );
    b.add(CONFIG.bot, 'shootRagdolls').name('Atira em quem voa');
  }

  const e = gui.addFolder('Dinheiro');
  e.add(CONFIG.economy, 'quizCorrect', 0, 2000, 50).name('Acerto no quiz');
  e.add(CONFIG.economy, 'roundWin', 0, 2000, 50).name('Vitória de round');
  e.add(CONFIG.economy, 'killReward', 0, 2000, 50).name('Kill (base)');
  e.add(CONFIG.economy, 'headshotMult', 1, 5, 0.1).name('x Headshot');
  e.add(CONFIG.economy, 'meleeMult', 1, 8, 0.1).name('x Soco');
  e.add(CONFIG.economy, 'duckKillMult', 1, 10, 0.5).name('x Patinho');
  e.add(CONFIG.match, 'buyTime', 3, 60, 1).name('Tempo de loja (s)');
  e.close();

  const bot = game.players.find((p) => p.isBot) ?? game.players[1];
  const actions = {
    newMatch: () => game.playFrom(0),
    pvp: () => game.playFrom(CONFIG.match.stages.findIndex((s) => s.type === 'pvp')),
    money: () => { if (game.flow.match) game.flow.match.money[0] += 1000; },
    punishP1: () => punishLaunch(game.players[0]),
    punishBot: () => punishLaunch(bot),
    shootBot: () => shotKnockback(bot, new CANNON.Vec3(0, 0, -1)),
    killBot: () => game.damage.apply({ target: bot, attacker: game.players[0], weapon: { name: 'Debug', damage: 999, headshotMult: 1, knockback: 120 }, direction: new CANNON.Vec3(0, 0, -1), headshot: false, kind: 'projectile' }),
  };
  const a = gui.addFolder('Testes');
  const stageNames = Object.fromEntries(CONFIG.match.stages.map((st, i) => [`${i + 1}. ${st.label ?? st.type}`, i]));
  const jump = { etapa: 0 };
  a.add(jump, 'etapa', stageNames).name('Pular para etapa').onChange((i) => game.playFrom(Number(i)));
  a.add(actions, 'newMatch').name('Nova partida');
  a.add(actions, 'pvp').name('Pular direto pro PvP');
  a.add(actions, 'money').name('+$1000 pra mim');
  a.add(actions, 'punishP1').name('Me punir (teto!)');
  a.add(actions, 'punishBot').name(`Punir ${bot.name} (teto!)`);
  a.add(actions, 'shootBot').name(`Empurrar ${bot.name}`);
  a.add(actions, 'killBot').name(`Matar ${bot.name} (no round)`);

  gui.close();
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyG') return;
    gui._hidden ? gui.show() : gui.hide();
  });
  return gui;
}

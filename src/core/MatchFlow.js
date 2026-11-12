// Roteiro da partida: percorre CONFIG.match.stages e decide para qual
// estado ir. Os estados fazem o "como"; o MatchFlow decide o "e agora?".

import { CONFIG } from '../config.js';
import { GameStates } from './StateMachine.js';
import { Match } from './Match.js';

export class MatchFlow {
  constructor(game) {
    this.game = game;
    this.match = null;
    this.stageIndex = -1;
  }

  get stage() {
    return CONFIG.match.stages[this.stageIndex] ?? null;
  }

  newMatch() {
    this.match = new Match(this.game.players);
    this.game.players.forEach((p) => { p.revive(false); });
    this.stageIndex = -1;
    this.nextStage();
  }

  nextStage() {
    this.stageIndex++;
    const s = this.stage;
    const sm = this.game.sm;
    if (!s) return sm.change(GameStates.MATCH_END);
    if (s.type === 'quiz') return sm.change(GameStates.QUIZ, { stage: s });
    if (s.type === 'pvp') {
      this.match.roundInStage = 0;
      this.match.resetLoadouts();
      this.game.players.forEach((p) => { p.dead = false; });
      return sm.change(GameStates.BUY);
    }
    console.warn(`Etapa "${s.type}" ainda não implementada, pulando.`);
    return this.nextStage();
  }

  // ---------------------------------------------------------------- quiz
  /**
   * Perdedor = quem acertou menos. Todos empatados → desempate no soco.
   * 0 acertos → patinho · 1+ acerto → estilingue sem loja.
   */
  finishQuiz() {
    const m = this.match;
    const min = Math.min(...m.quizCorrect);
    const losers = m.players.filter((p, i) => m.quizCorrect[i] === min);
    if (losers.length === m.players.length) {
      return this.game.sm.change(GameStates.TIEBREAK, { contenders: losers });
    }
    this.applyQuizLosers(losers);
    this.nextStage();
  }

  finishTiebreak(losers) {
    this.applyQuizLosers(losers);
    this.nextStage();
  }

  applyQuizLosers(losers) {
    const m = this.match;
    m.restrictions = m.players.map(() => null);
    for (const p of losers) m.restrictions[p.index] = m.quizCorrect[p.index] === 0 ? 'duck' : 'weak';
  }

  // ---------------------------------------------------------------- PvP
  finishRound(winnerTeam) {
    const m = this.match;
    m.totalRounds++;
    if (winnerTeam !== null) {
      m.roundsWon[winnerTeam]++;
      m.players.forEach((p, i) => { if (p.team === winnerTeam) m.addMoney(i, CONFIG.economy.roundWin, 'Venceu o round'); });
    }
    this.game.sm.change(GameStates.ROUND_END, { winnerTeam });
  }

  afterRoundEnd() {
    const m = this.match;
    m.roundInStage++;
    if (m.roundInStage < this.stage.rounds) return this.game.sm.change(GameStates.BUY);
    m.restrictions = m.players.map(() => null); // a punição do quiz vale só para esta etapa
    this.nextStage();
  }

  // ---------------------------------------------------------------- debug
  skipToPvp() {
    if (!this.match) this.match = new Match(this.game.players);
    this.stageIndex = CONFIG.match.stages.findIndex((s) => s.type === 'pvp') - 1;
    this.nextStage();
  }
}

// Roteiro da partida: percorre CONFIG.match.stages e decide para qual
// estado ir. Os estados fazem o "como"; o MatchFlow decide o "e agora?".
//
// Regra geral dos minigames (quiz, pedra-papel-tesoura, basquete):
//   quem fez MENOS pontos é o perdedor e fica restrito no PvP seguinte:
//   0 pontos → patinho · 1+ ponto → estilingue · nos dois casos, sem loja.
//   Todos empatados → "saem na mão" (desempate no soco).

import { CONFIG } from '../config.js';
import { GameStates } from './StateMachine.js';
import { Match } from './Match.js';

const STATE_FOR = {
  quiz: GameStates.QUIZ,
  rps: GameStates.RPS,
  basketball: GameStates.BASKETBALL,
};

export class MatchFlow {
  constructor(game) {
    this.game = game;
    this.match = null;
    this.stageIndex = -1;
    this.pendingScores = null;
  }

  get stage() {
    return CONFIG.match.stages[this.stageIndex] ?? null;
  }

  get stageCount() {
    return CONFIG.match.stages.length;
  }

  stageTitle() {
    const s = this.stage;
    return s ? `ETAPA ${this.stageIndex + 1}/${this.stageCount} · ${s.label ?? s.type.toUpperCase()}` : '';
  }

  newMatch() {
    this.match = new Match(this.game.players);
    this.game.players.forEach((p) => { p.revive(false); });
    this.stageIndex = -1;
    this.nextStage();
  }

  /** Troca o mapa e atualiza os spawns de cada jogador. */
  _loadMap(id) {
    const g = this.game;
    g.projectiles.clear();
    g.arena.setMap(id);
    g.players.forEach((p) => {
      p.spawn = g.arena.spawnFor(p.index);
      p.teleport(p.spawn.position, p.spawn.yaw);
    });
  }

  nextStage() {
    this.stageIndex++;
    const s = this.stage;
    const g = this.game;
    if (!s) return g.sm.change(GameStates.MATCH_END);
    this._loadMap(s.map ?? 'estudio');
    g.hud.flash?.(null, this.stageTitle(), 'big');

    if (STATE_FOR[s.type]) return g.sm.change(STATE_FOR[s.type], { stage: s });
    if (s.type === 'pvp') {
      this.match.roundInStage = 0;
      this.match.resetLoadouts();
      g.players.forEach((p) => { p.dead = false; });
      return g.sm.change(GameStates.BUY);
    }
    console.warn(`Etapa "${s.type}" desconhecida, pulando.`);
    return this.nextStage();
  }

  // ---------------------------------------------------------------- minigames
  /** @param scores pontos de cada jogador (índice = player.index) */
  finishMinigame(scores, kind = 'quiz') {
    const m = this.match;
    m.minigameScores = { kind, scores: [...scores] };
    const min = Math.min(...scores);
    const losers = m.players.filter((p, i) => scores[i] === min);
    if (losers.length === m.players.length) {
      this.pendingScores = scores;
      return this.game.sm.change(GameStates.TIEBREAK, { contenders: losers });
    }
    this.applyLosers(losers, scores);
    this.nextStage();
  }

  /** Compatibilidade: o quiz usa os acertos como pontos. */
  finishQuiz() {
    this.finishMinigame(this.match.quizCorrect, 'quiz');
  }

  finishTiebreak(losers) {
    this.applyLosers(losers, this.pendingScores ?? this.match.quizCorrect);
    this.pendingScores = null;
    this.nextStage();
  }

  applyLosers(losers, scores) {
    const m = this.match;
    m.restrictions = m.players.map(() => null);
    for (const p of losers) m.restrictions[p.index] = scores[p.index] === 0 ? 'duck' : 'weak';
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
    m.restrictions = m.players.map(() => null); // a punição vale só para esta etapa de PvP
    this.nextStage();
  }

  // ---------------------------------------------------------------- debug
  /** Pula para a etapa N (0 = quiz). */
  jumpTo(index) {
    if (!this.match) this.match = new Match(this.game.players);
    this.game.players.forEach((p) => { p.revive(false); });
    this.stageIndex = Math.max(-1, Math.min(index, this.stageCount) - 1);
    this.nextStage();
  }

  skipToPvp() {
    this.jumpTo(CONFIG.match.stages.findIndex((s) => s.type === 'pvp'));
  }
}

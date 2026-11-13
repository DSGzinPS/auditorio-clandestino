// ETAPA 1 — QUIZ: N perguntas (padrão 3). Acertou → ganha dinheiro.
// Errou ou não respondeu → teto. Antes da próxima pergunta todos voltam ao púlpito.

import { State } from '../core/StateMachine.js';
import { CONFIG } from '../config.js';
import { punishLaunch } from '../physics/ChaosForces.js';
import { generateQuestion, WRONG_LINES, pick } from '../quiz/QuestionGenerator.js';

export class QuizState extends State {
  enter({ stage } = {}) {
    const g = this.context;
    this.total = stage?.questions ?? 3;
    this.index = 0;
    g.combatActive = false;
    g.projectiles.clear();
    g.input.releaseLock();
    g.hud.setCrosshairs(false);
    g.hud.setLockHint(false);
    g.hud.onAnswer = (pi, oi) => this.submit(pi, oi);
    this._ask();
  }

  _ask() {
    const g = this.context;
    g.players.forEach((p) => {
      p.teleport(p.spawn.position, p.spawn.yaw); // também tira do ragdoll
      p.frozen = true;
      p.canLook = false;
    });
    this.question = generateQuestion();
    this.answers = g.players.map(() => null);
    this.timer = CONFIG.quiz.timeLimit;
    this.phase = 'asking';
    this.someoneFlying = false;
    g.hud.setPhase(`QUIZ · ${this.index + 1}/${this.total}`);
    g.hud.showQuiz(this.question, { index: this.index, total: this.total, reward: CONFIG.economy.quizCorrect });
    g.schemes.forEach((s) => s.onQuizStart?.(this.question)); // o bot começa a "pensar"
  }

  update(dt) {
    const g = this.context;
    g.projectiles.drainHits(() => {});

    if (this.phase === 'asking') {
      g.intents.forEach((it, i) => { if (it.answer === 0 || it.answer === 1) this.submit(i, it.answer); });
      this.timer -= dt;
      g.hud.setQuizTimer(Math.max(0, this.timer));
      if (this.timer <= 0) this.answers.forEach((a, i) => { if (a === null) this.submit(i, -1); });
      if (this.answers.every((a) => a !== null)) {
        this.phase = 'reveal';
        this.revealTimer = CONFIG.quiz.revealTime;
        if (this.someoneFlying) {
          // alguém está voando: some com os cartões e mostra só a resposta numa faixa
          g.hud.hideQuiz();
          g.hud.strip(`Resposta certa: ${this.question.options[this.question.correctIndex]}`);
        } else {
          g.hud.revealCorrect(this.question.correctIndex);
        }
      }
      return;
    }

    this.revealTimer -= dt;
    if (this.revealTimer > 0) return;
    if (this.index + 1 < this.total) {
      this.index++;
      this._ask();
    } else {
      g.flow.finishQuiz();
    }
  }

  /** @param optionIndex 0 | 1, ou -1 = tempo esgotado */
  submit(playerIndex, optionIndex) {
    if (this.phase !== 'asking' || this.answers[playerIndex] !== null) return;
    const g = this.context;
    const m = g.flow.match;
    const correct = optionIndex === this.question.correctIndex;
    this.answers[playerIndex] = { optionIndex, correct };
    g.hud.markAnswer(playerIndex, optionIndex, correct);

    if (correct) {
      m.quizCorrect[playerIndex]++;
      m.addMoney(playerIndex, CONFIG.economy.quizCorrect, 'Acertou no quiz');
      g.hud.flash(playerIndex, `CERTA RESPOSTA! +$${CONFIG.economy.quizCorrect}`, 'good');
      g.sfx('ding', null, { forWho: playerIndex });
      g.sfx('cheer', null, { amount: 0.4 });
    } else {
      punishLaunch(g.players[playerIndex]); // A MECÂNICA DE PUNIÇÃO
      g.sfx('buzzer');
      g.sfx('launch', g.players[playerIndex].controller.position);
      g.sfx('laugh', null, { amount: 1 });
      g.hud.flash(playerIndex, optionIndex === -1 ? 'TEMPO ESGOTADO!' : pick(WRONG_LINES), 'bad');
      this.someoneFlying = true;
    }
    if (this.someoneFlying) g.hud.quizWatch(this.answers); // libera a vista pra ver o voo
  }

  exit() {
    const g = this.context;
    g.hud.hideQuiz();
    g.hud.onAnswer = null;
    g.players.forEach((p) => g.flow.match.takeRewards(p.index)); // já foi mostrado na hora
  }
}

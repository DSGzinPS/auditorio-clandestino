// Máquina de estados genérica. Cada estado recebe o mesmo "context"
// (a instância do Game) e uma referência à máquina para trocar de estado.

export const GameStates = Object.freeze({
  QUIZ: 'QUIZ_STATE',           // etapa 1: perguntas valendo dinheiro
  TIEBREAK: 'TIEBREAK_STATE',   // empate num minigame: sai na mão
  RPS: 'RPS_STATE',             // etapa 3: pedra, papel e tesoura
  BASKETBALL: 'BASKETBALL_STATE', // etapa 5: basquete com granadas
  BUY: 'BUY_STATE',             // 15 s de loja antes de cada round
  ROUND: 'ROUND_STATE',         // PvP valendo
  ROUND_END: 'ROUND_END_STATE', // resumo do round + recompensas
  MATCH_END: 'MATCH_END_STATE', // placar final
});

export class State {
  /** @type {StateMachine} */ machine = null;
  /** @type {any} */ context = null;
  enter(_params) {}
  update(_dt) {}
  exit() {}
}

export class StateMachine {
  constructor(context) {
    this.context = context;
    this.states = new Map();
    this.current = null;
    this.currentName = null;
    this.previousName = null;
    this.listeners = new Set();
  }

  register(name, state) {
    state.machine = this;
    state.context = this.context;
    this.states.set(name, state);
    return this;
  }

  change(name, params = {}) {
    const next = this.states.get(name);
    if (!next) throw new Error(`Estado desconhecido: ${name}`);
    this.current?.exit();
    this.previousName = this.currentName;
    this.currentName = name;
    this.current = next;
    next.enter(params);
    this.listeners.forEach((fn) => fn(name, this.previousName));
  }

  is(name) {
    return this.currentName === name;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  update(dt) {
    this.current?.update(dt);
  }
}

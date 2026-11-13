// Preferências do jogador, salvas no aparelho (localStorage — no APK também persiste).

import { CONFIG } from '../config.js';
import { applyBotPreset } from '../ai/BotController.js';

const KEY = 'auditorio-settings-v1';
const BASE = {
  mouse: CONFIG.character.mouseSensitivity,
  touch: CONFIG.character.touchLookSensitivity,
};

export class Settings {
  constructor({ touch = false } = {}) {
    this.data = {
      difficulty: 'normal',
      sensitivity: 1,       // multiplicador da mira (mouse e toque)
      quality: touch ? 'media' : 'alta',
      chaos: 1,             // CONFIG.chaos.master
      showDebug: false,     // painel lil-gui
      startStage: 0,        // começar a partida em qual etapa
      volume: 0.8,          // efeitos (tiros, explosões…)
      crowd: 0.6,           // plateia
      lanServer: '',        // rede: IP do servidor local (vazio = servidor público PeerJS)
      playerName: '',
    };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (saved && typeof saved === 'object') Object.assign(this.data, saved);
    } catch { /* sem storage: fica no padrão */ }
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignora */ }
  }

  /** Aplica no jogo (chamar ao iniciar e sempre que algo mudar). */
  apply(game) {
    const d = this.data;
    CONFIG.bot.difficulty = d.difficulty;
    applyBotPreset(d.difficulty);
    CONFIG.character.mouseSensitivity = BASE.mouse * d.sensitivity;
    CONFIG.character.touchLookSensitivity = BASE.touch * d.sensitivity;
    CONFIG.chaos.master = d.chaos;
    game.setQuality?.(d.quality);
    game.audio?.setVolume(d.volume, d.crowd);
    if (game.gui) d.showDebug ? game.gui.show() : game.gui.hide();
  }
}

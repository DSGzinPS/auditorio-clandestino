// Menu principal, pausa, configurações e "como jogar".

import { CONFIG } from '../config.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Menu {
  constructor(game, settings) {
    this.game = game;
    this.settings = settings;
    this.stack = [];
    const touch = game.isTouch;
    const stages = CONFIG.match.stages.map((s, i) => `<option value="${i}">${i + 1}. ${esc(s.label ?? s.type)}</option>`).join('');

    document.body.insertAdjacentHTML('beforeend', `
      <div id="menu" class="menu hidden">
        <div class="menu-card" data-panel="main">
          <h1>PROGRAMA DE AUDITÓRIO <span>CLANDESTINO</span></h1>
          <p class="menu-sub">greybox · você contra o bot</p>
          <button class="menu-big" data-act="play">JOGAR</button>
          <div class="menu-row"><label>Bot</label>
            <div class="seg" data-set="difficulty">
              <button data-v="facil">Fácil</button><button data-v="normal">Normal</button><button data-v="dificil">Difícil</button>
            </div>
          </div>
          <div class="menu-row"><label>Começar em</label><select data-set="startStage">${stages}</select></div>
          <div class="menu-grid">
            <button data-act="settings">CONFIGURAÇÕES</button>
            <button data-act="hud">AJUSTAR HUD</button>
            <button data-act="help">COMO JOGAR</button>
          </div>
        </div>

        <div class="menu-card hidden" data-panel="pause">
          <h2>PAUSADO</h2>
          <button class="menu-big" data-act="resume">CONTINUAR</button>
          <div class="menu-grid">
            <button data-act="hud">AJUSTAR HUD</button>
            <button data-act="settings">CONFIGURAÇÕES</button>
            <button data-act="help">COMO JOGAR</button>
            <button data-act="restart">REINICIAR PARTIDA</button>
            <button data-act="quit" class="danger">SAIR PARA O MENU</button>
          </div>
        </div>

        <div class="menu-card hidden" data-panel="settings">
          <h2>CONFIGURAÇÕES</h2>
          <div class="menu-row"><label>Sensibilidade da mira</label>
            <input type="range" min="0.3" max="3" step="0.05" data-set="sensitivity"><output data-out="sensitivity"></output></div>
          <div class="menu-row"><label>Gráficos</label>
            <div class="seg" data-set="quality">
              <button data-v="baixa">Leve</button><button data-v="media">Médio</button><button data-v="alta">Bonito</button>
            </div>
          </div>
          <div class="menu-row"><label>Força do caos</label>
            <input type="range" min="0" max="3" step="0.05" data-set="chaos"><output data-out="chaos"></output></div>
          <div class="menu-row"><label>Painel de teste (G)</label><input type="checkbox" data-set="showDebug"></div>
          <button data-act="back">VOLTAR</button>
        </div>

        <div class="menu-card hidden" data-panel="help">
          <h2>COMO JOGAR</h2>
          <div class="menu-help">${touch ? `
            <p><b>Andar:</b> joystick à esquerda (empurre até o fim pra correr) · <b>Mirar:</b> arraste à direita</p>
            <p><b>ATIRAR</b> (dá pra arrastar e mirar segurando) · <b>SOCO</b> · <b>PULAR</b> · <b>AGACHAR</b> e <b>CORRER</b> ligam/desligam</p>
            <p>Quiz, pedra-papel-tesoura e loja: toque nas opções · ⏸ pausa</p>` : `
            <p><b>WASD</b> anda · <b>mouse</b> mira (clique na tela pra travar) · <b>clique</b> atira · <b>botão direito / V</b> soca</p>
            <p><b>Espaço</b> pula · <b>Shift</b> corre · <b>C</b> agacha · <b>ESC / P</b> pausa</p>
            <p>Quiz: <b>1/2</b> · Pedra/papel/tesoura: <b>1/2/3</b> · Loja: <b>1–6</b>, <b>Enter</b> pronto</p>`}
            <p>Errou no quiz ou perdeu no pedra-papel-tesoura: <b>vai pro teto</b>. Quem fizer menos pontos num minigame
              joga o PvP seguinte com o <b>patinho</b> (fez 0) ou o <b>estilingue</b>, sem loja. Vence quem ganhar mais rounds.</p>
            <p>Basquete: encoste na bola pra pegar · ATIRAR arremessa (mire pra cima) ou joga granada · SOCO empurra.</p>
          </div>
          <button data-act="back">VOLTAR</button>
        </div>
      </div>`);

    this.root = document.getElementById('menu');
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (b) this._act(b.dataset.act);
    });
    this.root.querySelectorAll('.seg').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        this._set(seg.dataset.set, b.dataset.v);
      });
    });
    this.root.querySelectorAll('input[type=range][data-set], select[data-set]').forEach((el) => {
      el.addEventListener('input', () => this._set(el.dataset.set, el.tagName === 'SELECT' ? Number(el.value) : Number(el.value)));
    });
    this.root.querySelectorAll('input[type=checkbox][data-set]').forEach((el) => {
      el.addEventListener('change', () => this._set(el.dataset.set, el.checked));
    });
    this._sync();
  }

  _set(key, value) {
    this.settings.set(key, value);
    this.settings.apply(this.game);
    this._sync();
  }

  _sync() {
    const d = this.settings.data;
    this.root.querySelectorAll('.seg').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(d[seg.dataset.set]) === b.dataset.v));
    });
    this.root.querySelectorAll('[data-set]').forEach((el) => {
      if (el.type === 'range' || el.tagName === 'SELECT') el.value = d[el.dataset.set];
      if (el.type === 'checkbox') el.checked = !!d[el.dataset.set];
    });
    this.root.querySelectorAll('output[data-out]').forEach((o) => { o.textContent = `${Number(d[o.dataset.out]).toFixed(2)}×`; });
  }

  _act(act) {
    const g = this.game;
    if (act === 'play') g.startMatch();
    else if (act === 'resume') g.resume();
    else if (act === 'restart') g.startMatch();
    else if (act === 'quit') g.quitToMenu();
    else if (act === 'settings' || act === 'help') this.open(act);
    else if (act === 'back') this.back();
    else if (act === 'hud') {
      const from = this.current;
      this.hide();
      g.layout.open(() => this.show(from));
    }
  }

  get current() {
    return this.stack.at(-1) ?? 'main';
  }

  show(panel) {
    this.stack = panel === 'main' || panel === 'pause' ? [panel] : [...this.stack, panel];
    this._render();
  }

  open(panel) {
    this.stack.push(panel);
    this._render();
  }

  back() {
    if (this.stack.length > 1) this.stack.pop();
    this._render();
  }

  _render() {
    this._sync();
    this.root.classList.remove('hidden');
    const cur = this.current;
    this.root.querySelectorAll('.menu-card').forEach((c) => c.classList.toggle('hidden', c.dataset.panel !== cur));
    this.root.classList.toggle('over-game', this.stack[0] === 'pause');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  get visible() {
    return !this.root.classList.contains('hidden');
  }
}

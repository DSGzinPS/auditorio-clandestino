// Menu principal, pausa, configurações e "como jogar".

import { CONFIG } from '../config.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function netError(err) {
  const t = err?.type;
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'sem conexão com o servidor (confira a internet ou o IP do PC)';
  if (t === 'browser-incompatible') return 'este navegador não suporta WebRTC';
  return err?.message ?? String(err);
}

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
          <button class="menu-big" data-act="play">JOGAR CONTRA O BOT</button>
          <button class="menu-big net" data-act="net">JOGAR EM REDE (LAN)</button>
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
            <button data-act="restart" class="no-guest">REINICIAR PARTIDA</button>
            <button data-act="quit" class="danger">SAIR PARA O MENU</button>
          </div>
        </div>

        <div class="menu-card hidden" data-panel="net">
          <h2>JOGAR EM REDE</h2>
          <p class="menu-sub">PC ↔ celular ou celular ↔ celular, no mesmo Wi-Fi. Um cria a sala e passa o código; o outro entra.</p>
          <div class="net-lobby">
            <button class="menu-big" data-act="net-host">CRIAR SALA</button>
            <div class="net-join">
              <input class="net-code" maxlength="4" placeholder="CÓDIGO" autocomplete="off" autocapitalize="characters" spellcheck="false">
              <button data-act="net-join">ENTRAR</button>
            </div>
          </div>
          <div class="net-room hidden">
            <div class="net-code-big"></div>
            <p>Passe esse código pro outro aparelho. Esperando ele entrar…</p>
          </div>
          <div class="net-status"></div>
          <details class="net-adv">
            <summary>Sem internet? Servidor no PC</summary>
            <p>No PC, na pasta do jogo: <code>npm run lan-server</code>. Ele mostra o IP do PC — digite aqui nos <b>dois</b> aparelhos:</p>
            <input class="net-server" placeholder="ex.: 192.168.0.10" autocomplete="off" spellcheck="false">
            <p><small>Vazio = servidor público do PeerJS (só pra apresentar os aparelhos; o jogo em si vai direto pela sua rede).</small></p>
          </details>
          <button data-act="net-cancel">VOLTAR</button>
        </div>

        <div class="menu-card hidden" data-panel="settings">
          <h2>CONFIGURAÇÕES</h2>
          <div class="menu-row"><label>Sensibilidade da mira</label>
            <input type="range" min="0.3" max="3" step="0.05" data-set="sensitivity"><output data-out="sensitivity"></output></div>
          <div class="menu-row"><label>Volume dos efeitos</label>
            <input type="range" min="0" max="1.5" step="0.05" data-set="volume"><output data-out="volume"></output></div>
          <div class="menu-row"><label>Volume da plateia</label>
            <input type="range" min="0" max="1.5" step="0.05" data-set="crowd"><output data-out="crowd"></output></div>
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
            <p><b>ATIRAR</b> (dá pra arrastar e mirar segurando) · <b>SOCO</b> · <b>PULAR</b> · <b>RECARREGAR</b> · <b>MIRA</b>, <b>AGACHAR</b> e <b>CORRER</b> ligam/desligam</p>
            <p>Quiz, pedra-papel-tesoura e loja: toque nas opções · ⏸ pausa</p>` : `
            <p><b>WASD</b> anda · <b>mouse</b> mira (clique na tela pra travar) · <b>clique</b> atira · <b>botão direito / Z</b> mira (zoom) · <b>R</b> recarrega · <b>V</b> / botão do meio soca</p>
            <p><b>Espaço</b> pula · <b>Shift</b> corre · <b>C</b> agacha · <b>ESC / P</b> pausa</p>
            <p>Quiz: <b>1/2</b> · Pedra/papel/tesoura: <b>1/2/3</b> · Loja: <b>Q/E</b> troca de aba, <b>1–4</b> compra, <b>Enter</b> pronto</p>`}
            <p><b>Armas de verdade:</b> bala instantânea, pente e recarga, recuo que sobe a mira (puxe pra baixo), mira que abre andando/pulando e fecha agachado ou mirando. Headshot dá muito mais dano. Colete absorve metade do dano.</p>
            <p>Errou no quiz ou perdeu no pedra-papel-tesoura: <b>vai pro teto</b>. Quem fizer menos pontos num minigame
              joga o PvP seguinte com o <b>patinho</b> (fez 0) ou o <b>estilingue</b>, sem loja — mas se <b>eliminar alguém</b>, a loja libera no próximo round. Vence quem ganhar mais rounds.</p>
            <p><small>Modelos das armas: Ultimate Gun Pack, de Quaternius (CC0). Sons sintetizados no próprio jogo.</small></p>
            <p>Basquete: cada um tem a sua bola-bomba · ATIRAR arremessa (mire pra cima pra cesta) · no chão ou em alguém ela EXPLODE e arremessa · SOCO empurra · ninguém morre.</p>
          </div>
          <button data-act="back">VOLTAR</button>
        </div>
      </div>`);

    this.root = document.getElementById('menu');
    this.netEls = {
      lobby: this.root.querySelector('.net-lobby'),
      room: this.root.querySelector('.net-room'),
      big: this.root.querySelector('.net-code-big'),
      status: this.root.querySelector('.net-status'),
      code: this.root.querySelector('.net-code'),
      server: this.root.querySelector('.net-server'),
    };
    this.netEls.server.value = settings.data.lanServer ?? '';
    this.netEls.server.addEventListener('change', () => this.settings.set('lanServer', this.netEls.server.value.trim()));
    this.netEls.code.addEventListener('input', () => { this.netEls.code.value = this.netEls.code.value.toUpperCase(); });
    this.netEls.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._act('net-join'); e.stopPropagation(); });
    this.netEls.server.addEventListener('keydown', (e) => e.stopPropagation());
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
    else if (act === 'net') { this._netReset(); this.open('net'); }
    else if (act === 'net-host') this._netHost();
    else if (act === 'net-join') this._netJoin();
    else if (act === 'net-cancel') { g.cancelRoom(); this._netReset(); this.back(); }
    else if (act === 'back') this.back();
    else if (act === 'hud') {
      const from = this.current;
      this.hide();
      g.layout.open(() => this.show(from));
    }
  }

  // ---------------------------------------------------------------- rede
  _netReset() {
    const e = this.netEls;
    e.lobby.classList.remove('hidden');
    e.room.classList.add('hidden');
    e.status.textContent = this._lastNet ?? '';
    e.status.className = 'net-status';
    this._lastNet = null;
  }

  /** Mensagem de status (ex.: "o outro saiu da sala"), mostrada ao abrir o painel. */
  netStatus(text) {
    this._lastNet = text;
    this.netEls.status.textContent = text;
  }

  _netMsg(text, kind = '') {
    this.netEls.status.textContent = text;
    this.netEls.status.className = `net-status ${kind}`;
  }

  async _netHost() {
    const e = this.netEls;
    this.settings.set('lanServer', e.server.value.trim());
    this._netMsg('Criando sala…');
    try {
      const code = await this.game.hostRoom();
      e.lobby.classList.add('hidden');
      e.room.classList.remove('hidden');
      e.big.textContent = code;
      this._netMsg('');
    } catch (err) {
      this._netMsg(`Não deu pra criar a sala: ${netError(err)}`, 'bad');
    }
  }

  async _netJoin() {
    const e = this.netEls;
    const code = e.code.value.trim().toUpperCase();
    if (code.length < 4) { this._netMsg('Digite o código de 4 letras', 'bad'); return; }
    this.settings.set('lanServer', e.server.value.trim());
    this._netMsg('Conectando…');
    try {
      await this.game.joinRoom(code);
    } catch (err) {
      this._netMsg(netError(err), 'bad');
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
    this.root.classList.toggle('is-guest', this.game.role === 'guest');
    const q = this.root.querySelector('[data-panel="pause"] [data-act="quit"]');
    if (q) q.textContent = this.game.role === 'local' ? 'SAIR PARA O MENU' : 'SAIR DA SALA';
  }

  hide() {
    this.root.classList.add('hidden');
  }

  get visible() {
    return !this.root.classList.contains('hidden');
  }
}

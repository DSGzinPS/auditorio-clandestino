// Interface HTML/CSS sobreposta. Uma "metade" por jogador humano (contra o bot,
// uma só em tela cheia): quiz, loja, vida/colete, arma/dinheiro e avisos.
// Elementos globais: placar de rounds, kill feed e telas de resumo.

const hex = (n) => `#${(n ?? 0xffffff).toString(16).padStart(6, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class HUD {
  /**
   * @param humans índices dos jogadores com tela (ex.: [0] contra bot, [0,1] em tela dividida)
   */
  constructor(root, players, keyHints, humans = [0, 1], helpHtml = '', { touch = false } = {}) {
    this.touch = touch;
    this.root = root;
    this.players = players;
    this.humans = humans;
    this.onAnswer = null;
    this.onBuy = null;
    this.onReady = null;
    this.onVote = null;
    this.onUserGesture = null; // clique em "pronto" → pode travar o mouse
    this._cache = new Map();

    const opponents = (i) => players.filter((p) => p.index !== i);
    root.classList.toggle('single', humans.length === 1);
    root.innerHTML = `
      <div class="topbar">
        <div class="team-score" data-team="0"></div>
        <div class="phase"></div>
        <div class="team-score" data-team="1"></div>
      </div>
      <div class="divider"></div>
      <button class="pause-btn" tabindex="-1" title="Pausa">⏸</button>
      <div class="killfeed"></div>
      ${humans.map((i, slot) => `
        <section class="half half-${slot}" data-player="${i}" style="--accent:${hex(players[i].color)}">
          <div class="tag">P${i + 1} · ${esc(players[i].name)}</div>
          <div class="crosshair"><i></i><i></i><i></i><i></i><b></b></div>
          <div class="hitmark"></div>

          <div class="quiz hidden">
            <div class="quiz-head"><span class="quiz-count"></span><span class="quiz-timer"></span></div>
            <div class="quiz-question"></div>
            <div class="quiz-options">
              ${[0, 1].map((o) => `
                <button tabindex="-1" data-p="${i}" data-o="${o}"><kbd>${keyHints[i][o]}</kbd><span class="val"></span></button>`).join('')}
            </div>
            <div class="quiz-reward"></div>
            <div class="quiz-feedback"></div>
            <div class="quiz-opponents">
              ${opponents(i).map((p) => `
                <div data-op="${p.index}" style="color:${hex(p.color)}">${esc(p.name)}${p.isBot ? ' (bot)' : ''}: <span class="op-status"></span></div>`).join('')}
            </div>
          </div>

          <div class="rps hidden">
            <div class="quiz-head"><span class="rps-count"></span><span class="quiz-timer rps-timer"></span></div>
            <div class="quiz-question">PEDRA, PAPEL OU TESOURA?</div>
            <div class="rps-options">
              ${['✊|PEDRA', '✋|PAPEL', '✌️|TESOURA'].map((t, o) => `
                <button tabindex="-1" data-p="${i}" data-r="${o}"><span class="rps-icon">${t.split('|')[0]}</span><span>${t.split('|')[1]}</span><kbd>${keyHints[i][o] ?? o + 1}</kbd></button>`).join('')}
            </div>
            <div class="rps-board"></div>
            <div class="quiz-feedback rps-result"></div>
          </div>

          <div class="shop hidden">
            <div class="shop-head"><b>LOJA</b><span class="shop-timer"></span><span class="shop-money"></span></div>
            <div class="shop-restricted hidden"></div>
            <div class="shop-items"></div>
            <div class="shop-feedback"></div>
            <button tabindex="-1" class="shop-ready" data-p="${i}">PRONTO <kbd>Enter</kbd></button>
          </div>

          <div class="vitals">
            <div class="bar hp"><i></i><span></span></div>
            <div class="bar armor"><i></i><span></span></div>
          </div>
          <div class="loadout"><div class="weapon-name"></div><div class="ammo"></div><div class="money"></div></div>
          <div class="flash"></div>
          <div class="strip hidden"></div>
        </section>`).join('')}
      <div class="banner hidden"></div>
      <div class="lock-hint hidden">Clique na tela para mirar com o mouse · ESC solta</div>
      <div class="help">${helpHtml}</div>`;

    this.halves = [...root.querySelectorAll('.half')];
    this.halfOf = new Map(this.halves.map((h) => [Number(h.dataset.player), h]));
    this.phaseEl = root.querySelector('.phase');
    this.lockHint = root.querySelector('.lock-hint');
    this.banner = root.querySelector('.banner');
    this.feed = root.querySelector('.killfeed');

    this.onPause = null;
    const pb = root.querySelector('.pause-btn');
    pb.addEventListener('mousedown', (e) => e.preventDefault());
    pb.addEventListener('click', () => { if (!document.body.classList.contains('hud-editing')) this.onPause?.(); });

    root.querySelectorAll('button[data-o]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault()); // não rouba o foco
      btn.addEventListener('click', () => this.onAnswer?.(Number(btn.dataset.p), Number(btn.dataset.o)));
    });
    root.querySelectorAll('button[data-r]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => this.onRps?.(Number(btn.dataset.p), Number(btn.dataset.r)));
    });
    root.querySelectorAll('.shop-ready').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => { this.onReady?.(Number(btn.dataset.p)); this.onUserGesture?.(); });
    });
  }

  /** Elementos que o editor de HUD pode mover/redimensionar (só da 1ª tela). */
  editables() {
    const h = this.halves[0];
    return [
      ['pause', this.root.querySelector('.pause-btn'), 'Pausa'],
      ['topbar', this.root.querySelector('.topbar'), 'Placar'],
      ['vitals', h?.querySelector('.vitals'), 'Vida e colete'],
      ['loadout', h?.querySelector('.loadout'), 'Arma e dinheiro'],
    ];
  }

  _set(el, key, value, prop = 'textContent') {
    const k = `${key}`;
    if (this._cache.get(el)?.[k] === value) return;
    el[prop] = value;
    this._cache.set(el, { ...(this._cache.get(el) ?? {}), [k]: value });
  }

  // ---------------------------------------------------------------- todo frame
  update(game) {
    const m = game.flow.match;
    if (!m) return;
    for (const h of this.halves) {
      const p = this.players[Number(h.dataset.player)];
      const hpPct = Math.max(0, p.hp);
      h.querySelector('.hp i').style.width = `${hpPct}%`;
      this._set(h.querySelector('.hp span'), 't', p.dead ? 'CAIU' : `${Math.ceil(p.hp)} HP`);
      h.querySelector('.armor i').style.width = `${(p.armor / 50) * 100}%`;
      this._set(h.querySelector('.armor span'), 't', p.armor > 0 ? `${Math.ceil(p.armor)} colete` : '');
      const wn = game.weaponLabel ? game.weaponLabel(p)
        : game.meleeOnly ? 'Soco' : p.weapon.def.id === 'none' ? 'Mãos vazias (pegue o patinho!)' : p.weapon.def.name;
      this._set(h.querySelector('.weapon-name'), 't', wn);
      this._ammo(h, p, game);
      this._set(h.querySelector('.money'), 't', `$ ${m.money[p.index]}`);
    }
    this.root.querySelectorAll('.team-score').forEach((el) => {
      const t = Number(el.dataset.team);
      const color = hex(this.players.find((p) => p.team === t)?.color);
      this._set(el, 'h', `<span style="color:${color}">${esc(m.teamName(t))}</span> <b>${m.roundsWon[t] ?? 0}</b>`, 'innerHTML');
    });
  }

  /** Munição (pente / reserva) e mira que abre com a dispersão real da arma. */
  _ammo(h, p, game) {
    const w = p.weapon;
    const d = w.def;
    const show = !game.weaponLabel && !game.meleeOnly && d.mag > 0 && d.type !== 'throw';
    const el = h.querySelector('.ammo');
    let html = '';
    let cls = 'ammo';
    if (show) {
      if (w.reloading > 0) { html = `RECARREGANDO ${Math.round(w.reloadProgress * 100)}%`; cls += ' reloading'; }
      else {
        html = `${w.ammo}<small> / ${w.reserve === Infinity ? '∞' : w.reserve}</small>`;
        if (w.ammo <= Math.ceil(d.mag * 0.25)) cls += ' low';
      }
    }
    this._set(el, 'h', html, 'innerHTML');
    this._set(el, 'c', cls, 'className');
    const ch = h.querySelector('.crosshair');
    const spread = show && !p.dead ? w.currentSpread() : 0;
    const gap = Math.round(4 + Math.tan(spread) / Math.tan((37.5 * Math.PI) / 180) * (h.clientHeight / 2));
    if (ch._gap !== gap) { ch._gap = gap; ch.style.setProperty('--gap', `${Math.min(gap, 140)}px`); }
    ch.classList.toggle('ads', !!w.ads);
    ch.classList.toggle('reloading', w.reloading > 0);
  }

  setPhase(text) { this._set(this.phaseEl, 't', text); }
  setCrosshairs(v) { this.root.classList.toggle('show-crosshair', v); }
  setLockHint(v) { this.lockHint.classList.toggle('hidden', !v || this.touch); }

  // ---------------------------------------------------------------- quiz
  showQuiz(q, { index = 0, total = 1, reward = 0 } = {}) {
    this.hideStrip();
    for (const h of this.halves) {
      h.querySelector('.quiz').classList.remove('hidden', 'mini');
      h.querySelector('.quiz-count').textContent = `PERGUNTA ${index + 1}/${total}`;
      h.querySelector('.quiz-question').textContent = q.text;
      h.querySelector('.quiz-reward').textContent = `Acertou: +$${reward} · Errou: TETO`;
      h.querySelector('.quiz-feedback').textContent = '';
      h.querySelectorAll('.op-status').forEach((s) => { s.textContent = 'pensando…'; s.className = 'op-status'; });
      h.querySelectorAll('.quiz-options button').forEach((b, o) => {
        b.disabled = false;
        b.className = '';
        b.querySelector('.val').textContent = q.options[o];
      });
    }
  }

  setQuizTimer(t) {
    for (const h of this.halves) h.querySelectorAll('.quiz-timer').forEach((el) => { el.textContent = `${t.toFixed(1)}s`; });
  }

  markAnswer(pi, oi, correct) {
    const own = this.halfOf.get(pi);
    if (own) {
      own.querySelectorAll('.quiz-options button').forEach((b, o) => {
        b.disabled = true;
        if (o === oi) b.classList.add('picked', correct ? 'right' : 'wrong');
      });
      own.querySelector('.quiz-feedback').textContent = correct ? 'Acertou!' : oi === -1 ? 'Não respondeu a tempo…' : 'Errou!';
    }
    for (const h of this.halves) {
      const s = h.querySelector(`[data-op="${pi}"] .op-status`);
      if (!s) continue;
      s.textContent = correct ? 'acertou ✔' : oi === -1 ? 'não respondeu → TETO!' : 'errou → TETO!';
      s.className = `op-status ${correct ? 'right' : 'wrong'}`;
    }
  }

  /**
   * Alguém foi arremessado: libera a vista. Quem já respondeu perde o cartão;
   * quem ainda não respondeu fica com um cartão mini no rodapé (ainda dá pra responder).
   */
  quizWatch(answered) {
    for (const h of this.halves) {
      const pi = Number(h.dataset.player);
      const card = h.querySelector('.quiz');
      if (answered[pi] !== null) card.classList.add('hidden');
      else card.classList.add('mini');
    }
  }

  /** Faixa discreta no topo (resultado enquanto todo mundo assiste ao voo). */
  strip(text, ms = 2600) {
    for (const h of this.halves) {
      const el = h.querySelector('.strip');
      el.textContent = text;
      el.classList.remove('hidden');
    }
    clearTimeout(this._stripT);
    this._stripT = setTimeout(() => this.hideStrip(), ms);
  }

  hideStrip() {
    for (const h of this.halves) h.querySelector('.strip').classList.add('hidden');
  }

  revealCorrect(ci) {
    for (const h of this.halves) h.querySelectorAll('.quiz-options button')[ci].classList.add('correct');
  }

  hideQuiz() {
    for (const h of this.halves) h.querySelector('.quiz').classList.add('hidden');
  }

  // ---------------------------------------------------------------- pedra, papel e tesoura
  _rpsBoard(wins, picks = null) {
    const icons = ['✊', '✋', '✌️'];
    return this.players.map((p, i) => `<div style="color:${hex(p.color)}">${esc(p.name)}${p.isBot ? ' (bot)' : ''}: `
      + `<b>${wins[i]}</b> ${picks ? `<span class="rps-pick">${picks[i] === null ? '—' : icons[picks[i]]}</span>` : `<span class="rps-wait" data-w="${i}">pensando…</span>`}</div>`).join('');
  }

  showRps({ wins, need, reward, round }) {
    this.hideStrip();
    for (const h of this.halves) {
      h.querySelector('.rps').classList.remove('hidden');
      h.querySelector('.rps-count').textContent = `RODADA ${round} · QUEM FIZER ${need} GANHA · +$${reward}`;
      h.querySelector('.rps-board').innerHTML = this._rpsBoard(wins);
      h.querySelector('.rps-result').textContent = 'Perdeu a rodada: TETO';
      h.querySelectorAll('.rps-options button').forEach((b) => { b.disabled = false; b.className = ''; });
    }
  }

  markRps(pi, choice) {
    const own = this.halfOf.get(pi);
    if (own) {
      own.querySelectorAll('.rps-options button').forEach((b, o) => {
        b.disabled = true;
        if (o === choice) b.classList.add('picked');
      });
    }
    for (const h of this.halves) {
      const w = h.querySelector(`.rps-wait[data-w="${pi}"]`);
      if (w) w.textContent = 'escolheu ✔';
    }
  }

  revealRps(picks, wins, text) {
    for (const h of this.halves) {
      h.querySelector('.rps-board').innerHTML = this._rpsBoard(wins, picks);
      h.querySelector('.rps-result').textContent = text;
      h.querySelectorAll('.rps-options button').forEach((b) => { b.disabled = true; });
    }
  }

  hideRps() {
    for (const h of this.halves) h.querySelector('.rps').classList.add('hidden');
  }

  // ---------------------------------------------------------------- loja
  /** @param tabs [{id, name, items:[shopItem]}] */
  showShop(match, tabs) {
    this.shopTabs = tabs;
    this.shopItems = tabs.flatMap((t) => t.items);
    for (const h of this.halves) {
      const pi = Number(h.dataset.player);
      const shop = h.querySelector('.shop');
      shop.classList.remove('hidden');
      h.querySelector('.shop-feedback').textContent = '';
      h.querySelector('.shop-ready').classList.remove('done');
      const r = match.restrictions[pi];
      const rest = h.querySelector('.shop-restricted');
      rest.classList.toggle('hidden', !r);
      rest.textContent = r === 'duck'
        ? 'Você zerou o minigame: só o patinho de borracha. Elimine alguém para liberar a loja!'
        : r === 'weak' ? 'Você perdeu o minigame: só o estilingue. Elimine alguém para liberar a loja!' : '';
      const tabBar = this.touch ? '' : '<kbd>Q</kbd>';
      h.querySelector('.shop-items').innerHTML = `
        <div class="shop-tabs">${tabBar}${tabs.map((t, n) => `<button tabindex="-1" data-tab="${n}" data-p="${pi}">${esc(t.name)}</button>`).join('')}${this.touch ? '' : '<kbd>E</kbd>'}</div>
        ${tabs.map((t, n) => `<div class="shop-page" data-page="${n}">${t.items.map((it, k) => `
          <button tabindex="-1" data-item="${it.id}" data-p="${pi}">
            <kbd>${k + 1}</kbd>
            <span class="it-name">${esc(it.name)}</span>
            <span class="it-stats">${this._itemStats(it)}</span>
            <span class="it-price">$${it.price}</span>
          </button>`).join('')}</div>`).join('')}`;
      h.querySelectorAll('.shop-items button').forEach((b) => {
        b.addEventListener('mousedown', (e) => e.preventDefault());
        if (b.dataset.tab) b.addEventListener('click', () => this.onTab?.(Number(b.dataset.p), Number(b.dataset.tab)));
        else b.addEventListener('click', () => this.onBuy?.(Number(b.dataset.p), b.dataset.item));
      });
      this.setShopTab(pi, 0);
    }
  }

  _itemStats(it) {
    if (it.kind === 'armor') return `+${it.points} colete`;
    if (it.explosive) return `explosivo ${it.explosive.damage} · raio ${it.explosive.radius} m · ${it.mag}+${it.reserve}`;
    const dmg = `${it.damage}${it.pellets > 1 ? '×' + it.pellets : ''}`;
    return `${dmg} dano · ${it.rpm} rpm · ${it.mag}/${it.reserve === Infinity ? '∞' : it.reserve}${it.auto ? ' · auto' : ''}`;
  }

  setShopTab(pi, tab) {
    const h = this.halfOf.get(pi);
    if (!h) return;
    h.querySelectorAll('.shop-tabs button').forEach((b) => b.classList.toggle('on', Number(b.dataset.tab) === tab));
    h.querySelectorAll('.shop-page').forEach((pg) => pg.classList.toggle('hidden', Number(pg.dataset.page) !== tab));
  }

  updateShop(match, timeLeft, readySet) {
    for (const h of this.halves) {
      const pi = Number(h.dataset.player);
      const money = match.money[pi];
      this._set(h.querySelector('.shop-timer'), 't', `${Math.ceil(timeLeft)}s`);
      this._set(h.querySelector('.shop-money'), 't', `$ ${money}`);
      h.querySelector('.shop-ready').classList.toggle('done', readySet.has(pi));
      const locked = !match.canShop(pi);
      h.querySelectorAll('.shop-items button[data-item]').forEach((b) => {
        const it = this.shopItems.find((x) => x.id === b.dataset.item);
        const p = this.players[pi];
        const owned = it.kind === 'weapon' ? p.weapon.def.id === it.id : p.armor >= it.points;
        b.disabled = locked || money < it.price || owned;
        b.classList.toggle('owned', owned);
      });
    }
  }

  shopFeedback(pi, text, ok) {
    const h = this.halfOf.get(pi);
    if (!h) return;
    const el = h.querySelector('.shop-feedback');
    el.textContent = text;
    el.className = `shop-feedback ${ok ? 'right' : 'wrong'}`;
  }

  hideShop() {
    for (const h of this.halves) h.querySelector('.shop').classList.add('hidden');
  }

  // ---------------------------------------------------------------- avisos
  /** @param index jogador (sem tela = ignorado) ou null = todas as telas */
  flash(index, text, kind = 'info') {
    const targets = index === null ? this.halves : [this.halfOf.get(index)].filter(Boolean);
    for (const h of targets) {
      const el = h.querySelector('.flash');
      el.textContent = text;
      el.className = `flash ${kind}`;
      void el.offsetWidth; // reinicia a animação CSS
      el.classList.add('show');
    }
  }

  /** Número de dano perto da mira de quem acertou. */
  hit(ctx) {
    const h = this.halfOf.get(ctx.attacker?.index);
    if (!h) return;
    const el = h.querySelector('.hitmark');
    el.textContent = `-${ctx.damage}${ctx.headshot ? ' HEADSHOT' : ''}${ctx.killed ? ' ☠' : ''}`;
    el.className = `hitmark ${ctx.headshot ? 'head' : ''}`;
    void el.offsetWidth;
    el.classList.add('show');
  }

  killfeed(attacker, target, weapon, tags = []) {
    const row = document.createElement('div');
    row.innerHTML = `<span style="color:${hex(attacker.color)}">${esc(attacker.name)}</span> `
      + `<em>[${esc(weapon.name)}${tags.length ? ' · ' + esc(tags.join(' · ')) : ''}]</em> `
      + `<span style="color:${hex(target.color)}">${esc(target.name)}</span>`;
    this.feed.prepend(row);
    while (this.feed.children.length > 5) this.feed.lastChild.remove();
    setTimeout(() => row.remove(), 7000);
  }

  // ---------------------------------------------------------------- resumos
  showRoundSummary(match, title, perPlayer) {
    const blocks = this.humans.map((i) => {
      const list = perPlayer[i];
      const total = list.reduce((s, r) => s + r.amount, 0);
      return `<div class="sum-player"><h4 style="color:${hex(this.players[i].color)}">${esc(this.players[i].name)}</h4>
        ${list.length ? list.map((r) => `<div>+$${r.amount} <small>${esc(r.reason)}</small></div>`).join('') : '<div><small>sem recompensa neste round</small></div>'}
        <div class="sum-total">Total: +$${total} · saldo $${match.money[i]}</div></div>`;
    }).join('');
    this._banner(`<h2>${esc(title)}</h2><div class="sum-score">${this._scoreLine(match)}</div><div class="sum-grid">${blocks}</div>`);
  }

  showMatchSummary(match, title) {
    const rows = this.players.map((p, i) => `<tr><td style="color:${hex(p.color)}">${esc(p.name)}${p.isBot ? ' (bot)' : ''}</td>
      <td>${match.roundsWon[p.team] ?? 0}</td><td>${match.kills[i]}</td><td>${match.deaths[i]}</td><td>${match.quizCorrect[i]}</td><td>$${match.money[i]}</td></tr>`).join('');
    const buttons = this.humans.map((i) => `<div class="vote-row" data-p="${i}">
        ${this.humans.length > 1 ? `<b style="color:${hex(this.players[i].color)}">${esc(this.players[i].name)}</b>` : ''}
        <button tabindex="-1" class="vote-btn rematch" data-p="${i}" data-v="rematch">PEDIR REVANCHE</button>
        <button tabindex="-1" class="vote-btn leave" data-p="${i}" data-v="leave">SAIR DA SALA</button>
      </div>`).join('');
    this._banner(`<h2>${esc(title)}</h2>
      <table><tr><th></th><th>Rounds</th><th>Kills</th><th>Mortes</th><th>Quiz</th><th>Dinheiro</th></tr>${rows}</table>
      <div class="votes"></div>${buttons}`);
    this.banner.classList.add('interactive');
    this.banner.querySelectorAll('.vote-btn').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => this.onVote?.(Number(btn.dataset.p), btn.dataset.v));
    });
  }

  /** Mostra quem já pediu/aceitou revanche. O botão vira "ACEITAR" quando o outro pediu. */
  updateVotes(votes) {
    const el = this.banner.querySelector('.votes');
    if (!el) return;
    el.innerHTML = this.players.map((p, i) => {
      const v = votes[i];
      const txt = v === 'rematch' ? 'quer revanche ✔' : v === 'leave' ? 'saiu da sala' : 'decidindo…';
      return `<span class="vote ${v ?? ''}" style="color:${hex(p.color)}">${esc(p.name)}${p.isBot ? ' (bot)' : ''}: <b>${txt}</b></span>`;
    }).join('');
    const someoneAsked = votes.some((v) => v === 'rematch');
    this.banner.querySelectorAll('.vote-row').forEach((row) => {
      const i = Number(row.dataset.p);
      const btn = row.querySelector('.rematch');
      btn.textContent = votes[i] === 'rematch' ? 'ESPERANDO O OUTRO…' : someoneAsked ? 'ACEITAR REVANCHE' : 'PEDIR REVANCHE';
      btn.disabled = votes[i] !== null;
      row.querySelector('.leave').disabled = votes[i] === 'leave';
    });
  }

  _scoreLine(match) {
    return match.teams.map((t) => `${esc(match.teamName(t))} <b>${match.roundsWon[t]}</b>`).join(' &nbsp;×&nbsp; ');
  }

  _banner(html) {
    this.banner.innerHTML = html;
    this.banner.classList.remove('hidden');
  }

  hideBanner() {
    this.banner.classList.add('hidden');
    this.banner.classList.remove('interactive');
  }
}

/** HUD que não faz nada — usado nos testes headless. */
export class NullHUD {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
}

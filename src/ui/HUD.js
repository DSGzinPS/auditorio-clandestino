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
      <div class="killfeed"></div>
      ${humans.map((i, slot) => `
        <section class="half half-${slot}" data-player="${i}" style="--accent:${hex(players[i].color)}">
          <div class="tag">P${i + 1} · ${esc(players[i].name)}</div>
          <div class="crosshair"></div>
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
          <div class="loadout"><div class="weapon-name"></div><div class="money"></div></div>
          <div class="flash"></div>
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
      this._set(h.querySelector('.money'), 't', `$ ${m.money[p.index]}`);
    }
    this.root.querySelectorAll('.team-score').forEach((el) => {
      const t = Number(el.dataset.team);
      const color = hex(this.players.find((p) => p.team === t)?.color);
      this._set(el, 'h', `<span style="color:${color}">${esc(m.teamName(t))}</span> <b>${m.roundsWon[t] ?? 0}</b>`, 'innerHTML');
    });
  }

  setPhase(text) { this._set(this.phaseEl, 't', text); }
  setCrosshairs(v) { this.root.classList.toggle('show-crosshair', v); }
  setLockHint(v) { this.lockHint.classList.toggle('hidden', !v || this.touch); }

  // ---------------------------------------------------------------- quiz
  showQuiz(q, { index = 0, total = 1, reward = 0 } = {}) {
    for (const h of this.halves) {
      h.querySelector('.quiz').classList.remove('hidden');
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
  showShop(match, items) {
    this.shopItems = items;
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
        ? 'Você errou TODAS no quiz: só o patinho de borracha. Sem compras nesta etapa.'
        : r === 'weak' ? 'Você perdeu o quiz: só o estilingue. Sem compras nesta etapa.' : '';
      const list = h.querySelector('.shop-items');
      list.innerHTML = items.map((it, n) => `
        <button tabindex="-1" data-item="${it.id}" data-p="${pi}">
          <kbd>${n + 1}</kbd>
          <span class="it-name">${esc(it.name)}</span>
          <span class="it-stats">${it.kind === 'weapon'
            ? `${it.damage}${it.pellets > 1 ? '×' + it.pellets : ''} dano · ${(1 / it.cooldown).toFixed(1)}/s${it.ragdoll ? ' · derruba' : ''}`
            : `+${it.points} colete`}</span>
          <span class="it-price">$${it.price}</span>
        </button>`).join('');
      list.querySelectorAll('button').forEach((b) => {
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => this.onBuy?.(Number(b.dataset.p), b.dataset.item));
      });
    }
  }

  updateShop(match, timeLeft, readySet) {
    for (const h of this.halves) {
      const pi = Number(h.dataset.player);
      const money = match.money[pi];
      this._set(h.querySelector('.shop-timer'), 't', `${Math.ceil(timeLeft)}s`);
      this._set(h.querySelector('.shop-money'), 't', `$ ${money}`);
      h.querySelector('.shop-ready').classList.toggle('done', readySet.has(pi));
      const locked = !match.canShop(pi);
      h.querySelectorAll('.shop-items button').forEach((b) => {
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
    this._banner(`<h2>${esc(title)}</h2>
      <table><tr><th></th><th>Rounds</th><th>Kills</th><th>Mortes</th><th>Quiz</th><th>Dinheiro</th></tr>${rows}</table>
      <p><small>Nova partida em instantes…</small></p>`);
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
  }
}

/** HUD que não faz nada — usado nos testes headless. */
export class NullHUD {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
}

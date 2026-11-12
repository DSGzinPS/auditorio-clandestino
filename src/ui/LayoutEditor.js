// Editor de HUD: arraste os botões/elementos e mude o tamanho no slider.
// O layout fica salvo no aparelho (localStorage) e é aplicado ao abrir o jogo.

const KEY = 'auditorio-hud-layout-v1';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class LayoutEditor {
  constructor({ onOpen, onClose } = {}) {
    this.items = new Map(); // id → { el, label }
    this.layout = {};
    this.selected = null;
    this.onOpenHook = onOpen;
    this.onCloseHook = onClose;
    try { this.layout = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { this.layout = {}; }

    document.body.insertAdjacentHTML('beforeend', `
      <div class="hud-editor hidden">
        <div class="he-top">Arraste os itens para mover · toque num item e use o controle para mudar o tamanho</div>
        <div class="he-bar">
          <span class="he-label">Escolha um item</span>
          <input class="he-size" type="range" min="0.5" max="2.2" step="0.05" value="1" disabled>
          <button class="he-reset">Padrão</button>
          <button class="he-done">Pronto</button>
        </div>
      </div>`);
    this.root = document.querySelector('.hud-editor');
    this.label = this.root.querySelector('.he-label');
    this.size = this.root.querySelector('.he-size');
    this.size.addEventListener('input', () => this._setScale(Number(this.size.value)));
    this.root.querySelector('.he-reset').addEventListener('click', () => this.reset());
    this.root.querySelector('.he-done').addEventListener('click', () => this.close());
  }

  /** @param list [[id, element, rótulo], ...] */
  register(list) {
    for (const [id, el, label] of list) {
      if (!el) continue;
      el.dataset.hudId = id;
      this.items.set(id, { el, label });
      this._attachDrag(id, el);
      this._apply(id);
    }
  }

  _apply(id) {
    const it = this.items.get(id);
    if (!it) return;
    const l = this.layout[id];
    const el = it.el;
    if (!l) {
      el.classList.remove('hud-custom');
      el.style.removeProperty('left');
      el.style.removeProperty('top');
      el.style.removeProperty('--s');
      return;
    }
    el.classList.add('hud-custom');
    el.style.left = `${l.x * 100}%`;
    el.style.top = `${l.y * 100}%`;
    el.style.setProperty('--s', l.s);
  }

  applyAll() {
    for (const id of this.items.keys()) this._apply(id);
  }

  /** Converte um item ainda "padrão" para posição livre, sem pular de lugar. */
  _ensureCustom(id) {
    if (this.layout[id]) return this.layout[id];
    const r = this.items.get(id).el.getBoundingClientRect();
    this.layout[id] = { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight, s: 1 };
    this._apply(id);
    return this.layout[id];
  }

  _select(id) {
    this.items.forEach((it, k) => it.el.classList.toggle('he-sel', k === id));
    this.selected = id;
    const it = this.items.get(id);
    this.label.textContent = it ? it.label : 'Escolha um item';
    this.size.disabled = !it;
    if (it) {
      this.size.value = this.layout[id]?.s ?? 1;
      const r = it.el.getBoundingClientRect();
      this._dodge((r.top + r.height / 2) / innerHeight);
    }
  }

  /** A barra do editor sai da frente: item lá embaixo → barra vai pro topo. */
  _dodge(y) {
    this.root.classList.toggle('bar-top', y > 0.62);
  }

  _setScale(s) {
    if (!this.selected) return;
    const l = this._ensureCustom(this.selected);
    l.s = s;
    this._apply(this.selected);
  }

  _attachDrag(id, el) {
    let pid = null, ox = 0, oy = 0;
    el.addEventListener('pointerdown', (e) => {
      if (!this.isOpen) return;
      e.preventDefault();
      e.stopPropagation();
      this._select(id);
      const l = this._ensureCustom(id);
      pid = e.pointerId;
      el.setPointerCapture(pid);
      ox = e.clientX - l.x * innerWidth;
      oy = e.clientY - l.y * innerHeight;
    }, true);
    el.addEventListener('pointermove', (e) => {
      if (!this.isOpen || e.pointerId !== pid) return;
      const l = this.layout[id];
      l.x = clamp((e.clientX - ox) / innerWidth, 0.02, 0.98);
      l.y = clamp((e.clientY - oy) / innerHeight, 0.03, 0.97);
      this._apply(id);
      this._dodge(l.y);
    });
    const end = (e) => { if (e.pointerId === pid) pid = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open(onClose) {
    this._afterClose = onClose;
    document.body.classList.add('hud-editing');
    this.root.classList.remove('hidden');
    this._select(null);
    this.onOpenHook?.();
  }

  close() {
    document.body.classList.remove('hud-editing');
    this.root.classList.add('hidden');
    this.items.forEach((it) => it.el.classList.remove('he-sel'));
    try { localStorage.setItem(KEY, JSON.stringify(this.layout)); } catch { /* ignora */ }
    this.onCloseHook?.();
    const cb = this._afterClose;
    this._afterClose = null;
    cb?.();
  }

  reset() {
    this.layout = {};
    this.applyAll();
    this._select(null);
  }
}

// Controles de toque (celular): joystick virtual à esquerda, arrastar à direita
// para mirar, botões ATIRAR (arrastável: mira enquanto atira) e SOCO.
// Quiz e loja continuam sendo tocados direto nos botões do HUD.

export const isTouchDevice = () =>
  typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

const STICK_RADIUS = 55;

export class TouchControls {
  constructor(parent = document.body) {
    this.moveX = 0;
    this.moveZ = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.fire = false;
    this.melee = false;
    this.jump = false;
    this.adsOn = false;    // MIRA, AGACHAR e CORRER são liga/desliga
    this.reload = false;
    this.crouchOn = false;
    this.sprintOn = false;
    this.stickSprint = false; // joystick no talo também corre
    this.visible = false;
    this.enabled = true;   // false durante o editor de HUD

    parent.insertAdjacentHTML('beforeend', `
      <div class="touch-layer hidden">
        <div class="touch-move"><div class="stick-base"><div class="stick-knob"></div></div></div>
        <div class="touch-look"></div>
        <div class="touch-btn touch-melee">SOCO</div>
        <div class="touch-btn touch-fire">ATIRAR</div>
        <div class="touch-btn touch-jump">PULAR</div>
        <div class="touch-btn touch-crouch">AGACHAR</div>
        <div class="touch-btn touch-sprint">CORRER</div>
        <div class="touch-btn touch-ads">MIRA</div>
        <div class="touch-btn touch-reload">RECARREGAR</div>
      </div>`);
    this.layer = parent.querySelector('.touch-layer');
    this.base = this.layer.querySelector('.stick-base');
    this.knob = this.layer.querySelector('.stick-knob');

    this._stick(this.layer.querySelector('.touch-move'));
    this._drag(this.layer.querySelector('.touch-look'));
    this._button(this.layer.querySelector('.touch-fire'), 'fire', true);
    this._button(this.layer.querySelector('.touch-melee'), 'melee', false);
    this._button(this.layer.querySelector('.touch-jump'), 'jump', false);
    this._toggle(this.layer.querySelector('.touch-crouch'), 'crouchOn', 'sprintOn');
    this._toggle(this.layer.querySelector('.touch-sprint'), 'sprintOn', 'crouchOn');
    this._toggle(this.layer.querySelector('.touch-ads'), 'adsOn', 'sprintOn');
    this._button(this.layer.querySelector('.touch-reload'), 'reload', false);
  }

  /** Elementos que o editor de HUD pode mover/redimensionar. */
  editables() {
    const q = (c) => this.layer.querySelector(c);
    return [
      ['fire', q('.touch-fire'), 'Atirar'], ['melee', q('.touch-melee'), 'Soco'], ['jump', q('.touch-jump'), 'Pular'],
      ['crouch', q('.touch-crouch'), 'Agachar'], ['sprint', q('.touch-sprint'), 'Correr'],
      ['ads', q('.touch-ads'), 'Mira'], ['reload', q('.touch-reload'), 'Recarregar'],
    ];
  }

  _toggle(el, key, other) {
    el.addEventListener('pointerdown', () => {
      if (!this.enabled) return;
      this[key] = !this[key];
      if (this[key]) this[other] = false;
      this._syncToggles();
    });
  }

  _syncToggles() {
    this.layer.querySelector('.touch-crouch').classList.toggle('on', this.crouchOn);
    this.layer.querySelector('.touch-sprint').classList.toggle('on', this.sprintOn);
    this.layer.querySelector('.touch-ads').classList.toggle('on', this.adsOn);
  }

  setVisible(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.layer.classList.toggle('hidden', !v);
    if (!v) this._resetAll();
  }

  /** Lê e zera o que é acumulado (giro da mira). */
  consume() {
    // toque rápido (aperta e solta entre dois quadros) conta pelo menos uma vez
    const r = {
      moveX: this.moveX, moveZ: this.moveZ, lookDX: this.lookDX, lookDY: this.lookDY,
      fire: this.fire || this.firePressed, melee: this.melee || this.meleePressed,
      jump: this.jump || this.jumpPressed,
      ads: this.adsOn,
      reload: this.reload || this.reloadPressed,
      crouch: this.crouchOn,
      sprint: this.sprintOn || this.stickSprint,
    };
    this.lookDX = 0;
    this.lookDY = 0;
    this.firePressed = false;
    this.meleePressed = false;
    this.jumpPressed = false;
    this.reloadPressed = false;
    return r;
  }

  _resetAll() {
    this.moveX = this.moveZ = this.lookDX = this.lookDY = 0;
    this.fire = this.melee = this.jump = false;
    this.firePressed = this.meleePressed = this.jumpPressed = false;
    this.crouchOn = this.sprintOn = this.stickSprint = this.adsOn = false;
    this.reload = this.reloadPressed = false;
    this._syncToggles();
    this.base.classList.remove('on');
  }

  // joystick que aparece onde o dedo encostar
  _stick(zone) {
    let id = null, ox = 0, oy = 0;
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null || !this.enabled) return;
      id = e.pointerId;
      zone.setPointerCapture(id);
      const r = zone.getBoundingClientRect();
      ox = e.clientX; oy = e.clientY;
      this.base.style.left = `${ox - r.left}px`;
      this.base.style.top = `${oy - r.top}px`;
      this.base.classList.add('on');
      this.knob.style.transform = 'translate(-50%, -50%)';
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) { dx *= STICK_RADIUS / len; dy *= STICK_RADIUS / len; }
      this.moveX = dx / STICK_RADIUS;
      this.moveZ = -dy / STICK_RADIUS;
      this.stickSprint = this.moveZ > 0.92; // empurrou pra frente até o fim = corre
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.moveX = this.moveZ = 0;
      this.stickSprint = false;
      this.base.classList.remove('on');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  // arrastar = girar a mira
  _drag(zone, onDown, onUp) {
    let id = null, lx = 0, ly = 0;
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null || !this.enabled) return;
      id = e.pointerId;
      zone.setPointerCapture(id);
      lx = e.clientX; ly = e.clientY;
      onDown?.();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      this.lookDX += e.clientX - lx;
      this.lookDY += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      onUp?.();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  _button(el, key, aimWhileHeld) {
    const down = () => { this[key] = true; this[`${key}Pressed`] = true; el.classList.add('on'); };
    const up = () => { this[key] = false; el.classList.remove('on'); };
    if (aimWhileHeld) {
      this._drag(el, down, up);
    } else {
      el.addEventListener('pointerdown', (e) => { if (!this.enabled) return; el.setPointerCapture(e.pointerId); down(); });
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }
  }
}

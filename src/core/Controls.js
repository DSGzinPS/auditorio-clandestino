// Esquemas de controle: transformam Input (e Gamepad) numa "intenção"
// neutra que os personagens e estados consomem. Assim, trocar teclado
// por controle ou por IA no futuro não mexe em Character nem nos estados.

import { CONFIG } from '../config.js';

export const blankIntent = () => ({
  moveX: 0,   // -1 esquerda … +1 direita
  moveZ: 0,   // -1 trás … +1 frente
  lookX: 0,   // radianos neste frame (+ = vira p/ direita)
  lookY: 0,   // radianos neste frame (+ = olha p/ baixo)
  fire: false,
  melee: false,
  answer: null, // 0 | 1 | null  (quiz)
  buy: null,    // índice no SHOP_ORDER | null  (loja)
  ready: false, // "pronto" na loja
});

const BUY_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];

export const P1_BINDINGS = {
  forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  fire: ['KeyF'], // além do clique esquerdo
  melee: ['KeyV'], // além do clique direito
  answerA: ['Digit1'], answerB: ['Digit2'],
  buy: BUY_KEYS,
  ready: ['Enter', 'KeyR'],
  hints: ['1', '2'],
};

export const P2_BINDINGS = {
  forward: ['ArrowUp'], back: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
  lookLeft: ['KeyJ', 'Numpad4'], lookRight: ['KeyL', 'Numpad6'],
  lookUp: ['KeyI', 'Numpad8'], lookDown: ['KeyK', 'Numpad5'],
  fire: ['Enter', 'NumpadEnter', 'Numpad0'],
  melee: ['ShiftRight', 'NumpadDecimal'],
  answerA: ['Digit9', 'Numpad1'], answerB: ['Digit0', 'Numpad2'],
  buy: [], // P2 compra clicando
  ready: ['NumpadAdd'],
  hints: ['9', '0'],
};

const axis = (input, pos, neg) => (input.anyDown(pos) ? 1 : 0) - (input.anyDown(neg) ? 1 : 0);

/** P1: WASD + mouse (pointer lock). */
export class KeyboardMouseScheme {
  /** @param touch TouchControls opcional (celular) — somado ao teclado/mouse */
  constructor(input, bindings = P1_BINDINGS, touch = null) {
    this.input = input;
    this.b = bindings;
    this.touch = touch;
  }

  read() {
    const i = this.input, b = this.b, it = blankIntent();
    it.moveZ = axis(i, b.forward, b.back);
    it.moveX = axis(i, b.right, b.left);
    const m = i.consumeMouse();
    it.lookX = m.dx * CONFIG.character.mouseSensitivity;
    it.lookY = m.dy * CONFIG.character.mouseSensitivity;
    it.fire = (i.locked && i.mouseButtons.has(0)) || i.anyDown(b.fire);
    it.melee = (i.locked && i.mouseButtons.has(2)) || i.anyDown(b.melee);
    if (i.anyPressed(b.answerA)) it.answer = 0;
    else if (i.anyPressed(b.answerB)) it.answer = 1;
    b.buy.forEach((code, n) => { if (i.pressed.has(code)) it.buy = n; });
    it.ready = i.anyPressed(b.ready);
    if (this.touch) {
      const t = this.touch.consume();
      const s = CONFIG.character.touchLookSensitivity;
      it.moveX += t.moveX;
      it.moveZ += t.moveZ;
      it.lookX += t.lookDX * s;
      it.lookY += t.lookDY * s;
      it.fire ||= t.fire;
      it.melee ||= t.melee;
    }
    return it;
  }
}

/** P2: setas + IJKL no teclado, OU o primeiro gamepad conectado (recomendado). */
export class KeyboardGamepadScheme {
  constructor(input, bindings = P2_BINDINGS) {
    this.input = input;
    this.b = bindings;
    this.prevA = false;
    this.prevB = false;
  }

  read(dt) {
    const i = this.input, b = this.b, it = blankIntent();
    it.moveZ = axis(i, b.forward, b.back);
    it.moveX = axis(i, b.right, b.left);
    const ks = CONFIG.character.keyLookSpeed * dt;
    it.lookX = axis(i, b.lookRight, b.lookLeft) * ks;
    it.lookY = axis(i, b.lookDown, b.lookUp) * ks;
    it.fire = i.anyDown(b.fire);
    it.melee = i.anyDown(b.melee);
    it.ready = i.anyPressed(b.ready);
    if (i.anyPressed(b.answerA)) it.answer = 0;
    else if (i.anyPressed(b.answerB)) it.answer = 1;

    const pad = firstGamepad();
    if (pad) {
      const dz = (v = 0) => (Math.abs(v) < 0.18 ? 0 : v);
      const ps = CONFIG.character.padLookSpeed * dt;
      it.moveX += dz(pad.axes[0]);
      it.moveZ -= dz(pad.axes[1]);
      it.lookX += dz(pad.axes[2]) * ps;
      it.lookY += dz(pad.axes[3]) * ps;
      const btn = (n) => !!pad.buttons[n]?.pressed;
      it.fire ||= btn(7);  // RT
      it.melee ||= btn(5); // RB
      it.ready ||= btn(9); // Start
      const a = btn(2), bb = btn(1); // X(□) = opção 1, B(○) = opção 2
      if (a && !this.prevA) it.answer = 0;
      else if (bb && !this.prevB) it.answer = 1;
      this.prevA = a;
      this.prevB = bb;
    }
    return it;
  }
}

function firstGamepad() {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) return p;
  return null;
}

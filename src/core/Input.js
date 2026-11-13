// Estado bruto de teclado e mouse. Não sabe nada de jogo:
// os "esquemas de controle" (Controls.js) traduzem isso em intenções.

const BLOCK_DEFAULT = new Set(['Tab', 
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'Enter', 'NumpadEnter', 'Tab',
]);

export class Input {
  constructor(element) {
    this.element = element;
    this.down = new Set();
    this.pressed = new Set(); // apertadas neste frame
    this.mouseButtons = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;

    window.addEventListener('keydown', (e) => {
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseButtons.clear();
    });

    this.onLockLost = null; // jogador apertou ESC (não fomos nós que soltamos)
    this._releasing = false;
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === element;
      if (!this.locked) this.mouseButtons.clear();
      if (was && !this.locked && !this._releasing) this.onLockLost?.();
      this._releasing = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    element.addEventListener('mousedown', (e) => this.mouseButtons.add(e.button));
    element.addEventListener('contextmenu', (e) => e.preventDefault()); // botão direito = mirar
    window.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
  }

  anyDown(codes) {
    return codes.some((c) => this.down.has(c));
  }

  anyPressed(codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  consumeMouse() {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  requestLock() {
    this.element.requestPointerLock?.();
  }

  releaseLock() {
    if (document.pointerLockElement) {
      this._releasing = true;
      document.exitPointerLock();
    }
  }

  endFrame() {
    this.pressed.clear();
  }
}

// Estado bruto de teclado e mouse. Não sabe nada de jogo:
// os "esquemas de controle" (Controls.js) traduzem isso em intenções.

const BLOCK_DEFAULT = new Set([
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

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === element;
      if (!this.locked) this.mouseButtons.clear();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    element.addEventListener('mousedown', (e) => this.mouseButtons.add(e.button));
    element.addEventListener('contextmenu', (e) => e.preventDefault()); // botão direito = soco
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
    if (document.pointerLockElement) document.exitPointerLock();
  }

  endFrame() {
    this.pressed.clear();
  }
}

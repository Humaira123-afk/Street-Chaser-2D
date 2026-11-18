import { MouseMoveMode } from './types';

export class InputManager {
  held = new Set<string>();
  justPressed = new Set<string>();

  mouseScreenX = 0;
  mouseScreenY = 0;
  mouseWorldX = 0;
  mouseWorldY = 0;
  mouseInsideCanvas = false;
  mouseLeftDown = false;
  mouseRightDown = false;
  lastMouseMoveTime = 0;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const preventKeys = new Set([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Space'
    ]);

    window.addEventListener(
      'keydown',
      (e) => {
        if (preventKeys.has(e.code)) {
          e.preventDefault();
        }
        if (!this.held.has(e.code)) {
          this.justPressed.add(e.code);
        }
        this.held.add(e.code);
      },
      { passive: false }
    );

    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
    });

    const updateMousePos = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      this.mouseScreenX = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
      this.mouseScreenY = ((e.clientY - rect.top) / rect.height) * this.canvas.height;
      this.mouseInsideCanvas = true;
      this.lastMouseMoveTime = performance.now();
    };

    this.canvas.addEventListener('mousemove', updateMousePos);
    this.canvas.addEventListener('mouseenter', updateMousePos);
    this.canvas.addEventListener('mouseleave', () => {
      this.mouseInsideCanvas = false;
      this.mouseLeftDown = false;
      this.mouseRightDown = false;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      updateMousePos(e);
      if (e.button === 0) this.mouseLeftDown = true;
      if (e.button === 2) {
        this.mouseRightDown = true;
        this.justPressed.add('MouseRight');
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseLeftDown = false;
      if (e.button === 2) this.mouseRightDown = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
  }

  updateWorldCursor(camX: number, camY: number) {
    this.mouseWorldX = this.mouseScreenX + camX;
    this.mouseWorldY = this.mouseScreenY + camY;
  }

  clear() {
    this.held.clear();
    this.justPressed.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  consumeJustPressed(code: string): boolean {
    if (this.justPressed.has(code)) {
      this.justPressed.delete(code);
      return true;
    }
    return false;
  }

  getKeyboardMove(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.held.has('KeyW') || this.held.has('ArrowUp')) y -= 1;
    if (this.held.has('KeyS') || this.held.has('ArrowDown')) y += 1;
    if (this.held.has('KeyA') || this.held.has('ArrowLeft')) x -= 1;
    if (this.held.has('KeyD') || this.held.has('ArrowRight')) x += 1;
    return { x, y };
  }

  getPlayerMoveVector(
    playerX: number,
    playerY: number,
    mouseMode: MouseMoveMode
  ): { x: number; y: number; usingMouse: boolean } {
    const kb = this.getKeyboardMove();
    if (kb.x !== 0 || kb.y !== 0) {
      return { x: kb.x, y: kb.y, usingMouse: false };
    }

    const followActive =
      mouseMode === 'follow'
        ? this.mouseInsideCanvas && performance.now() - this.lastMouseMoveTime < 3500
        : this.mouseLeftDown && this.mouseInsideCanvas;

    if (followActive) {
      const dx = this.mouseWorldX - playerX;
      const dy = this.mouseWorldY - playerY;
      const d = Math.hypot(dx, dy);
      if (d > 14) {
        return { x: dx / d, y: dy / d, usingMouse: true };
      }
    }

    return { x: 0, y: 0, usingMouse: false };
  }

  endFrame() {
    this.justPressed.clear();
  }
}

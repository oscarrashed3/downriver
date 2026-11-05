/** Keyboard + mouse. Mouse look uses pointer lock once the player clicks into the world. */
export class Input {
  down = new Set<string>();
  pressed = new Set<string>();
  mouseDX = 0; mouseDY = 0;
  mouseHeld = false;
  locked = false;
  enabled = true;
  wheel = 0;
  clicks: { x: number; y: number }[] = [];
  /** When false, clicking does not capture the mouse (sky view, overlays). */
  allowLock = true;

  constructor(private canvas: HTMLCanvasElement) {
    addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.code;
      this.down.add(k); this.pressed.add(k);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouseHeld = true; this.clicks.push({ x: e.clientX / innerWidth * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 }); }
      if (this.enabled && this.allowLock && !this.locked && document.pointerLockElement !== canvas) {
        try { const r = canvas.requestPointerLock?.() as unknown as Promise<void> | undefined; r?.catch?.(() => {}); } catch { /* sandboxed: right-drag still looks around */ }
      }
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouseHeld = false; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    addEventListener('mousemove', e => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
      else if (e.buttons & 2) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }

  key(code: string) { return this.down.has(code); }
  hit(code: string) { return this.pressed.has(code); }
  axis(neg: string[], pos: string[]) {
    return (pos.some(k => this.down.has(k)) ? 1 : 0) - (neg.some(k => this.down.has(k)) ? 1 : 0);
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; this.clicks.length = 0; }
}

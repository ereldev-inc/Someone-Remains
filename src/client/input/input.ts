import { BTN_DASH, BTN_FIRE, BTN_HEAL, BTN_INTERACT, BTN_MELEE } from '../../sim/types';

/**
 * Clavier + souris. Les codes sont physiques (`event.code`) : W/A/S/D en QWERTY
 * correspondent aux touches Z/Q/S/D d'un clavier AZERTY, sans configuration.
 */
export class InputController {
  private readonly down = new Set<string>();
  private mouseDown = false;
  private mouseRight = false;
  private middleDrag = false;
  /** Rotation de caméra accumulée par glisser du bouton du milieu (radians). */
  private pendingYaw = 0;
  /** Remise à zéro de la caméra demandée (touche Y). */
  resetYawRequested = false;
  /** Position de la souris en coordonnées normalisées (−1..1), haut = +1. */
  mouseNdcX = 0;
  mouseNdcY = 0;
  onToggleDebug: (() => void) | null = null;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyY' && !e.repeat) this.resetYawRequested = true;
      if (e.code === 'F3') {
        e.preventDefault();
        if (!e.repeat) this.onToggleDebug?.();
        return;
      }
      if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseDown = false;
      this.mouseRight = false;
    });
    target.addEventListener('mousemove', (e) => this.updateMouse(e, target));
    target.addEventListener('mousedown', (e) => {
      this.updateMouse(e, target);
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.mouseRight = true;
      if (e.button === 1) {
        e.preventDefault();
        this.middleDrag = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRight = false;
      if (e.button === 1) this.middleDrag = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.middleDrag) this.pendingYaw += e.movementX * 0.006;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private updateMouse(e: MouseEvent, target: HTMLElement): void {
    const rect = target.getBoundingClientRect();
    this.mouseNdcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNdcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  private axis(neg: readonly string[], pos: readonly string[]): number {
    let v = 0;
    for (const c of neg) if (this.down.has(c)) v -= 1;
    for (const c of pos) if (this.down.has(c)) v += 1;
    return Math.max(-1, Math.min(1, v));
  }

  /** Rotation de caméra à appliquer (radians) : touches R / T maintenues et glisser du bouton du milieu. */
  takeYaw(dtSeconds: number): number {
    const keys = (this.down.has('KeyT') ? 1 : 0) - (this.down.has('KeyR') ? 1 : 0);
    const d = keys * 2.2 * dtSeconds + this.pendingYaw;
    this.pendingYaw = 0;
    return d;
  }

  get moveX(): number {
    return this.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
  }

  /** Haut de l'écran = −Y de la sim. */
  get moveY(): number {
    return this.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
  }

  get buttons(): number {
    let b = 0;
    if (this.mouseDown) b |= BTN_FIRE;
    if (this.mouseRight) b |= BTN_MELEE;
    if (this.down.has('KeyF')) b |= BTN_HEAL;
    if (this.down.has('Space')) b |= BTN_DASH;
    if (this.down.has('KeyE')) b |= BTN_INTERACT;
    return b;
  }
}

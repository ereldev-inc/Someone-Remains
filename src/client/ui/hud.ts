import { GLOBAL_GOAL } from '../../sim/data/goal';

const numberFormat = new Intl.NumberFormat('fr-FR');

/** HUD minimal du lot 2. Le compteur complet (KillCounterService) arrive au jalon M7. */
export class Hud {
  private readonly counter = requireElement('counter');
  private readonly debug = requireElement('debug');
  private debugVisible = true;

  setKills(total: number): void {
    const remaining = Math.max(0, GLOBAL_GOAL - total);
    this.counter.textContent = `${numberFormat.format(remaining)} Restants`;
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.debug.style.display = this.debugVisible ? 'block' : 'none';
  }

  setDebug(text: string): void {
    if (this.debugVisible) this.debug.textContent = text;
  }
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Élément #${id} introuvable`);
  return el;
}

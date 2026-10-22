import { GLOBAL_GOAL } from '../../sim/data/goal';
import { PLAYER_MAX_HP } from '../../sim/data/player';
import { RESPAWN_TICKS } from '../../sim/data/enemies';
import { TICK_RATE } from '../../sim/types';

const numberFormat = new Intl.NumberFormat('fr-FR');

/** HUD minimal du lot 3. Le compteur complet (KillCounterService) arrive au jalon M11. */
export class Hud {
  private readonly counter = requireElement('counter');
  private readonly life = requireElement('life');
  private readonly debug = requireElement('debug');
  private readonly hpFill = requireElement('hpFill');
  private readonly dashFill = requireElement('dashFill');
  private readonly death = requireElement('death');
  private readonly deathTimer = requireElement('deathTimer');
  private readonly boss = requireElement('boss');
  private readonly safe = requireElement('safe');
  private readonly bossFill = requireElement('bossFill');
  private debugVisible = true;
  private shownKills = -1;
  private shownLife = -1;

  setKills(total: number): void {
    if (total === this.shownKills) return;
    this.shownKills = total;
    const remaining = Math.max(0, GLOBAL_GOAL - total);
    this.counter.textContent = `${numberFormat.format(remaining)} Restants`;
  }

  setPlayer(hp: number, dashCooldown: number, lifeKills: number, dead: boolean, respawnFraction: number, safe = false): void {
    this.safe.style.display = safe ? 'block' : 'none';
    this.hpFill.style.width = `${Math.max(0, Math.min(1, hp / PLAYER_MAX_HP)) * 100}%`;
    this.dashFill.style.width = `${(1 - Math.max(0, Math.min(1, dashCooldown))) * 100}%`;
    if (lifeKills !== this.shownLife) {
      this.shownLife = lifeKills;
      this.life.textContent = `Cette vie : ${numberFormat.format(lifeKills)} éliminés`;
    }
    this.death.style.display = dead ? 'flex' : 'none';
    if (dead) this.deathTimer.textContent = `Réapparition dans ${Math.ceil((respawnFraction * RESPAWN_TICKS) / TICK_RATE)} s`;
  }

  /** Barre du Colosse : fraction de PV (0..1), ou une valeur négative pour la masquer. */
  setBoss(fraction: number): void {
    this.boss.style.display = fraction >= 0 ? 'block' : 'none';
    if (fraction >= 0) this.bossFill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
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

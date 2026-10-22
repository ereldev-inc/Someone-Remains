import { GLOBAL_GOAL } from '../../sim/data/goal';
import { PLAYER_MAX_HP } from '../../sim/data/player';
import { RESPAWN_TICKS } from '../../sim/data/enemies';
import { TICK_RATE } from '../../sim/types';
import { BAG_SLOTS, ITEMS } from '../../sim/data/items';

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
  private readonly ammo = requireElement('ammo');
  private readonly prompt = requireElement('prompt');
  private readonly promptText = requireElement('promptText');
  private readonly promptFill = requireElement('promptFill');
  private readonly toasts = requireElement('toasts');
  private readonly bagPanel = requireElement('bagPanel');
  private readonly bagGrid = requireElement('bagGrid');
  private bagKey = '';
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

  /** Munitions de l'arme équipée et rappels de commandes. */
  setAmmo(weaponName: string, ammo: number, bandages: number): void {
    this.ammo.className = `overlay${ammo <= 0 ? ' empty' : ''}`;
    this.ammo.innerHTML = `${weaponName} · ${ammo > 0 ? ammo : 'VIDE'}<small>clic droit : corps à corps · H : bandage (${bandages})</small>`;
  }

  /** Invite de fouille (null pour la masquer) avec la progression (0..1). */
  setPrompt(text: string | null, progress: number): void {
    this.prompt.style.display = text === null ? 'none' : 'block';
    if (text !== null) {
      this.promptText.textContent = text;
      this.promptFill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
    }
  }

  /** Message bref en bas à gauche (butin ramassé, soins…). */
  toast(text: string): void {
    const line = document.createElement('div');
    line.textContent = text;
    this.toasts.appendChild(line);
    while (this.toasts.children.length > 6) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => {
      line.style.opacity = '0';
      window.setTimeout(() => line.remove(), 700);
    }, 3200);
  }

  toggleBag(): void {
    this.bagPanel.style.display = this.bagPanel.style.display === 'block' ? 'none' : 'block';
  }

  /** Contenu du sac du joueur (BAG_SLOTS paires objet + 1 / quantité), redessiné seulement s'il change. */
  setBag(bag: Int32Array, offset: number): void {
    let key = '';
    for (let s = 0; s < BAG_SLOTS * 2; s++) key += `${bag[offset + s]},`;
    if (key === this.bagKey) return;
    this.bagKey = key;
    this.bagGrid.innerHTML = '';
    for (let s = 0; s < BAG_SLOTS; s++) {
      const item = (bag[offset + s * 2] as number) - 1;
      const qty = bag[offset + s * 2 + 1] as number;
      const cell = document.createElement('div');
      const def = ITEMS[item];
      if (def === undefined) {
        cell.className = 'slot empty';
        cell.textContent = '—';
      } else {
        cell.className = 'slot';
        cell.style.borderColor = def.color;
        cell.innerHTML = `<b>${qty}</b>${def.name}`;
      }
      this.bagGrid.appendChild(cell);
    }
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

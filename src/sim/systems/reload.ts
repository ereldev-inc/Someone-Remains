import { WEAPONS } from '../data/weapons';
import type { Sim } from '../sim';
import { bagCount, bagRemove } from './inventory';
import { statBonus } from './progression';

/** À l'arrêt le rechargement avance à pleine vitesse ; en mouvement, il va deux fois moins vite. */
export const RELOAD_MOVING_FACTOR = 0.5;
/** Vitesse (m/s) au-dessus de laquelle le joueur est considéré en mouvement. */
export const MOVING_SPEED = 0.8;

export function magIndex(i: number, weapon: number): number {
  return i * WEAPONS.length + weapon;
}

export function cancelReload(sim: Sim, i: number): void {
  sim.players.reloadWeapon[i] = -1;
  sim.players.reloadProgress[i] = 0;
}

/** Remplit instantanément le chargeur depuis le sac (réapparition, import de profil). */
export function loadMagazineInstant(sim: Sim, i: number, weapon: number): void {
  const def = WEAPONS[weapon];
  if (def === undefined) return;
  const idx = magIndex(i, weapon);
  const take = Math.min(def.magazine - (sim.players.mag[idx] as number), bagCount(sim, i, def.ammoItem));
  if (take > 0 && bagRemove(sim, i, def.ammoItem, take)) sim.players.mag[idx] = (sim.players.mag[idx] as number) + take;
}

/** Lance le rechargement de l'arme active, s'il reste des munitions dans le sac et que le chargeur n'est pas plein. */
export function startReload(sim: Sim, i: number): boolean {
  const p = sim.players;
  if ((p.reloadWeapon[i] as number) >= 0) return false;
  const weapon = p.weapon[i] as number;
  const def = WEAPONS[weapon];
  if (def === undefined) return false;
  if ((p.mag[magIndex(i, weapon)] as number) >= def.magazine || bagCount(sim, i, def.ammoItem) <= 0) return false;
  p.reloadWeapon[i] = weapon;
  p.reloadProgress[i] = 0;
  return true;
}

/** Fait avancer le rechargement en cours ; `moving` : le joueur se déplace ou esquive. */
export function stepReload(sim: Sim, i: number, moving: boolean): void {
  const p = sim.players;
  const weapon = p.reloadWeapon[i] as number;
  if (weapon < 0) return;
  const def = WEAPONS[weapon];
  if (def === undefined || weapon !== p.weapon[i]) {
    cancelReload(sim, i);
    return;
  }
  const rate = (moving ? RELOAD_MOVING_FACTOR : 1) * (1 + statBonus(sim, i, 'reload'));
  p.reloadProgress[i] = (p.reloadProgress[i] as number) + rate;
  if ((p.reloadProgress[i] as number) < def.reloadTicks) return;
  loadMagazineInstant(sim, i, weapon);
  cancelReload(sim, i);
}

/** Fraction (0..1) du rechargement en cours, 0 s'il n'y en a pas. */
export function reloadFraction(sim: Sim, i: number): number {
  const w = sim.players.reloadWeapon[i] as number;
  const def = WEAPONS[w];
  return def === undefined ? 0 : Math.min(1, (sim.players.reloadProgress[i] as number) / def.reloadTicks);
}

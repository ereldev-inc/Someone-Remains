import { TICK_RATE } from '../types';

export interface MeleeDef {
  name: string;
  damage: number;
  /** Portée (m) mesurée depuis le centre du joueur jusqu'au bord de la cible. */
  range: number;
  /** Angle total du coup (radians), centré sur la visée. */
  arc: number;
  cooldownTicks: number;
  /** Rayon de bruit (m). */
  noise: number;
  /** Recul infligé aux petits ennemis (m). */
  knockback: number;
}

export const MELEE_BARRE_DE_FER = 0;
export const MELEE_MACHETTE = 1;
export const MELEE_HACHE = 2;

/** Armes de corps à corps : aucune munition, toujours disponibles au clic droit. La barre de fer est celle de départ. */
export const MELEE_WEAPONS: readonly MeleeDef[] = [
  { name: 'Barre de fer', damage: 28, range: 1.7, arc: 1.7, cooldownTicks: Math.round(0.5 * TICK_RATE), noise: 10, knockback: 0.7 },
  { name: 'Machette', damage: 20, range: 1.8, arc: 1.4, cooldownTicks: 18, noise: 8, knockback: 0.4 },
  { name: 'Hache', damage: 55, range: 2, arc: 1.9, cooldownTicks: 70, noise: 14, knockback: 1.4 },
];

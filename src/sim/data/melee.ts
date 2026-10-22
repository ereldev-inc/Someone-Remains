import { TICK_RATE } from '../types';

export interface MeleeDef {
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

/** Armes de corps à corps : aucune munition, toujours disponibles au clic droit. */
export const MELEE_WEAPONS: readonly MeleeDef[] = [
  { damage: 28, range: 1.7, arc: 1.7, cooldownTicks: Math.round(0.5 * TICK_RATE), noise: 10, knockback: 0.7 },
];

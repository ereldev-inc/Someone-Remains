import { TICK_RATE } from '../types';

export interface WeaponDef {
  /** Dégâts par projectile. */
  damage: number;
  /** Ticks entre deux tirs. */
  cooldownTicks: number;
  /** m/s */
  projectileSpeed: number;
  /** Durée de vie d'un projectile, en ticks. */
  lifeTicks: number;
  projectileRadius: number;
  /** Projectiles par tir. */
  pellets: number;
  /** Dispersion totale (radians) répartie aléatoirement autour de la visée. */
  spread: number;
  /** Ennemis supplémentaires traversés avant de disparaître. */
  pierce: number;
  /** Rayon (m) dans lequel un tir réveille les ennemis. */
  noise: number;
}

export const WEAPON_PISTOL = 0;

/** Index = identifiant d'arme. Équilibrer = modifier ces nombres. */
export const WEAPONS: readonly WeaponDef[] = [
  {
    damage: 12,
    cooldownTicks: Math.round(TICK_RATE / 4),
    projectileSpeed: 32,
    lifeTicks: Math.round(0.9 * TICK_RATE),
    projectileRadius: 0.12,
    pellets: 1,
    spread: 0,
    pierce: 0,
    noise: 15,
  },
];

/** Distance entre le centre du joueur et l'apparition du projectile. */
export const MUZZLE_OFFSET = 0.6;

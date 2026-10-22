import { TICK_RATE } from '../types';
import { ITEM_CARBURANT, ITEM_CARREAUX, ITEM_CARTOUCHES, ITEM_MUNITIONS_9MM } from './items';

export interface WeaponDef {
  name: string;
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
  /** Munition consommée (objet) et quantité par tir ; -1 = aucune. */
  ammoItem: number;
  ammoPerShot: number;
  /** Genre de projectile pour le rendu et la logique : 0 balle, 2 flamme, 3 carreau (voir snapshot.ts). */
  projectileKind: number;
  /** Probabilité de retrouver le projectile au sol (carreaux). */
  recoverChance: number;
}

export const WEAPON_PISTOL = 0;
export const WEAPON_POMPE = 1;
export const WEAPON_MITRAILLETTE = 2;
export const WEAPON_LANCE_FLAMMES = 3;
export const WEAPON_ARBALETE = 4;

/** Index = identifiant d'arme. Équilibrer = modifier ces nombres. Les armes autres que le pistolet se fabriquent (data/recipes.ts). */
export const WEAPONS: readonly WeaponDef[] = [
  {
    name: 'Pistolet', damage: 12, cooldownTicks: Math.round(TICK_RATE / 4), projectileSpeed: 32, lifeTicks: Math.round(0.9 * TICK_RATE),
    projectileRadius: 0.12, pellets: 1, spread: 0, pierce: 0, noise: 30, ammoItem: ITEM_MUNITIONS_9MM, ammoPerShot: 1,
    projectileKind: 0, recoverChance: 0,
  },
  {
    name: 'Fusil à pompe', damage: 9, cooldownTicks: 52, projectileSpeed: 26, lifeTicks: 24,
    projectileRadius: 0.13, pellets: 7, spread: 0.5, pierce: 0, noise: 40, ammoItem: ITEM_CARTOUCHES, ammoPerShot: 1,
    projectileKind: 0, recoverChance: 0,
  },
  {
    name: 'Mitraillette', damage: 7, cooldownTicks: 5, projectileSpeed: 34, lifeTicks: 45,
    projectileRadius: 0.11, pellets: 1, spread: 0.09, pierce: 0, noise: 38, ammoItem: ITEM_MUNITIONS_9MM, ammoPerShot: 1,
    projectileKind: 0, recoverChance: 0,
  },
  {
    name: 'Lance-flammes', damage: 4.5, cooldownTicks: 3, projectileSpeed: 13, lifeTicks: 20,
    projectileRadius: 0.5, pellets: 1, spread: 0.22, pierce: 99, noise: 20, ammoItem: ITEM_CARBURANT, ammoPerShot: 1,
    projectileKind: 2, recoverChance: 0,
  },
  {
    name: 'Arbalète', damage: 42, cooldownTicks: 60, projectileSpeed: 38, lifeTicks: 60,
    projectileRadius: 0.14, pellets: 1, spread: 0, pierce: 2, noise: 8, ammoItem: ITEM_CARREAUX, ammoPerShot: 1,
    projectileKind: 3, recoverChance: 0.5,
  },
];

/** Armes à distance équipables en même temps (touches 1, 2, 3). */
export const WEAPON_SLOTS = 3;

/** Distance entre le centre du joueur et l'apparition du projectile. */
export const MUZZLE_OFFSET = 0.6;

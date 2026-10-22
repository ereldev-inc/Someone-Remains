import { TICK_RATE } from '../types';
import {
  ITEM_BANDAGE,
  ITEM_CARBURANT,
  ITEM_CARREAUX,
  ITEM_CARTOUCHES,
  ITEM_CHARGE_VIRALE,
  ITEM_CHIMIQUES,
  ITEM_COMPOSANTS,
  ITEM_FERRAILLE,
  ITEM_MUNITIONS_9MM,
  ITEM_POUDRE,
  ITEM_TISSU,
  ITEM_TROUSSE,
} from './items';

export interface LootEntry {
  item: number;
  min: number;
  max: number;
  weight: number;
}

/** Tirage : un nombre de rôles entre minRolls et maxRolls, chacun pioche une entrée selon son poids. */
export interface LootTable {
  minRolls: number;
  maxRolls: number;
  entries: readonly LootEntry[];
}

/** Tables de butin par palier de caisse, plus les tables des ennemis. Équilibrer = modifier ces nombres. */
export const LOOT_TABLES: Readonly<Record<string, LootTable>> = {
  commune: {
    minRolls: 2,
    maxRolls: 3,
    entries: [
      { item: ITEM_FERRAILLE, min: 1, max: 4, weight: 30 },
      { item: ITEM_MUNITIONS_9MM, min: 6, max: 15, weight: 25 },
      { item: ITEM_TISSU, min: 1, max: 3, weight: 20 },
      { item: ITEM_POUDRE, min: 1, max: 2, weight: 15 },
      { item: ITEM_BANDAGE, min: 1, max: 1, weight: 10 },
      { item: ITEM_CHIMIQUES, min: 1, max: 2, weight: 8 },
      { item: ITEM_CARTOUCHES, min: 2, max: 5, weight: 8 },
      { item: ITEM_COMPOSANTS, min: 1, max: 1, weight: 6 },
      { item: ITEM_CARBURANT, min: 10, max: 30, weight: 6 },
      { item: ITEM_CARREAUX, min: 3, max: 6, weight: 6 },
    ],
  },
  rare: {
    minRolls: 3,
    maxRolls: 4,
    entries: [
      { item: ITEM_MUNITIONS_9MM, min: 15, max: 30, weight: 25 },
      { item: ITEM_FERRAILLE, min: 3, max: 8, weight: 20 },
      { item: ITEM_COMPOSANTS, min: 1, max: 3, weight: 18 },
      { item: ITEM_TROUSSE, min: 1, max: 1, weight: 15 },
      { item: ITEM_CARTOUCHES, min: 4, max: 8, weight: 12 },
      { item: ITEM_POUDRE, min: 2, max: 5, weight: 12 },
      { item: ITEM_CHARGE_VIRALE, min: 1, max: 1, weight: 8 },
      { item: ITEM_CARREAUX, min: 6, max: 12, weight: 8 },
    ],
  },
  militaire: {
    minRolls: 3,
    maxRolls: 5,
    entries: [
      { item: ITEM_MUNITIONS_9MM, min: 20, max: 40, weight: 30 },
      { item: ITEM_CARTOUCHES, min: 8, max: 12, weight: 20 },
      { item: ITEM_COMPOSANTS, min: 2, max: 4, weight: 20 },
      { item: ITEM_TROUSSE, min: 1, max: 2, weight: 12 },
      { item: ITEM_CARBURANT, min: 30, max: 60, weight: 10 },
      { item: ITEM_CHARGE_VIRALE, min: 1, max: 1, weight: 8 },
    ],
  },
  // Petits butins des ennemis ordinaires.
  zombie: {
    minRolls: 1,
    maxRolls: 1,
    entries: [
      { item: ITEM_FERRAILLE, min: 1, max: 2, weight: 30 },
      { item: ITEM_TISSU, min: 1, max: 2, weight: 25 },
      { item: ITEM_MUNITIONS_9MM, min: 3, max: 6, weight: 30 },
      { item: ITEM_POUDRE, min: 1, max: 1, weight: 10 },
      { item: ITEM_BANDAGE, min: 1, max: 1, weight: 5 },
    ],
  },
  // Colosse et Souche.
  boss: {
    minRolls: 3,
    maxRolls: 4,
    entries: [
      { item: ITEM_CHARGE_VIRALE, min: 1, max: 2, weight: 30 },
      { item: ITEM_COMPOSANTS, min: 2, max: 4, weight: 25 },
      { item: ITEM_MUNITIONS_9MM, min: 15, max: 30, weight: 25 },
      { item: ITEM_TROUSSE, min: 1, max: 1, weight: 20 },
    ],
  },
};

/** Remplissage d'une caisse vidée : simple délai, par palier (secondes). */
export const CRATE_COOLDOWN_SECONDS: Readonly<Record<string, number>> = { commune: 300, rare: 600, militaire: 600 };
export function crateCooldownTicks(tier: string): number {
  return Math.round((CRATE_COOLDOWN_SECONDS[tier] ?? 300) * TICK_RATE);
}

/** Distance maximale (m) pour fouiller, durée de la fouille et bruit qu'elle fait (rayon, m). */
export const CRATE_REACH = 1.8;
export const CRATE_OPEN_TICKS = TICK_RATE;
export const CRATE_NOISE = 3;

export const PICKUP_POOL_SIZE = 400;
/** Distance (m) à laquelle un objet au sol est ramassé automatiquement. */
export const PICKUP_REACH = 1.4;
export const PICKUP_LIFE_TICKS = 90 * TICK_RATE;

import { TICK_RATE } from '../types';

/** XP gagnée à chaque kill, par type d'ennemi (index = type). */
export const XP_PER_TYPE: readonly number[] = [5, 6, 20, 10, 10, 18, 200, 80];

/** XP nécessaire pour passer du niveau `level` au suivant. */
export function xpToNext(level: number): number {
  return Math.round(40 + 22 * Math.pow(Math.max(0, level - 1), 1.35));
}

/** Statistiques modifiables par les bonus. */
export type Stat = 'reload' | 'damage' | 'fireRate' | 'moveSpeed' | 'maxHp' | 'dashCd' | 'pierce' | 'pickup' | 'noise' | 'xp' | 'kit';

/** Plafond de chaque statistique (somme des bonus) : garde-fou contre l'emballement. */
export const STAT_LIMITS: Readonly<Record<Stat, number>> = {
  damage: 2,
  fireRate: 0.5,
  moveSpeed: 0.4,
  maxHp: 150,
  dashCd: 0.55,
  pierce: 3,
  pickup: 2,
  noise: 0.5,
  xp: 1,
  kit: 4,
  reload: 1.5,
};

/** Bonus de niveau de vie : temporaires, perdus à la mort. Un niveau donne le choix entre 3 d'entre eux. */
export interface UpgradeDef {
  name: string;
  description: string;
  stat: Stat;
  /** Valeur ajoutée à la statistique par rang. */
  value: number;
  /** Nombre maximal de rangs. */
  max: number;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { name: 'Puissance de feu', description: '+12 % de dégâts', stat: 'damage', value: 0.12, max: 6 },
  { name: 'Cadence', description: '−10 % de délai entre deux tirs', stat: 'fireRate', value: 0.1, max: 4 },
  { name: 'Foulée', description: '+6 % de vitesse', stat: 'moveSpeed', value: 0.06, max: 5 },
  { name: 'Constitution', description: '+15 PV max et soin de 15 PV', stat: 'maxHp', value: 15, max: 6 },
  { name: 'Esquive agile', description: '−12 % de recharge d\'esquive', stat: 'dashCd', value: 0.12, max: 4 },
  { name: 'Projectiles perforants', description: '+1 ennemi traversé', stat: 'pierce', value: 1, max: 3 },
  { name: 'Mains lestes', description: '+40 % de portée de ramassage', stat: 'pickup', value: 0.4, max: 3 },
  { name: 'Discrétion', description: '−12 % de bruit', stat: 'noise', value: 0.12, max: 4 },
  { name: 'Rechargement rapide', description: '+25 % de vitesse de rechargement', stat: 'reload', value: 0.25, max: 4 },
];

/**
 * Arbre d'héritage : bonus permanents achetés avec la Rémanence (gagnée à chaque mort), au refuge ou à l'écran
 * de mort. Chaque rang coûte `cost + costStep × rang` ; un nœud exige un rang minimal de son parent.
 * Rendements décroissants et plafonnés (le rang k vaut base × decay^k).
 */
export interface HeritageDef {
  name: string;
  description: string;
  /** Branche de l'arbre (colonne d'affichage). */
  branch: string;
  stat: Stat;
  /** Valeur du premier rang ; le rang k (à partir de 0) vaut base × decay^k. */
  base: number;
  decay: number;
  /** Nombre maximal de rangs. */
  max: number;
  /** Coût du premier rang, puis supplément par rang déjà acquis. */
  cost: number;
  costStep: number;
  /** Nœud parent (index dans HERITAGE) et rang minimal à y avoir ; -1 = racine de branche. */
  requires: number;
  requiresRank: number;
}

/** Nombre d'emplacements réservés à l'arbre dans le snapshot et le profil. */
export const HERITAGE_SLOTS = 16;

export const HERITAGE: readonly HeritageDef[] = [
  { name: 'Robustesse', description: '+10 PV max', branch: 'Survie', stat: 'maxHp', base: 10, decay: 0.85, max: 8, cost: 15, costStep: 8, requires: -1, requiresRank: 0 },
  { name: 'Puissance', description: '+10 % de dégâts', branch: 'Combat', stat: 'damage', base: 0.1, decay: 0.8, max: 6, cost: 20, costStep: 10, requires: -1, requiresRank: 0 },
  { name: 'Agilité', description: '+4 % de vitesse', branch: 'Mobilité', stat: 'moveSpeed', base: 0.04, decay: 0.8, max: 5, cost: 15, costStep: 8, requires: -1, requiresRank: 0 },
  { name: 'Aimant', description: '+25 % de portée de ramassage', branch: 'Butin', stat: 'pickup', base: 0.25, decay: 0.85, max: 4, cost: 10, costStep: 6, requires: -1, requiresRank: 0 },
  { name: 'Réflexes', description: '−8 % de recharge d\'esquive', branch: 'Mobilité', stat: 'dashCd', base: 0.08, decay: 0.8, max: 5, cost: 20, costStep: 10, requires: 2, requiresRank: 1 },
  { name: 'Savoir-faire', description: '+10 % d\'XP', branch: 'Butin', stat: 'xp', base: 0.1, decay: 0.85, max: 6, cost: 20, costStep: 10, requires: 3, requiresRank: 1 },
  { name: 'Provisions', description: '+6 munitions 9 mm et +1 bandage au départ', branch: 'Survie', stat: 'kit', base: 1, decay: 1, max: 4, cost: 25, costStep: 12, requires: 0, requiresRank: 1 },
  { name: 'Furtivité', description: '−5 % de bruit', branch: 'Discrétion', stat: 'noise', base: 0.05, decay: 0.85, max: 5, cost: 15, costStep: 8, requires: -1, requiresRank: 0 },
  { name: 'Cadence', description: '−5 % de délai entre deux tirs', branch: 'Combat', stat: 'fireRate', base: 0.05, decay: 0.85, max: 5, cost: 30, costStep: 14, requires: 1, requiresRank: 2 },
  { name: 'Munitions perforantes', description: '+1 ennemi traversé', branch: 'Combat', stat: 'pierce', base: 1, decay: 1, max: 2, cost: 60, costStep: 40, requires: 8, requiresRank: 2 },
  { name: 'Rechargeur', description: '+12 % de vitesse de rechargement', branch: 'Combat', stat: 'reload', base: 0.12, decay: 0.85, max: 5, cost: 20, costStep: 10, requires: 1, requiresRank: 1 },
  { name: 'Constitution de fer', description: '+15 PV max', branch: 'Survie', stat: 'maxHp', base: 15, decay: 0.85, max: 4, cost: 50, costStep: 25, requires: 0, requiresRank: 3 },
  { name: 'Apprentissage', description: '+15 % d\'XP', branch: 'Butin', stat: 'xp', base: 0.15, decay: 0.85, max: 3, cost: 45, costStep: 25, requires: 5, requiresRank: 2 },
  { name: 'Pas de velours', description: '−8 % de bruit', branch: 'Discrétion', stat: 'noise', base: 0.08, decay: 0.85, max: 3, cost: 40, costStep: 20, requires: 7, requiresRank: 3 },
];

/** Coût du prochain rang d'un nœud d'héritage (selon son rang actuel). */
export function heritageCost(h: HeritageDef, rank: number): number {
  return h.cost + h.costStep * rank;
}

/** Contenu ajouté au kit de départ par rang de « Provisions ». */
export const PROVISIONS_AMMO = 6;
export const PROVISIONS_BANDAGES = 1;

/** Rémanence gagnée à la mort : un point par kill plus un par tranche de temps de survie. */
export const REMANENCE_SECONDS_PER_POINT = 10;
export function remanenceEarned(kills: number, lifeTicks: number): number {
  return kills + Math.floor(lifeTicks / (TICK_RATE * REMANENCE_SECONDS_PER_POINT));
}

export const CHOICES = 3;

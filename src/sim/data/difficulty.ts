/**
 * Profils de difficulté par niveau : types d'ennemis autorisés, puissance (PV et dégâts) et densité
 * attendue. Valeurs de départ, à régler en jouant. La densité est vérifiée par le validateur de cartes.
 */
export interface DifficultyProfile {
  id: string;
  hpMult: number;
  damageMult: number;
  allowedTypes: readonly string[];
  /** Plage acceptée d'ennemis par hectare (10 000 m²). */
  densityPerHectare: readonly [number, number];
}

export const DIFFICULTY_PROFILES: Readonly<Record<string, DifficultyProfile>> = {
  'niveau-1': { id: 'niveau-1', hpMult: 1, damageMult: 1, allowedTypes: ['rodeur'], densityPerHectare: [1, 6] },
  'niveau-2': { id: 'niveau-2', hpMult: 1.2, damageMult: 1.2, allowedTypes: ['rodeur', 'coureur'], densityPerHectare: [4, 12] },
  'niveau-3': { id: 'niveau-3', hpMult: 1.5, damageMult: 1.5, allowedTypes: ['rodeur', 'coureur', 'cracheur', 'hurleur'], densityPerHectare: [8, 20] },
  'niveau-4': { id: 'niveau-4', hpMult: 2, damageMult: 2, allowedTypes: ['rodeur', 'coureur', 'cracheur', 'hurleur', 'brute', 'explosif'], densityPerHectare: [15, 35] },
  'niveau-5': { id: 'niveau-5', hpMult: 2.5, damageMult: 2.5, allowedTypes: ['rodeur', 'coureur', 'cracheur', 'hurleur', 'brute', 'explosif', 'souche'], densityPerHectare: [12, 28] },
  'niveau-6': { id: 'niveau-6', hpMult: 3, damageMult: 3, allowedTypes: ['rodeur', 'coureur', 'cracheur', 'hurleur', 'brute', 'explosif', 'souche', 'colosse'], densityPerHectare: [20, 45] },
};

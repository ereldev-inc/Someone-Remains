/**
 * Motifs de projectiles ennemis, décrits par paramètres et interprétés par un seul système
 * (systems/enemies.ts). Éventail, anneau, spirale et rafale ciblée ne sont que des réglages.
 */
export interface PatternDef {
  /** Nombre d'émissions (répétitions) du motif. */
  bursts: number;
  /** Ticks entre deux émissions. */
  delayTicks: number;
  /** Projectiles par émission. */
  count: number;
  /** Angle total couvert (radians). >= 2π : anneau réparti uniformément ; sinon éventail centré. */
  arc: number;
  /** Centre sur le joueur à chaque émission (sinon sur l'angle de départ du motif). */
  aim: boolean;
  /** Rotation ajoutée à chaque émission (spirale). */
  rotation: number;
  /** m/s */
  speed: number;
  damage: number;
  radius: number;
  lifeTicks: number;
}

const TAU = Math.PI * 2;

export const PATTERN_FAN3 = 0;
export const PATTERN_AIMED_BURST = 1;
export const PATTERN_RING = 2;
export const PATTERN_SPIRAL = 3;
export const PATTERN_FAN7 = 4;

/** Index = identifiant de motif. */
export const PATTERNS: readonly PatternDef[] = [
  // Cracheur : éventail de 3 projectiles lents.
  { bursts: 1, delayTicks: 0, count: 3, arc: 0.5, aim: true, rotation: 0, speed: 9, damage: 8, radius: 0.22, lifeTicks: 160 },
  // Rafale ciblée : 4 tirs successifs sur le joueur.
  { bursts: 4, delayTicks: 7, count: 1, arc: 0, aim: true, rotation: 0, speed: 13, damage: 10, radius: 0.2, lifeTicks: 120 },
  // Anneau de 20 projectiles.
  { bursts: 1, delayTicks: 0, count: 20, arc: TAU, aim: false, rotation: 0, speed: 7, damage: 10, radius: 0.24, lifeTicks: 220 },
  // Spirale à deux bras.
  { bursts: 36, delayTicks: 3, count: 2, arc: Math.PI, aim: false, rotation: 0.24, speed: 8, damage: 8, radius: 0.22, lifeTicks: 200 },
  // Gros éventail de 7 projectiles.
  { bursts: 1, delayTicks: 0, count: 7, arc: 1.3, aim: true, rotation: 0, speed: 10, damage: 12, radius: 0.24, lifeTicks: 160 },
];

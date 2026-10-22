import { PATTERN_AIMED_BURST, PATTERN_FAN3, PATTERN_FAN7, PATTERN_RING, PATTERN_SPIRAL } from './patterns';

export const ENEMY_RODEUR = 0;
export const ENEMY_COUREUR = 1;
export const ENEMY_BRUTE = 2;
export const ENEMY_CRACHEUR = 3;
export const ENEMY_EXPLOSIF = 4;
export const ENEMY_HURLEUR = 5;
export const ENEMY_COLOSSE = 6;
export const ENEMY_SOUCHE = 7;

/** Charge : signal visuel (windup), ruée en ligne droite, récupération. */
export interface ChargeDef {
  triggerRange: number;
  windupTicks: number;
  /** m/s */
  chargeSpeed: number;
  chargeTicks: number;
  recoverTicks: number;
  cooldownTicks: number;
  damage: number;
}

/** Tireur : garde ses distances et enchaîne des motifs de projectiles. */
export interface ShooterDef {
  /** Motifs lancés à tour de rôle. */
  patterns: readonly number[];
  range: number;
  cooldownTicks: number;
  windupTicks: number;
  /** Distance préférée : recule en dessous de keepMin, avance au-delà de keepMax. */
  keepMin: number;
  keepMax: number;
}

/** Explosif : amorce au contact, explose en zone (aussi quand il est tué). */
export interface ExplodeDef {
  triggerRange: number;
  fuseTicks: number;
  radius: number;
  damage: number;
}

/** Hurleur : alerte et enrage les ennemis proches, appelle des renforts. */
export interface ScreamDef {
  range: number;
  windupTicks: number;
  cooldownTicks: number;
  alertRadius: number;
  rageTicks: number;
  summon: number;
  summonType: number;
  maxScreams: number;
  keepMin: number;
  keepMax: number;
}

/** Souche : structure immobile qui génère des ennemis tant qu'un joueur est proche. */
export interface NestDef {
  spawnIntervalTicks: number;
  maxChildren: number;
  childType: number;
  spawnRadius: number;
}

export interface EnemyDef {
  name: string;
  hp: number;
  /** m/s, en poursuite. */
  speed: number;
  radius: number;
  contactDamage: number;
  /** Distance à laquelle la simple présence du joueur réveille l'ennemi. */
  sightRadius: number;
  /** Distance au-delà de laquelle un ennemi en poursuite perd sa cible et rentre. */
  loseRadius: number;
  /** m/s, au repos. */
  wanderSpeed: number;
  /** Multiplicateur du bruit perçu (le rayon de bruit du joueur est multiplié par cette valeur). */
  hearing: number;
  /** Valeur d'un kill dans le compteur d'infectés (pondération légère pour les boss). */
  killWeight: number;
  /** Amplitude (radians) et période (ticks) du zigzag de poursuite ; 0 = trajectoire droite. */
  zigzag: number;
  zigzagPeriodTicks: number;
  charge?: ChargeDef;
  shooter?: ShooterDef;
  explode?: ExplodeDef;
  scream?: ScreamDef;
  nest?: NestDef;
}

/** Index = type d'ennemi. Équilibrer = modifier ces nombres. */
export const ENEMIES: readonly EnemyDef[] = [
  {
    name: 'rodeur',
    hp: 30, speed: 3.2, radius: 0.42, contactDamage: 10,
    sightRadius: 10, loseRadius: 50, wanderSpeed: 0.7, hearing: 1, killWeight: 1,
    zigzag: 0, zigzagPeriodTicks: 0,
  },
  {
    name: 'coureur',
    hp: 18, speed: 5.4, radius: 0.36, contactDamage: 8,
    sightRadius: 12, loseRadius: 55, wanderSpeed: 1.2, hearing: 1.3, killWeight: 1,
    zigzag: 0.55, zigzagPeriodTicks: 40,
  },
  {
    name: 'brute',
    hp: 160, speed: 2, radius: 0.75, contactDamage: 20,
    sightRadius: 9, loseRadius: 45, wanderSpeed: 0.4, hearing: 0.8, killWeight: 3,
    zigzag: 0, zigzagPeriodTicks: 0,
    charge: { triggerRange: 9, windupTicks: 36, chargeSpeed: 15, chargeTicks: 32, recoverTicks: 50, cooldownTicks: 150, damage: 35 },
  },
  {
    name: 'cracheur',
    hp: 40, speed: 2.6, radius: 0.4, contactDamage: 6,
    sightRadius: 14, loseRadius: 55, wanderSpeed: 0.6, hearing: 1, killWeight: 2,
    zigzag: 0, zigzagPeriodTicks: 0,
    shooter: { patterns: [PATTERN_FAN3, PATTERN_AIMED_BURST], range: 20, cooldownTicks: 110, windupTicks: 24, keepMin: 8, keepMax: 13 },
  },
  {
    name: 'explosif',
    hp: 25, speed: 4.2, radius: 0.45, contactDamage: 0,
    sightRadius: 11, loseRadius: 50, wanderSpeed: 0.8, hearing: 1, killWeight: 2,
    zigzag: 0, zigzagPeriodTicks: 0,
    explode: { triggerRange: 1.8, fuseTicks: 36, radius: 3.5, damage: 35 },
  },
  {
    name: 'hurleur',
    hp: 40, speed: 2.8, radius: 0.4, contactDamage: 5,
    sightRadius: 13, loseRadius: 55, wanderSpeed: 0.6, hearing: 1, killWeight: 3,
    zigzag: 0, zigzagPeriodTicks: 0,
    scream: {
      range: 24, windupTicks: 30, cooldownTicks: 420, alertRadius: 28, rageTicks: 360,
      summon: 3, summonType: ENEMY_RODEUR, maxScreams: 2, keepMin: 9, keepMax: 14,
    },
  },
  {
    name: 'colosse',
    hp: 900, speed: 1.9, radius: 1.1, contactDamage: 30,
    sightRadius: 20, loseRadius: 90, wanderSpeed: 0.3, hearing: 0.5, killWeight: 25,
    zigzag: 0, zigzagPeriodTicks: 0,
    shooter: {
      patterns: [PATTERN_RING, PATTERN_SPIRAL, PATTERN_AIMED_BURST, PATTERN_FAN7],
      range: 28, cooldownTicks: 140, windupTicks: 30, keepMin: 0, keepMax: 9,
    },
  },
  {
    name: 'souche',
    hp: 400, speed: 0, radius: 1.5, contactDamage: 0,
    sightRadius: 28, loseRadius: 40, wanderSpeed: 0, hearing: 0, killWeight: 10,
    zigzag: 0, zigzagPeriodTicks: 0,
    nest: { spawnIntervalTicks: 120, maxChildren: 8, childType: ENEMY_RODEUR, spawnRadius: 2.6 },
  },
];

/** Types qui apparaissent dans l'apparition ambiante provisoire (avant les cartes du jalon M5), avec leur poids. */
export const AMBIENT_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [ENEMY_RODEUR, 60],
  [ENEMY_COUREUR, 14],
  [ENEMY_BRUTE, 5],
  [ENEMY_CRACHEUR, 9],
  [ENEMY_EXPLOSIF, 8],
  [ENEMY_HURLEUR, 4],
];

export const ENEMY_POOL_SIZE = 2500;
export const PROJECTILE_POOL_SIZE = 6000;
/** Plus grand rayon d'ennemi (la Souche) : borne des requêtes sur la grille des gros ennemis. */
export const ENEMY_MAX_RADIUS = 1.6;
/** Au-delà de ce rayon, un ennemi est « gros » : il est aussi dans une grille à part, pour que les petits requêtes restent étroites. */
export const ENEMY_BIG_RADIUS = 0.8;
/** Plafond de voisins examinés par ennemi pour la séparation (les foules denses se résolvent sur plusieurs ticks). */
export const SEPARATION_NEIGHBORS = 16;

/** Ticks d'invulnérabilité du joueur après un coup. */
export const PLAYER_HURT_TICKS = 30;
/** Apparition ambiante (provisoire, remplacée par les groupes de la carte au jalon M5) : couronne hors écran. */
export const SPAWN_MIN_DIST = 18;
export const SPAWN_MAX_DIST = 40;
/** Un ennemi à plus de cette distance de tous les joueurs est recyclé. */
export const RECYCLE_DIST = 80;
export const SPAWN_PER_TICK = 6;
/** Densité ambiante cible par joueur (provisoire). */
export const AMBIENT_ENEMIES_PER_PLAYER = 40;

/** Au repos : les ennemis flânent autour de leur point d'attache. */
export const WANDER_RADIUS = 6;
export const WANDER_PERIOD_TICKS = 150;
/** Le bruit d'un joueur décroît de cette vitesse (m/s) après son dernier tir. */
export const NOISE_DECAY = 20;
/** Un ennemi enragé (cri du Hurleur) court plus vite. */
export const RAGE_SPEED_MULT = 1.35;

export const RESPAWN_TICKS = 300;
export const RESPAWN_PROTECTION_TICKS = 120;
/** Rayon dégagé d'ennemis autour du point de réapparition (provisoire, jusqu'au refuge du jalon M5). */
export const RESPAWN_CLEAR_RADIUS = 30;

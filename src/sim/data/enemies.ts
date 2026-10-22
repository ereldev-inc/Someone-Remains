export interface EnemyDef {
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
}

export const ENEMY_RODEUR = 0;

/** Index = type d'ennemi. */
export const ENEMIES: readonly EnemyDef[] = [
  { hp: 30, speed: 3.2, radius: 0.42, contactDamage: 10, sightRadius: 10, loseRadius: 50, wanderSpeed: 0.7 },
];

export const ENEMY_POOL_SIZE = 2500;
export const PROJECTILE_POOL_SIZE = 6000;
export const ENEMY_MAX_RADIUS = 0.6;

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

export const RESPAWN_TICKS = 300;
export const RESPAWN_PROTECTION_TICKS = 120;
/** Rayon dégagé d'ennemis autour du point de réapparition (provisoire, jusqu'à la zone sûre). */
export const RESPAWN_CLEAR_RADIUS = 30;

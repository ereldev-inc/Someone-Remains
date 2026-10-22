export interface EnemyDef {
  hp: number;
  /** m/s */
  speed: number;
  radius: number;
  contactDamage: number;
}

export const ENEMY_RODEUR = 0;

/** Index = type d'ennemi. */
export const ENEMIES: readonly EnemyDef[] = [{ hp: 30, speed: 3.2, radius: 0.42, contactDamage: 10 }];

export const ENEMY_POOL_SIZE = 2500;
export const PROJECTILE_POOL_SIZE = 6000;
export const ENEMY_MAX_RADIUS = 0.6;

/** Ticks d'invulnérabilité du joueur après un coup. */
export const PLAYER_HURT_TICKS = 30;
/** Apparition : couronne autour du joueur, hors de l'écran. */
export const SPAWN_MIN_DIST = 26;
export const SPAWN_MAX_DIST = 34;
/** Un ennemi à plus de cette distance de tous les joueurs est recyclé. */
export const RECYCLE_DIST = 70;
export const SPAWN_PER_TICK = 6;

/** Densité cible par joueur : monte avec le temps de survie de sa vie (pas avec sa Rémanence). */
export const HORDE_BASE = 12;
export const HORDE_GROWTH_PER_SECOND = 0.7;
export const HORDE_MAX_PER_PLAYER = 220;

export const RESPAWN_TICKS = 300;
export const RESPAWN_PROTECTION_TICKS = 120;
/** Rayon dégagé d'ennemis autour du point de réapparition (provisoire, jusqu'à la zone sûre). */
export const RESPAWN_CLEAR_RADIUS = 30;

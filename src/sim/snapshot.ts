/** Instantané sérialisable de l'état visible. */

// Joueurs : PLAYER_STRIDE valeurs par joueur.
export const SNAP_STRIDE = 10;
export const SNAP_X = 0;
export const SNAP_Y = 1;
export const SNAP_AIM = 2;
export const SNAP_HP = 3;
export const SNAP_FLAGS = 4;
export const SNAP_DASH_CD = 5; // 0..1, 0 = esquive prête
export const SNAP_VEL = 6; // vitesse scalaire
export const SNAP_RESPAWN = 7; // 0..1, part du délai de réapparition restante
export const SNAP_LIFE_KILLS = 8;
export const SNAP_NOISE = 9; // rayon de bruit courant (m)

export const FLAG_DASHING = 1;
export const FLAG_INVULNERABLE = 2;
export const FLAG_HURT = 4;
export const FLAG_DEAD = 8;

// Ennemis : indexés par emplacement de pool (stable d'un snapshot à l'autre).
export const ENEMY_STRIDE = 7;
export const ENEMY_TYPE = 0; // 0 = emplacement vide, sinon type + 1
export const ENEMY_X = 1;
export const ENEMY_Y = 2;
export const ENEMY_ANGLE = 3;
export const ENEMY_FLASH = 4; // 0..1
export const ENEMY_GEN = 5;
export const ENEMY_STATE = 6; // 0 = repos, 1 = poursuite

// Projectiles : mêmes règles.
export const PROJ_STRIDE = 5;
export const PROJ_KIND = 0; // 0 = emplacement vide, sinon genre + 1
export const PROJ_X = 1;
export const PROJ_Y = 2;
export const PROJ_ANGLE = 3;
export const PROJ_GEN = 4;

export const PROJ_KIND_PLAYER = 0;
export const PROJ_KIND_ENEMY = 1;

export interface Snapshot {
  tick: number;
  playerCount: number;
  ids: Int32Array;
  /** playerCount * SNAP_STRIDE valeurs. */
  players: Float32Array;
  enemyHigh: number;
  /** enemyHigh * ENEMY_STRIDE valeurs. */
  enemies: Float32Array;
  projectileHigh: number;
  /** projectileHigh * PROJ_STRIDE valeurs. */
  projectiles: Float32Array;
}

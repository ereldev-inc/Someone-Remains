/** Instantané sérialisable de l'état visible (positions des joueurs). */
export const SNAP_STRIDE = 7;
export const SNAP_X = 0;
export const SNAP_Y = 1;
export const SNAP_AIM = 2;
export const SNAP_HP = 3;
export const SNAP_FLAGS = 4;
export const SNAP_DASH_CD = 5; // 0..1, 0 = esquive prête
export const SNAP_VEL = 6; // vitesse scalaire

export const FLAG_DASHING = 1;
export const FLAG_INVULNERABLE = 2;

export interface Snapshot {
  tick: number;
  playerCount: number;
  ids: Int32Array;
  /** playerCount * SNAP_STRIDE valeurs. */
  players: Float32Array;
}

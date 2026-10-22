/** Instantané sérialisable de l'état visible. */

// Joueurs : PLAYER_STRIDE valeurs par joueur.
export const SNAP_STRIDE = 16;
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
export const SNAP_OPEN = 10; // progression de la fouille d'une caisse (0..1)
export const SNAP_MAXHP = 11; // PV maximaux (bonus compris)
export const SNAP_HEAL = 12; // progression du soin en cours (0..1)
export const SNAP_RELOAD = 13; // progression du rechargement en cours (0..1)
export const SNAP_EXTRACT = 14; // progression de l'extraction (0..1)
export const SNAP_OUT = 15; // 0 dans la zone, 1 extrait, 2 mort pendant l'évacuation

// État de zone : ZONE_STRIDE entiers.
export const ZONE_STRIDE = 5;
export const ZONE_PHASE = 0; // 0 compte à rebours, 1 évacuation
export const ZONE_TICKS = 1; // ticks avant l'évacuation, puis avant la prochaine vague
export const ZONE_WAVE = 2; // vagues lancées
export const ZONE_ENDED = 3; // 1 une fois l'instance terminée
export const ZONE_ENEMIES = 4; // ennemis encore en vie

export const FLAG_DASHING = 1;
export const FLAG_INVULNERABLE = 2;
export const FLAG_HURT = 4;
export const FLAG_DEAD = 8;
export const FLAG_SAFE = 16; // dans un refuge

// Ennemis : indexés par emplacement de pool (stable d'un snapshot à l'autre).
export const ENEMY_STRIDE = 9;
export const ENEMY_TYPE = 0; // 0 = emplacement vide, sinon type + 1
export const ENEMY_X = 1;
export const ENEMY_Y = 2;
export const ENEMY_ANGLE = 3;
export const ENEMY_FLASH = 4; // 0..1
export const ENEMY_GEN = 5;
export const ENEMY_STATE = 6; // 0 = repos, 1 = poursuite
export const ENEMY_HP = 7; // fraction de PV (0..1)
export const ENEMY_PHASE = 8; // phase d'action (PHASE_*) ; +8 si enragé

// Projectiles : mêmes règles.
export const PROJ_STRIDE = 5;
export const PROJ_KIND = 0; // 0 = emplacement vide, sinon genre + 1
export const PROJ_X = 1;
export const PROJ_Y = 2;
export const PROJ_ANGLE = 3;
export const PROJ_GEN = 4;

// Objets au sol : indexés par emplacement de pool.
export const PICKUP_STRIDE = 4;
export const PICKUP_ITEM = 0; // 0 = vide, sinon objet + 1
export const PICKUP_X = 1;
export const PICKUP_Y = 2;
export const PICKUP_COUNT = 3;

export const PROJ_KIND_PLAYER = 0;
export const PROJ_KIND_ENEMY = 1;
export const PROJ_KIND_FLAME = 2;
export const PROJ_KIND_BOLT = 3;

// Progression : PROGRESS_STRIDE entiers par joueur.
export const PROG_LEVEL = 0;
export const PROG_XP = 1;
export const PROG_XP_NEXT = 2;
export const PROG_PENDING = 3; // niveaux de vie à dépenser (en plus de la proposition affichée)
export const PROG_UCHOICE0 = 4; // 3 propositions de bonus de vie (-1 = aucune)
// 7 à 10 : libres (anciens choix d'héritage)
export const PROG_REMANENCE = 11;
export const PROG_TOTAL_KILLS = 12;
export const PROG_DEATHS = 13;
export const PROG_BEST_SECONDS = 14;
export const PROG_LIFE0 = 15; // rangs des bonus de vie (un par UPGRADES, 12 emplacements)
export const PROG_HERITAGE0 = 27; // rangs d'héritage (un par HERITAGE, 16 emplacements)
export const PROGRESS_STRIDE = 43;

// Équipement et progression du joueur (persistants) : LOADOUT_STRIDE entiers par joueur.
export const LOADOUT_STRIDE = 11;
export const LOADOUT_SLOT0 = 0; // 3 emplacements d'armes à distance (-1 = vide)
export const LOADOUT_ACTIVE = 3;
export const LOADOUT_MELEE = 4;
export const LOADOUT_PLANS = 5;
export const LOADOUT_OWNED = 6;
export const LOADOUT_MELEE_OWNED = 7;
export const LOADOUT_MAG0 = 8; // munitions chargées dans l'arme de chaque emplacement (3 valeurs)

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
  /** playerCount * BAG_SLOTS * 2 valeurs : (objet + 1, quantité) par emplacement. */
  bags: Int32Array;
  /** playerCount * STASH_SLOTS * 2 valeurs : (objet + 1, quantité) par emplacement du stockage. */
  stash: Int32Array;
  /** playerCount * LOADOUT_STRIDE valeurs. */
  loadout: Int32Array;
  /** playerCount * PROGRESS_STRIDE valeurs. */
  progress: Int32Array;
  /** 1 par caisse de la carte si elle est prête à être fouillée. */
  crates: Uint8Array;
  /** ZONE_STRIDE entiers : état de la fin de zone. */
  zone: Int32Array;
  pickupHigh: number;
  /** pickupHigh * PICKUP_STRIDE valeurs. */
  pickups: Float32Array;
}

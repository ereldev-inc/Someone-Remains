/** Réapparition des zombies sur les cartes : hors de vue, près des bâtiments surtout, un peu partout sinon. */
export const REPOP_INTERVAL_TICKS = 6 * 60;
/** Rayon autour du joueur où l'on compte les ennemis ; au-delà de REPOP_LOCAL_CAP, rien n'apparaît. */
export const REPOP_COUNT_RADIUS = 75;
export const REPOP_LOCAL_CAP = 26;
/** Distance d'apparition au joueur (en dessous de RECYCLE_DIST pour ne pas être retiré aussitôt). */
export const REPOP_MIN_DIST = 42;
export const REPOP_MAX_DIST = 72;
/** Part des apparitions près d'un bâtiment (le reste est dispersé dans la nature). */
export const REPOP_BUILDING_SHARE = 0.7;
export const REPOP_CLUSTER_MIN = 2;
export const REPOP_CLUSTER_MAX = 5;
/** Aucune apparition si le total d'ennemis dépasse ce seuil. */
export const REPOP_GLOBAL_CAP = 1400;
/** Poids d'apparition par type (nom), filtrés par le profil de la carte. */
export const REPOP_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ['rodeur', 55],
  ['coureur', 16],
  ['cracheur', 10],
  ['explosif', 8],
  ['hurleur', 5],
  ['brute', 5],
  ['colosse', 0.6],
];

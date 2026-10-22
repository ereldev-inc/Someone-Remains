export const ITEM_FERRAILLE = 0;
export const ITEM_POUDRE = 1;
export const ITEM_COMPOSANTS = 2;
export const ITEM_CHIMIQUES = 3;
export const ITEM_TISSU = 4;
export const ITEM_MUNITIONS_9MM = 5;
export const ITEM_CARTOUCHES = 6;
export const ITEM_CARREAUX = 7;
export const ITEM_CARBURANT = 8;
export const ITEM_BANDAGE = 9;
export const ITEM_TROUSSE = 10;
export const ITEM_CHARGE_VIRALE = 11;

export const ITEM_PLAN_POMPE = 12;
export const ITEM_PLAN_MITRAILLETTE = 13;
export const ITEM_PLAN_LANCE_FLAMMES = 14;
export const ITEM_PLAN_ARBALETE = 15;
export const ITEM_PLAN_MACHETTE = 16;
export const ITEM_PLAN_HACHE = 17;

export type ItemFamily = 'materiau' | 'munition' | 'soin' | 'rare' | 'plan';

export interface ItemDef {
  name: string;
  family: ItemFamily;
  /** Taille maximale d'une pile (un emplacement du sac). */
  stack: number;
  /** Couleur d'affichage (objets au sol, interface). */
  color: string;
}

/** Index = identifiant d'objet. */
export const ITEMS: readonly ItemDef[] = [
  { name: 'Ferraille', family: 'materiau', stack: 20, color: '#9aa0a6' },
  { name: 'Poudre', family: 'materiau', stack: 20, color: '#555b61' },
  { name: 'Composants', family: 'materiau', stack: 10, color: '#4aa8ff' },
  { name: 'Produits chimiques', family: 'materiau', stack: 10, color: '#8be04a' },
  { name: 'Tissu', family: 'materiau', stack: 20, color: '#e8e0c8' },
  { name: 'Munitions 9 mm', family: 'munition', stack: 60, color: '#ffd24a' },
  { name: 'Cartouches', family: 'munition', stack: 24, color: '#ff8a3d' },
  { name: 'Carreaux', family: 'munition', stack: 24, color: '#c9a36b' },
  { name: 'Carburant', family: 'munition', stack: 100, color: '#ff5d5d' },
  { name: 'Bandage', family: 'soin', stack: 5, color: '#ffffff' },
  { name: 'Trousse de soins', family: 'soin', stack: 3, color: '#ff4d7a' },
  { name: 'Charge virale', family: 'rare', stack: 5, color: '#c77dff' },
  { name: 'Plan : fusil à pompe', family: 'plan', stack: 1, color: '#7fd1ff' },
  { name: 'Plan : mitraillette', family: 'plan', stack: 1, color: '#7fd1ff' },
  { name: 'Plan : lance-flammes', family: 'plan', stack: 1, color: '#7fd1ff' },
  { name: 'Plan : arbalète', family: 'plan', stack: 1, color: '#7fd1ff' },
  { name: 'Plan : machette', family: 'plan', stack: 1, color: '#7fd1ff' },
  { name: 'Plan : hache', family: 'plan', stack: 1, color: '#7fd1ff' },
];

/** Plans, dans l'ordre de leur bit dans le masque `plans` du joueur. */
export const PLAN_ITEMS: readonly number[] = [
  ITEM_PLAN_POMPE,
  ITEM_PLAN_MITRAILLETTE,
  ITEM_PLAN_LANCE_FLAMMES,
  ITEM_PLAN_ARBALETE,
  ITEM_PLAN_MACHETTE,
  ITEM_PLAN_HACHE,
];

/** Emplacements du stockage du refuge (persistant, conservé à la mort). */
export const STASH_SLOTS = 40;

/** Emplacements du sac. */
export const BAG_SLOTS = 12;

/** Contenu du sac à chaque (ré)apparition : (objet, quantité). Provisoire jusqu'au stockage du refuge (jalon M7). */
export const START_KIT: ReadonlyArray<readonly [number, number]> = [
  [ITEM_MUNITIONS_9MM, 24],
  [ITEM_BANDAGE, 2],
];

/** Soins : PV rendus et délai entre deux utilisations. */
export const BANDAGE_HEAL = 25;
export const TROUSSE_HEAL = 60;
export const HEAL_COOLDOWN_TICKS = 75;

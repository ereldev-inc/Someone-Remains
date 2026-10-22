import {
  ITEM_BANDAGE,
  ITEM_CARBURANT,
  ITEM_CARREAUX,
  ITEM_CARTOUCHES,
  ITEM_CHIMIQUES,
  ITEM_COMPOSANTS,
  ITEM_FERRAILLE,
  ITEM_MUNITIONS_9MM,
  ITEM_POUDRE,
  ITEM_TISSU,
  ITEM_TROUSSE,
} from './items';
import { MELEE_HACHE, MELEE_MACHETTE } from './melee';
import { WEAPON_ARBALETE, WEAPON_LANCE_FLAMMES, WEAPON_MITRAILLETTE, WEAPON_POMPE } from './weapons';

export type RecipeOutput =
  | { kind: 'item'; item: number; count: number }
  | { kind: 'weapon'; weapon: number }
  | { kind: 'melee'; weapon: number };

/** Recette fabriquée à l'établi : entrées prises dans le sac puis le stockage ; `plan` = indice du plan requis (bit de `plans`), -1 = aucun. */
export interface RecipeDef {
  name: string;
  inputs: ReadonlyArray<readonly [number, number]>;
  output: RecipeOutput;
  plan: number;
}

/** Index = identifiant de recette. Les entrées sont des valeurs de départ, à équilibrer. */
export const RECIPES: readonly RecipeDef[] = [
  { name: '20 munitions 9 mm', inputs: [[ITEM_FERRAILLE, 2], [ITEM_POUDRE, 1]], output: { kind: 'item', item: ITEM_MUNITIONS_9MM, count: 20 }, plan: -1 },
  { name: '6 cartouches', inputs: [[ITEM_FERRAILLE, 2], [ITEM_POUDRE, 2]], output: { kind: 'item', item: ITEM_CARTOUCHES, count: 6 }, plan: -1 },
  { name: '8 carreaux', inputs: [[ITEM_FERRAILLE, 3], [ITEM_TISSU, 1]], output: { kind: 'item', item: ITEM_CARREAUX, count: 8 }, plan: -1 },
  { name: '40 carburant', inputs: [[ITEM_CHIMIQUES, 3]], output: { kind: 'item', item: ITEM_CARBURANT, count: 40 }, plan: -1 },
  { name: '2 bandages', inputs: [[ITEM_TISSU, 2]], output: { kind: 'item', item: ITEM_BANDAGE, count: 2 }, plan: -1 },
  { name: 'Trousse de soins', inputs: [[ITEM_TISSU, 3], [ITEM_CHIMIQUES, 2]], output: { kind: 'item', item: ITEM_TROUSSE, count: 1 }, plan: -1 },
  { name: 'Fusil à pompe', inputs: [[ITEM_FERRAILLE, 6], [ITEM_COMPOSANTS, 2]], output: { kind: 'weapon', weapon: WEAPON_POMPE }, plan: 0 },
  { name: 'Mitraillette', inputs: [[ITEM_FERRAILLE, 8], [ITEM_COMPOSANTS, 3]], output: { kind: 'weapon', weapon: WEAPON_MITRAILLETTE }, plan: 1 },
  { name: 'Lance-flammes', inputs: [[ITEM_FERRAILLE, 4], [ITEM_COMPOSANTS, 3], [ITEM_CHIMIQUES, 4]], output: { kind: 'weapon', weapon: WEAPON_LANCE_FLAMMES }, plan: 2 },
  { name: 'Arbalète', inputs: [[ITEM_FERRAILLE, 5], [ITEM_COMPOSANTS, 2], [ITEM_TISSU, 2]], output: { kind: 'weapon', weapon: WEAPON_ARBALETE }, plan: 3 },
  { name: 'Machette', inputs: [[ITEM_FERRAILLE, 4]], output: { kind: 'melee', weapon: MELEE_MACHETTE }, plan: 4 },
  { name: 'Hache', inputs: [[ITEM_FERRAILLE, 6], [ITEM_COMPOSANTS, 1]], output: { kind: 'melee', weapon: MELEE_HACHE }, plan: 5 },
];

/** Distance (m) à l'établi ou au stockage pour s'en servir. */
export const STATION_REACH = 3.5;

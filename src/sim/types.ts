export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const MAX_PLAYERS = 64;

/** Identifiant stable : (génération << 16) | index. Voir ecs/pool.ts. */
export type EntityId = number;

export const BTN_FIRE = 1;
export const BTN_DASH = 2;
export const BTN_INTERACT = 4;
export const BTN_MELEE = 8;
export const BTN_HEAL = 16;
export const BTN_RELOAD = 32;

/** Action ponctuelle du joueur (équipement, stockage, fabrication) : traitée au début du tick suivant. */
export type Command =
  | { t: 'select'; slot: number }
  | { t: 'stash'; dir: 'in' | 'out'; item: number; count: number }
  | { t: 'craft'; recipe: number }
  | { t: 'learn'; item: number }
  | { t: 'equip'; slot: number; weapon: number }
  | { t: 'equipMelee'; weapon: number }
  | { t: 'chooseUpgrade'; index: number }
  | { t: 'buyHeritage'; node: number }
  | { t: 'newZone' };

/** Entrée du joueur, échantillonnée à chaque tick de sim. */
export interface InputFrame {
  tick: number;
  moveX: number; // -1..1
  moveY: number; // -1..1
  aimAngle: number; // radians
  buttons: number; // bitmask BTN_*
}

/** Ce que la sim émet ; rendu, audio, compteur et UI l'écoutent. */
export type SimEvent =
  | { t: 'spawn'; id: EntityId; x: number; y: number }
  | { t: 'dash'; id: EntityId; x: number; y: number }
  | { t: 'kill'; enemyType: number; killerId: EntityId; x: number; y: number }
  | { t: 'hit'; targetId: EntityId; dmg: number }
  | { t: 'playerDied'; id: EntityId; kills: number; lifeSeconds: number }
  | { t: 'levelUp'; id: EntityId; choices: number[] }
  | { t: 'swing'; id: EntityId; x: number; y: number; angle: number; range: number; arc: number }
  | { t: 'loot'; id: EntityId; items: number[]; leftover: number }
  | { t: 'heal'; id: EntityId; amount: number }
  | { t: 'craft'; id: EntityId; recipe: number }
  | { t: 'notice'; id: EntityId; text: string }
  | { t: 'explosion'; x: number; y: number; radius: number }
  | { t: 'scream'; x: number; y: number; radius: number }
  | { t: 'evacuation' }
  | { t: 'wave'; wave: number; count: number }
  | { t: 'extracted'; id: EntityId }
  | { t: 'zoneEnd'; wave: number };

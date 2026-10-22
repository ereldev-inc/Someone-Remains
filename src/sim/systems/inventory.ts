import { BAG_SLOTS, ITEMS, START_KIT, STASH_SLOTS } from '../data/items';
import type { Sim } from '../sim';

/** Conteneur à emplacements (sac ou stockage) : tableaux d'objets (-1 = vide) et de quantités, base = premier emplacement. */
function countIn(items: Int16Array, qty: Int32Array, base: number, slots: number, item: number): number {
  let n = 0;
  for (let s = 0; s < slots; s++) if (items[base + s] === item) n += qty[base + s] as number;
  return n;
}

function addTo(items: Int16Array, qty: Int32Array, base: number, slots: number, item: number, count: number): number {
  const def = ITEMS[item];
  if (def === undefined || count <= 0) return 0;
  let left = count;
  for (let s = 0; s < slots && left > 0; s++) {
    if (items[base + s] !== item) continue;
    const put = Math.min(def.stack - (qty[base + s] as number), left);
    qty[base + s] = (qty[base + s] as number) + put;
    left -= put;
  }
  for (let s = 0; s < slots && left > 0; s++) {
    if ((items[base + s] as number) !== -1) continue;
    const put = Math.min(def.stack, left);
    items[base + s] = item;
    qty[base + s] = put;
    left -= put;
  }
  return count - left;
}

/** Retire exactement `count` objets, ou rien si le conteneur n'en contient pas assez. */
function removeFrom(items: Int16Array, qty: Int32Array, base: number, slots: number, item: number, count: number): boolean {
  if (count <= 0) return true;
  if (countIn(items, qty, base, slots, item) < count) return false;
  let left = count;
  while (left > 0) {
    // On vide d'abord les plus petites piles.
    let best = -1;
    for (let s = 0; s < slots; s++) {
      if (items[base + s] !== item) continue;
      if (best < 0 || (qty[base + s] as number) < (qty[base + best] as number)) best = s;
    }
    const take = Math.min(left, qty[base + best] as number);
    qty[base + best] = (qty[base + best] as number) - take;
    left -= take;
    if (qty[base + best] === 0) items[base + best] = -1;
  }
  return true;
}

/** Nombre total d'un objet dans le sac du joueur (index i). */
export function bagCount(sim: Sim, i: number, item: number): number {
  return countIn(sim.players.bagItem, sim.players.bagQty, i * BAG_SLOTS, BAG_SLOTS, item);
}

/** Ajoute `count` objets au sac : complète les piles, puis ouvre des emplacements. Retourne la quantité réellement ajoutée. */
export function bagAdd(sim: Sim, i: number, item: number, count: number): number {
  return addTo(sim.players.bagItem, sim.players.bagQty, i * BAG_SLOTS, BAG_SLOTS, item, count);
}

export function bagRemove(sim: Sim, i: number, item: number, count: number): boolean {
  return removeFrom(sim.players.bagItem, sim.players.bagQty, i * BAG_SLOTS, BAG_SLOTS, item, count);
}

export function bagClear(sim: Sim, i: number): void {
  const p = sim.players;
  for (let s = 0; s < BAG_SLOTS; s++) {
    p.bagItem[i * BAG_SLOTS + s] = -1;
    p.bagQty[i * BAG_SLOTS + s] = 0;
  }
}

export function stashCount(sim: Sim, i: number, item: number): number {
  return countIn(sim.players.stashItem, sim.players.stashQty, i * STASH_SLOTS, STASH_SLOTS, item);
}

export function stashAdd(sim: Sim, i: number, item: number, count: number): number {
  return addTo(sim.players.stashItem, sim.players.stashQty, i * STASH_SLOTS, STASH_SLOTS, item, count);
}

export function stashRemove(sim: Sim, i: number, item: number, count: number): boolean {
  return removeFrom(sim.players.stashItem, sim.players.stashQty, i * STASH_SLOTS, STASH_SLOTS, item, count);
}

/** Sac de départ : vide puis kit de départ. */
export function giveStartKit(sim: Sim, i: number): void {
  bagClear(sim, i);
  for (const [item, qty] of START_KIT) bagAdd(sim, i, item, qty);
}

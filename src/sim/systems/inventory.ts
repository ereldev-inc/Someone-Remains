import { BAG_SLOTS, ITEMS, START_KIT } from '../data/items';
import type { Sim } from '../sim';

/** Nombre total d'un objet dans le sac du joueur (index i). */
export function bagCount(sim: Sim, i: number, item: number): number {
  const p = sim.players;
  let n = 0;
  const base = i * BAG_SLOTS;
  for (let s = 0; s < BAG_SLOTS; s++) if (p.bagItem[base + s] === item) n += p.bagQty[base + s] as number;
  return n;
}

/** Ajoute `count` objets : complète les piles, puis ouvre des emplacements. Retourne la quantité réellement ajoutée. */
export function bagAdd(sim: Sim, i: number, item: number, count: number): number {
  const def = ITEMS[item];
  if (def === undefined || count <= 0) return 0;
  const p = sim.players;
  const base = i * BAG_SLOTS;
  let left = count;
  for (let s = 0; s < BAG_SLOTS && left > 0; s++) {
    if (p.bagItem[base + s] !== item) continue;
    const room = def.stack - (p.bagQty[base + s] as number);
    const put = Math.min(room, left);
    p.bagQty[base + s] = (p.bagQty[base + s] as number) + put;
    left -= put;
  }
  for (let s = 0; s < BAG_SLOTS && left > 0; s++) {
    if ((p.bagItem[base + s] as number) !== -1) continue;
    const put = Math.min(def.stack, left);
    p.bagItem[base + s] = item;
    p.bagQty[base + s] = put;
    left -= put;
  }
  return count - left;
}

/** Retire exactement `count` objets, ou rien si le sac n'en contient pas assez. */
export function bagRemove(sim: Sim, i: number, item: number, count: number): boolean {
  if (count <= 0) return true;
  if (bagCount(sim, i, item) < count) return false;
  const p = sim.players;
  const base = i * BAG_SLOTS;
  let left = count;
  // On vide d'abord les plus petites piles.
  while (left > 0) {
    let best = -1;
    for (let s = 0; s < BAG_SLOTS; s++) {
      if (p.bagItem[base + s] !== item) continue;
      if (best < 0 || (p.bagQty[base + s] as number) < (p.bagQty[base + best] as number)) best = s;
    }
    const take = Math.min(left, p.bagQty[base + best] as number);
    p.bagQty[base + best] = (p.bagQty[base + best] as number) - take;
    left -= take;
    if (p.bagQty[base + best] === 0) p.bagItem[base + best] = -1;
  }
  return true;
}

export function bagClear(sim: Sim, i: number): void {
  const p = sim.players;
  const base = i * BAG_SLOTS;
  for (let s = 0; s < BAG_SLOTS; s++) {
    p.bagItem[base + s] = -1;
    p.bagQty[base + s] = 0;
  }
}

/** Sac de départ : vide puis kit de départ. */
export function giveStartKit(sim: Sim, i: number): void {
  bagClear(sim, i);
  for (const [item, qty] of START_KIT) bagAdd(sim, i, item, qty);
}

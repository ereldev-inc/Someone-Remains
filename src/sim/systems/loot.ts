import { ENEMIES } from '../data/enemies';
import { PICKUP_LIFE_TICKS, PICKUP_REACH, LOOT_TABLES, CRATE_NOISE, CRATE_OPEN_TICKS, CRATE_REACH, crateCooldownTicks } from '../data/loot';
import type { LootTable } from '../data/loot';
import { allocEntity, entityIndex, freeEntity } from '../ecs/pool';
import { next, nextInt, nextRange } from '../rng';
import type { Rng } from '../rng';
import { BTN_INTERACT } from '../types';
import type { EntityId } from '../types';
import type { Sim } from '../sim';
import { bagAdd } from './inventory';
import { statBonus } from './progression';

/** Tire un butin : paires (objet, quantité), doublons fusionnés. Déterministe pour un état de rng donné. */
export function rollLoot(rng: Rng, table: LootTable): number[] {
  const total = table.entries.reduce((s, e) => s + e.weight, 0);
  const rolls = table.minRolls + nextInt(rng, table.maxRolls - table.minRolls + 1);
  const out: number[] = [];
  for (let r = 0; r < rolls; r++) {
    let pick = nextInt(rng, total);
    for (const e of table.entries) {
      if (pick < e.weight) {
        const qty = e.min + nextInt(rng, e.max - e.min + 1);
        const at = out.findIndex((v, k) => k % 2 === 0 && v === e.item);
        if (at >= 0) out[at + 1] = (out[at + 1] as number) + qty;
        else out.push(e.item, qty);
        break;
      }
      pick -= e.weight;
    }
  }
  return out;
}

/** Ajoute des paires (objet, quantité) au sac ; retourne ce qui n'a pas tenu (paires) et ce qui a été pris. */
function deliver(sim: Sim, i: number, pairs: number[]): { taken: number[]; rest: number[] } {
  const taken: number[] = [];
  const rest: number[] = [];
  for (let k = 0; k < pairs.length; k += 2) {
    const item = pairs[k] as number;
    const qty = pairs[k + 1] as number;
    const added = bagAdd(sim, i, item, qty);
    if (added > 0) taken.push(item, added);
    if (added < qty) rest.push(item, qty - added);
  }
  return { taken, rest };
}

function playerId(sim: Sim, i: number): EntityId {
  return (((sim.playerPool.generations[i] as number) << 16) | i) as EntityId;
}

/** Fouille des caisses : `E` maintenu à portée, bruit pendant l'ouverture, butin tiré à la première ouverture. */
export function stepInteraction(sim: Sim, i: number, buttons: number): void {
  const p = sim.players;
  const map = sim.map;
  if (map === null || (buttons & BTN_INTERACT) === 0) {
    p.openProgress[i] = 0;
    p.openCrate[i] = -1;
    return;
  }
  let best = -1;
  let bestD2 = CRATE_REACH * CRATE_REACH;
  map.crates.forEach((c, k) => {
    if (!c.ready) return;
    const dx = c.x - (p.posX[i] as number);
    const dy = c.y - (p.posY[i] as number);
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = k;
    }
  });
  if (best < 0) {
    p.openProgress[i] = 0;
    p.openCrate[i] = -1;
    return;
  }
  if (p.openCrate[i] !== best) {
    p.openCrate[i] = best;
    p.openProgress[i] = 0;
  }
  p.openProgress[i] = (p.openProgress[i] as number) + 1;
  const crateNoise = CRATE_NOISE * (1 - statBonus(sim, i, 'noise'));
  if ((p.noise[i] as number) < crateNoise) p.noise[i] = crateNoise;
  if ((p.openProgress[i] as number) < CRATE_OPEN_TICKS) return;

  const crate = map.crates[best];
  p.openProgress[i] = 0;
  if (crate === undefined) return;
  if (!crate.rolled) {
    crate.items = rollLoot(sim.rng.loot, LOOT_TABLES[crate.tier] ?? (LOOT_TABLES['commune'] as LootTable));
    crate.rolled = true;
  }
  const { taken, rest } = deliver(sim, i, crate.items);
  crate.items = rest;
  sim.events.push({ t: 'loot', id: playerId(sim, i), items: taken, leftover: rest.length / 2 });
  if (rest.length === 0) {
    crate.ready = false;
    crate.cooldown = crateCooldownTicks(crate.tier);
  }
}

/** Compte à rebours de remplissage des caisses vidées. */
export function stepCrates(sim: Sim): void {
  const map = sim.map;
  if (map === null) return;
  for (const c of map.crates) {
    if (c.ready) continue;
    c.cooldown--;
    if (c.cooldown <= 0) {
      c.ready = true;
      c.rolled = false;
      c.items = [];
    }
  }
}

/** Pose un objet au sol en (x, y) ; sans effet si le pool d'objets est plein. */
export function spawnPickup(sim: Sim, item: number, count: number, x: number, y: number): void {
  const id = allocEntity(sim.pickupPool);
  if (id < 0) return;
  const s = entityIndex(id);
  const pk = sim.pickups;
  pk.posX[s] = x;
  pk.posY[s] = y;
  pk.item[s] = item;
  pk.count[s] = count;
  pk.life[s] = PICKUP_LIFE_TICKS;
}

/** Dépose les objets d'un butin d'ennemi au sol, autour de (x, y). */
export function dropLoot(sim: Sim, type: number, x: number, y: number): void {
  const def = ENEMIES[type];
  if (def === undefined) return;
  const rng = sim.rng.loot;
  if (def.dropChance < 1 && next(rng) >= def.dropChance) return;
  const table = LOOT_TABLES[def.dropTable];
  if (table === undefined) return;
  const pairs = rollLoot(rng, table);
  for (let k = 0; k < pairs.length; k += 2) {
    const id = allocEntity(sim.pickupPool);
    if (id < 0) return;
    const s = entityIndex(id);
    const a = nextRange(rng, 0, Math.PI * 2);
    const r = nextRange(rng, 0.2, 0.9);
    const pk = sim.pickups;
    pk.posX[s] = x + Math.cos(a) * r;
    pk.posY[s] = y + Math.sin(a) * r;
    pk.item[s] = pairs[k] as number;
    pk.count[s] = pairs[k + 1] as number;
    pk.life[s] = PICKUP_LIFE_TICKS;
  }
}

/** Ramassage automatique des objets au sol par les joueurs vivants à portée ; expiration. */
export function stepPickups(sim: Sim): void {
  const pool = sim.pickupPool;
  const pk = sim.pickups;
  const pl = sim.players;
  for (let s = 0; s < pool.highWater; s++) {
    if (pool.alive[s] === 0) continue;
    pk.life[s] = (pk.life[s] as number) - 1;
    let gone = (pk.life[s] as number) <= 0;
    for (let k = 0; k < sim.liveCount && !gone; k++) {
      const i = sim.live[k] as number;
      const dx = (pl.posX[i] as number) - (pk.posX[s] as number);
      const dy = (pl.posY[i] as number) - (pk.posY[s] as number);
      const reach = PICKUP_REACH * (1 + statBonus(sim, i, 'pickup'));
      if (dx * dx + dy * dy > reach * reach) continue;
      const item = pk.item[s] as number;
      const added = bagAdd(sim, i, item, pk.count[s] as number);
      if (added > 0) {
        sim.events.push({ t: 'loot', id: playerId(sim, i), items: [item, added], leftover: added < (pk.count[s] as number) ? 1 : 0 });
        pk.count[s] = (pk.count[s] as number) - added;
        if (pk.count[s] === 0) gone = true;
      }
    }
    if (gone) freeEntity(pool, (((pool.generations[s] as number) << 16) | s) as EntityId);
  }
}

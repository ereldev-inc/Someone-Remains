import { BAG_SLOTS, ITEMS, PLAN_ITEMS, STASH_SLOTS } from '../data/items';
import { MELEE_WEAPONS } from '../data/melee';
import { RECIPES, STATION_REACH } from '../data/recipes';
import { WEAPONS, WEAPON_SLOTS } from '../data/weapons';
import { entityIndex, isAlive } from '../ecs/pool';
import type { Sim } from '../sim';
import type { Command, EntityId } from '../types';
import { bagAdd, bagCount, bagRemove, stashAdd, stashCount, stashRemove } from './inventory';

type Station = 'workbench' | 'stash';

/** Vrai si le joueur (index i) est à portée de l'établi ou du stockage d'un refuge. */
export function nearStation(sim: Sim, i: number, station: Station): boolean {
  const map = sim.map;
  if (map === null) return false;
  const px = sim.players.posX[i] as number;
  const py = sim.players.posY[i] as number;
  const r2 = STATION_REACH * STATION_REACH;
  return map.refuges.some((r) => {
    const p = r[station];
    return (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py) <= r2;
  });
}

function notice(sim: Sim, id: EntityId, text: string): void {
  sim.events.push({ t: 'notice', id, text });
}

/** Sélectionne l'arme à distance de l'emplacement (touches 1 à 3) ; léger délai avant de pouvoir tirer. */
function select(sim: Sim, i: number, slot: number): void {
  const p = sim.players;
  if (!Number.isInteger(slot) || slot < 0 || slot >= WEAPON_SLOTS) return;
  const weapon = p.slotWeapon[i * WEAPON_SLOTS + slot] as number;
  if (weapon < 0) return;
  p.activeSlot[i] = slot;
  p.weapon[i] = weapon;
  if ((p.fireCooldown[i] as number) < 8) p.fireCooldown[i] = 8;
}

function equip(sim: Sim, id: EntityId, i: number, slot: number, weapon: number): void {
  const p = sim.players;
  if (!nearStation(sim, i, 'workbench')) return notice(sim, id, 'Rapprochez-vous de l\'établi');
  if (!Number.isInteger(slot) || slot < 0 || slot >= WEAPON_SLOTS || WEAPONS[weapon] === undefined) return;
  if (((p.owned[i] as number) & (1 << weapon)) === 0) return notice(sim, id, 'Arme non possédée');
  const base = i * WEAPON_SLOTS;
  // Une arme n'occupe qu'un emplacement : on la retire de l'ancien.
  for (let s = 0; s < WEAPON_SLOTS; s++) if (p.slotWeapon[base + s] === weapon) p.slotWeapon[base + s] = -1;
  p.slotWeapon[base + slot] = weapon;
  // L'emplacement actif doit toujours contenir une arme.
  if (p.slotWeapon[base + (p.activeSlot[i] as number)] === -1) {
    p.activeSlot[i] = slot;
  }
  p.weapon[i] = p.slotWeapon[base + (p.activeSlot[i] as number)] as number;
}

function equipMelee(sim: Sim, id: EntityId, i: number, weapon: number): void {
  const p = sim.players;
  if (!nearStation(sim, i, 'workbench')) return notice(sim, id, 'Rapprochez-vous de l\'établi');
  if (MELEE_WEAPONS[weapon] === undefined || ((p.meleeOwned[i] as number) & (1 << weapon)) === 0) return notice(sim, id, 'Arme non possédée');
  p.meleeWeapon[i] = weapon;
}

function stashMove(sim: Sim, id: EntityId, i: number, dir: 'in' | 'out', item: number, count: number): void {
  if (ITEMS[item] === undefined || !Number.isInteger(count) || count <= 0) return;
  if (!nearStation(sim, i, 'stash')) return notice(sim, id, 'Rapprochez-vous du stockage');
  if (dir === 'in') {
    const move = Math.min(count, bagCount(sim, i, item));
    if (move <= 0) return;
    const stored = stashAdd(sim, i, item, move);
    bagRemove(sim, i, item, stored);
    if (stored < move) notice(sim, id, 'Stockage plein');
  } else {
    const move = Math.min(count, stashCount(sim, i, item));
    if (move <= 0) return;
    const taken = bagAdd(sim, i, item, move);
    stashRemove(sim, i, item, taken);
    if (taken < move) notice(sim, id, 'Sac plein');
  }
}

function learn(sim: Sim, id: EntityId, i: number, item: number): void {
  const p = sim.players;
  const bit = PLAN_ITEMS.indexOf(item);
  if (bit < 0) return;
  if (!nearStation(sim, i, 'workbench')) return notice(sim, id, 'Rapprochez-vous de l\'établi');
  if (((p.plans[i] as number) & (1 << bit)) !== 0) return notice(sim, id, 'Plan déjà appris');
  const fromBag = bagCount(sim, i, item) > 0;
  if (!fromBag && stashCount(sim, i, item) === 0) return;
  if (fromBag) bagRemove(sim, i, item, 1);
  else stashRemove(sim, i, item, 1);
  p.plans[i] = (p.plans[i] as number) | (1 << bit);
  notice(sim, id, `Plan appris : ${ITEMS[item]?.name ?? ''}`);
}

/** Fabrique : entrées prises dans le sac puis le stockage ; le résultat va dans le sac, sinon dans le stockage. Tout ou rien. */
function craft(sim: Sim, id: EntityId, i: number, recipeIndex: number): void {
  const p = sim.players;
  const recipe = RECIPES[recipeIndex];
  if (recipe === undefined) return;
  if (!nearStation(sim, i, 'workbench')) return notice(sim, id, 'Rapprochez-vous de l\'établi');
  if (recipe.plan >= 0 && ((p.plans[i] as number) & (1 << recipe.plan)) === 0) return notice(sim, id, 'Plan inconnu');
  for (const [item, need] of recipe.inputs) {
    if (bagCount(sim, i, item) + stashCount(sim, i, item) < need) return notice(sim, id, 'Matériaux insuffisants');
  }
  if (recipe.output.kind === 'weapon' && ((p.owned[i] as number) & (1 << recipe.output.weapon)) !== 0) return notice(sim, id, 'Déjà fabriquée');
  if (recipe.output.kind === 'melee' && ((p.meleeOwned[i] as number) & (1 << recipe.output.weapon)) !== 0) return notice(sim, id, 'Déjà fabriquée');

  // Sauvegarde du sac et du stockage : si le résultat ne tient nulle part, on annule tout.
  const bagItems = p.bagItem.slice(i * BAG_SLOTS, (i + 1) * BAG_SLOTS);
  const bagQty = p.bagQty.slice(i * BAG_SLOTS, (i + 1) * BAG_SLOTS);
  const stashItems = p.stashItem.slice(i * STASH_SLOTS, (i + 1) * STASH_SLOTS);
  const stashQty = p.stashQty.slice(i * STASH_SLOTS, (i + 1) * STASH_SLOTS);
  for (const [item, need] of recipe.inputs) {
    const fromBag = Math.min(need, bagCount(sim, i, item));
    bagRemove(sim, i, item, fromBag);
    stashRemove(sim, i, item, need - fromBag);
  }
  if (recipe.output.kind === 'item') {
    const out = recipe.output;
    let left = out.count - bagAdd(sim, i, out.item, out.count);
    if (left > 0) left -= stashAdd(sim, i, out.item, left);
    if (left > 0) {
      p.bagItem.set(bagItems, i * BAG_SLOTS);
      p.bagQty.set(bagQty, i * BAG_SLOTS);
      p.stashItem.set(stashItems, i * STASH_SLOTS);
      p.stashQty.set(stashQty, i * STASH_SLOTS);
      return notice(sim, id, 'Pas de place pour le résultat');
    }
  } else if (recipe.output.kind === 'weapon') {
    const w = recipe.output.weapon;
    p.owned[i] = (p.owned[i] as number) | (1 << w);
    // Équipée d'office dans le premier emplacement libre.
    const base = i * WEAPON_SLOTS;
    for (let s = 0; s < WEAPON_SLOTS; s++) {
      if (p.slotWeapon[base + s] === -1) {
        p.slotWeapon[base + s] = w;
        break;
      }
    }
  } else {
    p.meleeOwned[i] = (p.meleeOwned[i] as number) | (1 << recipe.output.weapon);
  }
  sim.events.push({ t: 'craft', id, recipe: recipeIndex });
}

/** Applique les commandes en attente, dans l'ordre d'arrivée. Les commandes d'un joueur absent ou mort sont ignorées. */
export function applyCommands(sim: Sim): void {
  const queue = sim.commands;
  for (let k = 0; k < queue.length; k++) {
    const { id, cmd } = queue[k] as { id: EntityId; cmd: Command };
    if (!isAlive(sim.playerPool, id)) continue;
    const i = entityIndex(id);
    if (sim.players.dead[i] === 1) continue;
    switch (cmd.t) {
      case 'select':
        select(sim, i, cmd.slot);
        break;
      case 'equip':
        equip(sim, id, i, cmd.slot, cmd.weapon);
        break;
      case 'equipMelee':
        equipMelee(sim, id, i, cmd.weapon);
        break;
      case 'stash':
        stashMove(sim, id, i, cmd.dir, cmd.item, cmd.count);
        break;
      case 'learn':
        learn(sim, id, i, cmd.item);
        break;
      case 'craft':
        craft(sim, id, i, cmd.recipe);
        break;
    }
  }
  queue.length = 0;
}

/** Matériel de démonstration (`?kit=1`) : tous les plans appris, de quoi fabriquer, dans le stockage. */
export function giveDebugKit(sim: Sim, id: EntityId): void {
  const i = entityIndex(id);
  sim.players.plans[i] = (1 << PLAN_ITEMS.length) - 1;
  for (let item = 0; item < 12; item++) stashAdd(sim, i, item, item === 7 || item === 6 ? 24 : 40);
}

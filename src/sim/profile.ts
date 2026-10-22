import { ITEMS, PLAN_ITEMS, STASH_SLOTS } from './data/items';
import { MELEE_WEAPONS } from './data/melee';
import { HERITAGE, HERITAGE_SLOTS } from './data/progression';
import { WEAPONS, WEAPON_PISTOL, WEAPON_SLOTS } from './data/weapons';
import { entityIndex } from './ecs/pool';
import type { Sim } from './sim';
import { giveStartKit, stashAdd } from './systems/inventory';
import { loadMagazineInstant } from './systems/reload';
import { maxHpOf } from './systems/progression';
import { TICK_RATE } from './types';
import type { EntityId } from './types';

export const PROFILE_VERSION = 1;

/**
 * Ce qui survit à la mort et à la fermeture du jeu : héritage, Rémanence, statistiques, stockage, plans et armes.
 * Pas d'état de combat : fermer l'onglet n'a pas de pénalité (la vie en cours est simplement abandonnée).
 */
export interface Profile {
  version: number;
  heritage: number[];
  remanence: number;
  totalKills: number;
  deaths: number;
  bestSurvivalSeconds: number;
  /** Paires (objet, quantité) du stockage. */
  stash: number[];
  plans: number;
  owned: number;
  meleeOwned: number;
  slotWeapon: number[];
  meleeWeapon: number;
}

export function exportProfile(sim: Sim, id: EntityId): Profile {
  const p = sim.players;
  const i = entityIndex(id);
  const stash: number[] = [];
  for (let s = 0; s < STASH_SLOTS; s++) {
    const item = p.stashItem[i * STASH_SLOTS + s] as number;
    if (item >= 0) stash.push(item, p.stashQty[i * STASH_SLOTS + s] as number);
  }
  return {
    version: PROFILE_VERSION,
    heritage: Array.from(p.heritage.subarray(i * HERITAGE_SLOTS, i * HERITAGE_SLOTS + HERITAGE.length)),
    remanence: p.remanence[i] as number,
    totalKills: p.totalKills[i] as number,
    deaths: p.deaths[i] as number,
    bestSurvivalSeconds: Math.floor((p.bestSurvival[i] as number) / TICK_RATE),
    stash,
    plans: p.plans[i] as number,
    owned: p.owned[i] as number,
    meleeOwned: p.meleeOwned[i] as number,
    slotWeapon: Array.from(p.slotWeapon.subarray(i * WEAPON_SLOTS, (i + 1) * WEAPON_SLOTS)),
    meleeWeapon: p.meleeWeapon[i] as number,
  };
}

function nat(v: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null;
}

/** Contrôle et normalise un profil lu depuis une sauvegarde ; retourne null si illisible ou d'une version inconnue. */
export function parseProfile(raw: unknown): Profile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  // Versions : seule la 1 existe. Les futures migrations s'ajouteront ici (n → n+1).
  if (o['version'] !== 1) return null;
  const remanence = nat(o['remanence']);
  const totalKills = nat(o['totalKills']);
  const deaths = nat(o['deaths']);
  const best = nat(o['bestSurvivalSeconds']);
  if (remanence === null || totalKills === null || deaths === null || best === null) return null;

  const heritage = HERITAGE.map((h, k) => {
    const list = Array.isArray(o['heritage']) ? (o['heritage'] as unknown[]) : [];
    return Math.min(h.max, nat(list[k], 255) ?? 0);
  });
  const stash: number[] = [];
  const list = Array.isArray(o['stash']) ? (o['stash'] as unknown[]) : [];
  for (let k = 0; k + 1 < list.length; k += 2) {
    const item = nat(list[k]);
    const qty = nat(list[k + 1]);
    if (item !== null && qty !== null && qty > 0 && ITEMS[item] !== undefined) stash.push(item, qty);
  }
  const planBits = (1 << PLAN_ITEMS.length) - 1;
  const owned = ((nat(o['owned'], 0xffffffff) ?? 0) & ((1 << WEAPONS.length) - 1)) | (1 << WEAPON_PISTOL);
  const meleeOwned = ((nat(o['meleeOwned'], 0xffffffff) ?? 0) & ((1 << MELEE_WEAPONS.length) - 1)) | 1;
  const slots = Array.isArray(o['slotWeapon']) ? (o['slotWeapon'] as unknown[]) : [];
  const slotWeapon = Array.from({ length: WEAPON_SLOTS }, (_, k) => {
    const w = slots[k];
    return typeof w === 'number' && Number.isInteger(w) && WEAPONS[w] !== undefined && (owned & (1 << w)) !== 0 ? w : -1;
  });
  if (!slotWeapon.some((w) => w >= 0)) slotWeapon[0] = WEAPON_PISTOL;
  const melee = nat(o['meleeWeapon']);
  return {
    version: PROFILE_VERSION,
    heritage,
    remanence,
    totalKills,
    deaths,
    bestSurvivalSeconds: best,
    stash,
    plans: (nat(o['plans'], 0xffffffff) ?? 0) & planBits,
    owned,
    meleeOwned,
    slotWeapon,
    meleeWeapon: melee !== null && MELEE_WEAPONS[melee] !== undefined && (meleeOwned & (1 << melee)) !== 0 ? melee : 0,
  };
}

/** Applique un profil à un joueur fraîchement ajouté. */
export function importProfile(sim: Sim, id: EntityId, profile: Profile): void {
  const p = sim.players;
  const i = entityIndex(id);
  p.heritage.set(profile.heritage, i * HERITAGE_SLOTS);
  p.remanence[i] = profile.remanence;
  p.totalKills[i] = profile.totalKills;
  p.deaths[i] = profile.deaths;
  p.bestSurvival[i] = profile.bestSurvivalSeconds * TICK_RATE;
  p.plans[i] = profile.plans;
  p.owned[i] = profile.owned;
  p.meleeOwned[i] = profile.meleeOwned;
  p.slotWeapon.set(profile.slotWeapon, i * WEAPON_SLOTS);
  p.activeSlot[i] = Math.max(0, profile.slotWeapon.findIndex((w) => w >= 0));
  p.weapon[i] = profile.slotWeapon[p.activeSlot[i] as number] as number;
  p.meleeWeapon[i] = profile.meleeWeapon;
  for (let k = 0; k + 1 < profile.stash.length; k += 2) stashAdd(sim, i, profile.stash[k] as number, profile.stash[k + 1] as number);
  // Les bonus d'héritage peuvent changer les PV max et le kit de départ.
  p.hp[i] = maxHpOf(sim, i);
  giveStartKit(sim, i);
  loadMagazineInstant(sim, i, p.weapon[i] as number);
}

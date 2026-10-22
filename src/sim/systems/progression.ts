import { PLAYER_MAX_HP } from '../data/player';
import { CHOICES, HERITAGE, HERITAGE_SLOTS, heritageCost, remanenceEarned, UPGRADES, xpToNext, STAT_LIMITS } from '../data/progression';
import type { Stat } from '../data/progression';
import { nextInt } from '../rng';
import type { EntityId } from '../types';
import type { Sim } from '../sim';

function entityOf(sim: Sim, i: number): EntityId {
  return (((sim.playerPool.generations[i] as number) << 16) | i) as EntityId;
}

/** Rang d'un bonus de niveau de vie (u) ou d'héritage (h). */
export function upgradeRank(sim: Sim, i: number, u: number): number {
  return sim.players.lifeUpgrades[i * UPGRADES.length + u] as number;
}

export function heritageRank(sim: Sim, i: number, h: number): number {
  return sim.players.heritage[i * HERITAGE_SLOTS + h] as number;
}

/**
 * Somme des bonus d'une statistique : héritage (rendements décroissants : le rang k vaut base × decay^k)
 * et bonus de niveau de vie, plafonnée par STAT_LIMITS.
 */
export function statBonus(sim: Sim, i: number, stat: Stat): number {
  let total = 0;
  HERITAGE.forEach((h, k) => {
    if (h.stat !== stat) return;
    const ranks = heritageRank(sim, i, k);
    for (let r = 0; r < ranks; r++) total += h.base * Math.pow(h.decay, r);
  });
  UPGRADES.forEach((u, k) => {
    if (u.stat === stat) total += u.value * upgradeRank(sim, i, k);
  });
  return Math.min(total, STAT_LIMITS[stat]);
}

export function maxHpOf(sim: Sim, i: number): number {
  return PLAYER_MAX_HP + statBonus(sim, i, 'maxHp');
}

/** Tire jusqu'à CHOICES indices distincts parmi ceux acceptés (`weights` > 0), sans remise. */
function pickDistinct(sim: Sim, weights: number[], out: Int8Array, base: number): number {
  const w = weights.slice();
  let n = 0;
  for (let c = 0; c < CHOICES; c++) {
    const total = w.reduce((s, v) => s + v, 0);
    if (total <= 0) break;
    let roll = nextInt(sim.rng.progression, Math.round(total * 1000)) / 1000;
    let picked = -1;
    for (let k = 0; k < w.length; k++) {
      const v = w[k] as number;
      if (v <= 0) continue;
      if (roll < v) {
        picked = k;
        break;
      }
      roll -= v;
    }
    if (picked < 0) picked = w.findIndex((v) => v > 0);
    out[base + n++] = picked;
    w[picked] = 0;
  }
  for (let c = n; c < CHOICES; c++) out[base + c] = -1;
  return n;
}

/** Propose 3 bonus de niveau de vie si aucun choix n'est en attente et qu'un niveau est à dépenser. */
function rollUpgrades(sim: Sim, i: number): void {
  const p = sim.players;
  if ((p.upgradeChoice[i * CHOICES] as number) !== -1 || (p.pendingLevels[i] as number) === 0) return;
  const weights = UPGRADES.map((u, k) => (upgradeRank(sim, i, k) < u.max ? 1 : 0));
  const n = pickDistinct(sim, weights, p.upgradeChoice, i * CHOICES);
  p.pendingLevels[i] = (p.pendingLevels[i] as number) - 1;
  if (n === 0) return;
  sim.events.push({ t: 'levelUp', id: entityOf(sim, i), choices: Array.from(p.upgradeChoice.subarray(i * CHOICES, i * CHOICES + n)) });
}

/** Ajoute de l'XP au joueur (index i), monte de niveau tant que le seuil est franchi. */
export function addXp(sim: Sim, i: number, amount: number): void {
  const p = sim.players;
  p.xp[i] = (p.xp[i] as number) + Math.round(amount * (1 + statBonus(sim, i, 'xp')));
  for (;;) {
    const need = xpToNext(p.level[i] as number);
    if ((p.xp[i] as number) < need) break;
    p.xp[i] = (p.xp[i] as number) - need;
    p.level[i] = (p.level[i] as number) + 1;
    p.pendingLevels[i] = (p.pendingLevels[i] as number) + 1;
  }
  rollUpgrades(sim, i);
}

/** Choisit l'une des 3 propositions de niveau de vie. */
export function chooseUpgrade(sim: Sim, i: number, index: number): void {
  const p = sim.players;
  if (!Number.isInteger(index) || index < 0 || index >= CHOICES) return;
  const u = p.upgradeChoice[i * CHOICES + index] as number;
  if (u < 0) return;
  p.lifeUpgrades[i * UPGRADES.length + u] = upgradeRank(sim, i, u) + 1;
  p.upgradeChoice.fill(-1, i * CHOICES, (i + 1) * CHOICES);
  const def = UPGRADES[u];
  if (def?.stat === 'maxHp') p.hp[i] = Math.min(maxHpOf(sim, i), (p.hp[i] as number) + def.value);
  rollUpgrades(sim, i); // un niveau en attente ?
}

/** Fin d'expédition réussie : la Rémanence de la vie est créditée (comme à la mort), sans perdre le sac. */
export function bankLife(sim: Sim, i: number): void {
  const p = sim.players;
  const ticks = p.lifeTicks[i] as number;
  p.remanence[i] = (p.remanence[i] as number) + remanenceEarned(p.lifeKills[i] as number, ticks);
  if (ticks > (p.bestSurvival[i] as number)) p.bestSurvival[i] = ticks;
}

/** Fin de vie : niveau, XP et bonus de vie retombent ; la Rémanence est créditée . */
export function onPlayerDeath(sim: Sim, i: number): void {
  const p = sim.players;
  const kills = p.lifeKills[i] as number;
  const ticks = p.lifeTicks[i] as number;
  p.remanence[i] = (p.remanence[i] as number) + remanenceEarned(kills, ticks);
  p.deaths[i] = (p.deaths[i] as number) + 1;
  if (ticks > (p.bestSurvival[i] as number)) p.bestSurvival[i] = ticks;
  p.level[i] = 1;
  p.xp[i] = 0;
  p.pendingLevels[i] = 0;
  p.lifeUpgrades.fill(0, i * UPGRADES.length, (i + 1) * UPGRADES.length);
  p.upgradeChoice.fill(-1, i * CHOICES, (i + 1) * CHOICES);
}

/** Achète un rang de l'arbre d'héritage avec la Rémanence : parent suffisamment développé, rang non maximal, solde suffisant. */
export function buyHeritage(sim: Sim, i: number, node: number): boolean {
  const p = sim.players;
  const def = HERITAGE[node];
  if (def === undefined || !Number.isInteger(node)) return false;
  if (p.dead[i] === 0 && p.inRefuge[i] === 0) return false; // au refuge ou à l'écran de mort seulement
  const rank = heritageRank(sim, i, node);
  if (rank >= def.max) return false;
  if (def.requires >= 0 && heritageRank(sim, i, def.requires) < def.requiresRank) return false;
  const cost = heritageCost(def, rank);
  if ((p.remanence[i] as number) < cost) return false;
  p.remanence[i] = (p.remanence[i] as number) - cost;
  p.heritage[i * HERITAGE_SLOTS + node] = rank + 1;
  if (def.stat === 'maxHp' && p.dead[i] === 0) p.hp[i] = Math.min(maxHpOf(sim, i), (p.hp[i] as number) + def.base);
  return true;
}

import {
  AMBIENT_ENEMIES_PER_PLAYER,
  AMBIENT_WEIGHTS,
  ENEMIES,
  ENEMY_BIG_RADIUS,
  ENEMY_MAX_RADIUS,
  RAGE_SPEED_MULT,
  RECYCLE_DIST,
  SPAWN_MAX_DIST,
  SPAWN_MIN_DIST,
  SPAWN_PER_TICK,
  WANDER_PERIOD_TICKS,
  WANDER_RADIUS,
} from '../data/enemies';
import type { EnemyDef } from '../data/enemies';
import { PATTERNS } from '../data/patterns';
import { PLAYER_RADIUS } from '../data/player';
import { queryGrid } from '../ecs/grid';
import { allocEntity, entityIndex, freeEntity, isAlive } from '../ecs/pool';
import { next, nextInt, nextRange } from '../rng';
import { PROJ_KIND_ENEMY } from '../snapshot';
import { DT } from '../types';
import type { EntityId } from '../types';
import type { Sim } from '../sim';
import { difficultyAt } from '../world/map';
import { overlapsObstacle, pushOutOfObstacles } from './collision';
import { spawnProjectileRaw } from './combat';
import { damagePlayer } from './player';

export const STATE_IDLE = 0;
export const STATE_CHASE = 1;

/** Phases d'action d'un ennemi : préparation visible, action, récupération. */
export const PHASE_NONE = 0;
export const PHASE_WINDUP = 1;
export const PHASE_ACT = 2;
export const PHASE_RECOVER = 3;

const TAU = Math.PI * 2;
const AMBIENT_TOTAL_WEIGHT = AMBIENT_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);

function enemyId(sim: Sim, slot: number): EntityId {
  return (((sim.enemyPool.generations[slot] as number) << 16) | slot) as EntityId;
}

/** Crée un ennemi (au repos par défaut) ; retourne son identifiant, ou -1 si le pool est plein. */
export function spawnEnemy(sim: Sim, type: number, x: number, y: number, state = STATE_IDLE, hpMult = 1, dmgMult = 1, persistent = false): EntityId {
  const def = ENEMIES[type];
  if (def === undefined) return -1;
  const id = allocEntity(sim.enemyPool);
  if (id < 0) return -1;
  const s = entityIndex(id);
  const e = sim.enemies;
  e.posX[s] = x;
  e.posY[s] = y;
  e.hp[s] = def.hp * hpMult;
  e.maxHp[s] = def.hp * hpMult;
  e.dmgMult[s] = dmgMult;
  e.persistent[s] = persistent ? 1 : 0;
  e.angle[s] = 0;
  e.flash[s] = 0;
  e.type[s] = type;
  e.state[s] = state;
  e.homeX[s] = x;
  e.homeY[s] = y;
  e.phase[s] = PHASE_NONE;
  e.timer[s] = 0;
  // Décale les premières attaques pour que les ennemis d'un groupe ne tirent pas tous au même tick.
  e.cooldown[s] = 20 + (s % 40);
  e.aux[s] = 0;
  e.patternIndex[s] = 0;
  e.pattern[s] = -1;
  e.burstsLeft[s] = 0;
  e.burstTimer[s] = 0;
  e.rage[s] = 0;
  e.screams[s] = 0;
  e.parent[s] = -1;
  e.childCount[s] = 0;
  return id;
}

/** Libère l'ennemi de l'emplacement `slot` (sans kill) et prévient la Souche qui l'a généré. */
export function releaseEnemy(sim: Sim, slot: number): void {
  const pool = sim.enemyPool;
  const e = sim.enemies;
  const parent = e.parent[slot] as number;
  if (parent >= 0 && isAlive(pool, parent)) {
    const p = entityIndex(parent);
    e.childCount[p] = Math.max(0, (e.childCount[p] as number) - 1);
  }
  freeEntity(pool, enemyId(sim, slot));
}

/** Explosion en zone : blesse les joueurs vivants dans le rayon. */
export function explodeAt(sim: Sim, x: number, y: number, radius: number, damage: number): void {
  sim.events.push({ t: 'explosion', x, y, radius });
  const pl = sim.players;
  for (let k = 0; k < sim.liveCount; k++) {
    const pi = sim.live[k] as number;
    const dx = (pl.posX[pi] as number) - x;
    const dy = (pl.posY[pi] as number) - y;
    const reach = radius + PLAYER_RADIUS;
    if (dx * dx + dy * dy <= reach * reach) damagePlayer(sim, pi, damage);
  }
}

/** Inflige des dégâts à l'ennemi de l'emplacement `slot` ; le tue et émet 'kill' si ses PV tombent à 0. */
export function damageEnemy(sim: Sim, slot: number, dmg: number, killer: EntityId): void {
  const e = sim.enemies;
  e.hp[slot] = (e.hp[slot] as number) - dmg;
  e.flash[slot] = 6;
  e.state[slot] = STATE_CHASE; // être touché réveille
  if ((e.hp[slot] as number) > 0) return;
  killEnemy(sim, slot, killer);
}

function killEnemy(sim: Sim, slot: number, killer: EntityId): void {
  const e = sim.enemies;
  const def = ENEMIES[e.type[slot] as number];
  const x = e.posX[slot] as number;
  const y = e.posY[slot] as number;
  sim.events.push({ t: 'kill', enemyType: e.type[slot] as number, killerId: killer, x, y });
  if (killer >= 0 && sim.playerPool.alive[entityIndex(killer)] === 1) {
    const k = entityIndex(killer);
    sim.players.lifeKills[k] = (sim.players.lifeKills[k] as number) + 1;
  }
  const dmg = e.dmgMult[slot] as number;
  releaseEnemy(sim, slot);
  // Un explosif tué explose : le tuer de près est dangereux.
  if (def?.explode !== undefined) explodeAt(sim, x, y, def.explode.radius, def.explode.damage * dmg);
}

function hash2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/** Approche, recule ou tourne autour du joueur pour rester entre keepMin et keepMax. */
function kite(sim: Sim, s: number, def: EnemyDef, keepMin: number, keepMax: number, ux: number, uy: number, dist: number): void {
  const st = sim.steer;
  if (dist > keepMax) {
    st.dx = ux;
    st.dy = uy;
    st.speed = def.speed;
  } else if (dist < keepMin) {
    st.dx = -ux;
    st.dy = -uy;
    st.speed = def.speed * 0.85;
  } else {
    const sign = s % 2 === 0 ? 1 : -1;
    st.dx = -uy * sign;
    st.dy = ux * sign;
    st.speed = def.speed * 0.4;
  }
}

/** Émet une salve du motif en cours ; gère l'intervalle entre salves. */
function runPattern(sim: Sim, s: number, ux: number, uy: number): void {
  const e = sim.enemies;
  if ((e.burstTimer[s] as number) > 0) {
    e.burstTimer[s] = (e.burstTimer[s] as number) - 1;
    return;
  }
  const pat = PATTERNS[e.pattern[s] as number];
  if (pat === undefined) {
    e.burstsLeft[s] = 0;
    return;
  }
  const base = pat.aim ? Math.atan2(uy, ux) : (e.aux[s] as number);
  const ring = pat.arc >= TAU - 1e-6;
  for (let i = 0; i < pat.count; i++) {
    let angle = base;
    if (ring) angle += (i * pat.arc) / pat.count;
    else if (pat.count > 1) angle += (i - (pat.count - 1) / 2) * (pat.arc / (pat.count - 1));
    spawnProjectileRaw(sim, e.posX[s] as number, e.posY[s] as number, angle, pat.speed, pat.damage * (e.dmgMult[s] as number), pat.radius, pat.lifeTicks, 0, -1, PROJ_KIND_ENEMY);
  }
  e.burstsLeft[s] = (e.burstsLeft[s] as number) - 1;
  e.burstTimer[s] = pat.delayTicks;
  if (!pat.aim) e.aux[s] = (e.aux[s] as number) + pat.rotation;
}

function steerMelee(sim: Sim, s: number, def: EnemyDef, ux: number, uy: number, dist: number): void {
  const st = sim.steer;
  let dx = ux;
  let dy = uy;
  if (def.zigzag > 0) {
    const off = def.zigzag * Math.sin((TAU * (sim.tick + s * 13)) / def.zigzagPeriodTicks);
    const c = Math.cos(off);
    const sn = Math.sin(off);
    dx = ux * c - uy * sn;
    dy = ux * sn + uy * c;
  }
  st.dx = dx;
  st.dy = dy;
  // Au contact, l'ennemi s'arrête : il ne s'empile pas sur le joueur.
  st.speed = dist > def.radius + PLAYER_RADIUS ? def.speed : 0;
}

function steerBrute(sim: Sim, s: number, def: EnemyDef, ux: number, uy: number, dist: number): void {
  const e = sim.enemies;
  const st = sim.steer;
  const c = def.charge;
  if (c === undefined) return;
  switch (e.phase[s]) {
    case PHASE_WINDUP:
      st.speed = 0;
      st.contact = 0;
      e.angle[s] = e.aux[s] as number;
      e.timer[s] = (e.timer[s] as number) - 1;
      if ((e.timer[s] as number) <= 0) {
        e.phase[s] = PHASE_ACT;
        e.timer[s] = c.chargeTicks;
      }
      return;
    case PHASE_ACT:
      st.dx = Math.cos(e.aux[s] as number);
      st.dy = Math.sin(e.aux[s] as number);
      st.speed = c.chargeSpeed;
      st.contact = c.damage * (e.dmgMult[s] as number);
      e.angle[s] = e.aux[s] as number;
      e.timer[s] = (e.timer[s] as number) - 1;
      if ((e.timer[s] as number) <= 0) {
        e.phase[s] = PHASE_RECOVER;
        e.timer[s] = c.recoverTicks;
      }
      return;
    case PHASE_RECOVER:
      st.speed = 0;
      st.contact = 0;
      e.timer[s] = (e.timer[s] as number) - 1;
      if ((e.timer[s] as number) <= 0) {
        e.phase[s] = PHASE_NONE;
        e.cooldown[s] = c.cooldownTicks;
      }
      return;
    default:
      steerMelee(sim, s, def, ux, uy, dist);
      if ((e.cooldown[s] as number) <= 0 && dist <= c.triggerRange && dist > 2) {
        // Signal visuel : la direction de la charge est verrouillée dès le début.
        e.phase[s] = PHASE_WINDUP;
        e.timer[s] = c.windupTicks;
        e.aux[s] = Math.atan2(uy, ux);
        st.speed = 0;
      }
  }
}

/** Retourne false si l'explosif s'est détruit. */
function steerExplosive(sim: Sim, s: number, def: EnemyDef, ux: number, uy: number, dist: number): boolean {
  const e = sim.enemies;
  const st = sim.steer;
  const x = def.explode;
  if (x === undefined) return true;
  if (e.phase[s] === PHASE_WINDUP) {
    st.speed = 0;
    e.timer[s] = (e.timer[s] as number) - 1;
    if ((e.timer[s] as number) <= 0) {
      const px = e.posX[s] as number;
      const py = e.posY[s] as number;
      sim.events.push({ t: 'kill', enemyType: e.type[s] as number, killerId: -1, x: px, y: py });
      releaseEnemy(sim, s);
      explodeAt(sim, px, py, x.radius, x.damage * (e.dmgMult[s] as number));
      return false;
    }
    return true;
  }
  steerMelee(sim, s, def, ux, uy, dist);
  if (dist <= x.triggerRange) {
    e.phase[s] = PHASE_WINDUP;
    e.timer[s] = x.fuseTicks;
    st.speed = 0;
  }
  return true;
}

function steerShooter(sim: Sim, s: number, def: EnemyDef, ux: number, uy: number, dist: number): void {
  const e = sim.enemies;
  const st = sim.steer;
  const sh = def.shooter;
  if (sh === undefined) return;
  switch (e.phase[s]) {
    case PHASE_WINDUP:
      st.speed = 0;
      e.timer[s] = (e.timer[s] as number) - 1;
      if ((e.timer[s] as number) <= 0) {
        const idx = sh.patterns[(e.patternIndex[s] as number) % sh.patterns.length] ?? 0;
        e.patternIndex[s] = (e.patternIndex[s] as number) + 1;
        e.pattern[s] = idx;
        e.burstsLeft[s] = PATTERNS[idx]?.bursts ?? 0;
        e.burstTimer[s] = 0;
        e.aux[s] = Math.atan2(uy, ux);
        e.phase[s] = PHASE_ACT;
      }
      return;
    case PHASE_ACT:
      st.speed = 0;
      runPattern(sim, s, ux, uy);
      if ((e.burstsLeft[s] as number) <= 0) {
        e.phase[s] = PHASE_NONE;
        e.cooldown[s] = sh.cooldownTicks;
      }
      return;
    default:
      kite(sim, s, def, sh.keepMin, sh.keepMax, ux, uy, dist);
      if ((e.cooldown[s] as number) <= 0 && dist <= sh.range) {
        e.phase[s] = PHASE_WINDUP;
        e.timer[s] = sh.windupTicks;
        st.speed = 0;
      }
  }
}

function steerScreamer(sim: Sim, s: number, def: EnemyDef, ux: number, uy: number, dist: number): void {
  const e = sim.enemies;
  const st = sim.steer;
  const c = def.scream;
  if (c === undefined) return;
  if (e.phase[s] === PHASE_WINDUP) {
    st.speed = 0;
    e.timer[s] = (e.timer[s] as number) - 1;
    if ((e.timer[s] as number) <= 0) {
      scream(sim, s, c.alertRadius, c.rageTicks, c.summon, c.summonType);
      e.screams[s] = (e.screams[s] as number) + 1;
      e.phase[s] = PHASE_NONE;
      e.cooldown[s] = c.cooldownTicks;
    }
    return;
  }
  kite(sim, s, def, c.keepMin, c.keepMax, ux, uy, dist);
  if ((e.cooldown[s] as number) <= 0 && dist <= c.range && (e.screams[s] as number) < c.maxScreams) {
    e.phase[s] = PHASE_WINDUP;
    e.timer[s] = c.windupTicks;
    st.speed = 0;
  }
}

/** Multiplicateur de PV de l'ennemi `s` par rapport à son type (hérité par ses renforts). */
function hpRatio(sim: Sim, s: number): number {
  const base = ENEMIES[sim.enemies.type[s] as number]?.hp ?? 1;
  return (sim.enemies.maxHp[s] as number) / base;
}

/** Cri : alerte et enrage les ennemis proches, appelle des renforts autour du Hurleur. */
function scream(sim: Sim, s: number, radius: number, rageTicks: number, summon: number, summonType: number): void {
  const pool = sim.enemyPool;
  const e = sim.enemies;
  const x = e.posX[s] as number;
  const y = e.posY[s] as number;
  sim.events.push({ t: 'scream', x, y, radius });
  const r2 = radius * radius;
  for (let o = 0; o < pool.highWater; o++) {
    if (pool.alive[o] === 0 || o === s) continue;
    if (ENEMIES[e.type[o] as number]?.nest !== undefined) continue;
    const dx = (e.posX[o] as number) - x;
    const dy = (e.posY[o] as number) - y;
    if (dx * dx + dy * dy > r2) continue;
    e.state[o] = STATE_CHASE;
    e.rage[o] = rageTicks;
  }
  const rng = sim.rng.spawn;
  for (let k = 0; k < summon; k++) {
    const a = nextRange(rng, 0, TAU);
    const sx = x + Math.cos(a) * 3;
    const sy = y + Math.sin(a) * 3;
    if (overlapsObstacle(sim.obstacleQuery, sx, sy, 0.5)) continue;
    const id = spawnEnemy(sim, summonType, sx, sy, STATE_CHASE, hpRatio(sim, s), e.dmgMult[s] as number, e.persistent[s] === 1);
    if (id >= 0) sim.enemies.rage[entityIndex(id)] = rageTicks;
  }
}

/** Souche : tant qu'un joueur est proche (état poursuite), génère des ennemis jusqu'à son plafond. */
function stepNest(sim: Sim, s: number, def: EnemyDef): void {
  const e = sim.enemies;
  const n = def.nest;
  if (n === undefined || e.state[s] !== STATE_CHASE || (e.cooldown[s] as number) > 0) return;
  if ((e.childCount[s] as number) < n.maxChildren) {
    const a = nextRange(sim.rng.spawn, 0, TAU);
    const x = (e.posX[s] as number) + Math.cos(a) * (def.radius + n.spawnRadius);
    const y = (e.posY[s] as number) + Math.sin(a) * (def.radius + n.spawnRadius);
    if (!overlapsObstacle(sim.obstacleQuery, x, y, 0.5)) {
      const id = spawnEnemy(sim, n.childType, x, y, STATE_CHASE, hpRatio(sim, s), e.dmgMult[s] as number, e.persistent[s] === 1);
      if (id >= 0) {
        e.parent[entityIndex(id)] = enemyId(sim, s);
        e.childCount[s] = (e.childCount[s] as number) + 1;
      }
    }
  }
  e.cooldown[s] = n.spawnIntervalTicks;
}

/** Pousse l'ennemi `s` (résultat dans sim.tmp) hors de l'ennemi `other` s'ils se chevauchent. */
function separateFrom(sim: Sim, s: number, def: EnemyDef, px: number, py: number, other: number, ox: number, oy: number, bigPass: boolean): void {
  if (other === s || sim.enemyPool.alive[other] === 0) return;
  const odef = ENEMIES[sim.enemies.type[other] as number];
  if (odef === undefined) return;
  // Les gros sont traités par la requête dédiée ; les gros ne sont pas poussés par les petits.
  if ((odef.radius > ENEMY_BIG_RADIUS) !== bigPass || odef.radius < def.radius * 0.6) return;
  const ddx = px - ox;
  const ddy = py - oy;
  const min = def.radius + odef.radius;
  const d2 = ddx * ddx + ddy * ddy;
  if (d2 >= min * min) return;
  const pos = sim.tmp;
  if (d2 < 1e-12) {
    pos.x += s < other ? -0.02 : 0.02;
  } else {
    const d = Math.sqrt(d2);
    const push = ((min - d) * 0.35) / d;
    pos.x += ddx * push;
    pos.y += ddy * push;
  }
}

/**
 * IA des ennemis. Au repos, ils flânent autour de leur point d'attache et ne réagissent qu'à la
 * présence du joueur (sightRadius) ou à son bruit (rayon de ses tirs × sensibilité). Une fois alertés,
 * chaque type applique son comportement : poursuite, zigzag, charge, tir de motifs, cri, explosion.
 */
export function stepEnemies(sim: Sim): void {
  const pool = sim.enemyPool;
  const e = sim.enemies;
  const pl = sim.players;
  const eg = sim.enemyGrid;
  const pos = sim.tmp;
  const st = sim.steer;
  const recycle2 = RECYCLE_DIST * RECYCLE_DIST;

  for (let s = 0; s < pool.highWater; s++) {
    if (pool.alive[s] === 0) continue;
    if ((e.flash[s] as number) > 0) e.flash[s] = (e.flash[s] as number) - 1;
    if ((e.cooldown[s] as number) > 0) e.cooldown[s] = (e.cooldown[s] as number) - 1;
    if ((e.rage[s] as number) > 0) e.rage[s] = (e.rage[s] as number) - 1;
    if (sim.liveCount === 0) continue;

    const px = e.posX[s] as number;
    const py = e.posY[s] as number;
    const def = ENEMIES[e.type[s] as number];
    if (def === undefined) continue;
    const isNest = def.nest !== undefined;

    // Joueur le plus proche, et s'il y en a un qui est détecté (présence ou bruit).
    let target = -1;
    let bestD2 = Infinity;
    let tdx = 0;
    let tdy = 0;
    let detected = false;
    for (let k = 0; k < sim.liveCount; k++) {
      const pi = sim.live[k] as number;
      if (pl.inRefuge[pi] === 1) continue; // un joueur au refuge n'est ni détecté ni ciblé
      const dx = (pl.posX[pi] as number) - px;
      const dy = (pl.posY[pi] as number) - py;
      const d2 = dx * dx + dy * dy;
      const reach = Math.max(def.sightRadius, (pl.noise[pi] as number) * def.hearing);
      if (d2 <= reach * reach) detected = true;
      if (d2 < bestD2) {
        bestD2 = d2;
        target = pi;
        tdx = dx;
        tdy = dy;
      }
    }
    if (bestD2 > recycle2 && !isNest && e.persistent[s] === 0) {
      releaseEnemy(sim, s);
      continue;
    }

    let state = e.state[s] as number;
    const phase = e.phase[s] as number;
    if (target < 0) {
      if (phase === PHASE_NONE) state = STATE_IDLE;
    } else if (state === STATE_IDLE) {
      if (detected) state = STATE_CHASE;
    } else if (bestD2 > def.loseRadius * def.loseRadius && phase === PHASE_NONE) {
      state = STATE_IDLE;
    }
    e.state[s] = state;

    if (isNest) {
      stepNest(sim, s, def);
      continue;
    }

    const dist = Math.sqrt(bestD2);
    st.contact = 0;
    if (state === STATE_CHASE || phase !== PHASE_NONE) {
      st.contact = def.contactDamage * (e.dmgMult[s] as number);
      let ux = 0;
      let uy = 0;
      if (dist > 1e-6) {
        ux = tdx / dist;
        uy = tdy / dist;
        e.angle[s] = Math.atan2(tdy, tdx);
      }
      st.dx = ux;
      st.dy = uy;
      st.speed = def.speed;
      if (def.charge !== undefined) steerBrute(sim, s, def, ux, uy, dist);
      else if (def.explode !== undefined) {
        if (!steerExplosive(sim, s, def, ux, uy, dist)) continue;
      } else if (def.shooter !== undefined) steerShooter(sim, s, def, ux, uy, dist);
      else if (def.scream !== undefined) steerScreamer(sim, s, def, ux, uy, dist);
      else steerMelee(sim, s, def, ux, uy, dist);
    } else {
      const hx = (e.homeX[s] as number) - px;
      const hy = (e.homeY[s] as number) - py;
      let heading: number;
      let moving: boolean;
      if (hx * hx + hy * hy > WANDER_RADIUS * WANDER_RADIUS) {
        heading = Math.atan2(hy, hx);
        moving = true;
      } else {
        const h = hash2(s, Math.floor((sim.tick + s * 37) / WANDER_PERIOD_TICKS));
        moving = (h & 7) < 3;
        heading = ((h >>> 3) & 1023) * ((Math.PI * 2) / 1024);
      }
      st.dx = Math.cos(heading);
      st.dy = Math.sin(heading);
      st.speed = moving ? def.wanderSpeed : 0;
      if (moving) e.angle[s] = heading;
    }

    const advance = st.speed * ((e.rage[s] as number) > 0 ? RAGE_SPEED_MULT : 1) * DT;
    pos.x = px + st.dx * advance;
    pos.y = py + st.dy * advance;

    // Séparation : chaque ennemi se décale de la moitié du chevauchement avec ses voisins.
    // Requête étroite sur tous les ennemis, plus une requête sur les seuls gros ennemis.
    const n = queryGrid(eg.grid, px, py, def.radius + ENEMY_BIG_RADIUS, eg.x, eg.y, sim.nearSep);
    for (let k = 0; k < n; k++) {
      const gi = sim.nearSep[k] as number;
      separateFrom(sim, s, def, px, py, eg.slot[gi] as number, eg.x[gi] as number, eg.y[gi] as number, false);
    }
    if (eg.bigCount > 0) {
      const nb = queryGrid(eg.bigGrid, px, py, def.radius + ENEMY_MAX_RADIUS, eg.bigX, eg.bigY, sim.nearBig);
      for (let k = 0; k < nb; k++) {
        const gi = sim.nearBig[k] as number;
        separateFrom(sim, s, def, px, py, eg.bigSlot[gi] as number, eg.bigX[gi] as number, eg.bigY[gi] as number, true);
      }
    }

    pushOutOfObstacles(sim.obstacleQuery, pos, def.radius);
    keepInMap(sim, pos, def.radius);
    e.posX[s] = pos.x;
    e.posY[s] = pos.y;

    if (target >= 0 && state === STATE_CHASE && st.contact > 0 && dist < def.radius + PLAYER_RADIUS) damagePlayer(sim, target, st.contact);
  }
}

/** Garde une position dans les limites de la carte et hors des refuges (les ennemis n'y entrent pas). */
export function keepInMap(sim: Sim, pos: { x: number; y: number }, radius: number): void {
  const map = sim.map;
  if (map === null) return;
  const lim = map.half - radius - 0.2;
  pos.x = Math.max(-lim, Math.min(lim, pos.x));
  pos.y = Math.max(-lim, Math.min(lim, pos.y));
  for (const r of map.refuges) {
    const dx = pos.x - r.x;
    const dy = pos.y - r.y;
    const min = r.radius + radius;
    const d2 = dx * dx + dy * dy;
    if (d2 < min * min) {
      const d = Math.sqrt(d2);
      if (d < 1e-6) pos.x = r.x + min;
      else {
        pos.x = r.x + (dx / d) * min;
        pos.y = r.y + (dy / d) * min;
      }
    }
  }
}

const mult = { hp: 1, dmg: 1 };

/** Fait apparaître (au repos) les groupes de la carte dont un joueur vivant est à portée d'activation. */
export function stepGroups(sim: Sim): void {
  const map = sim.map;
  if (map === null || sim.liveCount === 0) return;
  const pl = sim.players;
  const rng = sim.rng.spawn;
  for (const g of map.groups) {
    if (g.activated) continue;
    const reach2 = g.def.activation * g.def.activation;
    let near = false;
    for (let k = 0; k < sim.liveCount && !near; k++) {
      const pi = sim.live[k] as number;
      const dx = (pl.posX[pi] as number) - g.def.x;
      const dy = (pl.posY[pi] as number) - g.def.y;
      near = dx * dx + dy * dy <= reach2;
    }
    if (!near) continue;
    g.activated = true;
    g.types.forEach((type, m) => {
      const def = ENEMIES[type];
      if (def === undefined) return;
      for (let c = 0; c < (g.counts[m] as number); c++) {
        // Dispersion dans le rayon du groupe, en évitant obstacles et refuges ; repli sur le point d'attache.
        let x = g.def.x;
        let y = g.def.y;
        for (let attempt = 0; attempt < 12; attempt++) {
          const a = nextRange(rng, 0, TAU);
          const r = Math.sqrt(next(rng)) * g.def.radius;
          const tx = g.def.x + Math.cos(a) * r;
          const ty = g.def.y + Math.sin(a) * r;
          if (overlapsObstacle(sim.obstacleQuery, tx, ty, def.radius + 0.3)) continue;
          x = tx;
          y = ty;
          break;
        }
        difficultyAt(map, x, y, mult);
        spawnEnemy(sim, type, x, y, STATE_IDLE, mult.hp, mult.dmg, true);
      }
    });
  }
}

/** Recycle (sans kill) les ennemis à moins de `radius` de (x, y). */
export function clearEnemiesNear(sim: Sim, x: number, y: number, radius: number): void {
  const pool = sim.enemyPool;
  const e = sim.enemies;
  const r2 = radius * radius;
  for (let s = 0; s < pool.highWater; s++) {
    if (pool.alive[s] === 0) continue;
    const dx = (e.posX[s] as number) - x;
    const dy = (e.posY[s] as number) - y;
    if (dx * dx + dy * dy <= r2) releaseEnemy(sim, s);
  }
}

function pickAmbientType(sim: Sim): number {
  let roll = nextInt(sim.rng.spawn, AMBIENT_TOTAL_WEIGHT);
  for (const [type, weight] of AMBIENT_WEIGHTS) {
    if (roll < weight) return type;
    roll -= weight;
  }
  return 0;
}

/** Maintient la densité ambiante autour des joueurs vivants (provisoire : remplacée par les groupes de la carte, M5). */
export function stepSpawner(sim: Sim): void {
  if (sim.liveCount === 0 || (!sim.config.ambient && sim.config.hordeTarget < 0)) return;
  const pl = sim.players;
  const target = sim.config.hordeTarget >= 0 ? sim.config.hordeTarget : sim.liveCount * AMBIENT_ENEMIES_PER_PLAYER;
  const missing = Math.floor(target) - sim.enemyPool.count;
  const toSpawn = Math.min(missing, SPAWN_PER_TICK);
  const rng = sim.rng.spawn;
  const state = sim.config.spawnAggro ? STATE_CHASE : STATE_IDLE;
  for (let n = 0; n < toSpawn; n++) {
    const pi = sim.live[nextInt(rng, sim.liveCount)] as number;
    const angle = nextRange(rng, 0, TAU);
    const dist = nextRange(rng, SPAWN_MIN_DIST, SPAWN_MAX_DIST);
    const x = (pl.posX[pi] as number) + Math.cos(angle) * dist;
    const y = (pl.posY[pi] as number) + Math.sin(angle) * dist;
    const type = sim.config.spawnAggro ? 0 : pickAmbientType(sim);
    if (overlapsObstacle(sim.obstacleQuery, x, y, ENEMY_MAX_RADIUS)) continue;
    spawnEnemy(sim, type, x, y, state);
  }
}

/** Démonstration : place un ennemi de chaque type demandé, répartis autour du point de départ. */
export function spawnShowcase(sim: Sim, types: readonly number[], distance = 24): void {
  const cx = sim.map?.startX ?? 0;
  const cy = sim.map?.startY ?? 0;
  types.forEach((type, i) => {
    const a = (i / Math.max(1, types.length)) * TAU + 0.6;
    const id = spawnEnemy(sim, type, cx + Math.cos(a) * distance, cy + Math.sin(a) * distance);
    if (id < 0) return;
    const s = entityIndex(id);
    sim.tmp.x = sim.enemies.posX[s] as number;
    sim.tmp.y = sim.enemies.posY[s] as number;
    pushOutOfObstacles(sim.obstacleQuery, sim.tmp, ENEMIES[type]?.radius ?? 0.5);
    sim.enemies.posX[s] = sim.tmp.x;
    sim.enemies.posY[s] = sim.tmp.y;
    sim.enemies.homeX[s] = sim.tmp.x;
    sim.enemies.homeY[s] = sim.tmp.y;
  });
}

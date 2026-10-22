import {
  AMBIENT_ENEMIES_PER_PLAYER,
  ENEMIES,
  ENEMY_MAX_RADIUS,
  RECYCLE_DIST,
  SPAWN_MAX_DIST,
  SPAWN_MIN_DIST,
  SPAWN_PER_TICK,
  WANDER_PERIOD_TICKS,
  WANDER_RADIUS,
} from '../data/enemies';
import { PLAYER_RADIUS } from '../data/player';
import { queryGrid } from '../ecs/grid';
import { allocEntity, entityIndex, freeEntity } from '../ecs/pool';
import { nextInt, nextRange } from '../rng';
import { DT } from '../types';
import type { EntityId } from '../types';
import type { Sim } from '../sim';
import { overlapsObstacle, pushOutOfObstacles } from './collision';
import { damagePlayer } from './player';

export const STATE_IDLE = 0;
export const STATE_CHASE = 1;

/** Crée un ennemi (au repos par défaut) ; retourne son identifiant, ou -1 si le pool est plein. */
export function spawnEnemy(sim: Sim, type: number, x: number, y: number, state = STATE_IDLE): EntityId {
  const def = ENEMIES[type];
  if (def === undefined) return -1;
  const id = allocEntity(sim.enemyPool);
  if (id < 0) return -1;
  const s = entityIndex(id);
  const e = sim.enemies;
  e.posX[s] = x;
  e.posY[s] = y;
  e.hp[s] = def.hp;
  e.angle[s] = 0;
  e.flash[s] = 0;
  e.type[s] = type;
  e.state[s] = state;
  e.homeX[s] = x;
  e.homeY[s] = y;
  return id;
}

/** Inflige des dégâts à l'ennemi de l'emplacement `slot` ; le tue et émet 'kill' si ses PV tombent à 0. */
export function damageEnemy(sim: Sim, slot: number, dmg: number, killer: EntityId): void {
  const e = sim.enemies;
  e.hp[slot] = (e.hp[slot] as number) - dmg;
  e.flash[slot] = 6;
  e.state[slot] = STATE_CHASE; // être touché réveille
  if ((e.hp[slot] as number) > 0) return;

  sim.events.push({
    t: 'kill',
    enemyType: e.type[slot] as number,
    killerId: killer,
    x: e.posX[slot] as number,
    y: e.posY[slot] as number,
  });
  if (killer >= 0 && sim.playerPool.alive[entityIndex(killer)] === 1) {
    const k = entityIndex(killer);
    sim.players.lifeKills[k] = (sim.players.lifeKills[k] as number) + 1;
  }
  const pool = sim.enemyPool;
  freeEntity(pool, (((pool.generations[slot] as number) << 16) | slot) as EntityId);
}

function hash2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/**
 * IA des ennemis. Au repos, ils flânent autour de leur point d'attache et ne réagissent qu'à la
 * présence du joueur (sightRadius) ou à son bruit (rayon de ses tirs). Une fois alertés, ils le
 * poursuivent jusqu'à le perdre (loseRadius). Séparation locale et glissement sur les obstacles.
 */
export function stepEnemies(sim: Sim): void {
  const pool = sim.enemyPool;
  const e = sim.enemies;
  const pl = sim.players;
  const eg = sim.enemyGrid;
  const near = sim.nearEnemies;
  const pos = sim.tmp;
  const recycle2 = RECYCLE_DIST * RECYCLE_DIST;

  for (let s = 0; s < pool.highWater; s++) {
    if (pool.alive[s] === 0) continue;
    if ((e.flash[s] as number) > 0) e.flash[s] = (e.flash[s] as number) - 1;
    if (sim.liveCount === 0) continue;

    const px = e.posX[s] as number;
    const py = e.posY[s] as number;
    const def = ENEMIES[e.type[s] as number];
    if (def === undefined) continue;

    // Joueur le plus proche, et s'il y en a un qui est détecté (présence ou bruit).
    let target = -1;
    let bestD2 = Infinity;
    let tdx = 0;
    let tdy = 0;
    let detected = false;
    for (let k = 0; k < sim.liveCount; k++) {
      const pi = sim.live[k] as number;
      const dx = (pl.posX[pi] as number) - px;
      const dy = (pl.posY[pi] as number) - py;
      const d2 = dx * dx + dy * dy;
      const reach = Math.max(def.sightRadius, pl.noise[pi] as number);
      if (d2 <= reach * reach) detected = true;
      if (d2 < bestD2) {
        bestD2 = d2;
        target = pi;
        tdx = dx;
        tdy = dy;
      }
    }
    if (bestD2 > recycle2) {
      freeEntity(pool, (((pool.generations[s] as number) << 16) | s) as EntityId);
      continue;
    }

    let state = e.state[s] as number;
    if (state === STATE_IDLE) {
      if (detected) state = STATE_CHASE;
    } else if (bestD2 > def.loseRadius * def.loseRadius) {
      state = STATE_IDLE;
    }
    e.state[s] = state;

    const dist = Math.sqrt(bestD2);
    let ux = 0;
    let uy = 0;
    let advance = 0;
    if (state === STATE_CHASE) {
      if (dist > 1e-6) {
        ux = tdx / dist;
        uy = tdy / dist;
        e.angle[s] = Math.atan2(tdy, tdx);
      }
      // Au contact, l'ennemi s'arrête : il ne s'empile pas sur le joueur.
      advance = dist > def.radius + PLAYER_RADIUS ? def.speed * DT : 0;
    } else {
      const hx = (e.homeX[s] as number) - px;
      const hy = (e.homeY[s] as number) - py;
      const hd2 = hx * hx + hy * hy;
      let heading: number;
      let moving: boolean;
      if (hd2 > WANDER_RADIUS * WANDER_RADIUS) {
        heading = Math.atan2(hy, hx);
        moving = true;
      } else {
        const h = hash2(s, Math.floor((sim.tick + s * 37) / WANDER_PERIOD_TICKS));
        moving = (h & 7) < 3;
        heading = ((h >>> 3) & 1023) * (Math.PI * 2 / 1024);
      }
      if (moving) {
        ux = Math.cos(heading);
        uy = Math.sin(heading);
        e.angle[s] = heading;
        advance = def.wanderSpeed * DT;
      }
    }
    pos.x = px + ux * advance;
    pos.y = py + uy * advance;

    // Séparation : chaque ennemi se décale de la moitié du chevauchement avec ses voisins.
    const n = queryGrid(eg.grid, px, py, def.radius + ENEMY_MAX_RADIUS, eg.x, eg.y, near);
    for (let k = 0; k < n; k++) {
      const gi = near[k] as number;
      const other = eg.slot[gi] as number;
      if (other === s || pool.alive[other] === 0) continue;
      const odef = ENEMIES[e.type[other] as number];
      if (odef === undefined) continue;
      const ddx = px - (eg.x[gi] as number);
      const ddy = py - (eg.y[gi] as number);
      const min = def.radius + odef.radius;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 >= min * min) continue;
      if (d2 < 1e-12) {
        pos.x += s < other ? -0.02 : 0.02;
      } else {
        const d = Math.sqrt(d2);
        const push = ((min - d) * 0.35) / d;
        pos.x += ddx * push;
        pos.y += ddy * push;
      }
    }

    pushOutOfObstacles(sim.obstacleQuery, pos, def.radius);
    e.posX[s] = pos.x;
    e.posY[s] = pos.y;

    if (state === STATE_CHASE && dist < def.radius + PLAYER_RADIUS) damagePlayer(sim, target, def.contactDamage);
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
    if (dx * dx + dy * dy <= r2) freeEntity(pool, (((pool.generations[s] as number) << 16) | s) as EntityId);
  }
}

/** Maintient la densité ambiante autour des joueurs vivants (provisoire : remplacée par les groupes de la carte, M5). */
export function stepSpawner(sim: Sim): void {
  if (sim.liveCount === 0) return;
  const pl = sim.players;
  const target = sim.config.hordeTarget >= 0 ? sim.config.hordeTarget : sim.liveCount * AMBIENT_ENEMIES_PER_PLAYER;
  const missing = Math.floor(target) - sim.enemyPool.count;
  const toSpawn = Math.min(missing, SPAWN_PER_TICK);
  const rng = sim.rng.spawn;
  const state = sim.config.spawnAggro ? STATE_CHASE : STATE_IDLE;
  for (let n = 0; n < toSpawn; n++) {
    const pi = sim.live[nextInt(rng, sim.liveCount)] as number;
    const angle = nextRange(rng, 0, Math.PI * 2);
    const dist = nextRange(rng, SPAWN_MIN_DIST, SPAWN_MAX_DIST);
    const x = (pl.posX[pi] as number) + Math.cos(angle) * dist;
    const y = (pl.posY[pi] as number) + Math.sin(angle) * dist;
    if (overlapsObstacle(sim.obstacleQuery, x, y, ENEMY_MAX_RADIUS)) continue;
    spawnEnemy(sim, 0, x, y, state);
  }
}

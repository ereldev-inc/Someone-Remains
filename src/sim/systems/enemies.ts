import {
  ENEMIES,
  ENEMY_MAX_RADIUS,
  HORDE_BASE,
  HORDE_GROWTH_PER_SECOND,
  HORDE_MAX_PER_PLAYER,
  RECYCLE_DIST,
  SPAWN_MAX_DIST,
  SPAWN_MIN_DIST,
  SPAWN_PER_TICK,
} from '../data/enemies';
import { PLAYER_RADIUS } from '../data/player';
import { queryGrid } from '../ecs/grid';
import { allocEntity, entityIndex, freeEntity } from '../ecs/pool';
import { nextInt, nextRange } from '../rng';
import { DT, TICK_RATE } from '../types';
import type { EntityId } from '../types';
import type { Sim } from '../sim';
import { overlapsObstacle, pushOutOfObstacles } from './collision';
import { damagePlayer } from './player';

/** Crée un ennemi ; retourne son identifiant, ou -1 si le pool est plein. */
export function spawnEnemy(sim: Sim, type: number, x: number, y: number): EntityId {
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
  return id;
}

/** Inflige des dégâts à l'ennemi de l'emplacement `slot` ; le tue et émet 'kill' si ses PV tombent à 0. */
export function damageEnemy(sim: Sim, slot: number, dmg: number, killer: EntityId): void {
  const e = sim.enemies;
  e.hp[slot] = (e.hp[slot] as number) - dmg;
  e.flash[slot] = 6;
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

/** IA des ennemis : poursuite, séparation locale, glissement sur les obstacles, contact. */
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

    let target = -1;
    let bestD2 = Infinity;
    let tdx = 0;
    let tdy = 0;
    for (let k = 0; k < sim.liveCount; k++) {
      const pi = sim.live[k] as number;
      const dx = (pl.posX[pi] as number) - px;
      const dy = (pl.posY[pi] as number) - py;
      const d2 = dx * dx + dy * dy;
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

    const def = ENEMIES[e.type[s] as number];
    if (def === undefined) continue;
    const dist = Math.sqrt(bestD2);
    let ux = 0;
    let uy = 0;
    if (dist > 1e-6) {
      ux = tdx / dist;
      uy = tdy / dist;
      e.angle[s] = Math.atan2(tdy, tdx);
    }
    // Au contact, l'ennemi s'arrête : il ne s'empile pas sur le joueur.
    const advance = dist > def.radius + PLAYER_RADIUS ? def.speed * DT : 0;
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

    if (dist < def.radius + PLAYER_RADIUS) damagePlayer(sim, target, def.contactDamage);
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

/** Maintient la densité d'ennemis autour des joueurs vivants. */
export function stepSpawner(sim: Sim): void {
  if (sim.liveCount === 0) return;
  const pl = sim.players;
  let target = sim.config.hordeTarget;
  if (target < 0) {
    target = 0;
    for (let k = 0; k < sim.liveCount; k++) {
      const seconds = (pl.lifeTicks[sim.live[k] as number] as number) / TICK_RATE;
      target += Math.min(HORDE_MAX_PER_PLAYER, HORDE_BASE + seconds * HORDE_GROWTH_PER_SECOND);
    }
  }
  const missing = Math.floor(target) - sim.enemyPool.count;
  const toSpawn = Math.min(missing, SPAWN_PER_TICK);
  const rng = sim.rng.spawn;
  for (let n = 0; n < toSpawn; n++) {
    const pi = sim.live[nextInt(rng, sim.liveCount)] as number;
    const angle = nextRange(rng, 0, Math.PI * 2);
    const dist = nextRange(rng, SPAWN_MIN_DIST, SPAWN_MAX_DIST);
    const x = (pl.posX[pi] as number) + Math.cos(angle) * dist;
    const y = (pl.posY[pi] as number) + Math.sin(angle) * dist;
    if (overlapsObstacle(sim.obstacleQuery, x, y, ENEMY_MAX_RADIUS)) continue;
    spawnEnemy(sim, 0, x, y);
  }
}

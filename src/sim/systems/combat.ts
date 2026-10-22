import { ENEMIES, ENEMY_BIG_RADIUS, ENEMY_MAX_RADIUS } from '../data/enemies';
import { PLAYER_RADIUS } from '../data/player';
import { MUZZLE_OFFSET, WEAPONS } from '../data/weapons';
import type { WeaponDef } from '../data/weapons';
import { allocEntity, entityIndex, freeEntity } from '../ecs/pool';
import { queryGrid } from '../ecs/grid';
import { next } from '../rng';
import { PROJ_KIND_ENEMY, PROJ_KIND_PLAYER } from '../snapshot';
import { DT } from '../types';
import type { EntityId } from '../types';
import type { Sim } from '../sim';
import { overlapsObstacle } from './collision';
import { damageEnemy } from './enemies';
import { damagePlayer } from './player';

/** Crée un projectile ; retourne son identifiant, ou -1 si le pool est plein. */
export function spawnProjectileRaw(
  sim: Sim,
  x: number,
  y: number,
  angle: number,
  speed: number,
  damage: number,
  radius: number,
  lifeTicks: number,
  pierce: number,
  owner: EntityId,
  kind: number,
): EntityId {
  const id = allocEntity(sim.projectilePool);
  if (id < 0) return -1;
  const s = entityIndex(id);
  const p = sim.projectiles;
  p.posX[s] = x;
  p.posY[s] = y;
  p.velX[s] = Math.cos(angle) * speed;
  p.velY[s] = Math.sin(angle) * speed;
  p.damage[s] = damage;
  p.radius[s] = radius;
  p.angle[s] = angle;
  p.life[s] = lifeTicks;
  p.owner[s] = owner;
  p.pierce[s] = pierce;
  p.lastHit[s] = -1;
  p.kind[s] = kind;
  return id;
}

export function spawnProjectile(sim: Sim, def: WeaponDef, owner: EntityId, x: number, y: number, angle: number, kind: number): EntityId {
  return spawnProjectileRaw(sim, x, y, angle, def.projectileSpeed, def.damage, def.projectileRadius, def.lifeTicks, def.pierce, owner, kind);
}

/** Tire avec l'arme équipée du joueur (index i) et relance la cadence. */
export function fireWeapon(sim: Sim, ownerId: EntityId, i: number): void {
  const pl = sim.players;
  const def = WEAPONS[pl.weapon[i] as number];
  if (def === undefined) return;
  pl.fireCooldown[i] = def.cooldownTicks;
  // Un tir fait du bruit : les ennemis dans ce rayon sont alertés.
  if (def.noise > (pl.noise[i] as number)) pl.noise[i] = def.noise;
  const aim = pl.aim[i] as number;
  const x = (pl.posX[i] as number) + Math.cos(aim) * MUZZLE_OFFSET;
  const y = (pl.posY[i] as number) + Math.sin(aim) * MUZZLE_OFFSET;
  for (let k = 0; k < def.pellets; k++) {
    const angle = def.spread > 0 ? aim + (next(sim.rng.combat) - 0.5) * def.spread : aim;
    spawnProjectile(sim, def, ownerId, x, y, angle, PROJ_KIND_PLAYER);
  }
}

const ENEMY_RADII: readonly number[] = ENEMIES.map((e) => e.radius);

function radiusOf(sim: Sim, slot: number): number {
  return ENEMY_RADII[sim.enemies.type[slot] as number] ?? ENEMY_MAX_RADIUS;
}

/** Paramètre t (dans [0, 1]) du point du segment (x0, y0) + t·(dx, dy) le plus proche de (cx, cy). */
function segmentT(x0: number, y0: number, dx: number, dy: number, segLen2: number, cx: number, cy: number): number {
  const t = segLen2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / segLen2 : 0;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Paramètre t du point d'impact du projectile `s` sur l'ennemi `slot` (centre cx, cy), ou -1 s'il le rate. */
function hitT(sim: Sim, s: number, slot: number, cx: number, cy: number, x0: number, y0: number, dx: number, dy: number, segLen2: number, r: number): number {
  if (slot === sim.projectiles.lastHit[s] || sim.enemyPool.alive[slot] === 0) return -1;
  const t = segmentT(x0, y0, dx, dy, segLen2, cx, cy);
  const ex = cx - (x0 + dx * t);
  const ey = cy - (y0 + dy * t);
  const reach = r + radiusOf(sim, slot);
  return ex * ex + ey * ey <= reach * reach ? t : -1;
}

export function stepProjectiles(sim: Sim): void {
  const pool = sim.projectilePool;
  const pr = sim.projectiles;
  const eg = sim.enemyGrid;
  const pl = sim.players;
  const near = sim.nearEnemies;

  for (let s = 0; s < pool.highWater; s++) {
    if (pool.alive[s] === 0) continue;
    const x0 = pr.posX[s] as number;
    const y0 = pr.posY[s] as number;
    const dx = (pr.velX[s] as number) * DT;
    const dy = (pr.velY[s] as number) * DT;
    const x1 = x0 + dx;
    const y1 = y0 + dy;
    const r = pr.radius[s] as number;
    const segLen2 = dx * dx + dy * dy;
    let removed = false;

    if (pr.kind[s] === PROJ_KIND_ENEMY) {
      // Projectile ennemi : touche les joueurs vivants. L'esquive et l'invulnérabilité le laissent passer.
      for (let k = 0; k < sim.liveCount; k++) {
        const pi = sim.live[k] as number;
        const cx = pl.posX[pi] as number;
        const cy = pl.posY[pi] as number;
        const t = segmentT(x0, y0, dx, dy, segLen2, cx, cy);
        const ex = cx - (x0 + dx * t);
        const ey = cy - (y0 + dy * t);
        const reach = r + PLAYER_RADIUS;
        if (ex * ex + ey * ey <= reach * reach && damagePlayer(sim, pi, pr.damage[s] as number)) {
          removed = true;
          break;
        }
      }
    } else {
      // Projectile du joueur : balayage du segment parcouru ce tick, pas de tunnel à travers un ennemi.
      // Requête étroite sur tous les ennemis, plus une requête sur les seuls gros ennemis.
      const half = Math.sqrt(segLen2) * 0.5;
      let bestSlot = -1;
      let bestT = 2;
      const n = queryGrid(eg.grid, x0 + dx * 0.5, y0 + dy * 0.5, half + ENEMY_BIG_RADIUS + r, eg.x, eg.y, near);
      for (let k = 0; k < n; k++) {
        const gi = near[k] as number;
        const t = hitT(sim, s, eg.slot[gi] as number, eg.x[gi] as number, eg.y[gi] as number, x0, y0, dx, dy, segLen2, r);
        if (t >= 0 && t < bestT) {
          bestT = t;
          bestSlot = eg.slot[gi] as number;
        }
      }
      if (eg.bigCount > 0) {
        const nb = queryGrid(eg.bigGrid, x0 + dx * 0.5, y0 + dy * 0.5, half + ENEMY_MAX_RADIUS + r, eg.bigX, eg.bigY, sim.nearBig);
        for (let k = 0; k < nb; k++) {
          const gi = sim.nearBig[k] as number;
          const t = hitT(sim, s, eg.bigSlot[gi] as number, eg.bigX[gi] as number, eg.bigY[gi] as number, x0, y0, dx, dy, segLen2, r);
          if (t >= 0 && t < bestT) {
            bestT = t;
            bestSlot = eg.bigSlot[gi] as number;
          }
        }
      }
      if (bestSlot >= 0) {
        damageEnemy(sim, bestSlot, pr.damage[s] as number, pr.owner[s] as number);
        if ((pr.pierce[s] as number) > 0) {
          pr.pierce[s] = (pr.pierce[s] as number) - 1;
          pr.lastHit[s] = bestSlot;
        } else {
          removed = true;
        }
      }
    }

    pr.posX[s] = x1;
    pr.posY[s] = y1;
    pr.life[s] = (pr.life[s] as number) - 1;
    if (!removed && ((pr.life[s] as number) <= 0 || overlapsObstacle(sim.obstacleQuery, x1, y1, r))) removed = true;
    if (!removed && sim.map !== null && (Math.abs(x1) > sim.map.half || Math.abs(y1) > sim.map.half)) removed = true;
    if (removed) freeEntity(pool, (((pool.generations[s] as number) << 16) | s) as EntityId);
  }
}

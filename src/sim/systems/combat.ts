import { ENEMIES, ENEMY_MAX_RADIUS } from '../data/enemies';
import { MUZZLE_OFFSET, WEAPONS } from '../data/weapons';
import type { WeaponDef } from '../data/weapons';
import { allocEntity, entityIndex, freeEntity } from '../ecs/pool';
import { queryGrid } from '../ecs/grid';
import { next } from '../rng';
import { PROJ_KIND_PLAYER } from '../snapshot';
import { DT } from '../types';
import type { EntityId } from '../types';
import type { Sim } from '../sim';
import { overlapsObstacle } from './collision';
import { damageEnemy } from './enemies';

/** Crée un projectile ; retourne son identifiant, ou -1 si le pool est plein. */
export function spawnProjectile(
  sim: Sim,
  def: WeaponDef,
  owner: EntityId,
  x: number,
  y: number,
  angle: number,
  kind: number,
): EntityId {
  const id = allocEntity(sim.projectilePool);
  if (id < 0) return -1;
  const s = entityIndex(id);
  const p = sim.projectiles;
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  p.posX[s] = x;
  p.posY[s] = y;
  p.velX[s] = c * def.projectileSpeed;
  p.velY[s] = sn * def.projectileSpeed;
  p.damage[s] = def.damage;
  p.radius[s] = def.projectileRadius;
  p.angle[s] = angle;
  p.life[s] = def.lifeTicks;
  p.owner[s] = owner;
  p.pierce[s] = def.pierce;
  p.lastHit[s] = -1;
  p.kind[s] = kind;
  return id;
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

export function stepProjectiles(sim: Sim): void {
  const pool = sim.projectilePool;
  const pr = sim.projectiles;
  const eg = sim.enemyGrid;
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
    let removed = false;

    // Balayage du segment parcouru ce tick : pas de tunnel à travers un ennemi.
    const segLen2 = dx * dx + dy * dy;
    const n = queryGrid(
      eg.grid,
      x0 + dx * 0.5,
      y0 + dy * 0.5,
      Math.sqrt(segLen2) * 0.5 + ENEMY_MAX_RADIUS + r,
      eg.x,
      eg.y,
      near,
    );
    let bestSlot = -1;
    let bestT = 2;
    for (let k = 0; k < n; k++) {
      const gi = near[k] as number;
      const slot = eg.slot[gi] as number;
      if (slot === pr.lastHit[s] || sim.enemyPool.alive[slot] === 0) continue;
      const cx = eg.x[gi] as number;
      const cy = eg.y[gi] as number;
      let t = segLen2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / segLen2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = cx - (x0 + dx * t);
      const ey = cy - (y0 + dy * t);
      const reach = r + radiusOf(sim, slot);
      if (ex * ex + ey * ey <= reach * reach && t < bestT) {
        bestT = t;
        bestSlot = slot;
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

    pr.posX[s] = x1;
    pr.posY[s] = y1;
    pr.life[s] = (pr.life[s] as number) - 1;
    if (!removed && ((pr.life[s] as number) <= 0 || overlapsObstacle(sim.obstacleQuery, x1, y1, r))) removed = true;
    if (removed) freeEntity(pool, (((pool.generations[s] as number) << 16) | s) as EntityId);
  }
}

const ENEMY_RADII: readonly number[] = ENEMIES.map((e) => e.radius);

function radiusOf(sim: Sim, slot: number): number {
  return ENEMY_RADII[sim.enemies.type[slot] as number] ?? ENEMY_MAX_RADIUS;
}

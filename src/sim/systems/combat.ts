import { ENEMIES, ENEMY_BIG_RADIUS, ENEMY_MAX_RADIUS } from '../data/enemies';
import { PLAYER_RADIUS } from '../data/player';
import { MELEE_WEAPONS } from '../data/melee';
import { ITEM_CARREAUX } from '../data/items';
import { MUZZLE_OFFSET, WEAPONS } from '../data/weapons';
import type { WeaponDef } from '../data/weapons';
import { allocEntity, entityIndex, freeEntity } from '../ecs/pool';
import { queryGrid } from '../ecs/grid';
import { next } from '../rng';
import { PROJ_KIND_BOLT, PROJ_KIND_ENEMY } from '../snapshot';
import { DT } from '../types';
import type { EntityId } from '../types';
import type { Sim } from '../sim';
import { overlapsObstacle } from './collision';
import { damageEnemy } from './enemies';
import { spawnPickup } from './loot';
import { bagRemove } from './inventory';
import { statBonus } from './progression';
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
  // Sans munitions, l'arme ne tire pas : ni projectile, ni bruit, ni cadence consommée.
  if (def.ammoItem >= 0 && !bagRemove(sim, i, def.ammoItem, def.ammoPerShot)) return;
  pl.fireCooldown[i] = Math.max(1, Math.round(def.cooldownTicks * (1 - statBonus(sim, i, 'fireRate'))));
  // Un tir fait du bruit : les ennemis dans ce rayon sont alertés.
  const noise = def.noise * (1 - statBonus(sim, i, 'noise'));
  if (noise > (pl.noise[i] as number)) pl.noise[i] = noise;
  const aim = pl.aim[i] as number;
  const x = (pl.posX[i] as number) + Math.cos(aim) * MUZZLE_OFFSET;
  const y = (pl.posY[i] as number) + Math.sin(aim) * MUZZLE_OFFSET;
  const damageMult = 1 + statBonus(sim, i, 'damage');
  const pierceBonus = Math.round(statBonus(sim, i, 'pierce'));
  for (let k = 0; k < def.pellets; k++) {
    const angle = def.spread > 0 ? aim + (next(sim.rng.combat) - 0.5) * def.spread : aim;
    const id = spawnProjectile(sim, def, ownerId, x, y, angle, def.projectileKind);
    if (id >= 0) {
      const s = entityIndex(id);
      sim.projectiles.damage[s] = def.damage * damageMult;
      sim.projectiles.pierce[s] = def.pierce + pierceBonus;
    }
  }
}

/** Coup de corps à corps : touche tous les ennemis dans l'arc devant le joueur, sans munition. */
export function meleeStrike(sim: Sim, ownerId: EntityId, i: number): void {
  const pl = sim.players;
  const def = MELEE_WEAPONS[pl.meleeWeapon[i] as number];
  if (def === undefined) return;
  const px = pl.posX[i] as number;
  const py = pl.posY[i] as number;
  const aim = pl.aim[i] as number;
  pl.meleeCooldown[i] = def.cooldownTicks;
  const noise = def.noise * (1 - statBonus(sim, i, 'noise'));
  if (noise > (pl.noise[i] as number)) pl.noise[i] = noise;
  const damage = def.damage * (1 + statBonus(sim, i, 'damage'));
  sim.events.push({ t: 'swing', id: ownerId, x: px, y: py, angle: aim, range: def.range, arc: def.arc });

  const eg = sim.enemyGrid;
  const cosAim = Math.cos(aim);
  const sinAim = Math.sin(aim);
  const hit = (slot: number, ex: number, ey: number): void => {
    if (sim.enemyPool.alive[slot] === 0) return;
    const r = radiusOf(sim, slot);
    const dx = ex - px;
    const dy = ey - py;
    const dist = Math.hypot(dx, dy);
    if (dist > def.range + r) return;
    // Un ennemi plus proche couvre un angle plus large : tolérance de l'angle du rayon vu du joueur.
    const tolerance = dist > r ? Math.asin(Math.min(1, r / dist)) : Math.PI;
    const cosAngle = dist < 1e-6 ? 1 : (dx * cosAim + dy * sinAim) / dist;
    if (Math.acos(Math.max(-1, Math.min(1, cosAngle))) > def.arc / 2 + tolerance) return;
    damageEnemy(sim, slot, damage, ownerId);
    // Recul des petits ennemis (les gros ne bougent pas).
    if (r <= ENEMY_BIG_RADIUS && sim.enemyPool.alive[slot] === 1 && dist > 1e-6) {
      sim.enemies.posX[slot] = ex + (dx / dist) * def.knockback;
      sim.enemies.posY[slot] = ey + (dy / dist) * def.knockback;
    }
  };
  const reach = def.range + ENEMY_BIG_RADIUS;
  const n = queryGrid(eg.grid, px, py, reach, eg.x, eg.y, sim.nearEnemies);
  for (let k = 0; k < n; k++) {
    const gi = sim.nearEnemies[k] as number;
    hit(eg.slot[gi] as number, eg.x[gi] as number, eg.y[gi] as number);
  }
  if (eg.bigCount > 0) {
    const nb = queryGrid(eg.bigGrid, px, py, def.range + ENEMY_MAX_RADIUS, eg.bigX, eg.bigY, sim.nearBig);
    for (let k = 0; k < nb; k++) {
      const gi = sim.nearBig[k] as number;
      hit(eg.bigSlot[gi] as number, eg.bigX[gi] as number, eg.bigY[gi] as number);
    }
  }
}

const BOLT_RECOVER = WEAPONS.find((w) => w.projectileKind === PROJ_KIND_BOLT)?.recoverChance ?? 0;

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
    if (removed) {
      // Un carreau a des chances d'être retrouvé là où il s'arrête.
      if (pr.kind[s] === PROJ_KIND_BOLT && next(sim.rng.loot) < BOLT_RECOVER) spawnPickup(sim, ITEM_CARREAUX, 1, x1, y1);
      freeEntity(pool, (((pool.generations[s] as number) << 16) | s) as EntityId);
    }
  }
}

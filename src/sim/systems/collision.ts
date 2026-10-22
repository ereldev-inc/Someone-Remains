import { queryGrid } from '../ecs/grid';
import type { SpatialGrid } from '../ecs/grid';
import { OBSTACLE_CIRCLE } from '../world/obstacles';
import type { Obstacles } from '../world/obstacles';

/** Vecteur 2D mutable (sans allocation dans les boucles chaudes). */
export interface Vec2 {
  x: number;
  y: number;
}

const COLLISION_PASSES = 2;
/** Marge ajoutée au rayon de requête des obstacles. */
const QUERY_MARGIN = 0.5;

/**
 * Pousse un cercle hors d'un obstacle. Le cercle est en (px, py) de rayon r.
 * Retourne true et renseigne `out` si une pénétration a été corrigée.
 */
export function resolveCircleVsObstacle(o: Obstacles, i: number, px: number, py: number, r: number, out: Vec2): boolean {
  const ox = o.x[i] as number;
  const oy = o.y[i] as number;
  const a = o.a[i] as number;

  if (o.kind[i] === OBSTACLE_CIRCLE) {
    const dx = px - ox;
    const dy = py - oy;
    const min = r + a;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return false;
    if (d2 === 0) {
      out.x = min;
      out.y = 0;
      return true;
    }
    const d = Math.sqrt(d2);
    const k = (min - d) / d;
    out.x = dx * k;
    out.y = dy * k;
    return true;
  }

  const b = o.b[i] as number;
  const cx = Math.max(ox - a, Math.min(px, ox + a));
  const cy = Math.max(oy - b, Math.min(py, oy + b));
  const dx = px - cx;
  const dy = py - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > 0) {
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    out.x = dx * k;
    out.y = dy * k;
    return true;
  }
  // Centre à l'intérieur de la boîte : sortie par l'axe de pénétration minimale.
  const left = px - (ox - a);
  const right = ox + a - px;
  const down = py - (oy - b);
  const up = oy + b - py;
  const m = Math.min(left, right, down, up);
  out.x = 0;
  out.y = 0;
  if (m === left) out.x = -(left + r);
  else if (m === right) out.x = right + r;
  else if (m === down) out.y = -(down + r);
  else out.y = up + r;
  return true;
}

/** Monde statique : obstacles et leur grille, avec les tampons de travail. */
export interface ObstacleQuery {
  readonly obstacles: Obstacles;
  readonly grid: SpatialGrid;
  readonly near: Int32Array;
  readonly push: Vec2;
}

/** Déplace `pos` hors de tous les obstacles proches (glissement le long des parois). */
export function pushOutOfObstacles(q: ObstacleQuery, pos: Vec2, r: number): void {
  const o = q.obstacles;
  if (o.count === 0) return;
  const n = queryGrid(q.grid, pos.x, pos.y, r + o.maxExtent + QUERY_MARGIN, o.x, o.y, q.near);
  for (let pass = 0; pass < COLLISION_PASSES; pass++) {
    for (let k = 0; k < n; k++) {
      if (resolveCircleVsObstacle(o, q.near[k] as number, pos.x, pos.y, r, q.push)) {
        pos.x += q.push.x;
        pos.y += q.push.y;
      }
    }
  }
}

/** Vrai si le cercle (x, y, r) touche un obstacle. */
export function overlapsObstacle(q: ObstacleQuery, x: number, y: number, r: number): boolean {
  const o = q.obstacles;
  if (o.count === 0) return false;
  const n = queryGrid(q.grid, x, y, r + o.maxExtent + QUERY_MARGIN, o.x, o.y, q.near);
  for (let k = 0; k < n; k++) {
    if (resolveCircleVsObstacle(o, q.near[k] as number, x, y, r, q.push)) return true;
  }
  return false;
}

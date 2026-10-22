import { OBSTACLE_CIRCLE } from '../world/obstacles';
import type { Obstacles } from '../world/obstacles';

/** Résultat d'une résolution : déplacement appliqué au cercle (sans allocation). */
export interface Push {
  x: number;
  y: number;
}

/**
 * Pousse un cercle hors d'un obstacle. Le cercle est en (px, py) de rayon r.
 * Retourne true et renseigne `out` si une pénétration a été corrigée.
 */
export function resolveCircleVsObstacle(
  o: Obstacles,
  i: number,
  px: number,
  py: number,
  r: number,
  out: Push,
): boolean {
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

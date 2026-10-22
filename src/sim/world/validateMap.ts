import { DIFFICULTY_PROFILES } from '../data/difficulty';
import { PLAYER_RADIUS } from '../data/player';
import { resolveCircleVsObstacle } from '../systems/collision';
import type { Vec2 } from '../systems/collision';
import { enemyTypeIndex, mapObstacles } from './map';
import type { MapDef, Point } from './mapdef';
import { createObstacleIndex, queryObstacles } from './obstacleIndex';

export interface MapStats {
  enemies: number;
  perType: Record<string, number>;
  densityPerHectare: number;
  obstacles: number;
  groups: number;
  crates: number;
  refuges: number;
  reachableRatio: number;
}

export interface MapReport {
  errors: string[];
  stats: MapStats;
}

/** Pas de la grille d'accessibilité (m) et rayon de passage exigé pour y circuler. */
const GRID_CELL = 2;
const WALK_RADIUS = 0.9;

/**
 * Vérifie les règles de conception d'une carte : identifiants uniques, éléments dans les limites et hors
 * des obstacles, types autorisés par le profil, densité dans la plage, et accessibilité depuis le départ
 * de tous les points importants (refuges, groupes, caisses, passages, extractions).
 */
export function validateMap(def: MapDef): MapReport {
  const errors: string[] = [];
  const err = (m: string): void => {
    errors.push(`[${def.id}] ${m}`);
  };
  const half = def.size / 2;
  const profile = DIFFICULTY_PROFILES[def.difficulty];
  if (profile === undefined) err(`profil de difficulté inconnu : ${def.difficulty}`);
  if (def.size <= 0) err('taille invalide');

  const obstacles = mapObstacles(def);
  const index = createObstacleIndex(obstacles);
  const near = new Int32Array(256);
  const push: Vec2 = { x: 0, y: 0 };
  const blocked = (x: number, y: number, r: number): boolean => {
    const n = queryObstacles(index, x, y, near);
    for (let k = 0; k < n; k++) if (resolveCircleVsObstacle(obstacles, near[k] as number, x, y, r, push)) return true;
    return false;
  };
  const inside = (p: Point, margin = 0): boolean => Math.abs(p.x) <= half - margin && Math.abs(p.y) <= half - margin;

  const unique = (label: string, ids: string[]): void => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) err(`${label} : identifiant en double « ${id} »`);
      seen.add(id);
    }
  };
  unique('refuges', def.refuges.map((r) => r.id));
  unique('groupes', def.groups.map((g) => g.id));
  unique('caisses', def.crates.map((c) => c.id));
  unique('passages', def.passages.map((p) => p.id));
  unique('zones', def.zones.map((z) => z.id));
  unique('extractions', def.endOfZone.extraction.map((e) => e.id));

  def.obstacles.forEach((o, i) => {
    if (!inside(o)) err(`obstacle #${i} (${o.style}) hors de la carte`);
    if (o.kind === 'box' && (o.w <= 0 || o.h <= 0)) err(`obstacle #${i} : dimensions invalides`);
    if (o.kind === 'circle' && o.r <= 0) err(`obstacle #${i} : rayon invalide`);
  });

  if (!inside(def.playerStart, 1)) err('départ hors de la carte');
  if (blocked(def.playerStart.x, def.playerStart.y, PLAYER_RADIUS)) err('départ dans un obstacle');
  if (def.refuges.length === 0) err('aucun refuge');
  for (const r of def.refuges) {
    if (r.radius <= 0) err(`refuge ${r.id} : rayon invalide`);
    if (!inside(r, r.radius)) err(`refuge ${r.id} dépasse de la carte`);
    if (blocked(r.respawn.x, r.respawn.y, PLAYER_RADIUS)) err(`refuge ${r.id} : point de réapparition dans un obstacle`);
    if (Math.hypot(r.respawn.x - r.x, r.respawn.y - r.y) > r.radius) err(`refuge ${r.id} : point de réapparition hors du refuge`);
  }
  const inRefuge = (p: Point, margin: number): boolean => def.refuges.some((r) => Math.hypot(p.x - r.x, p.y - r.y) <= r.radius + margin);
  if (def.refuges[0] !== undefined && !inRefuge(def.playerStart, 0)) err('le départ doit être dans le premier refuge');

  // Groupes : types autorisés, hors obstacles et hors refuges.
  const perType: Record<string, number> = {};
  let enemies = 0;
  for (const g of def.groups) {
    if (!inside(g, 1)) err(`groupe ${g.id} hors de la carte`);
    if (blocked(g.x, g.y, 0.5)) err(`groupe ${g.id} : point d'attache dans un obstacle`);
    if (inRefuge(g, g.radius)) err(`groupe ${g.id} trop près d'un refuge`);
    if (g.activation <= 0) err(`groupe ${g.id} : rayon d'activation invalide`);
    if (g.members.length === 0) err(`groupe ${g.id} vide`);
    for (const m of g.members) {
      if (enemyTypeIndex(m.type) < 0) err(`groupe ${g.id} : type inconnu « ${m.type} »`);
      else if (profile !== undefined && !profile.allowedTypes.includes(m.type)) err(`groupe ${g.id} : type « ${m.type} » interdit par le profil ${profile.id}`);
      if (!Number.isInteger(m.count) || m.count <= 0) err(`groupe ${g.id} : effectif invalide pour ${m.type}`);
      perType[m.type] = (perType[m.type] ?? 0) + m.count;
      enemies += m.count;
    }
  }
  const density = enemies / ((def.size * def.size) / 10000);
  if (profile !== undefined && (density < profile.densityPerHectare[0] || density > profile.densityPerHectare[1])) {
    err(`densité ${density.toFixed(2)}/ha hors de la plage ${profile.densityPerHectare[0]}–${profile.densityPerHectare[1]} du profil ${profile.id}`);
  }

  for (const c of def.crates) {
    if (!inside(c, 1)) err(`caisse ${c.id} hors de la carte`);
    if (blocked(c.x, c.y, 0.4)) err(`caisse ${c.id} dans un obstacle`);
  }
  for (const p of def.passages) {
    if (!inside(p)) err(`passage ${p.id} hors de la carte`);
    if (p.to !== null && p.arrive === null) err(`passage ${p.id} : destination sans point d'arrivée`);
  }
  for (const e of def.endOfZone.extraction) {
    if (!inside(e, e.radius)) err(`extraction ${e.id} hors de la carte`);
  }
  if (def.endOfZone.countdownSeconds <= 0) err('compte à rebours invalide');
  for (const z of def.zones) if (z.hpMult <= 0 || z.damageMult <= 0) err(`zone ${z.id} : multiplicateurs invalides`);

  // Accessibilité : remplissage depuis le départ sur une grille grossière.
  const cells = Math.ceil(def.size / GRID_CELL);
  const walkable = new Uint8Array(cells * cells);
  const cellOf = (v: number): number => Math.min(cells - 1, Math.max(0, Math.floor((v + half) / GRID_CELL)));
  const centerOf = (c: number): number => -half + (c + 0.5) * GRID_CELL;
  let walkableCount = 0;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      if (!blocked(centerOf(cx), centerOf(cy), WALK_RADIUS)) {
        walkable[cy * cells + cx] = 1;
        walkableCount++;
      }
    }
  }
  const reached = new Uint8Array(cells * cells);
  const queue = new Int32Array(cells * cells);
  let head = 0;
  let tail = 0;
  const startCell = cellOf(def.playerStart.y) * cells + cellOf(def.playerStart.x);
  if (walkable[startCell] === 1) {
    reached[startCell] = 1;
    queue[tail++] = startCell;
  }
  while (head < tail) {
    const c = queue[head++] as number;
    const cx = c % cells;
    const cy = (c - cx) / cells;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cells || ny >= cells) continue;
      const n = ny * cells + nx;
      if (walkable[n] === 1 && reached[n] === 0) {
        reached[n] = 1;
        queue[tail++] = n;
      }
    }
  }
  const reachable = (p: Point): boolean => {
    // Une cellule voisine accessible suffit (le point peut se trouver contre un obstacle).
    const cx = cellOf(p.x);
    const cy = cellOf(p.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < cells && y < cells && reached[y * cells + x] === 1) return true;
      }
    }
    return false;
  };
  for (const r of def.refuges) if (!reachable(r)) err(`refuge ${r.id} inaccessible depuis le départ`);
  for (const g of def.groups) if (!reachable(g)) err(`groupe ${g.id} inaccessible depuis le départ`);
  for (const c of def.crates) if (!reachable(c)) err(`caisse ${c.id} inaccessible depuis le départ`);
  for (const p of def.passages) if (!reachable(p)) err(`passage ${p.id} inaccessible depuis le départ`);
  for (const e of def.endOfZone.extraction) if (!reachable(e)) err(`extraction ${e.id} inaccessible depuis le départ`);

  return {
    errors,
    stats: {
      enemies,
      perType,
      densityPerHectare: density,
      obstacles: def.obstacles.length,
      groups: def.groups.length,
      crates: def.crates.length,
      refuges: def.refuges.length,
      reachableRatio: walkableCount === 0 ? 0 : tail / walkableCount,
    },
  };
}

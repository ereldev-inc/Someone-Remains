import type { BoxObstacleDef, BuildingDef, BuildingSide, MapDef, ObstacleDef } from './mapdef';

export const DEFAULT_WALL_THICKNESS = 0.4;
export const DEFAULT_WALL_HEIGHT = 3;
/** Largeur minimale d'une porte pour que le joueur et les ennemis puissent passer. */
export const MIN_DOOR_WIDTH = 1.8;

export function wallThickness(b: BuildingDef): number {
  return b.wallThickness ?? DEFAULT_WALL_THICKNESS;
}

export function wallHeight(b: BuildingDef): number {
  return b.height ?? DEFAULT_WALL_HEIGHT;
}

/** Longueur du côté concerné (le long duquel se mesurent les portes). */
export function sideLength(b: BuildingDef, side: BuildingSide): number {
  return side === 'n' || side === 's' ? b.w : b.h;
}

/** Murs extérieurs sous forme de boîtes : chaque côté est découpé autour de ses portes. */
export function buildingWalls(b: BuildingDef): BoxObstacleDef[] {
  const t = wallThickness(b);
  const height = wallHeight(b);
  const out: BoxObstacleDef[] = [];
  const sides: BuildingSide[] = ['n', 's', 'e', 'w'];
  for (const side of sides) {
    const horizontal = side === 'n' || side === 's';
    // Les côtés est et ouest s'arrêtent contre les murs nord et sud : pas de recouvrement aux coins.
    const length = horizontal ? b.w : b.h - 2 * t;
    const gaps = b.doors
      .filter((d) => d.side === side)
      .map((d) => [d.offset - d.width / 2, d.offset + d.width / 2] as const)
      .sort((p, q) => p[0] - q[0]);
    let cursor = -length / 2;
    const pieces: Array<readonly [number, number]> = [];
    for (const [from, to] of gaps) {
      if (from > cursor) pieces.push([cursor, from]);
      cursor = Math.max(cursor, to);
    }
    if (cursor < length / 2) pieces.push([cursor, length / 2]);
    for (const [from, to] of pieces) {
      if (to - from < 0.05) continue;
      const mid = (from + to) / 2;
      const size = to - from;
      if (horizontal) {
        out.push({ kind: 'box', x: b.x + mid, y: b.y + (side === 'n' ? -1 : 1) * (b.h / 2 - t / 2), w: size, h: t, style: 'wall', height });
      } else {
        out.push({ kind: 'box', x: b.x + (side === 'w' ? -1 : 1) * (b.w / 2 - t / 2), y: b.y + mid, w: t, h: size, style: 'wall', height });
      }
    }
  }
  return out;
}

/** Cloisons intérieures, avec la hauteur du bâtiment par défaut. */
export function interiorWalls(b: BuildingDef): BoxObstacleDef[] {
  return (b.walls ?? []).map((w) => ({ ...w, style: 'wall', height: w.height ?? wallHeight(b) }));
}

/** Tous les obstacles d'une carte : obstacles libres, murs et cloisons des bâtiments. */
export function allObstacles(def: MapDef): ObstacleDef[] {
  const out: ObstacleDef[] = [...def.obstacles];
  for (const b of def.buildings) {
    out.push(...buildingWalls(b));
    out.push(...interiorWalls(b));
  }
  return out;
}

/** Vrai si (x, y) est à l'intérieur des murs du bâtiment. */
export function insideBuilding(b: BuildingDef, x: number, y: number): boolean {
  const t = wallThickness(b);
  return Math.abs(x - b.x) < b.w / 2 - t && Math.abs(y - b.y) < b.h / 2 - t;
}

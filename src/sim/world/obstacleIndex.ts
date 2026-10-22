import { OBSTACLE_CIRCLE } from './obstacles';
import type { Obstacles } from './obstacles';

/**
 * Index spatial des obstacles : chaque obstacle est enregistré dans toutes les cellules que son
 * emprise (élargie de `margin`) recouvre. Une requête n'a donc qu'une cellule à lire, quelle que soit
 * la taille de l'obstacle. Les collisions de hachage ajoutent des candidats, filtrés par le test exact.
 */
export interface ObstacleIndex {
  readonly invCell: number;
  readonly mask: number;
  readonly cellStart: Int32Array;
  readonly items: Int32Array;
}

export function createObstacleIndex(o: Obstacles, cellSize = 4, margin = 1.7, tableBits = 14): ObstacleIndex {
  const tableSize = 1 << tableBits;
  const mask = tableSize - 1;
  const inv = 1 / cellSize;
  const counts = new Int32Array(tableSize + 1);
  const lastSeen = new Int32Array(tableSize);

  const bucket = (cx: number, cy: number): number => (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & mask;
  const forEachCell = (i: number, visit: (b: number) => void): void => {
    const x = o.x[i] as number;
    const y = o.y[i] as number;
    const a = o.a[i] as number;
    const b = o.kind[i] === OBSTACLE_CIRCLE ? a : (o.b[i] as number);
    const cx0 = Math.floor((x - a - margin) * inv);
    const cx1 = Math.floor((x + a + margin) * inv);
    const cy0 = Math.floor((y - b - margin) * inv);
    const cy1 = Math.floor((y + b + margin) * inv);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) visit(bucket(cx, cy));
  };

  for (let i = 0; i < o.count; i++) {
    forEachCell(i, (b) => {
      if (lastSeen[b] !== i + 1) {
        lastSeen[b] = i + 1;
        counts[b + 1] = (counts[b + 1] as number) + 1;
      }
    });
  }
  for (let b = 0; b < tableSize; b++) counts[b + 1] = (counts[b + 1] as number) + (counts[b] as number);
  const items = new Int32Array(counts[tableSize] as number);
  const cursor = counts.slice(0, tableSize);
  lastSeen.fill(0);
  for (let i = 0; i < o.count; i++) {
    forEachCell(i, (b) => {
      if (lastSeen[b] !== i + 1) {
        lastSeen[b] = i + 1;
        items[cursor[b] as number] = i;
        cursor[b] = (cursor[b] as number) + 1;
      }
    });
  }
  return { invCell: inv, mask, cellStart: counts, items };
}

/** Écrit dans `out` les obstacles candidats autour de (x, y) ; retourne leur nombre. */
export function queryObstacles(idx: ObstacleIndex, x: number, y: number, out: Int32Array): number {
  const b = (Math.imul(Math.floor(x * idx.invCell), 73856093) ^ Math.imul(Math.floor(y * idx.invCell), 19349663)) & idx.mask;
  const end = idx.cellStart[b + 1] as number;
  let n = 0;
  for (let k = idx.cellStart[b] as number; k < end && n < out.length; k++) out[n++] = idx.items[k] as number;
  return n;
}

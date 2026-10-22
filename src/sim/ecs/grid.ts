/**
 * Grille spatiale (spatial hash) à tables de taille fixe, reconstruite à la demande.
 * Les collisions de hachage sont filtrées par la distance exacte à la requête.
 */
export interface SpatialGrid {
  readonly invCell: number;
  readonly mask: number;
  readonly cellStart: Int32Array;
  readonly cursor: Int32Array;
  readonly items: Int32Array;
  readonly itemBucket: Int32Array;
  readonly stamp: Uint32Array;
  stampId: number;
}

export function createGrid(cellSize: number, tableBits: number, capacity: number): SpatialGrid {
  const tableSize = 1 << tableBits;
  return {
    invCell: 1 / cellSize,
    mask: tableSize - 1,
    cellStart: new Int32Array(tableSize + 1),
    cursor: new Int32Array(tableSize),
    items: new Int32Array(capacity),
    itemBucket: new Int32Array(capacity),
    stamp: new Uint32Array(tableSize),
    stampId: 0,
  };
}

function bucketOf(grid: SpatialGrid, cx: number, cy: number): number {
  return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & grid.mask;
}

export function buildGrid(grid: SpatialGrid, count: number, xs: ArrayLike<number>, ys: ArrayLike<number>): void {
  const { cellStart, cursor, items, itemBucket, invCell } = grid;
  cellStart.fill(0);
  for (let i = 0; i < count; i++) {
    const b = bucketOf(grid, Math.floor((xs[i] as number) * invCell), Math.floor((ys[i] as number) * invCell));
    itemBucket[i] = b;
    cellStart[b + 1] = (cellStart[b + 1] as number) + 1;
  }
  for (let b = 0; b < cursor.length; b++) {
    cellStart[b + 1] = (cellStart[b + 1] as number) + (cellStart[b] as number);
    cursor[b] = cellStart[b] as number;
  }
  for (let i = 0; i < count; i++) {
    const b = itemBucket[i] as number;
    const c = cursor[b] as number;
    items[c] = i;
    cursor[b] = c + 1;
  }
}

/** Écrit dans `out` les indices des points à distance <= r de (x, y) ; retourne leur nombre. */
export function queryGrid(
  grid: SpatialGrid,
  x: number,
  y: number,
  r: number,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  out: Int32Array,
): number {
  const { invCell, cellStart, items, stamp } = grid;
  grid.stampId++;
  if (grid.stampId === 0xffffffff) {
    stamp.fill(0);
    grid.stampId = 1;
  }
  const id = grid.stampId;
  const r2 = r * r;
  const cx0 = Math.floor((x - r) * invCell);
  const cx1 = Math.floor((x + r) * invCell);
  const cy0 = Math.floor((y - r) * invCell);
  const cy1 = Math.floor((y + r) * invCell);
  let n = 0;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const b = bucketOf(grid, cx, cy);
      if (stamp[b] === id) continue;
      stamp[b] = id;
      const end = cellStart[b + 1] as number;
      for (let k = cellStart[b] as number; k < end; k++) {
        const i = items[k] as number;
        const dx = (xs[i] as number) - x;
        const dy = (ys[i] as number) - y;
        if (dx * dx + dy * dy <= r2) {
          out[n++] = i;
          if (n === out.length) return n;
        }
      }
    }
  }
  return n;
}

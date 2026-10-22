import { describe, expect, it } from 'vitest';
import { createRng, nextRange } from '../rng';
import { buildGrid, createGrid, queryGrid } from './grid';

describe('SpatialGrid', () => {
  it('retourne exactement les points d\'un balayage naïf', () => {
    const rng = createRng(3);
    const n = 500;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = nextRange(rng, -100, 100);
      ys[i] = nextRange(rng, -100, 100);
    }
    const grid = createGrid(2, 8, n);
    buildGrid(grid, n, xs, ys);
    const out = new Int32Array(n);
    for (let q = 0; q < 50; q++) {
      const x = nextRange(rng, -100, 100);
      const y = nextRange(rng, -100, 100);
      const r = nextRange(rng, 0.5, 15);
      const count = queryGrid(grid, x, y, r, xs, ys, out);
      const got = Array.from(out.subarray(0, count)).sort((a, b) => a - b);
      const want: number[] = [];
      for (let i = 0; i < n; i++) if (Math.hypot(xs[i]! - x, ys[i]! - y) <= r) want.push(i);
      expect(got).toEqual(want);
    }
  });

  it('gère les coordonnées négatives et une grille vide', () => {
    const grid = createGrid(2, 4, 1);
    buildGrid(grid, 0, new Float32Array(0), new Float32Array(0));
    expect(queryGrid(grid, -5, -5, 3, new Float32Array(0), new Float32Array(0), new Int32Array(4))).toBe(0);
  });
});

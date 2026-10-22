import { createRng, deriveSeed, nextRange, STREAM_WORLD } from '../rng';
import type { Rng } from '../rng';

export const OBSTACLE_CIRCLE = 0;
export const OBSTACLE_BOX = 1;

/** Obstacles statiques en SoA. Cercle : a = rayon. Boîte : a, b = demi-largeur, demi-hauteur. */
export interface Obstacles {
  count: number;
  kind: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  a: Float32Array;
  b: Float32Array;
  /** Plus grande distance centre → point le plus éloigné d'un obstacle. */
  maxExtent: number;
}

const TEST_COUNT = 70;
const SAFE_RADIUS = 12;

function place(rng: Rng, out: Obstacles, i: number): void {
  const angle = nextRange(rng, 0, Math.PI * 2);
  const dist = nextRange(rng, SAFE_RADIUS + 3, 70);
  out.x[i] = Math.cos(angle) * dist;
  out.y[i] = Math.sin(angle) * dist;
}

/**
 * Obstacles de démonstration, déterministes. Remplacés par la génération de monde au jalon M5.
 * Aucun obstacle dans la zone de réapparition.
 */
export function generateTestObstacles(seed: number): Obstacles {
  const rng = createRng(deriveSeed(seed, STREAM_WORLD));
  const out: Obstacles = {
    count: TEST_COUNT,
    kind: new Uint8Array(TEST_COUNT),
    x: new Float32Array(TEST_COUNT),
    y: new Float32Array(TEST_COUNT),
    a: new Float32Array(TEST_COUNT),
    b: new Float32Array(TEST_COUNT),
    maxExtent: 0,
  };
  for (let i = 0; i < TEST_COUNT; i++) {
    place(rng, out, i);
    if (i % 3 === 0) {
      out.kind[i] = OBSTACLE_CIRCLE;
      out.a[i] = nextRange(rng, 0.8, 2.5);
      out.b[i] = out.a[i] as number;
    } else {
      out.kind[i] = OBSTACLE_BOX;
      out.a[i] = nextRange(rng, 1, 4);
      out.b[i] = nextRange(rng, 1, 4);
    }
  }
  refreshExtent(out);
  return out;
}

export function refreshExtent(o: Obstacles): void {
  let max = 0;
  for (let i = 0; i < o.count; i++) {
    const e = o.kind[i] === OBSTACLE_CIRCLE ? (o.a[i] as number) : Math.hypot(o.a[i] as number, o.b[i] as number);
    if (e > max) max = e;
  }
  o.maxExtent = max;
}

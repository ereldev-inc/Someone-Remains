/** PRNG seedé (mulberry32). L'état est un simple entier : sauvegardable. */
export interface Rng {
  state: number;
}

export const STREAM_WORLD = 1;
export const STREAM_SPAWN = 2;
export const STREAM_LOOT = 3;
export const STREAM_COMBAT = 4;
export const STREAM_PROGRESSION = 5;

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

export function nextU32(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) | 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Flottant dans [0, 1). */
export function next(rng: Rng): number {
  return nextU32(rng) / 4294967296;
}

export function nextRange(rng: Rng, min: number, max: number): number {
  return min + (max - min) * next(rng);
}

/** Entier dans [0, n). */
export function nextInt(rng: Rng, n: number): number {
  return Math.floor(next(rng) * n);
}

/** Dérive une graine indépendante pour un flux donné. */
export function deriveSeed(seed: number, stream: number): number {
  let h = (seed ^ Math.imul(stream, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

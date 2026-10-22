import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, next, nextInt, nextU32 } from './rng';

describe('rng', () => {
  it('est déterministe pour une même graine', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(nextU32(a)).toBe(nextU32(b));
  });

  it('reste dans [0, 1) et dans [0, n)', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = next(r);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(nextInt(r, 5)).toBeLessThan(5);
    }
  });

  it('reprend où il s\'est arrêté quand on restaure l\'état', () => {
    const a = createRng(1);
    for (let i = 0; i < 10; i++) next(a);
    const b = { state: a.state };
    expect(next(a)).toBe(next(b));
  });

  it('dérive des flux différents pour une même graine', () => {
    expect(deriveSeed(5, 1)).not.toBe(deriveSeed(5, 2));
    expect(deriveSeed(5, 1)).toBe(deriveSeed(5, 1));
  });
});

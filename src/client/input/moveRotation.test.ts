import { describe, expect, it } from 'vitest';
import { rotateMove } from './moveRotation';

const out = { x: 0, y: 0 };

describe('rotateMove', () => {
  it('sans rotation, haut = nord (y négatif) et droite = est', () => {
    rotateMove(0, -1, 0, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(-1);
    rotateMove(1, 0, 0, out);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(0);
  });

  it('après un quart de tour, haut = ouest et droite = nord', () => {
    rotateMove(0, -1, Math.PI / 2, out);
    expect(out.x).toBeCloseTo(-1);
    expect(out.y).toBeCloseTo(0);
    rotateMove(1, 0, Math.PI / 2, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(-1);
  });

  it('conserve la norme, quel que soit l\'angle', () => {
    for (let a = -3; a <= 3; a += 0.7) {
      rotateMove(0.6, -0.8, a, out);
      expect(Math.hypot(out.x, out.y)).toBeCloseTo(1);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { allocEntity, createPool, entityIndex, freeEntity, isAlive } from './pool';

describe('EntityPool', () => {
  it('alloue jusqu\'à la capacité puis retourne -1', () => {
    const pool = createPool(3);
    expect(allocEntity(pool)).toBeGreaterThanOrEqual(0);
    allocEntity(pool);
    allocEntity(pool);
    expect(allocEntity(pool)).toBe(-1);
    expect(pool.count).toBe(3);
  });

  it('un identifiant périmé n\'est pas confondu avec son remplaçant', () => {
    const pool = createPool(1);
    const first = allocEntity(pool);
    expect(freeEntity(pool, first)).toBe(true);
    const second = allocEntity(pool);
    expect(entityIndex(second)).toBe(entityIndex(first));
    expect(second).not.toBe(first);
    expect(isAlive(pool, first)).toBe(false);
    expect(isAlive(pool, second)).toBe(true);
    expect(freeEntity(pool, first)).toBe(false);
  });
});

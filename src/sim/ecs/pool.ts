import type { EntityId } from '../types';

const INDEX_BITS = 16;
const INDEX_MASK = (1 << INDEX_BITS) - 1;
const GEN_MASK = 0x7fff;

/** Pool d'entités à capacité fixe : liste libre, identifiants avec génération. */
export interface EntityPool {
  readonly capacity: number;
  readonly generations: Uint16Array;
  readonly alive: Uint8Array;
  readonly freeList: Int32Array;
  freeCount: number;
  count: number;
  /** 1 + plus grand index jamais alloué : borne d'itération et de sérialisation. */
  highWater: number;
}

export function createPool(capacity: number): EntityPool {
  const freeList = new Int32Array(capacity);
  for (let i = 0; i < capacity; i++) freeList[i] = capacity - 1 - i;
  return {
    capacity,
    generations: new Uint16Array(capacity),
    alive: new Uint8Array(capacity),
    freeList,
    freeCount: capacity,
    count: 0,
    highWater: 0,
  };
}

export function entityIndex(id: EntityId): number {
  return id & INDEX_MASK;
}

/** Retourne un identifiant, ou -1 si le pool est plein. */
export function allocEntity(pool: EntityPool): EntityId {
  if (pool.freeCount === 0) return -1;
  const index = pool.freeList[--pool.freeCount] as number;
  pool.alive[index] = 1;
  pool.count++;
  if (index >= pool.highWater) pool.highWater = index + 1;
  return ((pool.generations[index] as number) << INDEX_BITS) | index;
}

export function isAlive(pool: EntityPool, id: EntityId): boolean {
  const index = id & INDEX_MASK;
  return index < pool.capacity && pool.alive[index] === 1 && pool.generations[index] === id >>> INDEX_BITS;
}

/** Libère l'entité ; retourne false si l'identifiant est périmé. */
export function freeEntity(pool: EntityPool, id: EntityId): boolean {
  if (!isAlive(pool, id)) return false;
  const index = id & INDEX_MASK;
  pool.alive[index] = 0;
  pool.generations[index] = ((pool.generations[index] as number) + 1) & GEN_MASK;
  pool.freeList[pool.freeCount++] = index;
  pool.count--;
  return true;
}

import { allocEntity, createPool, entityIndex, freeEntity, isAlive } from './ecs/pool';
import type { EntityPool } from './ecs/pool';
import { buildGrid, createGrid, queryGrid } from './ecs/grid';
import type { SpatialGrid } from './ecs/grid';
import {
  DASH_COOLDOWN_TICKS,
  DASH_SPEED,
  DASH_TICKS,
  PLAYER_ACCEL,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  PLAYER_SPEED,
} from './data/player';
import { createRng, deriveSeed, STREAM_LOOT, STREAM_SPAWN, STREAM_WORLD } from './rng';
import type { Rng } from './rng';
import { FLAG_DASHING, FLAG_INVULNERABLE, SNAP_STRIDE } from './snapshot';
import type { Snapshot } from './snapshot';
import { resolveCircleVsObstacle } from './systems/collision';
import type { Push } from './systems/collision';
import { BTN_DASH, DT, MAX_PLAYERS } from './types';
import type { EntityId, InputFrame, SimEvent } from './types';
import { generateTestObstacles } from './world/obstacles';
import type { Obstacles } from './world/obstacles';

/** Données des joueurs en SoA, indexées par entityIndex(id). */
export interface PlayerStore {
  posX: Float64Array;
  posY: Float64Array;
  velX: Float64Array;
  velY: Float64Array;
  aim: Float64Array;
  hp: Float64Array;
  dashTicks: Int32Array;
  dashCooldown: Int32Array;
  dashDirX: Float64Array;
  dashDirY: Float64Array;
  prevButtons: Int32Array;
  /** 1 tant que l'événement 'spawn' n'a pas été émis (au prochain tick). */
  spawnPending: Uint8Array;
}

export interface SimRng {
  world: Rng;
  spawn: Rng;
  loot: Rng;
}

/** Tout l'état de la simulation : instanciable plusieurs fois, aucune dépendance globale. */
export interface Sim {
  readonly seed: number;
  tick: number;
  /** Pause (solo uniquement) : `step` ne fait rien tant que le drapeau est levé. */
  paused: boolean;
  readonly rng: SimRng;
  readonly playerPool: EntityPool;
  readonly players: PlayerStore;
  readonly obstacles: Obstacles;
  readonly obstacleGrid: SpatialGrid;
  readonly events: SimEvent[];
  readonly nearScratch: Int32Array;
  readonly push: Push;
}

const COLLISION_PASSES = 2;
const NEAR_CAPACITY = 256;
/** Marge ajoutée au rayon de requête des obstacles. */
const QUERY_MARGIN = 0.5;

function createPlayerStore(n: number): PlayerStore {
  return {
    posX: new Float64Array(n),
    posY: new Float64Array(n),
    velX: new Float64Array(n),
    velY: new Float64Array(n),
    aim: new Float64Array(n),
    hp: new Float64Array(n),
    dashTicks: new Int32Array(n),
    dashCooldown: new Int32Array(n),
    dashDirX: new Float64Array(n),
    dashDirY: new Float64Array(n),
    prevButtons: new Int32Array(n),
    spawnPending: new Uint8Array(n),
  };
}

export function createSim(seed: number, obstacles: Obstacles = generateTestObstacles(seed)): Sim {
  const obstacleGrid = createGrid(4, 10, Math.max(obstacles.count, 1));
  buildGrid(obstacleGrid, obstacles.count, obstacles.x, obstacles.y);
  return {
    seed,
    tick: 0,
    paused: false,
    rng: {
      world: createRng(deriveSeed(seed, STREAM_WORLD)),
      spawn: createRng(deriveSeed(seed, STREAM_SPAWN)),
      loot: createRng(deriveSeed(seed, STREAM_LOOT)),
    },
    playerPool: createPool(MAX_PLAYERS),
    players: createPlayerStore(MAX_PLAYERS),
    obstacles,
    obstacleGrid,
    events: [],
    nearScratch: new Int32Array(NEAR_CAPACITY),
    push: { x: 0, y: 0 },
  };
}

/** Ajoute un joueur ; retourne son identifiant, ou -1 si la sim est pleine. */
export function addPlayer(sim: Sim, x = 0, y = 0): EntityId {
  const id = allocEntity(sim.playerPool);
  if (id < 0) return -1;
  const i = entityIndex(id);
  const p = sim.players;
  p.posX[i] = x;
  p.posY[i] = y;
  p.velX[i] = 0;
  p.velY[i] = 0;
  p.aim[i] = 0;
  p.hp[i] = PLAYER_MAX_HP;
  p.dashTicks[i] = 0;
  p.dashCooldown[i] = 0;
  p.dashDirX[i] = 0;
  p.dashDirY[i] = 0;
  p.prevButtons[i] = 0;
  p.spawnPending[i] = 1;
  return id;
}

export function removePlayer(sim: Sim, id: EntityId): boolean {
  return freeEntity(sim.playerPool, id);
}

export function isInvulnerable(sim: Sim, id: EntityId): boolean {
  return isAlive(sim.playerPool, id) && (sim.players.dashTicks[entityIndex(id)] as number) > 0;
}

function collideWithObstacles(sim: Sim, i: number): void {
  const o = sim.obstacles;
  if (o.count === 0) return;
  const p = sim.players;
  const queryRadius = PLAYER_RADIUS + o.maxExtent + QUERY_MARGIN;
  const near = sim.nearScratch;
  const push = sim.push;
  const n = queryGrid(sim.obstacleGrid, p.posX[i] as number, p.posY[i] as number, queryRadius, o.x, o.y, near);
  for (let pass = 0; pass < COLLISION_PASSES; pass++) {
    for (let k = 0; k < n; k++) {
      if (resolveCircleVsObstacle(o, near[k] as number, p.posX[i] as number, p.posY[i] as number, PLAYER_RADIUS, push)) {
        p.posX[i] = (p.posX[i] as number) + push.x;
        p.posY[i] = (p.posY[i] as number) + push.y;
      }
    }
  }
}

function stepPlayer(sim: Sim, id: EntityId, input: InputFrame | undefined): void {
  const i = entityIndex(id);
  const p = sim.players;

  if (p.spawnPending[i] === 1) {
    p.spawnPending[i] = 0;
    sim.events.push({ t: 'spawn', id, x: p.posX[i] as number, y: p.posY[i] as number });
  }

  let mx = input !== undefined && Number.isFinite(input.moveX) ? input.moveX : 0;
  let my = input !== undefined && Number.isFinite(input.moveY) ? input.moveY : 0;
  const mlen = Math.hypot(mx, my);
  if (mlen > 1) {
    mx /= mlen;
    my /= mlen;
  }
  const buttons = input !== undefined ? input.buttons | 0 : 0;
  if (input !== undefined && Number.isFinite(input.aimAngle)) p.aim[i] = input.aimAngle;

  if ((p.dashCooldown[i] as number) > 0) p.dashCooldown[i] = (p.dashCooldown[i] as number) - 1;

  const dashPressed = (buttons & BTN_DASH) !== 0 && ((p.prevButtons[i] as number) & BTN_DASH) === 0;
  if (dashPressed && p.dashTicks[i] === 0 && p.dashCooldown[i] === 0) {
    let dx = mx;
    let dy = my;
    if (Math.hypot(dx, dy) < 0.01) {
      dx = Math.cos(p.aim[i] as number);
      dy = Math.sin(p.aim[i] as number);
    } else {
      const l = Math.hypot(dx, dy);
      dx /= l;
      dy /= l;
    }
    p.dashDirX[i] = dx;
    p.dashDirY[i] = dy;
    p.dashTicks[i] = DASH_TICKS;
    p.dashCooldown[i] = DASH_COOLDOWN_TICKS;
    sim.events.push({ t: 'dash', id, x: p.posX[i] as number, y: p.posY[i] as number });
  }

  let dashEnded = false;
  if ((p.dashTicks[i] as number) > 0) {
    p.velX[i] = (p.dashDirX[i] as number) * DASH_SPEED;
    p.velY[i] = (p.dashDirY[i] as number) * DASH_SPEED;
    p.dashTicks[i] = (p.dashTicks[i] as number) - 1;
    dashEnded = p.dashTicks[i] === 0;
  } else {
    const tx = mx * PLAYER_SPEED;
    const ty = my * PLAYER_SPEED;
    const dvx = tx - (p.velX[i] as number);
    const dvy = ty - (p.velY[i] as number);
    const dv = Math.hypot(dvx, dvy);
    const maxStep = PLAYER_ACCEL * DT;
    if (dv <= maxStep) {
      p.velX[i] = tx;
      p.velY[i] = ty;
    } else {
      p.velX[i] = (p.velX[i] as number) + (dvx / dv) * maxStep;
      p.velY[i] = (p.velY[i] as number) + (dvy / dv) * maxStep;
    }
  }

  p.posX[i] = (p.posX[i] as number) + (p.velX[i] as number) * DT;
  p.posY[i] = (p.posY[i] as number) + (p.velY[i] as number) * DT;
  collideWithObstacles(sim, i);
  if (dashEnded) {
    // Fin d'esquive : on retombe à la vitesse de course sans glissade.
    p.velX[i] = (p.dashDirX[i] as number) * PLAYER_SPEED;
    p.velY[i] = (p.dashDirY[i] as number) * PLAYER_SPEED;
  }

  p.prevButtons[i] = buttons;
}

/**
 * Avance la sim d'un tick (1/60 s). `inputs` est indexé par entityIndex(id) du joueur.
 * Retourne les événements du tick (tableau réutilisé au tick suivant).
 */
export function step(sim: Sim, inputs: ReadonlyArray<InputFrame | undefined>): readonly SimEvent[] {
  if (sim.paused) return sim.events;
  sim.events.length = 0;
  sim.tick++;
  const pool = sim.playerPool;
  for (let i = 0; i < pool.capacity; i++) {
    if (pool.alive[i] === 0) continue;
    const id = (((pool.generations[i] as number) << 16) | i) as EntityId;
    stepPlayer(sim, id, inputs[i]);
  }
  return sim.events;
}

export function snapshot(sim: Sim): Snapshot {
  const pool = sim.playerPool;
  const p = sim.players;
  const ids = new Int32Array(pool.count);
  const data = new Float32Array(pool.count * SNAP_STRIDE);
  let n = 0;
  for (let i = 0; i < pool.capacity; i++) {
    if (pool.alive[i] === 0) continue;
    ids[n] = ((pool.generations[i] as number) << 16) | i;
    const o = n * SNAP_STRIDE;
    const dashing = (p.dashTicks[i] as number) > 0;
    data[o] = p.posX[i] as number;
    data[o + 1] = p.posY[i] as number;
    data[o + 2] = p.aim[i] as number;
    data[o + 3] = p.hp[i] as number;
    data[o + 4] = dashing ? FLAG_DASHING | FLAG_INVULNERABLE : 0;
    data[o + 5] = (p.dashCooldown[i] as number) / DASH_COOLDOWN_TICKS;
    data[o + 6] = Math.hypot(p.velX[i] as number, p.velY[i] as number);
    n++;
  }
  return { tick: sim.tick, playerCount: n, ids, players: data };
}

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

function mix(h: number, v: number): number {
  return Math.imul(h ^ v, 16777619) >>> 0;
}

function mixF64(h: number, v: number): number {
  f64[0] = v;
  return mix(mix(h, u32[0] as number), u32[1] as number);
}

/** Empreinte (FNV-1a) de l'état : sert aux tests de déterminisme. */
export function hashState(sim: Sim): number {
  let h = 2166136261;
  h = mix(h, sim.tick);
  h = mix(h, sim.rng.world.state);
  h = mix(h, sim.rng.spawn.state);
  h = mix(h, sim.rng.loot.state);
  const pool = sim.playerPool;
  const p = sim.players;
  for (let i = 0; i < pool.capacity; i++) {
    if (pool.alive[i] === 0) continue;
    h = mix(h, i);
    h = mix(h, pool.generations[i] as number);
    h = mixF64(h, p.posX[i] as number);
    h = mixF64(h, p.posY[i] as number);
    h = mixF64(h, p.velX[i] as number);
    h = mixF64(h, p.velY[i] as number);
    h = mixF64(h, p.aim[i] as number);
    h = mixF64(h, p.hp[i] as number);
    h = mix(h, p.dashTicks[i] as number);
    h = mix(h, p.dashCooldown[i] as number);
  }
  return h;
}

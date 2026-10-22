import { allocEntity, createPool, entityIndex, freeEntity, isAlive } from './ecs/pool';
import type { EntityPool } from './ecs/pool';
import { buildGrid, createGrid } from './ecs/grid';
import type { SpatialGrid } from './ecs/grid';
import { DASH_COOLDOWN_TICKS, PLAYER_MAX_HP } from './data/player';
import { ENEMIES, ENEMY_BIG_RADIUS, ENEMY_POOL_SIZE, SEPARATION_NEIGHBORS, PROJECTILE_POOL_SIZE, RESPAWN_TICKS } from './data/enemies';
import { WEAPON_PISTOL } from './data/weapons';
import { createRng, deriveSeed, STREAM_COMBAT, STREAM_LOOT, STREAM_SPAWN, STREAM_WORLD } from './rng';
import type { Rng } from './rng';
import {
  ENEMY_ANGLE,
  ENEMY_FLASH,
  ENEMY_GEN,
  ENEMY_HP,
  ENEMY_PHASE,
  ENEMY_STATE,
  ENEMY_STRIDE,
  ENEMY_TYPE,
  ENEMY_X,
  ENEMY_Y,
  FLAG_DASHING,
  FLAG_DEAD,
  FLAG_HURT,
  FLAG_INVULNERABLE,
  FLAG_SAFE,
  PROJ_ANGLE,
  PROJ_GEN,
  PROJ_KIND,
  PROJ_STRIDE,
  PROJ_X,
  PROJ_Y,
  SNAP_STRIDE,
} from './snapshot';
import type { Snapshot } from './snapshot';
import { stepProjectiles } from './systems/combat';
import type { ObstacleQuery, Vec2 } from './systems/collision';
import { stepEnemies, stepGroups, stepSpawner } from './systems/enemies';
import { stepPlayer } from './systems/player';
import { MAX_PLAYERS } from './types';
import type { EntityId, InputFrame, SimEvent } from './types';
import { buildMapRuntime, mapObstacles } from './world/map';
import type { MapRuntime } from './world/map';
import type { MapDef } from './world/mapdef';
import { createObstacleIndex } from './world/obstacleIndex';
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
  /** Ticks d'invulnérabilité restants (après un coup ou une réapparition). */
  hurtTicks: Int32Array;
  fireCooldown: Int32Array;
  weapon: Int32Array;
  dead: Uint8Array;
  deadTicks: Int32Array;
  lifeTicks: Int32Array;
  lifeKills: Int32Array;
  /** 1 tant que le joueur est dans un refuge (ni ciblé ni blessé). */
  inRefuge: Uint8Array;
  /** Rayon de bruit courant (m) : relevé à chaque tir, décroît ensuite. */
  noise: Float64Array;
}

export interface EnemyStore {
  posX: Float64Array;
  posY: Float64Array;
  hp: Float64Array;
  /** PV maximaux (PV du type × multiplicateur de difficulté). */
  maxHp: Float64Array;
  /** Multiplicateur de dégâts de difficulté. */
  dmgMult: Float64Array;
  /** 1 pour les ennemis des groupes de la carte : jamais recyclés. */
  persistent: Uint8Array;
  angle: Float64Array;
  flash: Int32Array;
  type: Uint8Array;
  /** STATE_IDLE ou STATE_CHASE. */
  state: Uint8Array;
  /** Point d'attache : les ennemis au repos flânent autour. */
  homeX: Float64Array;
  homeY: Float64Array;
  /** Phase d'action en cours (PHASE_*) : préparation, action, récupération. */
  phase: Uint8Array;
  timer: Int32Array;
  cooldown: Int32Array;
  /** Angle verrouillé (charge) ou angle de base du motif en cours. */
  aux: Float64Array;
  /** Indice du prochain motif dans la liste du tireur. */
  patternIndex: Uint8Array;
  pattern: Int8Array;
  burstsLeft: Int16Array;
  burstTimer: Int16Array;
  /** Ticks d'enragement restants (cri du Hurleur). */
  rage: Int32Array;
  screams: Uint8Array;
  /** Souche qui a généré cet ennemi (EntityId) ou -1. */
  parent: Int32Array;
  childCount: Int32Array;
}

export interface ProjectileStore {
  posX: Float64Array;
  posY: Float64Array;
  velX: Float64Array;
  velY: Float64Array;
  damage: Float64Array;
  radius: Float64Array;
  angle: Float64Array;
  life: Int32Array;
  owner: Int32Array;
  pierce: Int32Array;
  /** Dernier emplacement d'ennemi touché (évite de retoucher un ennemi traversé). */
  lastHit: Int32Array;
  kind: Uint8Array;
}

/** Grille des ennemis vivants, reconstruite à chaque tick sur des tableaux compacts. */
export interface EnemyGrid {
  readonly grid: SpatialGrid;
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Emplacement de pool de chaque entrée compacte. */
  readonly slot: Int32Array;
  count: number;
  /** Grille des gros ennemis seulement (rayon > ENEMY_BIG_RADIUS). */
  readonly bigGrid: SpatialGrid;
  readonly bigX: Float64Array;
  readonly bigY: Float64Array;
  readonly bigSlot: Int32Array;
  bigCount: number;
}

export interface SimRng {
  world: Rng;
  spawn: Rng;
  loot: Rng;
  combat: Rng;
}

export interface SimConfig {
  /** Nombre d'ennemis visé au total ; -1 = densité automatique selon le temps de survie. */
  hordeTarget: number;
  /** Apparition ambiante autour des joueurs (monde de test sans carte). Forcée quand hordeTarget >= 0. */
  ambient: boolean;
  /** Les ennemis apparaissent déjà en poursuite (tests de charge). */
  spawnAggro: boolean;
}

/** Tout l'état de la simulation : instanciable plusieurs fois, aucune dépendance globale. */
export interface Sim {
  readonly seed: number;
  /** Carte chargée, ou null pour le monde de test. */
  readonly map: MapRuntime | null;
  tick: number;
  /** Pause (solo uniquement) : `step` ne fait rien tant que le drapeau est levé. */
  paused: boolean;
  readonly config: SimConfig;
  readonly rng: SimRng;
  readonly playerPool: EntityPool;
  readonly players: PlayerStore;
  readonly enemyPool: EntityPool;
  readonly enemies: EnemyStore;
  readonly projectilePool: EntityPool;
  readonly projectiles: ProjectileStore;
  readonly enemyGrid: EnemyGrid;
  readonly obstacles: Obstacles;
  readonly obstacleQuery: ObstacleQuery;
  readonly events: SimEvent[];
  /** Joueurs vivants du tick (indices), mis à jour en début de tick. */
  readonly live: Int32Array;
  liveCount: number;
  readonly nearEnemies: Int32Array;
  readonly nearBig: Int32Array;
  readonly nearSep: Int32Array;
  readonly tmp: Vec2;
  /** Direction (unitaire) et vitesse voulues pour l'ennemi courant. */
  readonly steer: { dx: number; dy: number; speed: number; contact: number };
}

const BIG_CAPACITY = 256;

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
    hurtTicks: new Int32Array(n),
    fireCooldown: new Int32Array(n),
    weapon: new Int32Array(n),
    dead: new Uint8Array(n),
    deadTicks: new Int32Array(n),
    lifeTicks: new Int32Array(n),
    lifeKills: new Int32Array(n),
    inRefuge: new Uint8Array(n),
    noise: new Float64Array(n),
  };
}

function createEnemyStore(n: number): EnemyStore {
  return {
    posX: new Float64Array(n),
    posY: new Float64Array(n),
    hp: new Float64Array(n),
    maxHp: new Float64Array(n),
    dmgMult: new Float64Array(n),
    persistent: new Uint8Array(n),
    angle: new Float64Array(n),
    flash: new Int32Array(n),
    type: new Uint8Array(n),
    state: new Uint8Array(n),
    homeX: new Float64Array(n),
    homeY: new Float64Array(n),
    phase: new Uint8Array(n),
    timer: new Int32Array(n),
    cooldown: new Int32Array(n),
    aux: new Float64Array(n),
    patternIndex: new Uint8Array(n),
    pattern: new Int8Array(n),
    burstsLeft: new Int16Array(n),
    burstTimer: new Int16Array(n),
    rage: new Int32Array(n),
    screams: new Uint8Array(n),
    parent: new Int32Array(n),
    childCount: new Int32Array(n),
  };
}

function createProjectileStore(n: number): ProjectileStore {
  return {
    posX: new Float64Array(n),
    posY: new Float64Array(n),
    velX: new Float64Array(n),
    velY: new Float64Array(n),
    damage: new Float64Array(n),
    radius: new Float64Array(n),
    angle: new Float64Array(n),
    life: new Int32Array(n),
    owner: new Int32Array(n),
    pierce: new Int32Array(n),
    lastHit: new Int32Array(n),
    kind: new Uint8Array(n),
  };
}

/** Monde de test (sans carte) : obstacles générés ou fournis, apparition ambiante. Sert aux tests et au banc de charge. */
export function createSim(seed: number, obstacles: Obstacles = generateTestObstacles(seed)): Sim {
  return buildSim(seed, obstacles, null);
}

/** Monde de jeu : une carte fixe (obstacles, refuges, groupes d'ennemis, limites). */
export function createSimFromMap(def: MapDef, seed = 1): Sim {
  const map = buildMapRuntime(def);
  return buildSim(seed, mapObstacles(def), map);
}

function buildSim(seed: number, obstacles: Obstacles, map: MapRuntime | null): Sim {
  return {
    seed,
    map,
    tick: 0,
    paused: false,
    config: { hordeTarget: -1, ambient: map === null, spawnAggro: false },
    rng: {
      world: createRng(deriveSeed(seed, STREAM_WORLD)),
      spawn: createRng(deriveSeed(seed, STREAM_SPAWN)),
      loot: createRng(deriveSeed(seed, STREAM_LOOT)),
      combat: createRng(deriveSeed(seed, STREAM_COMBAT)),
    },
    playerPool: createPool(MAX_PLAYERS),
    players: createPlayerStore(MAX_PLAYERS),
    enemyPool: createPool(ENEMY_POOL_SIZE),
    enemies: createEnemyStore(ENEMY_POOL_SIZE),
    projectilePool: createPool(PROJECTILE_POOL_SIZE),
    projectiles: createProjectileStore(PROJECTILE_POOL_SIZE),
    enemyGrid: {
      grid: createGrid(2, 12, ENEMY_POOL_SIZE),
      x: new Float64Array(ENEMY_POOL_SIZE),
      y: new Float64Array(ENEMY_POOL_SIZE),
      slot: new Int32Array(ENEMY_POOL_SIZE),
      count: 0,
      bigGrid: createGrid(4, 8, BIG_CAPACITY),
      bigX: new Float64Array(BIG_CAPACITY),
      bigY: new Float64Array(BIG_CAPACITY),
      bigSlot: new Int32Array(BIG_CAPACITY),
      bigCount: 0,
    },
    obstacles,
    obstacleQuery: { obstacles, index: createObstacleIndex(obstacles), near: new Int32Array(256), push: { x: 0, y: 0 } },
    events: [],
    live: new Int32Array(MAX_PLAYERS),
    liveCount: 0,
    nearEnemies: new Int32Array(128),
    nearBig: new Int32Array(32),
    nearSep: new Int32Array(SEPARATION_NEIGHBORS),
    tmp: { x: 0, y: 0 },
    steer: { dx: 0, dy: 0, speed: 0, contact: 0 },
  };
}

/** Ajoute un joueur ; retourne son identifiant, ou -1 si la sim est pleine. */
export function addPlayer(sim: Sim, x = sim.map?.startX ?? 0, y = sim.map?.startY ?? 0): EntityId {
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
  p.hurtTicks[i] = 0;
  p.fireCooldown[i] = 0;
  p.weapon[i] = WEAPON_PISTOL;
  p.dead[i] = 0;
  p.deadTicks[i] = 0;
  p.lifeTicks[i] = 0;
  p.lifeKills[i] = 0;
  p.inRefuge[i] = 0;
  p.noise[i] = 0;
  return id;
}

export function removePlayer(sim: Sim, id: EntityId): boolean {
  return freeEntity(sim.playerPool, id);
}

export function isInvulnerable(sim: Sim, id: EntityId): boolean {
  if (!isAlive(sim.playerPool, id)) return false;
  const i = entityIndex(id);
  return (sim.players.dashTicks[i] as number) > 0 || (sim.players.hurtTicks[i] as number) > 0;
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
    stepPlayer(sim, (((pool.generations[i] as number) << 16) | i) as EntityId, inputs[i]);
  }

  sim.liveCount = 0;
  for (let i = 0; i < pool.capacity; i++) {
    if (pool.alive[i] === 1 && sim.players.dead[i] === 0) sim.live[sim.liveCount++] = i;
  }

  updateRefuges(sim);
  stepGroups(sim);
  buildEnemyGrid(sim);
  stepProjectiles(sim);
  stepEnemies(sim);
  stepSpawner(sim);
  return sim.events;
}

/** Marque les joueurs vivants qui se trouvent dans un refuge. */
function updateRefuges(sim: Sim): void {
  const p = sim.players;
  const map = sim.map;
  for (let k = 0; k < sim.liveCount; k++) {
    const i = sim.live[k] as number;
    let safe = 0;
    if (map !== null) {
      for (const r of map.refuges) {
        const dx = (p.posX[i] as number) - r.x;
        const dy = (p.posY[i] as number) - r.y;
        if (dx * dx + dy * dy <= r.radius * r.radius) safe = 1;
      }
    }
    p.inRefuge[i] = safe;
  }
}

function buildEnemyGrid(sim: Sim): void {
  const pool = sim.enemyPool;
  const g = sim.enemyGrid;
  const e = sim.enemies;
  let n = 0;
  let big = 0;
  for (let s = 0; s < pool.highWater; s++) {
    if (pool.alive[s] === 0) continue;
    const x = e.posX[s] as number;
    const y = e.posY[s] as number;
    g.x[n] = x;
    g.y[n] = y;
    g.slot[n] = s;
    n++;
    if ((ENEMIES[e.type[s] as number]?.radius ?? 0) > ENEMY_BIG_RADIUS && big < BIG_CAPACITY) {
      g.bigX[big] = x;
      g.bigY[big] = y;
      g.bigSlot[big] = s;
      big++;
    }
  }
  g.count = n;
  g.bigCount = big;
  buildGrid(g.grid, n, g.x, g.y);
  buildGrid(g.bigGrid, big, g.bigX, g.bigY);
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
    const hurt = (p.hurtTicks[i] as number) > 0;
    let flags = 0;
    if (dashing) flags |= FLAG_DASHING | FLAG_INVULNERABLE;
    if (hurt) flags |= FLAG_HURT | FLAG_INVULNERABLE;
    if (p.dead[i] === 1) flags |= FLAG_DEAD;
    if (p.inRefuge[i] === 1) flags |= FLAG_SAFE;
    data[o] = p.posX[i] as number;
    data[o + 1] = p.posY[i] as number;
    data[o + 2] = p.aim[i] as number;
    data[o + 3] = p.hp[i] as number;
    data[o + 4] = flags;
    data[o + 5] = (p.dashCooldown[i] as number) / DASH_COOLDOWN_TICKS;
    data[o + 6] = Math.hypot(p.velX[i] as number, p.velY[i] as number);
    data[o + 7] = p.dead[i] === 1 ? (p.deadTicks[i] as number) / RESPAWN_TICKS : 0;
    data[o + 8] = p.lifeKills[i] as number;
    data[o + 9] = p.noise[i] as number;
    n++;
  }

  const ep = sim.enemyPool;
  const e = sim.enemies;
  const enemies = new Float32Array(ep.highWater * ENEMY_STRIDE);
  for (let s = 0; s < ep.highWater; s++) {
    if (ep.alive[s] === 0) continue;
    const o = s * ENEMY_STRIDE;
    enemies[o + ENEMY_TYPE] = (e.type[s] as number) + 1;
    enemies[o + ENEMY_X] = e.posX[s] as number;
    enemies[o + ENEMY_Y] = e.posY[s] as number;
    enemies[o + ENEMY_ANGLE] = e.angle[s] as number;
    enemies[o + ENEMY_FLASH] = (e.flash[s] as number) / 6;
    enemies[o + ENEMY_GEN] = ep.generations[s] as number;
    enemies[o + ENEMY_STATE] = e.state[s] as number;
    const maxHp = ENEMIES[e.type[s] as number]?.hp ?? 1;
    enemies[o + ENEMY_HP] = Math.max(0, Math.min(1, (e.hp[s] as number) / ((e.maxHp[s] as number) || maxHp)));
    enemies[o + ENEMY_PHASE] = (e.phase[s] as number) + ((e.rage[s] as number) > 0 ? 8 : 0);
  }

  const pp = sim.projectilePool;
  const pr = sim.projectiles;
  const projectiles = new Float32Array(pp.highWater * PROJ_STRIDE);
  for (let s = 0; s < pp.highWater; s++) {
    if (pp.alive[s] === 0) continue;
    const o = s * PROJ_STRIDE;
    projectiles[o + PROJ_KIND] = (pr.kind[s] as number) + 1;
    projectiles[o + PROJ_X] = pr.posX[s] as number;
    projectiles[o + PROJ_Y] = pr.posY[s] as number;
    projectiles[o + PROJ_ANGLE] = pr.angle[s] as number;
    projectiles[o + PROJ_GEN] = pp.generations[s] as number;
  }

  return {
    tick: sim.tick,
    playerCount: n,
    ids,
    players: data,
    enemyHigh: ep.highWater,
    enemies,
    projectileHigh: pp.highWater,
    projectiles,
  };
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
  h = mix(h, sim.rng.combat.state);
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
    h = mix(h, p.hurtTicks[i] as number);
    h = mix(h, p.fireCooldown[i] as number);
    h = mix(h, p.deadTicks[i] as number);
    h = mix(h, p.lifeKills[i] as number);
    h = mixF64(h, p.noise[i] as number);
  }
  const ep = sim.enemyPool;
  const e = sim.enemies;
  for (let s = 0; s < ep.highWater; s++) {
    if (ep.alive[s] === 0) continue;
    h = mix(h, s);
    h = mixF64(h, e.posX[s] as number);
    h = mixF64(h, e.posY[s] as number);
    h = mixF64(h, e.hp[s] as number);
    h = mix(h, e.state[s] as number);
    h = mix(h, e.phase[s] as number);
    h = mix(h, e.timer[s] as number);
    h = mix(h, e.rage[s] as number);
    h = mixF64(h, e.maxHp[s] as number);
    h = mix(h, e.persistent[s] as number);
    h = mix(h, e.childCount[s] as number);
    h = mixF64(h, e.aux[s] as number);
  }
  if (sim.map !== null) for (const g of sim.map.groups) h = mix(h, g.activated ? 1 : 0);
  const pp = sim.projectilePool;
  const pr = sim.projectiles;
  for (let s = 0; s < pp.highWater; s++) {
    if (pp.alive[s] === 0) continue;
    h = mix(h, s);
    h = mixF64(h, pr.posX[s] as number);
    h = mixF64(h, pr.posY[s] as number);
    h = mix(h, pr.life[s] as number);
  }
  return h;
}

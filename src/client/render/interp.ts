import { ENEMY_POOL_SIZE, PROJECTILE_POOL_SIZE } from '../../sim/data/enemies';
import { BAG_SLOTS } from '../../sim/data/items';
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
  PROJ_ANGLE,
  PROJ_GEN,
  PROJ_KIND,
  PROJ_STRIDE,
  PROJ_X,
  PROJ_Y,
  SNAP_AIM,
  SNAP_DASH_CD,
  SNAP_FLAGS,
  SNAP_HP,
  SNAP_LIFE_KILLS,
  SNAP_NOISE,
  SNAP_OPEN,
  SNAP_RESPAWN,
  SNAP_STRIDE,
  SNAP_VEL,
  SNAP_X,
  SNAP_Y,
} from '../../sim/snapshot';
import type { Snapshot } from '../../sim/snapshot';
import { MAX_PLAYERS, TICK_RATE } from '../../sim/types';

const TICK_MS = 1000 / TICK_RATE;
/** Retard de rendu : on interpole entre deux états déjà reçus. */
const DELAY_TICKS = 2;
const BUFFER_SIZE = 12;

/** Stride des tableaux interpolés (sortie), indexés par emplacement de pool. */
export const OUT_ENEMY_STRIDE = 8; // type + 1 (0 = vide), x, y, angle, flash, état, phase (+8 si enragé), PV (0..1)
export const OUT_PROJ_STRIDE = 4; // genre + 1 (0 = vide), x, y, angle

/** État interpolé, réutilisé d'une image à l'autre. */
export interface InterpState {
  count: number;
  ids: Int32Array;
  x: Float32Array;
  y: Float32Array;
  aim: Float32Array;
  hp: Float32Array;
  flags: Int32Array;
  dashCd: Float32Array;
  speed: Float32Array;
  respawn: Float32Array;
  lifeKills: Int32Array;
  noise: Float32Array;
  /** Progression de la fouille (0..1). */
  open: Float32Array;
  /** BAG_SLOTS * 2 valeurs par joueur : (objet + 1, quantité). */
  bags: Int32Array;
  /** État des caisses (1 = prête) et objets au sol : copiés tels quels du dernier snapshot. */
  crates: Uint8Array;
  pickupHigh: number;
  pickups: Float32Array;
  enemyHigh: number;
  enemies: Float32Array;
  projectileHigh: number;
  projectiles: Float32Array;
}

export function createInterpState(): InterpState {
  return {
    count: 0,
    ids: new Int32Array(MAX_PLAYERS),
    x: new Float32Array(MAX_PLAYERS),
    y: new Float32Array(MAX_PLAYERS),
    aim: new Float32Array(MAX_PLAYERS),
    hp: new Float32Array(MAX_PLAYERS),
    flags: new Int32Array(MAX_PLAYERS),
    dashCd: new Float32Array(MAX_PLAYERS),
    speed: new Float32Array(MAX_PLAYERS),
    respawn: new Float32Array(MAX_PLAYERS),
    lifeKills: new Int32Array(MAX_PLAYERS),
    noise: new Float32Array(MAX_PLAYERS),
    open: new Float32Array(MAX_PLAYERS),
    bags: new Int32Array(MAX_PLAYERS * BAG_SLOTS * 2),
    crates: new Uint8Array(0),
    pickupHigh: 0,
    pickups: new Float32Array(0),
    enemyHigh: 0,
    enemies: new Float32Array(ENEMY_POOL_SIZE * OUT_ENEMY_STRIDE),
    projectileHigh: 0,
    projectiles: new Float32Array(PROJECTILE_POOL_SIZE * OUT_PROJ_STRIDE),
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * Tampon de snapshots : le rendu à 30, 60 ou 144 Hz lit toujours un instant
 * interpolé entre deux ticks de sim, indépendamment de la cadence d'arrivée.
 */
export class SnapshotBuffer {
  private readonly snaps: Snapshot[] = [];
  /** Instant local (ms) où le tick 0 aurait été reçu : sert à dater les ticks. */
  private offset = Number.NaN;

  /** À appeler quand le monde reprend après une pause : on recale l'horloge. */
  resync(): void {
    this.offset = Number.NaN;
  }

  get latestTick(): number {
    const s = this.snaps[this.snaps.length - 1];
    return s === undefined ? 0 : s.tick;
  }

  push(snap: Snapshot, nowMs: number): void {
    const candidate = nowMs - snap.tick * TICK_MS;
    if (Number.isNaN(this.offset) || candidate < this.offset) this.offset = candidate;
    else this.offset += (candidate - this.offset) * 0.01;
    this.snaps.push(snap);
    if (this.snaps.length > BUFFER_SIZE) this.snaps.shift();
  }

  sample(nowMs: number, out: InterpState): boolean {
    const n = this.snaps.length;
    if (n === 0) return false;
    const newest = this.snaps[n - 1] as Snapshot;
    // Après une pause (onglet masqué) l'horloge est recalée : on la cale tout de suite sur le dernier état connu.
    if (Number.isNaN(this.offset)) this.offset = nowMs - (newest.tick + DELAY_TICKS) * TICK_MS;
    let t = (nowMs - this.offset) / TICK_MS - DELAY_TICKS;
    if (t > newest.tick + 1) {
      // Données en retard (onglet gelé, worker lent) : on recale sur le dernier tick reçu.
      this.offset = nowMs - (newest.tick + DELAY_TICKS) * TICK_MS;
      t = newest.tick;
    }
    const oldest = this.snaps[0] as Snapshot;
    if (t < oldest.tick) t = oldest.tick;
    if (t > newest.tick) t = newest.tick;

    let b = n - 1;
    while (b > 0 && (this.snaps[b - 1] as Snapshot).tick >= t) b--;
    const to = this.snaps[b] as Snapshot;
    const from = (b > 0 ? this.snaps[b - 1] : to) as Snapshot;
    const span = to.tick - from.tick;
    const alpha = span > 0 ? Math.min(1, Math.max(0, (t - from.tick) / span)) : 1;

    out.crates = to.crates;
    out.pickupHigh = to.pickupHigh;
    out.pickups = to.pickups;
    this.samplePlayers(from, to, alpha, out);
    this.sampleEnemies(from, to, alpha, out);
    this.sampleProjectiles(from, to, alpha, out);
    return true;
  }

  private samplePlayers(from: Snapshot, to: Snapshot, alpha: number, out: InterpState): void {
    out.count = to.playerCount;
    const d = to.players;
    const f = from.players;
    for (let i = 0; i < to.playerCount; i++) {
      const id = to.ids[i] as number;
      let j = -1;
      for (let k = 0; k < from.playerCount; k++) {
        if (from.ids[k] === id) {
          j = k;
          break;
        }
      }
      const o = i * SNAP_STRIDE;
      out.ids[i] = id;
      out.hp[i] = d[o + SNAP_HP] as number;
      out.flags[i] = d[o + SNAP_FLAGS] as number;
      out.dashCd[i] = d[o + SNAP_DASH_CD] as number;
      out.speed[i] = d[o + SNAP_VEL] as number;
      out.respawn[i] = d[o + SNAP_RESPAWN] as number;
      out.lifeKills[i] = d[o + SNAP_LIFE_KILLS] as number;
      out.noise[i] = d[o + SNAP_NOISE] as number;
      out.open[i] = d[o + SNAP_OPEN] as number;
      out.bags.set(to.bags.subarray(i * BAG_SLOTS * 2, (i + 1) * BAG_SLOTS * 2), i * BAG_SLOTS * 2);
      if (j < 0) {
        out.x[i] = d[o + SNAP_X] as number;
        out.y[i] = d[o + SNAP_Y] as number;
        out.aim[i] = d[o + SNAP_AIM] as number;
      } else {
        const p = j * SNAP_STRIDE;
        const x0 = f[p + SNAP_X] as number;
        const y0 = f[p + SNAP_Y] as number;
        const x1 = d[o + SNAP_X] as number;
        const y1 = d[o + SNAP_Y] as number;
        // Un saut de position (réapparition) ne s'interpole pas.
        const jump = (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0) > 100;
        const a = jump ? 1 : alpha;
        out.x[i] = x0 + (x1 - x0) * a;
        out.y[i] = y0 + (y1 - y0) * a;
        out.aim[i] = lerpAngle(f[p + SNAP_AIM] as number, d[o + SNAP_AIM] as number, alpha);
      }
    }
  }

  private sampleEnemies(from: Snapshot, to: Snapshot, alpha: number, out: InterpState): void {
    const d = to.enemies;
    const f = from.enemies;
    const o2 = out.enemies;
    out.enemyHigh = to.enemyHigh;
    for (let s = 0; s < to.enemyHigh; s++) {
      const a = s * ENEMY_STRIDE;
      const o = s * OUT_ENEMY_STRIDE;
      const type = d[a + ENEMY_TYPE] as number;
      o2[o] = type;
      if (type === 0) continue;
      const x1 = d[a + ENEMY_X] as number;
      const y1 = d[a + ENEMY_Y] as number;
      let x = x1;
      let y = y1;
      if (s < from.enemyHigh && (f[a + ENEMY_TYPE] as number) !== 0 && f[a + ENEMY_GEN] === d[a + ENEMY_GEN]) {
        const x0 = f[a + ENEMY_X] as number;
        const y0 = f[a + ENEMY_Y] as number;
        x = x0 + (x1 - x0) * alpha;
        y = y0 + (y1 - y0) * alpha;
      }
      o2[o + 1] = x;
      o2[o + 2] = y;
      o2[o + 3] = d[a + ENEMY_ANGLE] as number;
      o2[o + 4] = d[a + ENEMY_FLASH] as number;
      o2[o + 5] = d[a + ENEMY_STATE] as number;
      o2[o + 6] = d[a + ENEMY_PHASE] as number;
      o2[o + 7] = d[a + ENEMY_HP] as number;
    }
  }

  private sampleProjectiles(from: Snapshot, to: Snapshot, alpha: number, out: InterpState): void {
    const d = to.projectiles;
    const f = from.projectiles;
    const o2 = out.projectiles;
    out.projectileHigh = to.projectileHigh;
    for (let s = 0; s < to.projectileHigh; s++) {
      const a = s * PROJ_STRIDE;
      const o = s * OUT_PROJ_STRIDE;
      const kind = d[a + PROJ_KIND] as number;
      o2[o] = kind;
      if (kind === 0) continue;
      const x1 = d[a + PROJ_X] as number;
      const y1 = d[a + PROJ_Y] as number;
      let x = x1;
      let y = y1;
      if (s < from.projectileHigh && (f[a + PROJ_KIND] as number) !== 0 && f[a + PROJ_GEN] === d[a + PROJ_GEN]) {
        const x0 = f[a + PROJ_X] as number;
        const y0 = f[a + PROJ_Y] as number;
        x = x0 + (x1 - x0) * alpha;
        y = y0 + (y1 - y0) * alpha;
      }
      o2[o + 1] = x;
      o2[o + 2] = y;
      o2[o + 3] = d[a + PROJ_ANGLE] as number;
    }
  }
}

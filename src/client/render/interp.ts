import { MAX_PLAYERS, TICK_RATE } from '../../sim/types';
import { SNAP_AIM, SNAP_DASH_CD, SNAP_FLAGS, SNAP_HP, SNAP_STRIDE, SNAP_VEL, SNAP_X, SNAP_Y } from '../../sim/snapshot';
import type { Snapshot } from '../../sim/snapshot';

const TICK_MS = 1000 / TICK_RATE;
/** Retard de rendu : on interpole entre deux états déjà reçus. */
const DELAY_TICKS = 2;
const BUFFER_SIZE = 12;

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
  /** Tick (fractionnaire) interpolé lors du dernier échantillonnage. */
  renderTick = 0;

  /** À appeler quand le monde reprend après une pause : on recale l'horloge. */
  resync(): void {
    this.offset = Number.NaN;
  }

  get latestTick(): number {
    const s = this.snaps[this.snaps.length - 1];
    return s === undefined ? 0 : s.tick;
  }

  get hasData(): boolean {
    return this.snaps.length > 0;
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
    let t = (nowMs - this.offset) / TICK_MS - DELAY_TICKS;
    if (t > newest.tick + 1) {
      // Données en retard (onglet gelé, worker lent) : on recale sur le dernier tick reçu.
      this.offset = nowMs - (newest.tick + DELAY_TICKS) * TICK_MS;
      t = newest.tick;
    }
    const oldest = this.snaps[0] as Snapshot;
    if (t < oldest.tick) t = oldest.tick;
    if (t > newest.tick) t = newest.tick;
    this.renderTick = t;

    let b = n - 1;
    while (b > 0 && (this.snaps[b - 1] as Snapshot).tick >= t) b--;
    const to = this.snaps[b] as Snapshot;
    const from = (b > 0 ? this.snaps[b - 1] : to) as Snapshot;
    const span = to.tick - from.tick;
    const alpha = span > 0 ? Math.min(1, Math.max(0, (t - from.tick) / span)) : 1;

    out.count = to.playerCount;
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
      const d = to.players;
      out.ids[i] = id;
      out.hp[i] = d[o + SNAP_HP] as number;
      out.flags[i] = d[o + SNAP_FLAGS] as number;
      out.dashCd[i] = d[o + SNAP_DASH_CD] as number;
      out.speed[i] = d[o + SNAP_VEL] as number;
      if (j < 0) {
        out.x[i] = d[o + SNAP_X] as number;
        out.y[i] = d[o + SNAP_Y] as number;
        out.aim[i] = d[o + SNAP_AIM] as number;
      } else {
        const f = from.players;
        const p = j * SNAP_STRIDE;
        out.x[i] = (f[p + SNAP_X] as number) + ((d[o + SNAP_X] as number) - (f[p + SNAP_X] as number)) * alpha;
        out.y[i] = (f[p + SNAP_Y] as number) + ((d[o + SNAP_Y] as number) - (f[p + SNAP_Y] as number)) * alpha;
        out.aim[i] = lerpAngle(f[p + SNAP_AIM] as number, d[o + SNAP_AIM] as number, alpha);
      }
    }
    return true;
  }
}

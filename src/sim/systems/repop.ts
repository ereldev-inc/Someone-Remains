import {
  REPOP_BUILDING_SHARE,
  REPOP_CLUSTER_MAX,
  REPOP_CLUSTER_MIN,
  REPOP_COUNT_RADIUS,
  REPOP_GLOBAL_CAP,
  REPOP_INTERVAL_TICKS,
  REPOP_LOCAL_CAP,
  REPOP_MAX_DIST,
  REPOP_MIN_DIST,
  REPOP_WEIGHTS,
} from '../data/repop';
import { ENEMIES } from '../data/enemies';
import { ZONE_PHASE_EVACUATION } from '../data/zone';
import { next, nextInt, nextRange } from '../rng';
import { difficultyAt, enemyTypeIndex } from '../world/map';
import { overlapsObstacle } from './collision';
import { spawnEnemy, STATE_IDLE } from './enemies';
import type { Sim } from '../sim';

const TAU = Math.PI * 2;
const mult = { hp: 1, dmg: 1 };

/** Types et poids utilisables sur la carte (profil de difficulté). */
function weightsFor(sim: Sim): Array<[number, number]> {
  const allowed = sim.map?.profile.allowedTypes ?? [];
  const out: Array<[number, number]> = [];
  for (const [name, w] of REPOP_WEIGHTS) if (allowed.includes(name)) out.push([enemyTypeIndex(name), w]);
  return out;
}

function pickType(sim: Sim, table: Array<[number, number]>): number {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let roll = next(sim.rng.spawn) * total;
  for (const [type, w] of table) {
    if (roll < w) return type;
    roll -= w;
  }
  return table[0]?.[0] ?? 0;
}

function nearRefuge(sim: Sim, x: number, y: number): boolean {
  for (const r of sim.map?.refuges ?? []) {
    const d = r.radius + 15;
    if ((x - r.x) ** 2 + (y - r.y) ** 2 <= d * d) return true;
  }
  return false;
}

/** Fait revenir des ennemis autour des joueurs dont les environs se sont vidés. Les ennemis éloignés sont recyclés ailleurs. */
export function stepRepop(sim: Sim): void {
  const map = sim.map;
  if (map === null || map.def.kind === 'hub' || sim.liveCount === 0 || sim.tick % REPOP_INTERVAL_TICKS !== 0) return;
  if (sim.zone.phase === ZONE_PHASE_EVACUATION || sim.enemyPool.count >= REPOP_GLOBAL_CAP) return;
  const table = weightsFor(sim);
  if (table.length === 0) return;
  const pl = sim.players;
  const rng = sim.rng.spawn;
  const buildings = map.def.buildings;
  const half = map.half - 3;

  for (let k = 0; k < sim.liveCount; k++) {
    const pi = sim.live[k] as number;
    const px = pl.posX[pi] as number;
    const py = pl.posY[pi] as number;

    let local = 0;
    const ep = sim.enemyPool;
    const e = sim.enemies;
    const r2 = REPOP_COUNT_RADIUS * REPOP_COUNT_RADIUS;
    for (let s = 0; s < ep.highWater; s++) {
      if (ep.alive[s] === 0) continue;
      const dx = (e.posX[s] as number) - px;
      const dy = (e.posY[s] as number) - py;
      if (dx * dx + dy * dy <= r2) local++;
    }
    if (local >= REPOP_LOCAL_CAP) continue;

    // Point d'apparition : un bâtiment à bonne distance, ou un point quelconque de la nature.
    let cx = 0;
    let cy = 0;
    let spread = 0;
    let found = false;
    if (buildings.length > 0 && next(rng) < REPOP_BUILDING_SHARE) {
      const candidates: number[] = [];
      buildings.forEach((b, bi) => {
        const d = Math.hypot(b.x - px, b.y - py);
        if (d >= REPOP_MIN_DIST && d <= REPOP_MAX_DIST) candidates.push(bi);
      });
      if (candidates.length > 0) {
        const b = buildings[candidates[nextInt(rng, candidates.length)] as number]!;
        const side = nextRange(rng, 0, TAU);
        cx = b.x + Math.cos(side) * (b.w / 2 + 4);
        cy = b.y + Math.sin(side) * (b.h / 2 + 4);
        spread = 5;
        found = true;
      }
    }
    let count = nextInt(rng, REPOP_CLUSTER_MAX - REPOP_CLUSTER_MIN + 1) + REPOP_CLUSTER_MIN;
    if (!found) {
      const a = nextRange(rng, 0, TAU);
      const d = nextRange(rng, REPOP_MIN_DIST, REPOP_MAX_DIST);
      cx = px + Math.cos(a) * d;
      cy = py + Math.sin(a) * d;
      spread = 4;
      count = 1 + nextInt(rng, 2);
    }
    if (Math.abs(cx) > half || Math.abs(cy) > half || nearRefuge(sim, cx, cy)) continue;

    for (let n = 0; n < count; n++) {
      const type = pickType(sim, table);
      const def = ENEMIES[type];
      if (def === undefined) continue;
      const a = nextRange(rng, 0, TAU);
      const r = Math.sqrt(next(rng)) * spread;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (Math.hypot(x - px, y - py) < REPOP_MIN_DIST - 6) continue;
      if (Math.abs(x) > half || Math.abs(y) > half || overlapsObstacle(sim.obstacleQuery, x, y, def.radius + 0.3)) continue;
      difficultyAt(map, x, y, mult);
      spawnEnemy(sim, type, x, y, STATE_IDLE, mult.hp, mult.dmg, false);
    }
  }
}

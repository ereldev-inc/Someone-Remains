import { AMBIENT_WEIGHTS } from '../src/sim/data/enemies';
import { entityIndex } from '../src/sim/ecs/pool';
import { createRng, next, nextInt, nextRange } from '../src/sim/rng';
import { addPlayer, createSim, step } from '../src/sim/sim';
import { PROJ_KIND_ENEMY, PROJ_KIND_PLAYER } from '../src/sim/snapshot';
import { spawnProjectileRaw } from '../src/sim/systems/combat';
import { spawnEnemy, STATE_CHASE } from '../src/sim/systems/enemies';
import { BTN_FIRE } from '../src/sim/types';
import type { InputFrame } from '../src/sim/types';

// Banc de charge : 1 500 ennemis (tous types ambiants, en poursuite) et 3 000 projectiles en vol.
// Budget visé : moins de 4 ms par tick en moyenne. Usage : tsx tools/bench-sim.ts [ennemis] [projectiles]
const ENEMIES_TARGET = Number(process.argv[2] ?? 1500);
const PROJECTILES_TARGET = Number(process.argv[3] ?? 3000);
const WARMUP = 120;
const TICKS = 1200;
const BUDGET_MS = 4;

const sim = createSim(7);
sim.config.hordeTarget = 0; // on gère la population nous-mêmes
const id = addPlayer(sim, 0, 0);
sim.players.hp[entityIndex(id)] = 1e12;
const rng = createRng(99);
const total = AMBIENT_WEIGHTS.reduce((s, [, w]) => s + w, 0);
const inputs: InputFrame[] = [];

function pickType(): number {
  let roll = nextInt(rng, total);
  for (const [type, w] of AMBIENT_WEIGHTS) {
    if (roll < w) return type;
    roll -= w;
  }
  return 0;
}

function topUp(): void {
  while (sim.enemyPool.count < ENEMIES_TARGET) {
    const a = nextRange(rng, 0, Math.PI * 2);
    const d = nextRange(rng, 8, 40);
    if (spawnEnemy(sim, pickType(), Math.cos(a) * d, Math.sin(a) * d, STATE_CHASE) < 0) break;
  }
  while (sim.projectilePool.count < PROJECTILES_TARGET) {
    const a = nextRange(rng, 0, Math.PI * 2);
    const kind = next(rng) < 0.5 ? PROJ_KIND_ENEMY : PROJ_KIND_PLAYER;
    if (spawnProjectileRaw(sim, Math.cos(a) * 3, Math.sin(a) * 3, a, 12, 1, 0.2, 90, 0, id, kind) < 0) break;
  }
}

const times: number[] = [];
for (let t = 1; t <= WARMUP + TICKS; t++) {
  topUp();
  inputs[entityIndex(id)] = { tick: t, moveX: Math.sin(t / 80), moveY: Math.cos(t / 80), aimAngle: t * 0.05, buttons: BTN_FIRE };
  const t0 = performance.now();
  step(sim, inputs);
  if (t > WARMUP) times.push(performance.now() - t0);
}

times.sort((a, b) => a - b);
const avg = times.reduce((s, v) => s + v, 0) / times.length;
const p99 = times[Math.floor(times.length * 0.99)] ?? 0;
const max = times[times.length - 1] ?? 0;
console.log(`${sim.enemyPool.count} ennemis · ${sim.projectilePool.count} projectiles · ${TICKS} ticks`);
console.log(`moyenne ${avg.toFixed(3)} ms · p99 ${p99.toFixed(3)} ms · max ${max.toFixed(3)} ms (budget ${BUDGET_MS} ms)`);
if (avg > BUDGET_MS) {
  console.error('BUDGET DÉPASSÉ');
  process.exitCode = 1;
}

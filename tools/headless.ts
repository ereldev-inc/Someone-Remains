import { entityIndex } from '../src/sim/ecs/pool';
import { addPlayer, createSim, hashState, snapshot, step } from '../src/sim/sim';
import { BTN_DASH } from '../src/sim/types';
import type { InputFrame } from '../src/sim/types';

const TICKS = 10_000;
const seed = Number(process.argv[2] ?? 1);

const sim = createSim(seed);
const id = addPlayer(sim, 0, 0);
const inputs: InputFrame[] = [];
let eventCount = 0;

const start = performance.now();
for (let t = 1; t <= TICKS; t++) {
  const phase = Math.floor(t / 45) % 4;
  inputs[entityIndex(id)] = {
    tick: t,
    moveX: [1, 0, -1, 0][phase] ?? 0,
    moveY: [0, 1, 0, -1][phase] ?? 0,
    aimAngle: t * 0.01,
    buttons: t % 150 === 0 ? BTN_DASH : 0,
  };
  eventCount += step(sim, inputs).length;
}
const elapsed = performance.now() - start;

const snap = snapshot(sim);
for (const v of snap.players) {
  if (!Number.isFinite(v)) throw new Error('État non fini après la simulation');
}

console.log(`seed ${seed} · ${TICKS} ticks · ${elapsed.toFixed(1)} ms (${((elapsed / TICKS) * 1000).toFixed(1)} µs/tick)`);
console.log(`position (${snap.players[0]?.toFixed(2)}, ${snap.players[1]?.toFixed(2)}) · ${eventCount} événements`);
console.log(`empreinte ${hashState(sim).toString(16)}`);

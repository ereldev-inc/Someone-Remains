import { entityIndex } from '../src/sim/ecs/pool';
import { addPlayer, createSim, hashState, snapshot, step } from '../src/sim/sim';
import { BTN_DASH, BTN_FIRE } from '../src/sim/types';
import type { InputFrame } from '../src/sim/types';

// Usage : tsx tools/headless.ts [seed] [horde]
// `horde` fixe le nombre d'ennemis visé (sinon densité automatique).
const TICKS = 10_000;
const seed = Number(process.argv[2] ?? 1);
const horde = Number(process.argv[3] ?? -1);

const sim = createSim(seed);
sim.config.hordeTarget = horde;
const id = addPlayer(sim, 0, 0);
const inputs: InputFrame[] = [];
const counts = { events: 0, kills: 0, deaths: 0 };
let worst = 0;

const start = performance.now();
for (let t = 1; t <= TICKS; t++) {
  const phase = Math.floor(t / 45) % 4;
  inputs[entityIndex(id)] = {
    tick: t,
    moveX: [1, 0, -1, 0][phase] ?? 0,
    moveY: [0, 1, 0, -1][phase] ?? 0,
    aimAngle: t * 0.05,
    buttons: BTN_FIRE | (t % 150 === 0 ? BTN_DASH : 0),
  };
  const t0 = performance.now();
  const events = step(sim, inputs);
  worst = Math.max(worst, performance.now() - t0);
  counts.events += events.length;
  for (const e of events) {
    if (e.t === 'kill') counts.kills++;
    else if (e.t === 'playerDied') counts.deaths++;
  }
}
const elapsed = performance.now() - start;

const snap = snapshot(sim);
for (const v of snap.players) {
  if (!Number.isFinite(v)) throw new Error('État non fini après la simulation');
}

console.log(`seed ${seed} · horde ${horde < 0 ? 'auto' : horde} · ${TICKS} ticks`);
console.log(`${elapsed.toFixed(0)} ms au total · ${(elapsed / TICKS).toFixed(3)} ms/tick en moyenne · pire tick ${worst.toFixed(2)} ms`);
console.log(`fin : ${sim.enemyPool.count} ennemis, ${sim.projectilePool.count} projectiles · ${counts.kills} kills · ${counts.deaths} morts`);
console.log(`empreinte ${hashState(sim).toString(16)}`);

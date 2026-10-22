import { advanceClock, createClock } from '../../sim/clock';
import { entityIndex } from '../../sim/ecs/pool';
import { MAPS } from '../../sim/data/maps';
import { addPlayer, createSimFromMap, snapshot, step } from '../../sim/sim';
import { spawnShowcase } from '../../sim/systems/enemies';
import type { Sim } from '../../sim/sim';
import type { EntityId, InputFrame } from '../../sim/types';
import type { FromWorker, ToWorker } from './transport';

interface WorkerScope {
  postMessage(message: FromWorker, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
}
const ctx = self as unknown as WorkerScope;

const PUMP_INTERVAL_MS = 4;

let sim: Sim | null = null;
let playerId: EntityId = -1;
const clock = createClock();
const latest: InputFrame = { tick: 0, moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };
const inputs: InputFrame[] = [latest];
let last = 0;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer);
}

function pump(): void {
  if (sim === null) return;
  const now = performance.now();
  const seconds = (now - last) / 1000;
  last = now;
  if (sim.paused) return;
  const ticks = advanceClock(clock, seconds);
  for (let k = 0; k < ticks; k++) {
    latest.tick = sim.tick + 1;
    const events = step(sim, inputs);
    if (events.length > 0) post({ t: 'events', events: events.slice() });
    const snap = snapshot(sim);
    post({ t: 'snapshot', snap }, [snap.ids.buffer, snap.players.buffer, snap.enemies.buffer, snap.projectiles.buffer]);
  }
}

ctx.onmessage = (e) => {
  const msg = e.data;
  switch (msg.t) {
    case 'init': {
      sim = createSimFromMap(MAPS[msg.mapId] ?? Object.values(MAPS)[0]!, msg.seed);
      sim.config.hordeTarget = msg.horde;
      sim.config.spawnAggro = msg.horde >= 0;
      playerId = addPlayer(sim);
      if (msg.showcase.length > 0) spawnShowcase(sim, msg.showcase, 20);
      inputs.length = 0;
      inputs[entityIndex(playerId)] = latest;
      const o = sim.obstacles;
      post({
        t: 'welcome',
        welcome: {
          playerId,
          seed: msg.seed,
          obstacles: {
            ...o,
            kind: o.kind.slice(),
            x: o.x.slice(),
            y: o.y.slice(),
            a: o.a.slice(),
            b: o.b.slice(),
            ...(o.height ? { height: o.height.slice() } : {}),
            ...(o.style ? { style: o.style.slice() } : {}),
          },
          map: sim.map?.def ?? null,
        },
      });
      last = performance.now();
      setInterval(pump, PUMP_INTERVAL_MS);
      break;
    }
    case 'input':
      latest.moveX = msg.frame.moveX;
      latest.moveY = msg.frame.moveY;
      latest.aimAngle = msg.frame.aimAngle;
      latest.buttons = msg.frame.buttons;
      break;
    case 'pause':
      if (sim !== null) {
        sim.paused = msg.paused;
        clock.accumulator = 0;
        last = performance.now();
      }
      break;
  }
};

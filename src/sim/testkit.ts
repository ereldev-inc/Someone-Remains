import { entityIndex } from './ecs/pool';
import { createSim, queueCommand, step } from './sim';
import { RESPAWN_TICKS } from './data/enemies';
import type { Sim } from './sim';
import type { EntityId, InputFrame, SimEvent } from './types';
import type { Obstacles } from './world/obstacles';

export function emptyObstacles(): Obstacles {
  return {
    count: 0,
    kind: new Uint8Array(0),
    x: new Float32Array(0),
    y: new Float32Array(0),
    a: new Float32Array(0),
    b: new Float32Array(0),
    maxExtent: 0,
  };
}

export function oneObstacle(kind: number, x: number, y: number, a: number, b: number): Obstacles {
  return {
    count: 1,
    kind: Uint8Array.of(kind),
    x: Float32Array.of(x),
    y: Float32Array.of(y),
    a: Float32Array.of(a),
    b: Float32Array.of(b),
    maxExtent: Math.max(a, Math.hypot(a, b)),
  };
}

/** Sim sans apparition automatique d'ennemis, pour des scénarios précis. */
export function quietSim(obstacles: Obstacles = emptyObstacles(), seed = 1): Sim {
  const sim = createSim(seed, obstacles);
  sim.config.hordeTarget = 0;
  return sim;
}

/** Exécute `ticks` ticks avec une entrée constante ; retourne tous les événements émis. */
export function run(sim: Sim, id: EntityId, ticks: number, base: Omit<InputFrame, 'tick'>): SimEvent[] {
  const all: SimEvent[] = [];
  const inputs: InputFrame[] = [];
  for (let t = 0; t < ticks; t++) {
    inputs[entityIndex(id)] = { ...base, tick: sim.tick + 1 };
    for (const e of step(sim, inputs)) all.push(e);
  }
  return all;
}

/** Après une mort : choisit le premier héritage proposé (la réapparition l'attend) puis laisse passer le délai. */
export function respawnAfterChoice(sim: Sim, id: EntityId, extraTicks = 2): SimEvent[] {
  queueCommand(sim, id, { t: 'chooseHeritage', index: 0 });
  return run(sim, id, RESPAWN_TICKS + extraTicks, { moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 });
}

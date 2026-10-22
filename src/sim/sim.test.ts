import { describe, expect, it } from 'vitest';
import { advanceClock, createClock } from './clock';
import { DASH_COOLDOWN_TICKS, DASH_TICKS, PLAYER_RADIUS, PLAYER_SPEED } from './data/player';
import { entityIndex } from './ecs/pool';
import { SNAP_STRIDE } from './snapshot';
import { addPlayer, createSim, hashState, isInvulnerable, removePlayer, snapshot, step } from './sim';
import type { Sim } from './sim';
import { BTN_DASH, DT, TICK_RATE } from './types';
import type { InputFrame } from './types';
import { OBSTACLE_BOX, OBSTACLE_CIRCLE } from './world/obstacles';
import type { Obstacles } from './world/obstacles';

function input(sim: Sim, moveX: number, moveY: number, buttons = 0, aimAngle = 0): InputFrame {
  return { tick: sim.tick + 1, moveX, moveY, aimAngle, buttons };
}

/** Joueur scripté : direction et esquive dépendent uniquement du numéro de tick. */
function scripted(tick: number): InputFrame {
  const phase = Math.floor(tick / 45) % 4;
  const mx = [1, 0, -1, 0][phase] as number;
  const my = [0, 1, 0, -1][phase] as number;
  return { tick, moveX: mx, moveY: my, aimAngle: tick * 0.01, buttons: tick % 150 === 0 ? BTN_DASH : 0 };
}

function run(seed: number, ticks: number): number {
  const sim = createSim(seed);
  const id = addPlayer(sim, 0, 0);
  const inputs = [] as InputFrame[];
  for (let t = 1; t <= ticks; t++) {
    inputs[entityIndex(id)] = scripted(t);
    step(sim, inputs);
  }
  return hashState(sim);
}

function emptyObstacles(): Obstacles {
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

function oneObstacle(kind: number, x: number, y: number, a: number, b: number): Obstacles {
  return {
    count: 1,
    kind: Uint8Array.of(kind),
    x: Float32Array.of(x),
    y: Float32Array.of(y),
    a: Float32Array.of(a),
    b: Float32Array.of(b),
    maxExtent: kind === OBSTACLE_CIRCLE ? a : Math.hypot(a, b),
  };
}

describe('déterminisme', () => {
  it('même graine + mêmes entrées ⇒ même empreinte', () => {
    expect(run(1234, 3000)).toBe(run(1234, 3000));
  });

  it('une graine différente change le monde, donc l\'empreinte', () => {
    expect(run(1, 3000)).not.toBe(run(2, 3000));
  });

  it('ne dépend pas de la fréquence d\'affichage (pas fixe)', () => {
    const hashes = [30, 60, 144].map((hz) => {
      const sim = createSim(9);
      const id = addPlayer(sim);
      const clock = createClock();
      const inputs = [] as InputFrame[];
      let ticks = 0;
      const frames = Math.round(5 * hz);
      for (let f = 0; f < frames; f++) {
        const n = advanceClock(clock, 1 / hz);
        for (let k = 0; k < n && ticks < 5 * TICK_RATE; k++) {
          ticks++;
          inputs[entityIndex(id)] = scripted(sim.tick + 1);
          step(sim, inputs);
        }
      }
      // Complète pour atteindre exactement le même nombre de ticks (tolérance d'arrondi de ±1).
      while (sim.tick < 5 * TICK_RATE) {
        inputs[entityIndex(id)] = scripted(sim.tick + 1);
        step(sim, inputs);
      }
      return hashState(sim);
    });
    expect(hashes[1]).toBe(hashes[0]);
    expect(hashes[1]).toBe(hashes[2]);
  });
});

describe('mouvement', () => {
  it('accélère jusqu\'à la vitesse maximale et normalise les diagonales', () => {
    const sim = createSim(1, emptyObstacles());
    const id = addPlayer(sim);
    const inputs = [] as InputFrame[];
    for (let t = 0; t < 60; t++) {
      inputs[entityIndex(id)] = input(sim, 1, 1);
      step(sim, inputs);
    }
    const snap = snapshot(sim);
    expect(snap.players[6]).toBeCloseTo(PLAYER_SPEED, 3);
  });

  it('ignore les entrées non finies', () => {
    const sim = createSim(1, emptyObstacles());
    const id = addPlayer(sim);
    const inputs = [] as InputFrame[];
    inputs[entityIndex(id)] = input(sim, Number.NaN, Number.POSITIVE_INFINITY);
    step(sim, inputs);
    expect(Number.isFinite(snapshot(sim).players[0])).toBe(true);
  });

  it('supporte plusieurs joueurs indépendants', () => {
    const sim = createSim(1, emptyObstacles());
    const a = addPlayer(sim, 0, 0);
    const b = addPlayer(sim, 50, 0);
    const inputs = [] as InputFrame[];
    for (let t = 0; t < 30; t++) {
      inputs[entityIndex(a)] = input(sim, 1, 0);
      inputs[entityIndex(b)] = input(sim, -1, 0);
      step(sim, inputs);
    }
    const snap = snapshot(sim);
    expect(snap.playerCount).toBe(2);
    expect(snap.players[0]).toBeGreaterThan(0);
    expect(snap.players[SNAP_STRIDE]).toBeLessThan(50);
    expect(removePlayer(sim, a)).toBe(true);
    expect(snapshot(sim).playerCount).toBe(1);
  });
});

describe('collisions', () => {
  it('le joueur ne traverse pas une boîte, même en esquive', () => {
    const sim = createSim(1, oneObstacle(OBSTACLE_BOX, 5, 0, 1, 3));
    const id = addPlayer(sim, 0, 0);
    const inputs = [] as InputFrame[];
    for (let t = 0; t < 240; t++) {
      inputs[entityIndex(id)] = input(sim, 1, 0, t % 130 === 0 ? BTN_DASH : 0);
      step(sim, inputs);
      expect(sim.players.posX[entityIndex(id)] as number).toBeLessThanOrEqual(4 - PLAYER_RADIUS + 1e-6);
    }
  });

  it('le joueur ne traverse pas un cylindre et glisse le long de la paroi', () => {
    const sim = createSim(1, oneObstacle(OBSTACLE_CIRCLE, 5, 0.3, 1.5, 1.5));
    const id = addPlayer(sim, 0, 0);
    const inputs = [] as InputFrame[];
    for (let t = 0; t < 240; t++) {
      inputs[entityIndex(id)] = input(sim, 1, 0);
      step(sim, inputs);
      const i = entityIndex(id);
      const d = Math.hypot((sim.players.posX[i] as number) - 5, (sim.players.posY[i] as number) - 0.3);
      expect(d).toBeGreaterThanOrEqual(1.5 + PLAYER_RADIUS - 1e-6);
    }
    // Le cylindre est légèrement décalé : le joueur doit avoir contourné par glissement.
    expect(sim.players.posX[entityIndex(id)] as number).toBeGreaterThan(5);
  });

  it('aucun obstacle de démonstration dans la zone de réapparition', () => {
    const sim = createSim(77);
    const o = sim.obstacles;
    for (let i = 0; i < o.count; i++) {
      expect(Math.hypot(o.x[i] as number, o.y[i] as number) - o.maxExtent).toBeGreaterThan(PLAYER_RADIUS);
    }
  });
});

describe('esquive', () => {
  it('rend invulnérable pendant la durée prévue puis recharge', () => {
    const sim = createSim(1, emptyObstacles());
    const id = addPlayer(sim);
    const inputs = [] as InputFrame[];
    inputs[entityIndex(id)] = input(sim, 1, 0, BTN_DASH);
    const events = step(sim, inputs);
    expect(events.some((e) => e.t === 'dash')).toBe(true);
    expect(isInvulnerable(sim, id)).toBe(true);

    for (let t = 1; t < DASH_TICKS; t++) {
      inputs[entityIndex(id)] = input(sim, 1, 0, 0);
      step(sim, inputs);
    }
    expect(isInvulnerable(sim, id)).toBe(false);

    // Pendant la recharge, un nouvel appui est ignoré.
    inputs[entityIndex(id)] = input(sim, 1, 0, BTN_DASH);
    expect(step(sim, inputs).some((e) => e.t === 'dash')).toBe(false);

    for (let t = 0; t < DASH_COOLDOWN_TICKS; t++) {
      inputs[entityIndex(id)] = input(sim, 1, 0, 0);
      step(sim, inputs);
    }
    inputs[entityIndex(id)] = input(sim, 1, 0, BTN_DASH);
    expect(step(sim, inputs).some((e) => e.t === 'dash')).toBe(true);
  });

  it('parcourt la distance attendue', () => {
    const sim = createSim(1, emptyObstacles());
    const id = addPlayer(sim);
    const inputs = [] as InputFrame[];
    inputs[entityIndex(id)] = input(sim, 0, 1, BTN_DASH);
    for (let t = 0; t < DASH_TICKS; t++) {
      step(sim, inputs);
      inputs[entityIndex(id)] = input(sim, 0, 1, 0);
    }
    expect(sim.players.posY[entityIndex(id)] as number).toBeCloseTo(DASH_TICKS * 22 * DT, 1);
  });
});

describe('événements et pause', () => {
  it('émet spawn au premier tick', () => {
    const sim = createSim(1, emptyObstacles());
    const id = addPlayer(sim, 3, 4);
    const events = step(sim, []);
    expect(events).toEqual([{ t: 'spawn', id, x: 3, y: 4 }]);
    expect(step(sim, [])).toEqual([]);
  });

  it('ne progresse pas en pause', () => {
    const sim = createSim(1, emptyObstacles());
    addPlayer(sim);
    sim.paused = true;
    step(sim, []);
    expect(sim.tick).toBe(0);
    sim.paused = false;
    step(sim, []);
    expect(sim.tick).toBe(1);
  });
});

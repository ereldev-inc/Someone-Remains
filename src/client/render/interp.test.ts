import { describe, expect, it } from 'vitest';
import { addPlayer, createSim, snapshot, step } from '../../sim/sim';
import { emptyObstacles } from '../../sim/testkit';
import { createInterpState, SnapshotBuffer } from './interp';

function fill(buffer: SnapshotBuffer, ticks: number, startMs: number): number {
  const sim = createSim(1, emptyObstacles());
  const id = addPlayer(sim, 0, 0);
  void id;
  let t = startMs;
  for (let k = 0; k < ticks; k++) {
    step(sim, []);
    t += 1000 / 60;
    buffer.push(snapshot(sim), t);
  }
  return t;
}

describe('SnapshotBuffer', () => {
  it('interpole des valeurs finies en régime normal', () => {
    const buffer = new SnapshotBuffer();
    const state = createInterpState();
    const t = fill(buffer, 10, 1000);
    expect(buffer.sample(t + 5, state)).toBe(true);
    expect(Number.isFinite(state.x[0])).toBe(true);
    expect(state.count).toBe(1);
  });

  it('reste fini juste après une pause (onglet masqué puis de retour), avant tout nouvel état', () => {
    const buffer = new SnapshotBuffer();
    const state = createInterpState();
    const t = fill(buffer, 10, 1000);
    // Onglet masqué 30 s : l'horloge est recalée, aucun nouveau snapshot n'est encore arrivé.
    buffer.resync();
    for (const now of [t + 30000, t + 30016, t + 30032]) {
      expect(buffer.sample(now, state)).toBe(true);
      expect(Number.isFinite(state.x[0])).toBe(true);
      expect(Number.isFinite(state.y[0])).toBe(true);
      expect(Number.isFinite(state.aim[0])).toBe(true);
    }
  });

  it('reprend normalement quand les nouveaux états arrivent après la pause', () => {
    const buffer = new SnapshotBuffer();
    const state = createInterpState();
    const t = fill(buffer, 10, 1000);
    buffer.resync();
    const t2 = fill(buffer, 10, t + 30000);
    expect(buffer.sample(t2 + 2, state)).toBe(true);
    expect(Number.isFinite(state.x[0])).toBe(true);
  });
});

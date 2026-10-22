import { describe, expect, it } from 'vitest';
import { advanceClock, createClock } from './clock';
import { TICK_RATE } from './types';

function ticksOver(seconds: number, hz: number): number {
  const clock = createClock();
  const frames = Math.round(seconds * hz);
  let total = 0;
  for (let i = 0; i < frames; i++) total += advanceClock(clock, 1 / hz);
  return total;
}

describe('StepClock', () => {
  it('produit le même nombre de ticks à 30, 60 et 144 Hz d\'affichage', () => {
    const expected = 10 * TICK_RATE;
    for (const hz of [30, 60, 144]) {
      expect(Math.abs(ticksOver(10, hz) - expected)).toBeLessThanOrEqual(1);
    }
  });

  it('plafonne le rattrapage après un gel', () => {
    const clock = createClock(8);
    expect(advanceClock(clock, 5)).toBe(8);
  });
});

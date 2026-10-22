import { DT } from './types';

/** Accumulateur à pas fixe : transforme un temps réel écoulé en nombre de ticks à exécuter. */
export interface StepClock {
  accumulator: number;
  maxCatchUp: number;
}

export function createClock(maxCatchUp = 8): StepClock {
  return { accumulator: 0, maxCatchUp };
}

/** `seconds` : temps réel écoulé depuis le dernier appel. Retourne le nombre de ticks à exécuter. */
export function advanceClock(clock: StepClock, seconds: number): number {
  clock.accumulator += seconds;
  const cap = DT * clock.maxCatchUp;
  if (clock.accumulator > cap) clock.accumulator = cap;
  const ticks = Math.floor(clock.accumulator / DT + 1e-9);
  clock.accumulator -= ticks * DT;
  if (clock.accumulator < 0) clock.accumulator = 0;
  return ticks;
}

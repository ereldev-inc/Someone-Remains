import { TICK_RATE } from '../types';

export const PLAYER_RADIUS = 0.4;
export const PLAYER_MAX_HP = 100;
/** m/s */
export const PLAYER_SPEED = 7;
/** m/s² */
export const PLAYER_ACCEL = 70;

/** m/s */
export const DASH_SPEED = 22;
export const DASH_TICKS = Math.round(0.18 * TICK_RATE);
/** Recharge comptée depuis le début de l'esquive. */
export const DASH_COOLDOWN_TICKS = Math.round(2 * TICK_RATE);

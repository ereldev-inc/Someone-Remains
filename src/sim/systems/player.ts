import { entityIndex } from '../ecs/pool';
import {
  DASH_COOLDOWN_TICKS,
  DASH_SPEED,
  DASH_TICKS,
  PLAYER_ACCEL,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  PLAYER_SPEED,
} from '../data/player';
import { NOISE_DECAY, PLAYER_HURT_TICKS, RESPAWN_CLEAR_RADIUS, RESPAWN_PROTECTION_TICKS, RESPAWN_TICKS } from '../data/enemies';
import { BTN_DASH, BTN_FIRE, DT, TICK_RATE } from '../types';
import type { EntityId, InputFrame } from '../types';
import type { Sim } from '../sim';
import { pushOutOfObstacles } from './collision';
import { fireWeapon } from './combat';
import { clearEnemiesNear } from './enemies';


/** Inflige des dégâts à un joueur (index i). Retourne false, sans effet, s'il est invulnérable ou mort. */
export function damagePlayer(sim: Sim, i: number, dmg: number): boolean {
  const p = sim.players;
  if (p.dead[i] === 1 || (p.dashTicks[i] as number) > 0 || (p.hurtTicks[i] as number) > 0) return false;
  const id = (((sim.playerPool.generations[i] as number) << 16) | i) as EntityId;
  p.hp[i] = (p.hp[i] as number) - dmg;
  p.hurtTicks[i] = PLAYER_HURT_TICKS;
  sim.events.push({ t: 'hit', targetId: id, dmg });
  if ((p.hp[i] as number) <= 0) {
    p.hp[i] = 0;
    p.dead[i] = 1;
    p.deadTicks[i] = RESPAWN_TICKS;
    p.velX[i] = 0;
    p.velY[i] = 0;
    p.dashTicks[i] = 0;
    p.noise[i] = 0;
    sim.events.push({
      t: 'playerDied',
      id,
      kills: p.lifeKills[i] as number,
      lifeSeconds: (p.lifeTicks[i] as number) / TICK_RATE,
    });
  }
  return true;
}

function respawn(sim: Sim, i: number): void {
  const p = sim.players;
  p.dead[i] = 0;
  p.deadTicks[i] = 0;
  p.hp[i] = PLAYER_MAX_HP;
  p.posX[i] = 0;
  p.posY[i] = 0;
  p.velX[i] = 0;
  p.velY[i] = 0;
  p.dashTicks[i] = 0;
  p.dashCooldown[i] = 0;
  p.hurtTicks[i] = RESPAWN_PROTECTION_TICKS;
  p.fireCooldown[i] = 0;
  p.lifeTicks[i] = 0;
  p.lifeKills[i] = 0;
  p.noise[i] = 0;
  // En attendant le refuge de la carte (M5) : le point de réapparition est dégagé.
  clearEnemiesNear(sim, 0, 0, RESPAWN_CLEAR_RADIUS);
  const id = (((sim.playerPool.generations[i] as number) << 16) | i) as EntityId;
  sim.events.push({ t: 'spawn', id, x: 0, y: 0 });
}

export function stepPlayer(sim: Sim, id: EntityId, input: InputFrame | undefined): void {
  const i = entityIndex(id);
  const p = sim.players;

  if (p.spawnPending[i] === 1) {
    p.spawnPending[i] = 0;
    sim.events.push({ t: 'spawn', id, x: p.posX[i] as number, y: p.posY[i] as number });
  }

  let mx = input !== undefined && Number.isFinite(input.moveX) ? input.moveX : 0;
  let my = input !== undefined && Number.isFinite(input.moveY) ? input.moveY : 0;
  const mlen = Math.hypot(mx, my);
  if (mlen > 1) {
    mx /= mlen;
    my /= mlen;
  }
  const buttons = input !== undefined ? input.buttons | 0 : 0;
  if (input !== undefined && Number.isFinite(input.aimAngle)) p.aim[i] = input.aimAngle;

  if (p.dead[i] === 1) {
    p.deadTicks[i] = (p.deadTicks[i] as number) - 1;
    if (p.deadTicks[i] === 0) respawn(sim, i);
    p.prevButtons[i] = buttons;
    return;
  }

  p.lifeTicks[i] = (p.lifeTicks[i] as number) + 1;
  if ((p.noise[i] as number) > 0) p.noise[i] = Math.max(0, (p.noise[i] as number) - NOISE_DECAY * DT);
  if ((p.hurtTicks[i] as number) > 0) p.hurtTicks[i] = (p.hurtTicks[i] as number) - 1;
  if ((p.dashCooldown[i] as number) > 0) p.dashCooldown[i] = (p.dashCooldown[i] as number) - 1;
  if ((p.fireCooldown[i] as number) > 0) p.fireCooldown[i] = (p.fireCooldown[i] as number) - 1;

  const dashPressed = (buttons & BTN_DASH) !== 0 && ((p.prevButtons[i] as number) & BTN_DASH) === 0;
  if (dashPressed && p.dashTicks[i] === 0 && p.dashCooldown[i] === 0) {
    let dx = mx;
    let dy = my;
    if (Math.hypot(dx, dy) < 0.01) {
      dx = Math.cos(p.aim[i] as number);
      dy = Math.sin(p.aim[i] as number);
    } else {
      const l = Math.hypot(dx, dy);
      dx /= l;
      dy /= l;
    }
    p.dashDirX[i] = dx;
    p.dashDirY[i] = dy;
    p.dashTicks[i] = DASH_TICKS;
    p.dashCooldown[i] = DASH_COOLDOWN_TICKS;
    sim.events.push({ t: 'dash', id, x: p.posX[i] as number, y: p.posY[i] as number });
  }

  let dashEnded = false;
  if ((p.dashTicks[i] as number) > 0) {
    p.velX[i] = (p.dashDirX[i] as number) * DASH_SPEED;
    p.velY[i] = (p.dashDirY[i] as number) * DASH_SPEED;
    p.dashTicks[i] = (p.dashTicks[i] as number) - 1;
    dashEnded = p.dashTicks[i] === 0;
  } else {
    const tx = mx * PLAYER_SPEED;
    const ty = my * PLAYER_SPEED;
    const dvx = tx - (p.velX[i] as number);
    const dvy = ty - (p.velY[i] as number);
    const dv = Math.hypot(dvx, dvy);
    const maxStep = PLAYER_ACCEL * DT;
    if (dv <= maxStep) {
      p.velX[i] = tx;
      p.velY[i] = ty;
    } else {
      p.velX[i] = (p.velX[i] as number) + (dvx / dv) * maxStep;
      p.velY[i] = (p.velY[i] as number) + (dvy / dv) * maxStep;
    }
  }

  const pos = sim.tmp;
  pos.x = (p.posX[i] as number) + (p.velX[i] as number) * DT;
  pos.y = (p.posY[i] as number) + (p.velY[i] as number) * DT;
  pushOutOfObstacles(sim.obstacleQuery, pos, PLAYER_RADIUS);
  p.posX[i] = pos.x;
  p.posY[i] = pos.y;
  if (dashEnded) {
    // Fin d'esquive : on retombe à la vitesse de course sans glissade.
    p.velX[i] = (p.dashDirX[i] as number) * PLAYER_SPEED;
    p.velY[i] = (p.dashDirY[i] as number) * PLAYER_SPEED;
  }

  if ((buttons & BTN_FIRE) !== 0 && p.fireCooldown[i] === 0) fireWeapon(sim, id, i);

  p.prevButtons[i] = buttons;
}

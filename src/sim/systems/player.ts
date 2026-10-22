import { entityIndex } from '../ecs/pool';
import {
  DASH_COOLDOWN_TICKS,
  DASH_SPEED,
  DASH_TICKS,
  PLAYER_ACCEL,
  PLAYER_RADIUS,
  PLAYER_SPEED,
} from '../data/player';
import { NOISE_DECAY, PLAYER_HURT_TICKS, RESPAWN_CLEAR_RADIUS, RESPAWN_PROTECTION_TICKS, RESPAWN_TICKS } from '../data/enemies';
import { BTN_DASH, BTN_FIRE, BTN_HEAL, BTN_MELEE, BTN_RELOAD, DT, TICK_RATE } from '../types';
import { BANDAGE_CHANNEL_TICKS, BANDAGE_HEAL, HEAL_COOLDOWN_TICKS, ITEM_BANDAGE, ITEM_TROUSSE, TROUSSE_CHANNEL_TICKS, TROUSSE_HEAL } from '../data/items';
import { bagCount, bagClear, bagRemove, giveStartKit } from './inventory';
import { stepInteraction } from './loot';
import { maxHpOf, onPlayerDeath, statBonus } from './progression';
import { cancelReload, loadMagazineInstant, MOVING_SPEED, startReload, stepReload } from './reload';
import { WEAPONS } from '../data/weapons';
import type { EntityId, InputFrame } from '../types';
import type { Sim } from '../sim';
import { pushOutOfObstacles } from './collision';
import { fireWeapon, meleeStrike } from './combat';
import { clearEnemiesNear } from './enemies';


/** Inflige des dégâts à un joueur (index i). Retourne false, sans effet, s'il est invulnérable ou mort. */
export function damagePlayer(sim: Sim, i: number, dmg: number): boolean {
  const p = sim.players;
  if (p.dead[i] === 1 || p.inRefuge[i] === 1 || (p.dashTicks[i] as number) > 0 || (p.hurtTicks[i] as number) > 0) return false;
  const id = (((sim.playerPool.generations[i] as number) << 16) | i) as EntityId;
  p.hp[i] = (p.hp[i] as number) - dmg;
  p.hurtTicks[i] = PLAYER_HURT_TICKS;
  cancelHeal(sim, i); // être touché interrompt le soin
  sim.events.push({ t: 'hit', targetId: id, dmg });
  if ((p.hp[i] as number) <= 0) {
    p.hp[i] = 0;
    p.dead[i] = 1;
    p.deadTicks[i] = RESPAWN_TICKS;
    p.velX[i] = 0;
    p.velY[i] = 0;
    p.dashTicks[i] = 0;
    p.noise[i] = 0;
    p.openProgress[i] = 0;
    cancelHeal(sim, i);
    cancelReload(sim, i);
    // Mort : le contenu du sac est perdu ; la Rémanence est créditée et un héritage est proposé.
    bagClear(sim, i);
    onPlayerDeath(sim, i);
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
  p.hp[i] = maxHpOf(sim, i);
  const rx = sim.map?.respawnX ?? 0;
  const ry = sim.map?.respawnY ?? 0;
  p.posX[i] = rx;
  p.posY[i] = ry;
  p.velX[i] = 0;
  p.velY[i] = 0;
  p.dashTicks[i] = 0;
  p.dashCooldown[i] = 0;
  p.hurtTicks[i] = RESPAWN_PROTECTION_TICKS;
  p.fireCooldown[i] = 0;
  p.lifeTicks[i] = 0;
  p.lifeKills[i] = 0;
  p.noise[i] = 0;
  giveStartKit(sim, i);
  p.mag.fill(0, i * WEAPONS.length, (i + 1) * WEAPONS.length);
  loadMagazineInstant(sim, i, p.weapon[i] as number);
  // Monde de test (sans refuge) : le point de réapparition est dégagé. Avec une carte, le refuge protège.
  if (sim.map === null) clearEnemiesNear(sim, rx, ry, RESPAWN_CLEAR_RADIUS);
  const id = (((sim.playerPool.generations[i] as number) << 16) | i) as EntityId;
  sim.events.push({ t: 'spawn', id, x: rx, y: ry });
}

export function cancelHeal(sim: Sim, i: number): void {
  sim.players.healItem[i] = -1;
  sim.players.healProgress[i] = 0;
}

/** Fraction (0..1) du soin en cours. */
export function healFraction(item: number, progress: number): number {
  if (item < 0) return 0;
  return Math.min(1, progress / (item === ITEM_TROUSSE ? TROUSSE_CHANNEL_TICKS : BANDAGE_CHANNEL_TICKS));
}

/** Commence un soin : bandage, ou trousse si les dégâts sont importants. Il faudra rester immobile jusqu'au bout. */
function startHeal(sim: Sim, i: number): void {
  const p = sim.players;
  if ((p.healItem[i] as number) >= 0) {
    cancelHeal(sim, i); // un second appui annule
    return;
  }
  const missing = maxHpOf(sim, i) - (p.hp[i] as number);
  if (missing <= 0) return;
  let item = -1;
  if (missing >= TROUSSE_HEAL * 0.7 && bagCount(sim, i, ITEM_TROUSSE) > 0) item = ITEM_TROUSSE;
  else if (bagCount(sim, i, ITEM_BANDAGE) > 0) item = ITEM_BANDAGE;
  else if (bagCount(sim, i, ITEM_TROUSSE) > 0) item = ITEM_TROUSSE;
  if (item < 0) return;
  p.healItem[i] = item;
  p.healProgress[i] = 0;
}

/** Avance le soin ; le termine (consomme l'objet, rend les PV) ou l'interrompt si le joueur bouge, tire, frappe ou esquive. */
function stepHeal(sim: Sim, id: EntityId, i: number, interrupted: boolean): void {
  const p = sim.players;
  const item = p.healItem[i] as number;
  if (item < 0) return;
  if (interrupted) {
    cancelHeal(sim, i);
    return;
  }
  p.healProgress[i] = (p.healProgress[i] as number) + 1;
  if ((p.healProgress[i] as number) < (item === ITEM_TROUSSE ? TROUSSE_CHANNEL_TICKS : BANDAGE_CHANNEL_TICKS)) return;
  const amount = item === ITEM_TROUSSE ? TROUSSE_HEAL : BANDAGE_HEAL;
  if (bagRemove(sim, i, item, 1)) {
    p.hp[i] = Math.min(maxHpOf(sim, i), (p.hp[i] as number) + amount);
    p.healCooldown[i] = HEAL_COOLDOWN_TICKS;
    sim.events.push({ t: 'heal', id, amount });
  }
  cancelHeal(sim, i);
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
    // La réapparition attend le choix de l'héritage.
    if ((p.deadTicks[i] as number) > 0) p.deadTicks[i] = (p.deadTicks[i] as number) - 1;
    if (p.deadTicks[i] === 0 && p.heritagePending[i] === 0) respawn(sim, i);
    p.prevButtons[i] = buttons;
    return;
  }

  p.lifeTicks[i] = (p.lifeTicks[i] as number) + 1;
  if ((p.noise[i] as number) > 0) p.noise[i] = Math.max(0, (p.noise[i] as number) - NOISE_DECAY * DT);
  if ((p.hurtTicks[i] as number) > 0) p.hurtTicks[i] = (p.hurtTicks[i] as number) - 1;
  if ((p.dashCooldown[i] as number) > 0) p.dashCooldown[i] = (p.dashCooldown[i] as number) - 1;
  if ((p.fireCooldown[i] as number) > 0) p.fireCooldown[i] = (p.fireCooldown[i] as number) - 1;
  if ((p.meleeCooldown[i] as number) > 0) p.meleeCooldown[i] = (p.meleeCooldown[i] as number) - 1;
  if ((p.healCooldown[i] as number) > 0) p.healCooldown[i] = (p.healCooldown[i] as number) - 1;

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
    p.dashCooldown[i] = Math.round(DASH_COOLDOWN_TICKS * (1 - statBonus(sim, i, 'dashCd')));
    sim.events.push({ t: 'dash', id, x: p.posX[i] as number, y: p.posY[i] as number });
  }

  let dashEnded = false;
  if ((p.dashTicks[i] as number) > 0) {
    p.velX[i] = (p.dashDirX[i] as number) * DASH_SPEED;
    p.velY[i] = (p.dashDirY[i] as number) * DASH_SPEED;
    p.dashTicks[i] = (p.dashTicks[i] as number) - 1;
    dashEnded = p.dashTicks[i] === 0;
  } else {
    const speed = PLAYER_SPEED * (1 + statBonus(sim, i, 'moveSpeed'));
    const tx = mx * speed;
    const ty = my * speed;
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
  if (sim.map !== null) {
    const lim = sim.map.half - PLAYER_RADIUS;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.y = Math.max(-lim, Math.min(lim, pos.y));
  }
  p.posX[i] = pos.x;
  p.posY[i] = pos.y;
  if (dashEnded) {
    // Fin d'esquive : on retombe à la vitesse de course sans glissade.
    p.velX[i] = (p.dashDirX[i] as number) * PLAYER_SPEED * (1 + statBonus(sim, i, 'moveSpeed'));
    p.velY[i] = (p.dashDirY[i] as number) * PLAYER_SPEED * (1 + statBonus(sim, i, 'moveSpeed'));
  }

  if ((buttons & BTN_FIRE) !== 0) {
    if (p.fireCooldown[i] === 0) fireWeapon(sim, id, i);
    else if ((p.reloadWeapon[i] as number) < 0) {
      // Chargeur vide pendant le délai entre deux tirs : le rechargement part sans attendre.
      const w = p.weapon[i] as number;
      const def = WEAPONS[w];
      if (def !== undefined && def.ammoItem >= 0 && (p.mag[i * WEAPONS.length + w] as number) < def.ammoPerShot) startReload(sim, i);
    }
  }
  if ((buttons & BTN_MELEE) !== 0 && p.meleeCooldown[i] === 0) meleeStrike(sim, id, i);
  if ((buttons & BTN_HEAL) !== 0 && ((p.prevButtons[i] as number) & BTN_HEAL) === 0 && p.healCooldown[i] === 0) startHeal(sim, i);
  if ((buttons & BTN_RELOAD) !== 0 && ((p.prevButtons[i] as number) & BTN_RELOAD) === 0) startReload(sim, i);
  const speedNow = Math.hypot(p.velX[i] as number, p.velY[i] as number);
  const moving = speedNow > MOVING_SPEED || (p.dashTicks[i] as number) > 0 || dashEnded;
  stepReload(sim, i, moving);
  stepHeal(sim, id, i, moving || mlen > 0.1 || (buttons & (BTN_FIRE | BTN_MELEE | BTN_DASH)) !== 0);
  stepInteraction(sim, i, buttons);

  p.prevButtons[i] = buttons;
}

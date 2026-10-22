import { advanceClock, createClock } from '../../sim/clock';
import { entityIndex } from '../../sim/ecs/pool';
import { HUB_MAP_ID } from '../../sim/data/zone';
import { giveDebugKit } from '../../sim/systems/crafting';
import { giveStartKit } from '../../sim/systems/inventory';

import { createSession, saveProfile, travel } from '../../sim/session';
import type { Session } from '../../sim/session';
import { queueCommand, snapshot, step } from '../../sim/sim';
import { addXp } from '../../sim/systems/progression';
import { spawnShowcase } from '../../sim/systems/enemies';
import { TICK_RATE } from '../../sim/types';
import type { InputFrame } from '../../sim/types';
import type { FromWorker, ToWorker } from './transport';

interface WorkerScope {
  postMessage(message: FromWorker, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
}
const ctx = self as unknown as WorkerScope;

const PUMP_INTERVAL_MS = 4;

/** Le monde courant du joueur (bunker ou expédition) ; remplacé à chaque voyage. */
let session: Session | null = null;
const clock = createClock();
const latest: InputFrame = { tick: 0, moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };
const inputs: InputFrame[] = [latest];
let last = 0;
let paused = false;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer);
}

/** Annonce le monde courant au client (carte, obstacles, identifiant du joueur). */
function postWelcome(s: Session, seed: number): void {
  const o = s.sim.obstacles;
  inputs.length = 0;
  inputs[entityIndex(s.id)] = latest;
  post({
    t: 'welcome',
    welcome: {
      playerId: s.id,
      seed,
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
      map: s.sim.map?.def ?? null,
    },
  });
}

/** Voyage demandé par la sim (départ, extraction ou mort) : nouveau monde, profil sauvegardé au passage. */
function changeWorld(to: string): void {
  if (session === null) return;
  const next = travel(session, to);
  session = next;
  next.sim.paused = paused;
  clock.accumulator = 0;
  postWelcome(next, next.sim.seed);
  // Le profil à jour est sauvegardé : butin déposé, plans, Rémanence…
  post({ t: 'profile', profile: saveProfile(next) });
}

function pump(): void {
  if (session === null) return;
  const now = performance.now();
  const seconds = (now - last) / 1000;
  last = now;
  if (paused) return;
  const ticks = advanceClock(clock, seconds);
  for (let k = 0; k < ticks; k++) {
    const { sim, id } = session;
    latest.tick = sim.tick + 1;
    const events = step(sim, inputs);
    if (events.length > 0) post({ t: 'events', events: events.slice() });
    const snap = snapshot(sim);
    post({ t: 'snapshot', snap }, [snap.ids.buffer, snap.players.buffer, snap.enemies.buffer, snap.projectiles.buffer]);
    const trip = events.find((e) => e.t === 'travel' && e.id === id);
    if (trip !== undefined && trip.t === 'travel') {
      changeWorld(trip.to);
      return;
    }
  }
}

ctx.onmessage = (e) => {
  const msg = e.data;
  switch (msg.t) {
    case 'init': {
      session = createSession(msg.profile, msg.seed, msg.mapId);
      const { sim, id } = session;
      sim.config.hordeTarget = msg.horde;
      sim.config.spawnAggro = msg.horde >= 0;
      if (msg.zone >= 0) {
        sim.config.zoneSeconds = msg.zone;
        sim.zone.ticks = Math.round(msg.zone * TICK_RATE);
      }
      if (msg.at.length === 2) {
        sim.players.posX[entityIndex(id)] = msg.at[0] as number;
        sim.players.posY[entityIndex(id)] = msg.at[1] as number;
      }
      // Démarrage direct sur une carte d'expédition (debug) : le kit de départ est déjà dans le sac.
      if (msg.mapId !== HUB_MAP_ID) giveStartKit(sim, entityIndex(id));
      if (msg.kit) giveDebugKit(sim, id);
      if (msg.xp > 0) addXp(sim, entityIndex(id), msg.xp);
      if (msg.showcase.length > 0) spawnShowcase(sim, msg.showcase, 20);
      postWelcome(session, msg.seed);
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
    case 'saveRequest':
      if (session !== null) post({ t: 'profile', profile: saveProfile(session) });
      break;
    case 'command':
      if (session !== null) queueCommand(session.sim, session.id, msg.cmd);
      break;
    case 'pause':
      paused = msg.paused;
      if (session !== null) session.sim.paused = msg.paused;
      clock.accumulator = 0;
      last = performance.now();
      break;
  }
};

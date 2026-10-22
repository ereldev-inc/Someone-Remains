import { InputController } from './input/input';
import { LocalTransport } from './net/LocalTransport';
import { GameScene } from './render/scene';
import { CrowdRenderer } from './render/crowd';
import { PlayerViews } from './render/players';
import { createInterpState, SnapshotBuffer } from './render/interp';
import { Effects } from './render/effects';
import { Hud } from './ui/hud';
import { ENEMIES } from '../sim/data/enemies';
import { FLAG_DEAD } from '../sim/snapshot';
import type { InputFrame } from '../sim/types';

const WORLD_SEED = 20240601;
const LOT_LABEL = 'Lot 4 · M4';

const container = document.getElementById('game');
if (container === null) throw new Error('#game introuvable');

// ?horde=500 force le nombre d'ennemis (test de charge) ; sinon densité automatique.
const hordeParam = Number(new URLSearchParams(window.location.search).get('horde'));
const horde = Number.isFinite(hordeParam) && hordeParam > 0 ? Math.floor(hordeParam) : -1;

// ?spawn=colosse,souche (ou all) place ces ennemis près du départ, pour les voir sans les chercher.
const spawnParam = new URLSearchParams(window.location.search).get('spawn');
const showcase: number[] =
  spawnParam === null
    ? []
    : spawnParam === 'all'
      ? ENEMIES.map((_, i) => i)
      : spawnParam
          .split(',')
          .map((name) => ENEMIES.findIndex((d) => d.name === name.trim()))
          .filter((i) => i >= 0);

const hud = new Hud();
let totalKills = 0;
hud.setKills(totalKills);

const gameScene = new GameScene(container);
const input = new InputController(gameScene.renderer.domElement);


const transport = new LocalTransport(WORLD_SEED, horde, showcase);
const buffer = new SnapshotBuffer();
const state = createInterpState();
let localId = -1;

const players = new PlayerViews(gameScene.scene, () => localId);
input.onToggleDebug = () => {
  hud.toggleDebug();
  players.showSightRing = !players.showSightRing;
};
const crowd = new CrowdRenderer(gameScene.scene);
const effects = new Effects(gameScene.scene);
const frame: InputFrame = { tick: 0, moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };

transport.onWelcome((w) => {
  localId = w.playerId;
  gameScene.setObstacles(w.obstacles);
});
transport.onSnapshot((snap) => buffer.push(snap, performance.now()));
transport.onEvents((events) => {
  const now = performance.now();
  let weight = 0;
  for (const e of events) {
    // Chaque 'kill' compte une fois, pondéré par le type (compteur local ; service dédié au jalon M11).
    if (e.t === 'kill') weight += ENEMIES[e.enemyType]?.killWeight ?? 1;
    else if (e.t === 'explosion') effects.explosion(e.x, e.y, e.radius, now);
    else if (e.t === 'scream') effects.scream(e.x, e.y, e.radius, now);
  }
  if (weight > 0) {
    totalKills += weight;
    hud.setKills(totalKills);
  }
});

document.addEventListener('visibilitychange', () => {
  const hidden = document.hidden;
  transport.setPaused(hidden);
  if (!hidden) buffer.resync();
});

let lastNow = performance.now();
let fps = 0;
let lastDebug = 0;
let jsMs = 0;

function loop(now: number): void {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastNow) / 1000, 0.1);
  lastNow = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.05;

  const jsStart = performance.now();
  if (!buffer.sample(now, state)) return;

  let local = -1;
  for (let i = 0; i < state.count; i++) {
    if (state.ids[i] === localId) {
      local = i;
      break;
    }
  }
  if (local >= 0) {
    const px = state.x[local] as number;
    const py = state.y[local] as number;
    const dead = ((state.flags[local] as number) & FLAG_DEAD) !== 0;
    gameScene.follow(px, py, dt);
    frame.moveX = dead ? 0 : input.moveX;
    frame.moveY = dead ? 0 : input.moveY;
    frame.buttons = dead ? 0 : input.buttons;
    frame.aimAngle = gameScene.aimAngle(input.mouseNdcX, input.mouseNdcY, px, py);
    transport.sendInput(frame);
    hud.setPlayer(state.hp[local] as number, state.dashCd[local] as number, state.lifeKills[local] as number, dead, state.respawn[local] as number);

    if (now - lastDebug > 250) {
      lastDebug = now;
      hud.setDebug(
        `${LOT_LABEL}\n${fps.toFixed(0)} fps · tick ${buffer.latestTick}\n` +
          `pos ${px.toFixed(1)}, ${py.toFixed(1)} · vitesse ${(state.speed[local] as number).toFixed(1)} m/s\n` +
          `ennemis ${crowd.enemyCount} (${crowd.alertCount} alertés) · projectiles ${crowd.projectileCount} · js ${jsMs.toFixed(1)} ms`,
      );
    }
  }
  players.update(state, now);
  crowd.update(state, now);
  effects.update(now);
  hud.setBoss(crowd.bossFraction);
  jsMs += (performance.now() - jsStart - jsMs) * 0.1;
  gameScene.render();
}
requestAnimationFrame(loop);

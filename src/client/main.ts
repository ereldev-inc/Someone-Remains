import { InputController } from './input/input';
import { LocalTransport } from './net/LocalTransport';
import { GameScene } from './render/scene';
import { PlayerViews } from './render/players';
import { createInterpState, SnapshotBuffer } from './render/interp';
import { Hud } from './ui/hud';
import type { InputFrame } from '../sim/types';

const WORLD_SEED = 20240601;
const LOT_LABEL = 'Lot 2 · M1+M2';

const container = document.getElementById('game');
if (container === null) throw new Error('#game introuvable');

const hud = new Hud();
hud.setKills(0);

const gameScene = new GameScene(container);
const input = new InputController(gameScene.renderer.domElement);
input.onToggleDebug = () => hud.toggleDebug();

const transport = new LocalTransport(WORLD_SEED);
const buffer = new SnapshotBuffer();
const state = createInterpState();
let localId = -1;

const players = new PlayerViews(gameScene.scene, () => localId);
const frame: InputFrame = { tick: 0, moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };

transport.onWelcome((w) => {
  localId = w.playerId;
  gameScene.setObstacles(w.obstacles);
});
transport.onSnapshot((snap) => buffer.push(snap, performance.now()));

document.addEventListener('visibilitychange', () => {
  const hidden = document.hidden;
  transport.setPaused(hidden);
  if (!hidden) buffer.resync();
});

let lastNow = performance.now();
let fps = 0;
let lastDebug = 0;

function loop(now: number): void {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastNow) / 1000, 0.1);
  lastNow = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.05;

  if (buffer.sample(now, state)) {
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
      gameScene.follow(px, py, dt);
      frame.moveX = input.moveX;
      frame.moveY = input.moveY;
      frame.buttons = input.buttons;
      frame.aimAngle = gameScene.aimAngle(input.mouseNdcX, input.mouseNdcY, px, py);
      transport.sendInput(frame);

      if (now - lastDebug > 250) {
        lastDebug = now;
        hud.setDebug(
          `${LOT_LABEL}\n${fps.toFixed(0)} fps · tick ${buffer.latestTick}\n` +
            `pos ${px.toFixed(1)}, ${py.toFixed(1)} · vitesse ${(state.speed[local] as number).toFixed(1)} m/s\n` +
            `esquive ${(state.dashCd[local] as number) <= 0 ? 'prête' : `${Math.ceil((state.dashCd[local] as number) * 2)}s`}`,
        );
      }
    }
    players.update(state);
    gameScene.render();
  }
}
requestAnimationFrame(loop);

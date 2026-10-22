import { InputController } from './input/input';
import { LocalTransport } from './net/LocalTransport';
import { GameScene } from './render/scene';
import { CrowdRenderer } from './render/crowd';
import { PlayerViews } from './render/players';
import { createInterpState, SnapshotBuffer } from './render/interp';
import { Effects } from './render/effects';
import { startMapViewer } from './mapviewer/mapViewer';
import { FIRST_MAP, MAPS } from '../sim/data/maps';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { rotateMove } from './input/moveRotation';
import { PickupRenderer } from './render/pickups';
import { BAG_SLOTS, ITEMS, ITEM_BANDAGE } from '../sim/data/items';
import { CRATE_REACH } from '../sim/data/loot';
import { WEAPONS } from '../sim/data/weapons';
import { ENEMIES } from '../sim/data/enemies';
import { FLAG_DEAD, FLAG_SAFE } from '../sim/snapshot';
import type { MapDef } from '../sim/world/mapdef';
import type { InputFrame } from '../sim/types';

const WORLD_SEED = 20240601;
const query = new URLSearchParams(window.location.search);

// ?map=<id> : visualiseur de carte (sans jeu). ?map seul : première carte.
if (query.has('map')) {
  const wanted = query.get('map') ?? '';
  const ids = Object.keys(MAPS);
  const def = MAPS[wanted] ?? MAPS[FIRST_MAP];
  const viewer = document.getElementById('viewer');
  if (viewer === null || def === undefined) throw new Error('visualiseur indisponible');
  document.getElementById('game')?.remove();
  startMapViewer(viewer, def, ids);
} else {
  startGame();
}

function startGame(): void {
const LOT_LABEL = 'Lot 6 · M6';

const container = document.getElementById('game');
if (container === null) throw new Error('#game introuvable');

// ?horde=500 force le nombre d'ennemis (test de charge) ; sinon densité automatique.
const hordeParam = Number(query.get('horde'));
const horde = Number.isFinite(hordeParam) && hordeParam > 0 ? Math.floor(hordeParam) : -1;

// ?spawn=colosse,souche (ou all) place ces ennemis près du départ, pour les voir sans les chercher.
const spawnParam = query.get('spawn');
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


const mapId = query.get('play') ?? FIRST_MAP;
// ?at=x,y place le joueur à ces coordonnées (en mètres) : pratique pour tester un endroit de la carte.
const atParam = (query.get('at') ?? '').split(',').map(Number);
const at = atParam.length === 2 && atParam.every(Number.isFinite) ? atParam : [];
const transport = new LocalTransport(WORLD_SEED, mapId, horde, showcase, at);
const buffer = new SnapshotBuffer();
const state = createInterpState();
let localId = -1;

const moveOut = { x: 0, y: 0 };
let minimap: Minimap | null = null;
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat) minimap?.cycle();
  if (e.code === 'Tab' && !e.repeat) hud.toggleBag();
});
const players = new PlayerViews(gameScene.scene, () => localId);
input.onToggleDebug = () => {
  hud.toggleDebug();
  players.showSightRing = !players.showSightRing;
};
const crowd = new CrowdRenderer(gameScene.scene);
const effects = new Effects(gameScene.scene);
const pickups = new PickupRenderer(gameScene.scene);
let mapDef: MapDef | null = null;
const frame: InputFrame = { tick: 0, moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };

transport.onWelcome((w) => {
  localId = w.playerId;
  if (w.map !== null) {
    gameScene.setMap(w.map);
    mapDef = w.map;
    minimap = new Minimap(w.map);
  }
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
    else if (e.t === 'swing') effects.swing(e.x, e.y, e.angle, e.range, e.arc, now);
    else if (e.t === 'heal') hud.toast(`+${e.amount} PV`);
    else if (e.t === 'loot' && e.id === localId) {
      for (let k = 0; k < e.items.length; k += 2) hud.toast(`+${e.items[k + 1]} ${ITEMS[e.items[k] as number]?.name ?? '?'}`);
      if (e.leftover > 0) hud.toast('Sac plein : le reste est laissé sur place');
    }
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
    if (input.resetYawRequested) {
      input.resetYawRequested = false;
      gameScene.yaw = 0;
    }
    gameScene.yaw += input.takeYaw(dt);
    gameScene.follow(px, py, dt);
    gameScene.updateRoofs(px, py, dt);
    // Les touches de déplacement sont relatives à l'écran : on les tourne avec la caméra.
    const mx = dead ? 0 : input.moveX;
    const my = dead ? 0 : input.moveY;
    rotateMove(mx, my, gameScene.yaw, moveOut);
    frame.moveX = moveOut.x;
    frame.moveY = moveOut.y;
    frame.buttons = dead ? 0 : input.buttons;
    frame.aimAngle = gameScene.aimAngle(input.mouseNdcX, input.mouseNdcY, px, py);
    transport.sendInput(frame);
    minimap?.draw(px, py, state.aim[local] as number, state, gameScene.yaw);
    const bagOffset = local * BAG_SLOTS * 2;
    const weapon = WEAPONS[0];
    let ammo = 0;
    let bandages = 0;
    for (let b = 0; b < BAG_SLOTS; b++) {
      const item = (state.bags[bagOffset + b * 2] as number) - 1;
      if (weapon !== undefined && item === weapon.ammoItem) ammo += state.bags[bagOffset + b * 2 + 1] as number;
      if (item === ITEM_BANDAGE) bandages += state.bags[bagOffset + b * 2 + 1] as number;
    }
    hud.setAmmo('Pistolet', ammo, bandages);
    hud.setBag(state.bags, bagOffset);
    // Invite de fouille : la caisse prête la plus proche, à portée.
    let prompt: string | null = null;
    if (mapDef !== null && !dead) {
      let bestD2 = CRATE_REACH * CRATE_REACH;
      mapDef.crates.forEach((c, k) => {
        if (state.crates[k] !== 1) return;
        const d2 = (c.x - px) * (c.x - px) + (c.y - py) * (c.y - py);
        if (d2 <= bestD2) {
          bestD2 = d2;
          prompt = `F (maintenu) : fouiller · caisse ${c.tier}`;
        }
      });
    }
    hud.setPrompt(prompt, state.open[local] as number);
    hud.setPlayer(state.hp[local] as number, state.dashCd[local] as number, state.lifeKills[local] as number, dead, state.respawn[local] as number, ((state.flags[local] as number) & FLAG_SAFE) !== 0);

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
  pickups.update(state, now);
  gameScene.updateCrates(state.crates);
  effects.update(now);
  hud.setBoss(crowd.bossFraction);
  jsMs += (performance.now() - jsStart - jsMs) * 0.1;
  gameScene.render();
}
requestAnimationFrame(loop);
}

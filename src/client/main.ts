import { InputController } from './input/input';
import { LocalTransport } from './net/LocalTransport';
import { GameScene } from './render/scene';
import { CrowdRenderer } from './render/crowd';
import { PlayerViews } from './render/players';
import { createInterpState, SnapshotBuffer } from './render/interp';
import { Effects } from './render/effects';
import { startMapViewer } from './mapviewer/mapViewer';
import { MAPS } from '../sim/data/maps';
import { Hud } from './ui/hud';
import { GatePanel } from './ui/gatePanel';
import { ProgressPanel } from './ui/progressPanel';
import type { LastDeath } from './ui/progressPanel';
import { Menu } from './ui/menu';
import { clearSave, decodeSave, encodeSave, loadSave, SAVE_VERSION, writeSave } from './services/SaveService';
import type { Profile } from '../sim/profile';
import { PROGRESS_STRIDE } from '../sim/snapshot';
import { Minimap } from './ui/minimap';
import { rotateMove } from './input/moveRotation';
import { PickupRenderer } from './render/pickups';
import { BAG_SLOTS, ITEMS, ITEM_BANDAGE, STASH_SLOTS } from '../sim/data/items';
import { CRATE_REACH } from '../sim/data/loot';
import { GATE_REACH } from '../sim/data/zone';
import { WEAPONS } from '../sim/data/weapons';
import { MELEE_WEAPONS } from '../sim/data/melee';
import { RECIPES, STATION_REACH } from '../sim/data/recipes';
import { CraftPanel } from './ui/craftPanel';
import { refugeStations } from '../sim/world/map';
import { ZONE_ENEMIES, ZONE_PHASE, ZONE_TICKS, ZONE_WAVE, LOADOUT_ACTIVE, LOADOUT_MAG0, LOADOUT_MELEE, LOADOUT_SLOT0, LOADOUT_STRIDE } from '../sim/snapshot';
import { ENEMIES } from '../sim/data/enemies';
import { FLAG_DEAD, FLAG_SAFE } from '../sim/snapshot';
import type { MapDef } from '../sim/world/mapdef';
import { HUB_MAP_ID, OUT_IN, ZONE_PHASE_EVACUATION } from '../sim/data/zone';
import type { InputFrame } from '../sim/types';

const WORLD_SEED = 20240601;
const query = new URLSearchParams(window.location.search);

// ?map=<id> : visualiseur de carte (sans jeu). ?map seul : première carte.
if (query.has('map')) {
  const wanted = query.get('map') ?? '';
  const ids = Object.keys(MAPS);
  const def = MAPS[wanted] ?? MAPS[HUB_MAP_ID];
  const viewer = document.getElementById('viewer');
  if (viewer === null || def === undefined) throw new Error('visualiseur indisponible');
  document.getElementById('game')?.remove();
  startMapViewer(viewer, def, ids);
} else {
  startGame();
}

function startGame(): void {
const LOT_LABEL = 'Lot 10 · M9b';

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
const saved = loadSave();
let totalKills = saved?.counter ?? 0;
hud.setKills(totalKills);

const gameScene = new GameScene(container);
const input = new InputController(gameScene.renderer.domElement);


// Par défaut on apparaît au bunker ; ?play=<carte> démarre directement sur une carte (debug).
const mapId = query.get('play') ?? HUB_MAP_ID;
// ?at=x,y place le joueur à ces coordonnées (en mètres) : pratique pour tester un endroit de la carte.
const atParam = (query.get('at') ?? '').split(',').map(Number);
const at = atParam.length === 2 && atParam.every(Number.isFinite) ? atParam : [];
const transport = new LocalTransport(WORLD_SEED, mapId, horde, showcase, at, query.get('kit') === '1', saved?.profile ?? null, Number(query.get('xp')) || 0, query.has('zone') ? Number(query.get('zone')) : -1);
const buffer = new SnapshotBuffer();
const state = createInterpState();
let localId = -1;

const moveOut = { x: 0, y: 0 };
let minimap: Minimap | null = null;
let activeSlotNow = 0;
let slotFilled = [true, false, false];
let nearWorkbench = false;
let nearStash = false;
let nearGate = false;
const craftPanel = new CraftPanel((cmd) => transport.sendCommand(cmd));
const gatePanel = new GatePanel((cmd) => transport.sendCommand(cmd));
const progressPanel = new ProgressPanel((cmd) => transport.sendCommand(cmd));
let lastDeath: LastDeath | null = null;
let lastProfile: Profile | null = saved?.profile ?? null;

/** Écrit la sauvegarde : profil renvoyé par la sim + compteur courant. */
function persist(profile: Profile): void {
  lastProfile = profile;
  writeSave({ version: SAVE_VERSION, profile, counter: totalKills, savedAt: Date.now() });
}
transport.onProfile(persist);
const requestSave = (): void => transport.requestProfile();
window.setInterval(requestSave, 15000);

let tabHidden = false;
const menu = new Menu(
  () => (lastProfile === null ? null : encodeSave({ version: SAVE_VERSION, profile: lastProfile, counter: totalKills, savedAt: Date.now() })),
  (text) => {
    const file = decodeSave(text);
    if (file === null) return false;
    writeSave(file);
    window.setTimeout(() => window.location.reload(), 600);
    return true;
  },
  () => {
    clearSave();
    window.location.reload();
  },
  (open) => {
    transport.setPaused(open || tabHidden);
    if (!open) buffer.resync();
  },
);
const selectSlot = (slot: number): void => {
  if (slotFilled[slot] === true) transport.sendCommand({ t: 'select', slot });
};
window.addEventListener('wheel', (e) => {
  if (craftPanel.visible) return;
  for (let k = 1; k <= 3; k++) {
    const next = (activeSlotNow + (e.deltaY > 0 ? k : -k) + 9) % 3;
    if (slotFilled[next] === true) {
      selectSlot(next);
      return;
    }
  }
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat) minimap?.cycle();
  if (e.code === 'Tab' && !e.repeat) hud.toggleBag();
  const digit = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code) >= 0 ? ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code) : ['Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
  if (digit >= 0 && !e.repeat) {
    // Pendant une proposition de bonus ou d'héritage, 1/2/3 choisissent.
    if (progressPanel.upgradeVisible) transport.sendCommand({ t: 'chooseUpgrade', index: digit });
    else selectSlot(digit);
  }
  if (e.code === 'KeyP' && !e.repeat) progressPanel.toggleTree();
  if (e.code === 'Escape' && !e.repeat) {
    if (progressPanel.treeOpen) progressPanel.closeTree();
    else if (gatePanel.visible) gatePanel.close();
    else if (craftPanel.visible) {
      craftPanel.close();
      requestSave();
    } else menu.toggle();
  }
  if (e.code === 'KeyF' && !e.repeat) {
    if (craftPanel.visible) craftPanel.close();
    else if (gatePanel.visible) gatePanel.close();
    else if (nearGate && mapDef?.gate !== undefined) gatePanel.open(mapDef.gate);
    else if (nearWorkbench || nearStash) craftPanel.open();
  }
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
  // Nouveau monde (bunker ou expédition) : tout ce qui dépend de la carte repart de zéro.
  localId = w.playerId;
  buffer.clear();
  gameScene.resetWorld();
  minimap?.destroy();
  minimap = null;
  craftPanel.close();
  gatePanel.close();
  progressPanel.closeTree();
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
    else if (e.t === 'craft' && e.id === localId) {
      hud.toast(`Fabriqué : ${RECIPES[e.recipe]?.name ?? ''}`);
      requestSave();
    } else if (e.t === 'playerDied' && e.id === localId) {
      lastDeath = { kills: e.kills, seconds: e.lifeSeconds };
      requestSave();
    } else if (e.t === 'levelUp' && e.id === localId) hud.toast('Niveau supérieur !');
    else if (e.t === 'notice' && e.id === localId) hud.toast(e.text);
    else if (e.t === 'evacuation') hud.toast('La zone se referme : évacuation !');
    else if (e.t === 'wave') hud.toast(`Vague ${e.wave} : ${e.count} zombies`);
    else if (e.t === 'extracted' && e.id === localId) {
      hud.toast('Retour au bunker');
      requestSave();
    }
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
  tabHidden = hidden;
  if (hidden) requestSave();
  transport.setPaused(hidden || menu.visible);
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
    const countBag = (item: number): number => {
      let n = 0;
      for (let b = 0; b < BAG_SLOTS; b++) if ((state.bags[bagOffset + b * 2] as number) - 1 === item) n += state.bags[bagOffset + b * 2 + 1] as number;
      return n;
    };
    const loadoutOffset = local * LOADOUT_STRIDE;
    const activeSlot = state.loadout[loadoutOffset + LOADOUT_ACTIVE] as number;
    const slots = [0, 1, 2].map((sl) => {
      const w = WEAPONS[state.loadout[loadoutOffset + LOADOUT_SLOT0 + sl] as number];
      return w === undefined ? null : { name: w.name, mag: w.ammoItem < 0 ? 0 : (state.loadout[loadoutOffset + LOADOUT_MAG0 + sl] as number), ammo: countBag(w.ammoItem) };
    });
    hud.setLoadout(slots, activeSlot, MELEE_WEAPONS[state.loadout[loadoutOffset + LOADOUT_MELEE] as number]?.name ?? '—', countBag(ITEM_BANDAGE));
    activeSlotNow = activeSlot;
    slotFilled = slots.map((sl) => sl !== null);
    // Proximité de l'établi et du stockage du refuge.
    nearWorkbench = false;
    nearStash = false;
    if (mapDef !== null) {
      for (const rf of mapDef.refuges) {
        const st = refugeStations(rf);
        if (st === null) continue;
        if ((st.workbench.x - px) ** 2 + (st.workbench.y - py) ** 2 <= STATION_REACH ** 2) nearWorkbench = true;
        if ((st.stash.x - px) ** 2 + (st.stash.y - py) ** 2 <= STATION_REACH ** 2) nearStash = true;
      }
    }
    nearGate = false;
    const gate = mapDef?.gate;
    if (gate !== undefined && !dead) nearGate = Math.abs(px - gate.x) <= gate.w / 2 + GATE_REACH && Math.abs(py - gate.y) <= gate.h / 2 + GATE_REACH;
    if (gatePanel.visible && !nearGate) gatePanel.close();
    craftPanel.update({
      bag: state.bags,
      bagOffset,
      stash: state.stash,
      stashOffset: local * STASH_SLOTS * 2,
      loadout: state.loadout,
      loadoutOffset,
      nearWorkbench,
      nearStash,
    });
    if (craftPanel.visible && !nearWorkbench && !nearStash) craftPanel.close();
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
    if (prompt === null && nearGate && !gatePanel.visible) prompt = 'F : sortir du bunker (choisir une zone)';
    if (prompt === null && !craftPanel.visible && (nearWorkbench || nearStash)) prompt = `F : ${nearWorkbench && nearStash ? 'établi et stockage' : nearWorkbench ? 'établi' : 'stockage'}`;
    let promptProgress = state.open[local] as number;
    if (!dead && (state.reload[local] as number) > 0) {
      prompt = 'Rechargement… (immobile = plus rapide)';
      promptProgress = state.reload[local] as number;
    }
    if (!dead && (state.heal[local] as number) > 0) {
      prompt = 'Soin en cours — restez immobile';
      promptProgress = state.heal[local] as number;
    }
    const out = state.out[local] as number;
    const extraction = mapDef?.endOfZone.extraction ?? [];
    const atExit = mapDef?.kind === 'expedition' && extraction.some((e) => (e.x - px) ** 2 + (e.y - py) ** 2 <= e.radius * e.radius);
    if (!dead && atExit && out === OUT_IN) {
      prompt = state.extract[local]! > 0 ? 'Retour au bunker… ne bougez pas de la zone' : 'F (maintenu) : rentrer au bunker avec votre sac';
      promptProgress = state.extract[local] as number;
    }
    hud.setPrompt(prompt, promptProgress);
    if (mapDef?.kind === 'hub') hud.setZoneLabel('BUNKER');
    else if (mapDef !== null) {
      const evacuation = state.zone[ZONE_PHASE] === ZONE_PHASE_EVACUATION;
      const hint = evacuation && !dead && out === OUT_IN ? 'rentrez au bunker (sortie en bleu)' : '';
      hud.setZone(evacuation, state.zone[ZONE_TICKS] as number, state.zone[ZONE_WAVE] as number, state.zone[ZONE_ENEMIES] as number, hint);
    }
    progressPanel.update(state.progress, local * PROGRESS_STRIDE, dead, lastDeath, ((state.flags[local] as number) & FLAG_SAFE) !== 0);
    hud.setPlayer(state.hp[local] as number, state.maxHp[local] as number, state.dashCd[local] as number, state.lifeKills[local] as number, dead, state.respawn[local] as number, ((state.flags[local] as number) & FLAG_SAFE) !== 0);

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

import { describe, expect, it } from 'vitest';
import { ITEM_BANDAGE, ITEM_FERRAILLE, ITEM_MUNITIONS_9MM } from './data/items';
import { MAPS } from './data/maps';
import { RESPAWN_TICKS } from './data/enemies';
import { EXTRACT_TICKS, HUB_MAP_ID } from './data/zone';
import { WEAPONS, WEAPON_PISTOL } from './data/weapons';
import { entityIndex } from './ecs/pool';
import { parseProfile, PROFILE_VERSION } from './profile';
import { createSession, saveProfile, travel } from './session';
import type { Session } from './session';
import { queueCommand, snapshot } from './sim';
import { bagAdd, bagClear, bagCount, stashAdd, stashCount } from './systems/inventory';
import { damagePlayer } from './systems/player';
import { run } from './testkit';
import { BTN_INTERACT } from './types';
import type { SimEvent } from './types';

const IDLE = { moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };
const CAMPAGNE = 'niveau-1-campagne';
const idx = (s: Session): number => entityIndex(s.id);
const goTo = (s: Session, x: number, y: number): void => {
  s.sim.players.posX[idx(s)] = x;
  s.sim.players.posY[idx(s)] = y;
};
const travelEvent = (events: SimEvent[]): SimEvent | undefined => events.find((e) => e.t === 'travel');

describe('bunker et expéditions', () => {
  it('un nouveau personnage apparaît au bunker : sac vide, kit de départ dans le coffre', () => {
    const s = createSession(null, 1);
    expect(s.mapId).toBe(HUB_MAP_ID);
    expect(s.sim.map?.def.kind).toBe('hub');
    expect(bagCount(s.sim, idx(s), ITEM_MUNITIONS_9MM)).toBe(0);
    expect(stashCount(s.sim, idx(s), ITEM_MUNITIONS_9MM)).toBe(24);
    expect(stashCount(s.sim, idx(s), ITEM_BANDAGE)).toBe(2);
    run(s.sim, s.id, 2, IDLE);
    expect(snapshot(s.sim).players[4]! & 16).toBe(16); // zone sûre
  });

  it('le bunker ne fait apparaître aucun ennemi et ne lance pas de fin de zone', () => {
    const s = createSession(null, 1);
    s.sim.zone.ticks = 5;
    run(s.sim, s.id, 3000, IDLE);
    expect(s.sim.enemyPool.count).toBe(0);
    expect(s.sim.zone.phase).toBe(0);
  });

  it('la porte : départ refusé hors de la porte ou vers une carte non proposée, accepté à la porte', () => {
    const s = createSession(null, 1);
    queueCommand(s.sim, s.id, { t: 'depart', map: CAMPAGNE });
    expect(travelEvent(run(s.sim, s.id, 2, IDLE))).toBeUndefined();
    const gate = MAPS[HUB_MAP_ID]!.gate!;
    goTo(s, gate.x, gate.y);
    queueCommand(s.sim, s.id, { t: 'depart', map: 'inconnue' });
    expect(travelEvent(run(s.sim, s.id, 2, IDLE))).toBeUndefined();
    queueCommand(s.sim, s.id, { t: 'depart', map: CAMPAGNE });
    const e = travelEvent(run(s.sim, s.id, 2, IDLE));
    expect(e).toMatchObject({ t: 'travel', to: CAMPAGNE });
  });

  it('on emporte son sac et ses chargeurs ; le coffre reste permanent', () => {
    let s = createSession(null, 1);
    const i = idx(s);
    stashAdd(s.sim, i, ITEM_FERRAILLE, 15);
    bagAdd(s.sim, i, ITEM_MUNITIONS_9MM, 30);
    bagAdd(s.sim, i, ITEM_BANDAGE, 3);
    s.sim.players.mag[i * WEAPONS.length + WEAPON_PISTOL] = 7;
    s = travel(s, CAMPAGNE);
    expect(s.mapId).toBe(CAMPAGNE);
    expect(s.sim.map?.def.kind).toBe('expedition');
    const j = idx(s);
    expect(bagCount(s.sim, j, ITEM_MUNITIONS_9MM)).toBe(30);
    expect(bagCount(s.sim, j, ITEM_BANDAGE)).toBe(3);
    expect(s.sim.players.mag[j * WEAPONS.length + WEAPON_PISTOL]).toBe(7);
    expect(stashCount(s.sim, j, ITEM_FERRAILLE)).toBe(15);
    // Départ sur la carte : dans la zone sûre de la sortie du bunker.
    run(s.sim, s.id, 2, IDLE);
    expect(snapshot(s.sim).players[4]! & 16).toBe(16);
  });

  it('la sortie du bunker n\'a ni établi ni coffre', () => {
    const s = travel(createSession(null, 1), CAMPAGNE);
    expect(s.sim.map!.refuges.every((r) => r.workbench === null && r.stash === null)).toBe(true);
    queueCommand(s.sim, s.id, { t: 'stash', dir: 'in', item: ITEM_BANDAGE, count: 1 });
    bagAdd(s.sim, idx(s), ITEM_BANDAGE, 1);
    const before = stashCount(s.sim, idx(s), ITEM_BANDAGE);
    run(s.sim, s.id, 2, IDLE);
    expect(stashCount(s.sim, idx(s), ITEM_BANDAGE)).toBe(before);
  });

  it('extraction : F maintenu à la sortie ramène au bunker avec le sac, Rémanence créditée', () => {
    let s = travel(createSession(null, 1), CAMPAGNE);
    const i = idx(s);
    bagClear(s.sim, i);
    bagAdd(s.sim, i, ITEM_FERRAILLE, 9);
    s.sim.players.lifeKills[i] = 14;
    const exit = MAPS[CAMPAGNE]!.endOfZone.extraction[0]!;
    goTo(s, exit.x, exit.y);
    const events = run(s.sim, s.id, EXTRACT_TICKS + 5, { ...IDLE, buttons: BTN_INTERACT });
    expect(travelEvent(events)).toMatchObject({ to: HUB_MAP_ID });
    s = travel(s, HUB_MAP_ID);
    expect(s.sim.map?.def.kind).toBe('hub');
    expect(bagCount(s.sim, idx(s), ITEM_FERRAILLE)).toBe(9);
    expect(s.sim.players.remanence[idx(s)]).toBeGreaterThanOrEqual(14);
  });

  it('mort : retour au bunker, sac et chargeurs perdus, coffre et Rémanence conservés', () => {
    let s = createSession(null, 1);
    stashAdd(s.sim, idx(s), ITEM_FERRAILLE, 5);
    bagAdd(s.sim, idx(s), ITEM_MUNITIONS_9MM, 40);
    s = travel(s, CAMPAGNE);
    const i = idx(s);
    s.sim.players.lifeKills[i] = 25;
    s.sim.players.hurtTicks[i] = 0;
    s.sim.players.posX[i] = 0;
    s.sim.players.posY[i] = 0; // hors de la zone sûre
    s.sim.players.inRefuge[i] = 0;
    run(s.sim, s.id, 1, IDLE);
    s.sim.players.inRefuge[i] = 0;
    damagePlayer(s.sim, i, 1e9);
    const events = run(s.sim, s.id, RESPAWN_TICKS + 3, IDLE);
    expect(travelEvent(events)).toMatchObject({ to: HUB_MAP_ID });
    s = travel(s, HUB_MAP_ID);
    expect(bagCount(s.sim, idx(s), ITEM_MUNITIONS_9MM)).toBe(0);
    expect(s.sim.players.mag[idx(s) * WEAPONS.length + WEAPON_PISTOL]).toBe(0);
    expect(stashCount(s.sim, idx(s), ITEM_FERRAILLE)).toBe(5);
    expect(s.sim.players.remanence[idx(s)]).toBeGreaterThanOrEqual(25);
  });

  it('un kit de secours revient au coffre quand il ne reste plus aucune munition', () => {
    let s = createSession(null, 1);
    s.sim.players.stashItem.fill(-1);
    s.sim.players.stashQty.fill(0);
    s = travel(s, CAMPAGNE);
    s = travel(s, HUB_MAP_ID);
    expect(stashCount(s.sim, idx(s), ITEM_MUNITIONS_9MM)).toBe(24);
  });

  it('la sauvegarde disque garde le sac au bunker seulement', () => {
    let s = createSession(null, 1);
    bagAdd(s.sim, idx(s), ITEM_FERRAILLE, 6);
    expect(saveProfile(s).bag).toEqual([ITEM_FERRAILLE, 6]);
    s = travel(s, CAMPAGNE);
    expect(saveProfile(s).bag).toEqual([]);
    expect(saveProfile(s).version).toBe(PROFILE_VERSION);
    // Une sauvegarde de l'ancienne version (sans sac) reste lisible.
    const old = JSON.parse(JSON.stringify(saveProfile(s))) as Record<string, unknown>;
    delete old['bag'];
    delete old['mags'];
    old['version'] = 1;
    expect(parseProfile(old)).not.toBeNull();
  });

  it('rejette un sac absurde dans une sauvegarde', () => {
    const s = createSession(null, 1);
    const raw = JSON.parse(JSON.stringify(saveProfile(s))) as Record<string, unknown>;
    raw['bag'] = [999, 5, ITEM_FERRAILLE, 9999, ITEM_FERRAILLE, -1];
    const parsed = parseProfile(raw)!;
    expect(parsed.bag).toEqual([ITEM_FERRAILLE, 20]);
  });
});

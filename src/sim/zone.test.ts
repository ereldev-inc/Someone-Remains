import { describe, expect, it } from 'vitest';
import { EXTRACT_TICKS, OUT_DEAD, OUT_EXTRACTED, OUT_IN, PERSISTENT_WAVE, WAVE_FIRST_TICKS, WAVE_INTERVAL_TICKS, ZONE_PHASE_COUNTDOWN, ZONE_PHASE_EVACUATION } from './data/zone';
import { entityIndex } from './ecs/pool';
import { ITEM_BANDAGE } from './data/items';
import { addPlayer, createSimFromMap, hashState, queueCommand, snapshot } from './sim';
import type { Sim } from './sim';
import { SNAP_EXTRACT, SNAP_OUT, ZONE_ENDED, ZONE_PHASE, ZONE_WAVE } from './snapshot';
import { bagCount } from './systems/inventory';
import { damagePlayer } from './systems/player';
import { waveCount, waveDamageMult, waveHpMult, waveTypes } from './systems/zone';
import { run } from './testkit';
import { miniMap } from './testmap';

const IDLE = { moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };

/** Carte sans groupes d'ennemis, compte à rebours de 2 s, extraction à côté du joueur. */
function setup(patch = {}): { sim: Sim; id: number; i: number } {
  const sim = createSimFromMap(miniMap({ groups: [], endOfZone: { countdownSeconds: 2, extraction: [{ id: 'e', x: 0, y: 60, radius: 5 }] }, ...patch }), 3);
  const id = addPlayer(sim);
  return { sim, id, i: entityIndex(id) };
}

/** Passe directement en évacuation. */
function evacuate(s: { sim: Sim; id: number }): void {
  run(s.sim, s.id, 125, IDLE);
}

describe('fin de zone', () => {
  it('le compte à rebours décroît puis déclenche l\'évacuation', () => {
    const s = setup();
    run(s.sim, s.id, 60, IDLE);
    expect(s.sim.zone.phase).toBe(ZONE_PHASE_COUNTDOWN);
    expect(s.sim.zone.ticks).toBe(60);
    const ev = run(s.sim, s.id, 70, IDLE);
    expect(s.sim.zone.phase).toBe(ZONE_PHASE_EVACUATION);
    expect(ev.some((e) => e.t === 'evacuation')).toBe(true);
    expect(snapshot(s.sim).zone[ZONE_PHASE]).toBe(ZONE_PHASE_EVACUATION);
  });

  it('les vagues partent à intervalle régulier, hors écran et en poursuite', () => {
    const s = setup();
    evacuate(s);
    s.sim.players.posX[s.i] = -60;
    s.sim.players.posY[s.i] = 0;
    s.sim.players.hp[s.i] = 1e9; // survit à la vague
    const ev = run(s.sim, s.id, WAVE_FIRST_TICKS + 5, IDLE);
    expect(ev.some((e) => e.t === 'wave' && e.wave === 1)).toBe(true);
    run(s.sim, s.id, 60, IDLE);
    expect(s.sim.enemyPool.count).toBe(waveCount(1, 1));
    const e = s.sim.enemies;
    for (let k = 0; k < s.sim.enemyPool.highWater; k++) {
      if (s.sim.enemyPool.alive[k] === 0) continue;
      expect(e.persistent[k]).toBe(PERSISTENT_WAVE);
      expect(e.state[k]).toBe(1);
    }
    run(s.sim, s.id, WAVE_INTERVAL_TICKS, IDLE);
    expect(s.sim.zone.wave).toBe(2);
  });

  it('chaque vague est strictement plus forte que la précédente', () => {
    const s = setup();
    for (let n = 1; n < 12; n++) {
      expect(waveCount(n + 1, 1)).toBeGreaterThan(waveCount(n, 1));
      expect(waveHpMult(s.sim, n + 1)).toBeGreaterThan(waveHpMult(s.sim, n));
      expect(waveDamageMult(s.sim, n + 1)).toBeGreaterThan(waveDamageMult(s.sim, n));
      expect(waveTypes(s.sim, n + 1).length).toBeGreaterThanOrEqual(waveTypes(s.sim, n).length);
    }
    expect(waveTypes(s.sim, 1)).toHaveLength(1);
    expect(waveTypes(s.sim, 12).length).toBeGreaterThan(1);
    expect(waveCount(3, 2)).toBeGreaterThan(waveCount(3, 1));
  });

  it('l\'extraction demande de rester dans le point, sans être touché', () => {
    const s = setup();
    evacuate(s);
    s.sim.players.posX[s.i] = 0;
    s.sim.players.posY[s.i] = 60;
    run(s.sim, s.id, 100, IDLE);
    expect(snapshot(s.sim).players[SNAP_EXTRACT]).toBeGreaterThan(0.2);
    // Un coup interrompt l'extraction.
    s.sim.players.hurtTicks[s.i] = 0;
    expect(damagePlayer(s.sim, s.i, 1)).toBe(true);
    expect(s.sim.players.extractProgress[s.i]).toBe(0);
    // Sortir du point la remet à zéro.
    run(s.sim, s.id, 30, IDLE);
    s.sim.players.posY[s.i] = 20;
    run(s.sim, s.id, 2, IDLE);
    expect(s.sim.players.extractProgress[s.i]).toBe(0);
  });

  it('extraire ramène au refuge avec le sac et termine l\'instance quand il ne reste personne', () => {
    const s = setup();
    evacuate(s);
    const bandages = bagCount(s.sim, s.i, ITEM_BANDAGE);
    expect(bandages).toBeGreaterThan(0);
    s.sim.players.posX[s.i] = 0;
    s.sim.players.posY[s.i] = 60;
    const ev = run(s.sim, s.id, EXTRACT_TICKS + 5, IDLE);
    expect(ev.some((e) => e.t === 'extracted')).toBe(true);
    expect(ev.some((e) => e.t === 'zoneEnd')).toBe(true);
    expect(s.sim.players.zoneOut[s.i]).toBe(OUT_EXTRACTED);
    expect(Math.hypot(s.sim.players.posX[s.i] as number, (s.sim.players.posY[s.i] as number) - 80)).toBeLessThan(10);
    expect(bagCount(s.sim, s.i, ITEM_BANDAGE)).toBe(bandages);
    expect(snapshot(s.sim).zone[ZONE_ENDED]).toBe(1);
    expect(snapshot(s.sim).players[SNAP_OUT]).toBe(OUT_EXTRACTED);
    expect(s.sim.enemyPool.count).toBe(0);
  });

  it('mourir pendant l\'évacuation termine l\'instance, la réapparition en relance une neuve', () => {
    const s = setup();
    evacuate(s);
    s.sim.players.posX[s.i] = -60;
    s.sim.players.posY[s.i] = 0;
    run(s.sim, s.id, 2, IDLE);
    s.sim.players.hurtTicks[s.i] = 0;
    damagePlayer(s.sim, s.i, 9999);
    expect(s.sim.players.zoneOut[s.i]).toBe(OUT_DEAD);
    run(s.sim, s.id, 2, IDLE);
    expect(s.sim.zone.ended).toBe(true);
    queueCommand(s.sim, s.id, { t: 'chooseHeritage', index: 0 });
    run(s.sim, s.id, 400, IDLE);
    expect(s.sim.zone.ended).toBe(false);
    expect(s.sim.zone.phase).toBe(ZONE_PHASE_COUNTDOWN);
    expect(s.sim.players.zoneOut[s.i]).toBe(OUT_IN);
    expect(s.sim.zone.wave).toBe(0);
  });

  it('la commande newZone relance une instance terminée seulement', () => {
    const s = setup();
    queueCommand(s.sim, s.id, { t: 'newZone' });
    run(s.sim, s.id, 5, IDLE);
    expect(s.sim.zone.ticks).toBe(120 - 5);
    evacuate(s);
    s.sim.players.posX[s.i] = 0;
    s.sim.players.posY[s.i] = 60;
    run(s.sim, s.id, EXTRACT_TICKS + 5, IDLE);
    expect(s.sim.zone.ended).toBe(true);
    queueCommand(s.sim, s.id, { t: 'newZone' });
    run(s.sim, s.id, 2, IDLE);
    expect(s.sim.zone.ended).toBe(false);
    expect(s.sim.zone.phase).toBe(ZONE_PHASE_COUNTDOWN);
    expect(s.sim.players.zoneOut[s.i]).toBe(OUT_IN);
  });

  it('un joueur qui arrive pendant l\'évacuation ne rejoint pas l\'instance', () => {
    const s = setup();
    evacuate(s);
    const late = addPlayer(s.sim);
    expect(s.sim.players.zoneOut[entityIndex(late)]).toBe(OUT_EXTRACTED);
  });

  it('est déterministe', () => {
    const hashes = [0, 1].map(() => {
      const s = setup();
      evacuate(s);
      run(s.sim, s.id, WAVE_FIRST_TICKS + 400, IDLE);
      return hashState(s.sim);
    });
    expect(hashes[0]).toBe(hashes[1]);
    expect(snapshot(setup().sim).zone[ZONE_WAVE]).toBe(0);
  });
});

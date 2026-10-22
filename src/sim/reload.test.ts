import { describe, expect, it } from 'vitest';
import { ITEM_CARREAUX, ITEM_MUNITIONS_9MM } from './data/items';
import { UPGRADES } from './data/progression';
import { WEAPONS, WEAPON_ARBALETE, WEAPON_MITRAILLETTE, WEAPON_PISTOL } from './data/weapons';
import { entityIndex } from './ecs/pool';
import { addPlayer, queueCommand, snapshot } from './sim';
import type { Sim } from './sim';
import { SNAP_RELOAD } from './snapshot';
import { bagAdd, bagClear, bagCount } from './systems/inventory';
import { addXp } from './systems/progression';
import { RELOAD_MOVING_FACTOR } from './systems/reload';
import { quietSim, run } from './testkit';
import { BTN_FIRE, BTN_RELOAD } from './types';

const IDLE = { moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };
const PISTOL = WEAPONS[WEAPON_PISTOL]!;

/** Joueur avec le pistolet à moitié vidé et 30 munitions en réserve. */
function setup(): { sim: Sim; id: number; i: number; mag: () => number; reserve: () => number } {
  const sim = quietSim();
  const id = addPlayer(sim);
  const i = entityIndex(id);
  bagClear(sim, i);
  bagAdd(sim, i, ITEM_MUNITIONS_9MM, 30);
  sim.players.mag[i * WEAPONS.length + WEAPON_PISTOL] = 4;
  return { sim, id, i, mag: () => sim.players.mag[i * WEAPONS.length + WEAPON_PISTOL] as number, reserve: () => bagCount(sim, i, ITEM_MUNITIONS_9MM) };
}

const reload = { ...IDLE, buttons: BTN_RELOAD };

/** Nombre de ticks avant que le chargeur du pistolet augmente, avec l'entrée donnée. */
function ticksToReload(input: { moveX: number; moveY: number }, bonusRanks = 0): number {
  const s = setup();
  if (bonusRanks > 0) s.sim.players.lifeUpgrades[s.i * UPGRADES.length + UPGRADES.findIndex((u) => u.stat === 'reload')] = bonusRanks;
  run(s.sim, s.id, 1, { ...IDLE, ...input, buttons: BTN_RELOAD });
  for (let t = 1; t < 1000; t++) {
    run(s.sim, s.id, 1, { ...IDLE, ...input });
    if (s.mag() > 4) return t + 1;
  }
  return Infinity;
}

describe('rechargement', () => {
  it('prend la durée de l\'arme à l\'arrêt, puis transfère les munitions du sac au chargeur', () => {
    const s = setup();
    run(s.sim, s.id, 1, reload);
    expect(s.sim.players.reloadWeapon[s.i]).toBe(WEAPON_PISTOL);
    run(s.sim, s.id, PISTOL.reloadTicks - 10, IDLE);
    expect(s.mag()).toBe(4); // pas encore
    expect(s.reserve()).toBe(30); // le sac n'est entamé qu'à la fin
    expect(snapshot(s.sim).players[SNAP_RELOAD]).toBeGreaterThan(0.8);
    run(s.sim, s.id, 20, IDLE);
    expect(s.mag()).toBe(PISTOL.magazine);
    expect(s.reserve()).toBe(30 - (PISTOL.magazine - 4));
    expect(s.sim.players.reloadWeapon[s.i]).toBe(-1);
  });

  it('va plus vite à l\'arrêt qu\'en mouvement (deux fois moins vite)', () => {
    const still = ticksToReload({ moveX: 0, moveY: 0 });
    const moving = ticksToReload({ moveX: 1, moveY: 0 });
    expect(still).toBeLessThanOrEqual(PISTOL.reloadTicks + 3);
    expect(moving).toBeGreaterThan(still * 1.6);
    expect(moving / still).toBeCloseTo(1 / RELOAD_MOVING_FACTOR, 0);
  });

  it('le bonus « Rechargement rapide » raccourcit la durée', () => {
    expect(ticksToReload({ moveX: 0, moveY: 0 }, 2)).toBeLessThan(ticksToReload({ moveX: 0, moveY: 0 }) * 0.75);
    const p = setup();
    addXp(p.sim, p.i, 1); // le trait existe dans la liste des bonus
    expect(UPGRADES.some((u) => u.stat === 'reload')).toBe(true);
  });

  it('ne démarre pas si le chargeur est plein ou s\'il n\'y a plus de munitions dans le sac', () => {
    const full = setup();
    full.sim.players.mag[full.i * WEAPONS.length + WEAPON_PISTOL] = PISTOL.magazine;
    run(full.sim, full.id, 1, reload);
    expect(full.sim.players.reloadWeapon[full.i]).toBe(-1);
    const empty = setup();
    bagClear(empty.sim, empty.i);
    run(empty.sim, empty.id, 1, reload);
    expect(empty.sim.players.reloadWeapon[empty.i]).toBe(-1);
  });

  it('charge seulement ce qui reste quand la réserve est inférieure à la place libre', () => {
    const s = setup();
    bagClear(s.sim, s.i);
    bagAdd(s.sim, s.i, ITEM_MUNITIONS_9MM, 3);
    run(s.sim, s.id, 1, reload);
    run(s.sim, s.id, PISTOL.reloadTicks + 5, IDLE);
    expect(s.mag()).toBe(7);
    expect(s.reserve()).toBe(0);
  });

  it('un chargeur vide déclenche le rechargement automatiquement ; on ne tire pas pendant', () => {
    const s = setup();
    s.sim.players.mag[s.i * WEAPONS.length + WEAPON_PISTOL] = 0;
    run(s.sim, s.id, 5, { ...IDLE, buttons: BTN_FIRE });
    expect(s.sim.players.reloadWeapon[s.i]).toBe(WEAPON_PISTOL);
    expect(s.sim.projectilePool.count).toBe(0);
    run(s.sim, s.id, PISTOL.reloadTicks + 5, { ...IDLE, buttons: BTN_FIRE });
    expect(s.sim.projectilePool.count).toBeGreaterThan(0);
  });

  it('changer d\'arme interrompt le rechargement, et chaque arme garde son chargeur', () => {
    const s = setup();
    s.sim.players.owned[s.i] = (s.sim.players.owned[s.i] as number) | (1 << WEAPON_MITRAILLETTE);
    s.sim.players.slotWeapon[s.i * 3 + 1] = WEAPON_MITRAILLETTE;
    s.sim.players.mag[s.i * WEAPONS.length + WEAPON_MITRAILLETTE] = 17;
    run(s.sim, s.id, 1, reload);
    run(s.sim, s.id, 10, IDLE);
    queueCommand(s.sim, s.id, { t: 'select', slot: 1 });
    run(s.sim, s.id, 2, IDLE);
    expect(s.sim.players.reloadWeapon[s.i]).toBe(-1);
    expect(s.mag()).toBe(4);
    expect(s.sim.players.mag[s.i * WEAPONS.length + WEAPON_MITRAILLETTE]).toBe(17);
  });

  it('l\'arbalète se recharge après chaque carreau', () => {
    const s = setup();
    s.sim.players.owned[s.i] = (s.sim.players.owned[s.i] as number) | (1 << WEAPON_ARBALETE);
    s.sim.players.slotWeapon[s.i * 3] = WEAPON_ARBALETE;
    s.sim.players.weapon[s.i] = WEAPON_ARBALETE;
    bagAdd(s.sim, s.i, ITEM_CARREAUX, 5);
    run(s.sim, s.id, 1, reload);
    run(s.sim, s.id, WEAPONS[WEAPON_ARBALETE]!.reloadTicks + 3, IDLE);
    expect(s.sim.players.mag[s.i * WEAPONS.length + WEAPON_ARBALETE]).toBe(1);
    run(s.sim, s.id, 1, { ...IDLE, buttons: BTN_FIRE });
    expect(s.sim.players.mag[s.i * WEAPONS.length + WEAPON_ARBALETE]).toBe(0);
    run(s.sim, s.id, 5, { ...IDLE, buttons: BTN_FIRE });
    expect(s.sim.players.reloadWeapon[s.i]).toBe(WEAPON_ARBALETE); // rechargement automatique
  });
});

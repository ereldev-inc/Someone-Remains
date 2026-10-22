import { describe, expect, it } from 'vitest';
import { BAG_SLOTS, BANDAGE_HEAL, ITEMS, ITEM_BANDAGE, ITEM_CHARGE_VIRALE, ITEM_FERRAILLE, ITEM_MUNITIONS_9MM, ITEM_TROUSSE, START_KIT } from './data/items';
import { CRATE_COOLDOWN_SECONDS, CRATE_NOISE, CRATE_OPEN_TICKS, LOOT_TABLES, PICKUP_LIFE_TICKS } from './data/loot';
import { MELEE_WEAPONS } from './data/melee';
import { ENEMIES, ENEMY_COLOSSE, ENEMY_RODEUR } from './data/enemies';
import { PLAYER_MAX_HP } from './data/player';
import { WEAPONS } from './data/weapons';
import { entityIndex } from './ecs/pool';
import { createRng } from './rng';
import { addPlayer, createSim, createSimFromMap, hashState, snapshot, step } from './sim';
import type { Sim } from './sim';
import { damageEnemy, spawnEnemy, STATE_CHASE } from './systems/enemies';
import { bagAdd, bagClear, bagCount, bagRemove } from './systems/inventory';
import { rollLoot } from './systems/loot';
import { damagePlayer } from './systems/player';
import { miniMap } from './testmap';
import { emptyObstacles, quietSim, respawnAfterChoice, run } from './testkit';
import { BTN_FIRE, BTN_HEAL, BTN_INTERACT, BTN_MELEE } from './types';
import type { InputFrame, SimEvent } from './types';

const IDLE = { moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };
const bag = (sim: Sim, id: number, item: number): number => bagCount(sim, entityIndex(id), item);

describe('sac', () => {
  it('commence avec le kit de départ', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    for (const [item, qty] of START_KIT) expect(bag(sim, id, item)).toBe(qty);
  });

  it('empile jusqu\'à la taille de pile puis ouvre un emplacement, jusqu\'à la capacité', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const i = entityIndex(id);
    bagClear(sim, i);
    const stack = ITEMS[ITEM_FERRAILLE]!.stack;
    expect(bagAdd(sim, i, ITEM_FERRAILLE, stack + 5)).toBe(stack + 5);
    expect(sim.players.bagItem.slice(i * BAG_SLOTS, i * BAG_SLOTS + 2)).toEqual(Int16Array.of(ITEM_FERRAILLE, ITEM_FERRAILLE));
    // Sac plein : il reste exactement la place restante.
    bagClear(sim, i);
    expect(bagAdd(sim, i, ITEM_FERRAILLE, stack * BAG_SLOTS + 7)).toBe(stack * BAG_SLOTS);
    expect(bagAdd(sim, i, ITEM_BANDAGE, 1)).toBe(0);
  });

  it('retire exactement la quantité demandée, ou rien', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const i = entityIndex(id);
    bagClear(sim, i);
    bagAdd(sim, i, ITEM_FERRAILLE, 25);
    expect(bagRemove(sim, i, ITEM_FERRAILLE, 30)).toBe(false);
    expect(bagCount(sim, i, ITEM_FERRAILLE)).toBe(25);
    expect(bagRemove(sim, i, ITEM_FERRAILLE, 22)).toBe(true);
    expect(bagCount(sim, i, ITEM_FERRAILLE)).toBe(3);
  });

  it('la mort vide le sac ; la réapparition redonne le kit de départ', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const i = entityIndex(id);
    bagAdd(sim, i, ITEM_FERRAILLE, 10);
    damagePlayer(sim, i, 1e9);
    expect(bagCount(sim, i, ITEM_FERRAILLE)).toBe(0);
    expect(bagCount(sim, i, ITEM_MUNITIONS_9MM)).toBe(0);
    respawnAfterChoice(sim, id);
    expect(bagCount(sim, i, ITEM_FERRAILLE)).toBe(0);
    expect(bagCount(sim, i, ITEM_MUNITIONS_9MM)).toBe(START_KIT[0]![1]);
  });
});

describe('tables de butin', () => {
  it('tirent des objets valides, dans les bornes, de façon déterministe', () => {
    for (const [name, table] of Object.entries(LOOT_TABLES)) {
      const a = createRng(7);
      const b = createRng(7);
      for (let k = 0; k < 200; k++) {
        const x = rollLoot(a, table);
        expect(x, name).toEqual(rollLoot(b, table));
        expect(x.length).toBeGreaterThanOrEqual(2);
        for (let j = 0; j < x.length; j += 2) {
          expect(ITEMS[x[j]!]).toBeDefined();
          const entry = table.entries.find((e) => e.item === x[j])!;
          expect(x[j + 1]).toBeGreaterThanOrEqual(entry.min);
        }
      }
    }
  });

  it('les caisses rares donnent plus que les communes ; seules les rares et boss donnent de la charge virale', () => {
    const count = (tier: string, item?: number): number => {
      const rng = createRng(3);
      let total = 0;
      for (let k = 0; k < 300; k++) {
        const x = rollLoot(rng, LOOT_TABLES[tier]!);
        for (let j = 0; j < x.length; j += 2) if (item === undefined || x[j] === item) total += x[j + 1]!;
      }
      return total;
    };
    expect(count('rare')).toBeGreaterThan(count('commune'));
    expect(count('commune', ITEM_CHARGE_VIRALE)).toBe(0);
    expect(count('rare', ITEM_CHARGE_VIRALE)).toBeGreaterThan(0);
  });
});

describe('munitions', () => {
  it('chaque tir consomme une munition ; à sec, plus de tir, ni bruit ni cadence', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const i = entityIndex(id);
    const start = bag(sim, id, ITEM_MUNITIONS_9MM);
    run(sim, id, 1, { ...IDLE, buttons: BTN_FIRE });
    expect(bag(sim, id, ITEM_MUNITIONS_9MM)).toBe(start - 1);
    run(sim, id, 60 * 20, { ...IDLE, buttons: BTN_FIRE });
    expect(bag(sim, id, ITEM_MUNITIONS_9MM)).toBe(0);
    expect(sim.players.fireCooldown[i]).toBe(0);
    for (let s = 0; s < 120; s++) run(sim, id, 1, IDLE); // laisse retomber le bruit et les projectiles
    expect(sim.projectilePool.count).toBe(0);
    run(sim, id, 30, { ...IDLE, buttons: BTN_FIRE });
    expect(sim.projectilePool.count).toBe(0);
    expect(sim.players.noise[i]).toBe(0);
  });

  it('ramasser des munitions rétablit le tir', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    bagClear(sim, entityIndex(id));
    run(sim, id, 10, { ...IDLE, buttons: BTN_FIRE });
    expect(sim.projectilePool.count).toBe(0);
    bagAdd(sim, entityIndex(id), ITEM_MUNITIONS_9MM, 3);
    run(sim, id, 10, { ...IDLE, buttons: BTN_FIRE });
    expect(sim.projectilePool.count).toBe(1);
    expect(WEAPONS[0]!.ammoItem).toBe(ITEM_MUNITIONS_9MM);
  });
});

describe('corps à corps', () => {
  const melee = { ...IDLE, buttons: BTN_MELEE };

  it('fonctionne sans munitions et touche les ennemis devant, dans la portée', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    bagClear(sim, entityIndex(id));
    const front = spawnEnemy(sim, ENEMY_RODEUR, 1.5, 0);
    const behind = spawnEnemy(sim, ENEMY_RODEUR, -1.5, 0);
    const far = spawnEnemy(sim, ENEMY_RODEUR, 4, 0);
    const events = run(sim, id, 2, melee);
    expect(events.filter((e) => e.t === 'swing')).toHaveLength(1);
    const def = MELEE_WEAPONS[0]!;
    expect(sim.enemies.hp[entityIndex(front)]).toBeCloseTo(ENEMIES[ENEMY_RODEUR]!.hp - def.damage, 6);
    expect(sim.enemies.hp[entityIndex(behind)]).toBe(ENEMIES[ENEMY_RODEUR]!.hp);
    expect(sim.enemies.hp[entityIndex(far)]).toBe(ENEMIES[ENEMY_RODEUR]!.hp);
  });

  it('touche plusieurs ennemis dans l\'arc, repousse et réveille', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const a = spawnEnemy(sim, ENEMY_RODEUR, 1.4, 0.5);
    const b = spawnEnemy(sim, ENEMY_RODEUR, 1.4, -0.5);
    const side = spawnEnemy(sim, ENEMY_RODEUR, 0, 1.5); // sur le côté, hors de l'arc
    run(sim, id, 1, melee);
    expect(sim.enemies.hp[entityIndex(a)]).toBeLessThan(ENEMIES[ENEMY_RODEUR]!.hp);
    expect(sim.enemies.hp[entityIndex(b)]).toBeLessThan(ENEMIES[ENEMY_RODEUR]!.hp);
    expect(sim.enemies.hp[entityIndex(side)]).toBe(ENEMIES[ENEMY_RODEUR]!.hp);
    expect(sim.enemies.state[entityIndex(a)]).toBe(STATE_CHASE);
    expect(sim.enemies.posX[entityIndex(a)]).toBeGreaterThan(1.4);
  });

  it('respecte sa cadence, tue un rôdeur en deux coups et fait peu de bruit', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const rod = spawnEnemy(sim, ENEMY_RODEUR, 1.3, 0, STATE_CHASE);
    const events = run(sim, id, MELEE_WEAPONS[0]!.cooldownTicks * 2 + 2, melee);
    expect(events.filter((e) => e.t === 'swing')).toHaveLength(3);
    expect(events.filter((e) => e.t === 'kill')).toHaveLength(1);
    expect(sim.enemyPool.alive[entityIndex(rod)]).toBe(0);
    expect(sim.players.noise[entityIndex(id)]).toBeLessThanOrEqual(MELEE_WEAPONS[0]!.noise);
  });

  it('touche aussi les gros ennemis', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const colosse = spawnEnemy(sim, ENEMY_COLOSSE, 2.4, 0);
    run(sim, id, 1, melee);
    expect(sim.enemies.hp[entityIndex(colosse)]).toBeLessThan(ENEMIES[ENEMY_COLOSSE]!.hp);
  });
});

describe('soins', () => {
  it('un bandage rend des PV, pas à pleine santé, avec un délai entre deux soins', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const i = entityIndex(id);
    run(sim, id, 1, { ...IDLE, buttons: BTN_HEAL });
    expect(bag(sim, id, ITEM_BANDAGE)).toBe(2);
    sim.players.hp[i] = 40;
    run(sim, id, 1, IDLE);
    const events = run(sim, id, 1, { ...IDLE, buttons: BTN_HEAL });
    expect(events.filter((e) => e.t === 'heal')).toHaveLength(1);
    expect(sim.players.hp[i]).toBe(40 + BANDAGE_HEAL);
    expect(bag(sim, id, ITEM_BANDAGE)).toBe(1);
    run(sim, id, 1, IDLE);
    run(sim, id, 1, { ...IDLE, buttons: BTN_HEAL });
    expect(bag(sim, id, ITEM_BANDAGE)).toBe(1); // délai non écoulé
  });

  it('préfère la trousse quand les dégâts sont importants', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const i = entityIndex(id);
    bagAdd(sim, i, ITEM_TROUSSE, 1);
    sim.players.hp[i] = 20;
    run(sim, id, 1, { ...IDLE, buttons: BTN_HEAL });
    expect(bag(sim, id, ITEM_TROUSSE)).toBe(0);
    expect(sim.players.hp[i]).toBe(80);
  });
});

describe('caisses de butin', () => {
  const crateSim = (): { sim: Sim; id: number } => {
    const sim = createSimFromMap(miniMap(), 5);
    const id = addPlayer(sim, 10, 61);
    return { sim, id };
  };
  const hold = { ...IDLE, buttons: BTN_INTERACT };

  it('se fouille en maintenant E, fait du bruit, et donne le butin de sa table', () => {
    const { sim, id } = crateSim();
    const before = bag(sim, id, ITEM_MUNITIONS_9MM) + bag(sim, id, ITEM_FERRAILLE);
    const events: SimEvent[] = [];
    for (let t = 0; t < CRATE_OPEN_TICKS - 1; t++) events.push(...run(sim, id, 1, hold));
    expect(events.some((e) => e.t === 'loot')).toBe(false);
    expect(sim.players.noise[entityIndex(id)]).toBeGreaterThanOrEqual(CRATE_NOISE - 0.5);
    events.push(...run(sim, id, 1, hold));
    const loot = events.filter((e) => e.t === 'loot');
    expect(loot).toHaveLength(1);
    const items = (loot[0] as Extract<SimEvent, { t: 'loot' }>).items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(bag(sim, id, ITEM_MUNITIONS_9MM) + bag(sim, id, ITEM_FERRAILLE)).toBeGreaterThanOrEqual(before);
    expect(sim.map!.crates[0]!.ready).toBe(false);
  });

  it('relâcher E ou s\'éloigner remet la fouille à zéro', () => {
    const { sim, id } = crateSim();
    run(sim, id, CRATE_OPEN_TICKS - 5, hold);
    run(sim, id, 1, IDLE);
    expect(sim.players.openProgress[entityIndex(id)]).toBe(0);
    const events = run(sim, id, 10, hold);
    expect(events.some((e) => e.t === 'loot')).toBe(false);
    const away = quietCrate();
    away.sim.players.posX[entityIndex(away.id)] = 40;
    expect(run(away.sim, away.id, CRATE_OPEN_TICKS + 5, hold).some((e) => e.t === 'loot')).toBe(false);
  });

  function quietCrate(): { sim: Sim; id: number } {
    return crateSim();
  }

  it('un sac plein laisse le reste dans la caisse, qui se vide quand on a de la place', () => {
    const { sim, id } = crateSim();
    const i = entityIndex(id);
    bagClear(sim, i);
    for (let s = 0; s < BAG_SLOTS; s++) bagAdd(sim, i, s % 2 === 0 ? ITEM_CHARGE_VIRALE : ITEM_TROUSSE, 100);
    const full = run(sim, id, CRATE_OPEN_TICKS + 1, hold).filter((e) => e.t === 'loot');
    expect(full).toHaveLength(1);
    expect((full[0] as Extract<SimEvent, { t: 'loot' }>).leftover).toBeGreaterThan(0);
    expect(sim.map!.crates[0]!.ready).toBe(true);
    const content = [...sim.map!.crates[0]!.items];
    bagClear(sim, i);
    run(sim, id, 1, IDLE);
    run(sim, id, CRATE_OPEN_TICKS + 1, hold);
    expect(sim.map!.crates[0]!.ready).toBe(false);
    for (let k = 0; k < content.length; k += 2) expect(bag(sim, id, content[k]!)).toBe(content[k + 1]);
  });

  it('se remplit de nouveau après son cooldown', () => {
    const { sim, id } = crateSim();
    run(sim, id, CRATE_OPEN_TICKS + 1, hold);
    const crate = sim.map!.crates[0]!;
    expect(crate.ready).toBe(false);
    expect(crate.cooldown).toBeGreaterThan(CRATE_COOLDOWN_SECONDS['commune']! * 60 - 5);
    run(sim, id, crate.cooldown + 2, IDLE);
    expect(crate.ready).toBe(true);
    expect(snapshot(sim).crates[0]).toBe(1);
  });

  it('le contenu est déterministe pour une même graine', () => {
    const open = (): number[] => {
      const { sim, id } = crateSim();
      return (run(sim, id, CRATE_OPEN_TICKS + 1, hold).find((e) => e.t === 'loot') as Extract<SimEvent, { t: 'loot' }>).items;
    };
    expect(open()).toEqual(open());
  });
});

describe('butin des ennemis', () => {
  it('un Colosse laisse toujours des objets au sol, qu\'on ramasse en marchant dessus', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const colosse = spawnEnemy(sim, ENEMY_COLOSSE, 5, 0);
    damageEnemy(sim, entityIndex(colosse), 1e9, id);
    expect(sim.pickupPool.count).toBeGreaterThan(0);
    const snap = snapshot(sim);
    expect(snap.pickupHigh).toBeGreaterThan(0);
    const events = run(sim, id, 120, { ...IDLE, moveX: 1 });
    expect(events.some((e) => e.t === 'loot')).toBe(true);
    expect(sim.pickupPool.count).toBeLessThan(snap.pickupHigh + 1);
  });

  it('les objets au sol expirent', () => {
    const sim = quietSim();
    const id = addPlayer(sim, -60, 0);
    const colosse = spawnEnemy(sim, ENEMY_COLOSSE, 5, 0);
    damageEnemy(sim, entityIndex(colosse), 1e9, id);
    expect(sim.pickupPool.count).toBeGreaterThan(0);
    for (let k = 0; k < 4; k++) run(sim, id, PICKUP_LIFE_TICKS / 4 + 2, IDLE);
    expect(sim.pickupPool.count).toBe(0);
  });

  it('un sac plein laisse les objets au sol', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const i = entityIndex(id);
    for (let s = 0; s < BAG_SLOTS; s++) bagAdd(sim, i, s % 2 === 0 ? ITEM_CHARGE_VIRALE : ITEM_TROUSSE, 100);
    const colosse = spawnEnemy(sim, ENEMY_COLOSSE, 0.3, 0);
    damageEnemy(sim, entityIndex(colosse), 1e9, id);
    const count = sim.pickupPool.count;
    run(sim, id, 10, IDLE);
    expect(sim.pickupPool.count).toBeGreaterThan(0);
    expect(sim.pickupPool.count).toBeLessThanOrEqual(count);
  });
});

describe('déterminisme avec butin', () => {
  it('même graine + mêmes entrées ⇒ même empreinte (caisses, ramassages, tirs, coups)', () => {
    const play = (): number => {
      const sim = createSimFromMap(miniMap(), 9);
      const id = addPlayer(sim, 10, 61);
      const inputs: InputFrame[] = [];
      for (let t = 1; t <= 1500; t++) {
        inputs[entityIndex(id)] = {
          tick: t,
          moveX: Math.sin(t / 40) * 0.2,
          moveY: -Math.abs(Math.cos(t / 90)) * 0.2,
          aimAngle: t * 0.05,
          buttons: BTN_INTERACT | (t % 40 < 20 ? BTN_FIRE : BTN_MELEE) | (t % 300 === 0 ? BTN_HEAL : 0),
        };
        step(sim, inputs);
      }
      return hashState(sim);
    };
    expect(play()).toBe(play());
    expect(createSim(1, emptyObstacles()).tick).toBe(0);
    expect(PLAYER_MAX_HP).toBeGreaterThan(0);
  });
});

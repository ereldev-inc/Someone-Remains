import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_BANDAGE, ITEM_CARBURANT, ITEM_CARREAUX, ITEM_CARTOUCHES, ITEM_COMPOSANTS, ITEM_FERRAILLE, ITEM_MUNITIONS_9MM, ITEM_PLAN_MACHETTE, ITEM_PLAN_POMPE, ITEM_POUDRE, ITEM_TISSU, PLAN_ITEMS, STASH_SLOTS } from './data/items';
import { LOOT_TABLES } from './data/loot';
import { MELEE_HACHE, MELEE_MACHETTE, MELEE_WEAPONS } from './data/melee';
import { RECIPES } from './data/recipes';
import { ENEMIES, ENEMY_RODEUR, RESPAWN_TICKS } from './data/enemies';
import { WEAPONS, WEAPON_ARBALETE, WEAPON_LANCE_FLAMMES, WEAPON_MITRAILLETTE, WEAPON_PISTOL, WEAPON_POMPE } from './data/weapons';
import { entityIndex } from './ecs/pool';
import { addPlayer, createSim, createSimFromMap, hashState, queueCommand, snapshot, step } from './sim';
import type { Sim } from './sim';
import { LOADOUT_ACTIVE, LOADOUT_OWNED, LOADOUT_SLOT0, LOADOUT_STRIDE, PROJ_KIND_BOLT, PROJ_KIND_FLAME } from './snapshot';
import { giveDebugKit, applyCommands } from './systems/crafting';
import { spawnEnemy, STATE_CHASE } from './systems/enemies';
import { bagAdd, bagClear, bagCount, stashAdd, stashCount } from './systems/inventory';
import { damagePlayer } from './systems/player';
import { miniMap } from './testmap';
import { emptyObstacles, quietSim, run } from './testkit';
import { BTN_FIRE, BTN_MELEE } from './types';
import type { Command, InputFrame, SimEvent } from './types';

const IDLE = { moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };

/** Joueur au refuge, à portée de l'établi et du stockage (ils sont à ±3,5 m du centre, 3 m au sud). */
function station(): { sim: Sim; id: number; i: number } {
  const sim = createSimFromMap(miniMap(), 4);
  const id = addPlayer(sim, 0, 83);
  return { sim, id, i: entityIndex(id) };
}

function send(sim: Sim, id: number, cmd: Command): SimEvent[] {
  queueCommand(sim, id, cmd);
  return run(sim, id, 1, IDLE);
}

/** Sort du refuge (qui protège), meurt, puis laisse passer la réapparition. */
function leaveRefugeAndDie(s: { sim: Sim; id: number; i: number }): void {
  s.sim.players.posY[s.i] = 50;
  run(s.sim, s.id, 1, IDLE);
  damagePlayer(s.sim, s.i, 1e9);
  run(s.sim, s.id, RESPAWN_TICKS + 2, IDLE);
}

const bag = (s: { sim: Sim; i: number }, item: number): number => bagCount(s.sim, s.i, item);
const stash = (s: { sim: Sim; i: number }, item: number): number => stashCount(s.sim, s.i, item);
const notices = (events: SimEvent[]): string[] => events.filter((e) => e.t === 'notice').map((e) => (e as Extract<SimEvent, { t: 'notice' }>).text);

describe('données de fabrication', () => {
  it('toutes les recettes et armes référencent des objets valides', () => {
    for (const r of RECIPES) {
      r.inputs.forEach(([item, n]) => {
        expect(ITEMS[item]).toBeDefined();
        expect(n).toBeGreaterThan(0);
      });
      if (r.output.kind === 'item') expect(ITEMS[r.output.item]).toBeDefined();
      if (r.output.kind === 'weapon') expect(WEAPONS[r.output.weapon]).toBeDefined();
      if (r.output.kind === 'melee') expect(MELEE_WEAPONS[r.output.weapon]).toBeDefined();
      if (r.plan >= 0) expect(PLAN_ITEMS[r.plan]).toBeDefined();
    }
    for (const w of WEAPONS) expect(ITEMS[w.ammoItem]).toBeDefined();
    // Chaque arme fabricable a une recette avec plan, et chaque plan sert à une recette.
    PLAN_ITEMS.forEach((_, bit) => expect(RECIPES.some((r) => r.plan === bit)).toBe(true));
    expect(WEAPONS).toHaveLength(5);
    expect(MELEE_WEAPONS).toHaveLength(3);
  });

  it('les plans se trouvent dans les caisses (rares et militaires en plus grand nombre)', () => {
    const weight = (table: string): number => LOOT_TABLES[table]!.entries.filter((e) => PLAN_ITEMS.includes(e.item)).reduce((s, e) => s + e.weight, 0);
    expect(weight('commune')).toBeGreaterThan(0);
    expect(weight('rare')).toBeGreaterThan(weight('commune'));
    expect(weight('militaire')).toBeGreaterThan(0);
    expect(weight('boss')).toBeGreaterThan(0);
  });
});

describe('stockage', () => {
  it('déposer et retirer se font à portée du stockage, et il survit à la mort', () => {
    const s = station();
    bagAdd(s.sim, s.i, ITEM_FERRAILLE, 15);
    send(s.sim, s.id, { t: 'stash', dir: 'in', item: ITEM_FERRAILLE, count: 10 });
    expect(bag(s, ITEM_FERRAILLE)).toBe(5);
    expect(stash(s, ITEM_FERRAILLE)).toBe(10);
    send(s.sim, s.id, { t: 'stash', dir: 'out', item: ITEM_FERRAILLE, count: 4 });
    expect(bag(s, ITEM_FERRAILLE)).toBe(9);
    expect(stash(s, ITEM_FERRAILLE)).toBe(6);

    leaveRefugeAndDie(s);
    expect(bag(s, ITEM_FERRAILLE)).toBe(0); // le sac est perdu
    expect(stash(s, ITEM_FERRAILLE)).toBe(6); // le stockage reste
  });

  it('refuse loin du stockage, ne crée ni ne perd rien, et gère les limites', () => {
    const s = station();
    bagAdd(s.sim, s.i, ITEM_FERRAILLE, 10);
    s.sim.players.posY[s.i] = 40;
    const events = send(s.sim, s.id, { t: 'stash', dir: 'in', item: ITEM_FERRAILLE, count: 10 });
    expect(notices(events)).toContain('Rapprochez-vous du stockage');
    expect(bag(s, ITEM_FERRAILLE)).toBe(10);
    expect(stash(s, ITEM_FERRAILLE)).toBe(0);

    s.sim.players.posY[s.i] = 83;
    send(s.sim, s.id, { t: 'stash', dir: 'in', item: ITEM_FERRAILLE, count: 999 }); // plus que ce qu'on a
    expect(stash(s, ITEM_FERRAILLE)).toBe(10);
    send(s.sim, s.id, { t: 'stash', dir: 'out', item: ITEM_COMPOSANTS, count: 3 }); // rien à retirer
    expect(bag(s, ITEM_COMPOSANTS)).toBe(0);
    expect(STASH_SLOTS).toBeGreaterThan(12);
  });

  it('un sac plein laisse le reste dans le stockage', () => {
    const s = station();
    bagClear(s.sim, s.i);
    for (let k = 0; k < 12; k++) bagAdd(s.sim, s.i, k % 2 === 0 ? ITEM_MUNITIONS_9MM : ITEM_CARTOUCHES, 100);
    stashAdd(s.sim, s.i, ITEM_FERRAILLE, 5);
    const events = send(s.sim, s.id, { t: 'stash', dir: 'out', item: ITEM_FERRAILLE, count: 5 });
    expect(notices(events)).toContain('Sac plein');
    expect(stash(s, ITEM_FERRAILLE)).toBe(5);
  });
});

describe('fabrication', () => {
  it('fabrique des munitions en prenant d\'abord dans le sac puis dans le stockage', () => {
    const s = station();
    bagClear(s.sim, s.i);
    bagAdd(s.sim, s.i, ITEM_FERRAILLE, 1);
    stashAdd(s.sim, s.i, ITEM_FERRAILLE, 5);
    stashAdd(s.sim, s.i, ITEM_POUDRE, 3);
    const events = send(s.sim, s.id, { t: 'craft', recipe: 0 }); // 20 × 9 mm = 2 ferraille + 1 poudre
    expect(events.some((e) => e.t === 'craft')).toBe(true);
    expect(bag(s, ITEM_MUNITIONS_9MM)).toBe(20);
    expect(bag(s, ITEM_FERRAILLE)).toBe(0);
    expect(stash(s, ITEM_FERRAILLE)).toBe(4);
    expect(stash(s, ITEM_POUDRE)).toBe(2);
  });

  it('refuse sans assez de matériaux, loin de l\'établi, ou sans plan — sans rien consommer', () => {
    const s = station();
    bagClear(s.sim, s.i);
    bagAdd(s.sim, s.i, ITEM_FERRAILLE, 1);
    expect(notices(send(s.sim, s.id, { t: 'craft', recipe: 0 }))).toContain('Matériaux insuffisants');
    expect(bag(s, ITEM_FERRAILLE)).toBe(1);

    bagAdd(s.sim, s.i, ITEM_FERRAILLE, 20);
    bagAdd(s.sim, s.i, ITEM_COMPOSANTS, 5);
    const pompe = RECIPES.findIndex((r) => r.output.kind === 'weapon' && r.output.weapon === WEAPON_POMPE);
    expect(notices(send(s.sim, s.id, { t: 'craft', recipe: pompe }))).toContain('Plan inconnu');
    expect(bag(s, ITEM_FERRAILLE)).toBe(21);

    s.sim.players.posY[s.i] = 60;
    expect(notices(send(s.sim, s.id, { t: 'craft', recipe: 0 }))).toContain('Rapprochez-vous de l\'établi');
  });

  it('apprend un plan (consommé, définitif, conservé à la mort) puis fabrique et équipe l\'arme', () => {
    const s = station();
    bagAdd(s.sim, s.i, ITEM_PLAN_POMPE, 1);
    bagAdd(s.sim, s.i, ITEM_FERRAILLE, 6);
    bagAdd(s.sim, s.i, ITEM_COMPOSANTS, 2);
    send(s.sim, s.id, { t: 'learn', item: ITEM_PLAN_POMPE });
    expect(bag(s, ITEM_PLAN_POMPE)).toBe(0);
    expect(notices(send(s.sim, s.id, { t: 'learn', item: ITEM_PLAN_POMPE }))).toEqual(['Plan déjà appris']);
    const pompe = RECIPES.findIndex((r) => r.output.kind === 'weapon' && r.output.weapon === WEAPON_POMPE);
    send(s.sim, s.id, { t: 'craft', recipe: pompe });
    expect(s.sim.players.owned[s.i]! & (1 << WEAPON_POMPE)).not.toBe(0);
    expect(s.sim.players.slotWeapon[s.i * 3 + 1]).toBe(WEAPON_POMPE); // premier emplacement libre
    expect(bag(s, ITEM_FERRAILLE)).toBe(0);
    // On ne la fabrique pas deux fois.
    bagAdd(s.sim, s.i, ITEM_FERRAILLE, 6);
    bagAdd(s.sim, s.i, ITEM_COMPOSANTS, 2);
    expect(notices(send(s.sim, s.id, { t: 'craft', recipe: pompe }))).toContain('Déjà fabriquée');

    leaveRefugeAndDie(s);
    expect(s.sim.players.owned[s.i]! & (1 << WEAPON_POMPE)).not.toBe(0); // l'arme est conservée
    expect(s.sim.players.plans[s.i]).toBe(1);
    expect(s.sim.players.slotWeapon[s.i * 3 + 1]).toBe(WEAPON_POMPE);
  });

  it('une arme de corps à corps fabriquée s\'équipe à l\'établi', () => {
    const s = station();
    giveDebugKit(s.sim, s.id);
    const recipe = RECIPES.findIndex((r) => r.output.kind === 'melee' && r.output.weapon === MELEE_MACHETTE);
    send(s.sim, s.id, { t: 'craft', recipe });
    expect(s.sim.players.meleeWeapon[s.i]).toBe(0);
    send(s.sim, s.id, { t: 'equipMelee', weapon: MELEE_MACHETTE });
    expect(s.sim.players.meleeWeapon[s.i]).toBe(MELEE_MACHETTE);
    expect(notices(send(s.sim, s.id, { t: 'equipMelee', weapon: MELEE_HACHE }))).toContain('Arme non possédée');
    expect(PLAN_ITEMS[RECIPES[recipe]!.plan]).toBe(ITEM_PLAN_MACHETTE);
  });

  it('annule tout si le résultat ne tient ni dans le sac ni dans le stockage', () => {
    const s = station();
    bagClear(s.sim, s.i);
    for (let k = 0; k < 11; k++) bagAdd(s.sim, s.i, k % 2 === 0 ? ITEM_CARTOUCHES : ITEM_CARREAUX, 24);
    bagAdd(s.sim, s.i, ITEM_TISSU, 20); // dernier emplacement : il en restera après la fabrication
    for (let k = 0; k < STASH_SLOTS; k++) stashAdd(s.sim, s.i, k % 2 === 0 ? ITEM_MUNITIONS_9MM : ITEM_CARBURANT, 100);
    const recipe = RECIPES.findIndex((r) => r.name === '2 bandages');
    const events = send(s.sim, s.id, { t: 'craft', recipe });
    expect(notices(events)).toContain('Pas de place pour le résultat');
    expect(events.some((e) => e.t === 'craft')).toBe(false);
    expect(bag(s, ITEM_TISSU)).toBe(20);
    expect(bag(s, ITEM_BANDAGE)).toBe(0);
  });
});

describe('équipement et armes', () => {
  it('commence avec le pistolet ; sélectionner un emplacement vide ne fait rien', () => {
    const s = station();
    expect(s.sim.players.weapon[s.i]).toBe(WEAPON_PISTOL);
    send(s.sim, s.id, { t: 'select', slot: 2 });
    expect(s.sim.players.activeSlot[s.i]).toBe(0);
    expect(s.sim.players.weapon[s.i]).toBe(WEAPON_PISTOL);
  });

  it('équipe une arme possédée dans un emplacement, change d\'arme et snapshot cohérent', () => {
    const s = station();
    s.sim.players.owned[s.i] = (s.sim.players.owned[s.i] as number) | (1 << WEAPON_MITRAILLETTE);
    send(s.sim, s.id, { t: 'equip', slot: 1, weapon: WEAPON_MITRAILLETTE });
    send(s.sim, s.id, { t: 'select', slot: 1 });
    expect(s.sim.players.weapon[s.i]).toBe(WEAPON_MITRAILLETTE);
    const snap = snapshot(s.sim);
    expect(snap.loadout[LOADOUT_ACTIVE]).toBe(1);
    expect(snap.loadout[LOADOUT_SLOT0 + 1]).toBe(WEAPON_MITRAILLETTE);
    expect(snap.loadout.length).toBe(LOADOUT_STRIDE);
    expect(snap.loadout[LOADOUT_OWNED]! & (1 << WEAPON_MITRAILLETTE)).not.toBe(0);
    // Une arme n'occupe qu'un emplacement.
    send(s.sim, s.id, { t: 'equip', slot: 2, weapon: WEAPON_MITRAILLETTE });
    expect(s.sim.players.slotWeapon[s.i * 3 + 1]).toBe(-1);
    expect(s.sim.players.slotWeapon[s.i * 3 + 2]).toBe(WEAPON_MITRAILLETTE);
  });

  it('refuse d\'équiper une arme non possédée ou loin de l\'établi', () => {
    const s = station();
    expect(notices(send(s.sim, s.id, { t: 'equip', slot: 1, weapon: WEAPON_POMPE }))).toContain('Arme non possédée');
    s.sim.players.owned[s.i] = (s.sim.players.owned[s.i] as number) | (1 << WEAPON_POMPE);
    s.sim.players.posY[s.i] = 60;
    expect(notices(send(s.sim, s.id, { t: 'equip', slot: 1, weapon: WEAPON_POMPE }))).toContain('Rapprochez-vous de l\'établi');
  });

  function armed(weapon: number): { sim: Sim; id: number; i: number } {
    const sim = quietSim();
    const id = addPlayer(sim);
    const i = entityIndex(id);
    sim.players.owned[i] = (sim.players.owned[i] as number) | (1 << weapon);
    sim.players.slotWeapon[i * 3] = weapon;
    sim.players.weapon[i] = weapon;
    bagClear(sim, i);
    return { sim, id, i };
  }

  it('le fusil à pompe tire 7 plombs pour une cartouche, et fait plus de bruit', () => {
    const a = armed(WEAPON_POMPE);
    bagAdd(a.sim, a.i, ITEM_CARTOUCHES, 3);
    run(a.sim, a.id, 1, { ...IDLE, buttons: BTN_FIRE });
    expect(a.sim.projectilePool.count).toBe(7);
    expect(bagCount(a.sim, a.i, ITEM_CARTOUCHES)).toBe(2);
    expect(a.sim.players.noise[a.i]).toBeGreaterThan(WEAPONS[WEAPON_PISTOL]!.noise);
  });

  it('la mitraillette tire beaucoup plus vite que le pistolet', () => {
    const shots = (weapon: number, item: number): number => {
      const a = armed(weapon);
      bagAdd(a.sim, a.i, item, 200);
      run(a.sim, a.id, 60, { ...IDLE, buttons: BTN_FIRE });
      return 200 - bagCount(a.sim, a.i, item);
    };
    expect(shots(WEAPON_MITRAILLETTE, ITEM_MUNITIONS_9MM)).toBeGreaterThan(shots(WEAPON_PISTOL, ITEM_MUNITIONS_9MM) * 2.5);
  });

  it('le lance-flammes traverse un groupe, brûle au contact et consomme du carburant', () => {
    const a = armed(WEAPON_LANCE_FLAMMES);
    bagAdd(a.sim, a.i, ITEM_CARBURANT, 50);
    const near = spawnEnemy(a.sim, ENEMY_RODEUR, 2, 0);
    const far = spawnEnemy(a.sim, ENEMY_RODEUR, 3.5, 0.2);
    run(a.sim, a.id, 20, { ...IDLE, buttons: BTN_FIRE });
    const hp = ENEMIES[ENEMY_RODEUR]!.hp;
    expect(a.sim.enemies.hp[entityIndex(near)]).toBeLessThan(hp);
    expect(a.sim.enemies.hp[entityIndex(far)]).toBeLessThan(hp);
    expect(bagCount(a.sim, a.i, ITEM_CARBURANT)).toBeLessThan(50);
    let flames = 0;
    for (let s = 0; s < a.sim.projectilePool.highWater; s++) if (a.sim.projectilePool.alive[s] === 1 && a.sim.projectiles.kind[s] === PROJ_KIND_FLAME) flames++;
    expect(flames).toBeGreaterThan(0);
  });

  it('l\'arbalète est presque silencieuse, perce deux ennemis et laisse parfois retrouver ses carreaux', () => {
    const a = armed(WEAPON_ARBALETE);
    bagAdd(a.sim, a.i, ITEM_CARREAUX, 24);
    run(a.sim, a.id, 1, { ...IDLE, buttons: BTN_FIRE });
    expect(a.sim.players.noise[a.i]).toBeLessThanOrEqual(WEAPONS[WEAPON_ARBALETE]!.noise);
    expect(a.sim.players.noise[a.i]).toBeLessThan(WEAPONS[WEAPON_PISTOL]!.noise / 2);
    let bolt = false;
    for (let s = 0; s < a.sim.projectilePool.highWater; s++) if (a.sim.projectilePool.alive[s] === 1 && a.sim.projectiles.kind[s] === PROJ_KIND_BOLT) bolt = true;
    expect(bolt).toBe(true);
    // Beaucoup de tirs contre un mur lointain : environ la moitié des carreaux se retrouvent au sol.
    const b = armed(WEAPON_ARBALETE);
    bagAdd(b.sim, b.i, ITEM_CARREAUX, 24);
    for (let k = 0; k < 24; k++) {
      run(b.sim, b.id, 61, { ...IDLE, buttons: BTN_FIRE });
    }
    run(b.sim, b.id, 80, IDLE);
    let dropped = 0;
    for (let s = 0; s < b.sim.pickupPool.highWater; s++) {
      if (b.sim.pickupPool.alive[s] === 1 && b.sim.pickups.item[s] === ITEM_CARREAUX) dropped += b.sim.pickups.count[s] as number;
    }
    expect(dropped).toBeGreaterThan(3);
    expect(dropped).toBeLessThan(24);
  });
});

describe('armes de corps à corps', () => {
  const swing = (weapon: number): { hp: number; ticks: number } => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const i = entityIndex(id);
    sim.players.meleeOwned[i] = 7;
    sim.players.meleeWeapon[i] = weapon;
    const rod = spawnEnemy(sim, ENEMY_RODEUR, 1.3, 0, STATE_CHASE);
    sim.enemies.hp[entityIndex(rod)] = 1000;
    const events = run(sim, id, 2 * 60, { ...IDLE, buttons: BTN_MELEE });
    return { hp: 1000 - (sim.enemies.hp[entityIndex(rod)] as number), ticks: events.filter((e) => e.t === 'swing').length };
  };

  it('la hache frappe fort et lentement, la machette vite et plus faiblement', () => {
    const barre = swing(0);
    const machette = swing(MELEE_MACHETTE);
    const hache = swing(MELEE_HACHE);
    expect(hache.ticks).toBeLessThan(barre.ticks);
    expect(machette.ticks).toBeGreaterThan(barre.ticks);
    expect(MELEE_WEAPONS[MELEE_HACHE]!.damage).toBeGreaterThan(MELEE_WEAPONS[0]!.damage);
    expect(MELEE_WEAPONS[MELEE_MACHETTE]!.damage).toBeLessThan(MELEE_WEAPONS[0]!.damage);
    expect(machette.hp).toBeGreaterThan(0);
    expect(hache.hp).toBeGreaterThan(0);
  });
});

describe('déterminisme avec fabrication', () => {
  it('mêmes commandes et entrées ⇒ même empreinte', () => {
    const play = (): number => {
      const sim = createSimFromMap(miniMap(), 6);
      const id = addPlayer(sim, 0, 83);
      giveDebugKit(sim, id);
      const inputs: InputFrame[] = [];
      for (let t = 1; t <= 900; t++) {
        if (t === 5) queueCommand(sim, id, { t: 'craft', recipe: 6 });
        if (t === 7) queueCommand(sim, id, { t: 'equip', slot: 1, weapon: WEAPON_POMPE });
        if (t === 9) queueCommand(sim, id, { t: 'select', slot: 1 });
        if (t === 11) queueCommand(sim, id, { t: 'stash', dir: 'out', item: ITEM_CARTOUCHES, count: 12 });
        inputs[entityIndex(id)] = { tick: t, moveX: 0, moveY: -0.3, aimAngle: t * 0.04, buttons: t > 20 ? BTN_FIRE : 0 };
        step(sim, inputs);
      }
      return hashState(sim);
    };
    expect(play()).toBe(play());
    expect(createSim(1, emptyObstacles()).commands).toEqual([]);
    expect(typeof applyCommands).toBe('function');
  });
});

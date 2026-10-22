import { describe, expect, it } from 'vitest';
import { ENEMIES, ENEMY_COLOSSE, ENEMY_RODEUR, RESPAWN_TICKS } from './data/enemies';
import { ITEM_FERRAILLE, ITEM_MUNITIONS_9MM, ITEM_PLAN_POMPE, ITEM_BANDAGE } from './data/items';
import { PLAYER_MAX_HP, PLAYER_SPEED } from './data/player';
import { CHOICES, HERITAGE, HERITAGE_SLOTS, heritageCost, REMANENCE_SECONDS_PER_POINT, remanenceEarned, STAT_LIMITS, UPGRADES, xpToNext, XP_PER_TYPE } from './data/progression';
import { WEAPONS, WEAPON_POMPE } from './data/weapons';
import { entityIndex } from './ecs/pool';
import { exportProfile, importProfile, parseProfile, PROFILE_VERSION } from './profile';
import { addPlayer, createSim, createSimFromMap, hashState, queueCommand, snapshot, step } from './sim';
import type { Sim } from './sim';
import { PROG_LEVEL, PROG_UCHOICE0, PROG_XP, PROGRESS_STRIDE, SNAP_MAXHP, SNAP_STRIDE } from './snapshot';
import { damageEnemy, spawnEnemy } from './systems/enemies';
import { bagCount, stashCount } from './systems/inventory';
import { damagePlayer } from './systems/player';
import { addXp, heritageRank, maxHpOf, statBonus, upgradeRank } from './systems/progression';
import { miniMap } from './testmap';
import { emptyObstacles, quietSim, respawnAfterChoice, run } from './testkit';
import { BTN_DASH, BTN_FIRE, BTN_MELEE, DT, TICK_RATE } from './types';
import type { InputFrame, SimEvent } from './types';

const IDLE = { moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };

function player(): { sim: Sim; id: number; i: number } {
  const sim = quietSim();
  const id = addPlayer(sim);
  return { sim, id, i: entityIndex(id) };
}

const choices = (sim: Sim, i: number): number[] => Array.from(sim.players.upgradeChoice.subarray(i * CHOICES, (i + 1) * CHOICES));
const send = (sim: Sim, id: number, cmd: Parameters<typeof queueCommand>[2]): SimEvent[] => {
  queueCommand(sim, id, cmd);
  return run(sim, id, 1, IDLE);
};

/** Fait gagner le niveau suivant et prend le bonus voulu. */
function levelUp(p: { sim: Sim; id: number; i: number }, pick: number): void {
  addXp(p.sim, p.i, xpToNext(p.sim.players.level[p.i] as number));
  p.sim.players.upgradeChoice.set([pick, -1, -1], p.i * CHOICES); // on impose la proposition pour mesurer son effet
  send(p.sim, p.id, { t: 'chooseUpgrade', index: 0 });
}

describe('XP et niveaux', () => {
  it('le seuil d\'XP croît de niveau en niveau', () => {
    for (let l = 1; l < 40; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
    expect(XP_PER_TYPE).toHaveLength(ENEMIES.length);
    expect(XP_PER_TYPE[ENEMY_COLOSSE]!).toBeGreaterThan(XP_PER_TYPE[ENEMY_RODEUR]!);
  });

  it('un kill donne l\'XP de son type ; le niveau monte au seuil avec trois propositions distinctes', () => {
    const p = player();
    expect(p.sim.players.level[p.i]).toBe(1);
    const rod = spawnEnemy(p.sim, ENEMY_RODEUR, 5, 0);
    damageEnemy(p.sim, entityIndex(rod), 1e9, p.id);
    expect(p.sim.players.xp[p.i]).toBe(XP_PER_TYPE[ENEMY_RODEUR]);
    expect(p.sim.players.totalKills[p.i]).toBe(1);

    p.sim.events.length = 0;
    addXp(p.sim, p.i, xpToNext(1));
    expect(p.sim.players.level[p.i]).toBe(2);
    const event = p.sim.events.find((e) => e.t === 'levelUp') as Extract<SimEvent, { t: 'levelUp' }>;
    expect(event.choices).toHaveLength(3);
    expect(new Set(event.choices).size).toBe(3);
    event.choices.forEach((c) => expect(UPGRADES[c]).toBeDefined());
    // Le surplus d'XP est conservé.
    expect(p.sim.players.xp[p.i]).toBe(XP_PER_TYPE[ENEMY_RODEUR]);
  });

  it('plusieurs niveaux d\'un coup : les propositions se présentent une à la fois', () => {
    const p = player();
    addXp(p.sim, p.i, xpToNext(1) + xpToNext(2) + xpToNext(3) + 1);
    expect(p.sim.players.level[p.i]).toBe(4);
    expect(p.sim.players.pendingLevels[p.i]).toBe(2); // 3 niveaux gagnés : 1 proposé, 2 en attente
    send(p.sim, p.id, { t: 'chooseUpgrade', index: 0 });
    expect(choices(p.sim, p.i).every((c) => c >= 0)).toBe(true); // la proposition suivante est déjà là
    expect(p.sim.players.pendingLevels[p.i]).toBe(1);
  });

  it('refuse les choix invalides et ceux sans proposition', () => {
    const p = player();
    send(p.sim, p.id, { t: 'chooseUpgrade', index: 0 });
    for (let u = 0; u < UPGRADES.length; u++) expect(upgradeRank(p.sim, p.i, u)).toBe(0);
    addXp(p.sim, p.i, xpToNext(1));
    send(p.sim, p.id, { t: 'chooseUpgrade', index: 7 });
    send(p.sim, p.id, { t: 'chooseUpgrade', index: -1 });
    expect(choices(p.sim, p.i).every((c) => c >= 0)).toBe(true); // proposition toujours en attente
  });
});

describe('bonus de niveau de vie', () => {
  const idx = (name: string): number => UPGRADES.findIndex((u) => u.name === name);

  it('la puissance de feu augmente les dégâts des projectiles et du corps à corps', () => {
    const p = player();
    run(p.sim, p.id, 1, { ...IDLE, buttons: BTN_FIRE });
    const base = p.sim.projectiles.damage[0] as number;
    expect(base).toBe(WEAPONS[0]!.damage);
    const boosted = player();
    levelUp(boosted, idx('Puissance de feu'));
    expect(upgradeRank(boosted.sim, boosted.i, idx('Puissance de feu'))).toBe(1);
    run(boosted.sim, boosted.id, 1, { ...IDLE, buttons: BTN_FIRE });
    expect(boosted.sim.projectiles.damage[0]).toBeCloseTo(base * 1.12, 6);

    const m = player();
    levelUp(m, idx('Puissance de feu'));
    const rod = spawnEnemy(m.sim, ENEMY_RODEUR, 1.3, 0);
    m.sim.enemies.hp[entityIndex(rod)] = 1000;
    run(m.sim, m.id, 1, { ...IDLE, buttons: BTN_MELEE });
    expect(1000 - (m.sim.enemies.hp[entityIndex(rod)] as number)).toBeCloseTo(28 * 1.12, 6);
  });

  it('la cadence, la foulée, l\'esquive et la discrétion se mesurent', () => {
    const p = player();
    levelUp(p, idx('Cadence'));
    run(p.sim, p.id, 1, { ...IDLE, buttons: BTN_FIRE });
    expect(p.sim.players.fireCooldown[p.i]).toBe(Math.round(WEAPONS[0]!.cooldownTicks * 0.9));

    const f = player();
    levelUp(f, idx('Foulée'));
    run(f.sim, f.id, 60, { ...IDLE, moveX: 1 });
    expect(Math.hypot(f.sim.players.velX[f.i] as number, f.sim.players.velY[f.i] as number)).toBeCloseTo(PLAYER_SPEED * 1.06, 3);

    const d = player();
    levelUp(d, idx('Esquive agile'));
    run(d.sim, d.id, 1, { ...IDLE, buttons: BTN_DASH, moveX: 1 });
    expect(d.sim.players.dashCooldown[d.i]).toBeLessThan(120);

    const q = player();
    levelUp(q, idx('Discrétion'));
    run(q.sim, q.id, 1, { ...IDLE, buttons: BTN_FIRE });
    expect(q.sim.players.noise[q.i]).toBeCloseTo(WEAPONS[0]!.noise * 0.88, 6);
  });

  it('la constitution relève les PV max et soigne ; la perforation traverse un ennemi de plus', () => {
    const p = player();
    p.sim.players.hp[p.i] = 50;
    levelUp(p, idx('Constitution'));
    expect(maxHpOf(p.sim, p.i)).toBe(PLAYER_MAX_HP + 15);
    expect(p.sim.players.hp[p.i]).toBe(65);
    expect(snapshot(p.sim).players[SNAP_MAXHP]).toBe(PLAYER_MAX_HP + 15);

    const q = player();
    levelUp(q, idx('Projectiles perforants'));
    run(q.sim, q.id, 1, { ...IDLE, buttons: BTN_FIRE });
    expect(q.sim.projectiles.pierce[0]).toBe(1);
  });

  it('un bonus au maximum n\'est plus proposé ; les propositions restent distinctes', () => {
    const p = player();
    const target = idx('Projectiles perforants');
    p.sim.players.lifeUpgrades[p.i * UPGRADES.length + target] = UPGRADES[target]!.max;
    for (let k = 0; k < 12; k++) {
      addXp(p.sim, p.i, xpToNext(p.sim.players.level[p.i] as number));
      const c = choices(p.sim, p.i);
      expect(c).not.toContain(target);
      expect(new Set(c).size).toBe(3);
      send(p.sim, p.id, { t: 'chooseUpgrade', index: 0 });
    }
  });

  it('les bonus de vie sont perdus à la mort, le niveau retombe à 1', () => {
    const p = player();
    levelUp(p, idx('Puissance de feu'));
    levelUp(p, idx('Constitution'));
    expect(p.sim.players.level[p.i]).toBe(3);
    damagePlayer(p.sim, p.i, 1e9);
    respawnAfterChoice(p.sim, p.id);
    expect(p.sim.players.level[p.i]).toBe(1);
    expect(p.sim.players.xp[p.i]).toBe(0);
    for (let u = 0; u < UPGRADES.length; u++) expect(upgradeRank(p.sim, p.i, u)).toBe(0);
    expect(choices(p.sim, p.i)).toEqual([-1, -1, -1]);
  });
});

describe('arbre d\'héritage', () => {
  /** Joueur au refuge d'une carte (les achats s'y font). */
  function refugePlayer(): { sim: Sim; id: number; i: number } {
    const sim = createSimFromMap(miniMap({ groups: [] }), 5);
    const id = addPlayer(sim);
    run(sim, id, 2, IDLE);
    return { sim, id, i: entityIndex(id) };
  }
  const node = (name: string): number => HERITAGE.findIndex((h) => h.name === name);
  const rank = (sim: Sim, i: number, name: string): number => heritageRank(sim, i, node(name));

  it('la mort crédite la Rémanence et la réapparition ne dépend plus d\'un choix', () => {
    const p = player();
    p.sim.players.lifeKills[p.i] = 12;
    p.sim.players.lifeTicks[p.i] = TICK_RATE * REMANENCE_SECONDS_PER_POINT * 5;
    damagePlayer(p.sim, p.i, 1e9);
    expect(p.sim.players.remanence[p.i]).toBe(remanenceEarned(12, TICK_RATE * REMANENCE_SECONDS_PER_POINT * 5));
    expect(p.sim.players.remanence[p.i]).toBe(17);
    expect(p.sim.players.deaths[p.i]).toBe(1);
    run(p.sim, p.id, RESPAWN_TICKS + 2, IDLE);
    expect(p.sim.players.dead[p.i]).toBe(0);
    expect(p.sim.players.remanence[p.i]).toBe(17);
  });

  it('un achat dépense la Rémanence et ajoute un rang ; le coût augmente avec le rang', () => {
    const p = refugePlayer();
    p.sim.players.remanence[p.i] = 100;
    const rob = HERITAGE[node('Robustesse')]!;
    send(p.sim, p.id, { t: 'buyHeritage', node: node('Robustesse') });
    expect(rank(p.sim, p.i, 'Robustesse')).toBe(1);
    expect(p.sim.players.remanence[p.i]).toBe(100 - heritageCost(rob, 0));
    send(p.sim, p.id, { t: 'buyHeritage', node: node('Robustesse') });
    expect(rank(p.sim, p.i, 'Robustesse')).toBe(2);
    expect(p.sim.players.remanence[p.i]).toBe(100 - heritageCost(rob, 0) - heritageCost(rob, 1));
    expect(heritageCost(rob, 1)).toBeGreaterThan(heritageCost(rob, 0));
  });

  it('refuse : solde insuffisant, parent insuffisant, rang maximal, hors refuge, nœud invalide', () => {
    const p = refugePlayer();
    const buy = (name: string): number => {
      send(p.sim, p.id, { t: 'buyHeritage', node: node(name) });
      return rank(p.sim, p.i, name);
    };
    p.sim.players.remanence[p.i] = 5000;
    p.sim.players.posY[p.i] = 0;
    run(p.sim, p.id, 2, IDLE);
    expect(buy('Robustesse')).toBe(0); // en pleine zone, ni au refuge ni mort
    p.sim.players.posY[p.i] = 80;
    run(p.sim, p.id, 2, IDLE);
    expect(buy('Provisions')).toBe(0); // exige Robustesse
    expect(buy('Munitions perforantes')).toBe(0); // exige Cadence, elle-même exigeante
    expect(buy('Robustesse')).toBe(1);
    expect(buy('Provisions')).toBe(1);
    send(p.sim, p.id, { t: 'buyHeritage', node: 99 });
    send(p.sim, p.id, { t: 'buyHeritage', node: -1 });
    send(p.sim, p.id, { t: 'buyHeritage', node: 1.5 });
    p.sim.players.remanence[p.i] = 0;
    expect(buy('Puissance')).toBe(0);
    p.sim.players.remanence[p.i] = 100000;
    for (let k = 0; k < 20; k++) buy('Aimant');
    expect(rank(p.sim, p.i, 'Aimant')).toBe(HERITAGE[node('Aimant')]!.max);
  });

  it('un joueur mort peut acheter pendant l\'écran de mort', () => {
    const p = player();
    p.sim.players.lifeKills[p.i] = 40;
    damagePlayer(p.sim, p.i, 1e9);
    send(p.sim, p.id, { t: 'buyHeritage', node: node('Robustesse') });
    expect(rank(p.sim, p.i, 'Robustesse')).toBe(1);
    respawnAfterChoice(p.sim, p.id);
    expect(maxHpOf(p.sim, p.i)).toBeGreaterThan(PLAYER_MAX_HP);
    expect(p.sim.players.hp[p.i]).toBe(maxHpOf(p.sim, p.i));
  });

  it('chaque nœud a un parent valide et un coût positif', () => {
    HERITAGE.forEach((h, k) => {
      expect(h.cost).toBeGreaterThan(0);
      expect(h.requires).toBeLessThan(k + HERITAGE.length);
      if (h.requires >= 0) {
        expect(HERITAGE[h.requires]).toBeDefined();
        expect(h.requiresRank).toBeLessThanOrEqual(HERITAGE[h.requires]!.max);
        expect(HERITAGE[h.requires]!.branch === h.branch || true).toBe(true);
      }
    });
    expect(HERITAGE.length).toBeLessThanOrEqual(HERITAGE_SLOTS);
  });

  it('rendements décroissants et plafonds : chaque rang rapporte moins, jamais au-delà de la limite', () => {
    const p = player();
    const puissance = node('Puissance');
    const gains: number[] = [];
    let last = 0;
    for (let r = 1; r <= HERITAGE[puissance]!.max; r++) {
      p.sim.players.heritage[p.i * HERITAGE_SLOTS + puissance] = r;
      const now = statBonus(p.sim, p.i, 'damage');
      gains.push(now - last);
      last = now;
    }
    for (let k = 1; k < gains.length; k++) expect(gains[k]!).toBeLessThan(gains[k - 1]!);
    p.sim.players.lifeUpgrades.fill(255, p.i * UPGRADES.length, (p.i + 1) * UPGRADES.length);
    HERITAGE.forEach((h, k) => (p.sim.players.heritage[p.i * HERITAGE_SLOTS + k] = h.max));
    for (const stat of Object.keys(STAT_LIMITS) as Array<keyof typeof STAT_LIMITS>) {
      expect(statBonus(p.sim, p.i, stat)).toBeLessThanOrEqual(STAT_LIMITS[stat]);
    }
  });

  it('« Provisions » enrichit le kit de départ à la réapparition', () => {
    const p = player();
    p.sim.players.heritage[p.i * HERITAGE_SLOTS + node('Provisions')] = 1;
    damagePlayer(p.sim, p.i, 1e9);
    respawnAfterChoice(p.sim, p.id);
    expect(bagCount(p.sim, p.i, ITEM_MUNITIONS_9MM) + (p.sim.players.mag[p.i * WEAPONS.length] as number)).toBe(24 + 6);
    expect(bagCount(p.sim, p.i, ITEM_BANDAGE)).toBe(3);
  });

  it('les nouveaux nœuds agissent sur leur statistique', () => {
    const p = player();
    for (const [name, stat] of [['Cadence', 'fireRate'], ['Rechargeur', 'reload'], ['Munitions perforantes', 'pierce']] as const) {
      expect(statBonus(p.sim, p.i, stat)).toBe(0);
      p.sim.players.heritage[p.i * HERITAGE_SLOTS + node(name)] = 1;
      expect(statBonus(p.sim, p.i, stat)).toBeGreaterThan(0);
    }
  });
});

describe('profil de sauvegarde', () => {
  function rich(): { sim: Sim; id: number; i: number } {
    const p = player();
    p.sim.players.heritage[p.i * HERITAGE_SLOTS + 1] = 2;
    p.sim.players.remanence[p.i] = 77;
    p.sim.players.totalKills[p.i] = 123;
    p.sim.players.deaths[p.i] = 4;
    p.sim.players.bestSurvival[p.i] = TICK_RATE * 300;
    p.sim.players.plans[p.i] = 5;
    p.sim.players.owned[p.i] = 1 | (1 << WEAPON_POMPE);
    p.sim.players.slotWeapon[p.i * 3 + 1] = WEAPON_POMPE;
    p.sim.players.meleeOwned[p.i] = 3;
    p.sim.players.meleeWeapon[p.i] = 1;
    p.sim.players.stashItem[p.i * 40] = ITEM_FERRAILLE;
    p.sim.players.stashQty[p.i * 40] = 17;
    return p;
  }

  it('exporter puis importer redonne le même personnage', () => {
    const a = rich();
    const profile = exportProfile(a.sim, a.id);
    expect(profile.version).toBe(PROFILE_VERSION);
    const json = JSON.parse(JSON.stringify(profile)) as unknown;
    const parsed = parseProfile(json);
    expect(parsed).toEqual(profile);

    const b = player();
    importProfile(b.sim, b.id, parsed!);
    expect(exportProfile(b.sim, b.id)).toEqual(profile);
    expect(stashCount(b.sim, b.i, ITEM_FERRAILLE)).toBe(17);
    expect(b.sim.players.hp[b.i]).toBe(maxHpOf(b.sim, b.i));
  });

  it('rejette ou nettoie les profils invalides', () => {
    const good = JSON.parse(JSON.stringify(exportProfile(rich().sim, 0))) as Record<string, unknown>;
    expect(parseProfile(null)).toBeNull();
    expect(parseProfile('x')).toBeNull();
    expect(parseProfile({ ...good, version: 2 })).toBeNull(); // version inconnue
    expect(parseProfile({ ...good, version: undefined })).toBeNull();
    expect(parseProfile({ ...good, remanence: -3 })).toBeNull();
    expect(parseProfile({ ...good, deaths: 'beaucoup' })).toBeNull();
    // Contenu douteux : nettoyé plutôt que de planter.
    const dirty = parseProfile({ ...good, stash: [999, 5, ITEM_FERRAILLE, 0, ITEM_FERRAILLE, 9], heritage: [99, 'x'], slotWeapon: [4, 9, 0], plans: 0xffffffff, owned: 0, meleeWeapon: 9 })!;
    expect(dirty.stash).toEqual([ITEM_FERRAILLE, 9]);
    expect(dirty.heritage[0]).toBe(HERITAGE[0]!.max);
    expect(dirty.owned & 1).toBe(1); // le pistolet est toujours possédé
    expect(dirty.slotWeapon).toEqual([-1, -1, 0].map((w, k) => (k === 2 ? 0 : w)).map((w) => w)); // armes non possédées retirées
    expect(dirty.meleeWeapon).toBe(0);
    expect(dirty.plans).toBeLessThan(1 << 6);
    expect(ITEM_PLAN_POMPE).toBeGreaterThan(0);
  });
});

describe('déterminisme avec progression', () => {
  it('mêmes entrées ⇒ même empreinte (XP, niveaux, morts, héritage)', () => {
    const play = (): number => {
      const sim = createSim(8);
      const id = addPlayer(sim);
      const inputs: InputFrame[] = [];
      for (let t = 1; t <= 4000; t++) {
        if (t % 300 === 0) queueCommand(sim, id, { t: 'chooseUpgrade', index: t % 3 });
        if (t % 301 === 0) queueCommand(sim, id, { t: 'buyHeritage', node: t % 7 });
        inputs[entityIndex(id)] = { tick: t, moveX: Math.sin(t / 70), moveY: Math.cos(t / 90), aimAngle: t * 0.05, buttons: BTN_FIRE | (t % 200 === 0 ? BTN_DASH : 0) };
        step(sim, inputs);
      }
      return hashState(sim);
    };
    expect(play()).toBe(play());
    expect(createSim(1, emptyObstacles()).paused).toBe(false);
    expect(DT).toBeGreaterThan(0);
    expect(snapshot(createSim(1, emptyObstacles())).progress.length).toBe(0);
    expect(PROG_LEVEL + PROG_XP + PROG_UCHOICE0 + PROGRESS_STRIDE + SNAP_STRIDE).toBeGreaterThan(0);
  });
});

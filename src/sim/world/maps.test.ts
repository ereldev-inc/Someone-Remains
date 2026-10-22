import { describe, expect, it } from 'vitest';
import { MAPS } from '../data/maps';
import { DIFFICULTY_PROFILES } from '../data/difficulty';
import { ENEMIES, ENEMY_RODEUR } from '../data/enemies';
import { PLAYER_MAX_HP, PLAYER_RADIUS } from '../data/player';
import { entityIndex } from '../ecs/pool';
import { addPlayer, createSimFromMap, hashState, snapshot, step } from '../sim';
import { FLAG_SAFE, SNAP_FLAGS, SNAP_STRIDE } from '../snapshot';
import { damageEnemy, spawnEnemy, STATE_CHASE } from '../systems/enemies';
import { damagePlayer } from '../systems/player';
import { BTN_FIRE } from '../types';
import type { InputFrame } from '../types';
import { respawnAfterChoice, run } from '../testkit';
import type { MapDef } from './mapdef';
import { parseMap } from './parseMap';
import { validateMap } from './validateMap';
import { miniMap } from '../testmap';

const IDLE = { moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };

describe('cartes du jeu', () => {
  it('chaque carte est valide', () => {
    for (const [id, def] of Object.entries(MAPS)) {
      const { errors } = validateMap(def);
      expect(errors, `${id}\n${errors.join('\n')}`).toEqual([]);
      expect(def.id).toBe(id);
    }
  });

  it('la carte 1 est une campagne de 1000 m, avec tous les types d\'ennemis', () => {
    const def = MAPS['niveau-1-campagne']!;
    expect(def.size).toBe(1000);
    const { stats } = validateMap(def);
    expect(Object.keys(stats.perType).sort()).toEqual(ENEMIES.map((e) => e.name).sort());
    expect(stats.densityPerHectare).toBeGreaterThanOrEqual(6);
    expect(stats.densityPerHectare).toBeLessThanOrEqual(10);
    expect(stats.reachableRatio).toBeGreaterThan(0.95);
  });

  it('les profils de difficulté croissent de niveau en niveau', () => {
    const ids = Object.keys(DIFFICULTY_PROFILES).sort();
    expect(ids).toHaveLength(6);
    let prev = DIFFICULTY_PROFILES[ids[0]!]!;
    for (const id of ids.slice(1)) {
      const p = DIFFICULTY_PROFILES[id]!;
      expect(p.hpMult).toBeGreaterThan(prev.hpMult);
      expect(p.damageMult).toBeGreaterThan(prev.damageMult);
      prev = p;
    }
    for (const p of Object.values(DIFFICULTY_PROFILES)) {
      p.allowedTypes.forEach((t) => expect(ENEMIES.some((e) => e.name === t)).toBe(true));
    }
  });
});

describe('lecture et validation', () => {
  it('refuse un JSON mal formé', () => {
    expect(() => parseMap({})).toThrow(/Carte invalide/);
    const bad = JSON.parse(JSON.stringify(miniMap())) as Record<string, unknown>;
    (bad['obstacles'] as unknown[]).push({ kind: 'triangle' });
    expect(() => parseMap(bad)).toThrow(/obstacles\[1\]/);
  });

  it('la carte de test est valide et se relit à l\'identique', () => {
    expect(validateMap(miniMap()).errors).toEqual([]);
    expect(parseMap(JSON.parse(JSON.stringify(miniMap())))).toEqual(miniMap());
  });

  it('détecte les erreurs de conception', () => {
    const wallBox = { kind: 'box' as const, x: 0, y: 20, w: 6, h: 6, style: 'building' as const };
    const cases: Array<[string, Partial<MapDef>, RegExp]> = [
      ['groupe dans un obstacle', { obstacles: [wallBox] }, /point d'attache dans un obstacle/],
      ['type interdit par le profil', { groups: [{ id: 'g', x: 0, y: 20, radius: 6, activation: 30, members: [{ type: 'colosse', count: 1 }] }] }, /interdit par le profil/],
      ['type inconnu', { groups: [{ id: 'g', x: 0, y: 20, radius: 6, activation: 30, members: [{ type: 'dragon', count: 1 }] }] }, /type inconnu/],
      ['densité trop forte', { groups: [{ id: 'g', x: 0, y: 20, radius: 6, activation: 30, members: [{ type: 'rodeur', count: 200 }] }] }, /densité/],
      ['groupe dans le refuge', { groups: [{ id: 'g', x: 0, y: 80, radius: 3, activation: 30, members: [{ type: 'rodeur', count: 10 }] }] }, /trop près d'un refuge/],
      ['départ hors du refuge', { playerStart: { x: 50, y: 50 } }, /départ doit être dans le premier refuge/],
      ['obstacle hors carte', { obstacles: [{ kind: 'circle', x: 500, y: 0, r: 2, style: 'rock' }] }, /hors de la carte/],
      ['id en double', { crates: [{ id: 'c', x: 10, y: 60, tier: 'commune' }, { id: 'c', x: 12, y: 60, tier: 'rare' }] }, /en double/],
      ['profil inconnu', { difficulty: 'niveau-9' }, /profil de difficulté inconnu/],
    ];
    for (const [label, patch, expected] of cases) {
      const { errors } = validateMap(miniMap(patch));
      expect(errors.some((e) => expected.test(e)), `${label}\n${errors.join('\n')}`).toBe(true);
    }
  });

  it('détecte une caisse emmurée', () => {
    const ring = [
      { kind: 'box' as const, x: 40, y: 20, w: 12, h: 2, style: 'wall' as const },
      { kind: 'box' as const, x: 40, y: 32, w: 12, h: 2, style: 'wall' as const },
      { kind: 'box' as const, x: 34, y: 26, w: 2, h: 14, style: 'wall' as const },
      { kind: 'box' as const, x: 46, y: 26, w: 2, h: 14, style: 'wall' as const },
    ];
    const { errors } = validateMap(miniMap({ obstacles: ring, crates: [{ id: 'enfermee', x: 40, y: 26, tier: 'commune' }] }));
    expect(errors.some((e) => /caisse enfermee inaccessible/.test(e))).toBe(true);
  });
});

describe('simulation avec une carte', () => {
  it('démarre au départ de la carte, dans le refuge', () => {
    const sim = createSimFromMap(miniMap());
    const id = addPlayer(sim);
    run(sim, id, 1, IDLE);
    expect(sim.players.posX[entityIndex(id)]).toBe(0);
    expect(sim.players.posY[entityIndex(id)]).toBe(80);
    expect(sim.enemyPool.count).toBe(0); // pas d'apparition ambiante
    expect(snapshot(sim).players[SNAP_FLAGS]! & FLAG_SAFE).toBe(FLAG_SAFE);
  });

  it('un groupe n\'apparaît que quand un joueur entre dans son rayon d\'activation, une seule fois', () => {
    const sim = createSimFromMap(miniMap());
    const id = addPlayer(sim);
    run(sim, id, 120, IDLE);
    expect(sim.enemyPool.count).toBe(0);
    sim.players.posY[entityIndex(id)] = 45; // à 25 m du groupe (activation : 30)
    run(sim, id, 1, IDLE);
    expect(sim.enemyPool.count).toBe(3);
    for (let s = 0; s < sim.enemyPool.highWater; s++) {
      expect(Math.hypot(sim.enemies.posX[s] as number, (sim.enemies.posY[s] as number) - 20)).toBeLessThanOrEqual(8);
      expect(sim.enemies.persistent[s]).toBe(1);
    }
    // Tuer un membre ne déclenche pas de réapparition.
    damageEnemy(sim, 0, 1e9, id);
    run(sim, id, 600, IDLE);
    let group = 0;
    for (let s = 0; s < sim.enemyPool.highWater; s++) if (sim.enemyPool.alive[s] === 1 && sim.enemies.persistent[s] === 1) group++;
    expect(group).toBe(2);
  });

  it('applique les multiplicateurs du profil et des zones aux PV et aux dégâts', () => {
    const zone = { id: 'dur', shape: { kind: 'circle' as const, x: 0, y: 20, r: 12 }, hpMult: 2, damageMult: 1.5 };
    const sim = createSimFromMap(miniMap({ zones: [zone] }));
    const id = addPlayer(sim);
    sim.players.posY[entityIndex(id)] = 45;
    run(sim, id, 1, IDLE);
    const profile = DIFFICULTY_PROFILES['niveau-2']!;
    for (let s = 0; s < sim.enemyPool.highWater; s++) {
      expect(sim.enemies.maxHp[s]).toBeCloseTo(ENEMIES[ENEMY_RODEUR]!.hp * profile.hpMult * 2, 6);
      expect(sim.enemies.dmgMult[s]).toBeCloseTo(profile.damageMult * 1.5, 6);
    }
    // Les dégâts de contact suivent le multiplicateur.
    const dmgSim = createSimFromMap(miniMap());
    const p = addPlayer(dmgSim, 0, 0);
    spawnEnemy(dmgSim, ENEMY_RODEUR, 0.3, 0, STATE_CHASE, 1, 3);
    run(dmgSim, p, 3, IDLE);
    expect(dmgSim.players.hp[entityIndex(p)]).toBe(PLAYER_MAX_HP - ENEMIES[ENEMY_RODEUR]!.contactDamage * 3);
  });

  it('les ennemis restent en place quand le joueur s\'éloigne (pas de recyclage des groupes)', () => {
    const sim = createSimFromMap(miniMap());
    const id = addPlayer(sim);
    sim.players.posY[entityIndex(id)] = 45;
    run(sim, id, 1, IDLE);
    sim.players.posY[entityIndex(id)] = 95; // loin au sud, à plus de 70 m des rôdeurs
    sim.players.posX[entityIndex(id)] = 0;
    run(sim, id, 200, IDLE);
    expect(sim.enemyPool.count).toBe(3);
  });

  it('le refuge est sûr : pas de ciblage, pas de dégâts, aucun ennemi n\'y entre', () => {
    const sim = createSimFromMap(miniMap());
    const id = addPlayer(sim);
    const rod = spawnEnemy(sim, ENEMY_RODEUR, 0, 60, STATE_CHASE);
    run(sim, id, 300, IDLE);
    expect(sim.players.hp[entityIndex(id)]).toBe(PLAYER_MAX_HP);
    const e = entityIndex(rod);
    const d = Math.hypot(sim.enemies.posX[e] as number, (sim.enemies.posY[e] as number) - 80);
    expect(d).toBeGreaterThanOrEqual(10 + ENEMIES[ENEMY_RODEUR]!.radius - 0.01);
    expect(damagePlayer(sim, entityIndex(id), 50)).toBe(false);
  });

  it('en sortant du refuge, le joueur redevient vulnérable', () => {
    const sim = createSimFromMap(miniMap());
    const id = addPlayer(sim);
    run(sim, id, 1, IDLE);
    sim.players.posY[entityIndex(id)] = 60;
    spawnEnemy(sim, ENEMY_RODEUR, 0, 59.6, STATE_CHASE);
    run(sim, id, 10, IDLE);
    expect(sim.players.hp[entityIndex(id)]).toBeLessThan(PLAYER_MAX_HP);
  });

  it('réapparaît au refuge après la mort, sans retirer les ennemis de la carte', () => {
    const sim = createSimFromMap(miniMap());
    const id = addPlayer(sim);
    run(sim, id, 1, IDLE);
    sim.players.posY[entityIndex(id)] = 45;
    run(sim, id, 1, IDLE);
    const groupSize = sim.enemyPool.count;
    damagePlayer(sim, entityIndex(id), 1e9);
    respawnAfterChoice(sim, id);
    expect(sim.players.dead[entityIndex(id)]).toBe(0);
    expect(sim.players.posY[entityIndex(id)]).toBe(80);
    expect(sim.enemyPool.count).toBe(groupSize);
    expect(PLAYER_RADIUS).toBeGreaterThan(0);
  });

  it('les limites de la carte retiennent le joueur et détruisent les projectiles', () => {
    const sim = createSimFromMap(miniMap());
    const id = addPlayer(sim);
    run(sim, id, 600, { ...IDLE, moveY: 1 });
    expect(sim.players.posY[entityIndex(id)]).toBeLessThanOrEqual(100);
    run(sim, id, 300, { ...IDLE, moveX: 1 });
    expect(sim.players.posX[entityIndex(id)]).toBeLessThanOrEqual(100);
    const shooter = createSimFromMap(miniMap());
    const s = addPlayer(shooter);
    run(shooter, s, 10, { ...IDLE, aimAngle: Math.PI / 2, buttons: BTN_FIRE });
    run(shooter, s, 90, { ...IDLE, aimAngle: Math.PI / 2 });
    expect(shooter.projectilePool.count).toBe(0);
  });

  it('un mur de la carte arrête le joueur', () => {
    const sim = createSimFromMap(miniMap());
    const id = addPlayer(sim, 20, 0);
    run(sim, id, 120, { ...IDLE, moveX: 1 });
    expect(sim.players.posX[entityIndex(id)]).toBeLessThanOrEqual(38 - PLAYER_RADIUS + 1e-6);
  });

  it('est déterministe : mêmes entrées ⇒ même empreinte sur la carte 1', () => {
    const play = (): number => {
      const sim = createSimFromMap(MAPS['niveau-1-campagne']!, 3);
      const id = addPlayer(sim);
      const inputs: InputFrame[] = [];
      for (let t = 1; t <= 1800; t++) {
        inputs[entityIndex(id)] = { tick: t, moveX: Math.sin(t / 90) * 0.3, moveY: -1, aimAngle: t * 0.03, buttons: BTN_FIRE };
        step(sim, inputs);
      }
      return hashState(sim);
    };
    expect(play()).toBe(play());
  });

  it('la carte 1 se joue : on sort du camp, un groupe se réveille, la sim reste finie', () => {
    const sim = createSimFromMap(MAPS['niveau-1-campagne']!, 3);
    const id = addPlayer(sim);
    // Droit vers le nord par la route : la ferme de l'est ou le croisement finit par activer un groupe.
    run(sim, id, 60 * 60, { ...IDLE, moveY: -1 });
    expect(sim.map!.groups.some((g) => g.activated)).toBe(true);
    expect(Number.isFinite(sim.players.posY[entityIndex(id)])).toBe(true);
    expect(snapshot(sim).players.length).toBe(SNAP_STRIDE);
  });
});

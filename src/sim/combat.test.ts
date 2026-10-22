import { describe, expect, it } from 'vitest';
import { ENEMIES, ENEMY_POOL_SIZE, RESPAWN_TICKS } from './data/enemies';
import { PLAYER_MAX_HP } from './data/player';
import { WEAPONS } from './data/weapons';
import type { WeaponDef } from './data/weapons';
import { entityIndex, freeEntity } from './ecs/pool';
import { addPlayer, createSim, hashState, snapshot, step } from './sim';
import { ENEMY_STRIDE, ENEMY_TYPE, ENEMY_X, PROJ_KIND_PLAYER } from './snapshot';
import { spawnProjectile } from './systems/combat';
import { spawnEnemy } from './systems/enemies';
import { damagePlayer } from './systems/player';
import { emptyObstacles, oneObstacle, quietSim, run } from './testkit';
import { BTN_DASH, BTN_FIRE } from './types';
import type { InputFrame } from './types';
import { OBSTACLE_BOX } from './world/obstacles';

const FIRE = { moveX: 0, moveY: 0, aimAngle: 0, buttons: BTN_FIRE };
const IDLE = { moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };

describe('tir', () => {
  it('respecte la cadence de l\'arme', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    run(sim, id, 45, FIRE);
    // Tirs aux ticks 1, 16 et 31 (cadence 4 Hz), tous encore en vol.
    expect(sim.projectilePool.count).toBe(3);
  });

  it('ne tire pas sans appui, ni quand le joueur est mort', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    run(sim, id, 30, IDLE);
    expect(sim.projectilePool.count).toBe(0);
    damagePlayer(sim, entityIndex(id), 1000);
    run(sim, id, 30, FIRE);
    expect(sim.projectilePool.count).toBe(0);
  });

  it('les projectiles expirent après leur durée de vie', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    run(sim, id, 1, FIRE);
    run(sim, id, WEAPONS[0]!.lifeTicks + 2, IDLE);
    expect(sim.projectilePool.count).toBe(0);
  });
});

describe('dégâts et morts d\'ennemis', () => {
  it('tue un rôdeur en le touchant et émet exactement un kill', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    spawnEnemy(sim, 0, 8, 0);
    const events = run(sim, id, 120, FIRE);
    const kills = events.filter((e) => e.t === 'kill');
    expect(kills).toHaveLength(1);
    expect(kills[0]).toMatchObject({ t: 'kill', enemyType: 0, killerId: id });
    expect(sim.enemyPool.count).toBe(0);
    expect(sim.players.lifeKills[entityIndex(id)]).toBe(1);
  });

  it('un mur arrête les projectiles', () => {
    const sim = quietSim(oneObstacle(OBSTACLE_BOX, 4, 0, 1, 4));
    const id = addPlayer(sim);
    const enemy = spawnEnemy(sim, 0, 8, 0);
    run(sim, id, 90, FIRE);
    expect(sim.enemies.hp[entityIndex(enemy)]).toBe(ENEMIES[0]!.hp);
  });

  it('un projectile perforant traverse jusqu\'à deux ennemis alignés', () => {
    const results = [0, 1].map((pierce) => {
      const sim = quietSim();
      const id = addPlayer(sim, -40, 0);
      const a = spawnEnemy(sim, 0, 5, 0);
      const b = spawnEnemy(sim, 0, 7, 0);
      const def: WeaponDef = { ...WEAPONS[0]!, damage: 10, pierce };
      spawnProjectile(sim, def, id, 0, 0, 0, PROJ_KIND_PLAYER);
      run(sim, id, 30, IDLE);
      return [sim.enemies.hp[entityIndex(a)], sim.enemies.hp[entityIndex(b)]];
    });
    expect(results[0]).toEqual([20, 30]);
    expect(results[1]).toEqual([20, 20]);
  });

  it('un projectile très rapide ne traverse pas un ennemi', () => {
    const sim = quietSim();
    const id = addPlayer(sim, -40, 0);
    const enemy = spawnEnemy(sim, 0, 5, 0);
    const def: WeaponDef = { ...WEAPONS[0]!, projectileSpeed: 300, damage: 100 };
    spawnProjectile(sim, def, id, 0, 0, 0, PROJ_KIND_PLAYER);
    const events = run(sim, id, 5, IDLE);
    expect(events.filter((e) => e.t === 'kill')).toHaveLength(1);
    expect(sim.enemyPool.alive[entityIndex(enemy)]).toBe(0);
  });

  it('chaque ennemi tué émet un seul kill, même sous une pluie de projectiles', () => {
    const sim = quietSim();
    const id = addPlayer(sim, -40, 0);
    for (let i = 0; i < 20; i++) spawnEnemy(sim, 0, 5 + (i % 5) * 0.2, -1 + i * 0.1);
    const def: WeaponDef = { ...WEAPONS[0]!, damage: 40, pierce: 5 };
    for (let i = 0; i < 40; i++) spawnProjectile(sim, def, id, 0, -4 + i * 0.2, 0, PROJ_KIND_PLAYER);
    const events = run(sim, id, 30, IDLE);
    expect(events.filter((e) => e.t === 'kill')).toHaveLength(20);
    expect(sim.enemyPool.count).toBe(0);
  });
});

describe('contact et mort du joueur', () => {
  it('un ennemi blesse le joueur, avec invulnérabilité entre deux coups', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    spawnEnemy(sim, 0, 0.3, 0);
    const events = run(sim, id, 20, IDLE);
    expect(events.filter((e) => e.t === 'hit')).toHaveLength(1);
    expect(sim.players.hp[entityIndex(id)]).toBe(PLAYER_MAX_HP - ENEMIES[0]!.contactDamage);
  });

  it('l\'esquive protège des dégâts', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    run(sim, id, 1, { ...IDLE, buttons: BTN_DASH });
    damagePlayer(sim, entityIndex(id), 50);
    expect(sim.players.hp[entityIndex(id)]).toBe(PLAYER_MAX_HP);
  });

  it('meurt une fois, puis réapparaît avec tous ses PV', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    sim.players.hp[entityIndex(id)] = 5;
    spawnEnemy(sim, 0, 0.3, 0);
    const first = run(sim, id, 5, IDLE);
    expect(first.filter((e) => e.t === 'playerDied')).toHaveLength(1);
    for (let s = 0; s < sim.enemyPool.highWater; s++) {
      freeEntity(sim.enemyPool, (((sim.enemyPool.generations[s] as number) << 16) | s) as number);
    }
    const events = run(sim, id, RESPAWN_TICKS + 5, IDLE);
    expect(events.filter((e) => e.t === 'playerDied')).toHaveLength(0);
    expect(events.filter((e) => e.t === 'spawn')).toHaveLength(1);
    expect(sim.players.dead[entityIndex(id)]).toBe(0);
    expect(sim.players.hp[entityIndex(id)]).toBe(PLAYER_MAX_HP);
    expect(sim.players.lifeKills[entityIndex(id)]).toBe(0);
  });

  it('dégage les ennemis proches du point de réapparition', () => {
    const sim = quietSim();
    const id = addPlayer(sim, 50, 0);
    sim.players.hp[entityIndex(id)] = 5;
    spawnEnemy(sim, 0, 50.3, 0);
    const near = spawnEnemy(sim, 0, 5, 0);
    const far = spawnEnemy(sim, 0, 0, 40);
    run(sim, id, RESPAWN_TICKS + 5, IDLE);
    expect(sim.enemyPool.alive[entityIndex(near)]).toBe(0);
    expect(sim.enemyPool.alive[entityIndex(far)]).toBe(1);
  });

  it('les ennemis s\'arrêtent au contact au lieu de se superposer au joueur', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const enemy = spawnEnemy(sim, 0, 3, 0);
    run(sim, id, 240, IDLE);
    const e = entityIndex(enemy);
    expect(sim.enemies.posX[e] as number).toBeGreaterThan(0.7);
  });
});

describe('apparition et recyclage', () => {
  it('atteint la densité cible sans dépasser la capacité du pool', () => {
    const sim = createSim(3, emptyObstacles());
    sim.config.hordeTarget = 100;
    const id = addPlayer(sim);
    run(sim, id, 60, IDLE);
    expect(sim.enemyPool.count).toBe(100);
    sim.config.hordeTarget = 100_000;
    run(sim, id, 600, IDLE);
    expect(sim.enemyPool.count).toBeLessThanOrEqual(ENEMY_POOL_SIZE);
  });

  it('recycle les ennemis laissés loin derrière', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const enemy = spawnEnemy(sim, 0, 200, 0);
    run(sim, id, 2, IDLE);
    expect(sim.enemyPool.alive[entityIndex(enemy)]).toBe(0);
  });

  it('la densité automatique augmente avec le temps de survie', () => {
    const sim = createSim(3, emptyObstacles());
    const id = addPlayer(sim);
    run(sim, id, 60, IDLE);
    const early = sim.enemyPool.count;
    sim.players.lifeTicks[entityIndex(id)] = 60 * 120;
    run(sim, id, 60, IDLE);
    expect(sim.enemyPool.count).toBeGreaterThan(early);
  });
});

describe('snapshot et déterminisme', () => {
  it('expose ennemis et projectiles par emplacement de pool', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    spawnEnemy(sim, 0, 6, 0);
    run(sim, id, 1, FIRE);
    const snap = snapshot(sim);
    expect(snap.enemies[ENEMY_TYPE]).toBe(1);
    expect(snap.enemies.length).toBe(snap.enemyHigh * ENEMY_STRIDE);
    expect(snap.enemies[ENEMY_X]).toBeLessThan(6);
    expect(snap.projectileHigh).toBe(1);
  });

  it('même graine + mêmes entrées avec combat ⇒ même empreinte', () => {
    const play = (seed: number): number => {
      const sim = createSim(seed);
      const id = addPlayer(sim);
      const inputs: InputFrame[] = [];
      for (let t = 1; t <= 2400; t++) {
        inputs[entityIndex(id)] = {
          tick: t,
          moveX: Math.sin(t / 50),
          moveY: Math.cos(t / 70),
          aimAngle: t * 0.07,
          buttons: BTN_FIRE | (t % 200 === 0 ? BTN_DASH : 0),
        };
        step(sim, inputs);
      }
      return hashState(sim);
    };
    expect(play(5)).toBe(play(5));
    expect(play(5)).not.toBe(play(6));
  });
});

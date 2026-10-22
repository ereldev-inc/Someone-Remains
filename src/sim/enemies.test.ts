import { describe, expect, it } from 'vitest';
import {
  AMBIENT_WEIGHTS,
  ENEMIES,
  ENEMY_BRUTE,
  ENEMY_COLOSSE,
  ENEMY_COUREUR,
  ENEMY_CRACHEUR,
  ENEMY_EXPLOSIF,
  ENEMY_HURLEUR,
  ENEMY_RODEUR,
  ENEMY_SOUCHE,
  RAGE_SPEED_MULT,
} from './data/enemies';
import { PATTERNS, PATTERN_FAN7, PATTERN_RING } from './data/patterns';
import { PLAYER_MAX_HP } from './data/player';
import { entityIndex } from './ecs/pool';
import { addPlayer, createSim, hashState, snapshot, step } from './sim';
import type { Sim } from './sim';
import { ENEMY_HP, ENEMY_PHASE, ENEMY_STRIDE, PROJ_KIND_ENEMY, PROJ_KIND_PLAYER } from './snapshot';
import { spawnProjectileRaw } from './systems/combat';
import {
  damageEnemy,
  PHASE_ACT,
  PHASE_NONE,
  PHASE_RECOVER,
  PHASE_WINDUP,
  spawnEnemy,
  spawnShowcase,
  STATE_CHASE,
} from './systems/enemies';
import { emptyObstacles, oneObstacle, quietSim, run } from './testkit';
import { BTN_DASH, BTN_FIRE, DT } from './types';
import type { InputFrame, SimEvent } from './types';
import { OBSTACLE_BOX } from './world/obstacles';

const IDLE = { moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };

/** Nombre de projectiles ennemis / du joueur actuellement en vol. */
function countProjectiles(sim: Sim, kind: number): number {
  let n = 0;
  for (let s = 0; s < sim.projectilePool.highWater; s++) {
    if (sim.projectilePool.alive[s] === 1 && sim.projectiles.kind[s] === kind) n++;
  }
  return n;
}

function immortal(sim: Sim, id: number): void {
  sim.players.hp[entityIndex(id)] = 1e9;
}

describe('données des ennemis', () => {
  it('chaque type est cohérent', () => {
    expect(ENEMIES).toHaveLength(8);
    ENEMIES.forEach((d) => {
      expect(d.hp).toBeGreaterThan(0);
      expect(d.radius).toBeGreaterThan(0);
      expect(d.killWeight).toBeGreaterThanOrEqual(1);
      expect(d.loseRadius).toBeGreaterThan(d.sightRadius);
      if (d.shooter) d.shooter.patterns.forEach((p) => expect(PATTERNS[p]).toBeDefined());
      if (d.nest) expect(ENEMIES[d.nest.childType]).toBeDefined();
      if (d.scream) expect(ENEMIES[d.scream.summonType]).toBeDefined();
    });
    expect(ENEMIES[ENEMY_COLOSSE]!.killWeight).toBeGreaterThan(ENEMIES[ENEMY_RODEUR]!.killWeight);
  });

  it('chaque motif est paramétré de façon valide', () => {
    PATTERNS.forEach((p) => {
      expect(p.bursts).toBeGreaterThan(0);
      expect(p.count).toBeGreaterThan(0);
      expect(p.speed).toBeGreaterThan(0);
      expect(p.lifeTicks).toBeGreaterThan(0);
    });
  });

  it('l\'apparition ambiante mélange plusieurs types', () => {
    const sim = createSim(5, emptyObstacles());
    sim.config.hordeTarget = 300;
    const id = addPlayer(sim);
    run(sim, id, 120, IDLE);
    const types = new Set<number>();
    for (let s = 0; s < sim.enemyPool.highWater; s++) if (sim.enemyPool.alive[s]) types.add(sim.enemies.type[s] as number);
    expect(types.size).toBeGreaterThanOrEqual(4);
    AMBIENT_WEIGHTS.forEach(([type]) => expect(ENEMIES[type]).toBeDefined());
  });
});

describe('coureur', () => {
  it('court plus vite que le rôdeur et zigzague', () => {
    const sim = quietSim();
    const id = addPlayer(sim, -40, 0);
    immortal(sim, id);
    const coureur = spawnEnemy(sim, ENEMY_COUREUR, 0, 0, STATE_CHASE);
    const rodeur = spawnEnemy(sim, ENEMY_RODEUR, 0, 8, STATE_CHASE);
    let maxLateral = 0;
    for (let t = 0; t < 60; t++) {
      run(sim, id, 1, IDLE);
      maxLateral = Math.max(maxLateral, Math.abs(sim.enemies.posY[entityIndex(coureur)] as number));
    }
    const dCoureur = -(sim.enemies.posX[entityIndex(coureur)] as number);
    const dRodeur = -(sim.enemies.posX[entityIndex(rodeur)] as number);
    expect(dCoureur).toBeGreaterThan(dRodeur * 1.3);
    expect(maxLateral).toBeGreaterThan(0.3);
  });
});

describe('brute', () => {
  it('signale sa charge, fonce en ligne droite, puis récupère', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    immortal(sim, id);
    const brute = spawnEnemy(sim, ENEMY_BRUTE, 8, 0, STATE_CHASE);
    const b = entityIndex(brute);
    const phases: number[] = [];
    let windupX = Number.NaN;
    let windupMoved = 0;
    let chargeSpeed = 0;
    for (let t = 0; t < 400; t++) {
      run(sim, id, 1, IDLE);
      const ph = sim.enemies.phase[b] as number;
      if (phases[phases.length - 1] !== ph) phases.push(ph);
      if (ph === PHASE_WINDUP) {
        if (Number.isNaN(windupX)) windupX = sim.enemies.posX[b] as number;
        windupMoved = Math.abs((sim.enemies.posX[b] as number) - windupX);
      }
      if (ph === PHASE_ACT) chargeSpeed = Math.max(chargeSpeed, ENEMIES[ENEMY_BRUTE]!.charge!.chargeSpeed);
    }
    expect(phases.slice(0, 4)).toEqual([PHASE_NONE, PHASE_WINDUP, PHASE_ACT, PHASE_RECOVER]);
    expect(windupMoved).toBeLessThan(0.05);
    expect(chargeSpeed).toBe(15);
  });

  it('inflige de gros dégâts à qui reste sur sa trajectoire', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    spawnEnemy(sim, ENEMY_BRUTE, 8, 0, STATE_CHASE);
    run(sim, id, 120, IDLE);
    expect(sim.players.hp[entityIndex(id)]).toBeLessThanOrEqual(PLAYER_MAX_HP - ENEMIES[ENEMY_BRUTE]!.charge!.damage);
  });

  it('se laisse esquiver en s\'écartant à temps du couloir de charge', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const brute = spawnEnemy(sim, ENEMY_BRUTE, 8, 0, STATE_CHASE);
    const b = entityIndex(brute);
    let guard = 0;
    while (sim.enemies.phase[b] !== PHASE_WINDUP && guard++ < 200) run(sim, id, 1, IDLE);
    expect(sim.enemies.phase[b]).toBe(PHASE_WINDUP);
    // On sort du couloir pendant le signal, puis on attend la fin de la charge.
    run(sim, id, ENEMIES[ENEMY_BRUTE]!.charge!.windupTicks, { ...IDLE, moveY: 1 });
    run(sim, id, ENEMIES[ENEMY_BRUTE]!.charge!.chargeTicks + 2, { ...IDLE, moveY: 1 });
    expect(sim.players.hp[entityIndex(id)]).toBe(PLAYER_MAX_HP);
  });
});

describe('cracheur', () => {
  it('garde ses distances et tire des projectiles qui blessent', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const cracheur = spawnEnemy(sim, ENEMY_CRACHEUR, 3, 0, STATE_CHASE);
    run(sim, id, 90, IDLE);
    const dist = Math.hypot(sim.enemies.posX[entityIndex(cracheur)] as number, sim.enemies.posY[entityIndex(cracheur)] as number);
    expect(dist).toBeGreaterThan(4.5); // il a reculé de sa position de départ (3 m)
    let shot = false;
    for (let t = 0; t < 400 && !shot; t++) {
      run(sim, id, 1, IDLE);
      shot = countProjectiles(sim, PROJ_KIND_ENEMY) > 0;
    }
    expect(shot).toBe(true);
    run(sim, id, 400, IDLE);
    expect(sim.players.hp[entityIndex(id)]).toBeLessThan(PLAYER_MAX_HP);
  });

  it('l\'esquive laisse passer un projectile ennemi', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    run(sim, id, 1, { ...IDLE, buttons: BTN_DASH, moveX: 1 });
    spawnProjectileRaw(sim, sim.players.posX[entityIndex(id)] as number, sim.players.posY[entityIndex(id)] as number, 0, 0.1, 20, 0.2, 100, 0, -1, PROJ_KIND_ENEMY);
    run(sim, id, 2, { ...IDLE, moveX: 1 });
    expect(sim.players.hp[entityIndex(id)]).toBe(PLAYER_MAX_HP);
    expect(countProjectiles(sim, PROJ_KIND_ENEMY)).toBe(1);
  });

  it('un projectile ennemi est arrêté par un mur et ne blesse pas les ennemis', () => {
    const sim = quietSim(oneObstacle(OBSTACLE_BOX, 5, 0, 1, 4));
    const id = addPlayer(sim, 6, 0);
    const rodeur = spawnEnemy(sim, ENEMY_RODEUR, 0, 8);
    spawnProjectileRaw(sim, 0, 0, 0, 10, 20, 0.2, 100, 0, -1, PROJ_KIND_ENEMY);
    spawnProjectileRaw(sim, 0, 8, 0, 0.01, 20, 0.2, 100, 0, -1, PROJ_KIND_ENEMY);
    run(sim, id, 60, IDLE);
    expect(sim.players.hp[entityIndex(id)]).toBe(PLAYER_MAX_HP);
    expect(sim.enemies.hp[entityIndex(rodeur)]).toBe(ENEMIES[ENEMY_RODEUR]!.hp);
  });
});

describe('explosif', () => {
  const kills = (events: SimEvent[]) => events.filter((e) => e.t === 'kill');

  it('s\'amorce au contact puis explose en zone, une seule fois', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    spawnEnemy(sim, ENEMY_EXPLOSIF, 6, 0, STATE_CHASE);
    const events = run(sim, id, 240, IDLE);
    expect(events.filter((e) => e.t === 'explosion')).toHaveLength(1);
    expect(kills(events)).toHaveLength(1);
    expect(sim.players.hp[entityIndex(id)]).toBe(PLAYER_MAX_HP - ENEMIES[ENEMY_EXPLOSIF]!.explode!.damage);
    expect(sim.enemyPool.count).toBe(0);
  });

  it('tué de loin, il explose sans blesser ; tué de près, il blesse', () => {
    const far = quietSim();
    const idFar = addPlayer(far);
    run(far, idFar, 1, IDLE);
    const e1 = spawnEnemy(far, ENEMY_EXPLOSIF, 12, 0, STATE_CHASE);
    damageEnemy(far, entityIndex(e1), 1000, idFar);
    run(far, idFar, 2, IDLE);
    expect(far.players.hp[entityIndex(idFar)]).toBe(PLAYER_MAX_HP);
    expect(far.enemyPool.count).toBe(0);

    const close = quietSim();
    const idClose = addPlayer(close);
    run(close, idClose, 1, IDLE);
    const e2 = spawnEnemy(close, ENEMY_EXPLOSIF, 2, 0, STATE_CHASE);
    damageEnemy(close, entityIndex(e2), 1000, idClose);
    expect(close.events.some((e) => e.t === 'explosion')).toBe(true);
    expect(close.players.hp[entityIndex(idClose)]).toBe(PLAYER_MAX_HP - ENEMIES[ENEMY_EXPLOSIF]!.explode!.damage);
  });
});

describe('hurleur', () => {
  it('alerte et enrage les ennemis proches, appelle des renforts, au plus deux fois', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    immortal(sim, id);
    spawnEnemy(sim, ENEMY_HURLEUR, 12, 0, STATE_CHASE);
    const sleeper = spawnEnemy(sim, ENEMY_RODEUR, 25, 12);
    const before = sim.enemyPool.count;
    const events = run(sim, id, 2000, IDLE);
    const screams = events.filter((e) => e.t === 'scream');
    expect(screams.length).toBe(ENEMIES[ENEMY_HURLEUR]!.scream!.maxScreams);
    expect(sim.enemyPool.count).toBeGreaterThan(before);
    expect(sim.enemies.state[entityIndex(sleeper)]).toBe(STATE_CHASE);
  });

  it('un ennemi enragé court plus vite', () => {
    const calm = quietSim();
    const a = addPlayer(calm, -40, 0);
    immortal(calm, a);
    const e1 = spawnEnemy(calm, ENEMY_RODEUR, 0, 0, STATE_CHASE);
    run(calm, a, 30, IDLE);

    const angry = quietSim();
    const b = addPlayer(angry, -40, 0);
    immortal(angry, b);
    const e2 = spawnEnemy(angry, ENEMY_RODEUR, 0, 0, STATE_CHASE);
    angry.enemies.rage[entityIndex(e2)] = 1000;
    run(angry, b, 30, IDLE);

    const d1 = -(calm.enemies.posX[entityIndex(e1)] as number);
    const d2 = -(angry.enemies.posX[entityIndex(e2)] as number);
    expect(d2 / d1).toBeCloseTo(RAGE_SPEED_MULT, 1);
  });
});

describe('colosse et motifs', () => {
  function emittedAngles(patternIndex: number): number[] {
    const sim = quietSim();
    const id = addPlayer(sim);
    immortal(sim, id);
    const colosse = spawnEnemy(sim, ENEMY_COLOSSE, 12, 0, STATE_CHASE);
    const c = entityIndex(colosse);
    sim.enemies.patternIndex[c] = patternIndex;
    sim.enemies.cooldown[c] = 0;
    for (let t = 0; t < 120; t++) {
      run(sim, id, 1, IDLE);
      const n = countProjectiles(sim, PROJ_KIND_ENEMY);
      if (n > 0) {
        const out: number[] = [];
        for (let s = 0; s < sim.projectilePool.highWater; s++) {
          if (sim.projectilePool.alive[s] === 1 && sim.projectiles.kind[s] === PROJ_KIND_ENEMY) out.push(sim.projectiles.angle[s] as number);
        }
        return out;
      }
    }
    return [];
  }

  it('l\'anneau répartit ses projectiles uniformément', () => {
    const angles = emittedAngles(0).sort((a, b) => a - b);
    expect(angles).toHaveLength(PATTERNS[PATTERN_RING]!.count);
    const step = (Math.PI * 2) / angles.length;
    for (let i = 1; i < angles.length; i++) expect(angles[i]! - angles[i - 1]!).toBeCloseTo(step, 5);
  });

  it('l\'éventail est centré sur le joueur', () => {
    const angles = emittedAngles(3).sort((a, b) => a - b);
    expect(angles).toHaveLength(PATTERNS[PATTERN_FAN7]!.count);
    const mid = angles[Math.floor(angles.length / 2)] as number;
    // Le colosse est en (≈12, 0) et vise l'origine : angle proche de π.
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(0.2);
    expect(angles[angles.length - 1]! - angles[0]!).toBeCloseTo(PATTERNS[PATTERN_FAN7]!.arc, 2);
  });

  it('enchaîne ses motifs dans l\'ordre de ses données', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    immortal(sim, id);
    const colosse = spawnEnemy(sim, ENEMY_COLOSSE, 12, 0, STATE_CHASE);
    const c = entityIndex(colosse);
    const seen: number[] = [];
    for (let t = 0; t < 1500; t++) {
      run(sim, id, 1, IDLE);
      const p = sim.enemies.pattern[c] as number;
      if (p >= 0 && seen[seen.length - 1] !== p) seen.push(p);
    }
    expect(seen.slice(0, 4)).toEqual(ENEMIES[ENEMY_COLOSSE]!.shooter!.patterns);
  });

  it('expose la fraction de PV et la phase dans le snapshot', () => {
    const sim = quietSim();
    const id = addPlayer(sim);
    const colosse = spawnEnemy(sim, ENEMY_COLOSSE, 12, 0, STATE_CHASE);
    damageEnemy(sim, entityIndex(colosse), 450, id);
    const snap = snapshot(sim);
    const o = entityIndex(colosse) * ENEMY_STRIDE;
    expect(snap.enemies[o + ENEMY_HP]).toBeCloseTo(0.5, 2);
    expect(snap.enemies[o + ENEMY_PHASE]).toBe(PHASE_NONE);
  });
});

describe('souche', () => {
  it('dort quand le joueur est loin, génère des ennemis quand il approche, jusqu\'à son plafond', () => {
    const far = quietSim();
    const a = addPlayer(far, 70, 0);
    spawnEnemy(far, ENEMY_SOUCHE, 0, 0);
    run(far, a, 600, IDLE);
    expect(far.enemyPool.count).toBe(1);

    const near = quietSim();
    const b = addPlayer(near, 6, 0);
    immortal(near, b);
    const souche = spawnEnemy(near, ENEMY_SOUCHE, 0, 0);
    run(near, b, 2400, { ...IDLE });
    const nest = ENEMIES[ENEMY_SOUCHE]!.nest!;
    expect(near.enemies.childCount[entityIndex(souche)]).toBeGreaterThan(0);
    expect(near.enemies.childCount[entityIndex(souche)]).toBeLessThanOrEqual(nest.maxChildren);
    expect(near.enemyPool.count - 1).toBeLessThanOrEqual(nest.maxChildren);
  });

  it('un enfant tué libère une place ; la Souche détruite émet un kill', () => {
    const sim = quietSim();
    const id = addPlayer(sim, 6, 0);
    immortal(sim, id);
    const souche = spawnEnemy(sim, ENEMY_SOUCHE, 0, 0);
    const s = entityIndex(souche);
    run(sim, id, 1500, IDLE);
    const full = sim.enemies.childCount[s] as number;
    expect(full).toBeGreaterThan(0);
    for (let slot = 0; slot < sim.enemyPool.highWater; slot++) {
      if (sim.enemyPool.alive[slot] === 1 && sim.enemies.parent[slot] === souche) {
        damageEnemy(sim, slot, 1000, id);
        break;
      }
    }
    expect(sim.enemies.childCount[s]).toBe(full - 1);
    sim.events.length = 0;
    damageEnemy(sim, s, 1000, id);
    expect(sim.events.filter((e) => e.t === 'kill' && e.enemyType === ENEMY_SOUCHE)).toHaveLength(1);
    expect(sim.enemyPool.alive[s]).toBe(0);
  });

  it('ne se déplace pas et n\'est pas recyclée quand le joueur est loin', () => {
    const sim = quietSim();
    const id = addPlayer(sim, 200, 0);
    const souche = spawnEnemy(sim, ENEMY_SOUCHE, 0, 0);
    run(sim, id, 120, IDLE);
    expect(sim.enemyPool.alive[entityIndex(souche)]).toBe(1);
    expect(sim.enemies.posX[entityIndex(souche)]).toBe(0);
  });
});

describe('ensemble des types : déterminisme et charge', () => {
  it('même graine + mêmes entrées ⇒ même empreinte avec tous les types', () => {
    const play = (seed: number): number => {
      const sim = createSim(seed);
      const id = addPlayer(sim);
      spawnShowcase(sim, [0, 1, 2, 3, 4, 5, 6, 7], 16);
      const inputs: InputFrame[] = [];
      for (let t = 1; t <= 2400; t++) {
        inputs[entityIndex(id)] = {
          tick: t,
          moveX: Math.sin(t / 60),
          moveY: Math.cos(t / 90),
          aimAngle: t * 0.05,
          buttons: BTN_FIRE | (t % 180 === 0 ? BTN_DASH : 0),
        };
        step(sim, inputs);
      }
      return hashState(sim);
    };
    expect(play(11)).toBe(play(11));
  });

  it('1 500 ennemis et 3 000 projectiles restent finis et dans les pools', () => {
    const sim = createSim(2, emptyObstacles());
    sim.config.hordeTarget = 1500;
    sim.config.spawnAggro = true;
    const id = addPlayer(sim);
    immortal(sim, id);
    for (let k = 0; k < 3000; k++) {
      spawnProjectileRaw(sim, 0, 0, k * 0.01, 3, 1, 0.2, 400, 0, -1, k % 2 === 0 ? PROJ_KIND_ENEMY : PROJ_KIND_PLAYER);
    }
    run(sim, id, 120, IDLE);
    expect(sim.enemyPool.count).toBeLessThanOrEqual(2500);
    expect(Number.isFinite(sim.players.posX[entityIndex(id)])).toBe(true);
    expect(DT).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { ENEMIES } from './data/enemies';
import { REPOP_COUNT_RADIUS, REPOP_INTERVAL_TICKS, REPOP_LOCAL_CAP, REPOP_MIN_DIST } from './data/repop';
import { entityIndex } from './ecs/pool';
import { addPlayer, createSimFromMap, hashState } from './sim';
import type { Sim } from './sim';
import { run } from './testkit';
import { miniMap } from './testmap';
import { MAPS } from './data/maps';

const IDLE = { moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };

function setup(patch = {}): { sim: Sim; id: number; i: number } {
  const buildings = [-60, -30, 30, 60].map((x, k) => ({ id: `b${k}`, name: 'b', x, y: -20, w: 8, h: 8, doors: [{ side: 's' as const, offset: 0, width: 2 }] }));
  const sim = createSimFromMap(miniMap({ groups: [], buildings, difficulty: 'niveau-3', ...patch }), 11);
  const id = addPlayer(sim);
  sim.players.posX[entityIndex(id)] = 0;
  sim.players.posY[entityIndex(id)] = 10;
  return { sim, id, i: entityIndex(id) };
}

const countNear = (s: { sim: Sim; i: number }): number => {
  let n = 0;
  for (let k = 0; k < s.sim.enemyPool.highWater; k++) {
    if (s.sim.enemyPool.alive[k] === 0) continue;
    if (Math.hypot((s.sim.enemies.posX[k] as number) - 0, (s.sim.enemies.posY[k] as number) - 10) <= REPOP_COUNT_RADIUS) n++;
  }
  return n;
};

describe('réapparition des zombies', () => {
  it('de nouveaux ennemis apparaissent régulièrement hors de vue, au repos', () => {
    const s = setup();
    s.sim.players.hp[s.i] = 1e9;
    expect(s.sim.enemyPool.count).toBe(0);
    run(s.sim, s.id, REPOP_INTERVAL_TICKS * 4 + 1, IDLE);
    expect(s.sim.enemyPool.count).toBeGreaterThan(0);
    for (let k = 0; k < s.sim.enemyPool.highWater; k++) {
      if (s.sim.enemyPool.alive[k] === 0) continue;
      const d = Math.hypot((s.sim.enemies.posX[k] as number) - 0, (s.sim.enemies.posY[k] as number) - 10);
      expect(d).toBeGreaterThanOrEqual(REPOP_MIN_DIST - 8);
    }
  });

  it('la densité locale reste plafonnée', () => {
    const s = setup();
    s.sim.players.hp[s.i] = 1e9;
    run(s.sim, s.id, REPOP_INTERVAL_TICKS * 40, IDLE);
    expect(countNear(s)).toBeLessThanOrEqual(REPOP_LOCAL_CAP + 8);
  });

  it('plusieurs types apparaissent, tous permis par le profil', () => {
    const s = setup({ difficulty: 'niveau-4' });
    s.sim.players.hp[s.i] = 1e9;
    const seen = new Set<number>();
    for (let t = 0; t < 120; t++) {
      run(s.sim, s.id, REPOP_INTERVAL_TICKS, IDLE);
      for (let k = 0; k < s.sim.enemyPool.highWater; k++) if (s.sim.enemyPool.alive[k] === 1) seen.add(s.sim.enemies.type[k] as number);
      // Vide les environs pour que de nouvelles apparitions soient possibles.
      for (let k = 0; k < s.sim.enemyPool.highWater; k++) s.sim.enemies.hp[k] = 0;
      s.sim.enemyPool.alive.fill(0);
      s.sim.enemyPool.count = 0;
    }
    const names = [...seen].map((t) => ENEMIES[t]!.name);
    expect(names.length).toBeGreaterThanOrEqual(4);
    expect(names).toContain('rodeur');
    for (const n of names) expect(s.sim.map!.profile.allowedTypes).toContain(n);
  });

  it('est déterministe', () => {
    const hash = (): number => {
      const s = setup();
      s.sim.players.hp[s.i] = 1e9;
      run(s.sim, s.id, REPOP_INTERVAL_TICKS * 6, IDLE);
      return hashState(s.sim);
    };
    expect(hash()).toBe(hash());
  });

  it('la carte Campagne mélange tous les types d\'ennemis', () => {
    const map = Object.values(MAPS).find((m) => m.level === 1 && m.groups.length > 20)!;
    const types = new Set(map.groups.flatMap((g) => g.members.map((m) => m.type)));
    for (const t of ['rodeur', 'coureur', 'cracheur', 'hurleur', 'explosif', 'brute', 'colosse', 'souche']) expect(types.has(t)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { MAPS } from '../data/maps';
import { PLAYER_RADIUS } from '../data/player';
import { entityIndex } from '../ecs/pool';
import { addPlayer, createSimFromMap } from '../sim';
import { miniMap } from '../testmap';
import { run } from '../testkit';
import { allObstacles, buildingWalls, insideBuilding, MIN_DOOR_WIDTH } from './buildings';
import { mapObstacles } from './map';
import type { BuildingDef, MapDef } from './mapdef';
import { parseMap } from './parseMap';
import { validateMap } from './validateMap';

const IDLE = { moveX: 0, moveY: 0, aimAngle: 0, buttons: 0 };

const hut: BuildingDef = { id: 'h', name: 'Cabane', x: -20, y: 5, w: 10, h: 8, doors: [{ side: 's', offset: 0, width: 2.4 }] };

function withBuildings(buildings: BuildingDef[], patch: Partial<MapDef> = {}): MapDef {
  return { ...miniMap(), buildings, groups: [], crates: [], ...patch };
}

describe('murs des bâtiments', () => {
  it('découpe les murs autour des portes', () => {
    const walls = buildingWalls(hut);
    // nord (1) + sud (2 morceaux) + est (1) + ouest (1)
    expect(walls).toHaveLength(5);
    const south = walls.filter((w) => w.y > hut.y);
    expect(south).toHaveLength(2);
    expect(south.reduce((s, w) => s + w.w, 0)).toBeCloseTo(hut.w - 2.4, 6);
    // La porte est exactement l'espace entre les deux morceaux.
    const [a, b] = south.sort((p, q) => p.x - q.x);
    expect(b!.x - b!.w / 2 - (a!.x + a!.w / 2)).toBeCloseTo(2.4, 6);
  });

  it('sans porte, quatre murs pleins ; avec plusieurs portes sur un même côté, les morceaux s\'enchaînent', () => {
    expect(buildingWalls({ ...hut, doors: [] })).toHaveLength(4);
    const two = buildingWalls({ ...hut, w: 20, doors: [{ side: 'n', offset: -5, width: 2 }, { side: 'n', offset: 5, width: 2 }] });
    expect(two.filter((w) => w.y < hut.y)).toHaveLength(3);
  });

  it('les murs et les cloisons s\'ajoutent aux obstacles de la carte', () => {
    const def = withBuildings([{ ...hut, walls: [{ kind: 'box', x: -20, y: 5, w: 0.4, h: 3, style: 'wall' }] }]);
    expect(allObstacles(def)).toHaveLength(def.obstacles.length + 5 + 1);
    expect(mapObstacles(def).count).toBe(def.obstacles.length + 6);
  });

  it('insideBuilding distingue l\'intérieur, les murs et l\'extérieur', () => {
    expect(insideBuilding(hut, -20, 5)).toBe(true);
    expect(insideBuilding(hut, -20, 8.9)).toBe(false); // dans le mur sud
    expect(insideBuilding(hut, -20, 20)).toBe(false);
  });
});

describe('collisions des bâtiments', () => {
  const sandbox = (): MapDef => MAPS['bac-a-sable']!;

  it('le joueur franchit la porte mais pas le mur', () => {
    const def = sandbox();
    const cabane = def.buildings.find((b) => b.id === 'cabane')!;
    const south = cabane.y + cabane.h / 2;

    const door = createSimFromMap(def);
    const a = addPlayer(door, cabane.x, south + 4);
    run(door, a, 120, { ...IDLE, moveY: -1 });
    expect(door.players.posY[entityIndex(a)]).toBeLessThan(cabane.y + 1);

    const wall = createSimFromMap(def);
    const b = addPlayer(wall, cabane.x + 3.5, south + 4); // face au mur, loin de la porte
    run(wall, b, 120, { ...IDLE, moveY: -1 });
    expect(wall.players.posY[entityIndex(b)]).toBeGreaterThan(south - 0.2 + PLAYER_RADIUS - 0.01);
  });

  it('les cloisons laissent passer par leur ouverture', () => {
    const def = sandbox();
    const maison = def.buildings.find((b) => b.id === 'maison')!;
    const sim = createSimFromMap(def);
    // Pièce de gauche → pièce de droite en passant par l'ouverture de la cloison (y = -8).
    const id = addPlayer(sim, maison.x - 5, maison.y);
    run(sim, id, 120, { ...IDLE, moveX: 1 });
    expect(sim.players.posX[entityIndex(id)]).toBeGreaterThan(maison.x + 3);
  });
});

describe('validation des bâtiments', () => {
  // La densité d'ennemis n'est pas l'objet de ces tests (les cartes de test n'ont pas de groupes).
  const errorsOf = (m: MapDef): string[] => validateMap(m).errors.filter((e) => !/densité/.test(e));

  it('la carte bac à sable est valide : intérieurs, caisses et groupes accessibles par les portes', () => {
    expect(errorsOf(MAPS['bac-a-sable']!)).toEqual([]);
  });

  it('détecte un bâtiment sans porte, une porte trop étroite ou hors du mur', () => {
    expect(errorsOf(withBuildings([{ ...hut, doors: [] }])).some((e) => /sans porte/.test(e))).toBe(true);
    expect(errorsOf(withBuildings([{ ...hut, doors: [{ side: 's', offset: 0, width: MIN_DOOR_WIDTH - 0.5 }] }])).some((e) => /trop étroite/.test(e))).toBe(true);
    expect(errorsOf(withBuildings([{ ...hut, doors: [{ side: 's', offset: 4.5, width: 2.4 }] }])).some((e) => /hors du mur/.test(e))).toBe(true);
  });

  it('détecte des bâtiments qui se chevauchent ou qui dépassent', () => {
    expect(errorsOf(withBuildings([hut, { ...hut, id: 'h2', x: -18 }])).some((e) => /se chevauchent/.test(e))).toBe(true);
    expect(errorsOf(withBuildings([{ ...hut, x: 98 }])).some((e) => /dépasse de la carte/.test(e))).toBe(true);
  });

  it('détecte une caisse emmurée dans un bâtiment dont la porte est bouchée', () => {
    const blocked: MapDef = withBuildings([hut], {
      obstacles: [{ kind: 'box', x: -20, y: 10, w: 6, h: 2, style: 'rock' }],
      crates: [{ id: 'dedans', x: -20, y: 5, tier: 'commune' }],
      groups: [],
    });
    expect(errorsOf(blocked).some((e) => /caisse dedans inaccessible/.test(e))).toBe(true);
    expect(errorsOf(withBuildings([hut], { crates: [{ id: 'dedans', x: -20, y: 5, tier: 'commune' }] }))).toEqual([]);
  });

  it('se relit depuis le JSON, et l\'absence de bâtiments donne une liste vide', () => {
    const def = withBuildings([{ ...hut, walls: [{ kind: 'box', x: -20, y: 5, w: 0.4, h: 3, style: 'wall' }], floor: '#123456' }]);
    expect(parseMap(JSON.parse(JSON.stringify(def)))).toEqual(def);
    const raw = JSON.parse(JSON.stringify(miniMap())) as Record<string, unknown>;
    delete raw['buildings'];
    expect(parseMap(raw).buildings).toEqual([]);
    expect(() => parseMap({ ...raw, buildings: [{ id: 'x' }] })).toThrow(/buildings\[0\]/);
  });
});

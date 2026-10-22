import { BUILDING_SIDES, CRATE_TIERS, OBSTACLE_STYLES } from './mapdef';
import type {
  BoxObstacleDef,
  BuildingDef,
  BuildingSide,
  CrateDef,
  CrateTier,
  DecorDef,
  DecorKind,
  EndOfZoneDef,
  ExtractionPointDef,
  GroupDef,
  MapDef,
  ObstacleDef,
  ObstacleStyle,
  MapKind,
  PassageDef,
  Point,
  RefugeDef,
  ShapeDef,
  ZoneDef,
} from './mapdef';

type Json = Record<string, unknown>;

function fail(path: string, what: string): never {
  throw new Error(`Carte invalide : ${path} ${what}`);
}

function rec(v: unknown, path: string): Json {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'doit être un objet');
  return v as Json;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, 'doit être une liste');
  return v;
}

function num(o: Json, k: string, path: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${path}.${k}`, 'doit être un nombre');
  return v;
}

function str(o: Json, k: string, path: string): string {
  const v = o[k];
  if (typeof v !== 'string' || v === '') fail(`${path}.${k}`, 'doit être un texte non vide');
  return v;
}

function oneOf<T extends string>(o: Json, k: string, path: string, allowed: readonly T[]): T {
  const v = str(o, k, path);
  if (!(allowed as readonly string[]).includes(v)) fail(`${path}.${k}`, `doit valoir ${allowed.join(', ')}`);
  return v as T;
}

function point(v: unknown, path: string): Point {
  const o = rec(v, path);
  return { x: num(o, 'x', path), y: num(o, 'y', path) };
}

function list<T>(o: Json, k: string, path: string, parse: (v: unknown, p: string) => T): T[] {
  return arr(o[k], `${path}.${k}`).map((v, i) => parse(v, `${path}.${k}[${i}]`));
}

function obstacle(v: unknown, path: string): ObstacleDef {
  const o = rec(v, path);
  const style = oneOf<ObstacleStyle>(o, 'style', path, OBSTACLE_STYLES);
  const height = o['height'] === undefined ? undefined : num(o, 'height', path);
  if (o['kind'] === 'box') {
    const def: ObstacleDef = { kind: 'box', x: num(o, 'x', path), y: num(o, 'y', path), w: num(o, 'w', path), h: num(o, 'h', path), style };
    if (height !== undefined) def.height = height;
    return def;
  }
  if (o['kind'] === 'circle') {
    const def: ObstacleDef = { kind: 'circle', x: num(o, 'x', path), y: num(o, 'y', path), r: num(o, 'r', path), style };
    if (height !== undefined) def.height = height;
    return def;
  }
  return fail(`${path}.kind`, 'doit valoir box ou circle');
}

function shape(v: unknown, path: string): ShapeDef {
  const o = rec(v, path);
  if (o['kind'] === 'circle') return { kind: 'circle', x: num(o, 'x', path), y: num(o, 'y', path), r: num(o, 'r', path) };
  if (o['kind'] === 'rect') return { kind: 'rect', x: num(o, 'x', path), y: num(o, 'y', path), w: num(o, 'w', path), h: num(o, 'h', path) };
  return fail(`${path}.kind`, 'doit valoir circle ou rect');
}

function box(v: unknown, path: string): BoxObstacleDef {
  const o = obstacle(v, path);
  if (o.kind !== 'box') fail(path, 'doit être une boîte');
  return o;
}

function building(v: unknown, path: string): BuildingDef {
  const o = rec(v, path);
  const def: BuildingDef = {
    id: str(o, 'id', path),
    name: str(o, 'name', path),
    x: num(o, 'x', path),
    y: num(o, 'y', path),
    w: num(o, 'w', path),
    h: num(o, 'h', path),
    doors: list(o, 'doors', path, (dv, dp) => {
      const d = rec(dv, dp);
      return { side: oneOf<BuildingSide>(d, 'side', dp, BUILDING_SIDES), offset: num(d, 'offset', dp), width: num(d, 'width', dp) };
    }),
  };
  if (o['wallThickness'] !== undefined) def.wallThickness = num(o, 'wallThickness', path);
  if (o['height'] !== undefined) def.height = num(o, 'height', path);
  if (o['walls'] !== undefined) def.walls = list(o, 'walls', path, box);
  if (o['floor'] !== undefined) def.floor = str(o, 'floor', path);
  return def;
}

/** Lit le JSON d'une carte et en vérifie la forme (les règles de conception sont dans validateMap). */
export function parseMap(json: unknown): MapDef {
  const o = rec(json, 'carte');
  const palette = rec(o['palette'], 'palette');
  const eoz = rec(o['endOfZone'], 'endOfZone');
  const decorKinds: readonly DecorKind[] = ['road', 'field', 'water'];

  const kind = o['kind'] === undefined ? 'expedition' : oneOf<MapKind>(o, 'kind', 'carte', ['hub', 'expedition']);
  const gate = o['gate'] === undefined ? undefined : rec(o['gate'], 'gate');
  const def: MapDef = {
    id: str(o, 'id', 'carte'),
    kind,
    name: str(o, 'name', 'carte'),
    level: num(o, 'level', 'carte'),
    size: num(o, 'size', 'carte'),
    palette: { ground: str(palette, 'ground', 'palette'), fog: str(palette, 'fog', 'palette') },
    difficulty: str(o, 'difficulty', 'carte'),
    playerStart: point(o['playerStart'], 'playerStart'),
    refuges: list<RefugeDef>(o, 'refuges', 'carte', (v, p) => {
      const r = rec(v, p);
      const ref: RefugeDef = { id: str(r, 'id', p), name: str(r, 'name', p), x: num(r, 'x', p), y: num(r, 'y', p), radius: num(r, 'radius', p), respawn: point(r['respawn'], `${p}.respawn`) };
      if (r['workbench'] !== undefined) ref.workbench = point(r['workbench'], `${p}.workbench`);
      if (r['stash'] !== undefined) ref.stash = point(r['stash'], `${p}.stash`);
      if (r['stations'] !== undefined) ref.stations = r['stations'] === true;
      return ref;
    }),
    obstacles: list<ObstacleDef>(o, 'obstacles', 'carte', obstacle),
    buildings: o['buildings'] === undefined ? [] : list<BuildingDef>(o, 'buildings', 'carte', building),
    decor: list<DecorDef>(o, 'decor', 'carte', (v, p) => {
      const d = rec(v, p);
      return { kind: oneOf<DecorKind>(d, 'kind', p, decorKinds), x: num(d, 'x', p), y: num(d, 'y', p), w: num(d, 'w', p), h: num(d, 'h', p) };
    }),
    groups: list<GroupDef>(o, 'groups', 'carte', (v, p) => {
      const g = rec(v, p);
      return {
        id: str(g, 'id', p),
        x: num(g, 'x', p),
        y: num(g, 'y', p),
        radius: num(g, 'radius', p),
        activation: num(g, 'activation', p),
        members: list(g, 'members', p, (mv, mp) => {
          const m = rec(mv, mp);
          return { type: str(m, 'type', mp), count: num(m, 'count', mp) };
        }),
      };
    }),
    crates: list<CrateDef>(o, 'crates', 'carte', (v, p) => {
      const c = rec(v, p);
      return { id: str(c, 'id', p), x: num(c, 'x', p), y: num(c, 'y', p), tier: oneOf<CrateTier>(c, 'tier', p, CRATE_TIERS) };
    }),
    passages: list<PassageDef>(o, 'passages', 'carte', (v, p) => {
      const q = rec(v, p);
      return {
        id: str(q, 'id', p),
        x: num(q, 'x', p),
        y: num(q, 'y', p),
        w: num(q, 'w', p),
        h: num(q, 'h', p),
        to: q['to'] === null ? null : str(q, 'to', p),
        arrive: q['arrive'] === null ? null : point(q['arrive'], `${p}.arrive`),
      };
    }),
    zones: list<ZoneDef>(o, 'zones', 'carte', (v, p) => {
      const z = rec(v, p);
      return { id: str(z, 'id', p), shape: shape(z['shape'], `${p}.shape`), hpMult: num(z, 'hpMult', p), damageMult: num(z, 'damageMult', p) };
    }),
    endOfZone: {
      countdownSeconds: num(eoz, 'countdownSeconds', 'endOfZone'),
      extraction: list<ExtractionPointDef>(eoz, 'extraction', 'endOfZone', (v, p) => {
        const e = rec(v, p);
        return { id: str(e, 'id', p), x: num(e, 'x', p), y: num(e, 'y', p), radius: num(e, 'radius', p) };
      }),
    } satisfies EndOfZoneDef,
  };
  if (gate !== undefined) {
    def.gate = {
      x: num(gate, 'x', 'gate'),
      y: num(gate, 'y', 'gate'),
      w: num(gate, 'w', 'gate'),
      h: num(gate, 'h', 'gate'),
      maps: list<string>(gate, 'maps', 'gate', (v, p) => {
        if (typeof v !== 'string') throw new Error(`${p} : texte attendu`);
        return v;
      }),
    };
  }
  return def;
}

import { DIFFICULTY_PROFILES } from '../data/difficulty';
import type { DifficultyProfile } from '../data/difficulty';
import { ENEMIES } from '../data/enemies';
import { allObstacles } from './buildings';
import { OBSTACLE_STYLES } from './mapdef';
import type { GroupDef, MapDef, ObstacleStyle, Point, RefugeDef, ShapeDef } from './mapdef';
import { OBSTACLE_BOX, OBSTACLE_CIRCLE, refreshExtent } from './obstacles';
import type { Obstacles } from './obstacles';

/** Hauteur visuelle par défaut selon le style (m). */
export const DEFAULT_HEIGHT: Readonly<Record<ObstacleStyle, number>> = {
  building: 5,
  tree: 6,
  rock: 1.4,
  fence: 1.1,
  vehicle: 1.6,
  wall: 2.5,
};

/** Convertit les obstacles d'une carte au format SoA de la sim. */
export function mapObstacles(def: MapDef): Obstacles {
  const all = allObstacles(def);
  const n = all.length;
  const out: Obstacles = {
    count: n,
    kind: new Uint8Array(n),
    x: new Float32Array(n),
    y: new Float32Array(n),
    a: new Float32Array(n),
    b: new Float32Array(n),
    maxExtent: 0,
    height: new Float32Array(n),
    style: new Uint8Array(n),
  };
  all.forEach((o, i) => {
    out.x[i] = o.x;
    out.y[i] = o.y;
    if (o.kind === 'circle') {
      out.kind[i] = OBSTACLE_CIRCLE;
      out.a[i] = o.r;
      out.b[i] = o.r;
    } else {
      out.kind[i] = OBSTACLE_BOX;
      out.a[i] = o.w / 2;
      out.b[i] = o.h / 2;
    }
    (out.height as Float32Array)[i] = o.height ?? DEFAULT_HEIGHT[o.style];
    (out.style as Uint8Array)[i] = OBSTACLE_STYLES.indexOf(o.style);
  });
  refreshExtent(out);
  return out;
}

export interface RuntimeRefuge {
  x: number;
  y: number;
  radius: number;
  workbench: { x: number; y: number };
  stash: { x: number; y: number };
}

/** Caisse de butin : prête (contenu tiré à la première fouille) ou en remplissage (cooldown). */
export interface RuntimeCrate {
  x: number;
  y: number;
  tier: string;
  ready: boolean;
  /** Ticks restants avant remplissage quand la caisse est vidée. */
  cooldown: number;
  rolled: boolean;
  /** Butin restant (paires objet, quantité) tant que la caisse n'est pas vidée. */
  items: number[];
}

export interface RuntimeGroup {
  def: GroupDef;
  /** Types d'ennemis (index dans ENEMIES) et effectifs, dans l'ordre de la définition. */
  types: number[];
  counts: number[];
  activated: boolean;
}

/** État de carte utilisé par la sim. */
export interface MapRuntime {
  def: MapDef;
  profile: DifficultyProfile;
  /** Demi-côté de la carte. */
  half: number;
  startX: number;
  startY: number;
  refuges: RuntimeRefuge[];
  groups: RuntimeGroup[];
  crates: RuntimeCrate[];
  respawnX: number;
  respawnY: number;
}

/** Positions de l'établi et du stockage d'un refuge (par défaut de part et d'autre du centre, vers le sud). */
export function refugeStations(r: RefugeDef): { workbench: Point; stash: Point } {
  return {
    workbench: r.workbench ?? { x: r.x - r.radius * 0.35, y: r.y + r.radius * 0.3 },
    stash: r.stash ?? { x: r.x + r.radius * 0.35, y: r.y + r.radius * 0.3 },
  };
}

export function enemyTypeIndex(name: string): number {
  return ENEMIES.findIndex((e) => e.name === name);
}

export function buildMapRuntime(def: MapDef): MapRuntime {
  const profile = DIFFICULTY_PROFILES[def.difficulty];
  if (profile === undefined) throw new Error(`Profil de difficulté inconnu : ${def.difficulty}`);
  const refuge = def.refuges[0];
  return {
    def,
    profile,
    half: def.size / 2,
    startX: def.playerStart.x,
    startY: def.playerStart.y,
    refuges: def.refuges.map((r) => ({ x: r.x, y: r.y, radius: r.radius, ...refugeStations(r) })),
    groups: def.groups.map((g) => ({
      def: g,
      types: g.members.map((m) => enemyTypeIndex(m.type)),
      counts: g.members.map((m) => m.count),
      activated: false,
    })),
    crates: def.crates.map((c) => ({ x: c.x, y: c.y, tier: c.tier, ready: true, cooldown: 0, rolled: false, items: [] })),
    respawnX: refuge?.respawn.x ?? def.playerStart.x,
    respawnY: refuge?.respawn.y ?? def.playerStart.y,
  };
}

export function shapeContains(shape: ShapeDef, x: number, y: number): boolean {
  if (shape.kind === 'circle') {
    const dx = x - shape.x;
    const dy = y - shape.y;
    return dx * dx + dy * dy <= shape.r * shape.r;
  }
  return Math.abs(x - shape.x) <= shape.w / 2 && Math.abs(y - shape.y) <= shape.h / 2;
}

/** Multiplicateurs de difficulté au point (x, y) : profil de la carte × zones qui le contiennent. */
export function difficultyAt(map: MapRuntime, x: number, y: number, out: { hp: number; dmg: number }): void {
  out.hp = map.profile.hpMult;
  out.dmg = map.profile.damageMult;
  for (const z of map.def.zones) {
    if (shapeContains(z.shape, x, y)) {
      out.hp *= z.hpMult;
      out.dmg *= z.damageMult;
    }
  }
}

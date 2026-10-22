/**
 * Définition d'une carte fixe (niveau). Les cartes sont des fichiers JSON conçus à la main
 * (src/sim/data/maps/*.json), lus par `parseMap` puis vérifiés par `validateMap`.
 * Repère : l'origine est le centre de la carte, x vers l'est, y vers le sud (bas de l'écran).
 * Les obstacles sont alignés sur les axes (pas de rotation) ; une boîte est donnée par son centre et ses dimensions.
 */
export type ObstacleStyle = 'building' | 'tree' | 'rock' | 'fence' | 'vehicle' | 'wall';
export const OBSTACLE_STYLES: readonly ObstacleStyle[] = ['building', 'tree', 'rock', 'fence', 'vehicle', 'wall'];

export interface BoxObstacleDef {
  kind: 'box';
  x: number;
  y: number;
  /** Dimensions complètes (m). */
  w: number;
  h: number;
  style: ObstacleStyle;
  /** Hauteur visuelle (m) ; par défaut selon le style. */
  height?: number;
}

export interface CircleObstacleDef {
  kind: 'circle';
  x: number;
  y: number;
  r: number;
  style: ObstacleStyle;
  height?: number;
}

export type ObstacleDef = BoxObstacleDef | CircleObstacleDef;

/** Décor sans collision (routes, champs, eau). */
export type DecorKind = 'road' | 'field' | 'water';
export interface DecorDef {
  kind: DecorKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Zone sûre : aucun ennemi n'y entre ; point de réapparition ; établi et stockage aux jalons suivants. */
export interface RefugeDef {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  respawn: Point;
}

export interface GroupMemberDef {
  /** Nom du type d'ennemi (voir sim/data/enemies.ts). */
  type: string;
  count: number;
}

/** Groupe d'ennemis placé à la main : apparaît (au repos) quand un joueur entre dans son rayon d'activation. */
export interface GroupDef {
  id: string;
  x: number;
  y: number;
  /** Rayon de dispersion des membres autour du point d'attache. */
  radius: number;
  /** Distance du joueur à laquelle le groupe apparaît. */
  activation: number;
  members: GroupMemberDef[];
}

export type CrateTier = 'commune' | 'rare' | 'militaire';
export const CRATE_TIERS: readonly CrateTier[] = ['commune', 'rare', 'militaire'];

export interface CrateDef {
  id: string;
  x: number;
  y: number;
  tier: CrateTier;
}

/** Passage vers une autre carte ; `to` est null tant que la carte de destination n'existe pas. */
export interface PassageDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  to: string | null;
  arrive: Point | null;
}

export type ShapeDef = { kind: 'circle'; x: number; y: number; r: number } | { kind: 'rect'; x: number; y: number; w: number; h: number };

/** Surcharge locale du profil de difficulté (multiplicateurs appliqués aux ennemis qui y apparaissent). */
export interface ZoneDef {
  id: string;
  shape: ShapeDef;
  hpMult: number;
  damageMult: number;
}

/** Porte : ouverture dans un mur extérieur. `offset` est la distance du centre de la porte au centre du côté. */
export type BuildingSide = 'n' | 's' | 'e' | 'w';
export const BUILDING_SIDES: readonly BuildingSide[] = ['n', 's', 'e', 'w'];
export interface DoorDef {
  side: BuildingSide;
  offset: number;
  width: number;
}

/**
 * Bâtiment visitable : une emprise rectangulaire fermée par des murs (collision), percée de portes.
 * Les cloisons intérieures sont des boîtes ordinaires (à vous d'y laisser des passages).
 * Le toit se rend transparent quand un joueur est à l'intérieur.
 */
export interface BuildingDef {
  id: string;
  name: string;
  /** Centre et dimensions extérieures. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Épaisseur des murs extérieurs (défaut 0,4 m). */
  wallThickness?: number;
  /** Hauteur des murs (défaut 3 m). */
  height?: number;
  doors: DoorDef[];
  /** Cloisons intérieures. */
  walls?: BoxObstacleDef[];
  /** Couleur du sol. */
  floor?: string;
}

export interface ExtractionPointDef {
  id: string;
  x: number;
  y: number;
  radius: number;
}

/** Fin de zone (jalon M9) : durée du compte à rebours et points d'extraction. */
export interface EndOfZoneDef {
  countdownSeconds: number;
  extraction: ExtractionPointDef[];
}

export interface MapDef {
  id: string;
  name: string;
  level: number;
  /** Côté de la carte (m), carrée, centrée sur l'origine. */
  size: number;
  palette: { ground: string; fog: string };
  /** Identifiant du profil de difficulté (voir sim/data/difficulty.ts). */
  difficulty: string;
  playerStart: Point;
  refuges: RefugeDef[];
  obstacles: ObstacleDef[];
  /** Bâtiments visitables (facultatif). */
  buildings: BuildingDef[];
  decor: DecorDef[];
  groups: GroupDef[];
  crates: CrateDef[];
  passages: PassageDef[];
  zones: ZoneDef[];
  endOfZone: EndOfZoneDef;
}

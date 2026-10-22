import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  SphereGeometry,
} from 'three';
import type { BufferGeometry } from 'three';

type Rgb = readonly [number, number, number];

/** Silhouette et couleurs d'un type d'ennemi : chaque type se reconnaît à sa forme et à sa teinte. */
export interface EnemyVisual {
  geometry: () => BufferGeometry;
  /** Hauteur du centre de la forme. */
  y: number;
  /** Échelle horizontale et verticale. */
  scale: readonly [number, number];
  color: Rgb;
  /** Teinte une fois alerté (poursuite). */
  alert: Rgb;
  /** Teinte du signal d'attaque (préparation). */
  telegraph: Rgb;
}

/** Index = type d'ennemi (voir sim/data/enemies.ts). */
export const ENEMY_VISUALS: readonly EnemyVisual[] = [
  // rodeur
  { geometry: () => new CapsuleGeometry(0.34, 0.55, 4, 8), y: 0.62, scale: [1.1, 1], color: [0.28, 0.42, 0.2], alert: [0.62, 0.2, 0.14], telegraph: [1, 1, 1] },
  // coureur : fin et jaune
  { geometry: () => new CapsuleGeometry(0.26, 0.6, 4, 8), y: 0.6, scale: [1, 1], color: [0.62, 0.55, 0.15], alert: [0.95, 0.4, 0.1], telegraph: [1, 1, 1] },
  // brute : large, brun sombre
  { geometry: () => new CylinderGeometry(0.75, 0.85, 1.5, 10), y: 0.75, scale: [1, 1], color: [0.36, 0.2, 0.15], alert: [0.7, 0.12, 0.1], telegraph: [1, 0.9, 0.2] },
  // cracheur : cône turquoise
  { geometry: () => new ConeGeometry(0.45, 1.3, 8), y: 0.65, scale: [1, 1], color: [0.08, 0.45, 0.45], alert: [0.15, 0.8, 0.75], telegraph: [1, 0.25, 0.85] },
  // explosif : sphère orange
  { geometry: () => new SphereGeometry(0.45, 12, 8), y: 0.5, scale: [1, 1], color: [0.75, 0.4, 0.08], alert: [1, 0.55, 0.1], telegraph: [1, 1, 0.85] },
  // hurleur : entonnoir violet
  { geometry: () => new CylinderGeometry(0.18, 0.42, 1.5, 8), y: 0.75, scale: [1, 1], color: [0.45, 0.22, 0.6], alert: [0.7, 0.35, 0.95], telegraph: [1, 0.85, 1] },
  // colosse : gros polyèdre rouge sang
  { geometry: () => new DodecahedronGeometry(1.1), y: 1.1, scale: [1, 1], color: [0.42, 0.07, 0.07], alert: [0.8, 0.1, 0.1], telegraph: [1, 0.25, 0.85] },
  // souche : tertre violacé
  { geometry: () => new CylinderGeometry(1.5, 1.9, 1.1, 9), y: 0.55, scale: [1, 1], color: [0.35, 0.1, 0.3], alert: [0.7, 0.15, 0.55], telegraph: [1, 1, 1] },
];

export const PROJECTILE_BOX = () => new BoxGeometry(0.6, 0.13, 0.13);
export const PROJECTILE_ORB = () => new SphereGeometry(0.22, 8, 6);

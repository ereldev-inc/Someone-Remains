import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';
import type { BufferGeometry, Material, Scene } from 'three';
import { ENEMY_POOL_SIZE, PROJECTILE_POOL_SIZE } from '../../sim/data/enemies';
import { OUT_ENEMY_STRIDE, OUT_PROJ_STRIDE } from './interp';
import type { InterpState } from './interp';

/** Couleur de base de chaque type d'ennemi (index = type). */
const ENEMY_COLORS: readonly (readonly [number, number, number])[] = [[0.28, 0.42, 0.2]];
/** Couleur des projectiles par genre (0 = joueur, 1 = ennemi) : très contrastées avec le fond. */
const PROJECTILE_COLORS: readonly (readonly [number, number, number])[] = [
  [1, 0.9, 0.35],
  [1, 0.15, 0.7],
];
const ENEMY_BODY_Y = 0.62;
const PROJECTILE_Y = 0.85;

function makeInstanced(geometry: BufferGeometry, material: Material, capacity: number): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

function initColors(mesh: InstancedMesh): Float32Array {
  mesh.setColorAt(0, new Color(1, 1, 1));
  const attr = mesh.instanceColor;
  if (attr === null) throw new Error('instanceColor non créé');
  attr.setUsage(DynamicDrawUsage);
  return attr.array as Float32Array;
}

/** Matrice position + échelle, orientée par l'angle de la sim : +X local → (cos, 0, sin) dans la scène. */
function writeMatrix(a: Float32Array, i: number, x: number, y: number, z: number, angle: number, sx: number, sy: number, sz: number): void {
  const o = i * 16;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  a[o] = c * sx;
  a[o + 1] = 0;
  a[o + 2] = s * sx;
  a[o + 3] = 0;
  a[o + 4] = 0;
  a[o + 5] = sy;
  a[o + 6] = 0;
  a[o + 7] = 0;
  a[o + 8] = -s * sz;
  a[o + 9] = 0;
  a[o + 10] = c * sz;
  a[o + 11] = 0;
  a[o + 12] = x;
  a[o + 13] = y;
  a[o + 14] = z;
  a[o + 15] = 1;
}

/** Ennemis et projectiles : un InstancedMesh par catégorie, mis à jour depuis les tableaux interpolés. */
export class CrowdRenderer {
  private readonly enemies: InstancedMesh;
  private readonly enemyColors: Float32Array;
  private readonly enemyShadows: InstancedMesh;
  private readonly projectiles: InstancedMesh;
  private readonly projectileColors: Float32Array;
  enemyCount = 0;
  projectileCount = 0;

  constructor(scene: Scene) {
    this.enemies = makeInstanced(
      new CapsuleGeometry(0.34, 0.55, 4, 8),
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
      ENEMY_POOL_SIZE,
    );
    this.enemyColors = initColors(this.enemies);

    const shadowGeometry = new CircleGeometry(0.5, 14);
    shadowGeometry.rotateX(-Math.PI / 2);
    this.enemyShadows = makeInstanced(
      shadowGeometry,
      new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }),
      ENEMY_POOL_SIZE,
    );

    this.projectiles = makeInstanced(new BoxGeometry(0.6, 0.13, 0.13), new MeshBasicMaterial({ color: 0xffffff }), PROJECTILE_POOL_SIZE);
    this.projectileColors = initColors(this.projectiles);

    scene.add(this.enemyShadows, this.enemies, this.projectiles);
  }

  update(state: InterpState): void {
    const em = this.enemies.instanceMatrix.array as Float32Array;
    const sm = this.enemyShadows.instanceMatrix.array as Float32Array;
    let n = 0;
    for (let s = 0; s < state.enemyHigh; s++) {
      const o = s * OUT_ENEMY_STRIDE;
      const type = state.enemies[o] as number;
      if (type === 0) continue;
      const x = state.enemies[o + 1] as number;
      const y = state.enemies[o + 2] as number;
      const flash = state.enemies[o + 4] as number;
      writeMatrix(em, n, x, ENEMY_BODY_Y, y, (state.enemies[o + 3] as number), 1.1, 1, 1.1);
      writeMatrix(sm, n, x, 0.02, y, 0, 1, 1, 1);
      const base = ENEMY_COLORS[type - 1] ?? ENEMY_COLORS[0]!;
      const c = n * 3;
      this.enemyColors[c] = (base[0] as number) + (1 - (base[0] as number)) * flash;
      this.enemyColors[c + 1] = (base[1] as number) + (1 - (base[1] as number)) * flash;
      this.enemyColors[c + 2] = (base[2] as number) + (1 - (base[2] as number)) * flash;
      n++;
    }
    this.enemyCount = n;
    this.enemies.count = n;
    this.enemyShadows.count = n;
    this.enemies.instanceMatrix.needsUpdate = true;
    this.enemyShadows.instanceMatrix.needsUpdate = true;
    if (this.enemies.instanceColor) this.enemies.instanceColor.needsUpdate = true;

    const pm = this.projectiles.instanceMatrix.array as Float32Array;
    let p = 0;
    for (let s = 0; s < state.projectileHigh; s++) {
      const o = s * OUT_PROJ_STRIDE;
      const kind = state.projectiles[o] as number;
      if (kind === 0) continue;
      writeMatrix(pm, p, state.projectiles[o + 1] as number, PROJECTILE_Y, state.projectiles[o + 2] as number, (state.projectiles[o + 3] as number), 1, 1, 1);
      const base = PROJECTILE_COLORS[kind - 1] ?? PROJECTILE_COLORS[0]!;
      const c = p * 3;
      this.projectileColors[c] = base[0] as number;
      this.projectileColors[c + 1] = base[1] as number;
      this.projectileColors[c + 2] = base[2] as number;
      p++;
    }
    this.projectileCount = p;
    this.projectiles.count = p;
    this.projectiles.instanceMatrix.needsUpdate = true;
    if (this.projectiles.instanceColor) this.projectiles.instanceColor.needsUpdate = true;
  }
}

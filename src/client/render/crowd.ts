import {
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  BoxGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';
import type { BufferGeometry, Material, Scene } from 'three';
import {
  ENEMIES,
  ENEMY_BRUTE,
  ENEMY_COLOSSE,
  ENEMY_EXPLOSIF,
  ENEMY_POOL_SIZE,
  PROJECTILE_POOL_SIZE,
} from '../../sim/data/enemies';
import { TICK_RATE } from '../../sim/types';
import { ENEMY_VISUALS, PROJECTILE_BOX, PROJECTILE_ORB } from './enemyVisuals';
import { OUT_ENEMY_STRIDE, OUT_PROJ_STRIDE } from './interp';
import type { InterpState } from './interp';

/** Couleur des projectiles par genre (0 = joueur, 1 = ennemi) : très contrastées avec le fond. */
const PLAYER_BULLET: readonly [number, number, number] = [1, 0.9, 0.35];
const ENEMY_BULLET: readonly [number, number, number] = [1, 0.15, 0.7];
const PROJECTILE_Y = 0.85;
const RAGE_TINT: readonly [number, number, number] = [1, 0.55, 0.1];
const TELEGRAPH_CAPACITY = 64;

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

interface TypeLayer {
  mesh: InstancedMesh;
  colors: Float32Array;
}

/** Ennemis et projectiles : un InstancedMesh par type d'ennemi, mis à jour depuis les tableaux interpolés. */
export class CrowdRenderer {
  private readonly layers: TypeLayer[] = [];
  private readonly shadows: InstancedMesh;
  private readonly playerBullets: InstancedMesh;
  private readonly playerBulletColors: Float32Array;
  private readonly enemyBullets: InstancedMesh;
  private readonly enemyBulletColors: Float32Array;
  /** Zones de danger : couloir de charge de la brute, rayon d'explosion de l'explosif. */
  private readonly lanes: InstancedMesh;
  private readonly blasts: InstancedMesh;
  enemyCount = 0;
  alertCount = 0;
  projectileCount = 0;
  /** Fraction de PV du premier Colosse alerté, ou -1. */
  bossFraction = -1;

  constructor(scene: Scene) {
    for (const visual of ENEMY_VISUALS) {
      const mesh = makeInstanced(visual.geometry(), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), ENEMY_POOL_SIZE);
      this.layers.push({ mesh, colors: initColors(mesh) });
      scene.add(mesh);
    }

    const shadowGeometry = new CircleGeometry(0.5, 14);
    shadowGeometry.rotateX(-Math.PI / 2);
    this.shadows = makeInstanced(shadowGeometry, new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }), ENEMY_POOL_SIZE);

    this.playerBullets = makeInstanced(PROJECTILE_BOX(), new MeshBasicMaterial({ color: 0xffffff }), PROJECTILE_POOL_SIZE);
    this.playerBulletColors = initColors(this.playerBullets);
    this.enemyBullets = makeInstanced(PROJECTILE_ORB(), new MeshBasicMaterial({ color: 0xffffff }), PROJECTILE_POOL_SIZE);
    this.enemyBulletColors = initColors(this.enemyBullets);

    const laneGeometry = new BoxGeometry(1, 0.02, 1);
    laneGeometry.translate(0.5, 0, 0); // l'origine est au départ du couloir
    this.lanes = makeInstanced(laneGeometry, new MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.3, depthWrite: false }), TELEGRAPH_CAPACITY);
    const blastGeometry = new CircleGeometry(1, 28);
    blastGeometry.rotateX(-Math.PI / 2);
    this.blasts = makeInstanced(blastGeometry, new MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.25, depthWrite: false }), TELEGRAPH_CAPACITY);

    scene.add(this.shadows, this.playerBullets, this.enemyBullets, this.lanes, this.blasts);
  }

  update(state: InterpState, timeMs: number): void {
    const sm = this.shadows.instanceMatrix.array as Float32Array;
    const counts = this.layers.map(() => 0);
    let total = 0;
    let alerts = 0;
    let lanes = 0;
    let blasts = 0;
    this.bossFraction = -1;
    const lm = this.lanes.instanceMatrix.array as Float32Array;
    const bm = this.blasts.instanceMatrix.array as Float32Array;
    const pulse = 0.5 + 0.5 * Math.sin(timeMs / 70);

    for (let s = 0; s < state.enemyHigh; s++) {
      const o = s * OUT_ENEMY_STRIDE;
      const typePlus = state.enemies[o] as number;
      if (typePlus === 0) continue;
      const type = typePlus - 1;
      const visual = ENEMY_VISUALS[type];
      const layer = this.layers[type];
      if (visual === undefined || layer === undefined) continue;

      const x = state.enemies[o + 1] as number;
      const y = state.enemies[o + 2] as number;
      const angle = state.enemies[o + 3] as number;
      const flash = state.enemies[o + 4] as number;
      const alert = (state.enemies[o + 5] as number) === 1;
      const rawPhase = state.enemies[o + 6] as number;
      const phase = rawPhase & 7;
      const raging = (rawPhase & 8) !== 0;
      if (alert) alerts++;
      if (type === ENEMY_COLOSSE && alert && this.bossFraction < 0) this.bossFraction = state.enemies[o + 7] as number;

      let base = alert || phase !== 0 ? visual.alert : visual.color;
      let mix = flash;
      if (phase === 1) {
        base = visual.telegraph;
        mix = Math.max(mix, type === ENEMY_EXPLOSIF ? 0.4 + 0.6 * Math.abs(Math.sin(timeMs / 45)) : 0.35 + 0.35 * pulse);
      } else if (phase === 2) {
        base = [1, 0.3, 0.2];
        mix = Math.max(mix, 0.5);
      } else if (phase === 3) {
        base = [0.3, 0.3, 0.32];
      }
      if (raging && phase === 0) base = RAGE_TINT;

      const i = counts[type] as number;
      let sx = visual.scale[0];
      if (type === ENEMY_EXPLOSIF && phase === 1) sx *= 1 + 0.18 * pulse;
      writeMatrix(layer.mesh.instanceMatrix.array as Float32Array, i, x, visual.y, y, angle, sx, visual.scale[1], sx);
      const c = i * 3;
      layer.colors[c] = (base[0] as number) + (1 - (base[0] as number)) * mix;
      layer.colors[c + 1] = (base[1] as number) + (1 - (base[1] as number)) * mix;
      layer.colors[c + 2] = (base[2] as number) + (1 - (base[2] as number)) * mix;
      counts[type] = i + 1;

      writeMatrix(sm, total, x, 0.02, y, 0, (ENEMIES[type]?.radius ?? 0.5) * 2.2, 1, (ENEMIES[type]?.radius ?? 0.5) * 2.2);
      total++;

      // Signaux de danger : couloir de la charge (direction verrouillée) et rayon de l'explosion.
      if (phase === 1 && type === ENEMY_BRUTE && lanes < TELEGRAPH_CAPACITY) {
        const ch = ENEMIES[ENEMY_BRUTE]?.charge;
        if (ch !== undefined) {
          const length = (ch.chargeSpeed * ch.chargeTicks) / TICK_RATE;
          writeMatrix(lm, lanes++, x, 0.03, y, angle, length, 1, (ENEMIES[ENEMY_BRUTE]?.radius ?? 0.7) * 2);
        }
      }
      if (phase === 1 && type === ENEMY_EXPLOSIF && blasts < TELEGRAPH_CAPACITY) {
        const r = ENEMIES[ENEMY_EXPLOSIF]?.explode?.radius ?? 3;
        writeMatrix(bm, blasts++, x, 0.03, y, 0, r, 1, r);
      }
    }

    this.enemyCount = total;
    this.alertCount = alerts;
    this.layers.forEach((layer, type) => {
      layer.mesh.count = counts[type] as number;
      layer.mesh.instanceMatrix.needsUpdate = true;
      if (layer.mesh.instanceColor) layer.mesh.instanceColor.needsUpdate = true;
    });
    this.shadows.count = total;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.lanes.count = lanes;
    this.lanes.instanceMatrix.needsUpdate = true;
    this.blasts.count = blasts;
    this.blasts.instanceMatrix.needsUpdate = true;

    const pm = this.playerBullets.instanceMatrix.array as Float32Array;
    const em = this.enemyBullets.instanceMatrix.array as Float32Array;
    let pc = 0;
    let ec = 0;
    for (let s = 0; s < state.projectileHigh; s++) {
      const o = s * OUT_PROJ_STRIDE;
      const kind = state.projectiles[o] as number;
      if (kind === 0) continue;
      const px = state.projectiles[o + 1] as number;
      const py = state.projectiles[o + 2] as number;
      if (kind === 1) {
        writeMatrix(pm, pc, px, PROJECTILE_Y, py, state.projectiles[o + 3] as number, 1, 1, 1);
        const c = pc * 3;
        this.playerBulletColors[c] = PLAYER_BULLET[0];
        this.playerBulletColors[c + 1] = PLAYER_BULLET[1];
        this.playerBulletColors[c + 2] = PLAYER_BULLET[2];
        pc++;
      } else {
        writeMatrix(em, ec, px, PROJECTILE_Y, py, 0, 1, 1, 1);
        const c = ec * 3;
        this.enemyBulletColors[c] = ENEMY_BULLET[0];
        this.enemyBulletColors[c + 1] = ENEMY_BULLET[1];
        this.enemyBulletColors[c + 2] = ENEMY_BULLET[2];
        ec++;
      }
    }
    this.projectileCount = pc + ec;
    this.playerBullets.count = pc;
    this.enemyBullets.count = ec;
    this.playerBullets.instanceMatrix.needsUpdate = true;
    this.enemyBullets.instanceMatrix.needsUpdate = true;
    if (this.playerBullets.instanceColor) this.playerBullets.instanceColor.needsUpdate = true;
    if (this.enemyBullets.instanceColor) this.enemyBullets.instanceColor.needsUpdate = true;
  }
}

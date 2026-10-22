import { DynamicDrawUsage, Color, InstancedMesh, MeshBasicMaterial, OctahedronGeometry } from 'three';
import type { Scene } from 'three';
import { ITEMS } from '../../sim/data/items';
import { PICKUP_POOL_SIZE } from '../../sim/data/loot';
import { PICKUP_COUNT, PICKUP_ITEM, PICKUP_STRIDE, PICKUP_X, PICKUP_Y } from '../../sim/snapshot';
import type { InterpState } from './interp';

const COLORS = ITEMS.map((i) => new Color(i.color));

/** Objets au sol : petits losanges colorés selon l'objet, qui flottent doucement. */
export class PickupRenderer {
  private readonly mesh: InstancedMesh;
  private readonly colors: Float32Array;
  count = 0;

  constructor(scene: Scene) {
    this.mesh = new InstancedMesh(new OctahedronGeometry(0.28), new MeshBasicMaterial({ color: 0xffffff }), PICKUP_POOL_SIZE);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new Color(1, 1, 1));
    const attr = this.mesh.instanceColor;
    if (attr === null) throw new Error('instanceColor non créé');
    attr.setUsage(DynamicDrawUsage);
    this.colors = attr.array as Float32Array;
    scene.add(this.mesh);
  }

  update(state: InterpState, timeMs: number): void {
    const a = this.mesh.instanceMatrix.array as Float32Array;
    let n = 0;
    for (let s = 0; s < state.pickupHigh; s++) {
      const o = s * PICKUP_STRIDE;
      const item = state.pickups[o + PICKUP_ITEM] as number;
      if (item === 0) continue;
      const bob = 0.45 + Math.sin(timeMs / 300 + s) * 0.08;
      const m = n * 16;
      const scale = 1 + Math.min(0.5, (state.pickups[o + PICKUP_COUNT] as number) / 40);
      a[m] = scale;
      a[m + 1] = 0;
      a[m + 2] = 0;
      a[m + 3] = 0;
      a[m + 4] = 0;
      a[m + 5] = scale;
      a[m + 6] = 0;
      a[m + 7] = 0;
      a[m + 8] = 0;
      a[m + 9] = 0;
      a[m + 10] = scale;
      a[m + 11] = 0;
      a[m + 12] = state.pickups[o + PICKUP_X] as number;
      a[m + 13] = bob;
      a[m + 14] = state.pickups[o + PICKUP_Y] as number;
      a[m + 15] = 1;
      const c = COLORS[item - 1] ?? COLORS[0]!;
      this.colors[n * 3] = c.r;
      this.colors[n * 3 + 1] = c.g;
      this.colors[n * 3 + 2] = c.b;
      n++;
    }
    this.count = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

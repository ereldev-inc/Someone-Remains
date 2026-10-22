import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';
import type { Scene } from 'three';
import { FLAG_DASHING, FLAG_DEAD, FLAG_HURT } from '../../sim/snapshot';
import type { InterpState } from './interp';

const bodyGeometry = new CapsuleGeometry(0.34, 0.7, 4, 10);
const gunGeometry = new BoxGeometry(0.7, 0.14, 0.14);
const shadowGeometry = new CircleGeometry(0.62, 20);
const shadowMaterial = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 });

class PlayerView {
  readonly group = new Group();
  private readonly bodyMaterial: MeshStandardMaterial;

  constructor(color: number) {
    this.bodyMaterial = new MeshStandardMaterial({ color, roughness: 0.6 });
    const body = new Mesh(bodyGeometry, this.bodyMaterial);
    body.position.y = 0.75;
    const gun = new Mesh(gunGeometry, new MeshStandardMaterial({ color: 0x2b3138 }));
    gun.position.set(0.5, 0.85, 0);
    const shadow = new Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.group.add(shadow, body, gun);
  }

  setStatus(dashing: boolean, hurt: boolean, timeMs: number): void {
    if (dashing) {
      this.bodyMaterial.emissive.setHex(0x36d1ff);
      this.bodyMaterial.emissiveIntensity = 0.9;
    } else if (hurt) {
      this.bodyMaterial.emissive.setHex(0xff2a2a);
      this.bodyMaterial.emissiveIntensity = 0.5 + 0.5 * Math.sin(timeMs / 40);
    } else {
      this.bodyMaterial.emissive.setHex(0x000000);
      this.bodyMaterial.emissiveIntensity = 0;
    }
  }
}

/** Une vue par joueur de la sim, créée à la demande. */
export class PlayerViews {
  private readonly views = new Map<number, PlayerView>();

  constructor(
    private readonly scene: Scene,
    private readonly localId: () => number,
  ) {}

  update(state: InterpState, timeMs: number): void {
    const seen = new Set<number>();
    for (let i = 0; i < state.count; i++) {
      const id = state.ids[i] as number;
      seen.add(id);
      let view = this.views.get(id);
      if (view === undefined) {
        view = new PlayerView(id === this.localId() ? 0x6fd08c : 0x6fa8d0);
        this.views.set(id, view);
        this.scene.add(view.group);
      }
      view.group.position.set(state.x[i] as number, 0, state.y[i] as number);
      view.group.rotation.y = -(state.aim[i] as number);
      const flags = state.flags[i] as number;
      view.group.visible = (flags & FLAG_DEAD) === 0;
      view.setStatus((flags & FLAG_DASHING) !== 0, (flags & FLAG_HURT) !== 0, timeMs);
    }
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.scene.remove(view.group);
        this.views.delete(id);
      }
    }
  }
}

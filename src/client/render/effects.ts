import { CircleGeometry, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import type { Scene } from 'three';

const ringGeometry = new RingGeometry(0.94, 1, 56);
ringGeometry.rotateX(-Math.PI / 2);
const discGeometry = new CircleGeometry(1, 32);
discGeometry.rotateX(-Math.PI / 2);

interface Effect {
  mesh: Mesh;
  material: MeshBasicMaterial;
  start: number;
  duration: number;
  radius: number;
  startOpacity: number;
  /** Part du rayon final au départ (les anneaux grandissent, les flashs gonflent peu). */
  from: number;
}

/** Effets de zone brefs (explosions, cris) : un petit pool de disques et d'anneaux qui s'estompent. */
export class Effects {
  private readonly pool: Effect[] = [];

  constructor(scene: Scene, capacity = 32) {
    for (let i = 0; i < capacity; i++) {
      const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new Mesh(ringGeometry, material);
      mesh.visible = false;
      mesh.position.y = 0.05;
      scene.add(mesh);
      this.pool.push({ mesh, material, start: 0, duration: 1, radius: 1, startOpacity: 0, from: 0 });
    }
  }

  private acquire(): Effect | undefined {
    return this.pool.find((e) => !e.mesh.visible);
  }

  private start(geometry: Mesh['geometry'], x: number, y: number, radius: number, color: number, now: number, duration: number, opacity: number, from: number): void {
    const e = this.acquire();
    if (e === undefined) return;
    e.mesh.geometry = geometry;
    e.material.color.setHex(color);
    e.mesh.position.set(x, 0.05, y);
    e.start = now;
    e.duration = duration;
    e.radius = radius;
    e.startOpacity = opacity;
    e.from = from;
    e.mesh.visible = true;
  }

  /** Explosion : disque orange qui gonfle et s'éteint, avec un anneau. */
  explosion(x: number, y: number, radius: number, now: number): void {
    this.start(discGeometry, x, y, radius, 0xff8a1f, now, 320, 0.75, 0.5);
    this.start(ringGeometry, x, y, radius * 1.15, 0xfff2c4, now, 420, 0.9, 0.3);
  }

  /** Cri : anneau violet qui s'étend. */
  scream(x: number, y: number, radius: number, now: number): void {
    this.start(ringGeometry, x, y, radius, 0xc77dff, now, 700, 0.8, 0.1);
  }

  update(now: number): void {
    for (const e of this.pool) {
      if (!e.mesh.visible) continue;
      const t = (now - e.start) / e.duration;
      if (t >= 1) {
        e.mesh.visible = false;
        continue;
      }
      const scale = e.radius * (e.from + (1 - e.from) * Math.min(1, t * 1.6));
      e.mesh.scale.set(scale, 1, scale);
      e.material.opacity = e.startOpacity * (1 - t) * (1 - t);
    }
  }
}

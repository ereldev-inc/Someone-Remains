import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  Fog,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { BufferGeometry } from 'three';
import { OBSTACLE_STYLES } from '../../sim/world/mapdef';
import type { DecorDef, MapDef, ObstacleStyle } from '../../sim/world/mapdef';
import { insideBuilding, wallHeight, wallThickness } from '../../sim/world/buildings';
import type { BuildingDef } from '../../sim/world/mapdef';
import { OBSTACLE_CIRCLE } from '../../sim/world/obstacles';
import type { Obstacles } from '../../sim/world/obstacles';

const BACKGROUND = 0x0b0d10;
const CAMERA_FOV = 35;
/** Inclinaison de la caméra par rapport à l'horizontale. */
const CAMERA_PITCH = (60 * Math.PI) / 180;
const CAMERA_DISTANCE = 26;
const CAMERA_DAMPING = 9;
const GROUND_SIZE = 240;
const GROUND_TILE = 8;

/** Couleurs (linéaires) par style d'obstacle. */
const STYLE_COLORS: Readonly<Record<ObstacleStyle, readonly [number, number, number]>> = {
  building: [0.07, 0.06, 0.05],
  tree: [0.012, 0.05, 0.014],
  rock: [0.09, 0.09, 0.085],
  fence: [0.07, 0.04, 0.018],
  vehicle: [0.08, 0.022, 0.02],
  wall: [0.08, 0.08, 0.09],
};

const scratchNear = new Vector3();
const scratchDir = new Vector3();

export class GameScene {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly ground: Mesh;
  private readonly focus = new Vector3();
  private focusReady = false;
  /** Rotation de la caméra autour du joueur (radians) : 0 = le nord (y négatif) est en haut de l'écran. */
  yaw = 0;
  private readonly roofs: Array<{ def: BuildingDef; mesh: Mesh; material: MeshStandardMaterial; opacity: number }> = [];
  private readonly crateMeshes: Array<{ mesh: Mesh; material: MeshStandardMaterial; color: number; ready: boolean }> = [];

  constructor(container: HTMLElement) {
    this.scene.background = new Color(BACKGROUND);
    this.scene.fog = new Fog(BACKGROUND, 55, 110);

    this.camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.5, 250);

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene.add(new AmbientLight(0xffffff, 0.75));
    const sun = new DirectionalLight(0xfff2dd, 2.2);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);

    this.ground = new Mesh(
      new PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
      new MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1, metalness: 0 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.scene.add(this.ground);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Obstacles de la sim : une InstancedMesh par forme (boîtes, cylindres, cônes pour les arbres, rochers). */
  setObstacles(o: Obstacles): void {
    const groups: Record<'box' | 'cylinder' | 'cone' | 'rock', number[]> = { box: [], cylinder: [], cone: [], rock: [] };
    for (let i = 0; i < o.count; i++) {
      const style = OBSTACLE_STYLES[o.style?.[i] ?? 0] ?? 'building';
      if (o.kind[i] === OBSTACLE_CIRCLE) {
        if (style === 'tree') groups.cone.push(i);
        else if (style === 'rock') groups.rock.push(i);
        else groups.cylinder.push(i);
      } else groups.box.push(i);
    }
    const dummy = new Object3D();
    const build = (indices: number[], geometry: BufferGeometry, shape: 'box' | 'cylinder' | 'cone' | 'rock'): void => {
      if (indices.length === 0) return;
      const mesh = new InstancedMesh(geometry, new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), indices.length);
      indices.forEach((src, k) => {
        const a = o.a[src] as number;
        const b = o.b[src] as number;
        const style = OBSTACLE_STYLES[o.style?.[src] ?? 0] ?? 'building';
        const height = o.height?.[src] ?? 2 + (src % 4) * 0.8;
        dummy.rotation.set(0, 0, 0);
        dummy.position.set(o.x[src] as number, height / 2, o.y[src] as number);
        if (shape === 'box') dummy.scale.set(a * 2, height, b * 2);
        else if (shape === 'cone') {
          // Houppier plus large que le tronc (le collider) : l'arbre se lit mieux.
          dummy.scale.set(a * 1.9, height, a * 1.9);
        } else if (shape === 'rock') {
          dummy.position.y = a * 0.45;
          dummy.scale.set(a, a * 0.9, a);
          dummy.rotation.y = src;
        } else dummy.scale.set(a, height, a);
        dummy.updateMatrix();
        mesh.setMatrixAt(k, dummy.matrix);
        const [r, g, bl] = STYLE_COLORS[style];
        const v = 0.85 + ((src * 37) % 10) * 0.03;
        mesh.setColorAt(k, new Color().setRGB(r * v, g * v, bl * v));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
    };
    build(groups.box, new BoxGeometry(1, 1, 1), 'box');
    build(groups.cylinder, new CylinderGeometry(1, 1, 1, 20), 'cylinder');
    build(groups.cone, new ConeGeometry(1, 1, 8), 'cone');
    build(groups.rock, new DodecahedronGeometry(1, 0), 'rock');
  }

  /** Décor et repères de la carte : sol, routes, refuges, caisses, passages, extractions, limites. */
  setMap(def: MapDef): void {
    this.scene.background = new Color(def.palette.fog);
    this.scene.fog = new Fog(def.palette.fog, 55, 110);
    (this.ground.material as MeshStandardMaterial).map = makeGroundTexture(def.palette.ground);
    (this.ground.material as MeshStandardMaterial).needsUpdate = true;

    const flat = (items: DecorDef[], color: readonly [number, number, number], y: number): void => {
      if (items.length === 0) return;
      const mesh = new InstancedMesh(new BoxGeometry(1, 0.02, 1), new MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), items.length);
      const dummy = new Object3D();
      items.forEach((d, i) => {
        dummy.position.set(d.x, y, d.y);
        dummy.scale.set(d.w, 1, d.h);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, new Color().setRGB(color[0], color[1], color[2]));
      });
      this.scene.add(mesh);
    };
    flat(def.decor.filter((d) => d.kind === 'field'), [0.025, 0.045, 0.02], 0.02);
    flat(def.decor.filter((d) => d.kind === 'water'), [0.01, 0.03, 0.07], 0.025);
    flat(def.decor.filter((d) => d.kind === 'road'), [0.07, 0.06, 0.045], 0.03);

    const disc = (x: number, y: number, r: number, color: number, opacity: number, h: number): void => {
      const g = new CircleGeometry(r, 48);
      g.rotateX(-Math.PI / 2);
      const m = new Mesh(g, new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      m.position.set(x, h, y);
      this.scene.add(m);
      const ring = new Mesh(new RingGeometry(r - 0.25, r, 64).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.position.set(x, h + 0.01, y);
      this.scene.add(ring);
    };
    for (const r of def.refuges) disc(r.x, r.y, r.radius, 0x3ddc84, 0.1, 0.05);
    for (const e of def.endOfZone.extraction) disc(e.x, e.y, e.radius, 0x4aa8ff, 0.08, 0.05);

    // Bâtiments visitables : sol coloré et toit qui disparaît quand on entre. Les murs viennent des obstacles de la sim.
    for (const b of def.buildings) {
      const t = wallThickness(b);
      const floor = new Mesh(new BoxGeometry(b.w - 2 * t, 0.04, b.h - 2 * t), new MeshStandardMaterial({ color: new Color(b.floor ?? '#3a2f25'), roughness: 1 }));
      floor.position.set(b.x, 0.04, b.y);
      this.scene.add(floor);
      const material = new MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9, transparent: true, opacity: 1 });
      const roof = new Mesh(new BoxGeometry(b.w + 0.4, 0.25, b.h + 0.4), material);
      roof.position.set(b.x, wallHeight(b) + 0.12, b.y);
      this.scene.add(roof);
      this.roofs.push({ def: b, mesh: roof, material, opacity: 1 });
    }

    const crateGeometry = new BoxGeometry(0.9, 0.7, 0.9);
    for (const c of def.crates) {
      const color = c.tier === 'rare' ? 0xe0b030 : c.tier === 'militaire' ? 0x4a6b3a : 0x8a5a2b;
      const material = new MeshStandardMaterial({ color, roughness: 0.7, emissive: color, emissiveIntensity: 0.25 });
      const m = new Mesh(crateGeometry, material);
      m.position.set(c.x, 0.35, c.y);
      this.scene.add(m);
      this.crateMeshes.push({ mesh: m, material, color, ready: true });
    }
    for (const p of def.passages) {
      const m = new Mesh(new BoxGeometry(p.w, 0.06, p.h), new MeshBasicMaterial({ color: 0x66b3ff, transparent: true, opacity: 0.3, depthWrite: false }));
      m.position.set(p.x, 0.05, p.y);
      this.scene.add(m);
    }

    // Limites de la carte : quatre murs sombres.
    const half = def.size / 2;
    const wallMaterial = new MeshStandardMaterial({ color: 0x050607, roughness: 1 });
    for (const [x, z, w, d] of [[0, -half - 1, def.size + 4, 2], [0, half + 1, def.size + 4, 2], [-half - 1, 0, 2, def.size], [half + 1, 0, 2, def.size]] as const) {
      const m = new Mesh(new BoxGeometry(w, 8, d), wallMaterial);
      m.position.set(x, 4, z);
      this.scene.add(m);
    }
  }

  /** Les toits deviennent transparents quand le joueur est à l'intérieur du bâtiment. */
  updateRoofs(x: number, y: number, dtSeconds: number): void {
    const k = 1 - Math.exp(-9 * dtSeconds);
    for (const r of this.roofs) {
      const target = insideBuilding(r.def, x, y) ? 0 : 1;
      r.opacity += (target - r.opacity) * k;
      r.material.opacity = r.opacity;
      r.mesh.visible = r.opacity > 0.03;
    }
  }

  /** Caisses vidées : grises et affaissées jusqu'à leur remplissage. */
  updateCrates(ready: Uint8Array): void {
    this.crateMeshes.forEach((c, i) => {
      const isReady = ready[i] === 1;
      if (isReady === c.ready) return;
      c.ready = isReady;
      c.material.color.setHex(isReady ? c.color : 0x2a2a2a);
      c.material.emissive.setHex(isReady ? c.color : 0x000000);
      c.mesh.scale.y = isReady ? 1 : 0.55;
      c.mesh.position.y = isReady ? 0.35 : 0.19;
    });
  }

  /** Suivi amorti, indépendant de la fréquence d'affichage. */
  follow(x: number, y: number, dtSeconds: number): void {
    if (!this.focusReady) {
      this.focus.set(x, 0, y);
      this.focusReady = true;
    } else {
      const k = 1 - Math.exp(-CAMERA_DAMPING * dtSeconds);
      this.focus.x += (x - this.focus.x) * k;
      this.focus.z += (y - this.focus.z) * k;
    }
    const horizontal = Math.cos(CAMERA_PITCH) * CAMERA_DISTANCE;
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * horizontal,
      Math.sin(CAMERA_PITCH) * CAMERA_DISTANCE,
      this.focus.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();

    // Le sol suit la caméra par pas de motif pour paraître fixe.
    this.ground.position.x = Math.round(this.focus.x / (GROUND_TILE * 2)) * GROUND_TILE * 2;
    this.ground.position.z = Math.round(this.focus.z / (GROUND_TILE * 2)) * GROUND_TILE * 2;
  }

  /** Angle de visée (plan de la sim) depuis la souris, vers le point visé au sol. */
  aimAngle(ndcX: number, ndcY: number, fromX: number, fromY: number): number {
    scratchNear.set(ndcX, ndcY, 0.5).unproject(this.camera);
    scratchDir.copy(scratchNear).sub(this.camera.position);
    if (scratchDir.y >= -1e-6) return 0;
    const t = -this.camera.position.y / scratchDir.y;
    const wx = this.camera.position.x + scratchDir.x * t;
    const wz = this.camera.position.z + scratchDir.z * t;
    return Math.atan2(wz - fromY, wx - fromX);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

function makeGroundTexture(base = '#161b21'): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g === null) throw new Error('Canvas 2D indisponible');
  const half = size / 2;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 0, half, half);
  g.fillRect(half, half, half, half);
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, size - 2, size - 2);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(GROUND_SIZE / (GROUND_TILE * 2), GROUND_SIZE / (GROUND_TILE * 2));
  tex.anisotropy = 8;
  return tex;
}

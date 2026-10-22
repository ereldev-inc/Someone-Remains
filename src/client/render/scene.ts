import {
  AmbientLight,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
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

const scratchNear = new Vector3();
const scratchDir = new Vector3();

export class GameScene {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly ground: Mesh;
  private readonly focus = new Vector3();
  private focusReady = false;

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

  setObstacles(o: Obstacles): void {
    const boxes: number[] = [];
    const cyls: number[] = [];
    for (let i = 0; i < o.count; i++) (o.kind[i] === OBSTACLE_CIRCLE ? cyls : boxes).push(i);

    const dummy = new Object3D();
    const m = new Matrix4();
    const build = (indices: number[], geometry: BoxGeometry | CylinderGeometry, circle: boolean): void => {
      if (indices.length === 0) return;
      const mesh = new InstancedMesh(geometry, new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), indices.length);
      indices.forEach((src, k) => {
        const height = 2 + (src % 4) * 0.8;
        const a = o.a[src] as number;
        const b = o.b[src] as number;
        dummy.position.set(o.x[src] as number, height / 2, o.y[src] as number);
        dummy.scale.set(circle ? a : a * 2, height, circle ? a : b * 2);
        dummy.updateMatrix();
        mesh.setMatrixAt(k, m.copy(dummy.matrix));
        const shade = 0.035 + ((src * 37) % 10) * 0.004;
        mesh.setColorAt(k, new Color().setRGB(shade, shade * 1.1, shade * 1.25));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
    };
    build(boxes, new BoxGeometry(1, 1, 1), false);
    build(cyls, new CylinderGeometry(1, 1, 1, 20), true);
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
    this.camera.position.set(
      this.focus.x,
      Math.sin(CAMERA_PITCH) * CAMERA_DISTANCE,
      this.focus.z + Math.cos(CAMERA_PITCH) * CAMERA_DISTANCE,
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

function makeGroundTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g === null) throw new Error('Canvas 2D indisponible');
  const half = size / 2;
  g.fillStyle = '#161b21';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#12161b';
  g.fillRect(0, 0, half, half);
  g.fillRect(half, half, half, half);
  g.strokeStyle = '#222a33';
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

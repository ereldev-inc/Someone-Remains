import { drawMap } from '../mapviewer/mapDraw';
import type { Layer } from '../mapviewer/mapDraw';
import type { MapDef } from '../../sim/world/mapdef';
import { OUT_ENEMY_STRIDE } from '../render/interp';
import type { InterpState } from '../render/interp';

/** Résolution maximale du fond pré-rendu (px par mètre) et taille maximale de son côté (px). */
const MAX_PX_PER_M = 4;
const MAX_BACKGROUND_PX = 2048;
const LAYERS: ReadonlySet<Layer> = new Set<Layer>(['decor', 'obstacles', 'refuges', 'passages', 'extraction', 'crates']);
/** Largeur (m) de la zone visible en mode local. */
const LOCAL_SPAN_M = 110;
const SMALL_PX = 200;
const LARGE_PX = 560;

export type MinimapMode = 'small' | 'large' | 'off';

/**
 * Mini-carte : le fond de carte (même dessin que le visualiseur) est pré-rendu une fois ; chaque image
 * n'ajoute que le joueur et les ennemis en poursuite. Petite : zone locale autour du joueur.
 * Grande : carte entière. `M` fait défiler petite → grande → masquée.
 */
export class Minimap {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background = document.createElement('canvas');
  private mode: MinimapMode = 'small';
  /** Résolution du fond : 4 px/m sur les petites cartes, réduite pour les grandes. */
  private readonly pxPerM: number;

  constructor(private readonly def: MapDef) {
    this.pxPerM = Math.min(MAX_PX_PER_M, MAX_BACKGROUND_PX / def.size);
    const side = Math.ceil(def.size * this.pxPerM);
    this.background.width = side;
    this.background.height = side;
    const bg = this.background.getContext('2d');
    const ctx = this.canvas.getContext('2d');
    if (bg === null || ctx === null) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
    drawMap(bg, def, { cx: 0, cy: 0, scale: this.pxPerM, width: side, height: side }, LAYERS, false);
    this.canvas.id = 'minimap';
    document.body.appendChild(this.canvas);
    this.applyMode();
  }

  cycle(): void {
    this.mode = this.mode === 'small' ? 'large' : this.mode === 'large' ? 'off' : 'small';
    this.applyMode();
  }

  private applyMode(): void {
    const css = this.mode === 'large' ? LARGE_PX : SMALL_PX;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.style.display = this.mode === 'off' ? 'none' : 'block';
    this.canvas.classList.toggle('large', this.mode === 'large');
    this.canvas.style.width = `${css}px`;
    this.canvas.style.height = `${css}px`;
    this.canvas.width = Math.floor(css * dpr);
    this.canvas.height = Math.floor(css * dpr);
  }

  /** Dessine la mini-carte pour le joueur en (px, py) regardant vers `aim`. */
  draw(px: number, py: number, aim: number, state: InterpState, yaw = 0): void {
    if (this.mode === 'off') return;
    const g = this.ctx;
    const w = this.canvas.width;
    const large = this.mode === 'large';
    // Pixels de la mini-carte par mètre, et centre de la vue (m).
    const k = large ? w / this.def.size : w / LOCAL_SPAN_M;
    const cx = large ? 0 : px;
    const cy = large ? 0 : py;
    const toX = (x: number): number => w / 2 + (x - cx) * k;
    const toY = (y: number): number => w / 2 + (y - cy) * k;

    g.fillStyle = '#05070a';
    g.fillRect(0, 0, w, w);
    // Vue locale : la carte tourne avec la caméra (le haut de la mini-carte est le haut de l'écran).
    g.save();
    if (!large) {
      g.translate(w / 2, w / 2);
      g.rotate(yaw);
      g.translate(-w / 2, -w / 2);
    }
    const half = this.def.size / 2;
    g.drawImage(this.background, toX(-half), toY(-half), this.def.size * k, this.def.size * k);

    // Ennemis en poursuite : ceux qui vous traquent. Les ennemis au repos restent invisibles.
    g.fillStyle = '#ff4d4d';
    const r = Math.max(2, 0.9 * k);
    for (let s = 0; s < state.enemyHigh; s++) {
      const o = s * OUT_ENEMY_STRIDE;
      if ((state.enemies[o] as number) === 0 || (state.enemies[o + 5] as number) !== 1) continue;
      const ex = toX(state.enemies[o + 1] as number);
      const ey = toY(state.enemies[o + 2] as number);
      if (ex < 0 || ey < 0 || ex > w || ey > w) continue;
      g.beginPath();
      g.arc(ex, ey, r, 0, Math.PI * 2);
      g.fill();
    }

    // Joueur : point blanc et flèche dans le sens de la visée.
    const mx = toX(px);
    const my = toY(py);
    const a = large ? 7 : 6;
    const dpr = w / (large ? LARGE_PX : SMALL_PX);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(mx + Math.cos(aim) * a * dpr, my + Math.sin(aim) * a * dpr);
    g.lineTo(mx + Math.cos(aim + 2.5) * a * 0.8 * dpr, my + Math.sin(aim + 2.5) * a * 0.8 * dpr);
    g.lineTo(mx + Math.cos(aim - 2.5) * a * 0.8 * dpr, my + Math.sin(aim - 2.5) * a * 0.8 * dpr);
    g.closePath();
    g.fill();

    g.restore();

    // Le « N » indique où est le nord (haut de la carte quand la caméra n'est pas tournée).
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.font = `${11 * dpr}px system-ui`;
    const nx = large ? w / 2 : w / 2 + Math.sin(yaw) * w * 0.43;
    const ny = large ? 12 * dpr : w / 2 - Math.cos(yaw) * w * 0.43 + 4 * dpr;
    g.fillText('N', nx - 3 * dpr, ny);
  }
}

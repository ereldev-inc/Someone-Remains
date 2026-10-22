import type { MapDef, ObstacleStyle } from '../../sim/world/mapdef';

export const STYLE_COLORS: Readonly<Record<ObstacleStyle, string>> = {
  building: '#8b7d6b',
  tree: '#2e7d32',
  rock: '#8d9399',
  fence: '#a1743a',
  vehicle: '#b5453a',
  wall: '#9aa0a6',
};

export const LAYERS = [
  ['decor', 'Décor (routes, champs, eau)'],
  ['obstacles', 'Obstacles'],
  ['zones', 'Zones de difficulté'],
  ['groups', 'Groupes de zombies'],
  ['activation', 'Rayons d\'activation'],
  ['crates', 'Caisses de butin'],
  ['refuges', 'Refuges et départ'],
  ['passages', 'Passages'],
  ['extraction', 'Extractions'],
  ['grid', 'Grille'],
] as const;
export type Layer = (typeof LAYERS)[number][0];


/** Vue : centre (m), échelle (px par m) et taille de la surface de dessin (px). */
export interface View {
  cx: number;
  cy: number;
  scale: number;
  width: number;
  height: number;
}

/** Dessine les calques demandés d'une carte. `labels` : textes (noms de groupes, refuges…). */
export function drawMap(g: CanvasRenderingContext2D, def: MapDef, view: View, visible: ReadonlySet<Layer>, labels = true): void {
  const half = def.size / 2;
  const sx = (x: number): number => view.width / 2 + (x - view.cx) * view.scale;
  const sy = (y: number): number => view.height / 2 + (y - view.cy) * view.scale;
  g.clearRect(0, 0, view.width, view.height);
  g.fillStyle = def.palette.ground;
  g.fillRect(sx(-half), sy(-half), def.size * view.scale, def.size * view.scale);
  g.strokeStyle = '#3a444d';
  g.lineWidth = 2;
  g.strokeRect(sx(-half), sy(-half), def.size * view.scale, def.size * view.scale);

  if (visible.has('decor')) {
    for (const d of def.decor) {
      g.fillStyle = d.kind === 'road' ? '#5a5346' : d.kind === 'water' ? '#1d3f6b' : '#3b5a2a';
      g.fillRect(sx(d.x - d.w / 2), sy(d.y - d.h / 2), d.w * view.scale, d.h * view.scale);
    }
  }
  if (visible.has('zones')) {
    for (const z of def.zones) {
      g.fillStyle = 'rgba(255,140,0,0.18)';
      g.strokeStyle = 'rgba(255,140,0,0.8)';
      g.lineWidth = 1.5;
      g.beginPath();
      if (z.shape.kind === 'circle') g.arc(sx(z.shape.x), sy(z.shape.y), z.shape.r * view.scale, 0, Math.PI * 2);
      else g.rect(sx(z.shape.x - z.shape.w / 2), sy(z.shape.y - z.shape.h / 2), z.shape.w * view.scale, z.shape.h * view.scale);
      g.fill();
      g.stroke();
      g.fillStyle = '#ffb347';
      g.font = '12px system-ui';
      if (labels) g.fillText(`${z.id} ×${z.hpMult} PV, ×${z.damageMult} dégâts`, sx(z.shape.x) - 40, sy(z.shape.y));
    }
  }
  if (visible.has('obstacles')) {
    for (const o of def.obstacles) {
      g.fillStyle = STYLE_COLORS[o.style];
      if (o.kind === 'circle') {
        g.beginPath();
        g.arc(sx(o.x), sy(o.y), Math.max(1.5, o.r * view.scale), 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(sx(o.x - o.w / 2), sy(o.y - o.h / 2), Math.max(1.5, o.w * view.scale), Math.max(1.5, o.h * view.scale));
    }
  }
  if (visible.has('grid')) {
    const step = view.scale > 3 ? 10 : 50;
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    g.font = '10px ui-monospace,monospace';
    for (let v = -half; v <= half; v += step) {
      g.beginPath();
      g.moveTo(sx(v), sy(-half));
      g.lineTo(sx(v), sy(half));
      g.moveTo(sx(-half), sy(v));
      g.lineTo(sx(half), sy(v));
      g.stroke();
      if (v % 50 === 0) {
        if (labels) g.fillText(String(v), sx(v) + 2, sy(-half) + 11);
        if (labels) g.fillText(String(v), sx(-half) + 2, sy(v) - 2);
      }
    }
  }
  if (visible.has('refuges')) {
    for (const r of def.refuges) {
      g.fillStyle = 'rgba(61,220,132,0.2)';
      g.strokeStyle = '#3ddc84';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(sx(r.x), sy(r.y), r.radius * view.scale, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#3ddc84';
      g.font = '12px system-ui';
      if (labels) g.fillText(r.name, sx(r.x) - 30, sy(r.y) - r.radius * view.scale - 5);
    }
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(sx(def.playerStart.x), sy(def.playerStart.y), 4, 0, Math.PI * 2);
    g.fill();
  }
  if (visible.has('groups') || visible.has('activation')) {
    for (const gr of def.groups) {
      const n = gr.members.reduce((s, m) => s + m.count, 0);
      if (visible.has('activation')) {
        g.setLineDash([5, 5]);
        g.strokeStyle = 'rgba(122,184,255,0.55)';
        g.lineWidth = 1;
        g.beginPath();
        g.arc(sx(gr.x), sy(gr.y), gr.activation * view.scale, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
      if (visible.has('groups')) {
        g.fillStyle = 'rgba(229,72,77,0.22)';
        g.strokeStyle = '#e5484d';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(sx(gr.x), sy(gr.y), Math.max(4, gr.radius * view.scale), 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = '#ffb4b6';
        g.font = '11px system-ui';
        if (labels) g.fillText(`${gr.id} ×${n}`, sx(gr.x) + 6, sy(gr.y) - 4);
      }
    }
  }
  if (visible.has('crates')) {
    for (const c of def.crates) {
      g.fillStyle = c.tier === 'rare' ? '#e0b030' : c.tier === 'militaire' ? '#6b8f4e' : '#c58a4a';
      g.fillRect(sx(c.x) - 4, sy(c.y) - 4, 8, 8);
    }
  }
  if (visible.has('passages')) {
    for (const p of def.passages) {
      g.fillStyle = 'rgba(102,179,255,0.35)';
      g.strokeStyle = '#66b3ff';
      g.fillRect(sx(p.x - p.w / 2), sy(p.y - p.h / 2), p.w * view.scale, p.h * view.scale);
      g.strokeRect(sx(p.x - p.w / 2), sy(p.y - p.h / 2), p.w * view.scale, p.h * view.scale);
      g.fillStyle = '#66b3ff';
      g.font = '11px system-ui';
      if (labels) g.fillText(`${p.id} → ${p.to ?? 'à venir'}`, sx(p.x) - 30, sy(p.y) + p.h * view.scale + 12);
    }
  }
  if (visible.has('extraction')) {
    for (const e of def.endOfZone.extraction) {
      g.strokeStyle = '#4aa8ff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(sx(e.x), sy(e.y), Math.max(5, e.radius * view.scale), 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#4aa8ff';
      g.font = '11px system-ui';
      if (labels) g.fillText('extraction', sx(e.x) - 25, sy(e.y) - e.radius * view.scale - 4);
    }
  }
}

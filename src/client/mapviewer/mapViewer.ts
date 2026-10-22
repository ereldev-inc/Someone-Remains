import { validateMap } from '../../sim/world/validateMap';
import type { MapDef, ObstacleStyle } from '../../sim/world/mapdef';

const STYLE_COLORS: Readonly<Record<ObstacleStyle, string>> = {
  building: '#8b7d6b',
  tree: '#2e7d32',
  rock: '#8d9399',
  fence: '#a1743a',
  vehicle: '#b5453a',
  wall: '#9aa0a6',
};

const LAYERS = [
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
type Layer = (typeof LAYERS)[number][0];

/** Visualiseur de carte : vue de dessus de la carte entière, calques, zoom, coordonnées en mètres. */
export function startMapViewer(root: HTMLElement, def: MapDef, ids: readonly string[]): void {
  document.title = `Carte : ${def.name}`;
  root.innerHTML = '';
  root.style.cssText = 'position:fixed;inset:0;background:#0b0d10;color:#cfd8dc;font:13px system-ui,sans-serif;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;cursor:grab;';
  root.appendChild(canvas);

  const panel = document.createElement('div');
  panel.style.cssText = 'position:absolute;top:10px;right:10px;width:270px;max-height:calc(100% - 20px);overflow:auto;background:rgba(15,18,22,.92);border:1px solid #2a323a;border-radius:8px;padding:12px;line-height:1.5;';
  root.appendChild(panel);

  const { errors, stats } = validateMap(def);
  const visible = new Set<Layer>(LAYERS.map(([k]) => k));
  const types = Object.entries(stats.perType).map(([t, n]) => `${n} ${t}`).join(', ');
  panel.innerHTML = `
    <div style="font-size:16px;font-weight:600">${def.name}</div>
    <div style="color:#8fa3ad">${def.id} · niveau ${def.level} · ${def.size} × ${def.size} m · profil ${def.difficulty}</div>
    <div style="margin:8px 0;color:#8fa3ad">${stats.enemies} zombies (${types}) · ${stats.densityPerHectare.toFixed(2)}/ha<br>
    ${stats.obstacles} obstacles · ${stats.groups} groupes · ${stats.crates} caisses · ${(stats.reachableRatio * 100).toFixed(0)} % du sol accessible</div>
    <div style="color:${errors.length > 0 ? '#ff7b7b' : '#6fd08c'}">${errors.length > 0 ? errors.map((e) => `• ${e}`).join('<br>') : 'Validation : aucune erreur'}</div>
    <div style="margin:10px 0 4px;color:#8fa3ad">Calques</div>
    <div id="layers"></div>
    <div id="coords" style="margin-top:10px;font-family:ui-monospace,monospace;color:#ffd166">x —, y —</div>
    <div style="margin-top:10px;color:#8fa3ad">Autres cartes : ${ids.map((id) => `<a style="color:#7ab8ff" href="?map=${id}">${id}</a>`).join(' · ')}<br><a style="color:#7ab8ff" href="./">Jouer</a></div>
    <div style="margin-top:8px;color:#5b6770">Glisser : déplacer · molette : zoom</div>`;
  const layersEl = panel.querySelector('#layers') as HTMLElement;
  for (const [key, label] of LAYERS) {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;cursor:pointer';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    box.addEventListener('change', () => {
      if (box.checked) visible.add(key);
      else visible.delete(key);
      draw();
    });
    row.append(box, ` ${label}`);
    layersEl.appendChild(row);
  }
  const coords = panel.querySelector('#coords') as HTMLElement;

  // Vue : échelle (px par m) et centre (m).
  let scale = 1;
  let cx = 0;
  let cy = 0;
  const half = def.size / 2;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D indisponible');

  function fit(): void {
    scale = Math.min(canvas.clientWidth, canvas.clientHeight) / (def.size * 1.08);
    cx = 0;
    cy = 0;
  }
  const toScreenX = (x: number): number => canvas.width / 2 + (x - cx) * scale;
  const toScreenY = (y: number): number => canvas.height / 2 + (y - cy) * scale;

  function draw(): void {
    const g = ctx as CanvasRenderingContext2D;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = def.palette.ground;
    g.fillRect(toScreenX(-half), toScreenY(-half), def.size * scale, def.size * scale);
    g.strokeStyle = '#3a444d';
    g.lineWidth = 2;
    g.strokeRect(toScreenX(-half), toScreenY(-half), def.size * scale, def.size * scale);

    if (visible.has('decor')) {
      for (const d of def.decor) {
        g.fillStyle = d.kind === 'road' ? '#5a5346' : d.kind === 'water' ? '#1d3f6b' : '#3b5a2a';
        g.fillRect(toScreenX(d.x - d.w / 2), toScreenY(d.y - d.h / 2), d.w * scale, d.h * scale);
      }
    }
    if (visible.has('zones')) {
      for (const z of def.zones) {
        g.fillStyle = 'rgba(255,140,0,0.18)';
        g.strokeStyle = 'rgba(255,140,0,0.8)';
        g.lineWidth = 1.5;
        g.beginPath();
        if (z.shape.kind === 'circle') g.arc(toScreenX(z.shape.x), toScreenY(z.shape.y), z.shape.r * scale, 0, Math.PI * 2);
        else g.rect(toScreenX(z.shape.x - z.shape.w / 2), toScreenY(z.shape.y - z.shape.h / 2), z.shape.w * scale, z.shape.h * scale);
        g.fill();
        g.stroke();
        g.fillStyle = '#ffb347';
        g.font = '12px system-ui';
        g.fillText(`${z.id} ×${z.hpMult} PV, ×${z.damageMult} dégâts`, toScreenX(z.shape.x) - 40, toScreenY(z.shape.y));
      }
    }
    if (visible.has('obstacles')) {
      for (const o of def.obstacles) {
        g.fillStyle = STYLE_COLORS[o.style];
        if (o.kind === 'circle') {
          g.beginPath();
          g.arc(toScreenX(o.x), toScreenY(o.y), Math.max(1.5, o.r * scale), 0, Math.PI * 2);
          g.fill();
        } else g.fillRect(toScreenX(o.x - o.w / 2), toScreenY(o.y - o.h / 2), Math.max(1.5, o.w * scale), Math.max(1.5, o.h * scale));
      }
    }
    if (visible.has('grid')) {
      const step = scale > 3 ? 10 : 50;
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1;
      g.font = '10px ui-monospace,monospace';
      for (let v = -half; v <= half; v += step) {
        g.beginPath();
        g.moveTo(toScreenX(v), toScreenY(-half));
        g.lineTo(toScreenX(v), toScreenY(half));
        g.moveTo(toScreenX(-half), toScreenY(v));
        g.lineTo(toScreenX(half), toScreenY(v));
        g.stroke();
        if (v % 50 === 0) {
          g.fillText(String(v), toScreenX(v) + 2, toScreenY(-half) + 11);
          g.fillText(String(v), toScreenX(-half) + 2, toScreenY(v) - 2);
        }
      }
    }
    if (visible.has('refuges')) {
      for (const r of def.refuges) {
        g.fillStyle = 'rgba(61,220,132,0.2)';
        g.strokeStyle = '#3ddc84';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(toScreenX(r.x), toScreenY(r.y), r.radius * scale, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = '#3ddc84';
        g.font = '12px system-ui';
        g.fillText(r.name, toScreenX(r.x) - 30, toScreenY(r.y) - r.radius * scale - 5);
      }
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(toScreenX(def.playerStart.x), toScreenY(def.playerStart.y), 4, 0, Math.PI * 2);
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
          g.arc(toScreenX(gr.x), toScreenY(gr.y), gr.activation * scale, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
        }
        if (visible.has('groups')) {
          g.fillStyle = 'rgba(229,72,77,0.22)';
          g.strokeStyle = '#e5484d';
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(toScreenX(gr.x), toScreenY(gr.y), Math.max(4, gr.radius * scale), 0, Math.PI * 2);
          g.fill();
          g.stroke();
          g.fillStyle = '#ffb4b6';
          g.font = '11px system-ui';
          g.fillText(`${gr.id} ×${n}`, toScreenX(gr.x) + 6, toScreenY(gr.y) - 4);
        }
      }
    }
    if (visible.has('crates')) {
      for (const c of def.crates) {
        g.fillStyle = c.tier === 'rare' ? '#e0b030' : c.tier === 'militaire' ? '#6b8f4e' : '#c58a4a';
        g.fillRect(toScreenX(c.x) - 4, toScreenY(c.y) - 4, 8, 8);
      }
    }
    if (visible.has('passages')) {
      for (const p of def.passages) {
        g.fillStyle = 'rgba(102,179,255,0.35)';
        g.strokeStyle = '#66b3ff';
        g.fillRect(toScreenX(p.x - p.w / 2), toScreenY(p.y - p.h / 2), p.w * scale, p.h * scale);
        g.strokeRect(toScreenX(p.x - p.w / 2), toScreenY(p.y - p.h / 2), p.w * scale, p.h * scale);
        g.fillStyle = '#66b3ff';
        g.font = '11px system-ui';
        g.fillText(`${p.id} → ${p.to ?? 'à venir'}`, toScreenX(p.x) - 30, toScreenY(p.y) + p.h * scale + 12);
      }
    }
    if (visible.has('extraction')) {
      for (const e of def.endOfZone.extraction) {
        g.strokeStyle = '#4aa8ff';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(toScreenX(e.x), toScreenY(e.y), Math.max(5, e.radius * scale), 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = '#4aa8ff';
        g.font = '11px system-ui';
        g.fillText('extraction', toScreenX(e.x) - 25, toScreenY(e.y) - e.radius * scale - 4);
      }
    }
  }

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    draw();
  }
  window.addEventListener('resize', () => {
    resize();
  });
  resize();
  fit();
  draw();

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
    canvas.style.cursor = 'grab';
  });
  canvas.addEventListener('pointermove', (e) => {
    const dpr = canvas.width / canvas.clientWidth;
    if (dragging) {
      cx -= ((e.clientX - lastX) * dpr) / scale;
      cy -= ((e.clientY - lastY) * dpr) / scale;
      lastX = e.clientX;
      lastY = e.clientY;
      draw();
    }
    const mx = cx + (e.clientX * dpr - canvas.width / 2) / scale;
    const my = cy + (e.clientY * dpr - canvas.height / 2) / scale;
    coords.textContent = `x ${mx.toFixed(1)}, y ${my.toFixed(1)}`;
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const dpr = canvas.width / canvas.clientWidth;
      const mx = cx + (e.clientX * dpr - canvas.width / 2) / scale;
      const my = cy + (e.clientY * dpr - canvas.height / 2) / scale;
      scale *= e.deltaY < 0 ? 1.15 : 1 / 1.15;
      scale = Math.max(0.3, Math.min(40, scale));
      cx = mx - (e.clientX * dpr - canvas.width / 2) / scale;
      cy = my - (e.clientY * dpr - canvas.height / 2) / scale;
      draw();
    },
    { passive: false },
  );
}

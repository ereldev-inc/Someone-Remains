import { validateMap } from '../../sim/world/validateMap';
import type { MapDef } from '../../sim/world/mapdef';
import { drawMap, LAYERS } from './mapDraw';
import type { Layer } from './mapDraw';

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
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D indisponible');

  function fit(): void {
    scale = Math.min(canvas.clientWidth, canvas.clientHeight) / (def.size * 1.08);
    cx = 0;
    cy = 0;
  }

  function draw(): void {
    (ctx as CanvasRenderingContext2D).clearRect(0, 0, canvas.width, canvas.height);
    drawMap(ctx as CanvasRenderingContext2D, def, { cx, cy, scale, width: canvas.width, height: canvas.height }, visible);
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

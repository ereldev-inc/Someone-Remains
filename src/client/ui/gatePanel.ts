import { MAPS } from '../../sim/data/maps';
import type { Command } from '../../sim/types';
import type { GateDef } from '../../sim/world/mapdef';

function formatDuration(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

/** Porte du bunker : liste des cartes d'expédition proposées ; choisir une carte lance l'expédition. */
export class GatePanel {
  private readonly root: HTMLElement;
  private shownFor: GateDef | null = null;
  visible = false;

  constructor(private readonly send: (cmd: Command) => void) {
    const root = document.getElementById('gate');
    if (root === null) throw new Error('#gate introuvable');
    this.root = root;
  }

  open(gate: GateDef): void {
    this.visible = true;
    this.shownFor = null;
    this.render(gate);
    this.root.style.display = 'block';
  }

  close(): void {
    this.visible = false;
    this.root.style.display = 'none';
  }

  private render(gate: GateDef): void {
    if (this.shownFor === gate) return;
    this.shownFor = gate;
    this.root.innerHTML = '<h3>SORTIR DU BUNKER</h3><div class="sub">Choisissez une zone. Votre sac vous accompagne ; rentrez par la sortie du bunker pour le conserver. Échap pour rester.</div>';
    const list = document.createElement('div');
    list.className = 'maps';
    for (const id of gate.maps) {
      const def = MAPS[id];
      if (def === undefined) continue;
      const enemies = def.groups.reduce((n, g) => n + g.members.reduce((m, x) => m + x.count, 0), 0);
      const density = enemies / ((def.size * def.size) / 10000);
      const btn = document.createElement('button');
      btn.className = 'mapcard';
      btn.innerHTML =
        `<b>Niveau ${def.level} · ${def.name}</b>` +
        `<span>${def.size} m × ${def.size} m · ${enemies} zombies (${density.toFixed(1)}/ha) · fermeture après ${formatDuration(def.endOfZone.countdownSeconds)}</span>` +
        `<small>Instance : 1 joueur</small>`;
      btn.addEventListener('click', () => {
        this.send({ t: 'depart', map: id });
        this.close();
      });
      list.appendChild(btn);
    }
    this.root.appendChild(list);
  }
}

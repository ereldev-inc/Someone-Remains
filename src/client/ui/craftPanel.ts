import { BAG_SLOTS, ITEMS, PLAN_ITEMS, STASH_SLOTS } from '../../sim/data/items';
import { MELEE_WEAPONS } from '../../sim/data/melee';
import { RECIPES } from '../../sim/data/recipes';
import { WEAPONS, WEAPON_SLOTS } from '../../sim/data/weapons';
import { LOADOUT_ACTIVE, LOADOUT_MELEE, LOADOUT_MELEE_OWNED, LOADOUT_OWNED, LOADOUT_PLANS, LOADOUT_SLOT0, LOADOUT_STRIDE } from '../../sim/snapshot';
import type { Command } from '../../sim/types';

/** Données du joueur local, lues dans l'état interpolé (offsets = début de ses tableaux). */
export interface CraftData {
  bag: Int32Array;
  bagOffset: number;
  stash: Int32Array;
  stashOffset: number;
  loadout: Int32Array;
  loadoutOffset: number;
  nearWorkbench: boolean;
  nearStash: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

/**
 * Panneau « Établi et stockage » : déposer et retirer des piles, apprendre des plans, fabriquer,
 * équiper les armes. Il n'agit que par des commandes (la sim valide : portée, matériaux, plan).
 */
export class CraftPanel {
  private readonly root = document.getElementById('craft') as HTMLElement;
  private key = '';
  visible = false;

  constructor(private readonly send: (cmd: Command) => void) {
    if (this.root === null) throw new Error('#craft introuvable');
  }

  toggle(): void {
    this.visible ? this.close() : this.open();
  }

  open(): void {
    this.visible = true;
    this.key = '';
    this.root.style.display = 'block';
  }

  close(): void {
    this.visible = false;
    this.root.style.display = 'none';
  }

  update(d: CraftData): void {
    if (!this.visible) return;
    let key = `${d.nearWorkbench}|${d.nearStash}|`;
    for (let s = 0; s < BAG_SLOTS * 2; s++) key += `${d.bag[d.bagOffset + s]},`;
    for (let s = 0; s < STASH_SLOTS * 2; s++) key += `${d.stash[d.stashOffset + s]},`;
    for (let s = 0; s < LOADOUT_STRIDE; s++) key += `${d.loadout[d.loadoutOffset + s]},`;
    if (key === this.key) return;
    this.key = key;
    this.render(d);
  }

  private count(d: CraftData, item: number): number {
    let n = 0;
    for (let s = 0; s < BAG_SLOTS; s++) if (d.bag[d.bagOffset + s * 2] === item + 1) n += d.bag[d.bagOffset + s * 2 + 1] as number;
    for (let s = 0; s < STASH_SLOTS; s++) if (d.stash[d.stashOffset + s * 2] === item + 1) n += d.stash[d.stashOffset + s * 2 + 1] as number;
    return n;
  }

  private grid(data: Int32Array, offset: number, slots: number, columns: number, enabled: boolean, onClick: (item: number, qty: number) => void): HTMLElement {
    const g = el('div', 'cgrid');
    g.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    for (let s = 0; s < slots; s++) {
      const item = (data[offset + s * 2] as number) - 1;
      const qty = data[offset + s * 2 + 1] as number;
      const def = ITEMS[item];
      const cell = el('button', 'cslot');
      if (def === undefined) {
        cell.classList.add('empty');
        cell.disabled = true;
        cell.textContent = '·';
      } else {
        cell.style.borderColor = def.color;
        cell.innerHTML = `<b>${qty}</b><span>${def.name}</span>`;
        cell.disabled = !enabled;
        cell.addEventListener('click', () => onClick(item, qty));
      }
      g.appendChild(cell);
    }
    return g;
  }

  private render(d: CraftData): void {
    const root = this.root;
    root.innerHTML = '';
    const head = el('div', 'chead');
    head.append(el('h3', '', 'ÉTABLI ET STOCKAGE'), el('span', 'chint', 'F ou Échap : fermer'));
    root.appendChild(head);
    const cols = el('div', 'ccols');
    const left = el('div', 'ccol');
    const right = el('div', 'ccol');
    cols.append(left, right);
    root.appendChild(cols);

    // Sac et stockage : un clic déplace la pile entière.
    left.appendChild(el('h4', '', d.nearStash ? 'Sac · cliquer pour déposer' : 'Sac · approchez-vous du stockage pour déposer'));
    left.appendChild(this.grid(d.bag, d.bagOffset, BAG_SLOTS, 4, d.nearStash, (item, qty) => this.send({ t: 'stash', dir: 'in', item, count: qty })));
    left.appendChild(el('h4', '', d.nearStash ? 'Stockage · cliquer pour retirer' : 'Stockage (persistant, conservé à la mort)'));
    left.appendChild(this.grid(d.stash, d.stashOffset, STASH_SLOTS, 5, d.nearStash, (item, qty) => this.send({ t: 'stash', dir: 'out', item, count: qty })));

    // Équipement.
    const owned = d.loadout[d.loadoutOffset + LOADOUT_OWNED] as number;
    const meleeOwned = d.loadout[d.loadoutOffset + LOADOUT_MELEE_OWNED] as number;
    const plans = d.loadout[d.loadoutOffset + LOADOUT_PLANS] as number;
    const active = d.loadout[d.loadoutOffset + LOADOUT_ACTIVE] as number;
    right.appendChild(el('h4', '', 'Armes à distance (touches 1, 2, 3)'));
    for (let s = 0; s < WEAPON_SLOTS; s++) {
      const w = d.loadout[d.loadoutOffset + LOADOUT_SLOT0 + s] as number;
      right.appendChild(el('div', `cline${s === active ? ' on' : ''}`, `${s + 1} · ${WEAPONS[w]?.name ?? '—'}`));
    }
    const owner = el('div', 'cbtns');
    WEAPONS.forEach((w, id) => {
      if ((owned & (1 << id)) === 0) return;
      for (let s = 0; s < WEAPON_SLOTS; s++) {
        const b = el('button', 'cbtn', `${w.name} → ${s + 1}`);
        b.disabled = !d.nearWorkbench;
        b.addEventListener('click', () => this.send({ t: 'equip', slot: s, weapon: id }));
        owner.appendChild(b);
      }
    });
    right.appendChild(owner);

    right.appendChild(el('h4', '', `Corps à corps (clic droit) · équipé : ${MELEE_WEAPONS[d.loadout[d.loadoutOffset + LOADOUT_MELEE] as number]?.name ?? '—'}`));
    const melee = el('div', 'cbtns');
    MELEE_WEAPONS.forEach((w, id) => {
      if ((meleeOwned & (1 << id)) === 0) return;
      const b = el('button', 'cbtn', w.name);
      b.disabled = !d.nearWorkbench;
      b.addEventListener('click', () => this.send({ t: 'equipMelee', weapon: id }));
      melee.appendChild(b);
    });
    right.appendChild(melee);

    // Plans à apprendre (dans le sac ou le stockage).
    const learnable = PLAN_ITEMS.filter((item, bit) => (plans & (1 << bit)) === 0 && this.count(d, item) > 0);
    if (learnable.length > 0) {
      right.appendChild(el('h4', '', 'Plans à apprendre'));
      const box = el('div', 'cbtns');
      for (const item of learnable) {
        const b = el('button', 'cbtn', `Apprendre : ${ITEMS[item]?.name.replace('Plan : ', '') ?? ''}`);
        b.disabled = !d.nearWorkbench;
        b.addEventListener('click', () => this.send({ t: 'learn', item }));
        box.appendChild(b);
      }
      right.appendChild(box);
    }

    // Recettes.
    right.appendChild(el('h4', '', d.nearWorkbench ? 'Fabrication (matériaux du sac et du stockage)' : 'Fabrication · approchez-vous de l\'établi'));
    RECIPES.forEach((r, index) => {
      const known = r.plan < 0 || (plans & (1 << r.plan)) !== 0;
      const alreadyOwned =
        (r.output.kind === 'weapon' && (owned & (1 << r.output.weapon)) !== 0) || (r.output.kind === 'melee' && (meleeOwned & (1 << r.output.weapon)) !== 0);
      const line = el('div', `crecipe${known ? '' : ' locked'}`);
      const inputs = r.inputs
        .map(([item, need]) => {
          const have = this.count(d, item);
          return `<span class="${have >= need ? 'ok' : 'ko'}">${need} ${ITEMS[item]?.name ?? ''}</span>`;
        })
        .join(' · ');
      const info = el('div', 'cinfo');
      info.innerHTML = `<b>${r.name}</b>${known ? '' : ' <i>(plan requis)</i>'}<br><small>${inputs}</small>`;
      const b = el('button', 'cbtn', alreadyOwned ? 'Possédée' : 'Fabriquer');
      b.disabled = !d.nearWorkbench || !known || alreadyOwned || !r.inputs.every(([item, need]) => this.count(d, item) >= need);
      b.addEventListener('click', () => this.send({ t: 'craft', recipe: index }));
      line.append(info, b);
      right.appendChild(line);
    });
  }
}

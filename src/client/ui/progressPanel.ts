import { CHOICES, HERITAGE, heritageCost, UPGRADES, xpToNext } from '../../sim/data/progression';
import {
  PROG_BEST_SECONDS,
  PROG_DEATHS,
  PROG_HERITAGE0,
  PROG_LEVEL,
  PROG_LIFE0,
  PROG_REMANENCE,
  PROG_TOTAL_KILLS,
  PROG_UCHOICE0,
  PROG_XP,
  PROGRESS_STRIDE,
} from '../../sim/snapshot';
import type { Command } from '../../sim/types';

function el(tag: string, className = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

function required(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (e === null) throw new Error(`#${id} introuvable`);
  return e;
}

/** Dernière mort du joueur, pour l'écran de mort. */
export interface LastDeath {
  kills: number;
  seconds: number;
}

/**
 * Niveau et XP, choix de bonus de niveau de vie, écran de mort avec choix de l'héritage, et récapitulatif.
 * Les choix se font par commande (1/2/3 ou clic) ; la sim valide.
 */
export class ProgressPanel {
  private readonly levelup = required('levelup');
  private readonly xpFill = required('xpFill');
  private readonly levelText = required('levelText');
  private readonly deathStats = required('deathStats');
  private readonly heritage = required('heritage');
  private readonly bagStats = required('bagStats');
  private key = '';
  private deathKey = '';
  private statsKey = '';
  /** Propositions de bonus de vie affichées (pour les touches 1/2/3). */
  upgradeVisible = false;
  treeOpen = false;
  private readonly tree = required('tree');
  private treeKey = '';

  constructor(private readonly send: (cmd: Command) => void) {}

  /** Ouvre ou ferme l'arbre d'héritage (fermé de force hors refuge et hors écran de mort). */
  toggleTree(): void {
    this.treeOpen = !this.treeOpen;
    this.treeKey = '';
  }

  closeTree(): void {
    this.treeOpen = false;
    this.treeKey = '';
    this.tree.style.display = 'none';
  }

  private updateTree(progress: Int32Array, offset: number, dead: boolean, safe: boolean): void {
    if (!dead && !safe) this.treeOpen = false;
    const p = (k: number): number => progress[offset + k] as number;
    const ranks = HERITAGE.map((_, k) => p(PROG_HERITAGE0 + k));
    const balance = p(PROG_REMANENCE);
    const key = `${this.treeOpen}|${balance}|${ranks.join(',')}`;
    if (key === this.treeKey) return;
    this.treeKey = key;
    this.tree.style.display = this.treeOpen ? 'block' : 'none';
    this.tree.innerHTML = '';
    if (!this.treeOpen) return;
    this.tree.appendChild(el('h3', '', 'ARBRE D\'HÉRITAGE'));
    this.tree.appendChild(el('div', 'sub', `Rémanence : <b>${balance}</b> · bonus permanents, conservés après la mort · P ou Échap pour fermer`));
    const cols = el('div', 'cols');
    const branches = [...new Set(HERITAGE.map((h) => h.branch))];
    for (const branch of branches) {
      const col = el('div', 'col');
      col.appendChild(el('h4', '', branch.toUpperCase()));
      HERITAGE.forEach((h, node) => {
        if (h.branch !== branch) return;
        const rank = ranks[node] as number;
        const maxed = rank >= h.max;
        const parent = h.requires >= 0 ? HERITAGE[h.requires] : undefined;
        const unlocked = parent === undefined || (ranks[h.requires] as number) >= h.requiresRank;
        const cost = heritageCost(h, rank);
        const can = !maxed && unlocked && balance >= cost;
        const state = maxed ? 'maxed' : !unlocked ? 'locked' : can ? 'can' : '';
        const foot = maxed ? 'maximum' : !unlocked ? `exige ${parent?.name} ${h.requiresRank}` : `coût ${cost}`;
        const btn = el('button', `node ${state}${parent !== undefined && parent.branch === branch ? ' child' : ''}`, `<b>${h.name}</b><span>${h.description}</span><small>rang ${rank} / ${h.max} · ${foot}</small>`);
        btn.addEventListener('click', () => {
          if (can) this.send({ t: 'buyHeritage', node });
        });
        col.appendChild(btn);
      });
      cols.appendChild(col);
    }
    this.tree.appendChild(cols);
  }

  update(progress: Int32Array, offset: number, dead: boolean, lastDeath: LastDeath | null, safe = false): void {
    const p = (k: number): number => progress[offset + k] as number;
    const level = p(PROG_LEVEL);
    const xp = p(PROG_XP);
    const need = xpToNext(level);
    this.xpFill.style.width = `${Math.min(1, xp / need) * 100}%`;
    this.levelText.textContent = `Niv ${level}`;

    const uChoices: number[] = [];
    for (let c = 0; c < CHOICES; c++) {
      uChoices.push(p(PROG_UCHOICE0 + c));
    }
    const lifeRanks = UPGRADES.map((_, k) => p(PROG_LIFE0 + k));
    const heritageRanks = HERITAGE.map((_, k) => p(PROG_HERITAGE0 + k));

    // Propositions de niveau de vie (jeu en cours).
    this.upgradeVisible = !dead && uChoices[0] !== -1;
    const upKey = `${this.upgradeVisible}|${level}|${uChoices.join(',')}|${lifeRanks.join(',')}`;
    if (upKey !== this.key) {
      this.key = upKey;
      this.levelup.innerHTML = '';
      this.levelup.style.display = this.upgradeVisible ? 'block' : 'none';
      if (this.upgradeVisible) {
        this.levelup.appendChild(el('div', 'ptitle', `NIVEAU ${level} — choisissez un bonus <span>(touches 1 · 2 · 3)</span>`));
        const row = el('div', 'cards');
        uChoices.forEach((u, index) => {
          const def = UPGRADES[u];
          if (def === undefined) return;
          const card = el('button', 'card', `<b>${index + 1} · ${def.name}</b><span>${def.description}</span><small>rang ${lifeRanks[u]} → ${(lifeRanks[u] as number) + 1} / ${def.max}</small>`);
          card.addEventListener('click', () => this.send({ t: 'chooseUpgrade', index }));
          row.appendChild(card);
        });
        this.levelup.appendChild(row);
      }
    }

    // Écran de mort : statistiques de la vie et rappel de l'arbre d'héritage.
    const dKey = `${dead}|${p(PROG_REMANENCE)}|${lastDeath?.kills ?? ''}`;
    if (dKey !== this.deathKey) {
      this.deathKey = dKey;
      const m = Math.floor((lastDeath?.seconds ?? 0) / 60);
      const s = Math.floor((lastDeath?.seconds ?? 0) % 60);
      this.deathStats.innerHTML = lastDeath === null ? '' : `${lastDeath.kills} éliminés · survie ${m}:${String(s).padStart(2, '0')}`;
      this.heritage.innerHTML = `<div id="deathHint">Rémanence : ${p(PROG_REMANENCE)} — <b>P</b> : arbre d'héritage</div>`;
    }

    this.updateTree(progress, offset, dead, safe);

    // Récapitulatif dans le panneau du sac.
    const sKey = `${level}|${lifeRanks.join(',')}|${heritageRanks.join(',')}|${p(PROG_REMANENCE)}|${p(PROG_TOTAL_KILLS)}|${p(PROG_DEATHS)}|${p(PROG_BEST_SECONDS)}`;
    if (sKey !== this.statsKey) {
      this.statsKey = sKey;
      const life = UPGRADES.map((u, k) => (lifeRanks[k] ? `${u.name} ×${lifeRanks[k]}` : '')).filter(Boolean).join(', ') || 'aucun';
      const her = HERITAGE.map((h, k) => (heritageRanks[k] ? `${h.name} ×${heritageRanks[k]}` : '')).filter(Boolean).join(', ') || 'aucun';
      const best = p(PROG_BEST_SECONDS);
      this.bagStats.innerHTML =
        `<div><b>Niveau ${level}</b> · bonus de vie : ${life}</div><div>Héritage : ${her}</div>` +
        `<div>Rémanence ${p(PROG_REMANENCE)} · ${p(PROG_TOTAL_KILLS)} éliminés · ${p(PROG_DEATHS)} morts · meilleure survie ${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')}</div>`;
    }
    void PROGRESS_STRIDE;
  }
}

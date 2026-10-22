import { parseProfile } from '../../sim/profile';
import type { Profile } from '../../sim/profile';

export const SAVE_KEY = 'someone-remains-save-v1';
export const SAVE_VERSION = 1;

/** Sauvegarde complète : le profil du personnage et le compteur d'infectés éliminés. */
export interface SaveFile {
  version: number;
  profile: Profile;
  /** Total pondéré affiché par le compteur « Restants » (voir ENEMIES.killWeight). */
  counter: number;
  savedAt: number;
}

/** Lit un objet de sauvegarde : version connue, profil valide, compteur entier positif ; sinon null. */
export function parseSave(raw: unknown): SaveFile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o['version'] !== SAVE_VERSION) return null;
  const profile = parseProfile(o['profile']);
  const counter = o['counter'];
  if (profile === null || typeof counter !== 'number' || !Number.isInteger(counter) || counter < 0) return null;
  const savedAt = typeof o['savedAt'] === 'number' ? o['savedAt'] : 0;
  return { version: SAVE_VERSION, profile, counter, savedAt };
}

/** Texte base64 pour changer d'appareil. */
export function encodeSave(file: SaveFile): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(file))));
}

export function decodeSave(text: string): SaveFile | null {
  try {
    return parseSave(JSON.parse(decodeURIComponent(escape(atob(text.trim())))));
  } catch {
    return null;
  }
}

/** La sauvegarde du navigateur (localStorage) ; toute erreur d'accès est silencieuse (navigation privée, quota…). */
export function loadSave(): SaveFile | null {
  try {
    const text = window.localStorage.getItem(SAVE_KEY);
    return text === null ? null : parseSave(JSON.parse(text));
  } catch {
    return null;
  }
}

export function writeSave(file: SaveFile): boolean {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // rien à faire
  }
}

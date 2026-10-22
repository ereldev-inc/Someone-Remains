import { describe, expect, it } from 'vitest';
import { PROFILE_VERSION } from '../../sim/profile';
import type { Profile } from '../../sim/profile';
import { decodeSave, encodeSave, parseSave, SAVE_VERSION } from './SaveService';
import type { SaveFile } from './SaveService';

const profile: Profile = {
  version: PROFILE_VERSION,
  heritage: [1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  remanence: 12,
  totalKills: 34,
  deaths: 5,
  bestSurvivalSeconds: 120,
  stash: [0, 10, 5, 24],
  plans: 3,
  owned: 3,
  meleeOwned: 1,
  slotWeapon: [0, 1, -1],
  meleeWeapon: 0,
  bag: [],
  mags: [],
};
const file: SaveFile = { version: SAVE_VERSION, profile, counter: 4321, savedAt: 1 };

describe('SaveService', () => {
  it('encode puis décode une sauvegarde à l\'identique', () => {
    const text = encodeSave(file);
    expect(text).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(decodeSave(text)).toEqual(file);
    expect(decodeSave(`  ${text}\n`)).toEqual(file); // espaces et retours à la ligne tolérés
  });

  it('refuse le texte illisible, les mauvaises versions et les compteurs invalides', () => {
    expect(decodeSave('pas du base64 !')).toBeNull();
    expect(decodeSave(btoa('{"a":1}'))).toBeNull();
    expect(parseSave({ ...file, version: 99 })).toBeNull();
    expect(parseSave({ ...file, counter: -1 })).toBeNull();
    expect(parseSave({ ...file, counter: 1.5 })).toBeNull();
    expect(parseSave({ ...file, profile: { ...profile, version: 7 } })).toBeNull();
    expect(parseSave(null)).toBeNull();
  });
});

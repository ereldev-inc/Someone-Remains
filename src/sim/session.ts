import { MAPS } from './data/maps';
import { HUB_MAP_ID } from './data/zone';
import { START_KIT, ITEM_MUNITIONS_9MM } from './data/items';
import { WEAPONS } from './data/weapons';
import { entityIndex } from './ecs/pool';
import { exportProfile, importProfile } from './profile';
import type { Profile } from './profile';
import { addPlayer, createSimFromMap } from './sim';
import type { Sim } from './sim';
import { bagClear, bagCount, stashAdd, stashCount } from './systems/inventory';
import type { EntityId } from './types';

/**
 * Une session suit un joueur de monde en monde : le bunker (hub) puis des expéditions. Chaque monde est une sim neuve ;
 * ce qui voyage entre deux mondes est le profil (coffre, plans, armes, héritage) et, selon le cas, le sac.
 * La sim ne connaît pas les autres mondes : c'est ici que se décide où l'on va.
 */
export interface Session {
  sim: Sim;
  id: EntityId;
  mapId: string;
  /** Nombre de voyages déjà faits : décale la graine pour que chaque expédition soit différente. */
  trips: number;
}

export { HUB_MAP_ID };

function build(mapId: string, profile: Profile | null, seed: number, trips: number, withBag: boolean): { sim: Sim; id: EntityId } {
  const def = MAPS[mapId];
  if (def === undefined) throw new Error(`Carte inconnue : ${mapId}`);
  const sim = createSimFromMap(def, seed + trips * 7919);
  sim.config.hub = true;
  const id = addPlayer(sim);
  const i = entityIndex(id);
  if (profile === null) {
    // Nouveau personnage : le kit de départ attend dans le coffre, le sac est vide.
    bagClear(sim, i);
    sim.players.mag.fill(0, i * WEAPONS.length, (i + 1) * WEAPONS.length);
    giveStarterStash(sim, i);
  } else {
    importProfile(sim, id, profile, 'profile');
    // Pas de bloc de munitions du tout ? un kit de secours est remis au coffre, pour ne jamais être coincé.
    if (!withBag || def.kind === 'hub') ensureSurvivalKit(sim, i);
  }
  return { sim, id };
}

function giveStarterStash(sim: Sim, i: number): void {
  for (const [item, qty] of START_KIT) stashAdd(sim, i, item, qty);
}

function ensureSurvivalKit(sim: Sim, i: number): void {
  if (stashCount(sim, i, ITEM_MUNITIONS_9MM) + bagCount(sim, i, ITEM_MUNITIONS_9MM) > 0) return;
  giveStarterStash(sim, i);
}

/** Démarre une session : au bunker par défaut, ou directement sur une carte (debug). */
export function createSession(profile: Profile | null, seed: number, mapId: string = HUB_MAP_ID): Session {
  return { ...build(mapId, profile, seed, 0, false), mapId, trips: 0 };
}

/**
 * Profil à écrire sur disque : le sac n'y figure qu'au bunker. Fermer le jeu en expédition perd donc le sac
 * (ce qu'on y a emporté a déjà quitté le coffre).
 */
export function saveProfile(session: Session): Profile {
  return exportProfile(session.sim, session.id, { withBag: session.sim.map?.def.kind === 'hub' });
}

/** Passe dans un autre monde en emportant le profil, le sac et les chargeurs. */
export function travel(session: Session, mapId: string): Session {
  const carry = exportProfile(session.sim, session.id, { withBag: true });
  const trips = session.trips + 1;
  const seed = session.sim.seed;
  return { ...build(mapId, carry, seed, trips, true), mapId, trips };
}

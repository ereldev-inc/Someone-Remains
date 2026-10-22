import type { Snapshot } from '../../sim/snapshot';
import type { Profile } from '../../sim/profile';
import type { Command, EntityId, InputFrame, SimEvent } from '../../sim/types';
import type { MapDef } from '../../sim/world/mapdef';
import type { Obstacles } from '../../sim/world/obstacles';

/** Envoyé une fois à la connexion : tout ce qui est statique. */
export interface Welcome {
  playerId: EntityId;
  seed: number;
  obstacles: Obstacles;
  /** Carte jouée (décor, refuges, caisses, passages) ; null dans le monde de test. */
  map: MapDef | null;
}

/** Lien entre le client et la sim (ou le serveur plus tard). */
export interface Transport {
  sendInput(frame: InputFrame): void;
  setPaused(paused: boolean): void;
  sendCommand(cmd: Command): void;
  /** Demande le profil à sauvegarder ; la réponse arrive par onProfile. */
  requestProfile(): void;
  onProfile(cb: (profile: Profile) => void): void;
  onWelcome(cb: (welcome: Welcome) => void): void;
  onSnapshot(cb: (snap: Snapshot) => void): void;
  onEvents(cb: (events: SimEvent[]) => void): void;
}

export type ToWorker =
  | { t: 'init'; seed: number; horde: number; showcase: number[]; mapId: string; at: number[]; kit: boolean; profile: Profile | null; xp: number }
  | { t: 'input'; frame: InputFrame }
  | { t: 'pause'; paused: boolean }
  | { t: 'command'; cmd: Command }
  | { t: 'saveRequest' };

export type FromWorker =
  | { t: 'welcome'; welcome: Welcome }
  | { t: 'snapshot'; snap: Snapshot }
  | { t: 'events'; events: SimEvent[] }
  | { t: 'profile'; profile: Profile };

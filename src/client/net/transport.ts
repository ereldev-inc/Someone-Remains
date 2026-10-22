import type { Snapshot } from '../../sim/snapshot';
import type { EntityId, InputFrame, SimEvent } from '../../sim/types';
import type { Obstacles } from '../../sim/world/obstacles';

/** Envoyé une fois à la connexion : tout ce qui est statique. */
export interface Welcome {
  playerId: EntityId;
  seed: number;
  obstacles: Obstacles;
}

/** Lien entre le client et la sim (ou le serveur plus tard). */
export interface Transport {
  sendInput(frame: InputFrame): void;
  setPaused(paused: boolean): void;
  onWelcome(cb: (welcome: Welcome) => void): void;
  onSnapshot(cb: (snap: Snapshot) => void): void;
  onEvents(cb: (events: SimEvent[]) => void): void;
}

export type ToWorker =
  | { t: 'init'; seed: number }
  | { t: 'input'; frame: InputFrame }
  | { t: 'pause'; paused: boolean };

export type FromWorker =
  | { t: 'welcome'; welcome: Welcome }
  | { t: 'snapshot'; snap: Snapshot }
  | { t: 'events'; events: SimEvent[] };

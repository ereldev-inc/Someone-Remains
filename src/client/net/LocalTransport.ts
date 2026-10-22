import type { Snapshot } from '../../sim/snapshot';
import type { Profile } from '../../sim/profile';
import type { Command, InputFrame, SimEvent } from '../../sim/types';
import type { FromWorker, ToWorker, Transport, Welcome } from './transport';

/** Phase 1 : la sim tourne dans un Web Worker du même navigateur. */
export class LocalTransport implements Transport {
  private readonly worker: Worker;
  private welcomeCb: ((w: Welcome) => void) | null = null;
  private snapshotCb: ((s: Snapshot) => void) | null = null;
  private eventsCb: ((e: SimEvent[]) => void) | null = null;
  private profileCb: ((p: Profile) => void) | null = null;

  /** `horde` : nombre d'ennemis visé (-1 = selon la carte). `showcase` : types d'ennemis placés près du départ. */
  constructor(seed: number, mapId: string, horde = -1, showcase: number[] = [], at: number[] = [], kit = false, profile: Profile | null = null, xp = 0) {
    this.worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data;
      if (msg.t === 'welcome') this.welcomeCb?.(msg.welcome);
      else if (msg.t === 'snapshot') this.snapshotCb?.(msg.snap);
      else if (msg.t === 'profile') this.profileCb?.(msg.profile);
      else this.eventsCb?.(msg.events);
    };
    this.post({ t: 'init', seed, horde, showcase, mapId, at, kit, profile, xp });
  }

  sendInput(frame: InputFrame): void {
    this.post({ t: 'input', frame });
  }

  requestProfile(): void {
    this.post({ t: 'saveRequest' });
  }

  onProfile(cb: (profile: Profile) => void): void {
    this.profileCb = cb;
  }

  sendCommand(cmd: Command): void {
    this.post({ t: 'command', cmd });
  }

  setPaused(paused: boolean): void {
    this.post({ t: 'pause', paused });
  }

  onWelcome(cb: (w: Welcome) => void): void {
    this.welcomeCb = cb;
  }

  onSnapshot(cb: (s: Snapshot) => void): void {
    this.snapshotCb = cb;
  }

  onEvents(cb: (e: SimEvent[]) => void): void {
    this.eventsCb = cb;
  }

  private post(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }
}

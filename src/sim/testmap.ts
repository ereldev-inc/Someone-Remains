import type { MapDef } from './world/mapdef';

/** Petite carte de test : refuge au sud, un groupe de 3 rôdeurs au nord, un groupe lointain, un mur au milieu. */
export function miniMap(patch: Partial<MapDef> = {}): MapDef {
  return {
    id: 'mini',
    name: 'Mini',
    level: 2,
    size: 200,
    palette: { ground: '#222222', fog: '#000000' },
    difficulty: 'niveau-2',
    playerStart: { x: 0, y: 80 },
    refuges: [{ id: 'r', name: 'Refuge', x: 0, y: 80, radius: 10, respawn: { x: 0, y: 80 } }],
    obstacles: [{ kind: 'box', x: 40, y: 0, w: 4, h: 30, style: 'wall' }],
    decor: [],
    groups: [
      { id: 'g', x: 0, y: 20, radius: 6, activation: 30, members: [{ type: 'rodeur', count: 3 }] },
      { id: 'loin', x: -70, y: -70, radius: 5, activation: 10, members: [{ type: 'rodeur', count: 15 }] },
    ],
    crates: [{ id: 'c', x: 10, y: 60, tier: 'commune' }],
    passages: [],
    zones: [],
    endOfZone: { countdownSeconds: 600, extraction: [{ id: 'e', x: -80, y: -80, radius: 5 }] },
    ...patch,
  };
}

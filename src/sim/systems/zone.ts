import { ENEMIES, ENEMY_MAX_RADIUS } from '../data/enemies';
import {
  EXTRACT_TICKS,
  HUB_MAP_ID,
  OUT_DEAD,
  OUT_EXTRACTED,
  OUT_IN,
  PERSISTENT_WAVE,
  WAVE_BASE_COUNT,
  WAVE_COUNT_GROWTH,
  WAVE_DAMAGE_GROWTH,
  WAVE_FIRST_TICKS,
  WAVE_HP_GROWTH,
  WAVE_INTERVAL_TICKS,
  WAVE_MAX_COUNT,
  WAVE_PLAYER_BONUS,
  WAVE_SPAWN_MAX_DIST,
  WAVE_SPAWN_MIN_DIST,
  WAVE_SPAWN_PER_TICK,
  WAVE_TYPE_ORDER,
  WAVE_TYPE_STEP,
  ZONE_PHASE_COUNTDOWN,
  ZONE_PHASE_EVACUATION,
} from '../data/zone';
import { BTN_INTERACT, TICK_RATE } from '../types';
import { nextInt, nextRange } from '../rng';
import { enemyTypeIndex } from '../world/map';
import { bankLife } from './progression';
import { overlapsObstacle } from './collision';
import { releaseEnemy, spawnEnemy, STATE_CHASE } from './enemies';
import type { Sim } from '../sim';
import type { EntityId } from '../types';

/** État de la fin de zone d'une instance. */
export interface ZoneState {
  phase: number;
  /** Ticks restants : avant l'évacuation (compte à rebours), puis avant la prochaine vague. */
  ticks: number;
  /** Vagues déjà lancées. */
  wave: number;
  /** L'instance est terminée (plus aucun joueur présent). */
  ended: boolean;
  /** Ennemis de la vague en cours qui restent à faire apparaître. */
  pending: number;
  pendingHp: number;
  pendingDmg: number;
  pendingTypes: number[];
}

export function createZoneState(countdownSeconds: number): ZoneState {
  return { phase: ZONE_PHASE_COUNTDOWN, ticks: Math.round(countdownSeconds * TICK_RATE), wave: 0, ended: false, pending: 0, pendingHp: 1, pendingDmg: 1, pendingTypes: [] };
}

/** Types de la vague `n` (1 = première) : les plus dangereux se débloquent au fil des vagues. */
export function waveTypes(sim: Sim, n: number): number[] {
  const map = sim.map;
  const allowed = map === null ? WAVE_TYPE_ORDER : WAVE_TYPE_ORDER.filter((t) => map.profile.allowedTypes.includes(t));
  const unlocked = Math.min(allowed.length, 1 + Math.floor((n - 1) / WAVE_TYPE_STEP));
  return allowed.slice(0, Math.max(1, unlocked)).map(enemyTypeIndex);
}

/** Effectif de la vague `n` pour `players` joueurs encore présents. */
export function waveCount(n: number, players: number): number {
  return Math.min(WAVE_MAX_COUNT, Math.round((WAVE_BASE_COUNT + WAVE_COUNT_GROWTH * (n - 1)) * (1 + WAVE_PLAYER_BONUS * Math.max(0, players - 1))));
}

export function waveHpMult(sim: Sim, n: number): number {
  return (sim.map?.profile.hpMult ?? 1) * (1 + WAVE_HP_GROWTH * (n - 1));
}

export function waveDamageMult(sim: Sim, n: number): number {
  return (sim.map?.profile.damageMult ?? 1) * (1 + WAVE_DAMAGE_GROWTH * (n - 1));
}

/** Nombre de joueurs encore dans l'instance (ni extraits, ni morts pendant l'évacuation). */
function playersIn(sim: Sim): number {
  const pool = sim.playerPool;
  let n = 0;
  for (let i = 0; i < pool.capacity; i++) if (pool.alive[i] === 1 && sim.players.zoneOut[i] === OUT_IN) n++;
  return n;
}

/** Relance une instance neuve : compte à rebours complet, vagues retirées, joueurs de nouveau « dans » la zone. */
export function resetZone(sim: Sim): void {
  const map = sim.map;
  if (map === null) return;
  const z = sim.zone;
  z.phase = ZONE_PHASE_COUNTDOWN;
  z.ticks = Math.round((sim.config.zoneSeconds >= 0 ? sim.config.zoneSeconds : map.def.endOfZone.countdownSeconds) * TICK_RATE);
  z.wave = 0;
  z.ended = false;
  z.pending = 0;
  clearWaveEnemies(sim);
  const pool = sim.playerPool;
  for (let i = 0; i < pool.capacity; i++) {
    sim.players.zoneOut[i] = OUT_IN;
    sim.players.extractProgress[i] = 0;
  }
}

function clearWaveEnemies(sim: Sim): void {
  const ep = sim.enemyPool;
  for (let s = 0; s < ep.highWater; s++) {
    if (ep.alive[s] === 1 && (sim.enemies.persistent[s] as number) === PERSISTENT_WAVE) releaseEnemy(sim, s);
  }
}

function startWave(sim: Sim, players: number): void {
  const z = sim.zone;
  z.wave++;
  z.pending = waveCount(z.wave, players);
  z.pendingHp = waveHpMult(sim, z.wave);
  z.pendingDmg = waveDamageMult(sim, z.wave);
  z.pendingTypes = waveTypes(sim, z.wave);
  z.ticks = WAVE_INTERVAL_TICKS;
  sim.events.push({ t: 'wave', wave: z.wave, count: z.pending });
}

function spawnWaveEnemies(sim: Sim): void {
  const z = sim.zone;
  const pl = sim.players;
  const rng = sim.rng.spawn;
  const targets: number[] = [];
  for (let k = 0; k < sim.liveCount; k++) {
    const i = sim.live[k] as number;
    if (pl.zoneOut[i] === OUT_IN) targets.push(i);
  }
  if (targets.length === 0) return;
  let budget = WAVE_SPAWN_PER_TICK;
  for (let attempts = budget * 3; z.pending > 0 && budget > 0 && attempts > 0; attempts--) {
    const pi = targets[nextInt(rng, targets.length)] as number;
    const angle = nextRange(rng, 0, Math.PI * 2);
    const dist = nextRange(rng, WAVE_SPAWN_MIN_DIST, WAVE_SPAWN_MAX_DIST);
    const x = (pl.posX[pi] as number) + Math.cos(angle) * dist;
    const y = (pl.posY[pi] as number) + Math.sin(angle) * dist;
    const half = sim.map?.half ?? 0;
    if (Math.abs(x) > half - 2 || Math.abs(y) > half - 2) continue;
    if (overlapsObstacle(sim.obstacleQuery, x, y, ENEMY_MAX_RADIUS)) continue;
    const type = z.pendingTypes[nextInt(rng, z.pendingTypes.length)] as number;
    if (ENEMIES[type] === undefined) continue;
    if (spawnEnemy(sim, type, x, y, STATE_CHASE, z.pendingHp, z.pendingDmg, PERSISTENT_WAVE) < 0) {
      z.pending = 0; // pool plein : la vague est écourtée
      break;
    }
    z.pending--;
    budget--;
  }
}

/** Compte à rebours, vagues d'évacuation, extraction au bunker et fin d'instance. */
export function stepZone(sim: Sim): void {
  const map = sim.map;
  if (map === null || map.def.kind === 'hub') return;
  const z = sim.zone;
  if (z.ended) return;

  if (z.phase === ZONE_PHASE_COUNTDOWN) {
    z.ticks--;
    if (z.ticks <= 0) {
      z.phase = ZONE_PHASE_EVACUATION;
      z.ticks = WAVE_FIRST_TICKS;
      sim.events.push({ t: 'evacuation' });
    }
  } else {
    // Évacuation : l'instance est verrouillée, les vagues s'enchaînent.
    const present = playersIn(sim);
    z.ticks--;
    if (z.ticks <= 0 && present > 0) startWave(sim, present);
    if (z.pending > 0) spawnWaveEnemies(sim);
  }

  stepExtraction(sim);

  if (z.phase === ZONE_PHASE_EVACUATION && playersIn(sim) === 0 && sim.playerPool.count > 0) {
    z.ended = true;
    z.pending = 0;
    clearWaveEnemies(sim);
    sim.events.push({ t: 'zoneEnd', wave: z.wave });
  }
}

/**
 * Extraction : le seul point est la sortie du bunker. On peut rentrer à tout moment en maintenant F dans la zone ;
 * pendant l'évacuation, rester dans la zone suffit. Un coup reçu interrompt (damagePlayer).
 */
function stepExtraction(sim: Sim): void {
  const map = sim.map;
  if (map === null) return;
  const pl = sim.players;
  const evacuating = sim.zone.phase === ZONE_PHASE_EVACUATION;
  for (let k = 0; k < sim.liveCount; k++) {
    const i = sim.live[k] as number;
    if (pl.zoneOut[i] !== OUT_IN) continue;
    let inside = false;
    for (const e of map.def.endOfZone.extraction) {
      const dx = (pl.posX[i] as number) - e.x;
      const dy = (pl.posY[i] as number) - e.y;
      if (dx * dx + dy * dy <= e.radius * e.radius) inside = true;
    }
    const wants = evacuating || ((pl.prevButtons[i] as number) & BTN_INTERACT) !== 0;
    if (!inside || !wants) {
      pl.extractProgress[i] = 0;
      continue;
    }
    pl.extractProgress[i] = (pl.extractProgress[i] as number) + 1;
    if ((pl.extractProgress[i] as number) < EXTRACT_TICKS) continue;
    pl.zoneOut[i] = OUT_EXTRACTED;
    pl.extractProgress[i] = 0;
    bankLife(sim, i);
    const id = (((sim.playerPool.generations[i] as number) << 16) | i) as EntityId;
    sim.events.push({ t: 'extracted', id });
    if (sim.config.hub) sim.events.push({ t: 'travel', id, to: HUB_MAP_ID });
    else {
      pl.posX[i] = map.respawnX;
      pl.posY[i] = map.respawnY;
      pl.velX[i] = 0;
      pl.velY[i] = 0;
    }
  }
}

/** Un joueur meurt : pendant l'évacuation, il quitte l'instance. */
export function onZoneDeath(sim: Sim, i: number): void {
  if (sim.map !== null && sim.zone.phase === ZONE_PHASE_EVACUATION && sim.players.zoneOut[i] === OUT_IN) {
    sim.players.zoneOut[i] = OUT_DEAD;
    sim.players.extractProgress[i] = 0;
  }
}

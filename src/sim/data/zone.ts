/** Fin de zone (4.6) : valeurs de départ, à régler en jouant. */
export const ZONE_PHASE_COUNTDOWN = 0;
export const ZONE_PHASE_EVACUATION = 1;

/** Le bunker : carte d'arrivée par défaut, où l'on revient par extraction ou après une mort. */
export const HUB_MAP_ID = 'bunker';
/** Marge autour de la porte du bunker où le départ est accepté (m). */
export const GATE_REACH = 1.5;

/** Joueur « sorti » de l'instance : extrait, ou mort pendant l'évacuation. */
export const OUT_IN = 0;
export const OUT_EXTRACTED = 1;
export const OUT_DEAD = 2;

/** Délai avant la première vague, puis intervalle entre deux vagues. */
export const WAVE_FIRST_TICKS = 5 * 60;
export const WAVE_INTERVAL_TICKS = 30 * 60;
/** Temps à passer dans un point d'extraction sans être touché. */
export const EXTRACT_TICKS = 5 * 60;

export const WAVE_BASE_COUNT = 12;
export const WAVE_COUNT_GROWTH = 6;
/** Bonus d'effectif par joueur supplémentaire encore présent. */
export const WAVE_PLAYER_BONUS = 0.5;
export const WAVE_MAX_COUNT = 300;
/** Croissance par vague des PV et des dégâts (multiplicateurs additifs sur le profil de la carte). */
export const WAVE_HP_GROWTH = 0.15;
export const WAVE_DAMAGE_GROWTH = 0.1;
/** Une vague de plus débloque un type de plus tous les WAVE_TYPE_STEP. */
export const WAVE_TYPE_STEP = 3;
/** Types utilisables par les vagues, du moins au plus dangereux (filtrés par le profil de la carte). */
export const WAVE_TYPE_ORDER: readonly string[] = ['rodeur', 'coureur', 'cracheur', 'hurleur', 'explosif', 'brute', 'colosse'];
export const WAVE_SPAWN_MIN_DIST = 32;
export const WAVE_SPAWN_MAX_DIST = 46;
export const WAVE_SPAWN_PER_TICK = 5;
/** Marque `persistent` des ennemis de vague : jamais recyclés par distance, retirés à la fin de l'instance. */
export const PERSISTENT_WAVE = 2;

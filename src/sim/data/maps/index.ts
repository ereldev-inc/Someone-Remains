import type { MapDef } from '../../world/mapdef';
import { parseMap } from '../../world/parseMap';
import niveau1 from './niveau-1-campagne.json';

/** Toutes les cartes du jeu, par identifiant. Une carte ajoutée au dossier doit être listée ici. */
export const MAPS: Readonly<Record<string, MapDef>> = {
  'niveau-1-campagne': parseMap(niveau1),
};

export const FIRST_MAP = 'niveau-1-campagne';

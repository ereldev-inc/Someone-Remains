import type { MapDef } from '../../world/mapdef';
import { parseMap } from '../../world/parseMap';
import bunker from './bunker.json';
import bacASable from './bac-a-sable.json';
import niveau1 from './niveau-1-campagne.json';

/** Toutes les cartes du jeu, par identifiant. Une carte ajoutée au dossier doit être listée ici. */
export const MAPS: Readonly<Record<string, MapDef>> = {
  // Le bunker : carte d'arrivée, sûre, avec l'établi et le coffre ; sa porte mène aux expéditions.
  bunker: parseMap(bunker),
  'niveau-1-campagne': parseMap(niveau1),
  // Carte de développement : bâtiments visitables. Accessible par ?play=bac-a-sable.
  'bac-a-sable': parseMap(bacASable),
};

export const FIRST_MAP = 'niveau-1-campagne';

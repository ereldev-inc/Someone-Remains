import { MAPS } from '../src/sim/data/maps';
import { validateMap } from '../src/sim/world/validateMap';

// Valide chaque carte de src/sim/data/maps et affiche ses statistiques. Code de sortie 1 en cas d'erreur.
let failed = false;
for (const [id, def] of Object.entries(MAPS)) {
  const { errors, stats } = validateMap(def);
  const types = Object.entries(stats.perType).map(([t, n]) => `${n} ${t}`).join(', ');
  console.log(`${id} : ${def.size} m, ${stats.obstacles} obstacles, ${stats.groups} groupes, ${stats.enemies} ennemis (${types}), ${stats.densityPerHectare.toFixed(2)}/ha, ${stats.crates} caisses, ${stats.refuges} refuge(s), ${(stats.reachableRatio * 100).toFixed(0)} % du sol accessible`);
  for (const e of errors) console.error(`  ERREUR ${e}`);
  if (errors.length > 0) failed = true;
}
if (failed) process.exitCode = 1;

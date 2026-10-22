# Sept Milliards

Jeu d'action 3D vue du dessus (TypeScript, Vite, Three.js, Vitest). Source de vérité : [PLAN.md](PLAN.md) — suivre les jalons dans l'ordre et respecter les sections 7.1, 8 et 13.

- `npm run dev` / `npm test` / `npm run build` (tsc + vite build) doivent rester verts avant chaque commit.
- `src/sim/` est pur : jamais de DOM, Three.js, `Date.now()` ni `Math.random()`.
- TypeScript strict, pas de `any`, imports relatifs.
- Livraison par lots : chaque lot est poussé sur `main` (déclenche le déploiement GitHub Pages) pour être testé avant le lot suivant.

# Someone Remains

Jeu d'action 3D vue du dessus, personnage persistant, compteur mondial d'infectés éliminés (objectif : 9 000 000 000).

Voir [PLAN.md](PLAN.md) pour la conception et les jalons.

```
npm install
npm run dev     # serveur de développement
npm test        # tests Vitest
npm run build   # tsc + vite build
npm run headless  # 10 000 ticks de sim sans rendu (tools/headless.ts)
```

Déploiement : GitHub Actions → GitHub Pages à chaque push sur `main` (Settings → Pages → Source : GitHub Actions).

## Contrôles

`ZQSD` / `WASD` ou flèches : déplacement · souris : visée · `Espace` : esquive · `F3` : infos de debug.

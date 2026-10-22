# Sept Milliards

Jeu d'action 3D vue du dessus, personnage persistant, compteur mondial d'infectés éliminés (objectif : 7 000 000 000).

Voir [PLAN.md](PLAN.md) pour la conception et les jalons.

```
npm install
npm run dev     # serveur de développement
npm test        # tests Vitest
npm run build   # tsc + vite build
```

Déploiement : GitHub Actions → GitHub Pages à chaque push sur `main` (Settings → Pages → Source : GitHub Actions).

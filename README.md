# Someone Remains

Jeu d'action 3D vue du dessus, personnage persistant, compteur mondial d'infectés éliminés (objectif : 10 000 000 000).

Voir [PLAN.md](PLAN.md) pour la conception et les jalons.

```
npm install
npm run dev     # serveur de développement
npm test        # tests Vitest
npm run build   # tsc + vite build
npm run validate-maps  # valide les cartes de src/sim/data/maps et affiche leurs statistiques
npm run bench     # banc de charge de la sim : 1 500 ennemis, 3 000 projectiles (budget 4 ms/tick)
npm run headless  # 10 000 ticks de sim sans rendu ; `npm run headless 1 1500` = 1 500 ennemis
```

Déploiement : GitHub Actions → GitHub Pages à chaque push sur `main` (Settings → Pages → Source : GitHub Actions).

## Contrôles

`ZQSD` / `WASD` ou flèches : déplacement · souris : visée · clic gauche maintenu : tir · clic droit : corps à corps · `H` : bandage (soin en restant immobile quelques secondes) · `R` : recharger (plus vite à l'arrêt) · `F` maintenu : fouiller une caisse · `Tab` : sac · `1` `2` `3` / molette : armes · `F` à l'établi ou au stockage : panneau de fabrication · `Espace` : esquive · `A` / `E` : tourner la caméra (`Y` : remettre) · `M` : mini-carte (locale, entière, masquée) · `F3` : infos de debug.

Test de charge : ajouter `?horde=500` à l'URL force 500 ennemis (jusqu'à 2 500).

Voir les ennemis sans les chercher : `?spawn=all` (ou une liste : `?spawn=colosse,souche,brute`). Noms : rodeur, coureur, brute, cracheur, explosif, hurleur, colosse, souche.

Visualiseur de carte : `?map=niveau-1-campagne` (calques, zoom, coordonnées en mètres). Les cartes sont des fichiers JSON dans `src/sim/data/maps/`.

Tester un endroit : `?at=x,y` place le joueur à ces coordonnées (mètres), par exemple `?at=72,119` près d'une caisse de la ferme est.

Carte de test avec bâtiments visitables : `?play=bac-a-sable` (visualiseur : `?map=bac-a-sable`).

Tester la fabrication sans chercher de plans : `?kit=1&at=-3,169.5` (plans appris et matériaux dans le stockage, joueur à l'établi du camp de base).

Sauvegarde automatique dans le navigateur (héritage, stockage, plans, armes, compteur). `Échap` ouvre le menu : exporter/importer en texte, réinitialiser. `?xp=300` donne de l'XP au départ (test des niveaux).

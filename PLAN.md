# SOMEONE REMAINS — Plan de conception

Jeu d'action 3D vue du dessus, nerveux, proche du bullet hell, avec un personnage persistant qui revient plus fort à chaque mort. Tous les joueurs partagent le même monde et alimentent un **compteur mondial d'infectés éliminés** (objectif : 10 000 000 000).

**Phase 1 (ce plan, en détail)** : version offline, solo, déployée sur GitHub Pages par GitHub Actions, avec une architecture pensée pour le multijoueur.
**Phase 2 (esquissée)** : serveur autoritatif, instances de 20 à 50 joueurs, compteur mondial agrégé.

> Ce document est la source de vérité pour le développement avec Claude Code. Suivre les jalons dans l'ordre et valider les critères d'acceptation avant de passer au suivant.

## Décisions prises

| Sujet | Choix |
|---|---|
| Rendu | **Three.js**, caméra du dessus en perspective étroite |
| Plateforme | **Desktop d'abord** (clavier + souris). Mobile hors périmètre V1 |
| Multi futur | **Instances de 20 à 50 joueurs** + compteur mondial agrégé (pas un monde unique de milliers de joueurs) |
| Progression | **Personnage persistant** qui se renforce à chaque mort (pas de runs séparés) |
| Combat | Ennemis **au repos tant qu'ils ne sont pas alertés** : par la présence du joueur (petit rayon) ou par le **bruit de ses tirs** (grand rayon) |
| Ressources | **Caisses de butin** à fouiller, **sac limité**, **munitions consommées** (sans munition, pas de tir : il reste le **corps à corps**), **craft** de munitions et d'armes à l'établi du refuge |
| Fin de zone | **Compte à rebours** par carte, puis **vagues croissantes** jusqu'à la mort de tous les joueurs ; instance **verrouillée** ; on reste se battre ou on **extrait** (section 4.6) |
| Monde | **Cartes fixes conçues à la main** (avec le développeur du jeu), une par niveau de difficulté : type, puissance et densité des zombies croissants. Plus de génération par seed |
| Build / déploiement | Vite + TypeScript strict + GitHub Actions → GitHub Pages |
| Livraison | Par **lots** poussés sur `main`, testés en ligne un par un (section 10.1) |

## 1. Pitch et fantasme du joueur

Un virus a infecté toute l'humanité. Vous faites partie des rares survivants et le seul remède est radical : il faut éliminer les 10 milliards d'infectés. Chaque tir compte, chaque mort aussi : vous revenez toujours un peu plus fort.

**Les quatre piliers**
1. **Nervosité** : déplacements rapides, esquive, tirs en continu, projectiles ennemis à éviter. Une partie se joue aux réflexes et au placement.
2. **Puissance croissante** : l'écran se remplit d'ennemis et de projectiles, et le joueur devient un rouleau compresseur qui finit par tomber face à plus gros que lui.
3. **Effort collectif** : le compteur mondial donne du sens à chaque kill, même sur une session de 5 minutes.
4. **Choix et ressources** : chaque tir fait du bruit et consomme des munitions ; on choisit ses combats, on fouille, on fabrique, et on avance vers des zones plus denses et plus dangereuses.

## 2. Boucle de jeu

```
Refuge (stockage, établi) → sortie → exploration (discrète ou bruyante) → combat, XP, caisses de butin
        → montée en niveau (bonus temporaires) → retour au refuge : dépôt, craft de munitions et d'armes
        → … → mort (le sac est perdu) → écran d'héritage : choix d'un bonus permanent
        → réapparition plus forte au dernier refuge atteint
```

### 2.1 Deux couches de progression

| Couche | Durée de vie | Source | Exemples |
|---|---|---|---|
| **Niveau de vie** | Perdue à la mort | XP gagnée en tuant | choix parmi 3 améliorations d'arme, vitesse de tir, dégâts, projectiles perforants |
| **Rémanence** (héritage) | Permanente | gagnée à chaque mort, selon kills et temps de survie | +PV max, +dégâts, +vitesse, +ramassage, emplacements d'armes, nouvelles armes de départ |

À la mort, le joueur choisit **1 bonus permanent parmi 3** (tirage aléatoire pondéré), pour que chaque mort ait une saveur de décision.

### 2.2 Tension : pourquoi mourir fait mal malgré le bonus

- Le **contenu du sac** (ressources, munitions, soins) est perdu (voir 2.3).
- Le niveau de vie retombe à 1 : la puissance de la minute précédente disparaît.
- Un **temps de réapparition** court (5 à 10 s) au **dernier refuge atteint**, loin de l'action.
- Les ennemis dépendent de la **carte et de la zone** (profil de difficulté, section 4), jamais de la Rémanence du joueur ni du temps passé en vie : la difficulté ne s'écroule pas.

### 2.3 Sac, stockage et refuge

- Le joueur porte un **sac à emplacements limités** : ressources, munitions, soins, plans.
- Le **refuge** (zone sûre de la carte) offre un **stockage** (grande capacité, persistant) et un **établi** (craft, section 3 bis). Aucun ennemi n'y entre.
- **Mort = le sac est perdu** ; les armes équipées et le stockage du refuge sont conservés. Rapporter le butin au refuge avant de reprendre des risques est donc le cœur du risque/récompense, sans revenir à un système de runs.
- La **charge virale** (ressource rare, laissée par les Souches et les Colosses) sert aux recettes avancées.

### 2.4 Garde-fous de progression

- Rendements décroissants sur les bonus de Rémanence (par exemple +10 %, +8 %, +6 % …).
- Plafonds par statistique.
- Pas de bonus qui supprime la lecture des projectiles ennemis (par exemple invulnérabilité permanente).

## 3. Combat

**Contrôles (desktop)**
- `ZQSD` ou `WASD` : déplacement (disposition configurable)
- Souris : visée ; clic gauche maintenu : tir ; **clic droit : coup de corps à corps**
- `Espace` : esquive (dash) avec invulnérabilité courte et recharge de 1,5 à 3 s
- `E` : interaction (ouvrir une caisse, établi, stockage, passage)
- `1` `2` `3` / molette : changer d'arme à distance équipée ; `Tab` : sac
- `Échap` : pause (le jeu continue en multi, voir section 8)
- La **direction de tir est contrôlée à la souris** : le personnage vise toujours le curseur (angle calculé entre le joueur et le point visé au sol), sans visée automatique ni assistance

**Armes (V1 : 5)** : chaque arme a un type de munition, un **rayon de bruit** et 3 à 4 améliorations propres, tirées lors des montées de niveau. Valeurs de départ, à équilibrer :

| Arme | Rôle | Munition | Bruit (rayon de réveil) |
|---|---|---|---|
| Pistolet | Précis, polyvalent | 9 mm | 15 m |
| Fusil à pompe | Cône courte portée | Cartouches | 20 m |
| Mitraillette | Cadence | 9 mm | 19 m |
| Lance-flammes | Zone continue | Carburant | 10 m |
| Arbalète | Perforant, **quasi silencieuse** | Carreaux (récupérables) | 4 m |

Le compromis puissance / bruit / munitions est volontaire : l'arbalète permet de nettoyer un groupe sans réveiller le quartier, le fusil à pompe l'ameute.

**Armes de corps à corps (V1 : 3)** : elles n'utilisent **aucune munition** et restent toujours disponibles au **clic droit**, même quand l'arme à distance est vide. Un coup touche tous les ennemis d'un arc devant le joueur. Valeurs de départ :

| Arme | Rôle | Portée / arc | Cadence | Bruit |
|---|---|---|---|---|
| Barre de fer (de départ) | Équilibrée | 1,6 m, arc large | moyenne | 5 m |
| Machette | Rapide, dégâts modérés | 1,8 m, arc moyen | rapide | 4 m |
| Hache | Très lente, très puissante, projette | 2,0 m, arc large | lente | 7 m |

Le corps à corps est le plan de repli sans munitions, mais il oblige à se mettre à portée des ennemis (contact, brutes, explosifs) : il ne remplace pas une arme à distance.

**Ennemis (V1 : 7 types)**

| Type | Comportement | Menace |
|---|---|---|
| Rôdeur | Fonce en ligne droite | Nuée, saturation de l'écran |
| Coureur | Rapide, trajectoire en zigzag | Pression de déplacement |
| Brute | Lente, charge après un signal visuel | Gros dégâts, esquive à timer |
| Cracheur | Garde ses distances, tire des projectiles | Bullet hell de base |
| Explosif | Court puis explose en zone | Contrôle de l'espace |
| Hurleur | Alerte les ennemis proches et en appelle d'autres | Priorité de cible |
| Colosse (mini-boss) | Motifs de projectiles en rafales et en spirales | Moment fort d'une zone |

Chaque type a ses propres rayons (vue, perte de cible) et sa sensibilité au bruit (données dans `sim/data/enemies.ts`).

**Bullet hell** : les projectiles ennemis suivent des motifs paramétrés (anneau, éventail, spirale, rafale ciblée) définis par données, pas par code ad hoc. Les cracheurs et les boss en sont la source.

**Nid (« Souche »)** : structure qui génère des ennemis en continu. La détruire donne beaucoup d'XP, de la charge virale et nettoie la zone un moment.

### 3.1 Aggro et bruit

Les ennemis ne se jettent pas sur le joueur dès qu'ils existent : le joueur peut traverser la carte et éliminer les ennemis au fur et à mesure.

- **Au repos**, un ennemi flâne autour de son **point d'attache** (position de son groupe sur la carte) et n'attaque pas.
- Il passe en **poursuite** quand :
  - le joueur entre dans son **rayon de vue** (la simple présence ; ~5 m pour un rôdeur) ;
  - le joueur fait du **bruit** dans un rayon plus large : chaque tir relève le rayon de bruit du joueur au rayon de son arme (15 m pour le pistolet), puis il **décroît** (~20 m/s) quand il arrête de tirer ;
  - il est **touché** par un projectile.
- Il **perd sa cible** si le joueur s'éloigne au-delà de son rayon de perte (~50 m) : il rentre alors à son point d'attache.
- Le rayon de bruit s'applique à **tous** les ennemis du rayon : un tir sur un groupe peut en réveiller un autre. C'est ce qui rend l'approche (arme silencieuse, distance, esquive) intéressante.
- Retours visuels : les ennemis alertés changent de teinte ; un anneau autour du joueur montre le rayon de bruit après un tir ; le mode debug (`F3`) affiche aussi le rayon de présence.
- Tout est en **données** : rayons de vue et de perte par ennemi, bruit par arme, vitesse de décroissance.

## 3 bis. Butin, ressources et craft

### Ressources et munitions

| Famille | Exemples | Usage |
|---|---|---|
| Matériaux | Ferraille, poudre, composants électroniques, produits chimiques, tissu | Entrées des recettes |
| Munitions | 9 mm, cartouches, carreaux, carburant | Consommées par les armes |
| Soins | Bandages, trousses | Rendent des PV (usage rapide) |
| Plans | Plan d'arme, plan d'amélioration | Débloquent des recettes (persistants) |
| Rare | Charge virale | Recettes avancées |

- Chaque arme tire dans une **réserve de munitions** (pas de rechargement manuel en V1).
- **Sans munitions, il n'y a plus de tir** : l'arme à distance est inutilisable, il reste le **corps à corps** (clic droit), qui ne coûte rien. Le joueur n'est donc jamais désarmé, mais jamais « gratuitement » en sécurité.
- Le sac a un nombre d'emplacements limité (piles de ressources comprises).

### Caisses de butin

- Placées **à la main sur la carte** (position, type, palier de butin) : caisse commune, coffre rare, caisse militaire.
- On les ouvre avec `E` maintenu environ 1 s ; l'ouverture **fait un peu de bruit** (~6 m), ce qui crée un choix : fouiller vite ou nettoyer d'abord.
- Le contenu est tiré d'une **table de butin** (en données) liée au palier de la caisse, avec le flux aléatoire `loot` de la sim.
- Une caisse vidée se **remplit de nouveau** après un **simple délai (cooldown)** défini en données. Pas de condition de distance pour l'instant.
- Les ennemis laissent parfois de petits butins (matériaux, munitions) ; les Souches et Colosses laissent de la charge virale et des plans.

### Craft

- À l'**établi du refuge** : recettes en données (`sim/data/recipes.ts`), entrées prises dans le sac **et** le stockage.
- Exemples : 20 balles 9 mm = 2 ferraille + 1 poudre ; bandage = 2 tissu ; une arme (à distance ou de corps à corps) = son plan + composants + ferraille.
- Les **plans** se trouvent dans les coffres rares ou sur les boss ; ils sont conservés à la mort.
- Interface : panneau sac (`Tab`) et panneau établi (`E` au refuge).
- Rythme voulu : le craft transforme le butin ramassé en puissance de feu, donc en possibilité de s'aventurer plus loin.

## 4. Monde : cartes fixes par niveau de difficulté

- **Plus de génération par seed** : chaque carte est un **fichier de données conçu à la main** (avec le développeur du jeu), identique pour tous les joueurs, versionné dans le dépôt (`src/sim/data/maps/`) et **validé automatiquement**.
- Le jeu est une **suite de cartes (niveaux)** de difficulté croissante, reliées par des **passages**. Chaque carte a un **profil de difficulté** (types d'ennemis, puissance, densité) que des sous-zones peuvent surcharger.
- Le joueur commence en pleine nature avec peu de zombies, puis progresse vers des villes plus denses et plus dangereuses.

### 4.1 Progression proposée (à valider ensemble)

| Niveau | Carte | Ambiance | Zombies | Densité (par hectare) | Puissance (PV, dégâts) |
|---|---|---|---|---|---|
| 1 | Campagne | Pleine nature, fermes isolées | Rôdeurs | 1 à 2 | ×1,0 |
| 2 | Village | Bourg, routes, commerces | Rôdeurs, coureurs | 3 | ×1,2 |
| 3 | Banlieue | Lotissements, centres commerciaux | + cracheurs, hurleurs | 6 | ×1,5 |
| 4 | Centre-ville | Rues serrées, immeubles | + brutes, explosifs | 12 | ×2,0 |
| 5 | Zone industrielle | Entrepôts, usines | Explosifs, brutes, Souches | 10 | ×2,5 |
| 6 | Zone militaire | Base, barrages | Tous, Colosse | 15 | ×3,0 |

Ces valeurs sont des points de départ, à régler en jouant. Elles vivent dans `sim/data/` (profils de difficulté).

### 4.2 Contenu d'une carte (`MapDef`)

- Identité : id, nom, niveau, taille (400 à 800 m de côté, à valider), palette visuelle.
- **Bornes** : limites infranchissables (relief, murs, forêt dense), pas de bord visible.
- **Obstacles et décors** : bâtiments, véhicules, arbres, rochers, clôtures (boîtes et cylindres avec collisions simples), décors sans collision (routes, herbe).
- **Refuges** : zone sûre (aucun ennemi), établi, stockage, point de réapparition.
- **Groupes d'ennemis** : point d'attache, rayon, composition par type, rayon d'activation. Les groupes se placent à la main : le concepteur contrôle les rencontres.
- **Souches** (nids) et points d'intérêt (coffre rare, mini-boss).
- **Caisses de butin** : position, type, palier.
- **Zones de difficulté** : surcharges locales du profil (puissance, densité, types).
- **Passages** : zone d'entrée vers la carte suivante (ou précédente) avec le point d'arrivée.
- **Fin de zone** : durée du compte à rebours, points d'extraction, profil des vagues (4.6).

Format : un fichier JSON par carte, décrit par un type TypeScript `MapDef` et un **validateur** (voir 7.8).

### 4.3 Population

- Les groupes sont **activés à l'approche** du joueur (rayon d'activation) : seuls les ennemis proches sont simulés, ce qui borne le coût.
- Un groupe éliminé **ne réapparaît pas pour l'instant** ; la pression qui revient vient de la **fin de zone** (4.6). Un cooldown de réapparition des groupes pourra être ajouté plus tard.
- Les ennemis sont **au repos** autour de leur point d'attache (section 3.1) : explorer, attirer et éliminer par petits paquets est le gameplay de base.
- Le profil de difficulté multiplie les PV et dégâts des ennemis et fixe les types autorisés ; la densité est celle des groupes placés.

### 4.4 Conception des cartes à deux

1. **Brief** (vous) : ambiance, taille, rencontres, difficulté voulue, lieux marquants.
2. **Premier jet** (moi) : j'écris la carte en JSON à partir du brief.
3. **Visualiseur** `?map=<id>` : vue de dessus de la carte entière avec calques activables (zones de difficulté, groupes, caisses, refuges, passages), zoom et déplacement, déployé sur Pages pour la relecture.
4. **Itérations** : retours de votre part ("déplace la ferme à l'est", "plus de zombies près du pont"), corrections de mon côté.
5. Un **éditeur intégré** (placement à la souris, export JSON) est une option, à décider après la première carte si l'édition à la main est trop lourde.
6. Le **validateur** vérifie la carte à chaque modification (voir 7.8).

### 4.5 Rendu et performance

- Carte chargée en entier ; obstacles en `InstancedMesh`, brouillard de distance, pas de génération pendant le jeu.
- Pour les grandes cartes, découpage spatial en blocs de 32 m pour le rendu (culling) et l'activation des groupes.

### 4.6 Fin de zone et extraction

Chaque carte se joue contre un **compte à rebours**. À son terme, la zone se referme et ne pardonne plus.

- **Compte à rebours** : démarre à l'entrée dans l'instance, durée en données par carte (valeur de départ : 20 min), affiché en permanence au HUD.
- **À zéro : évacuation.**
  - L'instance est **verrouillée** : aucun autre joueur ne peut y entrer.
  - Des **vagues** de zombies se déclenchent à intervalle régulier (valeur de départ : toutes les 30 s). Chaque vague est **plus nombreuse et plus forte** que la précédente (nombre et puissance croissent à chaque vague ; types plus dangereux au fil des vagues, selon le niveau de la carte). Les vagues apparaissent hors de l'écran autour des joueurs vivants et sont **déjà en poursuite**.
  - Elles durent **jusqu'à ce que tous les joueurs de la carte soient morts** (ou aient extrait) : l'instance se termine alors.
- **Deux choix** pour le joueur : **rester et affronter** les vagues (kills, XP et butin des vagues, jusqu'à la mort) ou **extraire**.
- **Extraction** : des **points d'extraction** (2 à 3 par carte, placés en données) deviennent actifs à l'évacuation ; il faut y rester quelques secondes (valeur de départ : 5 s) sans être interrompu. Le joueur **repart avec son sac** vers le refuge principal. Mourir en évacuation reste une mort normale (sac perdu, héritage).
- **Multijoueur** : la puissance des vagues tient compte du nombre de joueurs encore présents.
- **Données** : durée, intervalle, croissance (nombre, puissance), types par vague et points d'extraction sont des champs de la carte (`MapDef`) et de `sim/data/`.

## 5. Le compteur mondial

- Affichage permanent en haut de l'écran : `9 998 517 609 Restants` (= `GLOBAL_GOAL` − total éliminé). Seul le nombre d'infectés restants est affiché, jamais l'objectif total.
- Chaque ennemi tué compte pour 1, qu'il soit de n'importe quel type. Seuls les ennemis « réels » comptent (pas les invocations de test).
- **Phase 1** : compteur **local** (le total du joueur), derrière l'interface `KillCounterService` (voir 7.5). Le front n'a pas à changer en phase 2, seule l'implémentation est remplacée.
- **Réalisme de l'objectif** : 10 milliards est un objectif communautaire très ambitieux. Pour qu'il reste motivant :
  - jalons visibles (1 M, 10 M, 100 M, 1 Md, 10 Md) avec un événement ou une récompense cosmétique à chaque palier ;
  - ennemis spéciaux qui comptent pour plus (par exemple un Colosse = 100) à régler selon la fréquentation réelle ;
  - une constante `GLOBAL_GOAL` ajustable.
- Anti-triche (phase 2) : seul le serveur incrémente le compteur, à partir de kills qu'il a lui-même validés.

## 6. Direction artistique et son

- **Style low-poly stylisé** : formes primitives colorées (capsules, boîtes), peu de textures, éclairage simple avec une lumière directionnelle et une ombre douce sous les entités.
- Silhouettes lisibles avant tout : chaque type d'ennemi a une forme et une couleur dominantes différentes. Les projectiles ennemis ont une couleur unique, très contrastée avec le fond (lisibilité du bullet hell).
- Retours visuels : flashs de dégâts, particules de sang vert/noir (non réaliste), tremblement d'écran léger, nombres de dégâts optionnels.
- Son : effets synthétisés (WebAudio) ou assets libres de droits, musique en boucle dont l'intensité suit la densité d'ennemis. Le son vient après les mécaniques (jalon M8).

## 7. Architecture technique

### 7.1 Principes non négociables

1. **La simulation est un module pur** (`src/sim/`), sans dépendance à Three.js, au DOM, à `Date.now()` ni à `Math.random()`. Elle tourne dans un navigateur, dans Node en test, et plus tard sur le serveur.
2. **Pas de rendu dans la sim, pas de sim dans le rendu.** Le rendu lit l'état et les événements, il ne les modifie jamais.
3. **Pas à pas fixe** : la sim avance à 60 Hz par accumulateur (`dt = 1/60` constant). Le rendu interpole entre les deux derniers états.
4. **Toute action du joueur passe par un `InputFrame`**, pas par des appels directs à l'état.
5. **L'état est sérialisable** (snapshot) et les événements sont explicites.
6. **Générateur aléatoire seedé** par flux (spawns, butin, dispersion des tirs), avec un état sauvegardable. Le **monde n'est pas généré** : il est lu depuis une carte fixe (`MapDef`).

### 7.2 Structure du repo

```
someone-remains/
├─ .github/workflows/deploy.yml
├─ index.html  package.json  tsconfig.json  vite.config.ts
├─ PLAN.md  CLAUDE.md  README.md
├─ src/
│  ├─ sim/                       # PUR, testé, partagé avec le futur serveur
│  │  ├─ types.ts                # InputFrame, SimEvent, EntityId, constantes
│  │  ├─ rng.ts                  # PRNG seedé (mulberry32) et flux
│  │  ├─ world/                  # MapDef, chargeur, validation, grille d'obstacles
│  │  ├─ ecs/                    # stockage SoA (typed arrays), pool d'entités
│  │  ├─ systems/                # input, mouvement, collisions, armes, projectiles, IA ennemie
│  │  │                          # (repos / aggro / bruit), groupes, dégâts, XP, mort, sac,
│  │  │                          # caisses de butin, craft
│  │  ├─ data/                   # armes, ennemis, motifs, profils de difficulté, recettes,
│  │  │  │                       # tables de butin, héritage (données pures)
│  │  │  └─ maps/                # cartes fixes (JSON), une par niveau
│  │  ├─ sim.ts                  # createSim(map, seed), step(sim, inputs), snapshot()
│  │  └─ *.test.ts
│  ├─ client/
│  │  ├─ render/                 # scène Three.js, instancing, caméra, particules
│  │  ├─ input/                  # clavier/souris → InputFrame
│  │  ├─ ui/                     # HUD, sac, établi, écran d'héritage, menus (DOM + CSS)
│  │  ├─ mapviewer/              # visualiseur de cartes (?map=<id>)
│  │  ├─ audio/
│  │  ├─ net/                    # LocalTransport (phase 1), WebSocketTransport (phase 2)
│  │  ├─ services/               # KillCounterService, SaveService
│  │  └─ main.ts                 # boucle: accumulateur, interpolation, rendu
│  └─ shared/                    # protocole (phase 2), constantes communes
└─ tools/
   ├─ bench-sim.ts               # banc de performance de la sim en Node
   ├─ validate-maps.ts           # valide les cartes de src/sim/data/maps
   └─ headless.ts                # fait tourner la sim sans rendu
```

### 7.3 Stockage des entités (performance)

Cibles de performance sur un PC moyen : **60 FPS avec ~1 500 ennemis et ~3 000 projectiles actifs**.

- **Structure en tableaux typés (SoA)** pour les données chaudes : `posX/posY`, `velX/velY`, `hp`, `type`, `state`, etc. Pas d'objet par ennemi.
- **Pools de taille fixe** (par exemple 2 500 ennemis, 6 000 projectiles) avec liste libre ; aucune allocation en cours de jeu.
- **Grille spatiale** (spatial hash, cellules de 2 m) reconstruite à chaque tick pour les requêtes de proximité (collisions projectile/ennemi, séparation des ennemis).
- Collisions en **cercles** (ennemis, joueur, projectiles) et **AABB/cercles** pour les obstacles. Résolution par glissement le long des murs.
- IA ennemie légère : machine à états (repos autour du point d'attache / poursuite), direction vers la cible + séparation locale + évitement simple des obstacles. Détection par rayon de vue et rayon de bruit du joueur (distance au carré, sans requête supplémentaire). Pas de pathfinding global en V1 ; champ de potentiel (flow field) en option si les nuées se bloquent sur les bâtiments.
- Budget cible : la sim complète < 4 ms par tick avec la charge maximale (mesuré par `tools/bench-sim.ts`).

### 7.4 Rendu Three.js

- **Caméra** : perspective à champ étroit (FOV ~35°) inclinée à ~60° pour un rendu proche de l'isométrique mais avec de la profondeur ; elle suit le joueur avec un léger amorti.
- **`InstancedMesh`** par type d'ennemi (une draw call par type) et pour les projectiles (billboards ou petites capsules). Matrices mises à jour depuis les tableaux de la sim.
- **Terrain** : sol de la carte avec un matériau simple, décors visuels selon la palette de la carte ; obstacles en instances par type (boîte, cylindre).
- **Ombres** : ombre « blob » (disque sombre sous chaque entité) plutôt qu'ombres dynamiques, beaucoup plus économique.
- **Particules** : pool d'instances pour impacts et morts ; durée de vie courte.
- **Post-traitement** : aucun en V1 (bloom en option plus tard).
- Interpolation : le rendu reçoit `alpha` (fraction d'accumulateur) et mélange la position précédente et courante.
- Suspension du rendu quand l'onglet est caché ; la sim est mise en pause en solo (en multi, voir section 8).

### 7.5 Interfaces pensées pour le multijoueur

```ts
// Entrée du joueur, échantillonnée à chaque tick de sim
interface InputFrame {
  tick: number;
  moveX: number; moveY: number;   // -1..1
  aimAngle: number;               // radians
  buttons: number;                // bitmask: tir, dash, interaction
}

// Ce que la sim émet; rendu, audio, compteur et UI l'écoutent
type SimEvent =
  | { t: 'kill'; enemyType: number; killerId: number; x: number; y: number }
  | { t: 'hit'; targetId: number; dmg: number }
  | { t: 'playerDied'; id: number; kills: number; lifeSeconds: number }
  | { t: 'levelUp'; id: number; choices: number[] }
  | { t: 'spawn' | 'projectile' | 'pickup' /* … */ };

// Transport entre le client et la sim (ou le serveur plus tard)
interface Transport {
  sendInput(frame: InputFrame): void;
  onSnapshot(cb: (snap: Snapshot) => void): void;
  onEvents(cb: (evts: SimEvent[]) => void): void;
}
// Phase 1: LocalTransport (sim dans le même thread, ou dans un Web Worker)
// Phase 2: WebSocketTransport

// Compteur mondial: le front ne connaît que cette interface
interface KillCounterService {
  reportKill(count: number): void;       // appelé depuis les événements 'kill'
  onChange(cb: (total: number, goal: number) => void): void;
}
// Phase 1: LocalKillCounter (compteur personnel persisté)
// Phase 2: RemoteKillCounter (valeur serveur, affichage interpolé)
```

**Option recommandée** : faire tourner la sim dans un **Web Worker** dès la phase 1. Cela libère le thread de rendu et prépare la séparation client/serveur. Si le coût de transfert des états gêne, une `SharedArrayBuffer` est possible mais exige des en-têtes COOP/COEP que GitHub Pages ne fournit pas : à éviter, préférer le transfert de tableaux typés par `postMessage` (transférables).

### 7.6 Données plutôt que code

Armes, ennemis, motifs de projectiles, zones et bonus d'héritage sont des **objets de données** dans `sim/data/`. Équilibrer = modifier des nombres. Les motifs de bullet hell sont décrits par paramètres (nombre de projectiles, angle, vitesse, rotation, délai) et interprétés par un seul système.

### 7.7 Sauvegarde

- `localStorage`, clé `someone-remains-save-v1`, JSON avec champ `version` et fonction `migrate()`.
- Contenu : Rémanence, bonus permanents, statistiques (total de kills, morts, meilleure survie), réglages (touches, volume), **carte courante et dernier refuge**, **stockage du refuge**, plans et armes débloqués, cartes visitées.
- Sauvegarde à chaque mort, chaque dépôt de butin, et toutes les 30 s.
- Export / import en texte (base64) pour changer d'appareil.
- L'état de combat en cours n'est pas sauvegardé en V1 (fermer l'onglet = mort sans pénalité de Rémanence ; à trancher).

### 7.8 Tests

Vitest sur `src/sim/` uniquement :
1. **Déterminisme** : même seed + même suite d'`InputFrame` ⇒ même hash d'état après N ticks.
2. **Pas fixe** : le résultat ne dépend pas de la fréquence d'affichage.
3. **Collisions** : un projectile ne traverse pas un ennemi ni un mur ; un joueur ne traverse pas un obstacle.
4. **Armes** : cadence, dégâts, perforation conformes aux données.
5. **Progression** : XP → niveau ; mort → choix d'héritage → statistiques mises à jour ; plafonds respectés.
6. **Sac et stockage** : sac perdu à la mort, stockage du refuge conservé ; dépôt au refuge.
7. **Cartes** (validateur, lancé en test sur chaque `maps/*.json`) : schéma respecté ; départ, refuges, caisses et passages hors des obstacles et **joignables** depuis le départ ; aucun groupe dans un obstacle ni dans un refuge ; ids uniques.
8. **Charge** : `bench-sim` à 1 500 ennemis / 3 000 projectiles en dessous de 4 ms par tick.
9. **Compteur** : un événement `kill` incrémente exactement une fois.
10. **Aggro** : repos hors de portée, réveil par présence, par bruit (rayon propre à l'arme, décroissance) et par coup reçu ; perte de cible ; les ennemis restent près de leur point d'attache.
11. **Butin et craft** : tirage de la table déterministe ; sac plein refusé ; mort = sac perdu, stockage conservé ; recette consomme exactement ses entrées ; munitions décomptées ; sans munitions aucun tir à distance, corps à corps toujours possible ; cooldown des caisses.
12. **Fin de zone** : le compte à rebours verrouille l'instance ; chaque vague est strictement plus forte (nombre, puissance) que la précédente ; l'extraction conserve le sac ; l'instance se termine sans joueur.

## 8. Préparation du multijoueur (contraintes à respecter dès la phase 1)

- **Pas de pause du monde en multi** : la touche `Échap` ouvre un menu mais la sim continue. En solo, la pause est permise via un drapeau de la sim.
- **Une entité = un identifiant** stable avec génération (pour éviter qu'un identifiant réutilisé soit confondu avec un ancien).
- **Aucune dépendance globale** : tout l'état est dans l'objet `sim`, instanciable plusieurs fois (serveur avec plusieurs instances).
- **Plusieurs joueurs dans la sim dès le départ** : la structure gère un tableau de joueurs, même si la phase 1 n'en a qu'un. Les systèmes ne supposent jamais « le joueur ».
- **Butin et XP par joueur** (instanciés) pour éviter les conflits de ramassage.
- **Pas de tir ami** : les projectiles joueurs n'infligent pas de dégâts aux joueurs.
- **Caisses de butin et groupes d'ennemis** : état partagé par instance ; une caisse ne peut être vidée que par un seul joueur ; le bruit d'un joueur peut réveiller des ennemis qui en poursuivent un autre.
- **Événements** ordonnés par tick, sans référence au rendu.

## 9. Phase 2 : multijoueur (esquisse)

**Architecture** : GitHub Pages continue de servir le client statique ; un **serveur de jeu** distinct héberge les instances.

| Brique | Option recommandée | Alternative |
|---|---|---|
| Serveur de jeu | Node.js + TypeScript, WebSocket (bibliothèque `ws`), **réutilise `src/sim/` à l'identique** | Colyseus (salles, état synchronisé) |
| Compteur mondial | Service d'agrégation (Cloudflare Durable Object, ou Redis) | Base SQL légère |
| Hébergement | Fly.io / Railway / VPS | Cloudflare Workers + Durable Objects |
| Comptes | Anonyme par jeton signé, comptes plus tard | OAuth (Discord, Google) |

Vous développez déjà en Ktor côté serveur : un serveur Kotlin est possible, mais il obligerait à **réécrire la simulation** (aucun partage de code avec le client TypeScript, plus de risques de divergence). Garder un serveur en TypeScript est nettement plus économique pour ce jeu.

**Réseau**
- Serveur **autoritatif** à 30 Hz ; snapshots à 15 à 20 Hz, **binaires** et **delta-compressés**.
- **Interest management** : un client ne reçoit que les entités à portée de sa vue (grille).
- Prédiction côté client pour le joueur local (rejeu des entrées non acquittées), interpolation pour les autres entités avec ~100 ms de retard.
- Instances de 20 à 50 joueurs, remplies et créées par un « matchmaker » simple (le joueur rejoint l'instance la plus remplie non pleine).
- Les ennemis sont gérés par le serveur ; leur nombre reste sous un plafond par instance.

**Compteur mondial**
- Chaque instance envoie des deltas de kills toutes les 5 s à l'agrégateur.
- Validation : plafond de kills par joueur et par seconde, rejet des valeurs aberrantes.
- Diffusion du total toutes les 2 à 5 s ; le client interpole l'affichage pour un rendu fluide.

**Coûts et risques** : serveur à payer, modération des pseudos, anti-triche, latence selon la région. À budgéter avant de s'engager.

## 10. Jalons de la phase 1 (offline)

**M0 : Scaffold et déploiement.** *(livré, lot 1)* Vite + TS strict + Three.js, un cube qui tourne, workflow GitHub Actions → Pages.
*Acceptation* : l'URL Pages affiche la scène ; `npm run build` sans erreur TS.

**M1 : Cœur de simulation.** *(livré, lot 2)* `rng`, stockage SoA, pool d'entités, pas fixe, grille spatiale, mouvement et collisions du joueur, `InputFrame`, événements. Premiers tests (déterminisme, collisions).
*Acceptation* : `npm test` vert ; `tools/headless.ts` fait tourner 10 000 ticks avec un joueur scripté sans erreur.

**M2 : Rendu et caméra.** *(livré, lot 2)* Scène Three.js, caméra de suivi, terrain plat, joueur contrôlable au clavier, boucle avec interpolation, sim dans un Web Worker.
*Acceptation* : déplacement fluide à 60 FPS ; l'affichage est stable à 30, 60 et 144 Hz.

**M3 : Combat de base.** *(livré, lots 3 et 3.1)* Pistolet, projectiles, rôdeurs, dégâts, mort des ennemis, esquive, mort et réapparition du joueur, instancing ; puis **ennemis au repos, aggro par présence, par bruit et par coup reçu** (section 3.1).
*Acceptation* : 500 rôdeurs et 1 000 projectiles à 60 FPS ; événements `kill` émis ; un ennemi hors de portée n'attaque pas ; un tir réveille bien plus loin que la simple présence.

**M4 : Ennemis et bullet hell.** *(livré, lot 4)* Les 7 types (rayons de vue et sensibilité au bruit propres à chacun), motifs de projectiles par données, Souche, Colosse, Hurleur (alerte les ennemis proches).
*Acceptation* : chaque type est reconnaissable ; les motifs sont paramétrables dans `data/` ; banc à 1 500 ennemis et 3 000 projectiles sous 4 ms.

**M5 : Cartes fixes.** `MapDef` et son chargeur, validateur (`tools/validate-maps.ts` + test), visualiseur `?map=<id>`, profils de difficulté (types, puissance, densité), groupes d'ennemis activés à l'approche, refuges (zone sûre, point de réapparition). Première carte **« Campagne »** (niveau 1) conçue avec vous. Remplace les obstacles de test et l'apparition ambiante provisoire.
*Acceptation* : la carte 1 se charge depuis son JSON et se joue ; le validateur est vert ; le visualiseur montre tous les calques ; les groupes se réveillent selon 3.1 ; aucun ennemi n'entre dans un refuge ; le profil de la carte change PV et dégâts des ennemis.

**M6 : Butin et ressources.** Sac à emplacements, ressources, munitions consommées par les armes (sans munition, pas de tir), **corps à corps de départ au clic droit** (barre de fer), caisses de butin interactives (`E`, bruit à l'ouverture), tables de butin par palier, cooldown de remplissage des caisses, petits butins d'ennemis, HUD du sac et des munitions.
*Acceptation* : ouvrir une caisse remplit le sac selon sa table (déterministe) ; tirer consomme les munitions ; sans munitions, l'arme à distance ne tire plus mais le corps à corps fonctionne ; la caisse se remplit de nouveau après son cooldown ; sac plein géré.

**M7 : Craft et armes.** Stockage et établi du refuge, recettes (munitions, soins, armes), plans, les 5 armes à distance avec leurs munitions et leur bruit, les 3 armes de corps à corps, changement d'arme.
*Acceptation* : on peut fabriquer des munitions et une arme à partir du butin ; chaque arme a un comportement distinct (cadence, dispersion, perforation, arc de corps à corps, bruit) ; les recettes consomment exactement leurs entrées.

**M8 : Progression.** XP, niveaux de vie avec choix de 3 améliorations, écran de mort, **perte du sac à la mort**, Rémanence et choix d'héritage permanent, sauvegarde (stockage, plans, carte, dernier refuge).
*Acceptation* : mourir puis revenir donne un personnage mesurablement plus fort ; le sac est perdu, le stockage conservé ; sauvegarde et rechargement fidèles.

**M9 : Fin de zone et extraction.** Compte à rebours de la carte (HUD), verrouillage de l'instance, vagues croissantes (nombre, puissance, types) jusqu'à la mort de tous les joueurs, points d'extraction (sac conservé), fin d'instance.
*Acceptation* : à zéro, l'instance se verrouille et les vagues démarrent ; chaque vague est strictement plus forte que la précédente ; l'extraction ramène le joueur au refuge avec son sac ; l'instance se termine quand il n'y a plus de joueur ; comportement déterministe.

**M10 : Enchaînement des cartes.** Passages entre cartes, refuges multiples, retour aux cartes précédentes, cartes 2 à 6 conçues avec vous (Village, Banlieue, Centre-ville, Zone industrielle, Zone militaire) : **un sous-lot par carte** (9a, 9b…), chacun validé avant le suivant.
*Acceptation* : on traverse tout le jeu de la campagne à la zone militaire ; la difficulté croît de carte en carte (types, puissance, densité) ; chaque carte a sa fin de zone ; chaque carte passe le validateur.

**M11 : Compteur mondial local et HUD.** `KillCounterService` (local), HUD complet, jalons du compteur, statistiques de vie.
*Acceptation* : chaque `kill` incrémente le compteur une seule fois ; l'implémentation est remplaçable sans toucher au HUD.

**M12 : Polish et équilibrage.** Particules, son, réglages (touches, volume), équilibrage par script (économie de munitions, courbe de puissance), README, page de présentation.
*Acceptation* : 30 minutes de jeu continues sans bug bloquant ; courbe de difficulté et de puissance cohérente ; build propre.

**M13 : Préparation réseau.** `Transport` abstrait, sérialisation binaire des snapshots, serveur de test local (Node) qui exécute la même sim, deux clients en loopback.
*Acceptation* : deux navigateurs sur la même instance locale se voient et leurs kills s'additionnent dans un compteur commun. C'est la porte d'entrée de la phase 2.

### 10.1 Livraison par lots

Chaque lot est poussé sur `main` (déclenche le déploiement GitHub Pages) pour être testé en ligne avant de passer au suivant. On ne démarre pas un lot sans accord sur le précédent.

| Lot | Jalon(s) | État | Ce qu'on teste sur l'URL Pages |
|---|---|---|---|
| 1 | M0 | livré | Scène Three.js (cube qui tourne), pipeline CI/CD |
| 2 | M1 + M2 | livré | Déplacement au clavier, caméra de suivi, fluidité (sim dans un Web Worker) |
| 3 | M3 | livré | Tir à la souris, rôdeurs, esquive, mort ; charge de 500 ennemis (`?horde=500`) |
| 3.1 | M3 (retours) | livré | Ennemis au repos, réveil par présence et par bruit de tir, anneaux de portée |
| 4 | M4 | livré | Les 7 types d'ennemis, bullet hell, Souche, Colosse, Hurleur |
| 5 | M5 | à venir | Carte 1 « Campagne » (à concevoir ensemble), visualiseur de carte, refuge, groupes de zombies |
| 6 | M6 | à venir | Caisses de butin, sac, munitions consommées, corps à corps |
| 7 | M7 | à venir | Établi, craft de munitions et d'armes, 5 armes à distance, 3 de corps à corps |
| 8 | M8 | à venir | XP, niveaux, mort, héritage, sauvegarde |
| 9 | M9 | à venir | Compte à rebours, vagues d'évacuation, extraction |
| 10 | M10 (10a…10e) | à venir | Une carte de plus par sous-lot, passages entre cartes |
| 11 | M11 | à venir | Compteur et HUD complet |
| 12 | M12 | à venir | Particules, son, réglages, équilibrage |
| 13 | M13 | à venir | Préparation réseau (test local à deux clients) |

## 11. CI/CD

- `.github/workflows/deploy.yml` : sur push `main` → `npm ci` → `npm test` → `npm run build` (tsc + vite) → `upload-pages-artifact` (dossier `dist`) → `deploy-pages`.
- Permissions : `contents: read`, `pages: write`, `id-token: write`.
- Réglage unique : **Settings → Pages → Source : GitHub Actions**.
- `vite.config.ts` : `base: './'` pour fonctionner sous `user.github.io/nom-du-repo/`.
- Découpage du code : Three.js dans un chunk séparé (`manualChunks`), cible < 500 Ko gzip pour le premier chargement.

## 12. Risques

| Risque | Mitigation |
|---|---|
| Performances (nuées + projectiles) | SoA, pools, grille spatiale, instancing, banc dès M1, Web Worker |
| Sim qui diverge entre client et serveur | Un seul code partagé `src/sim/`, tests de déterminisme |
| Objectif de 10 Md inatteignable et démotivant | Jalons, kills pondérés, constante `GLOBAL_GOAL` |
| Équilibrage de la Rémanence | Rendements décroissants, plafonds, données ajustables, script de simulation |
| Lisibilité du bullet hell en 3D | Couleurs contrastées dédiées aux projectiles ennemis, caméra proche de l'ortho, indicateurs d'attaque |
| Coût serveur en phase 2 | Plafond d'instances, arrêt automatique des instances vides, commencer petit |
| Complexité du réseau trop tôt | Ne pas écrire de réseau avant M13 ; seulement respecter les contraintes de la section 8 |
| Conception des cartes à la main longue | Format JSON simple, visualiseur, validateur automatique, première carte petite, éditeur intégré en option |
| Économie de munitions (blocage ou abondance) | Corps à corps toujours disponible, tables de butin en données, script de simulation d'économie (M12) |
| Aggro peu lisible ou injuste | Anneaux de portée, ennemis alertés visibles, rayons en données, mode debug |
| Réveil en cascade de grands groupes | Groupes activés à l'approche, alerte du Hurleur plafonnée, rayons de bruit modérés |
| Création d'assets 3D | Primitives low-poly en V1 ; remplacement par du glTF plus tard sans toucher à la sim |

## 13. Conventions pour Claude Code

- TypeScript strict, pas de `any`. Imports relatifs.
- `src/sim/` n'importe **jamais** `three`, ni du DOM, ni `Date.now`/`Math.random`. Une règle ESLint ou un test d'import doit le garantir.
- Constantes d'équilibrage nommées et exportées, regroupées dans `sim/data/`.
- Les cartes sont des **données** (`sim/data/maps/*.json`) validées par un test ; aucune carte n'est générée à l'exécution.
- Un commit par jalon (ou plus fin), `npm test` et `npm run build` verts avant chaque commit.
- Pas d'allocation dans les boucles chaudes de la sim et du rendu (pas de `new`, pas de tableaux temporaires par tick).

## 14. Questions ouvertes (non bloquantes, valeur par défaut proposée)

1. **Nom et ton** : le jeu s'appelle **Someone Remains** (comme le repo). Ton : sombre avec une touche d'ironie dans les textes.
2. **Armes** : choix manuel parmi un inventaire, ou arme unique évolutive ? *Défaut : jusqu'à 3 armes équipées, tirage via la montée de niveau.*
3. **Coopération** : revive entre joueurs, ressources partagées ? *Défaut : pas de revive en V1 multi ; les joueurs se soutiennent par le nombre.*
4. **PvP** : aucun. *Défaut : coopération pure.*
5. **Assets** : primitives low-poly ou modèles glTF libres (Kenney, Quaternius) ? *Défaut : primitives, glTF en M12 si le temps le permet.*
6. **Mort avec onglet fermé** : pénalité ou non ? *Défaut : aucune.*
7. **Objectif du compteur** : exactement 10 Md, avec ou sans pondération des kills spéciaux ? *Défaut : pondération légère pour les boss.*
8. **Budget serveur** pour la phase 2 : à fixer avant M13.
9. **Taille des cartes** : *Défaut : 400 × 400 m pour la carte 1, jusqu'à 800 m ensuite.*
10. **Nombre de cartes en V1** : *Défaut : 6 (une par niveau de la section 4.1), en commençant par la carte 1 seule.*
11. **Mort** : récupérer le sac sur le lieu de la mort ? *Défaut : non, le sac est perdu.*
12. **Sans munitions** : *Décidé : plus de tir ; le corps à corps (clic droit) reste disponible.*
13. **Rechargement manuel** : *Défaut : non, simple réserve de munitions.*
14. **Remplissage** : *Décidé : simple cooldown sur les caisses ; les groupes d'ennemis ne réapparaissent pas pour l'instant.*
15. **Retour aux cartes précédentes** : *Défaut : oui, par les passages ; chaque refuge atteint devient le point de réapparition.*
16. **Éditeur de carte intégré** : *Défaut : JSON écrit à la main + visualiseur ; décision après la carte 1.*
17. **Seed** : *Défaut : conservée uniquement pour l'aléatoire de la sim (butin, dispersion), plus pour le monde.*
18. **Fin de zone** : durée du compte à rebours *(défaut : 20 min sur la carte 1)*, intervalle des vagues *(défaut : 30 s)*, croissance *(défaut : +15 % d'ennemis et +10 % de puissance par vague)*, durée d'extraction *(défaut : 5 s)*.
19. **Extraction avant la fin du compte à rebours** : *Défaut : non, seuls les passages de la carte sont disponibles ; les points d'extraction s'ouvrent à l'évacuation.*

## 15. Prompt de démarrage pour Claude Code

> Lis `PLAN.md` en entier. Réalise le jalon demandé dans l'ordre en respectant les conventions de la section 13 et les principes de la section 7.1. À la fin de chaque jalon, vérifie les critères d'acceptation, commite, puis résume ce qu'il reste avant de passer au suivant. Ne dépasse pas ce jalon sans mon accord.
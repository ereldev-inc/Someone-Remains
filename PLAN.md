# SEPT MILLIARDS — Plan de conception (titre de travail)

Jeu d'action 3D vue du dessus, nerveux, proche du bullet hell, avec un personnage persistant qui revient plus fort à chaque mort. Tous les joueurs partagent le même monde et alimentent un **compteur mondial d'infectés éliminés** (objectif : 7 000 000 000).

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
| Build / déploiement | Vite + TypeScript strict + GitHub Actions → GitHub Pages (comme La Horde) |

## 1. Pitch et fantasme du joueur

Un virus a infecté toute l'humanité. Vous faites partie des rares survivants et le seul remède est radical : il faut éliminer les 7 milliards d'infectés. Chaque tir compte, chaque mort aussi : vous revenez toujours un peu plus fort.

**Les trois piliers**
1. **Nervosité** : déplacements rapides, esquive, tirs en continu, projectiles ennemis à éviter. Une partie se joue aux réflexes et au placement.
2. **Puissance croissante** : l'écran se remplit d'ennemis et de projectiles, et le joueur devient un rouleau compresseur qui finit par tomber face à plus gros que lui.
3. **Effort collectif** : le compteur mondial donne du sens à chaque kill, même sur une session de 5 minutes.

## 2. Boucle de jeu

```
Apparition (zone sûre) → exploration / combat → XP et butin
        → montée en niveau (bonus temporaires) → mort
        → écran d'héritage : choix d'un bonus permanent
        → réapparition plus forte, retour dans la zone sûre
```

### 2.1 Deux couches de progression

| Couche | Durée de vie | Source | Exemples |
|---|---|---|---|
| **Niveau de vie** | Perdue à la mort | XP gagnée en tuant | choix parmi 3 améliorations d'arme, vitesse de tir, dégâts, projectiles perforants |
| **Rémanence** (héritage) | Permanente | gagnée à chaque mort, selon kills et temps de survie | +PV max, +dégâts, +vitesse, +ramassage, emplacements d'armes, nouvelles armes de départ |

À la mort, le joueur choisit **1 bonus permanent parmi 3** (tirage aléatoire pondéré), pour que chaque mort ait une saveur de décision.

### 2.2 Tension : pourquoi mourir fait mal malgré le bonus

- Le **butin non banké** est perdu (voir 2.3).
- Le niveau de vie retombe à 1 : la puissance de la minute précédente disparaît.
- Un **temps de réapparition** court (5 à 10 s) et un retour en zone sûre loin de l'action.
- Les ennemis évoluent selon la **zone** et le **temps de présence**, pas selon la Rémanence du joueur, donc la difficulté ne s'écroule pas.

### 2.3 Banque du butin

Le joueur ramasse de la **charge virale** (ressource) qu'il doit rapporter en zone sûre pour la déposer. Mort en route = perte. Cela crée le risque/récompense de la zone dangereuse sans revenir à un système de runs.

### 2.4 Garde-fous de progression

- Rendements décroissants sur les bonus de Rémanence (par exemple +10 %, +8 %, +6 % …).
- Plafonds par statistique.
- Pas de bonus qui supprime la lecture des projectiles ennemis (par exemple invulnérabilité permanente).

## 3. Combat

**Contrôles (desktop)**
- `ZQSD` ou `WASD` : déplacement (disposition configurable)
- Souris : visée ; clic gauche maintenu : tir
- `Espace` : esquive (dash) avec invulnérabilité courte et recharge de 1,5 à 3 s
- `E` : interaction (dépôt de butin, coffres)
- `Échap` : pause (le jeu continue en multi, voir section 8)
- La **direction de tir est contrôlée à la souris** : le personnage vise toujours le curseur (angle calculé entre le joueur et le point visé au sol), sans visée automatique ni assistance

**Armes (V1 : 5)** : pistolet (précis), fusil à pompe (cône courte portée), mitraillette (cadence), lance-flammes (zone continue), arbalète (perforant). Chaque arme a 3 à 4 améliorations propres, tirées lors des montées de niveau.

**Ennemis (V1 : 7 types)**

| Type | Comportement | Menace |
|---|---|---|
| Rôdeur | Fonce en ligne droite | Nuée, saturation de l'écran |
| Coureur | Rapide, trajectoire en zigzag | Pression de déplacement |
| Brute | Lente, charge après un signal visuel | Gros dégâts, esquive à timer |
| Cracheur | Garde ses distances, tire des projectiles | Bullet hell de base |
| Explosif | Court puis explose en zone | Contrôle de l'espace |
| Hurleur | Renforce les ennemis proches et en appelle d'autres | Priorité de cible |
| Colosse (mini-boss) | Motifs de projectiles en rafales et en spirales | Moment fort d'une zone |

**Bullet hell** : les projectiles ennemis suivent des motifs paramétrés (anneau, éventail, spirale, rafale ciblée) définis par données, pas par code ad hoc. Les cracheurs et les boss en sont la source.

**Nid (« Souche »)** : structure qui génère des ennemis en continu. La détruire donne beaucoup d'XP et nettoie la zone un moment.

## 4. Monde

- **Carte générée par seed** : la même seed pour tous les joueurs. En multijoueur, tous voient donc la même carte sans transfert.
- **Découpage en chunks** de 32 × 32 mètres, chargés autour du joueur (rayon de 3 à 4 chunks) et déchargés derrière.
- **Zones** (biomes de danger croissant en s'éloignant de la zone sûre) : périphérie, banlieue, centre-ville, zone industrielle, zone militaire. Chacune a sa densité, sa palette d'ennemis, sa palette visuelle.
- **Éléments** : bâtiments et obstacles (boîtes et cylindres, collisions simples), véhicules en travers de la route (couvertures), coffres, fontaines de soin (rares).
- **Zone sûre** : un camp central où l'on dépose le butin, dépense la Rémanence en ressources et change d'équipement. Aucun ennemi n'y entre.
- **Taille** : carte de 4 × 4 km en V1 (environ 125 × 125 chunks), pas de limites visibles : mur de brouillard et gradient de danger.

## 5. Le compteur mondial

- Affichage permanent en haut de l'écran : `1 482 391 / 7 000 000 000 infectés éliminés`.
- Chaque ennemi tué compte pour 1, qu'il soit de n'importe quel type. Seuls les ennemis « réels » comptent (pas les invocations de test).
- **Phase 1** : compteur **local** (le total du joueur), derrière l'interface `KillCounterService` (voir 7.5). Le front n'a pas à changer en phase 2, seule l'implémentation est remplacée.
- **Réalisme de l'objectif** : 7 milliards est un objectif communautaire très ambitieux. Pour qu'il reste motivant :
  - jalons visibles (1 M, 10 M, 100 M, 1 Md, 7 Md) avec un événement ou une récompense cosmétique à chaque palier ;
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
6. **Générateur aléatoire seedé** par flux (monde, spawns, butin), avec un état sauvegardable.

### 7.2 Structure du repo

```
sept-milliards/
├─ .github/workflows/deploy.yml
├─ index.html  package.json  tsconfig.json  vite.config.ts
├─ PLAN.md  CLAUDE.md  README.md
├─ src/
│  ├─ sim/                       # PUR, testé, partagé avec le futur serveur
│  │  ├─ types.ts                # InputFrame, SimEvent, EntityId, constantes
│  │  ├─ rng.ts                  # PRNG seedé (mulberry32) et flux
│  │  ├─ world/                  # génération du monde par seed, chunks, obstacles
│  │  ├─ ecs/                    # stockage SoA (typed arrays), pool d'entités
│  │  ├─ systems/                # input, mouvement, collisions, armes, projectiles,
│  │  │                          # IA ennemie, spawn, dégâts, XP, mort, banque
│  │  ├─ data/                   # armes, ennemis, motifs, zones, héritage (données pures)
│  │  ├─ sim.ts                  # createSim(seed), step(sim, inputs), snapshot()
│  │  └─ *.test.ts
│  ├─ client/
│  │  ├─ render/                 # scène Three.js, instancing, caméra, particules
│  │  ├─ input/                  # clavier/souris → InputFrame
│  │  ├─ ui/                     # HUD, écran d'héritage, menus (DOM + CSS)
│  │  ├─ audio/
│  │  ├─ net/                    # LocalTransport (phase 1), WebSocketTransport (phase 2)
│  │  ├─ services/               # KillCounterService, SaveService
│  │  └─ main.ts                 # boucle: accumulateur, interpolation, rendu
│  └─ shared/                    # protocole (phase 2), constantes communes
└─ tools/
   ├─ bench-sim.ts               # banc de performance de la sim en Node
   └─ headless.ts                # fait tourner la sim sans rendu
```

### 7.3 Stockage des entités (performance)

Cibles de performance sur un PC moyen : **60 FPS avec ~1 500 ennemis et ~3 000 projectiles actifs**.

- **Structure en tableaux typés (SoA)** pour les données chaudes : `posX/posY`, `velX/velY`, `hp`, `type`, `state`, etc. Pas d'objet par ennemi.
- **Pools de taille fixe** (par exemple 2 500 ennemis, 6 000 projectiles) avec liste libre ; aucune allocation en cours de jeu.
- **Grille spatiale** (spatial hash, cellules de 2 m) reconstruite à chaque tick pour les requêtes de proximité (collisions projectile/ennemi, séparation des ennemis).
- Collisions en **cercles** (ennemis, joueur, projectiles) et **AABB/cercles** pour les obstacles. Résolution par glissement le long des murs.
- IA ennemie légère : direction vers la cible + séparation locale + évitement simple des obstacles. Pas de pathfinding global en V1 ; champ de potentiel (flow field) en option si les nuées se bloquent sur les bâtiments.
- Budget cible : la sim complète < 4 ms par tick avec la charge maximale (mesuré par `tools/bench-sim.ts`).

### 7.4 Rendu Three.js

- **Caméra** : perspective à champ étroit (FOV ~35°) inclinée à ~60° pour un rendu proche de l'isométrique mais avec de la profondeur ; elle suit le joueur avec un léger amorti.
- **`InstancedMesh`** par type d'ennemi (une draw call par type) et pour les projectiles (billboards ou petites capsules). Matrices mises à jour depuis les tableaux de la sim.
- **Terrain** : plan par chunk avec un matériau simple ; obstacles en instances par type (boîte, cylindre).
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

- `localStorage`, clé `sept-milliards-save-v1`, JSON avec champ `version` et fonction `migrate()`.
- Contenu : Rémanence, bonus permanents, statistiques (total de kills, morts, meilleure survie), réglages (touches, volume), seed du monde, et **butin banké**.
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
6. **Banque** : butin perdu à la mort, conservé après dépôt.
7. **Monde** : un chunk généré deux fois est identique ; pas d'obstacle sur la zone sûre.
8. **Charge** : `bench-sim` à 1 500 ennemis / 3 000 projectiles en dessous de 4 ms par tick.
9. **Compteur** : un événement `kill` incrémente exactement une fois.

## 8. Préparation du multijoueur (contraintes à respecter dès la phase 1)

- **Pas de pause du monde en multi** : la touche `Échap` ouvre un menu mais la sim continue. En solo, la pause est permise via un drapeau de la sim.
- **Une entité = un identifiant** stable avec génération (pour éviter qu'un identifiant réutilisé soit confondu avec un ancien).
- **Aucune dépendance globale** : tout l'état est dans l'objet `sim`, instanciable plusieurs fois (serveur avec plusieurs instances).
- **Plusieurs joueurs dans la sim dès le départ** : la structure gère un tableau de joueurs, même si la phase 1 n'en a qu'un. Les systèmes ne supposent jamais « le joueur ».
- **Butin et XP par joueur** (instanciés) pour éviter les conflits de ramassage.
- **Pas de tir ami** : les projectiles joueurs n'infligent pas de dégâts aux joueurs.
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

**M0 : Scaffold et déploiement.** Vite + TS strict + Three.js, un cube qui tourne, workflow GitHub Actions → Pages.
*Acceptation* : l'URL Pages affiche la scène ; `npm run build` sans erreur TS.

**M1 : Cœur de simulation.** `rng`, stockage SoA, pool d'entités, pas fixe, grille spatiale, mouvement et collisions du joueur, `InputFrame`, événements. Premiers tests (déterminisme, collisions).
*Acceptation* : `npm test` vert ; `tools/headless.ts` fait tourner 10 000 ticks avec un joueur scripté sans erreur.

**M2 : Rendu et caméra.** Scène Three.js, caméra de suivi, terrain plat, joueur contrôlable au clavier, boucle avec interpolation, sim dans un Web Worker.
*Acceptation* : déplacement fluide à 60 FPS ; l'affichage est stable à 30, 60 et 144 Hz.

**M3 : Combat de base.** Pistolet, projectiles, rôdeurs, dégâts, mort des ennemis, esquive, mort du joueur, instancing des ennemis et projectiles.
*Acceptation* : 500 rôdeurs et 1 000 projectiles à 60 FPS ; événements `kill` émis.

**M4 : Ennemis et bullet hell.** Les 7 types, motifs de projectiles par données, Souche, Colosse, Hurleur.
*Acceptation* : chaque type est reconnaissable ; les motifs sont paramétrables dans `data/` ; banc à 1 500 ennemis et 3 000 projectiles sous 4 ms.

**M5 : Progression.** XP, niveaux de vie avec choix de 3 améliorations, écran de mort, Rémanence et choix d'héritage permanent, banque du butin, zone sûre, sauvegarde.
*Acceptation* : mourir puis revenir donne un personnage mesurablement plus fort ; la perte de butin non banké est appliquée ; sauvegarde et rechargement fidèles.

**M6 : Monde.** Génération par seed, chunks chargés/déchargés, zones de danger, obstacles et couvertures, brouillard de bord.
*Acceptation* : traverser la carte sans à-coups ; un même seed donne la même carte ; aucune génération visible dans le champ de vision.

**M7 : Compteur mondial local et HUD.** `KillCounterService` (local), HUD complet, jalons du compteur, statistiques de vie.
*Acceptation* : chaque `kill` incrémente le compteur une seule fois ; l'implémentation est remplaçable sans toucher au HUD.

**M8 : Polish et équilibrage.** Armes restantes, particules, son, réglages (touches, volume), équilibrage par script, README, page de présentation.
*Acceptation* : 30 minutes de jeu continues sans bug bloquant ; courbe de difficulté et de puissance cohérente ; build propre.

**M9 : Préparation réseau.** `Transport` abstrait, sérialisation binaire des snapshots, serveur de test local (Node) qui exécute la même sim, deux clients en loopback.
*Acceptation* : deux navigateurs sur la même instance locale se voient et leurs kills s'additionnent dans un compteur commun. C'est la porte d'entrée de la phase 2.

### 10.1 Livraison par lots

Chaque lot est poussé sur `main` (déclenche le déploiement GitHub Pages) pour être testé en ligne avant de passer au suivant. On ne démarre pas un lot sans accord sur le précédent.

| Lot | Jalons | Ce qu'on teste sur l'URL Pages |
|---|---|---|
| 1 | M0 | Scène Three.js (cube qui tourne), pipeline CI/CD |
| 2 | M1 + M2 | Personnage déplaçable au clavier, caméra de suivi, fluidité (sim dans un Web Worker) |
| 3 | M3 | Tir à la souris, rôdeurs, esquive, mort ; charge de 500 ennemis |
| 4 | M4 | Les 7 types d'ennemis, bullet hell, Souche, Colosse |
| 5 | M5 | XP, niveaux, mort, héritage, butin, zone sûre, sauvegarde |
| 6 | M6 | Monde par seed, chunks, zones de danger |
| 7 | M7 | Compteur et HUD complet |
| 8 | M8 | Armes restantes, particules, son, réglages, équilibrage |
| 9 | M9 | Préparation réseau (test local à deux clients) |

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
| Objectif de 7 Md inatteignable et démotivant | Jalons, kills pondérés, constante `GLOBAL_GOAL` |
| Équilibrage de la Rémanence | Rendements décroissants, plafonds, données ajustables, script de simulation |
| Lisibilité du bullet hell en 3D | Couleurs contrastées dédiées aux projectiles ennemis, caméra proche de l'ortho, indicateurs d'attaque |
| Coût serveur en phase 2 | Plafond d'instances, arrêt automatique des instances vides, commencer petit |
| Complexité du réseau trop tôt | Ne pas écrire de réseau avant M9 ; seulement respecter les contraintes de la section 8 |
| Création d'assets 3D | Primitives low-poly en V1 ; remplacement par du glTF plus tard sans toucher à la sim |

## 13. Conventions pour Claude Code

- TypeScript strict, pas de `any`. Imports relatifs.
- `src/sim/` n'importe **jamais** `three`, ni du DOM, ni `Date.now`/`Math.random`. Une règle ESLint ou un test d'import doit le garantir.
- Constantes d'équilibrage nommées et exportées, regroupées dans `sim/data/`.
- Un commit par jalon (ou plus fin), `npm test` et `npm run build` verts avant chaque commit.
- Pas d'allocation dans les boucles chaudes de la sim et du rendu (pas de `new`, pas de tableaux temporaires par tick).

## 14. Questions ouvertes (non bloquantes, valeur par défaut proposée)

1. **Nom et ton** : sérieux et sombre, ou humour noir (comme La Horde) ? *Défaut : sombre avec une touche d'ironie dans les textes.*
2. **Armes** : choix manuel parmi un inventaire, ou arme unique évolutive ? *Défaut : jusqu'à 3 armes équipées, tirage via la montée de niveau.*
3. **Coopération** : revive entre joueurs, ressources partagées ? *Défaut : pas de revive en V1 multi ; les joueurs se soutiennent par le nombre.*
4. **PvP** : aucun. *Défaut : coopération pure.*
5. **Assets** : primitives low-poly ou modèles glTF libres (Kenney, Quaternius) ? *Défaut : primitives, glTF en M8 si le temps le permet.*
6. **Mort avec onglet fermé** : pénalité ou non ? *Défaut : aucune.*
7. **Objectif du compteur** : exactement 7 Md, avec ou sans pondération des kills spéciaux ? *Défaut : pondération légère pour les boss.*
8. **Budget serveur** pour la phase 2 : à fixer avant M9.

## 15. Prompt de démarrage pour Claude Code

> Lis `PLAN.md` en entier. Réalise les jalons M0 et M1 dans l'ordre en respectant les conventions de la section 13 et les principes de la section 7.1. À la fin de chaque jalon, vérifie les critères d'acceptation, commite, puis résume ce qu'il reste avant de passer au suivant. Ne dépasse pas M1 sans mon accord.

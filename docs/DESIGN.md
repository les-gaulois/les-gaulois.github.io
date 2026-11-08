# Design du site [GAL] Les Gaulois

## Intention

Un univers de jeu sombre plutôt qu'une simple page de statistiques. Le guerrier du logo occupe la scène d'ouverture, de grands titres en capitales donnent le ton, et chaque grande section devient une scène avec son propre décor.

Cette approche s'inspire de la façon dont les grands sites de la culture gaming construisent leurs pages : environnement immersif, titres massifs, un seul bouton fort, profondeur par la couleur. Elle ne reprend ni la marque, ni la couleur, ni les polices propriétaires, ni les visuels d'un autre site. L'identité reste celle du clan : bleu, blanc, rouge et son guerrier gaulois. Aucune référence à des personnages ou visuels protégés.

## Organisation du site

Le visiteur doit savoir où chercher, et avoir une raison de revenir. Le plan est dans `src/lib/nav.ts`, et le README en donne le tableau.

- **Sept rubriques au plus dans le menu, six aujourd'hui.** Une rubrique répond à une question : que s'est-il passé, où en est-on, qui sommes-nous, la carte, comment jouer, comment entrer. Son nom ne doit pas se confondre avec un autre : « Guides » plutôt que « Jouer », à cause du bouton « Jouer à OpenFront ».
- **Des onglets dans chaque rubrique.** `SectionNav.astro` les place en haut de page : on passe d'une page à l'autre sans repasser par le menu.
- **Un contenu, une page.** L'accueil résume et renvoie ; il ne recopie pas un bloc entier. Une autre page peut citer un chiffre, en renvoyant à sa page.
- **Le chiffre d'abord, l'explication à la demande.** Les précisions de méthode sont dans `ReadingNote.astro`, repliées mais dans le HTML. Ce qui doit rester visible ne s'y met jamais : mentions de licence, couverture de la lecture, pannes et suspensions, et ce qui change la lecture d'un chiffre, comme sa période, le périmètre des parties ou la réserve sur un taux.
- **Une page courte.** Une longue liste montre ses premières lignes et garde le reste à portée : 25 clans au classement, 25 parties dans le journal, les chapitres du guide en sommaire qui s'ouvre.
- **Un bloc vide n'existe pas.** Sans annonce ni événement, l'accueil n'affiche pas de bloc vide. Pour une donnée attendue, « Pas de données » reste la règle.
- **Une raison de revenir.** L'accueil dit ce qui a changé depuis la dernière visite, retient son pseudo si on le demande, et donne l'objectif du moment sur la carte et le prochain bilan. Tout reste dans le navigateur du visiteur.
- **Pas de fondu entre les pages.** Essayé le 7 novembre 2026 avec `@view-transition` : il provoquait des erreurs intermittentes vers la page Carte. Les pages sont statiques, et leur changement est déjà rapide.

## Couleurs

Les jetons sont définis dans `src/styles/global.css`.

| Jeton | Valeur | Usage |
|---|---|---|
| `navy` | `#0A1230` | Environnement de la page, avec une lueur bleue et un reflet rouge |
| `night` | `#060B22` | Pied de page, scènes nocturnes, panneaux posés dans une scène |
| `surface` | `#121C3F` | Cartes |
| `surface-2` | `#1A2650` | État actif, avatars |
| `line` | `#2C3A6B` | Bordures |
| `blue` | `#0B5FFF` | **Bouton principal uniquement** |
| `blue-text` | `#9DBCFF` | Liens : le bleu du logo n'est pas assez contrasté sur le fond marine |
| `red` | `#FF1A2E` | Filet, marqueur de page et de ligne active |
| `muted` | `#C0C9E2` | Texte secondaire |
| `warn` | `#FFC857` | Données périmées et erreurs de collecte |

**Règle du tricolore :** en accent dans l'interface (filets, soulignement de la page active, loader). Pas de texte blanc sur le rouge vif, trop peu contrasté à petite taille.

## Scènes

Les grandes sections sont des blocs `.stage` à coins de 24 px. La profondeur vient de la couleur, sans ombre portée.

| Classe | Décor | Usage sur l'accueil |
|---|---|---|
| `.stage-blue` | Bleu royal | Classement officiel |
| `.stage-indigo` | Indigo | Parties des 14 derniers jours et dernières parties |
| `.stage-night` | Nuit, avec bordure | Gazette, Ma place, carte des clans, appel à rejoindre |
| `.stage-wine` | Lie-de-vin | Quand jouer |

Une scène associe un texte et un panneau `.panel`, à la manière d'un écran de l'application. **Ces panneaux n'affichent que des données collectées :** graphique des parties, créneaux réels. Aucune maquette ni valeur fictive.

## Typographie

- **Titres :** Outfit, graisse 800, en capitales, interligne serré, approche -0,01 em. Le rendu est proche du lettrage du logo, avec une police libre de droits.
- **Texte :** Inter.
- **Chiffres :** chiffres tabulaires (`.tnum`) pour que les colonnes s'alignent. Les milliers sont séparés par l'espace insécable de `src/lib/nombre.ts` : Outfit et Inter ne contiennent pas l'espace fine de `Intl`.
- Les capitales sont appliquées en CSS : le texte d'origine reste en casse normale pour les lecteurs d'écran.
- Les polices sont servies par le site, sans requête vers un service tiers.

## Boutons

| Classe | Style | Usage |
|---|---|---|
| `.btn-primary` | Bleu plein | L'action principale, rejoindre le Discord |
| `.btn-secondary` | Blanc plein | L'action associée, jouer à OpenFront |
| `.btn-ghost` | Contour blanc | Liens vers les pages, dans les scènes colorées |

Les boutons ont des coins de 12 px, et `.btn-lg` les agrandit pour les appels principaux.

## Logos

| Fichier | Où |
|---|---|
| Logo vertical | Grand visuel de l'accueil et de la page Rejoindre, sur une lueur bleue |
| Bannière | Bas de l'accueil, image de partage |
| Badge rond | En-tête, favicon recadré en cercle |

Le build en tire des versions légères dans `public/generated/`, et le site n'affiche que celles-ci. Le logo horizontal est en réserve. Les six fichiers d'origine sont conservés dans `brand-sources/`, dont un logo horizontal à lettrage sombre, illisible sur le fond marine. Sans fichier dans `public/brand/`, le site affiche un lettrage provisoire.

## Visualisation de données

- **Parties par jour :** barres empilées victoires et défaites, en bleu `#4C86F5` et orange `#D9742E`. Palette contrôlée sur la surface des cartes, y compris pour les daltonismes. Une légende et un tableau accompagnent le graphique de la page Progression.
- **Vue « Tout » :** regroupée par semaine, pour garder des barres lisibles en mobile.
- **Rang, score et membres :** trois graphiques distincts, jamais de double axe. Le rang a l'axe inversé. Chacun a sa propre échelle, ce que la page écrit, et un tableau donne les valeurs exactes.
- **Heatmap :** une seule teinte, du sombre au clair, avec le nombre écrit dans chaque case. C'est un vrai tableau HTML. En dessous de 1 024 px, il pivote en une ligne par heure pour tenir sans défilement horizontal.
- **Période en cours :** barre plus pâle.
- **Comparateur de clans (page Nos rivaux) :** un vrai tableau à trois colonnes, sans jauge ni couleur par gagnant : le site ne dit pas lequel des deux est meilleur. L'écart est écrit en toutes lettres, annoncé aux lecteurs d'écran, et doublé d'un tableau repliable dès le deuxième relevé.
- **Paliers (page Membres et fiches) :** du texte et des noms, sans classement de jauges. Sur une fiche, la jauge va du palier atteint au suivant, et sa valeur est écrite juste au-dessus. Au-delà de 12 pseudos, un palier se replie : tout reste dans le HTML et s'ouvre sans JavaScript.
- **Dernières parties :** un vrai tableau à partir de 1 024 px, des cartes en dessous. Les 25 premières lignes sont dans le HTML. Le résultat est écrit en toutes lettres : la pastille bleue ou orange ne porte jamais seule l'information.
- **Croissance des troupes (page Guides) :** une seule courbe calculée, en bleu `#4C86F5`, avec la zone de 35 à 42 % en surbrillance. Le survol lit une valeur, et un tableau repliable donne les mêmes chiffres sans survol.

## Mouvement et interactions

L'idée centrale reprend le principe d'OpenFront, la conquête de territoire : derrière la page, une grille de cases s'allume et s'éteint. **Cet effet est purement décoratif : il n'affiche aucune donnée du clan.**

| Geste | Effet |
|---|---|
| Déplacer la souris | Les cases s'allument sur son passage, un halo suit le curseur dans les blocs, les blocs s'inclinent, les boutons sont attirés, le logo suit le curseur |
| Survoler un bloc | Une frontière tricolore fait le tour de sa bordure |
| Clic gauche | Vague de conquête bleue, onde de choc et éclats. L'onde traverse aussi le bloc cliqué. |
| Clic droit sur le fond | Vague de conquête rouge, onde de choc et éclats. L'onde traverse aussi le bloc cliqué. |
| Clic gauche sur le logo | Pulsation et vague plus grande |
| Clic droit sur le logo | Tour complet du logo et vague rouge plus grande |
| Toucher un écran | Vague bleue. Pas d'effet de survol. |
| Défiler | Blocs conquis case par case depuis le point le plus proche du curseur, titres mot à mot, barre de progression, compteurs |
| Survoler le graphique des parties | Colonne glissante, repère de valeur, barres voisines éclairées |
| Cliquer sur un graphique ou la heatmap | Une onde se propage depuis le clic, bleue ou rouge selon le bouton |
| Survoler la heatmap | Réticule sur le jour et l'heure, infobulle qui suit le curseur |
| Changer de période | Barres qui repoussent, balayage tricolore, chiffres qui défilent |
| Trier les membres | Les lignes glissent vers leur nouvelle place |
| Modifier le calculateur | L'attaque se rejoue : le bot est conquis pendant que les troupes fondent |
| Rien | Lente flottaison du logo, petits territoires qui naissent et disparaissent seuls, frontière qui fait parfois le tour d'un bloc |

### Le film de la carte

C'est le seul effet qui affiche des données : chaque image vient de l'historique officiel de la carte des clans. La page s'ouvre directement sur la carte, en plein écran sur un grand écran, avec le titre, le classement et les commandes posés dessus. Sous 1 200 px, tout s'empile et les commandes restent collées à la carte, dont la hauteur se limite sur un écran en paysage pour garder le bouton de lecture dans le premier écran. La carte finale s'affiche d'abord, puis le film repart du premier pixel.

| Élément | Rôle |
|---|---|
| Lueur bleu pâle | Des pixels que GAL vient de prendre |
| Lueur rouge | Des pixels que GAL vient de perdre |
| Lueur blanche discrète | Un pixel pris par un autre clan |
| Halo fixe | Le territoire de GAL. Il ne clignote pas. |
| Grand moment | Un sous-titre. À la vitesse × 1, les plus importants ont aussi un plan rapproché lent, marqué d'un cercle doux. |
| Classement posé sur la carte | Les 5 plus grands territoires, avec des barres et des places qui glissent. Les valeurs sont celles de l'image affichée. Il occupe l'océan au sud-ouest. |
| Frise, courbe et repères | Position dans l'historique, pixels de GAL tout au long du film, grands moments et vrais jours. Le film suit les événements, pas le temps : une journée active prend plus de place. Les dates écrites sous la frise s'espacent selon la largeur. |
| Date posée sur la carte | Le jour et l'heure de Paris de l'image affichée, à l'heure près. Le curseur donne la même date aux lecteurs d'écran. |
| Griser les autres clans | GAL seul en couleur, sans changer aucun chiffre |
| Suivre GAL | La caméra accompagne son territoire, sans à-coup. Activé par défaut sur téléphone. |
| Survol ou pression sur la carte | Le tag du clan à cet endroit |

**Les grands moments sont calculés, jamais écrits à la main** (`src/lib/clanmap/moments.ts`) : premier pixel, meilleure place, plus forte chute, remontée, plus grande poussée, plus dur recul, paliers de pixels. Deux moments trop proches ne se suivent pas : le plus important reste.

Le film dure 60 s à la vitesse × 1, quel que soit le nombre d'images. Il s'arrête hors de l'écran, sa boucle s'arrête quand plus rien ne bouge, et il se charge seulement sur cette page : environ 400 Ko au total. Rien ne clignote : ni éclair, ni étincelle, ni bande de cinéma. Si le film saccade, il coupe seul le halo et baisse un peu sa résolution.

**La caméra ne fait jamais d'à-coup** (`src/lib/fx/camera.ts`). Elle suit sa cible comme un ressort amorti : elle part doucement, ralentit avant d'arriver et ne dépasse jamais la cible. Un mouvement automatique prend environ deux secondes, un cadrage demandé par un clic sur une zone ou un front environ une seconde. À la vitesse × 1, les moments les plus importants ont un plan rapproché, jamais à moins de 14 secondes du précédent, même si celui-ci venait d'un clic, et sans s'approcher plus de trois fois la vue d'ensemble. Aux vitesses × 2 et × 4, seul un moment choisi dans la liste a son plan rapproché. Avec « Suivre GAL », activé d'office sur téléphone, la caméra accompagne le territoire et ne fait aucun plan rapproché. Avant le 8 novembre 2026, chaque moment zoomait vite et fort, et le film à × 4 n'était plus qu'une suite d'allers-retours.

Les couleurs des territoires sont celles que les clans ont choisies dans le jeu : le bleu ciel de GAL n'est pas un jeton du site. Elles peuvent donc être peu contrastées entre elles : les chiffres et les tags en texte restent la référence, et l'option « Griser les autres clans » isole GAL.

**Avec « réduire les animations » ou le bouton pause du site :** le film ne démarre pas seul, il n'y a ni lueur, ni halo, ni plan rapproché, et la caméra saute directement. Le bouton de lecture, la frise et les sous-titres restent disponibles. **Sans JavaScript ou si le film ne charge pas :** la carte finale et tous les chiffres restent affichés.

Le code est dans `src/scripts/film.ts`. Sa logique testable est dans `src/lib/clanmap/`.

### Donner envie de participer

Sous le film, la page se lit en quatre parties, reliées par « Sur cette page » : **Revoir l'histoire** (grands moments, grandes journées, zones), **Où en est GAL** (objectif et chiffres), **Faire grandir GAL** (façons d'aider, calculateur, donateurs et peintres), puis **Les détails**, repliés (jour après jour, fronts, lecture de la carte). Elle transforme les données publiques en objectif concret. **Aucune de ces parties n'invente un chiffre, et aucune ne pousse à dépenser de l'argent : seules les capsules comptent, jamais le Plutonium.**

| Partie | Contenu | Source |
|---|---|---|
| Prochain objectif | Le clan à dépasser, les pixels manquants, l'avance sur le suivant | Ordre de la carte officielle |
| GAL en chiffres | Territoire et record, pris et perdus, premier pixel, réserves du clan et ce qu'elles valent en pixels neutres | Historique de la carte, fiche publique du clan, règles du jeu |
| Votre don sur la carte | Capsules, troupes, pixels, rang obtenu, seul ou avec tous les membres | Calcul, marqué comme simulation |
| Simulation sur la carte | Le territoire s'étend depuis sa frontière sur les terres neutres. La vue recule quand il grandit. | Illustration : le chef et les officiers choisissent où peindre |
| Faire grandir GAL | Don, jeu sous le tag, peinture, avec l'avertissement sur les dons définitifs | Code du jeu, à relire par un membre |
| Plus gros donateurs | Recopiés par le clan s'il choisit de les publier. Sinon, un renvoi vers le jeu. | `content/carte-heros.json` |
| Peuvent peindre pour GAL | Le chef et les officiers, avec un renvoi vers l'encadrement de la page Membres, et vers Ma place sur l'accueil | Rôles de la liste des membres |
| Grandes journées, jour après jour | Le plus fort gain et le plus fort recul d'une journée terminée, puis chaque journée en tableau. Un clic rejoue la journée et s'arrête à sa fin. Sans mouvement : directement la carte de la fin du jour. | Historique daté, jours de Paris |
| Nos territoires, fronts | Un clic cadre la carte sur une zone ou un front, et met le clan adverse en évidence | Carte complète, rejouée |

Ma place, sur l'accueil, donne le rang d'un membre, le prochain joueur à dépasser et son prochain palier : `stats.team`, comme la page Membres. Le calculateur est dans `src/scripts/conquest.ts`, et ses règles dans `src/lib/clanmap/economy.ts`. Pour garder la page courte, seuls le tableau jour après jour, les fronts et la lecture de la carte sont repliés. Tout reste dans le HTML et s'ouvre sans JavaScript.

**Le clic droit garde son menu habituel** sur les liens, les boutons, les champs, les images autres que le logo et le texte sélectionné. Maj + clic droit l'ouvre partout.

**Les animations ne touchent jamais aux valeurs.** Une barre ne change pas de hauteur au survol, et l'onde d'un clic ne fait que l'éclairer. Les nouvelles jauges (taux de victoire, créneaux, scores du classement) ont une longueur calculée à partir des données. Le trait rouge d'une jauge (`.meter-tick`, repère du hasard ou des habitudes du clan sur la page Progression) est calculé lui aussi, et sa valeur est écrite à côté. La barre d'un face-à-face (`.split-bar`, page Classement) partage un même total entre trois issues, écrites à côté avec leur nombre. Le rejeu du calculateur vient de `simulateTrace`, et reste un repère indicatif.

**Un effet ne peut pas masquer du contenu.** La conquête d'un bloc couvre toutes ses cases, ce que des tests vérifient. Un bloc très haut ou une longue liste apparaît en fondu, et un bloc n'attend jamais plus de 0,4 s avant d'apparaître. Si le script ne se charge pas, les blocs s'affichent seuls au bout de 1,5 s.

Le code est dans `src/scripts/fx.ts`, et sa logique testable dans `src/lib/fx/territory.ts`. Les composants Preact utilisent `src/lib/fx/motion.ts` pour savoir si les animations sont permises. Le script pèse environ 15 Ko et la boucle d'animation s'arrête quand l'onglet est masqué.

**Trois façons de couper les effets :** le bouton pause de l'en-tête (le choix est mémorisé), le réglage « réduire les animations » du système, ou l'absence de JavaScript. Dans tous les cas, le contenu reste complet et les valeurs finales sont déjà dans le HTML.

## Accessibilité

- Lien d'évitement, focus visible partout, navigation entièrement utilisable au clavier.
- Animations continues interruptibles par le bouton pause, comme l'exige le critère WCAG 2.2.2. Toutes les interactions à la souris sont décoratives : aucune information n'en dépend.
- Les chiffres qui défilent sont masqués aux lecteurs d'écran, qui reçoivent uniquement la valeur finale.
- Graphiques de la page Progression doublés par des tableaux, identité jamais portée par la seule couleur.
- Tests automatiques axe (WCAG 2.1 A et AA) sur les 8 pages en desktop et mobile. Ces tests ne remplacent pas un essai avec un lecteur d'écran, qui n'a pas été fait. Ils ne peuvent pas non plus toujours mesurer un contraste sur un dégradé : le texte des scènes a été choisi clair et vérifié à l'œil sur les captures.
- Absence de défilement horizontal testée à 360, 375, 768, 1 024, 1 280 et 1 920 px. Ces tests tournent sans barre de défilement visible : une vraie barre retire 15 px de largeur, ce qui peut révéler un débordement qu'ils ne voient pas.

## États des données

| État | Affichage |
|---|---|
| Chargement | Arc animé, uniquement pour la liste des membres. Les autres pages arrivent déjà remplies. |
| Vide | « Pas de données », jamais un zéro. Une scène de l'accueil sans données n'est pas affichée. |
| Zéro réel | « 0 » ; un taux sans partie affiche « — » |
| Erreur de collecte | Message jaune, dernières données valides conservées |
| Périmé | Message jaune calculé dans le navigateur du visiteur |
| Hors classement | Texte explicite, jamais un rang 0 |

## Évolutions prévues

Ces ajouts hors V1 restent possibles sans refonte :

- **Multilingue :** les textes sont dans les pages, ce qui demandera de les extraire.

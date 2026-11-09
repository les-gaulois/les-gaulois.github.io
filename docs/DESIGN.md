# Design du site [GAL] Les Gaulois

## Intention

Le journal d'un clan de stratégie. Un fond nuit uni, de grands titres à empattements en casse normale, les chiffres du clan posés comme un tableau de score, et un seul bouton fort par section. Le registre est celui des gazettes et des états-majors, celui des jeux de grande stratégie, sans tomber dans le folklore celtique. L'identité reste celle du clan : bleu, blanc, rouge et son guerrier gaulois, le tricolore en accent et jamais en fond. Aucune référence à des personnages ou visuels protégés.

**Refonte du 9 novembre 2026.** Le pilote trouvait que le site « faisait généré par IA » : Inter et Outfit, les polices par défaut de ces sites ; tous les titres en capitales, à la même taille ; huit blocs arrondis de couleurs différentes ; la même recette titre, paragraphe et deux boutons partout ; seize boutons sur l'accueil ; un fond animé à piloter et des blocs qui n'apparaissaient qu'au défilement, et restaient parfois invisibles. Tout cela est retiré. Ne pas y revenir : une nouvelle page suit les règles ci-dessous.

## Organisation du site

Le visiteur doit savoir où chercher, et avoir une raison de revenir. Le plan est dans `src/lib/nav.ts`, et le README en donne le tableau.

- **Six rubriques dans l'en-tête, visibles dès 1 024 px, pas une de plus.** En dessous, elles passent dans le bouton « Menu ». À 1 024 px, le nom « Les Gaulois » laisse sa place aux rubriques, et l'en-tête connecté le plus chargé, celui d'un membre validé (lien « QG », nom du compte au plus long), garde 54 px de marge ; celui de l'encadrement (lien Direction avec sa pastille à deux chiffres, lien « QG ») en garde 84. Mesurés le 9 novembre 2026 avec un faux serveur. Une septième rubrique ne tiendrait pas : la placer comme onglet d'une rubrique existante. Une rubrique répond à une question : que s'est-il passé, où en est-on, qui sommes-nous, la carte, comment jouer, comment entrer. Son nom ne doit pas se confondre avec un autre : « Guides » plutôt que « Jouer », à cause du bouton « Jouer à OpenFront ».
- **Des onglets dans chaque rubrique.** `SectionNav.astro` les place en haut de page : on passe d'une page à l'autre sans repasser par le menu.
- **Un contenu, une page.** L'accueil résume et renvoie ; il ne recopie pas un bloc entier. Une autre page peut citer un chiffre, en renvoyant à sa page.
- **Une face publique, une face privée.** Le QG (`/qg`, onglet de la rubrique Membres) est réservé aux membres validés : sondages, boîte à idées, mur. Sa page ne contient que la porte, et l'accueil n'en montre qu'un bloc d'entrée. Dans l'en-tête, un membre validé a un lien « QG » avant son nom ; l'encadrement a « Direction » et « QG », sans son nom, et ouvre son compte depuis le QG ou la Direction. Sur téléphone, il ne reste que « QG » pour un membre et « Direction » pour l'encadrement. Le QG reste bleu : le rouge est réservé à l'encadrement. Au QG, le refus du serveur s'écrit à l'endroit de l'action, pas en haut de la page, et une photo Discord absente laisse la place à l'initiale du nom : le logo de Discord ne s'affiche jamais.
- **Le chiffre d'abord, l'explication à la demande.** Les précisions de méthode sont dans `ReadingNote.astro`, repliées mais dans le HTML. Ce qui doit rester visible ne s'y met jamais : mentions de licence, couverture de la lecture, pannes et suspensions, et ce qui change la lecture d'un chiffre, comme sa période, le périmètre des parties ou la réserve sur un taux.
- **Une page courte.** Une longue liste montre ses premières lignes et garde le reste à portée : 25 clans au classement, 25 parties dans le journal, les chapitres du guide en sommaire qui s'ouvre.
- **Un bloc vide n'existe pas.** Sans annonce ni événement, l'accueil n'affiche pas de bloc vide. Au QG, un espace de travail, chaque partie dit en une phrase qu'elle est vide. Pour une donnée attendue, « Pas de données » reste la règle.
- **Les membres d'abord.** Juste sous l'en-tête de l'accueil, « Les Gaulois de la semaine » (`ClanWeek.astro`) nomme des joueurs : le podium des victoires de la dernière gazette, les plus actifs quand les parties sont relevées, et le fil du clan (paliers franchis, records récents, belle partie d'hier, arrivées). C'est le résumé de la gazette, qui garde le détail : il remplace l'ancien bloc « La gazette du clan ». Une ligne sans donnée n'existe pas, et la réserve « ce n'est pas un classement de niveau » reste visible. « Ma place dans le clan » et la porte du QG viennent ensuite, côte à côte, puis le classement du clan.
- **Une raison de revenir.** L'accueil dit ce qui a changé depuis la dernière visite, retient son pseudo si on le demande, et donne l'objectif du moment sur la carte et le prochain bilan. Le film de la carte reprend où le visiteur l'avait laissé, et la dernière journée se rejoue d'un clic. La gazette montre la semaine en cours, l'accueil la belle partie d'hier, et un record qui vient de tomber est signalé sur la page Records et dans la gazette. Le membre qui a retenu son pseudo lit aussi son bilan personnel. Chaque fiche de membre a un bouton « Copier le lien » et une image d'aperçu dessinée au build (`src/lib/fiche-image.ts`), pour que le lien collé sur Discord montre le pseudo, la place et le palier. Le site s'installe comme une application depuis le navigateur (`/manifest.webmanifest`), sans rien stocker ni suivre. Tout ce qui est personnel reste dans le navigateur du visiteur.
- **Les nouveautés du site, discrètes mais à portée.** Sur grand écran (`lg` et plus), un lien de texte « Nouveautés », à gauche du bouton Discord, ouvre un panneau avec les trois dernières mises à jour et le lien vers toutes. En dessous, la place manque dans l'en-tête : l'entrée passe en bas du menu. Un point rouge (`.nouveautes-dot`, 3:1 au moins sur chaque fond) signale une mise à jour parue depuis le dernier passage, sur le bouton ou sur le menu ; il ne clignote pas. Les lecteurs d'écran l'entendent dans le nom du bouton et du lien du menu, et en description du bouton Menu. Pas de bulle flottante : sur la page Carte, les commandes du film occupent le bas de l'écran. La page `/nouveautes` est un onglet de la rubrique Actu.
- **Pas de fondu entre les pages.** Essayé le 7 novembre 2026 avec `@view-transition` : il provoquait des erreurs intermittentes vers la page Carte. Les pages sont statiques, et leur changement est déjà rapide.

## Couleurs

Les jetons sont définis dans `src/styles/global.css`.

| Jeton | Valeur | Usage |
|---|---|---|
| `navy` | `#0A1230` | Fond uni de toutes les pages, sans lueur ni dégradé |
| `night` | `#060B22` | Pied de page, champs, encarts sombres |
| `surface` | `#121C3F` | Cartes : un objet, jamais une section |
| `surface-2` | `#1A2650` | État actif, avatars |
| `line` | `#2C3A6B` | Filets entre les sections, bordures |
| `line-strong` | `#5D6C9E` | Contour des champs et des boutons secondaires : 3,6:1 sur le fond, 3,2:1 sur une carte |
| `blue` | `#0B5FFF` | **Bouton principal uniquement** |
| `blue-text` | `#9DBCFF` | Liens : le bleu du logo n'est pas assez contrasté sur le fond marine |
| `flag-blue` | `#0B5FFF` | Le bleu du drapeau : filet tricolore, jauge de GAL. Il ne change pas avec le thème |
| `red` | `#FF1A2E` | Filet tricolore, trait de la page active dans le menu et les onglets, ligne de GAL au classement |
| `win` | `#4C86F5` | Victoires, dans les graphiques et les pastilles de résultat |
| `loss` | `#F0505F` | Défaites. Avec `win`, contrôlé pour les daltonismes sur le fond et sur une carte |
| `muted` | `#C0C9E2` | Texte secondaire : 11:1 sur le fond, 10:1 sur une carte |
| `warn` | `#FFC857` | Données périmées et erreurs de collecte, et ce qui attend l'encadrement : demandes à traiter, pastille, points de l'état du site |

**Une palette réduite :** le fond nuit, un bleu, un rouge d'accent et des neutres. Le jaune `warn` ne sert qu'aux états, jamais au décor.

**Règle du tricolore :** en accent dans l'interface (filets, trait de la page active, loader), jamais en couleur de fond d'une section. Pas de texte blanc sur le rouge vif, trop peu contrasté à petite taille.

### Thème rouge de l'encadrement

`/direction` et `/admin` sont rouges : l'encadrement sait d'un coup d'œil qu'il est dans son espace. Ces pages passent `theme="rouge"` à `Base.astro`, qui pose `data-theme="rouge"` sur `<html>`. `global.css` redonne alors à chaque jeton une teinte rouge, rôle pour rôle : aucun composant n'a de couleur à lui. Les noms ne changent pas : `navy` y est un bordeaux très sombre, `blue` le rouge du bouton principal.

| Jeton | Thème rouge | Contraste vérifié |
|---|---|---|
| `navy` | `#300A10` | Texte blanc 17,9:1 |
| `night` | `#22060B` | Texte blanc 19,1:1 |
| `surface` | `#3F121A` | Texte blanc 16:1, `muted` 9,6:1, liens 8,1:1 |
| `surface-2` | `#501A23` | Texte blanc 13,9:1, liens 7,1:1 |
| `line` | `#6B2C37` | Bordures |
| `line-strong` | `#9E5D68` | 3,2:1 sur une carte, 3,8:1 sur `night` |
| `blue` | `#D4132F` | Bouton principal : texte blanc 5,3:1, et 7,1:1 au survol (`#B00F27`) |
| `blue-text` | `#FF9DAD` | Liens |
| `muted` | `#E2C0C6` | Texte secondaire |

- Le filet tricolore, la frontière et la barre de progression gardent le bleu du drapeau (`flag-blue`) : c'est l'identité du clan.
- `.form-problem`, un refus du serveur ou un avertissement comme « Absent de la liste », s'y écrit en jaune `warn`, la couleur de « Plus dans la liste » : en rose, il se perdrait dans le décor.
- `/compte` reste bleu : c'est la page de chaque membre, pas un espace de l'encadrement.
- Un test e2e vérifie que ces deux pages sont rouges et que toutes les autres restent bleues. Axe contrôle aussi leurs contrastes, mais les tests construisent le site sans serveur de connexion : il n'y voit que la carte « connexion pas ouverte ». Les vrais écrans (tuiles, formulaires, tableau, onglets, refus en jaune) n'ont été contrôlés qu'une fois, le 8 novembre 2026, par axe avec un faux serveur, sur bureau et téléphone.

## Sections et cartes

- **Une section se pose sur le fond.** `.band` : un filet en haut et de l'espace autour. Plus de blocs colorés : les anciennes « scènes » (`.stage-blue`, `.stage-indigo`, `.stage-wine`, `.stage-night`) et leurs panneaux sont retirés.
- **Chaque section a sa mise en page**, au lieu de répéter titre, paragraphe et boutons. Sur l'accueil : l'ouverture, avec le logo à côté ; les Gaulois de la semaine, le podium et le fil du clan en deux colonnes séparées par un filet ; « Ma place » et la porte du QG, de même ; le tableau de score du classement, des chiffres séparés par des filets ; la carte des clans, l'image en premier ; les parties, un graphique et une liste ; les créneaux, une liste à filets avec leur jauge ; l'appel à rejoindre, avec la bannière.
- **Une carte `.card` n'entoure qu'un objet :** une partie, une stat, un membre, un créneau, un face-à-face, un chapitre du guide, un outil comme le calculateur ou la simulation de la carte. Coins de 10 px, bordure `line`, sans ombre ni dégradé. Pas de grille de trois cartes « avantages » : les façons d'aider de la page Carte sont une liste à filets.
- Hiérarchie des coins : 4 px pour une étiquette, 6 px pour un bouton ou un champ, 10 px pour une carte.
- **Ces blocs n'affichent que des données collectées.** Aucune maquette ni valeur fictive.

## Typographie

- **Titres et grands chiffres : Spectral**, dessinée à Paris par Production Type pour l'écran. Ses empattements nets donnent le registre de la gazette et des jeux de grande stratégie, sans folklore. Graisse 800 pour H1, H2 et les chiffres mis en avant (`.figure`), 600 pour H3. Casse normale, interligne serré.
- **Texte : Red Hat Text**, dessinée pour la lecture aux petites tailles, avec des chiffres tabulaires. Atkinson Hyperlegible a été essayée le 9 novembre 2026 : son zéro barré faisait lire « 2Ø26 » dans chaque date.
- **Échelle :** `.page-title` (H1, de 36 à 64 px), `.section-title` (H2, de 28 à 40 px), `.section-title-sm` (H2 d'une colonne, de 24 à 34 px), H3 de 20 à 24 px, texte de 16 px sur téléphone et 17 px au-delà. `text-sm` vaut 15 px et `text-xs` 13 px : les mentions restent lisibles.
- **Les capitales ne servent plus nulle part**, ni aux titres, ni aux libellés, ni aux en-têtes de tableau. Un petit libellé au-dessus d'un chiffre prend `.label` : gras, en casse normale, couleur `muted`.
- **Chiffres :** chiffres tabulaires (`.tnum`) pour que les colonnes s'alignent. Les milliers sont séparés par l'espace insécable de `src/lib/nombre.ts` : Spectral et Red Hat Text ne contiennent pas l'espace fine de `Intl`.
- Polices interdites, parce qu'elles signent les sites générés : Inter, Outfit, Poppins, Montserrat, Space Grotesk, Roboto et les polices du même genre. Inter et Outfit ne servent plus qu'aux images dessinées par le robot pour Discord.
- Les polices sont servies par le site, sans requête vers un service tiers, et préchargées dans l'en-tête de chaque page (Spectral 800 et Red Hat Text) : le texte s'affiche presque toujours directement dans sa police. Leur poids reste celui d'avant la refonte, 77 Ko environ.
- Les pages se préchargent au survol de leur lien (`prefetch` d'Astro, stratégie `hover`) : la page suivante s'ouvre sans attente.

## Boutons

Un seul système, appliqué partout, en-tête compris : coins de 6 px, texte gras, survol par la couleur seule (ni soulèvement, ni reflet, ni attraction vers le curseur), focus par le contour blanc du site.

| Classe | Style | Usage |
|---|---|---|
| `.btn-primary` | Bleu plein | L'action principale de la section. Sur l'accueil, seul « Rejoindre le Discord » ; dans l'en-tête, seul « Discord » |
| `.btn-secondary` | Contour `line-strong` | Les autres actions : entrer dans le QG, voir les étapes, réessayer, copier un lien |
| `.btn-lg` · `.btn` · `.btn-sm` | 52, 44 et 40 px de haut | L'ouverture d'une page · le cas courant · une action dans une liste |
| `.chip` | Même forme, plus discrète | Interrupteurs et filtres : période, vitesse du film, résultat |
| `.nav-link` | Texte, trait au survol | Rubriques, « Nouveautés » et liens du compte dans l'en-tête |

**Un lien mène ailleurs, un bouton agit.** « Voir le classement complet », « Lire la gazette », « Voir la progression » sont des liens de texte (`<a>` sans classe, ou `.link`). Une section a au plus un bouton ; la seconde action devient un lien.

La pastille `.count-pill` donne, à côté du lien Direction, le nombre de demandes en attente : fond jaune `warn`, texte `navy`, 11,6:1 au moins dans les deux thèmes. Les lecteurs d'écran entendent le texte visible suivi de ce qu'il compte : « Direction 2 demandes à traiter ».

## Logos

| Fichier | Où |
|---|---|
| Logo vertical | Grand visuel de l'accueil et de la page Rejoindre, posé sur le fond, sans halo ni mouvement. Sur téléphone, il n'est ni affiché ni téléchargé : le badge de l'en-tête suffit |
| Bannière | Bas de l'accueil, image de partage |
| Badge rond | En-tête, favicon recadré en cercle |

Le build en tire des versions légères dans `public/generated/`, et le site n'affiche que celles-ci. Le logo horizontal est en réserve. Les six fichiers d'origine sont conservés dans `brand-sources/`, dont un logo horizontal à lettrage sombre, illisible sur le fond marine. Sans fichier dans `public/brand/`, le site affiche un lettrage provisoire.

## Visualisation de données

- **Parties par jour :** barres empilées victoires et défaites, en bleu `#4C86F5` et rouge `#F0505F`, les couleurs du clan. Palette contrôlée le 9 novembre 2026 sur le fond et sur une carte : contraste de 5,3:1 sur le fond et de 4,8:1 sur une carte pour chacune, et un écart de couleur suffisant entre les deux pour les trois formes de daltonisme (ΔE 22,7 au pire, en protanopie). Barres de 24 px au plus, 2 px de fond entre les deux parts, haut arrondi. Un axe gradué de valeurs rondes et entières (`countAxis` de `src/lib/chart.ts`), les dates en bas, la légende au-dessus avec des pastilles de 14 px. Le détail de chaque barre au survol, et un tableau : visible sur la page Progression, réservé aux lecteurs d'écran sur l'accueil, dans un bloc `.sr-only` (sur le `<table>` lui-même, la classe ne l'empêche pas d'élargir la page).
- **Vue « Tout » :** regroupée par semaine, pour garder des barres lisibles en mobile.
- **Rang, score et membres :** trois graphiques distincts, jamais de double axe. Le rang a l'axe inversé. Chacun a sa propre échelle, ce que la page écrit : sa valeur la plus haute et la plus basse sont écrites contre leur trait, du côté où la courbe ne passe pas. Un tableau donne les valeurs exactes.
- **Heatmap :** une seule teinte, du sombre au clair, avec le nombre écrit dans chaque case. C'est un vrai tableau HTML. En dessous de 1 024 px, il pivote en une ligne par heure pour tenir sans défilement horizontal.
- **Période en cours :** barre plus pâle.
- **Comparateur de clans (page Nos rivaux) :** un vrai tableau à trois colonnes, sans jauge ni couleur par gagnant : le site ne dit pas lequel des deux est meilleur. L'écart est écrit en toutes lettres, annoncé aux lecteurs d'écran, et doublé d'un tableau repliable dès le deuxième relevé.
- **Paliers (page Membres et fiches) :** du texte et des noms, sans classement de jauges. Sur une fiche, la jauge va du palier atteint au suivant, et sa valeur est écrite juste au-dessus. Au-delà de 12 pseudos, un palier se replie : tout reste dans le HTML et s'ouvre sans JavaScript.
- **Dernières parties :** un vrai tableau à partir de 1 024 px, des cartes en dessous. Les 25 premières lignes sont dans le HTML. Le résultat est écrit en toutes lettres : la pastille bleue ou rouge ne porte jamais seule l'information.
- **Sondages (QG et espace Direction) :** une jauge `.meter` par choix, dont la longueur est la part des voix. Le nombre de voix et la part sont écrits à côté, et la jauge est masquée aux lecteurs d'écran. Le choix du membre connecté est écrit en toutes lettres, « votre choix ». Avant la première voix, aucune part n'est inventée : les jauges restent vides et seul « 0 voix » s'affiche.
- **Croissance des troupes (page Guides) :** une seule courbe calculée, en bleu `#4C86F5`, avec la zone de 35 à 42 % en surbrillance. Le survol lit une valeur, et un tableau repliable donne les mêmes chiffres sans survol.

## Mouvement et interactions

**Le site est immobile.** Rien ne bouge au chargement ni au défilement, et tout le contenu est visible dès l'ouverture, avec ou sans JavaScript. Ce qui bouge répond à un geste du visiteur ou montre un calcul :

| Geste ou calcul | Mouvement |
|---|---|
| Lancer le film de la carte | Le film, avec son bouton de lecture et de pause (section suivante) |
| Modifier la simulation de la carte | Le territoire s'étend depuis sa frontière |
| Modifier le calculateur, ou appuyer sur « Rejouer l'attaque » | L'attaque se rejoue une fois, en 5 s au plus : le bot est conquis pendant que les troupes fondent. À l'ouverture de la page, l'image finale, immobile |
| Trier les membres | Les lignes glissent vers leur nouvelle place |
| Changer de période sur la page Progression | Les chiffres du résumé défilent jusqu'à leur nouvelle valeur |
| Survoler un graphique | Colonne survolée, repère et valeur ; rien d'autre ne bouge |
| Survoler une case de la heatmap | Un contour blanc, et son détail dans l'infobulle du navigateur |

**Retiré le 9 novembre 2026, à ne pas remettre :** la grille de cases animée derrière la page et ses vagues au clic, le halo et l'inclinaison des blocs, l'attraction des boutons, le logo qui flotte et suit le curseur, la frontière tricolore au survol, les titres qui s'écrivent mot à mot, les blocs qui apparaissent en fondu au défilement, la barre de progression du défilement, les compteurs qui défilent à l'ouverture, le balayage et la pousse des graphiques, la ligne de GAL qui brille au classement, et le bouton pause de l'en-tête avec la phrase « Bougez la souris… ». Le pilote les trouvait gratuits, et certains blocs du bas de l'accueil restaient invisibles quand leur apparition ne se déclenchait pas.

### Le film de la carte

C'est le seul effet qui affiche des données : chaque image vient de l'historique officiel de la carte des clans. La page s'ouvre directement sur la carte, en plein écran sur un grand écran, avec le titre, le classement et les commandes posés dessus. Sous 1 200 px, tout s'empile et les commandes restent collées à la carte, dont la hauteur se limite sur un écran en paysage pour garder le bouton de lecture dans le premier écran. La carte finale s'affiche d'abord, puis le film démarre en fondu : du premier pixel à la première visite, et seulement la suite quand le visiteur revient (`src/lib/clanmap/reprise.ts`, à partir du relevé de « Depuis votre dernière visite »).

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
| Revoir la dernière journée | Un bouton à côté de la lecture rejoue la dernière journée terminée en quelques secondes : un nouveau mini-film chaque jour |
| Fondu | Tout saut dans le film, au départ, vers un moment, une journée, une zone ou un front, fond l'ancienne image dans la nouvelle en une demi-seconde |
| Survol ou pression sur la carte | Le tag du clan à cet endroit |

**Les grands moments sont calculés, jamais écrits à la main** (`src/lib/clanmap/moments.ts`) : premier pixel, meilleure place, plus forte chute, remontée, plus grande poussée, plus dur recul, paliers de pixels. Deux moments trop proches ne se suivent pas : le plus important reste.

Le film dure 60 s à la vitesse × 1, quel que soit le nombre d'images. Il s'arrête hors de l'écran, sa boucle s'arrête quand plus rien ne bouge, et il se charge seulement sur cette page : environ 400 Ko au total. Rien ne clignote : ni éclair, ni étincelle, ni bande de cinéma. Si le film saccade, il coupe seul le halo et baisse un peu sa résolution.

**La caméra ne fait jamais d'à-coup** (`src/lib/fx/camera.ts`). Elle suit sa cible comme un ressort amorti : elle part doucement, ralentit avant d'arriver et ne dépasse jamais la cible. Un mouvement automatique prend environ deux secondes, un cadrage demandé par un clic sur une zone ou un front environ une seconde. À la vitesse × 1, les moments les plus importants ont un plan rapproché, jamais à moins de 14 secondes du précédent, même si celui-ci venait d'un clic, et sans s'approcher plus de trois fois la vue d'ensemble. Aux vitesses × 2 et × 4, seul un moment choisi dans la liste a son plan rapproché. Avec « Suivre GAL », activé d'office sur téléphone, la caméra accompagne le territoire et ne fait aucun plan rapproché. Avant le 8 novembre 2026, chaque moment zoomait vite et fort, et le film à × 4 n'était plus qu'une suite d'allers-retours.

Les couleurs des territoires sont celles que les clans ont choisies dans le jeu : le bleu ciel de GAL n'est pas un jeton du site. Elles peuvent donc être peu contrastées entre elles : les chiffres et les tags en texte restent la référence, et l'option « Griser les autres clans » isole GAL.

**Avec « réduire les animations » :** le film ne démarre pas seul, et s'il tournait, il s'arrête dès que le réglage change, il n'y a ni lueur, ni halo, ni plan rapproché, et la caméra saute directement. Le bouton de lecture, la frise et les sous-titres restent disponibles. **Sans JavaScript ou si le film ne charge pas :** la carte finale et tous les chiffres restent affichés.

Le code est dans `src/scripts/film.ts`. Sa logique testable est dans `src/lib/clanmap/`.

### Donner envie de participer

Sous le film, la page se lit en quatre parties, reliées par « Sur cette page » : **Revoir l'histoire** (grands moments, grandes journées, zones), **Où en est GAL** (objectif et chiffres), **Faire grandir GAL** (façons d'aider, calculateur, donateurs et peintres), puis **Les détails**, repliés (jour après jour, fronts, lecture de la carte). Elle transforme les données publiques en objectif concret. **Aucune de ces parties n'invente un chiffre, et aucune ne pousse à dépenser de l'argent : seules les capsules comptent, jamais le Plutonium.**

| Partie | Contenu | Source |
|---|---|---|
| Prochain objectif | Le clan à dépasser, les pixels manquants, l'avance sur le suivant, et le prochain palier de pixels avec ce qu'il manque | Ordre de la carte officielle, paliers de `src/lib/clanmap/moments.ts` |
| GAL en chiffres | Territoire et record, pris et perdus, premier pixel, réserves du clan et ce qu'elles valent en pixels neutres | Historique de la carte, fiche publique du clan, règles du jeu |
| Votre don sur la carte | Capsules, troupes, pixels, rang obtenu, seul ou avec tous les membres | Calcul, marqué comme simulation |
| Simulation sur la carte | Le territoire s'étend depuis sa frontière sur les terres neutres. La vue recule quand il grandit. | Illustration : le chef et les officiers choisissent où peindre |
| Faire grandir GAL | Don, jeu sous le tag, peinture, avec l'avertissement sur les dons définitifs | Code du jeu, à relire par un membre |
| Plus gros donateurs | Recopiés par le clan s'il choisit de les publier. Sinon, un renvoi vers le jeu. | `content/carte-heros.json` |
| Peuvent peindre pour GAL | Le chef et les officiers, avec un renvoi vers l'encadrement de la page Membres, et vers Ma place sur l'accueil | Rôles de la liste des membres |
| Grandes journées, jour après jour | Le plus fort gain et le plus fort recul d'une journée terminée, puis chaque journée en tableau. Un clic rejoue la journée et s'arrête à sa fin. Sans mouvement : directement la carte de la fin du jour. | Historique daté, jours de Paris |
| Nos territoires, fronts | Un clic cadre la carte sur une zone ou un front, et met le clan adverse en évidence | Carte complète, rejouée |

Ma place, sur l'accueil, donne le rang d'un membre, le prochain joueur à dépasser et son prochain palier : `stats.team`, comme la page Membres. Le calculateur est dans `src/scripts/conquest.ts`, et ses règles dans `src/lib/clanmap/economy.ts`. Pour garder la page courte, seuls le tableau jour après jour, les fronts et la lecture de la carte sont repliés. Tout reste dans le HTML et s'ouvre sans JavaScript.

**Le clic droit garde partout son menu habituel :** plus aucun effet ne le détourne.

**Les animations ne touchent jamais aux valeurs.** Une barre ne change pas de hauteur au survol. Les nouvelles jauges (taux de victoire, créneaux, scores du classement) ont une longueur calculée à partir des données. Le trait rouge d'une jauge (`.meter-tick`, repère du hasard ou des habitudes du clan sur la page Progression) est calculé lui aussi, et sa valeur est écrite à côté. La barre d'un face-à-face (`.split-bar`, page Classement) partage un même total entre trois issues, écrites à côté avec leur nombre. Le rejeu du calculateur vient de `simulateTrace`, et reste un repère indicatif.

**Rien ne peut masquer du contenu.** Aucun bloc n'attend un défilement ou un script pour apparaître : `tests/e2e/fx.spec.ts` le vérifie sur chaque page, avec et sans JavaScript, et vérifie qu'aucune animation ne tourne seule à l'ouverture.

**Pour tout arrêter :** le bouton de lecture du film, ou le réglage « réduire les animations » du système, qui coupe aussi le calculateur, la simulation et le tri. Les scripts le lisent par `src/lib/fx/motion.ts`. Sans JavaScript, le contenu reste complet et les valeurs finales sont déjà dans le HTML. Le bouton pause de l'en-tête a disparu avec les effets continus ; l'ancien choix gardé dans le navigateur (`gal-fx`) est effacé à la visite suivante.

## Accessibilité

- Lien d'évitement, focus visible partout, navigation entièrement utilisable au clavier.
- Aucune animation continue : le film de la carte, seul mouvement de plus de cinq secondes, a son propre bouton de pause, comme l'exige le critère WCAG 2.2.2. Aucune information ne dépend du survol : chaque graphique a sa légende, ses valeurs écrites et son tableau.
- Contraste du texte : 4,5:1 au moins partout, calculé pour chaque jeton (11:1 pour `muted` sur le fond). Les petits textes ne sont plus posés sur des fonds bleus ou des dégradés. Boutons de 40 px de haut au moins, 44 px pour le cas courant.
- Les chiffres qui défilent sont masqués aux lecteurs d'écran, qui reçoivent uniquement la valeur finale.
- Graphiques de la page Progression doublés par des tableaux, identité jamais portée par la seule couleur.
- Tests automatiques axe (WCAG 2.1 A et AA) sur les pages publiques et les deux pages rouges de l'encadrement, en desktop et mobile. Ces tests ne remplacent pas un essai avec un lecteur d'écran, qui n'a pas été fait.
- Absence de défilement horizontal testée à 360, 375, 768, 1 024, 1 280 et 1 920 px. Ces tests tournent sans barre de défilement visible : une vraie barre retire 15 px de largeur, ce qui peut révéler un débordement qu'ils ne voient pas.

## États des données

| État | Affichage |
|---|---|
| Chargement | Arc animé, uniquement pour la liste des membres. Les autres pages arrivent déjà remplies. |
| Vide | « Pas de données », jamais un zéro. Une section de l'accueil sans données n'est pas affichée. |
| Zéro réel | « 0 » ; un taux sans partie affiche « — » |
| Erreur de collecte | Message jaune, dernières données valides conservées |
| Périmé | Message jaune calculé dans le navigateur du visiteur |
| Hors classement | Texte explicite, jamais un rang 0 |

## Évolutions prévues

Ces ajouts hors V1 restent possibles sans refonte :

- **Multilingue :** les textes sont dans les pages, ce qui demandera de les extraire.

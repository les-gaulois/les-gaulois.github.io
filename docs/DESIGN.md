# Design du site [GAL] Les Gaulois

## Intention

Un univers de jeu sombre plutôt qu'une simple page de statistiques. Le guerrier du logo occupe la scène d'ouverture, de grands titres en capitales donnent le ton, et chaque grande section devient une scène avec son propre décor.

Cette approche s'inspire de la façon dont les grands sites de la culture gaming construisent leurs pages : environnement immersif, titres massifs, un seul bouton fort, profondeur par la couleur. Elle ne reprend ni la marque, ni la couleur, ni les polices propriétaires, ni les visuels d'un autre site. L'identité reste celle du clan : bleu, blanc, rouge et son guerrier gaulois. Aucune référence à des personnages ou visuels protégés.

**Lisible et ouvert, depuis le 10 novembre 2026.** Le pilote aimait la lisibilité du site du clan [FR] : tout écrit en gros, des graphiques qui se fondent dans le décor au lieu d'être enfermés dans une case, une page propre. Le site en reprend les principes, courants dans la mise en page, sans copier ce site : ni sa police, ni ses textes, ni ses visuels, ni l'agencement de ses pages. Le texte est plus grand, les chiffres clés s'écrivent en très grand, les graphiques et les groupes d'une scène se posent sur le décor, séparés par un filet. Les scènes colorées, le fond animé, les capitales d'Outfit, le tricolore et le bouton pause restent ceux du clan.

## Organisation du site

Le visiteur doit savoir où chercher, et avoir une raison de revenir. Le plan est dans `src/lib/nav.ts`, et le README en donne le tableau.

- **Six rubriques dans le menu, pas une de plus.** Avec le bouton « Nouveautés », l'en-tête connecté le plus chargé est celui d'un membre validé (lien « QG », nom du compte au plus long) : il garde 117 px de marge à partir de 1 280 px. Celui de l'encadrement (lien « Direction », lien « QG » avec sa pastille à deux chiffres) en garde 147. Mesurés le 9 novembre 2026 avec un faux serveur, quand la pastille était sur « Direction » : elle a changé de lien le 10 novembre, pas de largeur. Une septième rubrique mangerait presque toute cette marge : mesurer de nouveau avant d'en ajouter une. Une rubrique répond à une question : que s'est-il passé, où en est-on, qui sommes-nous, la carte, comment jouer, comment entrer. Son nom ne doit pas se confondre avec un autre : « Guides » plutôt que « Jouer », à cause du bouton « Jouer à OpenFront ».
- **Des onglets dans chaque rubrique.** `SectionNav.astro` les place en haut de page : on passe d'une page à l'autre sans repasser par le menu.
- **Un contenu, une page.** L'accueil résume et renvoie ; il ne recopie pas un bloc entier. Une autre page peut citer un chiffre, en renvoyant à sa page.
- **Une face publique, une face privée.** Le QG (`/qg`, onglet de la rubrique Membres) est réservé aux membres validés : sondages, boîte à idées, mur. Sa page ne contient que la porte, et l'accueil n'en montre qu'un bloc d'entrée. Dans l'en-tête, un membre validé a un lien « QG » avant son nom ; l'encadrement a « Direction » et « QG », sans son nom, et ouvre son compte depuis le QG ou la Direction. La pastille des demandes en attente est sur « QG », où elles se traitent, et le lien mène alors à leur onglet. Sur téléphone, il ne reste que « QG », pour tous : la Direction s'ouvre depuis le QG. Le QG reste bleu : le rouge est réservé à l'encadrement, et ses onglets au QG s'ouvrent dans une zone rouge. Au QG, le refus du serveur s'écrit à l'endroit de l'action, pas en haut de la page, et une photo Discord absente laisse la place à l'initiale du nom : le logo de Discord ne s'affiche jamais. Ailleurs, un membre validé connecté voit la photo de ceux qui se montrent à côté de leur pseudo (podiums, records, encadrement, fiche) : la page publiée n'a qu'un emplacement vide et masqué, `.face-slot` (`.face-slot-lg` sur la fiche), ou l'initiale de `.avatar`, que `src/scripts/visages.ts` remplit. Un visiteur ne voit aucune différence.
- **L'accueil parle d'abord aux membres.** Les boutons du haut mènent au Discord du clan (« Aller sur le Discord ») et au jeu ; l'appel à rejoindre le clan n'est qu'en bas de page.
- **Le chiffre d'abord, l'explication à la demande.** Les précisions de méthode et le périmètre des parties (« parties publiques en équipe jouées avec le tag ») sont dans `ReadingNote.astro`, repliés mais dans le HTML. Ce qui reste visible ne s'y met jamais : mentions de licence, date de mise à jour, pannes et suspensions, couverture de la lecture quand il manque des parties, la période d'un chiffre et une réserve courte sur un taux (« Un lien, pas une preuve »). Pas d'intro qui redit le titre, ni de mode d'emploi évident, ni de rappel « pas du temps réel » sous chaque bloc : le pied de page le dit une fois. Le pilote l'a demandé le 10 novembre 2026 (« il y a beaucoup trop d'écriture »).
- **Une page courte.** Une longue liste montre ses premières lignes et garde le reste à portée : 25 clans au classement, 25 parties dans le journal, les chapitres du guide en sommaire qui s'ouvre, les 6 dernières éditions précédentes de la gazette (`GAZETTE_RECENT_EDITIONS`), et 30 membres, 10 sur téléphone où chacun est une carte. La suite des éditions reste dans le HTML, dans un `<details>` « Voir les N autres » ; la liste des membres et la suite du journal sont chargées par le navigateur (`data/members.json`, `/parties.json`). Sur téléphone, les trois modes du classé tiennent sur une ligne. Mesuré le 9 novembre 2026 à 375 × 812 : Rivaux passe de 10,3 à 7,1 écrans, Membres de 9,7 à 6,8, la Gazette de 8,7 à 5,8. Le pied de page compte pour 1,1 écran de chacune. La page Carte passe de 9,2 à 8,2 : « GAL en chiffres » se replie sur téléphone seulement (`.fold-phone`). Le HTML le donne ouvert, un petit script en ligne le referme sous 48rem avant le premier affichage, et sans script rien n'est caché. Son film et ses grands moments ne se replient pas. Le même jour, elle passe à 8,1 écrans : le territoire et la place de GAL n'y sont écrits qu'une fois hors du film, un bloc sans donnée n'est pas affiché, les réserves sans réponse de la fiche du clan tiennent en une ligne « pas de données », et seule la plus belle journée est mise en avant. Le soir, à la demande du pilote, elle passe à 5,4 écrans : « Faire grandir GAL » et son simulateur sont retirés, et « Revoir l'histoire » se range en tuiles sur toute la largeur. Sur Membres, un pseudo des paliers fait 32 pixels de haut au lieu de 17, toute la ligne d'un membre de l'encadrement mène à sa fiche, et sur téléphone toute la carte d'un membre de la liste aussi.
- **Les espaces de travail en onglets.** Depuis le 10 novembre 2026, à la demande du pilote (« rien n'est rangé », « tout est extrêmement petit »), le QG et la Direction montrent une partie à la fois sous une barre d'onglets (`src/components/compte/Onglets.tsx`, règles dans `src/lib/onglets.ts`), et l'administration a rejoint le QG : `/admin` mène à `/qg#demandes`.
  - **La barre :** une ligne de grands onglets (Outfit 700, 18 px, 52 px de haut), sur fond `night`. L'onglet ouvert a le fond `surface-2` et le filet rouge dessous, le marqueur de page du site. Quand la place manque (téléphone), la barre défile de côté dans son cadre et ses bords s'estompent du côté où d'autres onglets attendent : la page ne s'élargit jamais. Ce ne sont pas des pastilles : elles restent aux onglets de rubrique, qui changent de page.
  - **Les nombres :** un onglet compte ce qui attend le membre derrière lui (« Salons 1 » : un Gaulois attend ; « Décisions 1 » : un sondage sans sa voix ; « Idées 2 » à trancher et « Demandes 2 » pour l'encadrement), en bleu pour un appel, en jaune pour les demandes. Le nombre disparaît une fois l'affaire faite, et les lecteurs d'écran entendent la phrase entière.
  - **Au QG,** les onglets de l'encadrement (Demandes, Comptes, Journal) viennent après un trait, marqués d'un point rouge. « Comptes » et non « Membres » : l'onglet de rubrique « Membres », juste au-dessus, mène à la page publique. Ces onglets et leur partie portent `data-theme="rouge"` : les jetons rouges valent pour elle seule, dans un cadre bordeaux (`.zone-encadrement`). La Direction est rouge en entier.
  - **L'adresse** garde l'onglet ouvert (`#decisions`) sans ajouter de page à l'historique : un lien peut ouvrir un onglet, et un onglet que le compte n'a pas laisse le premier. Au clavier, les flèches, Début et Fin passent d'un onglet à l'autre ; Tab entre dans la partie.
  - **Le roulement :** la partie choisie glisse de 12 px et apparaît en 0,38 s, du côté de son onglet, une seule fois. Le bouton pause et le réglage « réduire les animations » la coupent.
  - **Plus grand :** le conteneur `.espace` redéfinit les tailles de texte de Tailwind (`text-sm` passe à 17 px, le texte courant à 18 px) et son pas d'espacement (× 1,12) : boutons de 48 px, champs de 50 px. Les pages de lecture ont leur propre échelle, un cran plus petite (voir « Typographie »).
  - Une partie cachée reste dans la page : un brouillon ou un appel en cours ne se perd pas d'un onglet à l'autre. Les parties qui lisent le serveur (comptes, journal, sondages de la Direction…) ne le lisent qu'au premier passage.
  - Mesuré le 10 novembre 2026 avec un faux serveur, pied de page compris, pour un fondateur : le QG tenait 6,5 écrans sur bureau (1 280 × 800) et 10,4 sur téléphone (375 × 812) la veille au soir, plus 1,8 et 2,8 pour `/admin` ; en onglets, 1,9 et 3,6 sur l'onglet des salons, 2,1 et 4,1 sur celui des demandes. La Direction passe de 5 à 1,7 écran et de 7,7 à 3,1. Une partie du gain vient des textes raccourcis le même jour. Sur téléphone, toucher un onglet en bas de l'écran fait remonter la barre sous l'en-tête.
- **Un bloc vide n'existe pas.** Sans annonce ni événement, l'accueil n'affiche pas de bloc vide. Au QG, une partie vide n'a pas d'onglet : pas de « Aucun … pour l'instant ». Le mur garde le sien, qui porte le choix de se montrer. De même, une semaine sans palier franchi n'a pas de liste vide dans la gazette. Pour une donnée attendue, « Pas de données » reste la règle : les podiums des Gaulois l'écrivent tant qu'aucune partie n'est lue.
- **Les membres d'abord.** Juste sous l'en-tête de l'accueil, « Les Gaulois de la semaine » (`ClanWeek.astro`) nomme des joueurs : le podium des victoires de la dernière gazette, les plus actifs quand les parties sont relevées, et le fil du clan (paliers franchis, records récents, belle partie d'hier, arrivées). C'est le résumé de la gazette, qui garde le détail : il remplace l'ancien bloc « La gazette du clan ». Une ligne sans donnée n'existe pas ; la réserve « ce n'est pas un classement de niveau » se lit dans les précisions de la gazette. « Ma place dans le clan » et la porte du QG viennent ensuite, côte à côte, puis le classement du clan.
- **Une raison de revenir.** L'accueil dit ce qui a changé depuis la dernière visite, retient son pseudo si on le demande, et donne l'objectif du moment sur la carte et le prochain bilan. Le film de la carte reprend où le visiteur l'avait laissé, et la dernière journée se rejoue d'un clic. La gazette montre la semaine en cours, l'accueil la belle partie d'hier, et un record qui vient de tomber est signalé sur la page Records et dans la gazette. Le membre qui a retenu son pseudo lit aussi son bilan personnel. Chaque fiche de membre a un bouton « Copier le lien » et une image d'aperçu dessinée au build (`src/lib/fiche-image.ts`), pour que le lien collé sur Discord montre le pseudo, la place et le palier. Le site s'installe comme une application depuis le navigateur (`/manifest.webmanifest`), sans rien stocker ni suivre. Tout ce qui est personnel reste dans le navigateur du visiteur.
- **Les nouveautés du site, discrètes mais à portée.** Sur grand écran (`lg` et plus), un bouton « Nouveautés » au style d'un onglet, un peu plus serré, à gauche des boutons de l'en-tête, ouvre un panneau avec les trois dernières mises à jour et le lien vers toutes. En dessous, la place manque dans l'en-tête : l'entrée passe en bas du menu. Un point rouge (`.nouveautes-dot`, 3:1 au moins sur chaque fond) signale une mise à jour parue depuis le dernier passage, sur le bouton ou sur le menu ; il ne clignote pas. Les lecteurs d'écran l'entendent dans le nom du bouton et du lien du menu, et en description du bouton Menu. Pas de bulle flottante : sur la page Carte, les commandes du film occupent le bas de l'écran. La page `/nouveautes` est un onglet de la rubrique Actu.
- **Pas de fondu entre les pages.** Essayé le 7 novembre 2026 avec `@view-transition` : il provoquait des erreurs intermittentes vers la page Carte. Les pages sont statiques, et leur changement est déjà rapide.

## Couleurs

Les jetons sont définis dans `src/styles/global.css`.

| Jeton | Valeur | Usage |
|---|---|---|
| `navy` | `#0A1230` | Environnement de la page, avec une lueur bleue et un reflet rouge |
| `night` | `#060B22` | Pied de page, scènes nocturnes, champs, barre d'onglets |
| `surface` | `#121C3F` | Cartes |
| `surface-2` | `#1A2650` | État actif, avatars |
| `line` | `#2C3A6B` | Bordures |
| `line-strong` | `#5D6C9E` | Contour des champs, carte survolée : 3,2:1 sur une carte |
| `blue` | `#0B5FFF` | **Bouton principal uniquement** |
| `blue-text` | `#9DBCFF` | Liens : le bleu du logo n'est pas assez contrasté sur le fond marine |
| `flag-blue` | `#0B5FFF` | Le bleu du drapeau : filet tricolore, frontière, barre de progression. Il ne change pas avec le thème |
| `red` | `#FF1A2E` | Filet, marqueur de page et de ligne active |
| `muted` | `#C0C9E2` | Texte secondaire |
| `warn` | `#FFC857` | Données périmées et erreurs de collecte, et ce qui attend l'encadrement : demandes à traiter, pastille, points de l'état du site |

**Règle du tricolore :** en accent dans l'interface (filets, soulignement de la page active, loader). Pas de texte blanc sur le rouge vif, trop peu contrasté à petite taille.

### Thème rouge de l'encadrement

`/direction` est rouge, comme les onglets de l'encadrement au QG : l'encadrement sait d'un coup d'œil qu'il est dans son espace. La page passe `theme="rouge"` à `Base.astro`, qui pose `data-theme="rouge"` sur `<html>` ; au QG, seuls les onglets Demandes, Comptes et Journal et leurs parties portent `data-theme="rouge"`. `global.css` redonne alors à chaque jeton une teinte rouge, rôle pour rôle, pour la page ou pour la partie : aucun composant n'a de couleur à lui. Les noms ne changent pas : `navy` y est un bordeaux très sombre, `blue` le rouge du bouton principal.

| Jeton | Thème rouge | Contraste vérifié |
|---|---|---|
| `navy` | `#300A10` | Texte blanc 17,9:1. Le fond porte une lueur rouge et un reflet bleu |
| `night` | `#22060B` | Texte blanc 19,1:1 |
| `surface` | `#3F121A` | Texte blanc 16:1, `muted` 9,6:1, liens 8,1:1 |
| `surface-2` | `#501A23` | Texte blanc 13,9:1, liens 7,1:1 |
| `line` | `#6B2C37` | Bordures |
| `line-strong` | `#9E5D68` | 3,2:1 sur une carte, 3,8:1 sur `night` |
| `blue` | `#D4132F` | Bouton principal : texte blanc 5,3:1, et 7,1:1 au survol (`#B00F27`) |
| `blue-text` | `#FF9DAD` | Liens |
| `muted` | `#E2C0C6` | Texte secondaire |

- Le filet tricolore, la frontière et la barre de progression gardent le bleu du drapeau (`flag-blue`) : c'est l'identité du clan.
- Les effets s'inversent : le rouge mène et le bleu répond. Clic gauche et toucher rouges, clic droit bleu, traînée du curseur et territoires ambiants surtout rouges.
- `.form-problem`, un refus du serveur ou un avertissement comme « Absent de la liste », s'y écrit en jaune `warn`, la couleur de « Plus dans la liste » : en rose, il se perdrait dans le décor.
- `/compte` reste bleu : c'est la page de chaque membre, pas un espace de l'encadrement.
- Un test e2e vérifie que `/direction` est rouge et que toutes les autres pages restent bleues. Axe contrôle aussi ses contrastes, mais les tests construisent le site sans serveur de connexion : il n'y voit que la carte « connexion pas ouverte ». Les vrais écrans (tuiles, formulaires, tableau, onglets, refus en jaune) ont été contrôlés par axe avec un faux serveur, sur bureau et téléphone : le 8 novembre 2026, puis le 10 novembre pour chaque onglet du QG et de la Direction.

## Scènes

Les grandes sections sont des blocs `.stage` à coins de 24 px. La profondeur vient de la couleur, sans ombre portée.

| Classe | Décor | Usage sur l'accueil |
|---|---|---|
| `.stage-blue` | Bleu royal | Classement officiel |
| `.stage-indigo` | Indigo | Parties des 14 derniers jours et dernières parties |
| `.stage-night` | Nuit, avec bordure | Gazette, Ma place, carte des clans, appel à rejoindre |
| `.stage-wine` | Lie-de-vin | Quand jouer |

Une scène associe un texte et des groupes `.panel`. **Pas de case dans la case :** depuis le 10 novembre 2026, un `.panel` n'a ni fond ni cadre. Il se pose sur le décor de la scène, séparé de ce qui le précède par un filet (`--hairline`, blanc à 18 %), et son texte secondaire prend le clair des scènes (`#DBE2F7`). **Ces groupes n'affichent que des données collectées :** graphique des parties, créneaux réels. Aucune maquette ni valeur fictive. Sur `.stage-blue`, les liens s'écrivent en blanc souligné : le bleu des liens n'y a que 4,1:1 au plus clair du dégradé.

**La seule surface flottante du site** est le pop-up des appels des Gaulois (`src/components/compte/AppelsGaulois.tsx`), pour les membres connectés. Il reprend le dégradé de `.stage-blue` par sa variable, sans la classe `.stage` : ni halo, ni inclinaison, ni frontière au survol. Il a des coins de 16 px, une ombre et une bordure blanche de 2 px, qui le détachent de la page. Il garde un fond plein (`bg-blue`) sous le dégradé, pour le mode contraste élevé. Il reste bleu sur `/direction` et dans les parties rouges du QG.

## Typographie

- **Titres :** Outfit, graisse 800, en capitales, interligne serré, approche -0,01 em. Le rendu est proche du lettrage du logo, avec une police libre de droits.
- **Texte :** Inter.
- **Tailles :** dans `main`, chaque taille de texte de Tailwind monte d'un cran : `text-xs` 13 px, `text-sm` 15 px, le texte courant 17 px, `text-lg` 20 px. L'en-tête, le pied de page et les espaces de travail (`.espace`) gardent les leurs. Le titre d'une page va jusqu'à 96 px (`.page-title`), celui d'une section jusqu'à 64 px (`.section-title`), 44 px dans une scène (`.section-title-sm`). Les titres passent à la ligne en lignes équilibrées (`text-wrap: balance`) : pas de mot seul sur la dernière.
- **Chiffres clés :** `.kpi-row` aligne des `.kpi`, chacun avec un libellé court en capitales (`.kpi-label`), le chiffre en très grand (`.kpi-value`, jusqu'à 56 px) et une ligne d'explication (`.kpi-hint`). `.kpi-value-xl` (jusqu'à 72 px) sert aux chiffres du haut d'une page, `.kpi-value-md` à cinq colonnes étroites, `.kpi-value-sm` à la dernière mesure d'une courbe. Pas de case : un filet à gauche de chacun, blanc et plus épais pour le premier d'une liste classée (`.kpi-accent`). Le chiffre ne se coupe jamais ; la rangée passe à la ligne quand la place manque. Mesuré le 10 novembre 2026 : aucun débordement sur 15 pages de 360 à 1 920 px.
- **Chiffres :** chiffres tabulaires (`.tnum`) pour que les colonnes s'alignent. Les milliers sont séparés par l'espace insécable de `src/lib/nombre.ts` : Outfit et Inter ne contiennent pas l'espace fine de `Intl`.
- Les capitales sont appliquées en CSS : le texte d'origine reste en casse normale pour les lecteurs d'écran.
- Les polices sont servies par le site, sans requête vers un service tiers, et préchargées dans l'en-tête de chaque page : le texte s'affiche presque toujours directement dans sa police, au lieu d'une police de remplacement remplacée après coup.
- Les pages se préchargent au survol de leur lien (`prefetch` d'Astro, stratégie `hover`) : la page suivante s'ouvre sans attente.

## Boutons

| Classe | Style | Usage |
|---|---|---|
| `.btn-primary` | Bleu plein | L'action principale, rejoindre le Discord |
| `.btn-secondary` | Blanc plein | L'action associée, jouer à OpenFront |
| `.btn-ghost` | Contour blanc | Liens vers les pages, dans les scènes colorées |

Les boutons ont des coins de 12 px, et `.btn-lg` les agrandit pour les appels principaux.

La pastille `.count-pill` donne, à côté du lien « QG », le nombre de demandes en attente, et le lien mène alors à leur onglet : fond jaune `warn`, texte `navy`, 11,6:1 au moins dans les deux thèmes. Les lecteurs d'écran entendent le texte visible suivi de ce qu'il compte : « QG 2 demandes à traiter ». Jusqu'au 10 novembre 2026, elle était à côté du lien « Direction ».

## Logos

| Fichier | Où |
|---|---|
| Logo vertical | Grand visuel de l'accueil et de la page Rejoindre, sur une lueur bleue |
| Bannière | Bas de l'accueil, image de partage |
| Badge rond | En-tête, favicon recadré en cercle |

Le build en tire des versions légères dans `public/generated/`, et le site n'affiche que celles-ci. Le logo horizontal est en réserve. Les six fichiers d'origine sont conservés dans `brand-sources/`, dont un logo horizontal à lettrage sombre, illisible sur le fond marine. Sans fichier dans `public/brand/`, le site affiche un lettrage provisoire.

## Visualisation de données

- **Posés sur le décor :** depuis le 10 novembre 2026, un graphique n'a pas de case. Ses repères sont à peine visibles (`.chart-gridline`, blanc à 9 %), un filet au-dessus d'une courbe la sépare de sa voisine (`.chart-open`), et sa dernière mesure est écrite en grand au-dessus d'elle. Une courbe (`LineChart.tsx`) a une aire en dégradé qui s'efface vers le bas, un trait qui s'éclaircit vers la fin, un léger halo et un point au bout (`.chart-end`), qui paraît quand le trait l'atteint ; la première et la dernière date sont écrites dessous. La courbe du rang n'a pas d'aire : un rang n'est pas une quantité. Quand la page écrit déjà la dernière valeur juste au-dessus (comparateur de clans), la courbe ne la répète pas en grand (`showValue={false}`). Les grands tableaux (classement, membres, dernières parties) se posent eux aussi sur le fond, sans cadre.
- **Parties par jour :** barres empilées victoires et défaites, en bleu `#4C86F5` et orange `#D9742E`. Palette contrôlée pour les daltonismes. Sur le fond de la page, les barres ont 5,3:1 et 5,7:1, et sur l'indigo de l'accueil 3,3:1 et 3,6:1 au plus clair du dégradé. Une légende et un tableau accompagnent le graphique de la page Progression.
- **Vue « Tout » :** regroupée par semaine, pour garder des barres lisibles en mobile.
- **Rang, score et membres :** trois graphiques distincts, jamais de double axe. Le rang a l'axe inversé. Chacun a sa propre échelle, ce que la page écrit, et un tableau donne les valeurs exactes.
- **Heatmap :** une seule teinte, du sombre au clair, avec le nombre écrit dans chaque case. C'est un vrai tableau HTML. En dessous de 1 024 px, il pivote en une ligne par heure pour tenir sans défilement horizontal.
- **Période en cours :** barre plus pâle.
- **Comparateur de clans (page Nos rivaux) :** un vrai tableau à trois colonnes, sans jauge ni couleur par gagnant : le site ne dit pas lequel des deux est meilleur. L'écart est écrit en toutes lettres, annoncé aux lecteurs d'écran, et doublé d'un tableau repliable dès le deuxième relevé.
- **Paliers (page Membres et fiches) :** du texte et des noms, sans classement de jauges. Sur une fiche, la jauge va du palier atteint au suivant, et sa valeur est écrite juste au-dessus. Au-delà de 12 pseudos, un palier se replie : tout reste dans le HTML et s'ouvre sans JavaScript.
- **Dernières parties :** un vrai tableau à partir de 1 024 px, des cartes en dessous. Les 25 premières lignes sont dans le HTML. Le résultat est écrit en toutes lettres : la pastille bleue ou orange ne porte jamais seule l'information.
- **Sondages (QG et espace Direction) :** une jauge `.meter` par choix, dont la longueur est la part des voix. Le nombre de voix et la part sont écrits à côté, et la jauge est masquée aux lecteurs d'écran. Le choix du membre connecté est écrit en toutes lettres, « votre choix ». Avant la première voix, aucune part n'est inventée : les jauges restent vides et seul « 0 voix » s'affiche.
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
| Défiler | Blocs qui apparaissent en fondu, titres mot à mot, barre de progression, compteurs |
| Survoler le graphique des parties | Colonne glissante, repère de valeur, barres voisines éclairées |
| Cliquer sur un graphique ou la heatmap | Une onde se propage depuis le clic, bleue ou rouge selon le bouton |
| Survoler la heatmap | Réticule sur le jour et l'heure, infobulle qui suit le curseur |
| Changer de période | Barres qui repoussent, balayage tricolore, chiffres qui défilent |
| Trier les membres | Les lignes glissent vers leur nouvelle place |
| Modifier le calculateur | L'attaque se rejoue : le bot est conquis pendant que les troupes fondent |
| Rien | Lente flottaison du logo, petits territoires qui naissent et disparaissent seuls |

**Depuis le 8 novembre 2026, les blocs ne sont plus conquis case par case à leur apparition, et la frontière ne fait plus le tour d'un bloc toute seule.** Le pilote trouvait ces mouvements agressifs : des cases recouvraient ce qu'on lisait. Les blocs apparaissent en fondu, et la conquête reste pour les gestes du visiteur, ses clics et la première vague de l'accueil. Un graphique ou un tableau posé sur le fond sans case (`.fx-block`) apparaît en fondu comme un bloc, et ses animations attendent qu'il entre à l'écran ; dans une scène, il apparaît avec elle. Il n'a ni halo ni onde à lui : leur bord dessinerait la case qu'il n'a plus.

Sur les pages rouges de l'encadrement, le bleu et le rouge échangent leurs rôles dans tous ces gestes : traînée du curseur, clic gauche, toucher et territoires ambiants y sont rouges, le clic droit et l'onde qu'il lance bleus.

### Le film de la carte

C'est le seul effet qui affiche des données : chaque image vient de l'historique officiel de la carte des clans. La page s'ouvre directement sur la carte, en plein écran sur un grand écran, avec le titre, le classement et les commandes posés dessus. Sous 1 200 px, tout s'empile et les commandes restent collées à la carte, dont la hauteur se limite sur un écran en paysage pour garder le bouton de lecture dans le premier écran. La carte finale s'affiche d'abord, puis le film démarre en fondu : du premier pixel à la première visite, et seulement la suite quand le visiteur revient (`src/lib/clanmap/reprise.ts`, à partir du relevé de « Depuis votre dernière visite »).

| Élément | Rôle |
|---|---|
| Lueur bleu pâle | Des pixels que GAL vient de prendre |
| Lueur rouge | Des pixels que GAL vient de perdre |
| Lueur blanche discrète | Un pixel pris par un autre clan |
| Halo fixe | Le territoire de GAL. Il ne clignote pas. |
| Grand moment | Un sous-titre. Les plus importants ont aussi un plan rapproché lent, marqué d'un cercle doux. |
| Classement posé sur la carte | Les 5 plus grands territoires, avec des barres et des places qui glissent. Les valeurs sont celles de l'image affichée. Il occupe l'océan au sud-ouest. |
| Frise, courbe et repères | Position dans l'historique, pixels de GAL tout au long du film, grands moments et vrais jours. Le film suit les événements, pas le temps : une journée active prend plus de place. Les dates écrites sous la frise s'espacent selon la largeur. |
| Date posée sur la carte | Le jour et l'heure de Paris de l'image affichée, à l'heure près. Le curseur donne la même date aux lecteurs d'écran. |
| Griser les autres clans | GAL seul en couleur, sans changer aucun chiffre |
| Vitesse | Un curseur gradué de × 0,1 à × 1, par pas de 0,1, sa valeur écrite à côté. × 1 au départ : jamais plus vite. Les boutons × 2 et × 4, et « Suivre GAL », ont été retirés le 9 novembre 2026 à la demande du pilote. |
| Revoir la dernière journée | Un bouton à côté de la lecture rejoue la dernière journée terminée en quelques secondes : un nouveau mini-film chaque jour |
| Fondu | Tout saut dans le film, au départ, vers un moment, une journée, une zone ou un front, fond l'ancienne image dans la nouvelle en une demi-seconde |
| Survol ou pression sur la carte | Le tag du clan à cet endroit |

**Les grands moments sont calculés, jamais écrits à la main** (`src/lib/clanmap/moments.ts`) : premier pixel, meilleure place, plus forte chute, remontée, plus grande poussée, plus dur recul, paliers de pixels. Deux moments trop proches ne se suivent pas : le plus important reste.

Le film dure 60 s à la vitesse × 1, quel que soit le nombre d'images, et dix fois plus à × 0,1 (`src/lib/fx/speed.ts`). Il s'arrête hors de l'écran, sa boucle s'arrête quand plus rien ne bouge, et il se charge seulement sur cette page : environ 400 Ko au total. Rien ne clignote : ni éclair, ni étincelle, ni bande de cinéma. Si le film saccade, il coupe seul le halo et baisse un peu sa résolution.

**La caméra ne fait jamais d'à-coup** (`src/lib/fx/camera.ts`). Elle suit sa cible comme un ressort amorti : elle part doucement, ralentit avant d'arriver et ne dépasse jamais la cible. Un mouvement automatique prend environ deux secondes, un cadrage demandé par un clic sur une zone ou un front environ une seconde. Les moments les plus importants ont un plan rapproché, à toutes les vitesses et sur toutes les largeurs, jamais à moins de 14 secondes du précédent, même si celui-ci venait d'un clic, et sans s'approcher plus de trois fois la vue d'ensemble. Plus lent que × 1, ces plans s'espacent encore. Avant le 8 novembre 2026, chaque moment zoomait vite et fort, et le film à × 4 n'était plus qu'une suite d'allers-retours ; depuis le 9 novembre, le film ne va plus au-delà de × 1.

Les couleurs des territoires sont celles que les clans ont choisies dans le jeu : le bleu ciel de GAL n'est pas un jeton du site. Elles peuvent donc être peu contrastées entre elles : les chiffres et les tags en texte restent la référence, et l'option « Griser les autres clans » isole GAL.

**Avec « réduire les animations » ou le bouton pause du site :** le film ne démarre pas seul, il n'y a ni lueur, ni halo, ni plan rapproché, et la caméra saute directement. Le bouton de lecture, la frise et les sous-titres restent disponibles. **Sans JavaScript ou si le film ne charge pas :** la carte finale et tous les chiffres restent affichés.

Le code est dans `src/scripts/film.ts`. Sa logique testable est dans `src/lib/clanmap/`.

### Sous le film

Sous le film, la page se lit en trois parties, reliées par « Sur cette page » : **Revoir l'histoire** (grands moments, plus belle journée, zones), **Où en est GAL** (objectif, territoire du moment et chiffres), puis **Les détails**, repliés (jour après jour, fronts, lecture de la carte). Elle transforme les données publiques en objectif concret. **Aucune de ces parties n'invente un chiffre, et aucune ne pousse à dépenser de l'argent : seules les capsules comptent, jamais le Plutonium.** Le 9 novembre 2026, le pilote a retiré « Faire grandir GAL » (façons d'aider, donateurs) et son calculateur « Votre don sur la carte » pour garder la page courte : ne pas les remettre sans sa demande.

**Revoir l'histoire est large et peu haut.** Les grands moments sont des tuiles sur toute la largeur, la date au-dessus du titre : 2 colonnes sur téléphone, 3 dès 640 px, 4 dès 1 024 px, 6 dès 1 280 px. En dessous, la plus belle journée et nos territoires sont côte à côte dès 768 px, les zones en tuiles elles aussi. Une liste d'une seule colonne rendait la partie trois fois plus haute que large.

| Partie | Contenu | Source |
|---|---|---|
| Prochain objectif | Le rang, le clan à dépasser, les pixels manquants, le territoire de GAL et du clan devant (seul endroit hors du film où ils sont écrits), le changement depuis la dernière journée, l'avance sur le suivant, et le prochain palier de pixels avec ce qu'il manque | Ordre de la carte officielle, paliers de `src/lib/clanmap/moments.ts` |
| GAL en chiffres | Plus grand territoire, pris et perdus, premier pixel, réserves du clan et ce qu'elles valent en pixels neutres. Sans réponse de la fiche du clan, les réserves n'ont pas de case : une ligne discrète dit « pas de données » | Historique de la carte, fiche publique du clan, règles du jeu |
| Plus belle journée, jour après jour | Le plus fort gain d'une journée terminée, puis chaque journée en tableau, reculs compris. Un clic rejoue la journée et s'arrête à sa fin. Sans mouvement : directement la carte de la fin du jour. | Historique daté, jours de Paris |
| Nos territoires, fronts | Un clic cadre la carte sur une zone ou un front, et met le clan adverse en évidence | Carte complète, rejouée |

Ma place, sur l'accueil, donne le rang d'un membre, le prochain joueur à dépasser et son prochain palier : `stats.team`, comme la page Membres. Les réserves en pixels neutres suivent les règles de `src/lib/clanmap/economy.ts`. Pour garder la page courte, le tableau jour après jour, les fronts et la lecture de la carte sont repliés à toutes les largeurs. Sous 48rem seulement, « GAL en chiffres » l'est aussi. Tout reste dans le HTML et s'ouvre sans JavaScript ; sans script, ce dernier bloc reste ouvert.

**Le clic droit garde son menu habituel** sur les liens, les boutons, les champs, les images autres que le logo et le texte sélectionné. Maj + clic droit l'ouvre partout.

**Les animations ne touchent jamais aux valeurs.** Une barre ne change pas de hauteur au survol, et l'onde d'un clic ne fait que l'éclairer. Les nouvelles jauges (taux de victoire, créneaux, scores du classement) ont une longueur calculée à partir des données. Le rejeu du calculateur vient de `simulateTrace`, et reste un repère indicatif.

**Un effet ne peut pas masquer du contenu.** La conquête d'un bloc couvre toutes ses cases, ce que des tests vérifient. Un bloc très haut ou une longue liste apparaît en fondu, et un bloc n'attend jamais plus de 0,4 s avant d'apparaître. Si le script ne se charge pas, les blocs s'affichent seuls au bout de 1,5 s.

Le code est dans `src/scripts/fx.ts`, et sa logique testable dans `src/lib/fx/territory.ts`. Les composants Preact utilisent `src/lib/fx/motion.ts` pour savoir si les animations sont permises. Le script pèse environ 15 Ko et la boucle d'animation s'arrête quand l'onglet est masqué.

**Trois façons de couper les effets :** le bouton pause de l'en-tête (le choix est mémorisé), le réglage « réduire les animations » du système, ou l'absence de JavaScript. Dans tous les cas, le contenu reste complet et les valeurs finales sont déjà dans le HTML.

## Accessibilité

- Lien d'évitement, focus visible partout, navigation entièrement utilisable au clavier.
- Animations continues interruptibles par le bouton pause, comme l'exige le critère WCAG 2.2.2. Toutes les interactions à la souris sont décoratives : aucune information n'en dépend.
- Les chiffres qui défilent sont masqués aux lecteurs d'écran, qui reçoivent uniquement la valeur finale.
- Graphiques de la page Progression doublés par des tableaux, identité jamais portée par la seule couleur.
- Tests automatiques axe (WCAG 2.1 A et AA) sur les 13 pages publiques et les deux pages rouges de l'encadrement, en desktop et mobile. Ces tests ne remplacent pas un essai avec un lecteur d'écran, qui n'a pas été fait. Ils ne peuvent pas non plus toujours mesurer un contraste sur un dégradé : le texte des scènes a été choisi clair et vérifié à l'œil sur les captures.
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

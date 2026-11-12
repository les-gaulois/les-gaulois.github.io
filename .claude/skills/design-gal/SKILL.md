---
name: design-gal
description: Règles visuelles du site GAL — jetons de couleur, scènes, boutons, typographie, graphiques, états des données, animations, accessibilité WCAG AA — à appliquer dès qu'on touche à l'apparence (CSS, composants, mise en page, graphiques). Résumé de docs/DESIGN.md, à lire avant tout changement visible.
paths:
  - "src/styles/**"
  - "src/components/**"
  - "src/layouts/**"
  - "src/scripts/**"
---

# Design du site GAL

Un univers de jeu sombre, pas une page de statistiques : grands titres en capitales, un seul bouton fort, profondeur par la couleur, le guerrier du logo en scène d'ouverture. Identité tricolore du clan, aucune référence à des personnages ou visuels protégés. Le détail est dans `docs/DESIGN.md` : le mettre à jour quand une règle change ici.

**Lisible et ouvert (10 novembre 2026) :** tout écrit en gros, chiffres clés en très grand, graphiques et groupes posés sur le décor sans case, séparés par un filet. Principes inspirés du site du clan [FR], jamais copiés (ni police, ni textes, ni visuels, ni agencement). Les scènes colorées, le fond animé et le bouton pause restent : le pilote a rejeté une refonte sobre le 9 novembre.

**Le poste de commandement (12 novembre 2026) :** tout le site prend l'univers du QG et de la Direction, en plus calme : « le site est la table des cartes du clan, la nuit ». Encre `#050B1F` quadrillée de croix toutes les quatre cases (calques fixes `body::before` et `::after`, pages ouvertes à tous seulement : `:root:not([data-ambiance])`), en-tête en vitre sombre avec un horizon tricolore, rubriques et onglets de rubrique (`.rubrique-onglet`) en chasse fixe, invite décorative `gal@clan:~/rubrique$ ./page` au-dessus de chaque titre (`Invite.astro`, `invite()` de `src/lib/nav.ts` ; jamais l'identifiant d'un joueur), une lumière qui passe une fois sur le titre, scènes au coin haut droit coupé, libellés des chiffres en chasse fixe, et à l'accueil le guerrier en mode Matrix (72 colonnes) qui tombe dans ses couleurs au-dessus d'un socle de lumière. JetBrains Mono est préchargée sur toutes les pages. Pas de lignes d'écran, de titre décalé, de vert ni de cadres doubles hors du QG et de la Direction. Détail dans `docs/DESIGN.md`, « Le poste de commandement ».

## Jetons (`src/styles/global.css`)

| Jeton | Usage |
|---|---|
| `navy` `#050B1F` | Fond de page (l'encre du poste de commandement ; `#0A1230` avant le 12 novembre 2026) |
| `night` `#020614` | Pied de page, scènes nocturnes, champs, barre d'onglets |
| `surface` `#0A1433` / `surface-2` `#13214D` | Cartes / état actif, avatars |
| `line` `#1B2B5E` | Bordures |
| `line-strong` `#5469AE` | Contour des champs, carte survolée (3,45:1 sur une carte) |
| `blue` `#0B5FFF` | **Bouton principal seulement** |
| `blue-text` `#9DBCFF` | Liens (le bleu du logo manque de contraste sur le marine) |
| `flag-blue` `#0B5FFF` | Bleu du drapeau : filet tricolore, frontière, barre de progression. Ne change jamais avec le thème |
| `red` `#FF1A2E` | Filets, marqueur de page et de ligne active. Jamais de texte blanc dessus en petite taille |
| `muted` `#C0C9E2` | Texte secondaire |
| `warn` `#FFC857` | Données périmées et erreurs de collecte, et ce qui attend l'encadrement (demandes à traiter, pastille `.count-pill`, état du site) |
| `ok` `#A6E3B4` | Une réussite : message après un envoi (`.form-success`), `[ OK ]` de l'état du site |

Pas de couleur en dur dans un composant : un jeton, ou une classe de `global.css`. Les couleurs des territoires sur la carte sont celles des clans dans le jeu, pas des jetons.

**Thème rouge de l'encadrement :** `/direction` passe `theme="rouge"` à `Base.astro`, qui pose `data-theme="rouge"` sur `<html>`, et `fx.ts` inverse ses couleurs : le rouge mène, le bleu répond. L'administration (Demandes, Comptes, Journal) est dans la Direction depuis le 12 novembre 2026 : plus aucun onglet rouge au QG. `global.css` redonne alors à chaque jeton une teinte rouge, rôle pour rôle (valeurs et contrastes dans `docs/DESIGN.md`). `/admin` ne fait plus que mener à la Direction. Une future page de l'encadrement passe la même option ; une page de membre, comme `/compte`, reste bleue. Le tricolore garde `flag-blue`, et `.form-problem` (refus du serveur, « Absent de la liste ») s'y écrit en jaune `warn`.

**Ambiance console de la Direction (11 novembre 2026) :** `/direction` passe aussi `ambiance="console"` (`data-ambiance="console"` sur `<html>`) : grille des cases de conquête et lignes de balayage fixes derrière le contenu, invite `gal@direction:~$` décorative, chasse fixe JetBrains Mono (`--font-console`, jamais `--font-mono`) pour ce que dit la machine, « > » sur l'onglet ouvert, repères aux coins des cartes, `[ OK ]` dans l'état du site. Seuls mouvements : l'invite qui s'écrit et une bande de lumière, une fois à l'ouverture. Les classes `console-*` ne font rien sans l'ambiance. Pas de capitales sur un texte qu'il faut retaper. Un seul style, **Terminal** (`data-console="terminal"`, choisi par le pilote parmi trois ; Matrice et Opérations écartés) : écran plus noir, tout en chasse fixe sauf le grand titre, « ## » devant les titres, « > » devant les boutons, une commande `gal@direction:~$ ./partie` au-dessus de chaque partie, cadres en traits doubles, vert de terminal pour les « OK », les commandes et les chiffres (le jaune de ce qui attend reste jaune), le logo du guerrier en mode Matrix (`LogoMatrice.tsx` : caractères qui tombent en vert puis prennent ses couleurs ; grand dans l'en-tête, en points dans le menu). La barre d'onglets est remplacée par un menu déroulant à toutes les largeurs (`Onglets` avec `menu`), en arborescence. Détail dans `docs/DESIGN.md`.

**Le QG en style Terminal (12 novembre 2026) :** `/qg` passe aussi `ambiance="console"`, sans thème rouge : le même Terminal en bleu, la couleur des membres, aussi sombre que le rouge de la Direction (`navy` `#03081A`, boutons `#0A4FD6`). Le bloc rouge du Terminal redonne `blue` à la Direction : sans lui, la règle bleue, plus forte que `[data-theme="rouge"]`, l'emporterait sur sa racine. La machine des commandes vient de `--console-hote`, posé par la page (`gal@qg`, `gal@direction`). Le même jour, à la demande du pilote, le QG prend le menu déroulant de la Direction à la place de sa barre d'onglets, et chaque partie des deux menus a une petite icône gauloise dessinée en pixels (`src/lib/icones-parties.ts`, `IconePartie.tsx`), verte comme une commande, blanche dans la partie ouverte. Une pastille `.chip` ne prend jamais le vert des chiffres. Détail dans `docs/DESIGN.md`, « Le QG en style Terminal ».

## Scènes, cartes, boutons

- Grandes sections : `.stage` à coins de 10 px, coin haut droit coupé, décor `.stage-blue`, `.stage-indigo`, `.stage-night`, `.stage-wine`. Profondeur par la couleur, sans ombre portée. Un groupe `.panel` dans une scène n'a ni fond ni cadre : un filet au-dessus (`--hairline`). Il n'affiche que des données collectées : aucune maquette, aucune valeur fictive. Sur `.stage-blue`, les liens sont blancs soulignés.
- Chiffres clés : `.kpi-row` > `.kpi` (`.kpi-label`, `.kpi-value` et ses tailles `-xl` `-md` `-sm`, `.kpi-hint`), un filet à gauche, `.kpi-accent` pour le premier d'une liste classée. Le chiffre ne se coupe pas : vérifier qu'il tient de 360 à 1 920 px.
- Cartes : `.card`, pour les listes et les espaces de travail ; pas autour d'un graphique. Largeur de page : `.wrap`. Un graphique ou un tableau posé sur le fond porte `.fx-block` pour apparaître en fondu.
- Boutons : `.btn-primary` (bleu plein, l'action principale, rejoindre le Discord), `.btn-secondary` (blanc plein, jouer à OpenFront), `.btn-ghost` (contour blanc, liens dans les scènes). Coins 6 px, `.btn-lg` pour les appels principaux. `.btn` écrase `hidden` : masquer via un conteneur.
- Bouton Discord : texte seul, pas de logo ni de couleur de la marque.

## Typographie

Titres en capitales appliquées en CSS (le texte source reste en casse normale pour les lecteurs d'écran), lignes équilibrées, `.page-title` pour le H1 (jusqu'à 96 px), `.section-title` (64 px), `.section-title-sm` (44 px). Texte en Inter ; dans `main`, l'échelle de Tailwind monte d'un cran (17 px courant, `text-sm` 15 px, `text-xs` 13 px). Chiffres tabulaires `.tnum` dans les colonnes. Polices servies par le site, aucun service tiers.

**L'onciale de cases (12 novembre 2026) :** sur les pages ouvertes à tous, titres et gros chiffres dans « GAL Onciale », une police dessinée pour le site : l'onciale des vieux manuscrits (celle qu'on associe aux Celtes) posée case par case comme un territoire d'OpenFront (« design gaulois - hacker », demandé par le pilote). Dessins dans `src/lib/police/onciale.ts` (OFL-1.1, tirée d'Uncial Antiqua, voir `NOTICE.md`), police fabriquée au build par `scripts/generate-police.ts`. Les `h1`, `.section-title` et `.kpi-value` en cases visibles (`--font-cases`, la version choisie par le pilote) ; petits `h2`, `h3` et `.font-display` en cases pleines (`--font-display`). Toutes les pages sauf le QG et la Direction, qui gardent Outfit 800 : `Base.astro` pose `data-lettres="onciale"` sur `<html>`, même pour une page qui passerait en ambiance console, et les règles sont sous ce sélecteur. Plus large qu'Outfit : un titre de page se réduit pour que son plus long mot tienne (`--mot-em`, `motLePlusLong`) ; un nouveau titre de section au long mot fait de même. Un caractère absent passe en Outfit, puis à la police de l'appareil (le cyrillique) ; pour un signe qui manque souvent, l'ajouter au dessin plutôt que de laisser le secours. Détail dans `docs/DESIGN.md`, « L'onciale de cases ».

## Graphiques

- Sans case : repères `.chart-gridline` à peine visibles, `.chart-open` (filet au-dessus) entre deux courbes, dernière mesure en grand au-dessus. Courbe : aire en dégradé vers le fond, halo léger, point au bout `.chart-end` ; pas d'aire sous le rang. Dégradés SVG en `userSpaceOnUse` (un trait plat garde le sien) et identifiant propre à chaque courbe.
- Victoires et défaites : bleu `#4C86F5` et orange `#D9742E`, palette contrôlée pour les daltonismes.
- Un graphique par mesure, jamais de double axe. Le rang a l'axe inversé. La période en cours est plus pâle.
- Chaque graphique est doublé d'un tableau ou d'une légende lisible, et l'information n'est jamais portée par la seule couleur.
- Heatmap : une teinte, le nombre écrit dans chaque case, vrai tableau HTML, pivot sous 1 024 px.

## États des données

| État | Affichage |
|---|---|
| Vide | « Pas de données », jamais un zéro ; une scène sans données ne s'affiche pas |
| Zéro réel | « 0 » ; un taux sans partie affiche « — » |
| Erreur de collecte | Message `warn`, dernières données valides conservées |
| Périmé | Message `warn` calculé dans le navigateur (`DataStatus.astro`) |
| Hors classement | Texte explicite, jamais un rang 0 |
| Chargement | Arc animé, seulement pour la liste des membres |

## Mouvement

- Les effets (`src/scripts/fx.ts`, logique dans `src/lib/fx/`) sont décoratifs : ils n'affichent aucune donnée et ne changent jamais une valeur. Une barre ne grandit pas au survol ; une onde ne fait qu'éclairer.
- Un effet ne masque jamais du contenu : un bloc apparaît au plus tard après 0,4 s, et sans script après 1,5 s.
- Trois façons de tout couper, à garder : bouton pause de l'en-tête (choix mémorisé dans `localStorage` sous `gal-fx`), réglage système « réduire les animations », absence de JavaScript. Dans ces trois cas le contenu reste complet et les valeurs finales sont dans le HTML.
- Clic droit : menu natif conservé sur les liens, boutons, champs, images autres que le logo, texte sélectionné, et partout avec Maj.
- Rien ne clignote ; la boucle s'arrête quand l'onglet est masqué.

## Accessibilité

Lien d'évitement, focus visible partout, navigation clavier complète, WCAG 2.1 AA vérifié par axe sur chaque page en desktop et mobile, aucun défilement horizontal de 360 à 1 920 px (tester 360, 375, 768, 1 024, 1 280, 1 920). Les chiffres animés sont masqués aux lecteurs d'écran, qui reçoivent la valeur finale. Images décoratives : `alt=""`.

## Interdit

Références à Astérix, copie du site du clan [FR], marque Discord, logo d'OpenFront ou mise en page qui ferait passer le site pour officiel, texte blanc sur rouge vif, données d'exemple dans l'interface, couleurs en dur.

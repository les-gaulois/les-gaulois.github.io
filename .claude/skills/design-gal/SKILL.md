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

Un univers de jeu sombre, pas une page de statistiques : grands titres en onciale de cases, un seul bouton fort, profondeur par la couleur, le guerrier du logo en scène d'ouverture. Identité tricolore du clan, aucune référence à des personnages ou visuels protégés. Le détail est dans `docs/DESIGN.md` : le mettre à jour quand une règle change ici.

**Lisible et ouvert (10 novembre 2026) :** tout écrit en gros, chiffres clés en très grand, graphiques et groupes posés sur le décor sans case, séparés par un filet. Principes inspirés du site du clan [FR], jamais copiés (ni police, ni textes, ni visuels, ni agencement). Les scènes colorées, le fond animé et le bouton pause restent : le pilote a rejeté une refonte sobre le 9 novembre.

**Le poste de commandement (12 novembre 2026) :** tout le site prend l'univers du QG et de la Direction, en plus calme : « le site est la table des cartes du clan, la nuit ». Encre quadrillée de croix toutes les quatre cases (calques fixes `body::before` et `::after`, pages ouvertes à tous seulement : `:root:not([data-ambiance])`), en-tête en vitre sombre avec un horizon tricolore, rubriques et onglets de rubrique (`.rubrique-onglet`) en chasse fixe, invite décorative `gal@clan:~/rubrique$ ./page` au-dessus de chaque titre (`Invite.astro`, `invite()` de `src/lib/nav.ts` ; jamais l'identifiant d'un joueur), scènes au coin haut droit coupé, libellés des chiffres en chasse fixe, et à l'accueil le guerrier en mode Matrix (72 colonnes) qui tombe dans ses couleurs au-dessus d'un socle de lumière. JetBrains Mono est préchargée sur toutes les pages. Pas de lignes d'écran, de titre décalé, de vert ni de cadres doubles hors du QG, de la Direction, de la Carte et du guide du clan. Détail dans `docs/DESIGN.md`, « Le poste de commandement ».

**Les images du robot sur Discord** (gazette, alertes, paliers, records, messages du jour, course du soir, victoires, aperçus des liens) suivent ce style depuis le soir du 12 novembre 2026 : table des cartes en fond, invite de la page où mène le bouton, titre en onciale de cases avec sa lettrine rouge, chiffres clés comme ceux du site, coins nets. Une nouvelle image part des morceaux communs de `src/lib/gazette-image.ts` (`pageHead`, `kpiParts`, `pageFoot`) et `src/lib/salon-image.ts` (lignes, pastilles, faits), et se regarde avec `npm run images:apercu`. Détail dans `docs/DESIGN.md`, « Les images du robot ».

**Le guide du clan (12 novembre 2026) :** `/debuter` ne porte plus que le guide du clan, « interactif, très intuitif », « pas surchargé », « avec un design de hacker gaulois », et depuis le soir même dans le style console de la Carte (« Oui, comme la Carte ») : la page passe `ambiance="console"`, le Terminal du QG, sur le bleu du site depuis le 13 novembre 2026. Un chapitre à la fois dans une fenêtre en traits doubles (`.guide-chapitre` : pas une `.card`, donc ni halo ni frontière au survol), sa barre de titre (`■ bases`), sa ligne de commande (`gal@guide:~$ ./bases`), son titre précédé de « ## » ; un sommaire en arborescence (`.guide-plan`, replié sous un bouton sur téléphone), le chapitre ouvert en vidéo inversée ; une icône en pixels par chapitre (dessins de `icones-parties.ts`) ; l'essentiel en quatre phrases au plus derrière des « > », en mots et jamais en signes (« 1 troupe sur 5 », pas « ÷ 5 » : demandé par le pilote après relecture) ; puis le bloc du chapitre : un essai à manipuler quand il aide à comprendre (`src/components/guide/Essai.tsx`, étiquette « essai », curseur `Reglage.tsx`, résultat en `.kpi`) ou des repères sans script, et « Détails et formules » replié. Le vert de terminal n'est que la voix de la machine (commandes, `~/guide`, « > », icônes, jalons) : jamais une phrase, un chiffre ni un libellé (« essai » est gris), un test le garde. Sans JavaScript, tous les chapitres se suivent. Rien d'inventé : phrases du Guide Gaulois, chiffres de `src/lib/guide-clan.ts` et `src/lib/growth.ts`. Détail dans `docs/DESIGN.md`, « Le guide du clan ».

## Jetons (`src/styles/global.css`)

| Jeton | Usage |
|---|---|
| `navy` `#0A1230` | Fond de toutes les pages ouvertes à tous, Carte et guide compris (`#050B1F` du 12 au 13 novembre 2026). Le QG et la Direction ont la palette du Terminal |
| `night` `#081029` | Champs, barre d'onglets. Plus de noir : pied de page et scène « nuit » ont le bleu de la page et des cartes |
| `surface` `#101B45` / `surface-2` `#182658` | Cartes, fond des grands tableaux, scène « nuit » / état actif, avatars, en-tête des tableaux |
| `line` `#24346B` | Bordures |
| `line-strong` `#5469AE` | Contour des champs, carte survolée (3,19:1 sur une carte) |
| `blue` `#0B5FFF` | **Bouton principal seulement** |
| `blue-text` `#9DBCFF` | Liens (le bleu du logo manque de contraste sur le marine) |
| `flag-blue` `#0B5FFF` | Bleu du drapeau : filet tricolore. Ne change jamais avec le thème |
| `red` `#FF1A2E` | Filets, marqueur de page et de ligne active, lettrines (page et section), repère du premier chiffre clé, barre de lecture. Jamais en fond, jamais de texte blanc dessus en petite taille |
| `muted` `#C0C9E2` | Texte secondaire |
| `warn` `#FFC857` | Données périmées et erreurs de collecte, et ce qui attend l'encadrement (demandes à traiter, pastille `.count-pill`, état du site) |
| `ok` `#A6E3B4` | Une réussite : message après un envoi (`.form-success`) ; à la Direction, ce qui est en règle ou fait (« Validé », « OK », « Branché ») |
| `danger` `#FF6B6B` | Ce qui est bloqué ou en échec, en texte (compte suspendu, lien refusé) ; les boutons qui retirent, au survol ou au clavier seulement. Jamais en fond plein sous du texte blanc |
| `ally` `#9DBCFF` | Un joueur allié dans l'onglet Comptes ; ailleurs à la Direction, une information sans jugement. Ne change pas avec le thème |

Pas de couleur en dur dans un composant : un jeton, ou une classe de `global.css`. Les couleurs des territoires sur la carte sont celles des clans dans le jeu, pas des jetons.

**Onglets de la Direction :** pièces communes de `src/components/compte/direction-kit.tsx` (`Pastille`, `useBarreCollante`) et classes `dir-*` / attribut `data-dir-ton` de `global.css` : une couleur par état, toujours avec son mot. Un onglet a sa section CSS sous sa classe `dir-<onglet>`. Détail : `docs/DESIGN.md`, « Les douze autres onglets de la Direction ».

**Thème rouge de l'encadrement :** `/direction` passe `theme="rouge"` à `Base.astro`, qui pose `data-theme="rouge"` sur `<html>`, et `fx.ts` inverse ses couleurs : le rouge mène, le bleu répond. L'administration (Demandes, Comptes, Journal) est dans la Direction depuis le 12 novembre 2026 : plus aucun onglet rouge au QG. `global.css` redonne alors à chaque jeton une teinte rouge, rôle pour rôle (valeurs et contrastes dans `docs/DESIGN.md`). `/admin` ne fait plus que mener à la Direction. Une future page de l'encadrement passe la même option ; une page de membre, comme `/compte`, reste bleue. Le tricolore garde `flag-blue`, et `.form-problem` (refus du serveur, « Absent de la liste ») s'y écrit en jaune `warn`.

**Ambiance console de la Direction (11 novembre 2026) :** `/direction` passe aussi `ambiance="console"` (`data-ambiance="console"` sur `<html>`) : grille des cases de conquête et lignes de balayage fixes derrière le contenu, invite `gal@direction:~$` décorative, chasse fixe JetBrains Mono (`--font-console`, jamais `--font-mono`) pour ce que dit la machine, « > » sur l'onglet ouvert, repères aux coins des cartes, pastilles « OK », « À voir », « Info » dans l'état du site. Seuls mouvements : l'invite qui s'écrit et une bande de lumière, une fois à l'ouverture. Les classes `console-*` ne font rien sans l'ambiance. Pas de capitales sur un texte qu'il faut retaper. Un seul style, **Terminal** (`data-console="terminal"`, choisi par le pilote parmi trois ; Matrice et Opérations écartés) : écran plus noir, tout en chasse fixe sauf le grand titre, « ## » devant les titres, « > » devant les boutons, une commande `gal@direction:~$ ./partie` au-dessus de chaque partie, cadres en traits doubles, vert de terminal pour le voyant de la session, les commandes et les icônes, jamais pour un texte ni un chiffre depuis le 12 novembre 2026, le logo du guerrier en mode Matrix (`LogoMatrice.tsx` : caractères qui tombent en vert puis prennent ses couleurs ; grand dans l'en-tête, en points dans le menu). La barre d'onglets est remplacée par un menu déroulant à toutes les largeurs (`Onglets` avec `menu`), en arborescence. Détail dans `docs/DESIGN.md`.

**Le QG en style Terminal (12 novembre 2026) :** `/qg` passe aussi `ambiance="console"`, sans thème rouge : le même Terminal en bleu, la couleur des membres, aussi sombre que le rouge de la Direction (`navy` `#03081A`, boutons `#0A4FD6`). Le bloc rouge du Terminal redonne `blue` à la Direction : sans lui, la règle bleue, plus forte que `[data-theme="rouge"]`, l'emporterait sur sa racine. La machine des commandes vient de `--console-hote`, posé par la page (`gal@qg`, `gal@direction`). Le même jour, à la demande du pilote, le QG prend le menu déroulant de la Direction à la place de sa barre d'onglets, et chaque partie des deux menus a une petite icône gauloise dessinée en pixels (`src/lib/icones-parties.ts`, `IconePartie.tsx`), verte comme une commande, blanche dans la partie ouverte. Le soir, le pilote a trouvé « un peu trop de vert dans les écritures » : comme sur la Carte, aucun texte ni chiffre du QG n'est vert, le vert n'y est que la voix de la machine (invite, ligne de commande d'une partie, `~/qg`, « > », icônes) ; ses grands chiffres (`.console-valeur`) sont blancs, avec la lueur bleue des champs. La Direction a suivi le même soir, à sa demande : ses grands chiffres sont blancs, avec la lueur rouge des champs. Un test de `site.spec.ts` garde la règle aux deux pages. Détail dans `docs/DESIGN.md`, « Le QG en style Terminal ».

**La carte en console (12 novembre 2026) :** à la demande du pilote (« un design hacker très prononcé », « tout interactible depuis la carte », sans descendre dans la page), `/carte` passe aussi `ambiance="console"`, en bleu, et devient une console qui tient dans l'écran : la carte, la lecture du film, puis une rangée d'entrées (icône en pixels et nom) qui ouvrent une fenêtre à la fois, posée sur la carte sur un écran large, sous la carte sur téléphone. La page ne défile pas ; sans script, elle défile et tout se lit l'un sous l'autre. Les fenêtres sont dans `FENETRES` (`src/lib/carte-console.ts`), leur gabarit dans `src/components/carte/Fenetre.astro`, le style dans `global.css`, section « La carte en console ». Une nouvelle fenêtre : un nom de huit lettres au plus, une icône à elle, et son contrôle axe (le test de `carte.spec.ts` les ouvre toutes). Le crédit « © OpenFront and Contributors · CC BY-SA 4.0 » posé sur la carte ne se retire pas : la page n'a plus de bas de page. Le vert de terminal n'y sert qu'aux lignes de commande, à `~/carte`, aux « > » et aux icônes : textes et chiffres en blanc et en gris (le pilote : « trop de verts dans les textes », le 12 novembre 2026). Tailles de texte, écrans bas et place de la carte sur un portable : `docs/DESIGN.md`, « La carte en console ».

## Scènes, cartes, boutons

- Grandes sections : `.stage` à coins de 10 px, coin haut droit coupé, décor `.stage-blue`, `.stage-indigo`, `.stage-night`, `.stage-wine`. Profondeur par la couleur, sans ombre portée. Un groupe `.panel` dans une scène n'a ni fond ni cadre : un filet au-dessus (`--hairline`). Il n'affiche que des données collectées : aucune maquette, aucune valeur fictive. Sur `.stage-blue`, les liens sont blancs soulignés.
- Entre deux parties d'une page : l'écart `section` (`mt-section`, `mb-section`, `gap-section`, jeton `--spacing-section` : 80 px sur téléphone, jusqu'à 160 px sur grand écran), demandé par le pilote les 12 et 13 novembre 2026 (« laisser respirer », « encore plus d'air »). Pas entre un bloc et sa note, sa date ou sa couverture, ni dans une scène, ni sous le titre de la page. Quand la première partie peut manquer, l'écart va sous elle (`mb-section`), pas au-dessus de la suivante : sinon, sans elle, un trou se creuse sous le titre de la page.
- Toute la largeur de l'écran (« tu n'utilises que la dimension d'un A4 ») : `.wrap` va jusqu'à `--wrap-max` (120 rem) avec des marges `--wrap-marge` (16 px, 4 % de la largeur, 80 px au plus) ; les pages en console gardent 75 rem dans `main`. Une formule qui dépend de la largeur du contenu (taille des titres en onciale) passe par ces deux variables, jamais par « 75rem ».
- Chiffres clés : `.kpi-row` > `.kpi` (`.kpi-label`, `.kpi-value` et ses tailles `-xl` `-md` `-sm`, `.kpi-hint`), un filet à gauche, `.kpi-accent` pour le premier d'une liste classée. Le chiffre ne se coupe pas : vérifier qu'il tient de 360 à 1 920 px.
- Cartes : `.card`, pour les listes et les espaces de travail ; pas autour d'un graphique. Largeur de page : `.wrap`. Un graphique ou un tableau posé sur le fond porte `.fx-block` pour apparaître en fondu.
- Boutons : `.btn-primary` (bleu plein, l'action principale, rejoindre le Discord), `.btn-secondary` (blanc plein, jouer à OpenFront), `.btn-ghost` (contour blanc, liens dans les scènes). Coins 6 px, `.btn-lg` pour les appels principaux. `.btn` écrase `hidden` : masquer via un conteneur.
- Menus déroulants : tout ce qui se déplie est un `<details class="fold">`, sur le modèle de « Détails et formules » du guide (filet, libellé en chasse fixe dans le bleu des liens, « + » au bout, voir `docs/DESIGN.md`). Les menus de navigation (en-tête, menu des parties, sommaire du guide) gardent leur bouton, et la Direction son dessin d'avant.
- Bouton Discord : texte seul, pas de logo ni de couleur de la marque.

## Typographie

Titres en lignes équilibrées, `.page-title` pour le H1 (jusqu'à 96 px), `.section-title` (64 px), `.section-title-sm` (44 px). Sur les pages ouvertes à tous, ils s'écrivent en minuscules avec une lettrine (ci-dessous) ; au QG, à la Direction, sur la Carte et dans le guide du clan, en capitales appliquées en CSS (le texte source reste en casse normale pour les lecteurs d'écran). Texte en Inter ; dans `main`, l'échelle de Tailwind monte d'un cran (17 px courant, `text-sm` 15 px, `text-xs` 13 px). Chiffres tabulaires `.tnum` dans les colonnes. Polices servies par le site, aucun service tiers.

**Depuis le 12 novembre 2026 (remarques transmises par le pilote) :** pas de gras dans une phrase (le gras reste aux titres, gros chiffres, libellés et avertissements) ; texte courant en blanc adouci (`--texte-courant`). Un pseudo qui mène à une fiche porte `.pseudo` (blanc, jaune et souligné au survol), avec `.pseudo-phrase` au milieu d'une phrase (trait pâle, WCAG 1.4.1) ; jamais un lien bleu souligné. Date de mise à jour, période, relevé, compteurs : `.info-discrete` (13 px, italique, gris). Jauges `.meter` d'une seule couleur, jamais en dégradé.

**L'onciale de cases (12 novembre 2026) :** sur les pages ouvertes à tous, titres et gros chiffres dans « GAL Onciale », une police dessinée pour le site : l'onciale des vieux manuscrits (celle qu'on associe aux Celtes) posée case par case comme un territoire d'OpenFront (« design gaulois - hacker », demandé par le pilote). Dessins dans `src/lib/police/onciale.ts` (OFL-1.1, tirée d'Uncial Antiqua, voir `NOTICE.md`), police fabriquée au build par `scripts/generate-police.ts`. Les `h1`, `.section-title` et `.kpi-value` en cases visibles (`--font-cases`, la version choisie par le pilote) ; petits `h2`, `h3` et `.font-display` dans les mêmes lettres « taillées » (`--font-display`) : plus de marches d'escalier, parce que le pilote trouvait ces textes trop pixélisés (`tailler`, dans `src/lib/police/cases.ts`). Dans un dessin, deux cases se touchent par un côté, jamais par un seul coin (sauf, dans le « @ », entre l'anneau et la lettre). Toutes les capitales ont la même hauteur et une forme courante là où l'onciale se lisait mal (le pilote : « le d qui ressemble à un A », « le L trop grand ») : ne pas remettre de capitale plus haute ou plus basse que les autres, ni de lettre ambiguë. **Minuscules et lettrines (choisies par le pilote sur captures, le 12 novembre 2026) :** chaque minuscule a son dessin, dans une forme courante (œil de 8 cases, hampes à la hauteur des capitales, jambages trois cases sous la ligne ; un e à boucle fermée, le e oncial se lisait « € » dans « 2e »), et les titres ne sont plus en capitales. Interligne de 1,15 : sur deux lignes, un jambage ne doit pas toucher la ligne du dessous (crochets et capitales accentuées compris). La première lettre d'un `h1` est une lettrine rouge de 1,45 em (`LETTRINE_TITRE`, comptée dans `--mot-em`), sauf quand le titre est un pseudo (`lettrine={false}` sur `PageHeader` : un nom s'écrit tel quel) ; celle d'un `.section-title` fait 1,3 em, en bleu éclairci, blanche dans une scène. Chaque règle de lettrine vise deux cas : le premier bloc `.fx-word` (avec les effets, `fx.ts` pose chaque mot du titre dans un bloc) et le titre lui-même (mouvement réduit) ; contrôler toute règle sur les titres dans les deux cas, pas seulement en mouvement réduit. Les pages en ambiance console et les étiquettes `.uppercase` gardent leurs capitales, sans lettrine. Toutes les pages sauf le QG et la Direction, qui gardent Outfit 800 : `Base.astro` pose `data-lettres="onciale"` sur `<html>`, même pour une page qui passerait en ambiance console, et les règles sont sous ce sélecteur. Plus large qu'Outfit : un titre de page se réduit pour que son plus long mot tienne (`--mot-em`, `motLePlusLong`) ; un nouveau titre de section au long mot fait de même. Un caractère absent passe en Outfit, puis à la police de l'appareil (le cyrillique) ; pour un signe qui manque souvent, l'ajouter au dessin plutôt que de laisser le secours. Détail dans `docs/DESIGN.md`, « L'onciale de cases ».

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

---
name: design-gal
description: Règles visuelles du site GAL — jetons de couleur, polices, sections et cartes, boutons, graphiques, états des données, mouvement, accessibilité WCAG AA — à appliquer dès qu'on touche à l'apparence (CSS, composants, mise en page, graphiques). Résumé de docs/DESIGN.md, à lire avant tout changement visible.
paths:
  - "src/styles/**"
  - "src/components/**"
  - "src/layouts/**"
  - "src/scripts/**"
---

# Design du site GAL

Le journal d'un clan de stratégie : un fond nuit uni, de grands titres à empattements en casse normale, des chiffres posés comme un tableau de score, un seul bouton fort par section. Identité tricolore du clan en accent, jamais en fond ; aucune référence à des personnages ou visuels protégés. Le détail est dans `docs/DESIGN.md` : le mettre à jour quand une règle change ici.

Refondu le 9 novembre 2026 à la demande du pilote, qui trouvait que le site « faisait généré par IA » : polices par défaut, tout en capitales, blocs arrondis multicolores, deux boutons par bloc, fond animé, apparitions au défilement. **Ne pas y revenir.**

## Jetons (`src/styles/global.css`)

| Jeton | Usage |
|---|---|
| `navy` `#0A1230` | Fond uni de toutes les pages |
| `night` `#060B22` | Pied de page, champs, encarts sombres |
| `surface` `#121C3F` / `surface-2` `#1A2650` | Cartes (un objet) / état actif, avatars |
| `line` `#2C3A6B` | Filets entre sections, bordures |
| `line-strong` `#5D6C9E` | Contour des champs et des boutons secondaires (3:1 au moins) |
| `blue` `#0B5FFF` | **Bouton principal seulement** |
| `blue-text` `#9DBCFF` | Liens |
| `flag-blue` `#0B5FFF` | Bleu du drapeau : filet tricolore, jauge de GAL. Ne change jamais avec le thème |
| `red` `#FF1A2E` | Filet tricolore, trait de la page active (menu, onglets), ligne de GAL. Jamais de texte blanc dessus en petite taille |
| `win` `#4C86F5` / `loss` `#F0505F` | Victoires et défaites dans les graphiques, contrôlées pour les daltonismes |
| `muted` `#C0C9E2` | Texte secondaire : 11:1 sur le fond |
| `warn` `#FFC857` | Données périmées et erreurs de collecte, et ce qui attend l'encadrement |

Pas de couleur en dur dans un composant : un jeton, ou une classe de `global.css`. Pas de dégradé de fond, pas de lueur, pas de flou derrière un élément. Les couleurs des territoires sur la carte sont celles des clans dans le jeu, pas des jetons.

**Thème rouge de l'encadrement :** `/direction` et `/admin` passent `theme="rouge"` à `Base.astro`, qui pose `data-theme="rouge"` sur `<html>`. `global.css` redonne alors à chaque jeton une teinte rouge, rôle pour rôle (valeurs et contrastes dans `docs/DESIGN.md`). Une future page de l'encadrement passe la même option ; une page de membre, comme `/compte`, reste bleue. Le tricolore garde `flag-blue`, et `.form-problem` s'y écrit en jaune `warn`.

## Polices

- **Titres et grands chiffres : Spectral** (`--font-display`), graisses 800 (H1, H2, `.figure`) et 600 (H3). Casse normale partout : jamais de `uppercase` sur un titre ni un libellé.
- **Texte : Red Hat Text** (`--font-sans`). Chiffres tabulaires `.tnum` dans les colonnes. Les milliers prennent l'espace insécable de `src/lib/nombre.ts` : aucune des deux polices n'a l'espace fine.
- Échelle : `.page-title` (H1, 36 à 64 px) > `.section-title` (H2, 28 à 40 px) > `.section-title-sm` (H2 d'une colonne) > H3 (20 à 24 px). `text-xs` vaut 13 px et `text-sm` 15 px.
- Petit libellé au-dessus d'un chiffre : `.label` (casse normale, gras, `muted`). Chiffre mis en avant : `.figure` + une taille.
- Interdit : Inter, Outfit, Poppins, Montserrat, Space Grotesk, Roboto et les polices du même genre. Polices servies par le site, aucun service tiers.

## Sections, cartes, liens, boutons

- **Une section se pose sur le fond** : `.band` (filet en haut, espace autour). Pas de bloc coloré, pas de « scène ». Varier la mise en page d'une section à l'autre (tableau de score, deux colonnes séparées par un filet, image d'un côté, liste à filets), au lieu de répéter titre, paragraphe et boutons.
- **Une carte `.card` n'entoure qu'un objet** : une partie, une stat, un membre, un créneau, un outil comme le calculateur. Pas de grille de trois cartes « avantages » : une liste à filets.
- **Un lien mène ailleurs, un bouton agit.** « Voir… », « Lire… » sont des liens (`<a>` sans classe, ou `.link` s'il en faut d'autres). Un seul bouton principal par section ; le second devient un lien. Sur l'accueil, seul « Rejoindre le Discord » est un bouton plein.
- **Un seul système de boutons :** `.btn` (coins de 6 px, 44 px de haut), tailles `.btn-lg` et `.btn-sm` (40 px), styles `.btn-primary` (bleu plein) et `.btn-secondary` (contour). Interrupteurs et filtres : `.chip`, même forme. Dans l'en-tête, Discord est le seul bouton ; Nouveautés et la connexion sont des `.nav-link`.
- Navigation : les six rubriques visibles dès 1 024 px (`lg`), « Menu » seulement en dessous. Onglets d'une rubrique : `.section-tab`, trait rouge sous la page ouverte.
- Bouton Discord : texte seul, pas de logo ni de couleur de la marque.
- Les styles de base et les composants sont dans les couches `base` et `components` de Tailwind : une classe utilitaire peut les ajuster sans `!`.

## Graphiques

- Victoires et défaites : `bg-win` et `bg-loss`, le bleu et le rouge du clan, validés pour les daltonismes. Légende au-dessus, avec des pastilles de 14 px.
- Axe gradué de valeurs rondes et entières, calculé par `countAxis` de `src/lib/chart.ts` ; dates en bas (première, milieu, dernière). Barres de 24 px au plus, `.bar-stack` (2 px de fond entre deux parts, haut arrondi). Une courbe écrit sa valeur la plus haute et la plus basse contre leur trait.
- Le détail de chaque barre au survol, et un tableau (visible ou pour les lecteurs d'écran). Un tableau masqué va dans un bloc `.sr-only`, jamais la classe sur le `<table>` : il élargirait la page.
- Un graphique par mesure, jamais de double axe. Le rang a l'axe inversé. La période en cours est plus pâle, et la page le dit.
- Heatmap : une teinte, le nombre écrit dans chaque case, vrai tableau HTML, pivot sous 1 024 px.

## États des données

| État | Affichage |
|---|---|
| Vide | « Pas de données », jamais un zéro ; une section sans données ne s'affiche pas |
| Zéro réel | « 0 » ; un taux sans partie affiche « — » |
| Erreur de collecte | Message `warn`, dernières données valides conservées |
| Périmé | Message `warn` calculé dans le navigateur (`DataStatus.astro`) |
| Hors classement | Texte explicite, jamais un rang 0 |
| Chargement | Arc animé, seulement pour la liste des membres |

## Mouvement

- **Rien ne bouge au chargement ni au défilement, et tout le contenu est visible sans JavaScript.** Pas de fond animé, pas de titre mot à mot, pas d'apparition en fondu, pas de compteur qui défile à l'ouverture, pas de survol qui incline ou attire.
- Ce qui bouge répond à un geste : le film de la carte (son bouton de lecture le met en pause), sa simulation, le rejeu du calculateur (une fois par changement ou par appui sur « Rejouer l'attaque », 5 s au plus), le tri des membres, les chiffres d'un filtre. Rien ne tourne en boucle. Mouvements lents, rien qui clignote.
- `prefers-reduced-motion` coupe tout ; `src/lib/fx/motion.ts` le dit aux scripts. Il n'y a plus de bouton pause dans l'en-tête : il n'y a plus d'effet continu à mettre en pause.
- Une animation ne change jamais une valeur. Clic droit : menu natif partout.

## Accessibilité

Lien d'évitement, focus visible partout, navigation clavier complète, texte à 4,5:1 au moins, boutons de 40 px de haut au moins, WCAG 2.1 AA vérifié par axe sur chaque page en desktop et mobile, aucun défilement horizontal de 360 à 1 920 px (tester 360, 375, 768, 1 024, 1 280, 1 920). Images décoratives : `alt=""`.

## Interdit

Références à Astérix, copie du site du clan [FR], marque Discord, logo d'OpenFront ou mise en page qui ferait passer le site pour officiel, texte blanc sur rouge vif, données d'exemple dans l'interface, couleurs en dur, emoji dans l'interface, dégradé violet, effet de verre dépoli.

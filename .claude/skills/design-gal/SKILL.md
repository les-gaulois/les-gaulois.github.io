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

## Jetons (`src/styles/global.css`)

| Jeton | Usage |
|---|---|
| `navy` `#0A1230` | Fond de page |
| `night` `#060B22` | Pied de page, scènes nocturnes, panneaux dans une scène |
| `surface` `#121C3F` / `surface-2` `#1A2650` | Cartes / état actif, avatars |
| `line` `#2C3A6B` | Bordures |
| `line-strong` `#5D6C9E` | Contour des champs, carte survolée (3:1 au moins sur une carte) |
| `blue` `#0B5FFF` | **Bouton principal seulement** |
| `blue-text` `#9DBCFF` | Liens (le bleu du logo manque de contraste sur le marine) |
| `flag-blue` `#0B5FFF` | Bleu du drapeau : filet tricolore, frontière, barre de progression. Ne change jamais avec le thème |
| `red` `#FF1A2E` | Filets, marqueur de page et de ligne active. Jamais de texte blanc dessus en petite taille |
| `muted` `#C0C9E2` | Texte secondaire |
| `warn` `#FFC857` | Données périmées et erreurs de collecte, et ce qui attend l'encadrement (demandes à traiter, pastille `.count-pill`, état du site) |

Pas de couleur en dur dans un composant : un jeton, ou une classe de `global.css`. Les couleurs des territoires sur la carte sont celles des clans dans le jeu, pas des jetons.

**Thème rouge de l'encadrement :** `/direction` passe `theme="rouge"` à `Base.astro`, qui pose `data-theme="rouge"` sur `<html>`, et `fx.ts` inverse ses couleurs : le rouge mène, le bleu répond. Au QG, seuls les onglets de l'encadrement (Demandes, Comptes, Journal) et leurs parties portent `data-theme="rouge"`, dans un cadre `.zone-encadrement`. `global.css` redonne alors à chaque jeton une teinte rouge, rôle pour rôle, pour la page ou pour l'élément (valeurs et contrastes dans `docs/DESIGN.md`). `/admin` ne fait plus que mener au QG. Une future page de l'encadrement passe la même option ; une page de membre, comme `/compte`, reste bleue. Le tricolore garde `flag-blue`, et `.form-problem` (refus du serveur, « Absent de la liste ») s'y écrit en jaune `warn`.

## Scènes, cartes, boutons

- Grandes sections : `.stage` à coins de 24 px, décor `.stage-blue`, `.stage-indigo`, `.stage-night`, `.stage-wine`. Profondeur par la couleur, sans ombre portée. Un panneau `.panel` dans une scène n'affiche que des données collectées : aucune maquette, aucune valeur fictive.
- Cartes : `.card`. Largeur de page : `.wrap`.
- Boutons : `.btn-primary` (bleu plein, l'action principale, rejoindre le Discord), `.btn-secondary` (blanc plein, jouer à OpenFront), `.btn-ghost` (contour blanc, liens dans les scènes). Coins 12 px, `.btn-lg` pour les appels principaux. `.btn` écrase `hidden` : masquer via un conteneur.
- Bouton Discord : texte seul, pas de logo ni de couleur de la marque.

## Typographie

Titres en Outfit 800, capitales appliquées en CSS (le texte source reste en casse normale pour les lecteurs d'écran), `.page-title` pour le H1. Texte en Inter. Chiffres tabulaires `.tnum` dans les colonnes. Polices servies par le site, aucun service tiers.

## Graphiques

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

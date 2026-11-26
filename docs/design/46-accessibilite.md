<!-- Partie de docs/DESIGN.md : « Accessibilité ». Sommaire et ordre des parties : docs/DESIGN.md. -->

## Accessibilité

- Lien d'évitement, focus visible partout, navigation entièrement utilisable au clavier.
- Animations continues interruptibles par le bouton pause, comme l'exige le critère WCAG 2.2.2. Toutes les interactions à la souris sont décoratives : aucune information n'en dépend.
- Un chiffre animé ne montre jamais que sa vraie valeur : il se lève en fondu, sans défiler (`.fx-count-in`, depuis le 14 novembre 2026). Les yeux, les lecteurs d'écran et le copier-coller lisent le même texte, à tout instant.
- Graphiques de la page Progression doublés par des tableaux, identité jamais portée par la seule couleur.
- Tests automatiques axe (WCAG 2.1 A et AA) sur les 13 pages publiques et les deux pages rouges de l'encadrement, en desktop et mobile, et sur chacun des onze chapitres du guide du clan, que la page n'ouvre qu'un à la fois. Ces tests ne remplacent pas un essai avec un lecteur d'écran, qui n'a pas été fait. Ils ne peuvent pas non plus toujours mesurer un contraste sur un dégradé : le texte des scènes a été choisi clair et vérifié à l'œil sur les captures.
- Absence de défilement horizontal testée à 360, 375, 768, 1 024, 1 280 et 1 920 px. Ces tests tournent sans barre de défilement visible : une vraie barre retire 15 px de largeur, ce qui peut révéler un débordement qu'ils ne voient pas.


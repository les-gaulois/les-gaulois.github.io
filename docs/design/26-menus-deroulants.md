<!-- Partie de docs/DESIGN.md : « Menus déroulants ». Sommaire et ordre des parties : docs/DESIGN.md. -->

## Menus déroulants

Tout ce qui se déplie dans une page est un `<details class="fold">`, sur le modèle de « Détails et formules » du guide du clan, sauf à la Direction (voir plus bas). Le pilote l'a demandé le 12 novembre 2026 en montrant ce bloc : « tout les menu déroulant fais les comme ca ».

- **La ligne :** un filet `line` au-dessus, le libellé en chasse fixe (graisse 600) dans le bleu clair des liens, blanc au survol, puis un grand « + » au bout de la ligne, « − » une fois ouvert. Le signe est décoratif : les lecteurs d'écran disent déjà « réduit » ou « développé ».
- **Dans une scène,** le filet est celui des groupes (`--hairline`), et sur le bleu royal (`.stage-blue`) le libellé est blanc, comme les liens : le bleu clair n'y a que 4,1:1 au plus clair du dégradé.
- **La taille :** celle du texte courant de la page (17 px, 18 px au QG), même pour une note en petit texte comme « Comment lire ces chiffres » : seul son contenu reste petit.
- **Plusieurs à la suite** se rangent dans `.fold-list`, qui ferme la liste d'un filet (les éditions précédentes de la gazette). Le contenu d'une édition ouverte est en retrait derrière un filet, comme une branche : ses propres replis ne passent pas pour l'édition suivante. Un libellé en plusieurs morceaux (« Semaine du … · 671 parties ») tient dans un seul `<span>` : sinon, son second morceau part au milieu de la ligne.
- **La Direction garde le dessin d'avant** : le 13 novembre 2026, le pilote a demandé « les ceux de la direction comme avant ». Le libellé et l'air d'un `.fold` ne valent que hors du thème rouge ; à la Direction, un repli garde l'écriture et la couleur du texte qui l'entoure, « Où trouver le lien ? » son triangle, et les rubriques de l'onglet Discord (`.deroule`) leurs grands titres.
- **Les menus de navigation** (« Menu » et « Nouveautés » de l'en-tête, menu des parties du QG et de la Direction, sommaire du guide) ouvrent une liste de liens : ils gardent leur bouton.


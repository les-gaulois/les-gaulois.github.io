<!-- Partie de docs/DESIGN.md : « Boutons ». Sommaire et ordre des parties : docs/DESIGN.md. -->

## Boutons

| Classe | Style | Usage |
|---|---|---|
| `.btn-primary` | Bleu plein | L'action principale, rejoindre le Discord |
| `.btn-secondary` | Plein, de la couleur de l'écriture : marine sur la page, blanc dans une scène | L'action d'un bloc qui n'a pas de bouton principal (« Ouvrir la carte », « Voir les étapes »). À côté d'un bouton principal sur la page (haut de l'accueil, Rejoindre), le second bouton est un `.btn-ghost` depuis le 14 novembre 2026 : plein, en marine, il pesait autant que le principal |
| `.btn-ghost` | Contour blanc | Liens vers les pages, dans les scènes colorées |

Les boutons ont des coins de 6 px (12 px avant le 12 novembre 2026), et `.btn-lg` les agrandit pour les appels principaux. Le bouton principal a un reflet d'un pixel en haut et rayonne de son bleu au survol.

La pastille `.count-pill` donne, à côté du lien « Direction », le nombre de demandes en attente, et le lien mène alors à leur partie : fond jaune `warn`, texte `navy`, 11,6:1 au moins dans les deux thèmes. Les lecteurs d'écran entendent le texte visible suivi de ce qu'il compte : « Direction 2 demandes à traiter ». Du 10 au 12 novembre 2026, elle était à côté du lien « QG ».


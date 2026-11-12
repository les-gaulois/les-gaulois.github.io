---
title: "Croissance de la population : ratio optimal"
order: 2
court: "Croissance"
groupe: combat
icone: epi
essentiel:
  - "La croissance de la population est maximale entre **35 % et 42 %** de votre capacité maximale."
  - "Au-delà, la croissance diminue : à 100 %, elle tombe à 0."
bloc: croissance
blocTitre: "Gain de troupes selon le remplissage de votre capacité"
---

Ce pourcentage varie légèrement selon votre capacité. En partie, votre capacité dépasse 100 000 troupes dès le départ : le pic se situe donc autour de 42 %. La courbe est plate près du sommet : à 35 % comme à 50 %, le gain reste à environ 98 % du maximum. À 80 %, il tombe à environ 55 %.

Le gain de troupes se calcule à chaque tick (100 ms) :

```
gain = (10 + troupes^0,73 ÷ 4) × (1 − troupes ÷ capacité)
```

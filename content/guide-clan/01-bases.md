---
title: "Les bases : population, troupes et tuiles"
order: 1
court: "Les bases"
groupe: combat
icone: casque
essentiel:
  - "**Population :** plus elle est élevée, plus vous pouvez disposer de troupes."
  - "**Troupes :** votre réserve. Elles servent à attaquer ou à défendre."
  - "**Tuile :** une case du territoire sur la carte."
bloc: attaque
blocTitre: "Combien partent avec une attaque ?"
blocTexte: "Une attaque n'envoie pas toute votre réserve. Dans le jeu, votre curseur d'attaque est réglé à 20 % par défaut : **1 troupe sur 5** part, le reste demeure en défense."
retenir:
  titre: "Important"
  texte: "Quand vous envoyez des troupes en attaque, ces unités ne sont plus disponibles pour votre défense."
---

La population donne une capacité de troupes : plus votre population et votre capacité sont élevées, plus vous pouvez disposer de troupes. Une partie de vos troupes sert à défendre votre territoire. Le nombre de tuiles occupées compte pour la densité.

| Joueur | Règle simple | À retenir |
|---|---|---|
| Civil | Attaque = troupes ÷ 5 | Une grosse réserve ne signifie pas que toute la réserve part sur la tuile. |
| Bot | Attaque = troupes ÷ 20 | Les bots utilisent une règle d'attaque plus faible. |

Le Civil désigne ici un joueur humain, et le ÷ 5 correspond au réglage par défaut de son curseur d'attaque (20 %). Exemple : 50 000 troupes disponibles sur un Civil donnent une force d'attaque standard de 10 000.

De la population à l'attaque : population (capacité), puis troupes (réserve), puis attaque (troupes ÷ 5). Le reste demeure en défense.

Dans le code, `cityTroopIncrease() = 250 000` : chaque niveau de Ville ajoute 250 000 troupes de capacité.

```
capacité = 2 × (tuiles^0,6 × 1 000 + 50 000) + niveaux de Ville × 250 000
```

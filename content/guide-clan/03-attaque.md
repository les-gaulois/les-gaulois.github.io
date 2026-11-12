---
title: "Comprendre une attaque"
order: 3
court: "L'attaque"
groupe: combat
icone: epee
chapeau: "Pour comprendre un combat, regardez surtout quatre choses :"
essentiel:
  - "**Ratio :** les troupes du défenseur comparées à celles de votre attaque. Une grosse attaque fait baisser ce ratio."
  - "**Densité :** beaucoup de troupes sur peu de tuiles, c'est une défense concentrée."
  - "**Terrain :** plaine, colline (highland) et montagne n'ont pas le même coût de combat."
  - "**Bonus :** poste de défense, taille du territoire, statut de traître."
bloc: terrain
blocTitre: "Valeurs de terrain à connaître"
# Dans l'ordre des terrains de src/lib/guide-clan.ts : plaine, colline, montagne.
points:
  - titre: "Plaine"
    texte: "Base de référence"
  - titre: "Colline"
    texte: "Plus coûteux"
  - titre: "Montagne"
    texte: "Encore plus coûteux"
retenir:
  titre: "Réflexe"
  texte: "Avant une attaque, ne regardez pas seulement le nombre de troupes. Une défense concentrée, un terrain difficile ou un poste peuvent changer fortement le résultat."
---

**Densité.** Une forte concentration de troupes sur peu de tuiles augmente le terme de densité utilisé dans le calcul des pertes.

```
densité = troupes du défenseur ÷ tuiles du défenseur
R = troupes du défenseur ÷ troupes de l'attaque
```

**Pertes de l'attaquant.** Pour ce calcul, R est limité à l'intervalle de 0,6 à 2. Une grosse attaque fait donc descendre R.

```
pertes = mag × modificateur de trahison × borne(R ; 0,6 ; 2) × (0,463 × bonus attaquant × bonus défenseur + 0,0039 × densité)
```

Un Civil ou une Nation qui attaque un Bot paie 0,7 × mag.

**Vitesse d'attaque.** Un tick dure 100 ms. La vitesse dépend du ratio, du terrain, de la taille des territoires, puis du poste et du statut de traître. En résumé : grosse attaque, R faible, coût qui diminue, conquête plus rapide.

```
coût de vitesse = borne(R ; 0,82 ; 7,5) × borne(R ÷ 20 ; 1 ; 50) ÷ 8,55
part du tick pour une tuile = coût de vitesse × coût de tuile × bonus de taille × modificateur de traître ÷ taille du front
```

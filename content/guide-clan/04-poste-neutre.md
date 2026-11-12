---
title: "Poste de défense et terrain neutre"
order: 4
court: "Poste et neutre"
groupe: combat
icone: tour
chapeau: "Ces deux situations ne se jouent pas comme une attaque classique contre une tuile normale."
essentiel:
  - "**Territoire neutre :** une tuile qui n'appartient pas à un joueur. Après la prise, elle devient votre territoire."
bloc: poste
blocTitre: "Poste de défense"
# Dans l'ordre des valeurs du poste de src/lib/guide-clan.ts : portée, pertes, vitesse.
points:
  - titre: "Portée"
    texte: "Le poste protège et agit dans cette portée."
  - titre: "Pertes de l'attaquant"
    texte: "Une attaque contre le poste coûte beaucoup plus cher en pertes."
  - titre: "Coût de vitesse"
    texte: "La prise de la tuile est ralentie."
retenir:
  titre: "À retenir"
  texte: "Ne traitez pas une tuile neutre comme si elle avait un défenseur joueur : la logique et les pertes sont différentes."
---

### Territoire neutre

Le calcul est différent d'un combat de joueur contre joueur.

| Situation | Règle simple |
|---|---|
| Civil contre neutre | Les pertes utilisent mag ÷ 5. |
| Bot contre neutre | Les pertes utilisent mag ÷ 10. |

**Vitesse en territoire neutre.** Elle dépend des troupes envoyées.

```
budget de tick = taille du front × 2
coût de la tuile = borne((2 000 × coût de tuile) ÷ troupes de l'attaque ; 5 ; 100)
part du tick = coût de la tuile ÷ budget de tick
```

**Fallout (retombées).** Ce modificateur s'applique au mag et au coût de tuile.

```
modificateur = 5 − 2 × ratio de fallout
```

---
title: "Économie : gagner et dépenser son or"
order: 6
court: "Or et bâtiments"
groupe: economie
icone: bourse
essentiel:
  - "**Revenu passif :** 60 000 or par minute pour un joueur, soit 100 or par tick, avant le multiplicateur d'or de la partie."
  - "**Conquête :** 50 % de l'or restant d'un joueur, 100 % de celui d'un Bot ou d'une Nation."
  - "**Bâtiments :** leur coût augmente avec le nombre déjà compté. La Ville a son propre compteur, le Port et l'Usine partagent le même."
bloc: batiments
blocTitre: "Les bâtiments principaux"
# Dans l'ordre des bâtiments de src/lib/guide-clan.ts : ville, port, usine.
points:
  - titre: "Ville"
    texte: "Plus de capacité de troupes, et arrêt commercial pour les trains."
  - titre: "Port"
    texte: "Commerce maritime et bateaux de trade."
  - titre: "Usine"
    texte: "Réseau ferroviaire et création des trains."
retenir:
  titre: "Orientation"
  texte: "Pour un débutant : commencez par sécuriser votre économie et votre territoire avant de chercher à optimiser chaque formule de spawn."
---

L'économie de base repose sur des revenus passifs, les bateaux de trade, les trains, la conquête et certaines captures ou droits commerciaux.

| Source | Règle simple | Ordre de grandeur |
|---|---|---|
| Revenu passif, Civil | 100 or / tick | 60 000 or / min |
| Revenu passif, Bot | 50 or / tick | 30 000 or / min |
| Conquête d'un Civil | 50 % de son or restant | Selon l'or restant sur la cible |
| Conquête d'un Bot ou d'une Nation | 100 % de l'or restant | Selon l'or restant sur la cible |

> **Mise à jour.** Depuis la v0.34.0, l'or est plus généreux en début de partie, puis ralentit en milieu et en fin de partie. Les 100 et 50 or par tick restent les bases, avant multiplicateur.

**Revenu passif.** Il est fixe par tick, sans nombre de travailleurs, puis multiplié par le multiplicateur d'or de la partie. Ce multiplicateur s'applique aussi aux paiements du commerce ferroviaire et maritime.

**Coût des bâtiments.** Ville, Port et Usine suivent la même progression : 125k, 250k, 500k, puis 1M. Pour n structures déjà comptées :

```
coût(n) = min(1 000 000 ; 125 000 × 2^n)
```

**Niveaux.** Chaque niveau du Port augmente les tentatives de spawn d'un bateau lors d'un contrôle. L'Usine crée sa station ferroviaire et participe au calcul de la cadence des trains. Bateaux de trade et trains ne coûtent rien directement : ils sont générés par leurs systèmes.

**Statistiques.** Les statistiques du joueur distinguent notamment les revenus de bateaux de trade, de trains, de piraterie, de conquête et d'autres sources.

**Don d'or.** Quand il est activé, il transfère de l'or existant d'un joueur vers un autre. Ce n'est pas une création nette d'or.

**Embargo.** Les systèmes commerciaux exigent une destination éligible. Un embargo peut donc empêcher un commerce avec une cible.

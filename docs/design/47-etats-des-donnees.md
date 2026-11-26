<!-- Partie de docs/DESIGN.md : « États des données ». Sommaire et ordre des parties : docs/DESIGN.md. -->

## États des données

| État | Affichage |
|---|---|
| Chargement | Arc animé, uniquement pour la liste des membres. Les autres pages arrivent déjà remplies. |
| Vide | « Pas de données », jamais un zéro. Une scène de l'accueil sans données n'est pas affichée. |
| Zéro réel | « 0 » ; un taux sans partie affiche « — » |
| Erreur de collecte | Message jaune, dernières données valides conservées |
| Périmé | Message jaune calculé dans le navigateur du visiteur, un par source, avec son nom quand l'en-tête en date plusieurs |
| Hors classement | Texte explicite, jamais un rang 0 |


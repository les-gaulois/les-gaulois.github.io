<!-- Partie de docs/DIRECTION.md : « Les droits ». Sommaire et ordre des parties : docs/DIRECTION.md. -->

## Les droits

| Action | Visiteur | En attente | Membre | Officier | Admin | Fondateur |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Lire les annonces et les événements | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Voir le nombre de présents à un événement | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Demander sa validation, avec le lien de son profil OpenFront | | ✓ | | | | |
| Entrer au QG : sondages et totaux, idées, mur, mot d'accueil | | | ✓ | ✓ | ✓ | ✓ |
| Répondre « Je viens », voter, proposer ou soutenir une idée, se montrer aux autres membres | | | ✓ | ✓ | ✓ | ✓ |
| Retirer sa propre idée | | | ✓ | ✓ | ✓ | ✓ |
| Voir les appels aux salons, prévenir les Gaulois de son salon, retirer son appel | | | ✓ | ✓ | ✓ | ✓ |
| Habiller son Gaulois au village | | ✓ | ✓ | ✓ | ✓ | ✓ |
| Recevoir des statères, acheter à la boutique, ouvrir une pochette, vendre et acheter au marché, voir la place du village | | | ✓ | ✓ | ✓ | ✓ |
| Lire l'économie du village et la dépense des bulles | | | | ✓ | ✓ | ✓ |
| Régler les prix, la pochette surprise, le plafond des bulles, couper les bulles | | | | | ✓ | ✓ |
| Outils du QG : sa place, dire son heure de jeu, poser un pronostic avec mise, donner un GG, être parrain | | | ✓ | ✓ | ✓ | ✓ |
| Fixer ou retirer l'objectif de la semaine | | | | ✓ | ✓ | ✓ |
| Trancher une idée, retirer celle d'un autre | | | | ✓ | ✓ | ✓ |
| Valider les membres | | | | ✓ | ✓ | ✓ |
| Ouvrir l'espace Direction, voir qui vient | | | | ✓ | ✓ | ✓ |
| Publier une annonce, un événement ou un sondage, écrire le mot d'accueil | | | | ✓ | ✓ | ✓ |
| Modifier, fermer ou supprimer les siens | | | | ✓ | ✓ | ✓ |
| Modifier, fermer ou supprimer ceux des autres | | | | | ✓ | ✓ |
| Lire le journal | | | | | ✓ | ✓ |
| Suspendre un membre, gérer les officiers | | | | | ✓ | ✓ |
| Lever une suspension | | | | | ✓ | ✓ |
| Remettre en attente un compte que la liste ne trouve pas (« Refaire la demande ») | | | | | ✓ | ✓ |
| Brancher le salon Discord des appels, envoyer un essai, le débrancher | | | | | ✓ | ✓ |
| Régler ou retirer le lien du salon vocal | | | | | ✓ | ✓ |
| Nommer ou retirer des admins | | | | | | ✓ |
| Lever la suspension d'un admin | | | | | | ✓ |
| Transmettre le rôle de fondateur | | | | | | ✓ |
| Lire la carte de l'alliance : alliances, zones, discussion ; écrire et retirer ses messages | | Allié invité | ✓ | ✓ | ✓ | ✓ |
| Déclarer les troupes de son clan | | Allié invité de notre alliance | | ✓ | ✓ | ✓ |
| Dessiner, modifier et supprimer les zones de son clan (vingt au plus par clan pour un allié ; depuis la migration `20261113001100`, une zone créée ou modifiée attend l'accord de l'encadrement) | | Allié invité de notre alliance | | ✓ | ✓ | ✓ |
| Ranger les clans en alliances, marquer une alliance alliée de la nôtre, dessiner les zones, accepter ou refuser celles des alliés, régler leur état et leur ordre de priorité, inviter les alliés, les accepter ou les refuser, leur retirer l'accès, retirer ou épingler un message | | | | ✓ | ✓ | ✓ |

Un joueur allié invité garde un compte « en attente » : il n'a que ce que la carte de l'alliance lui ouvre. Il dessine, modifie et supprime les zones chargées de son clan, et seulement celles-là : ni celles d'un autre clan, ni celles de toute l'alliance, qu'il ne peut ni créer, ni reprendre, ni donner à un autre clan (`save_alliance_zone`, `delete_alliance_zone`, revérifié à chaque écriture) ; vingt zones au plus par clan, dans les quatre-vingts de l'alliance (`too_many_clan_zones`). Un Gaulois validé hors de l'encadrement ne dessine pas : les zones de GAL restent celles de l'encadrement. Le journal note chaque geste d'un allié (« en joueur allié de LUX »), sans son nom choisi. Depuis la migration `20261113001100` (« Oui, avec accord », le pilote), une zone qu'il crée ou modifie attend l'accord de l'encadrement avant de compter (voir « Zones », plus haut) : il la voit, avec les joueurs de son clan et l'encadrement, sous « En attente de l'accord ». Un allié ne déclare que les troupes de son clan ; l'encadrement, celles de tout clan de notre alliance. Depuis la migration `20261114001500`, un allié invité d'une alliance amie lit la carte et écrit dans la discussion, sans plus : il ne déclare pas de troupes et ne dessine, ne modifie ni ne supprime aucune zone, même chargée de son clan. Personne ne change son propre rôle. Chaque droit est vérifié par le serveur : masquer un bouton ne protège rien. Toute publication, modification ou suppression va au journal, titre compris.

**Le rang dans le jeu ne donne aucun droit.** Lors d'une demande, l'officier voit « Chef dans le jeu » ou « Officier dans le jeu », d'après la liste publique des membres. Cette liste étant publique, n'importe qui peut prétendre être cette personne : le rôle sur le site reste une décision humaine.


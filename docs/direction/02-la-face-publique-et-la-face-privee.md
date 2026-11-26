<!-- Partie de docs/DIRECTION.md : « La face publique et la face privée ». Sommaire et ordre des parties : docs/DIRECTION.md. -->

## La face publique et la face privée

Le site a deux faces depuis le 9 novembre 2026.

- **La face publique :** tout ce qui vient de l'API publique d'OpenFront (classement, carte, records, gazette, membres), les guides, les annonces et les événements. Tout le monde la lit, sans compte.
- **La face privée, le QG (`/qg`) :** réservée aux membres validés. Sa page publiée ne contient que la porte. Son contenu n'est écrit dans aucune page du site ni dans le dépôt : le serveur le donne en un appel, `get_qg`, qui refuse un visiteur, un compte en attente et un compte suspendu.

**Comment on est reconnu membre**, une seule fois :

1. Le joueur se connecte avec Discord, ou, depuis le 12 novembre 2026, avec un code demandé dans le Discord du clan (« Se connecter avec un code », plus bas).
2. Il donne le lien de son profil OpenFront dans `/compte` (depuis le 14 novembre 2026) : le site le cherche dans la liste des membres de GAL.
3. Il crée son Gaulois (depuis le 15 novembre 2026 : sans lui, le QG reste fermé, voir « Ce que voit chacun »).
4. Un officier confirme que c'est bien lui. Ensuite, le site le reconnaît à chaque visite.

L'identifiant OpenFront seul ne peut pas ouvrir le QG : il est public, dans l'API du jeu et dans l'adresse de chaque fiche de membre. L'étape 4 deviendra automatique le jour où OpenFront acceptera le site dans sa liste (voir « Vérifier les membres : la limite à connaître »).


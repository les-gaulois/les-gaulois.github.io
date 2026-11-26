<!-- Partie de docs/DIRECTION.md : « L'identité Discord : les règles à garder ». Sommaire et ordre des parties : docs/DIRECTION.md. -->

## L'identité Discord : les règles à garder

Trois failles ont été trouvées et corrigées le 6 novembre 2026, avant toute mise en ligne. Leurs tests sur un vrai Postgres ont été retirés avec le jeu : ces règles ne sont plus vérifiées automatiquement, à relire avant de toucher au serveur.

1. **Ne jamais lire `raw_user_meta_data`.** Un utilisateur connecté peut y écrire ce qu'il veut avec `auth.updateUser`, ou à l'inscription par e-mail. S'y fier lui permettait d'afficher aux officiers le pseudo Discord d'un autre, et même de se faire désigner fondateur. L'identité vient seulement de `auth.identities`, relue à chaque connexion.
2. **Un compte sans Discord ne peut rien demander.** Les officiers reconnaissent les gens sur Discord.
3. **Une suspension ne se lève que par un admin de rang supérieur.** La règle est posée sur la table : elle vaut pour toute fonction, présente ou future. Valider une demande restée ouverte ne la contourne plus, et réintégrer un compte jamais validé le remet en attente.
4. **La connexion par code** (12 novembre 2026) ne prend l'identifiant Discord que d'une commande signée par Discord et vérifiée par la fonction `code-discord`. Elle ne le donne qu'au compte que cette fonction vient de créer pour ce Discord, reconnu à ses métadonnées d'application (`raw_app_meta_data`, que seule la clé de service écrit), jamais à une adresse e-mail, qu'un joueur peut choisir. Elle ne retrouve un compte que par l'identifiant Discord déjà posé. Un compte Discord n'a qu'un compte sur le site. Voir « Se connecter avec un code ».


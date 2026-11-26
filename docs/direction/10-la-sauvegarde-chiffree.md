<!-- Partie de docs/DIRECTION.md : « La sauvegarde chiffrée ». Sommaire et ordre des parties : docs/DIRECTION.md. -->

## La sauvegarde chiffrée

Supabase ne sauvegarde rien sur le forfait gratuit. Chaque semaine, l'Action **Sauvegarde chiffrée** (`.github/workflows/sauvegarde.yml`) copie ce que le site garde et qui ne se retrouve nulle part ailleurs :

- comptes et rôles, liens Discord (identifiant et nom), demandes et journal ;
- annonces, événements et réponses « Je viens » ;
- sondages avec leurs seuls totaux, et mot d'accueil ;
- idées de la boîte à idées, avec le seul nombre de leurs soutiens, et le choix de chacun de se montrer ;
- le village (depuis la version 5, migration `20261113002200_village_sauvegarde.sql`, puis la version 6, `20261113002400`, la version 7, `20261115000800`, pour les familiers, la version 8, `20261115000900`, pour les bannières, et la version 9, `20261115001000`, pour les Gaulois uniques) : tenues des Gaulois (avec le familier et la bannière montrés, et le Gaulois unique porté), inventaires, familiers de chaque compte et réglage de leur pochette, bannières de chaque compte, Gaulois uniques de chaque compte et réglage de leur pochette, journal et soldes des statères, prix et pochette, offres du marché, réglage et dépense des bulles. Les crédits des points rapportés au clan n'y sont qu'en un total par compte, sans partie, heure ni points : la liste des parties d'un compte désignerait son joueur OpenFront. Ni les présences, ni les états vocaux, ni les bulles, qui s'effacent d'eux-mêmes. Après une restauration, le journal se refait avec une ligne « reprise » de ce total, puis les autres lignes ; chaque compte reçoit une suspension pour les statères qui finit à l'heure de la sauvegarde, pour que la relecture ne paie pas deux fois les parties d'avant. Le SQL de cette restauration, étape par étape, est dans `docs/restaurer-village.sql` (essayé sur PGlite, jamais sur le vrai projet) : son étape 6, la suspension des statères, ne s'oublie pas.

L'export (fonction `export_site`, réservée à la clé de service) ne garde que le nécessaire :

- **Des votes, les totaux par choix seulement.** Personne n'apprend qui a voté quoi, pas même avec la phrase de passe. Après une restauration, les sondages reviennent sans leurs voix individuelles.
- **Des soutiens aux idées, le nombre par idée seulement,** pour la même raison.
- **Ni l'empreinte du `publicId` OpenFront, ni les textes libres d'une demande** (ce que le joueur a tapé, son mot pour l'officier). Avec l'API publique, ils pourraient lever l'anonymat d'un membre anonyme si la phrase était devinée. Après une restauration, le lien avec le profil OpenFront est perdu : dans la Direction, partie Comptes, un tel compte validé s'affiche « Pas trouvé dans la liste », et « Refaire la demande » le remet en attente, pour que la personne refasse sa demande. Le fondateur, que personne ne peut remettre en attente, l'est dans l'éditeur SQL, avant de refaire sa demande.
- **Ni les rôles prévus**, qu'on ne lit que dans l'éditeur de Supabase, **ni la liste officielle**, qui se relit, **ni les tables de l'ancien jeu**.
- **Ni les comptes de connexion eux-mêmes** (`auth.users`, gérés par Supabase). Si le projet est perdu, chacun se reconnecte avec Discord, et l'encadrement retrouve rôles et données par l'identifiant Discord de `private_links`.

Comment elle est gardée :

- **Chiffrée avant de sortir :** AES-256-GCM, avec une clé tirée de la phrase de passe par scrypt, réglé lent exprès (N = 2^18) pour qu'une phrase coûte cher à deviner (`src/lib/sauvegarde.ts`). Le fichier porte ses réglages, et tout son en-tête est authentifié : une seule lettre changée le rend inutilisable.
- **Gardée 90 jours** par GitHub, dans l'exécution de l'Action, sous **Artifacts**. Le dépôt est public : n'importe quel compte GitHub peut télécharger ce fichier, illisible sans la phrase. Rien n'est écrit en clair, ni sur le disque de l'Action ni dans le dépôt. Le journal de l'Action ne donne que le nombre de lignes de chaque table.
- **Sans phrase de passe dans GitHub,** le robot ne lance aucune sauvegarde et l'affiche en avertissement à chacun de ses passages, sur la page de l'exécution, sans qu'il faille ouvrir le journal. Lancée à la main, l'Action ne sauvegarde rien et l'affiche aussi.
- **Lancée par le robot horaire :** le planning de GitHub saute la plupart de ses passages sur ce dépôt (les 6, 7 et 8 novembre 2026, quatre exécutions planifiées sur vingt-quatre ont démarré chaque jour, et la première sauvegarde du lundi n'a pas eu lieu). Le job `sauvegarde-de-la-semaine` de `site.yml` regarde donc à chaque passage du robot si la semaine a son fichier gardé, la semaine commençant le lundi à 7 h UTC (8 h à Paris en hiver, 9 h en été). Sinon, il lance l'Action. Une sauvegarde ratée est relancée au passage suivant, avec trois essais au plus dans la semaine, lancements à la main compris ; au-delà, l'exécution du robot l'affiche en avertissement, et il attend le lundi suivant. Une sauvegarde restée plus d'une heure en file d'attente est signalée aussi (`src/lib/sauvegarde-relance.ts`).
- **Les droits de ce job :** le seul droit Actions de GitHub, qui permet de lancer une exécution, mais aussi d'en annuler ou d'en effacer une avec ses fichiers. Il ne peut pas écrire dans le dépôt, et le job qui travaille sur `data/` n'a pas ce droit sur les sauvegardes. La phrase ne passe pas par lui : seulement le fait qu'elle existe.
- **Sur demande :** onglet **Actions → Sauvegarde chiffrée → Run workflow**. Une sauvegarde faite à la main compte pour sa semaine.
- **Le compte rendu :** à la fin d'une exécution, le salon privé de l'encadrement reçoit l'un de trois messages, sans nom ni donnée personnelle (`src/lib/sauvegarde-discord.ts`) :
  - « Sauvegarde chiffrée faite le… GitHub la garde jusqu'au… » ;
  - « …n'a rien gardé : la phrase de passe ou un autre réglage manque… » ;
  - « …a échoué… », avec le lien de l'exécution.

  Le compte rendu part jour et nuit depuis le 14 novembre 2026. Une exécution annulée ou arrêtée par son délai n'en a pas. Sans lien pour le salon de l'encadrement, ni dans la Direction ni dans le secret `DISCORD_WEBHOOK_ENCADREMENT`, il n'y a pas de compte rendu, et un envoi raté ne fait pas échouer la sauvegarde.

**Pour l'activer**, une seule fois :

1. Tirer une phrase de passe au hasard avec le générateur d'un gestionnaire de mots de passe : 32 caractères, ou six mots. Le script refuse une phrase de moins de 20 caractères ou faite de trop peu de lettres différentes. La garder dans ce gestionnaire. **La perdre, c'est perdre toutes les sauvegardes.**
2. Sur GitHub, **Settings → Secrets and variables → Actions → New repository secret** : nom `SAUVEGARDE_CLE`, valeur la phrase.

**Pour vérifier ou ouvrir une sauvegarde**, la phrase se tape soi-même dans un terminal, jamais dans une conversation, de préférence PowerShell ou Windows Terminal. Télécharger l'artifact de l'exécution voulue et le décompresser, puis, dans le dossier du site :

```bash
npm run sauvegarde:verifier chemin/gal-sauvegarde-2026-11-09.bin
npm run sauvegarde:ouvrir chemin/gal-sauvegarde-2026-11-09.bin
```

`sauvegarde:verifier` n'écrit rien : il dit si la phrase ouvre le fichier et combien de lignes a chaque table. À faire après la première sauvegarde, avec la phrase telle qu'elle a été rangée, pour s'assurer qu'elle est juste. `sauvegarde:ouvrir` écrit le contenu, en clair, dans `.cache/sauvegarde/`, que Git ignore. Il contient des données personnelles : effacez-le une fois servi. La restauration se fait à la main, dans l'éditeur SQL de Supabase : demandez de l'aide si besoin.

La phrase est demandée à l'écran, sans s'afficher : elle ne reste dans aucun historique. Certaines fenêtres, comme Git Bash, ne savent pas la masquer : elle s'y afficherait, d'où PowerShell ou Windows Terminal.


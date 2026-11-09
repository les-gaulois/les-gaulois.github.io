# La connexion et l'espace Direction

Comment les membres se connectent avec Discord, ce que chaque rôle peut faire, comment la direction du clan publie depuis le site, et comment tout installer.

C'est la seule partie du site qui a un serveur et une base de données (Supabase). Le reste du site n'en dépend pas et continue de marcher si elle tombe. La Conquête des Gaulois, le jeu pour lequel cette connexion avait été créée, a été retirée du site le 6 novembre 2026 : ses tables restent dans le projet Supabase en ligne, inutilisées.

**État au 6 novembre 2026 :** en ligne sur le vrai projet Supabase. La connexion Discord et la désignation du fondateur ont été essayées avec un vrai compte. Le reste n'a été testé qu'en local, sur un vrai Postgres et un vrai navigateur.

## Ce que voit chacun

- **Un visiteur :** un bouton « Se connecter » dans l'en-tête de toutes les pages. Tant qu'il n'a pas de session, son navigateur ne télécharge pas Supabase.
- **Un membre connecté :** son nom dans l'en-tête, qui mène à son compte. Une fois validé, il répond « Je viens » aux événements et vote aux sondages de l'accueil, et lit le mot d'accueil de l'encadrement dans `/compte`.
- **Un officier, un admin, le fondateur :** en plus, un lien « Direction ». Sur téléphone, seul ce lien reste, faute de place : le compte s'ouvre depuis l'espace Direction.
  - Quand des demandes attendent, une pastille jaune donne leur nombre à côté de ce lien, sur toutes les pages. Le serveur ne le donne qu'à l'encadrement (`count_pending_requests`, migration `20261108000100_pastille_direction.sql`). Il se relit à chaque page, et aussitôt qu'une demande est traitée dans `/admin`. En vue joueur, ni lien ni pastille.

Sans `PUBLIC_SUPABASE_URL` et `PUBLIC_SUPABASE_KEY`, aucun de ces éléments n'apparaît et le site reste entièrement statique.

## L'espace Direction : `/direction`

- **En rouge :** `/direction` et `/admin` ont le thème rouge de l'encadrement ([DESIGN.md](DESIGN.md), « Thème rouge de l'encadrement »), pour qu'on sache où l'on est. Seul l'affichage change. Ces pages restent rouges pour tout visiteur, y compris en vue joueur, où elles sont fermées comme pour un membre.
- **Ce qui attend une décision :** demandes à traiter, membres validés, encadrement, suspendus. Chaque case mène à `/admin`, qui reste l'écran de décision.
- **État du site :** la dernière collecte publiée, chaque source de l'API d'OpenFront (à jour, en retard ou en échec, avec l'erreur), la dernière relecture de la liste officielle et le dernier envoi de la gazette sur Discord.
  - Tout vient de `data/meta.json`, de `data/gazette-envoi.json` et du serveur. Les délais sont ceux des pages du site (`src/lib/freshness.ts`).
  - L'âge se calcule dans le navigateur, chaque minute. Si la collecte ou la mise en ligne s'arrête, la page n'est plus reconstruite, mais elle vieillit à l'écran et le signale. Laquelle des deux s'est arrêtée se lit dans l'onglet **Actions**.
  - La gazette est donnée sans jugement de retard. Un fichier d'envoi absent ou illisible donne « aucun envoi noté ».
  - Le calcul est dans `src/lib/etat-site.ts`.
- **Annonces et événements :** publiés sans passer par GitHub, visibles aussitôt sur l'accueil, même sans compte. Ils s'ajoutent à ceux de `content/*.json`, qui restent valables. Si le serveur ne répond pas, l'accueil garde ceux du dépôt.
  - **Répéter chaque semaine :** un nouvel événement peut revenir de 2 à 12 semaines, à la même heure de Paris, changement d'heure compris (`save_event_series`). Chaque rendez-vous est un événement ordinaire, qui se modifie ou se supprime seul et garde ses propres réponses. L'accueil n'en montre que le prochain, avec « Encore 4 rendez-vous, jusqu'au … » : ce texte reste juste même si un rendez-vous est déplacé ou supprimé.
  - **« Je viens » :** sur l'accueil, un membre validé connecté répond pour lui-même, seulement à un événement à venir (`set_attendance`). Tout le monde voit le nombre ; l'espace Direction donne les noms (`list_event_attendance`). Les réponses sont dans une table privée, `internal.event_attendance`, que l'API ne montre pas. Un compte suspendu n'est ni compté ni nommé. Les événements du dépôt n'ont pas de réponses.
- **Sondages :** une question et de 2 à 6 choix, avec une fin facultative dans les 90 jours (`save_poll`). Trois sondages ouverts au plus : l'accueil, seul endroit où l'on vote, les montre tous, avant les sondages fermés.
  - Les membres validés votent sur l'accueil, une voix chacun, qu'ils peuvent changer tant que le sondage est ouvert (`vote_poll`).
  - Tout le monde voit les totaux, jamais qui a voté quoi : les voix sont dans une table privée, `internal.poll_votes`, et aucune fonction ne le donne. La voix d'un compte suspendu ne compte plus.
  - Un sondage fermé, à la main ou par sa date, montre son résultat 7 jours sur l'accueil. Le supprimer efface ses votes. Un sondage ne se modifie pas : cela fausserait les voix déjà données.
  - Un sondage dont les totaux seraient illisibles n'affiche aucun résultat, plutôt qu'un « 0 voix » faux.
- **Mot d'accueil :** un texte de l'encadrement, de 2 000 caractères au plus, que chaque membre validé lit dans `/compte` (`save_welcome`, `get_welcome`). Un texte vide l'efface. C'est un texte commun : tout l'encadrement, officiers compris, peut le réécrire.
- Les brouillons des sondages et du mot d'accueil survivent, eux aussi, à un aller-retour en vue joueur.
- **Transmettre le rôle de fondateur :** visible du fondateur seul. Il faut retaper le nom de la personne. L'ancien fondateur devient admin.
- **Voir le site comme un joueur :** le bouton en haut de l'espace montre tout le site comme à un membre sans grade : plus de lien « Direction » dans l'en-tête, plus de boutons de l'encadrement dans `/compte`, et `/direction` et `/admin` fermés comme pour un membre. Une bande en haut de chaque page le rappelle et permet d'en sortir.
  - Seul l'affichage change : le serveur garde le vrai rôle. Un bouton de membre agit pour de vrai : « Effacer mon compte » efface le compte d'un officier ou d'un admin, et le serveur le refuse au fondateur.
  - Le choix reste dans le navigateur (`gal-vue-joueur`) jusqu'à la sortie ou la déconnexion, y compris quand la session se perd seule (jeton révoqué, déconnexion sur un autre appareil). Il vaut pour les pages ouvertes ensuite, dans tous les onglets : une page déjà ouverte ailleurs garde sa vue jusqu'à son prochain chargement, pour ne pas fermer un formulaire en cours. Les brouillons d'annonce et d'événement survivent à un aller-retour.

Une annonce parle au nom du clan : le nom de son auteur n'est pas public, seuls l'encadrement et le journal le connaissent.

## L'administration : `/admin`

- **Demandes :** valider ou refuser, avec une raison facultative.
  - De la plus ancienne à la plus récente, chacune dit depuis combien de temps elle attend. Au-delà de 2 jours, elle passe en jaune (`src/lib/compte/requests.ts`).
  - Des raisons de refus toutes prêtes (« Pas reconnu sur Discord. »…) remplissent le champ sans rien envoyer : on peut les compléter. La raison d'un refus est montrée telle quelle au membre, dans `/compte`. Une validation n'en montre aucune.
  - La durée d'attente se recalcule chaque minute. L'écran montre au plus les 200 demandes les plus anciennes, ce que le serveur renvoie.
- **Membres :** rôles, suspensions et rétablissements. Un rôle choisi dans la liste ne part qu'après « Confirmer » : au clavier ou d'un doigt, on choisit vite un autre rôle par erreur. Après « Confirmer » ou « Annuler », le focus revient à la liste du rôle.
- **Journal**, pour les admins et le fondateur : une phrase par action, la plus récente d'abord, par exemple « Chef a changé le rôle de Recrue : Membre → Officier ». Les détails viennent du serveur (rôles, raison, titre, date d'un événement) : un détail absent n'est pas écrit, et un code sans libellé s'affiche tel quel. Le serveur note de la même façon une publication et une modification, d'où « a publié ou modifié ». Filtres par personne (qui agit ou qui est visé) et par type d'action. L'écran lit les 500 dernières entrées, le maximum du serveur, et en montre 50 à la fois. Les phrases sont dans `src/lib/compte/admin-log.ts`, et un test vérifie que chaque action notée par le serveur du site a la sienne.

## Prévenir l'encadrement sur Discord

Le robot horaire signale les demandes d'adhésion qui attendent, sur un salon Discord **privé** de l'encadrement (`scripts/prevenir-encadrement.ts`, `src/lib/encadrement-discord.ts`).

- **Quand :** une nouvelle demande déclenche un message au passage suivant du robot, dans l'heure. Une demande qui attend depuis plus de 24 h vaut un rappel, une fois par jour au plus. Rien entre 23 h et 8 h, heure de Paris, comme les alertes de place.
- **Quoi :** « 2 demandes d'adhésion attendent sur le site du clan. La plus ancienne attend depuis 3 jours. », avec le lien de `/admin`. Ni nom, ni identifiant, ni mention : personne n'est appelé.
- **Où c'est noté :** ce qui a été annoncé reste dans Supabase (`app_state`, clé `staff_notice`), jamais dans le dépôt public. Un envoi raté n'est pas noté : il repart au passage suivant.
- **Les fonctions :** `staff_digest` et `note_staff_notice` (migration `20261108000300_encadrement_et_sauvegarde.sql`), réservées à la clé de service.

**Pour l'activer**, une seule fois :

1. Dans Discord, sur le salon privé de l'encadrement : **Modifier le salon → Intégrations → Webhooks → Nouveau webhook**, puis **Copier l'URL du webhook**.
2. Sur GitHub, **Settings → Secrets and variables → Actions → New repository secret** : nom `DISCORD_WEBHOOK_ENCADREMENT`, valeur l'adresse copiée.

Ce lien permet d'écrire dans le salon : il ne va que dans ce secret, jamais dans le dépôt ni dans une conversation. Sans lui, rien n'est envoyé.

## La sauvegarde chiffrée

Supabase ne sauvegarde rien sur le forfait gratuit. Chaque semaine, l'Action **Sauvegarde chiffrée** (`.github/workflows/sauvegarde.yml`) copie ce que le site garde et qui ne se retrouve nulle part ailleurs :

- comptes et rôles, liens Discord (identifiant et nom), demandes et journal ;
- annonces, événements et réponses « Je viens » ;
- sondages avec leurs seuls totaux, et mot d'accueil.

L'export (fonction `export_site`, réservée à la clé de service) ne garde que le nécessaire :

- **Des votes, les totaux par choix seulement.** Personne n'apprend qui a voté quoi, pas même avec la phrase de passe. Après une restauration, les sondages reviennent sans leurs voix individuelles.
- **Ni l'empreinte du `publicId` OpenFront, ni les textes libres d'une demande** (ce que le joueur a tapé, son mot pour l'officier). Avec l'API publique, ils pourraient lever l'anonymat d'un membre anonyme si la phrase était devinée. Après une restauration, le lien avec le profil OpenFront est perdu. Un compte validé ne peut pas refaire de demande : remettez-le d'abord en attente dans l'éditeur SQL, puis la personne refait sa demande.
- **Ni les rôles prévus**, qu'on ne lit que dans l'éditeur de Supabase, **ni la liste officielle**, qui se relit, **ni les tables de l'ancien jeu**.
- **Ni les comptes de connexion eux-mêmes** (`auth.users`, gérés par Supabase). Si le projet est perdu, chacun se reconnecte avec Discord, et l'encadrement retrouve rôles et données par l'identifiant Discord de `private_links`.

Comment elle est gardée :

- **Chiffrée avant de sortir :** AES-256-GCM, avec une clé tirée de la phrase de passe par scrypt, réglé lent exprès (N = 2^18) pour qu'une phrase coûte cher à deviner (`src/lib/sauvegarde.ts`). Le fichier porte ses réglages, et tout son en-tête est authentifié : une seule lettre changée le rend inutilisable.
- **Gardée 90 jours** par GitHub, dans l'exécution de l'Action, sous **Artifacts**. Le dépôt est public : n'importe quel compte GitHub peut télécharger ce fichier, illisible sans la phrase. Rien n'est écrit en clair, ni sur le disque de l'Action ni dans le dépôt. Le journal de l'Action ne donne que le nombre de lignes de chaque table.
- **Sans phrase de passe dans GitHub,** le robot ne lance aucune sauvegarde. Lancée à la main, l'Action ne sauvegarde rien et l'affiche en avertissement sur la page de son exécution.
- **Lancée par le robot horaire :** le planning de GitHub saute la plupart de ses passages sur ce dépôt (les 6, 7 et 8 novembre 2026, quatre exécutions planifiées sur vingt-quatre ont démarré chaque jour, et la première sauvegarde du lundi n'a pas eu lieu). Le job `sauvegarde-de-la-semaine` de `site.yml` regarde donc à chaque passage du robot si la semaine a son fichier gardé, la semaine commençant le lundi à 3 h UTC (4 h à Paris en hiver, 5 h en été). Sinon, il lance l'Action. Une sauvegarde ratée est relancée au passage suivant, avec trois essais au plus dans la semaine, lancements à la main compris ; au-delà, l'exécution du robot l'affiche en avertissement, et il attend le lundi suivant. Une sauvegarde restée plus d'une heure en file d'attente est signalée aussi (`src/lib/sauvegarde-relance.ts`).
- **Les droits de ce job :** le seul droit Actions de GitHub, qui permet de lancer une exécution, mais aussi d'en annuler ou d'en effacer une avec ses fichiers. Il ne peut pas écrire dans le dépôt, et le job qui travaille sur `data/` n'a pas ce droit sur les sauvegardes. La phrase ne passe pas par lui : seulement le fait qu'elle existe.
- **Sur demande :** onglet **Actions → Sauvegarde chiffrée → Run workflow**. Une sauvegarde faite à la main compte pour sa semaine.

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

## Les droits

| Action | Visiteur | En attente | Membre | Officier | Admin | Fondateur |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Lire les annonces et les événements | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Voir les totaux des sondages et le nombre de présents | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Demander sa validation | | ✓ | | | | |
| Répondre « Je viens », voter, lire le mot d'accueil | | | ✓ | ✓ | ✓ | ✓ |
| Valider les membres | | | | ✓ | ✓ | ✓ |
| Ouvrir l'espace Direction, voir qui vient | | | | ✓ | ✓ | ✓ |
| Publier une annonce, un événement ou un sondage, écrire le mot d'accueil | | | | ✓ | ✓ | ✓ |
| Modifier, fermer ou supprimer les siens | | | | ✓ | ✓ | ✓ |
| Modifier, fermer ou supprimer ceux des autres | | | | | ✓ | ✓ |
| Lire le journal | | | | | ✓ | ✓ |
| Suspendre un membre, gérer les officiers | | | | | ✓ | ✓ |
| Lever une suspension | | | | | ✓ | ✓ |
| Nommer ou retirer des admins | | | | | | ✓ |
| Lever la suspension d'un admin | | | | | | ✓ |
| Transmettre le rôle de fondateur | | | | | | ✓ |

Personne ne change son propre rôle. Chaque droit est vérifié par le serveur : masquer un bouton ne protège rien. Toute publication, modification ou suppression va au journal, titre compris.

**Le rang dans le jeu ne donne aucun droit.** Lors d'une demande, l'officier voit « Chef dans le jeu » ou « Officier dans le jeu », d'après la liste publique des membres. Cette liste étant publique, n'importe qui peut prétendre être cette personne : le rôle sur le site reste une décision humaine.

## Les rôles prévus

La direction peut noter à l'avance l'identifiant Discord de son encadrement et le rôle de chacun. La personne se connecte, indique son pseudo OpenFront dans `/compte`, et le serveur la valide aussitôt avec ce rôle. Personne n'a à intervenir. Cette liste reste une décision humaine : c'est la direction qui l'écrit.

Dans l'éditeur SQL de Supabase, avec le mode développeur de Discord pour copier les identifiants :

```sql
insert into internal.role_presets (discord_id, role) values
  ('IDENTIFIANT_D_UN_ADMIN', 'admin'),
  ('IDENTIFIANT_D_UN_OFFICIER', 'officer');
```

**Ne mettez jamais ces identifiants dans le dépôt : il est public.**

- **Qui décide :** seuls `admin` et `officer` sont acceptés. Le rôle de fondateur ne se prévoit pas, il se transmet.
- **Pourquoi passer par le pseudo :** un compte déjà validé ne peut plus lier son profil OpenFront. Valider dès la connexion laisserait la personne « Gaulois n° … » sur le site.
- **Une faute de frappe :** un pseudo absent de la liste des membres ne valide rien. La demande attend un officier comme les autres. S'il la refuse, la personne reste prévue et peut recommencer. S'il la valide, le rôle arrive à ce moment-là.
- **Une seule fois :** l'entrée s'efface dès qu'elle a servi. Une rétrogradation tient donc après une nouvelle connexion, et rien ne reste de la liste une fois tout le monde passé.
- **La sécurité :** l'identifiant comparé vient de `auth.identities`, jamais de `raw_user_meta_data`. Personne ne lit ni n'écrit cette liste depuis le site, clé de service comprise.
- **La trace :** le journal note `membership_approved` et `role_preset_applied`, au nom de la personne elle-même.

Pour relire la liste, ou retirer quelqu'un avant sa demande :

```sql
select * from internal.role_presets;
```

```sql
delete from internal.role_presets where discord_id = 'SON_IDENTIFIANT';
```

## L'identité Discord : les règles à garder

Trois failles ont été trouvées et corrigées le 6 novembre 2026, avant toute mise en ligne. Leurs tests sur un vrai Postgres ont été retirés avec le jeu : ces règles ne sont plus vérifiées automatiquement, à relire avant de toucher au serveur.

1. **Ne jamais lire `raw_user_meta_data`.** Un utilisateur connecté peut y écrire ce qu'il veut avec `auth.updateUser`, ou à l'inscription par e-mail. S'y fier lui permettait d'afficher aux officiers le pseudo Discord d'un autre, et même de se faire désigner fondateur. L'identité vient seulement de `auth.identities`, relue à chaque connexion.
2. **Un compte sans Discord ne peut rien demander.** Les officiers reconnaissent les gens sur Discord.
3. **Une suspension ne se lève que par un admin de rang supérieur.** La règle est posée sur la table : elle vaut pour toute fonction, présente ou future. Valider une demande restée ouverte ne la contourne plus, et réintégrer un compte jamais validé le remet en attente.

## Après avoir créé les comptes : le contrôle

En plus des étapes d'installation ci-dessous, il faut :

- **Ajouter la redirection** `https://les-gaulois.github.io/direction` dans **Authentication → URL Configuration → Redirect URLs**.
- **Couper l'inscription par e-mail** dans **Authentication → Providers → Email**. Le site ne s'en sert pas.

Puis lancez le contrôle. Il n'écrit rien et n'affiche aucune clé. Sous PowerShell, renseignez d'abord les valeurs dans le terminal, sans les enregistrer dans un fichier du dépôt :

```powershell
$env:SUPABASE_URL = "https://votre-projet.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
$env:SUPABASE_SECRET_KEY = "sb_secret_..."
```

```bash
npm run verifier:ligne
```

Il vérifie que le projet répond, que Discord est activé, que l'e-mail est coupé, que le schéma est installé, qu'un visiteur ne peut ni se désigner fondateur ni lire les tables privées, et, avec la clé secrète, que le clan a un fondateur et que la liste des membres a été relue.

**Ce contrôle ne remplace pas un essai réel.** Il reste à faire, avec de vrais comptes :

1. Se connecter avec Discord : le vrai nom Discord doit apparaître dans `/compte`.
2. Faire sa demande dans `/compte`, se désigner fondateur, valider sa propre demande dans `/admin` (détail à l'étape 4 de l'installation), puis ouvrir `/direction`.
3. Publier une annonce, puis la voir sur l'accueil dans une fenêtre privée.
4. Connecter un second compte, faire une demande et la valider.

## Ce qui n'a pas été vérifié

- **L'espace Direction et un second compte sur le vrai Supabase.** La connexion Discord, elle, a été essayée le 6 novembre 2026 : `on_auth_user_updated` remplit bien le nom et l'identifiant depuis `auth.identities`. Le nom gardé est le nom d'utilisateur Discord, pas le nom affiché.
- **Un vrai téléphone, Firefox et Safari.**
- **La vue joueur avec un vrai compte de l'encadrement.** Le 8 novembre 2026, elle n'a été essayée qu'avec un faux serveur, dans un vrai navigateur : bouton, bande, en-tête, `/compte`, `/direction` et `/admin`.
- **L'avis à l'encadrement et la sauvegarde chiffrée.** Le 8 novembre 2026, leur logique a été testée, les scripts lancés sans secret (ils ne font rien) et une sauvegarde d'essai rouverte. Mais aucun message n'est encore parti sur Discord, et l'Action **Sauvegarde chiffrée** n'a jamais tourné : il faut d'abord poser les secrets `DISCORD_WEBHOOK_ENCADREMENT` et `SAUVEGARDE_CLE`. À la première sauvegarde, vérifier qu'elle s'ouvre avec la phrase de passe.
- **Les événements répétés, « Je viens », les sondages et le mot d'accueil.** Le 8 novembre 2026, ils n'ont été essayés qu'avec un faux serveur, dans un vrai navigateur. Leur migration (`20261108000200_vie_du_clan.sql`) est installée sur le vrai projet, et ses droits contrôlés en lecture seule ; les fonctions elles-mêmes n'y ont pas encore servi.
- **La confirmation d'un rôle, l'attente des demandes et les raisons toutes prêtes.** Le 8 novembre 2026, ils n'ont été essayés qu'avec un faux serveur, dans un vrai navigateur.
- **Le journal en phrases, la pastille et l'état du site.** Le 8 novembre 2026, ils n'ont été essayés qu'avec un faux serveur, dans un vrai navigateur. La fonction de la pastille a été installée sur le vrai projet, et ses droits contrôlés en lecture seule.
- **Le thème rouge sur les écrans connectés.** Le 8 novembre 2026, axe n'a trouvé aucun défaut sur `/direction` et `/admin` connectés, sur bureau et téléphone, mais avec un faux serveur. Les tests automatiques, construits sans serveur de connexion, ne voient de ces pages que la carte « connexion pas ouverte ».
- **La relecture de la liste des membres sous son nouveau nom.** Le script `scripts/relire-membres.ts` reprend le code de l'ancienne tâche quotidienne. Sa première exécution sur le vrai projet se lit dans l'onglet **Actions**.

## Vérifier les membres : la limite à connaître

La liste des membres est publique : **taper le pseudo ou l'identifiant d'un membre ne prouve pas qu'on est ce membre.** Le site compare donc la demande à la liste, puis **un officier confirme**, en reconnaissant la personne sur Discord. Seul l'encadrement noté à l'avance par la direction s'en passe : son identifiant Discord ne s'imite pas.

La liste est relue une fois par jour par `scripts/relire-membres.ts`, lancé par la GitHub Action. Le `publicId` de chaque membre y est aussitôt remplacé par son empreinte : il n'entre jamais dans la base.

La preuve automatique existe : le jeton d'identité d'OpenFront (voir [API_AUDIT.md](API_AUDIT.md), section 9). Elle n'est pas branchée : OpenFront doit d'abord ajouter le site à sa liste, et le message est prêt à la section 10 du même fichier. Une fois le site accepté, il restera à écrire une petite fonction serveur (Edge Function) qui valide le jeton.

## Installer la connexion

Rien de ceci ne peut être fait à votre place : il faut créer des comptes. **Le forfait gratuit suffit. Si une étape demande de payer, arrêtez-vous.**

### 1. Créer le projet Supabase

Sur [supabase.com](https://supabase.com), créez un projet gratuit, **dans une région d'Europe** : la page de confidentialité du site l'annonce.

Notez, dans **Project Settings → API Keys** : l'adresse du projet, la clé **publishable** (`sb_publishable_…`) et la clé **secret** (`sb_secret_…`). La première peut aller dans le navigateur. La seconde contourne toutes les règles d'accès : elle ne va que dans les secrets de GitHub.

### 2. Créer l'application Discord

Sur le [portail développeur de Discord](https://discord.com/developers/applications) : **New Application**, puis **OAuth2**.

- Dans **Redirects**, ajoutez `https://<votre-projet>.supabase.co/auth/v1/callback`, puis cliquez sur **Save Changes**. Sinon, Discord répond « redirect_uri OAuth2 non valide » à la connexion.
- Copiez le **Client ID** et le **Client Secret**.

Dans Supabase, **Authentication → Providers → Discord** : activez-le et collez ces deux valeurs. Le secret reste là, jamais dans le dépôt.

Toujours dans Supabase, **Authentication → URL Configuration** :

- **Site URL :** `https://les-gaulois.github.io/`
- **Redirect URLs :** ajoutez `https://les-gaulois.github.io/compte`, `https://les-gaulois.github.io/admin` et `https://les-gaulois.github.io/direction`

Dans **Authentication → Providers → Email**, coupez l'inscription par e-mail : le site ne s'en sert pas.

### 3. Installer le schéma

Collez chaque fichier de `supabase/migrations/` dans l'éditeur SQL de Supabase, **dans l'ordre de leurs noms**, ou utilisez `npx supabase db push` après `npx supabase login` et `npx supabase link`. Ces fichiers installent aussi les tables de l'ancien jeu. Une migration déjà appliquée ne se modifie jamais : on en ajoute une nouvelle.

### 4. Vous désigner fondateur

Connectez-vous une fois sur le site avec Discord, une fois l'étape 5 faite.

**Faites d'abord votre demande :** dans `/compte`, remplissez « Lier mon profil OpenFront ». Un compte déjà validé ne peut plus en faire : il resterait « Gaulois n° … », sans lien avec son joueur OpenFront.

Puis, dans l'éditeur SQL de Supabase, avec **votre identifiant Discord** (mode développeur de Discord, clic droit sur votre nom, « Copier l'identifiant ») :

```sql
select public.bootstrap_founder('VOTRE_IDENTIFIANT_DISCORD');
```

Cette fonction ne marche qu'une fois, et personne ne peut l'appeler depuis le site.

Enfin, dans `/admin`, onglet **Demandes**, validez votre propre demande : votre pseudo OpenFront devient votre nom sur le site.

### 5. Brancher le site

Sur GitHub, **Settings → Secrets and variables → Actions**.

| Onglet | Nom | Valeur |
|---|---|---|
| Variables | `SUPABASE_URL` | L'adresse du projet |
| Variables | `SUPABASE_PUBLISHABLE_KEY` | La clé `sb_publishable_…` |
| Secrets | `SUPABASE_SECRET_KEY` | La clé `sb_secret_…` |
| Secrets, facultatif | `DISCORD_WEBHOOK_ENCADREMENT` | Le lien d'un salon privé de l'encadrement : voir « Prévenir l'encadrement sur Discord » |
| Secrets, facultatif | `SAUVEGARDE_CLE` | La phrase de passe de la sauvegarde : voir « La sauvegarde chiffrée » |

Relancez ensuite **Données et site** dans l'onglet **Actions**. Le bouton « Se connecter » apparaît dans l'en-tête.

## Les limites du forfait gratuit

Lues sur [la page des tarifs de Supabase](https://supabase.com/pricing) le 5 novembre 2026 : 500 Mo de base, 50 000 utilisateurs actifs par mois, 5 Go de bande passante, 2 projets actifs.

- **Mise en pause après une semaine d'inactivité.** La relecture de la liste des membres devrait l'éviter, mais [Supabase ne le garantit pas](https://supabase.com/docs/guides/platform/free-project-pausing), et elle dépend du cron de GitHub. En cas de pause, la connexion ne répond plus et le reste du site continue. Le projet se relance depuis le tableau de bord.
- **Aucune sauvegarde automatique de Supabase.** La sauvegarde chiffrée du site la remplace, une fois sa phrase de passe posée : voir « La sauvegarde chiffrée ».

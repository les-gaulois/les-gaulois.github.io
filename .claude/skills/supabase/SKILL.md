---
name: supabase
description: Tout travail sur le serveur de connexion (Supabase) — nouvelle migration, fonction SQL, table, droits, identité Discord, rôles prévus — et sa mise en ligne sur le vrai projet sans demander d'accord, sauf si une migration supprime quelque chose. À utiliser dès qu'on touche supabase/, src/lib/compte/, src/components/compte/ ou les scripts qui parlent à Supabase.
paths:
  - "supabase/**"
  - "src/lib/compte/**"
  - "src/components/compte/**"
  - "scripts/relire-membres.ts"
  - "scripts/verifier-mise-en-ligne.ts"
  - "scripts/prevenir-encadrement.ts"
  - "scripts/sauvegarder.ts"
  - "scripts/ouvrir-sauvegarde.ts"
  - "scripts/relancer-sauvegarde.ts"
  - "scripts/rendre-compte-sauvegarde.ts"
  - "scripts/discord-commande.ts"
---

# Supabase : la connexion et l'espace Direction

Le fonctionnement, les rôles et l'installation sont décrits dans `docs/DIRECTION.md`. Le projet en ligne est lié (`supabase/.temp/`, ignoré par Git), référence `zxavwcupauheheqxfdez`, Postgres 17, région Europe, forfait gratuit : **si une commande demande de payer, arrêter.** Les tables de l'ancienne Conquête y restent, inutilisées : ne pas les supprimer sans demande explicite, ne pas construire dessus.

## Ce qui ne se négocie pas

- Le serveur décide de tout : chaque droit se vérifie dans la fonction SQL, jamais en masquant un bouton. Le navigateur n'appelle que des fonctions via `call()` de `src/lib/compte/api.ts`. Trois exceptions, du même fichier : `uploadDiscordImage` dépose une image des messages Discord dans l'espace `discord-images`, dont la règle d'accès (`storage.objects`, migration `20261111000600_messages_discord.sql`) n'admet que les admins et le fondateur ; `signInWithCode` envoie un code de connexion à la fonction serveur `code-discord` ; `noteSiteVisit` envoie, depuis chaque page publiée, le compte d'une visite à `note_site_visit` (migration `20261113001500_activite_du_site.sql`), par un simple `fetch` pour ne pas charger le code de Supabase.
- L'identité vient de `auth.identities`, ou, pour la connexion par code, d'une commande `/code` signée par Discord et vérifiée par `code-discord` ; jamais de `raw_user_meta_data`, qu'un utilisateur peut écrire lui-même. Un compte sans Discord ne peut rien demander. Un compte Discord n'a qu'un compte sur le site (index unique sur `private_links.discord_id`). Jamais reconnaître un compte à son adresse e-mail ni à `raw_user_meta_data`, qu'un joueur choisit : seulement à l'identifiant Discord déjà posé, ou aux métadonnées d'application (`raw_app_meta_data`), que seule la clé de service écrit. Une suspension ne se lève que par un admin de rang supérieur. Personne ne change son propre rôle. Toute publication, modification ou suppression va au journal.
- Les tests de droits sur un vrai Postgres ont été retirés avec le jeu : ces règles ne sont plus vérifiées automatiquement. Avant de toucher au serveur, relire la section « L'identité Discord : les règles à garder » de `docs/DIRECTION.md`, et après, les contrôler à la main (ci-dessous).
- Les identifiants Discord de l'encadrement (`internal.role_presets`) s'écrivent dans l'éditeur SQL de Supabase, jamais dans le dépôt, jamais dans un test.

## Écrire une migration

- Les migrations sont figées : `db push` ne rejoue jamais une migration appliquée. **Ajouter un fichier, ne jamais modifier un fichier existant** (les permissions du projet les protègent). Nom : `supabase/migrations/AAAAMMJJHHMMSS_nom_en_francais.sql`, postérieur au dernier.
- Nouvelle fonction SQL : Postgres l'ouvre à tout le monde, visiteurs compris. La migration qui la crée fait elle-même `revoke all on function … from public, anon, authenticated;` puis ses `grant` ciblés.
- Nouvelle table dans `public` : Supabase l'ouvre à `anon` et `authenticated`. La migration active RLS puis fait `revoke all on table … from anon, authenticated;`. Les tables privées vont dans le schéma `internal`.
- Garder un `WHERE` sur chaque `update` et `delete` : Supabase refuse sinon.
- Une fonction appelée depuis le site renvoie `{ ok: true, … }` ou `{ ok: false, error: "code" }` ; le code a son message en français dans `src/lib/compte/errors.ts`, avec son test dans `tests/unit/compte-errors.test.ts`.
- Une requête sortante du serveur passe par pg_net, après l'enregistrement, et ne fait jamais échouer l'action qui la lance (`internal.discord_post`, migration `20261111000100_appels_sur_discord.sql`). Son adresse est rangée sous une forme vérifiée (aujourd'hui seulement `https://discord.com/api/webhooks/…`), jamais choisie par le navigateur. pg_net n'existe pas sur PGlite : le simuler pour essayer une migration.

## Mettre en ligne un changement de schéma

Tu le fais toi-même, dans cet ordre, **avant** de publier le site qui s'en sert :

La CLI Supabase est en version 3 : sans `--remote`, une commande vise une pile locale (qui n'existe pas ici), et toute modification du projet en ligne demande une confirmation dont la réponse par défaut est non. Toujours écrire `--remote=zxavwcupauheheqxfdez`, et `--yes` pour les commandes qui modifient.

1. Lire la migration une dernière fois. Si elle contient `drop table`, `drop column`, `truncate`, un `delete` sur une table existante ou tout ce qui retire une donnée : **s'arrêter et demander**, en expliquant ce qui serait perdu. Une migration qui ne fait qu'ajouter se pousse sans accord.
2. `npx supabase migration list --remote=zxavwcupauheheqxfdez` : les migrations locales appliquées doivent correspondre à celles du projet. Un écart inattendu s'explique avant de continuer.
3. `npx supabase db push --remote=zxavwcupauheheqxfdez --dry-run` : seule la nouvelle migration doit apparaître.
4. `npx supabase db push --remote=zxavwcupauheheqxfdez --yes`.
5. Contrôler sans rien écrire, avec les valeurs publiques des variables GitHub (la clé secrète reste dans GitHub ; les contrôles qui la demandent affichent « À VOIR », c'est normal) :

   ```bash
   SUPABASE_URL="$(gh variable get SUPABASE_URL)" SUPABASE_PUBLISHABLE_KEY="$(gh variable get SUPABASE_PUBLISHABLE_KEY)" npm run verifier:ligne
   ```

   Et, pour une règle de droits, une requête en lecture seule : `npx supabase db query --remote=zxavwcupauheheqxfdez --read-only -f fichier.sql` (par exemple `select has_function_privilege('anon', 'public.ma_fonction(text)', 'execute');` doit renvoyer `false`). Le fichier SQL de contrôle ne se committe pas.
6. Puis la skill `publier` pour le site.

Si `npx supabase` demande de se connecter (`supabase login`) ou de relier le projet (`supabase link`), c'est une action hors du dépôt : le dire et attendre.

## Les scripts

- `scripts/relire-membres.ts` (`npm run membres:relire`) : lancé chaque heure par l'Action avec `SUPABASE_URL` et `SUPABASE_SECRET_KEY` des secrets GitHub ; sans eux il ne fait rien. Il remplace le `publicId` par son empreinte avant d'écrire.
- Les envois du robot sur Discord (`scripts/envoyer-*.ts`, `scripts/verifier-salons.ts`, `prevenir-encadrement.ts`, `rendre-compte-sauvegarde.ts`) lisent, avec la même clé, le lien de chaque salon réglé dans la Direction (`robot_discord_salons`, réservée à la clé de service), sinon le secret GitHub : `src/lib/salon-lien.ts`. `verifier-salons.ts` note son contrôle par `note_discord_salon`.
- `scripts/verifier-mise-en-ligne.ts` (`npm run verifier:ligne`) : les contrôles de `src/lib/compte/preflight.ts`, testés dans `tests/unit/preflight.test.ts`.
- `scripts/prevenir-encadrement.ts` (`npm run encadrement:prevenir`) : lancé chaque heure par l'Action, avec en plus le secret `DISCORD_WEBHOOK_ENCADREMENT`. Il lit `staff_digest`, poste sur un salon privé sans aucun nom, puis note l'envoi par `note_staff_notice`. Quand rien n'a jamais été noté et qu'aucune demande n'attend, il envoie une fois un message de mise en service. Logique et tests : `src/lib/encadrement-discord.ts`.
- `scripts/sauvegarder.ts` (`npm run sauvegarde`) : lancé chaque semaine par `.github/workflows/sauvegarde.yml`, avec en plus le secret `SAUVEGARDE_CLE`. Il chiffre `export_site` (`src/lib/sauvegarde.ts`). L'export ne garde que le nécessaire : les totaux des votes, jamais qui a voté quoi, et ni l'empreinte OpenFront ni les textes libres d'une demande (identifiant tapé, mot pour l'officier). Toute nouvelle table à sauvegarder passe par une nouvelle version de `export_site`, avec la même règle.
- `scripts/relancer-sauvegarde.ts` (`npm run sauvegarde:relancer`) : job `sauvegarde-de-la-semaine` de `site.yml`, à chaque passage du robot. Le planning de GitHub saute la plupart de ses passages : c'est ce job qui lance l'Action de sauvegarde si la semaine (depuis le lundi 7 h UTC, après les heures de silence) n'a pas de fichier gardé, trois essais au plus par semaine (`src/lib/sauvegarde-relance.ts`). Il ne reçoit que `SAUVEGARDE_CLE_POSEE`, jamais la phrase, et n'a que le droit `actions: write`.
- `scripts/rendre-compte-sauvegarde.ts` (`npm run sauvegarde:compte-rendu`) : dernière étape de `sauvegarde.yml`. Il dit au salon privé de l'encadrement si la sauvegarde est faite (jusqu'à quand GitHub la garde) ou ratée (lien de l'exécution), jamais la nuit (`src/lib/sauvegarde-discord.ts`).
- `scripts/ouvrir-sauvegarde.ts` (`npm run sauvegarde:verifier fichier.bin` ou `npm run sauvegarde:ouvrir fichier.bin`) : demande la phrase à l'écran ; `verifier` n'écrit rien et donne les nombres de lignes, `ouvrir` écrit le contenu en clair dans `.cache/sauvegarde/`. La phrase se tape dans le terminal du pilote, jamais dans une conversation : ne jamais la demander, ni lire le terminal pendant qu'elle se tape.
- Les commandes Discord : la fonction `code-discord` les crée elle-même après chaque mise en ligne (`supabase/functions/code-discord/definitions.ts` et `inscription.ts` ; `"inscription":true` dans `/etat`). Une commande nouvelle ou changée s'écrit dans `definitions.ts`, puis la fonction se remet en ligne : ne plus demander de « Reset Token » au pilote, qui en a assez.
- `scripts/discord-commande.ts` (`npm run discord:commande`), en secours seulement, si la fonction n'arrive pas à inscrire ses commandes alors que Discord accepte son jeton (`"robot":true` et `"inscription":false` dans `/etat`) : crée ou remet à jour toutes les commandes de `definitions.ts` sur le serveur du clan, chacune à part, sans toucher aux autres, depuis le poste du pilote ; il demande le jeton, donc un « Reset Token », puis le recollage dans Supabase. Le jeton du robot se colle quand il le demande, sans s'afficher. Comme la phrase de la sauvegarde : ne jamais demander ce jeton, ni lire le terminal pendant qu'il se tape.
- Le site reste entièrement statique sans `PUBLIC_SUPABASE_URL` et `PUBLIC_SUPABASE_KEY` : un test e2e le vérifie. Toute nouvelle fonctionnalité serveur doit garder ce comportement.

## La fonction serveur

- `supabase/functions/code-discord/index.ts` : la connexion par code (`docs/DIRECTION.md`, « Se connecter avec un code ») et les commandes du robot (« La commande /fiche », « Les commandes du robot »), qui lisent `/fiches.json` et `/commandes.json`, publiés par le site, et, pour `/moi` seulement, la fonction SQL `discord_moi`. Le panneau des rôles (« Les rôles sur Discord ») et, avec `tickets.ts`, les tickets d'assistance (« Les tickets d'assistance ») : appels à l'API de Discord avec le jeton du robot (`deps.discord`), sans table ni migration, comme ceux des concours et l'inscription des commandes (`inscription.ts`). `tickets.ts` n'importe d'`index.ts` que des types. Sa logique se teste avec Node (`tests/unit/code-discord.test.ts`, `tests/unit/tickets-discord.test.ts`). Déployée sans vérification de jeton (`supabase/config.toml`) : elle vérifie elle-même la signature de Discord. Elle ne note jamais un code, une adresse ni un jeton dans ses journaux.
- Sa mise en ligne (`npx supabase functions deploy code-discord --remote=zxavwcupauheheqxfdez --use-api --no-verify-jwt --yes`, `--use-api` pour se passer de Docker) se fait chez Supabase : à faire faire par le pilote si la commande est refusée, comme `db push`. Un seul secret, pour les rôles et les tickets : `LE_GAULOIS_BOT_TOKEN`, le jeton du robot « Le Gaulois », posé par le pilote dans **Edge Functions → Secrets** (jamais le secret GitHub `DISCORD_BOT_TOKEN`, celui du robot des images de bienvenue). Le serveur du clan et la clé publique de « Le Gaulois » sont écrits dans la fonction (`DISCORD_GUILD_ID` et `DISCORD_PUBLIC_KEY` les remplacent). `GET …/functions/v1/code-discord/etat` dit, sans rien montrer, si tout est en place, et `npm run verifier:ligne` le lit.
- Installée, essayée par le pilote (un compte déjà ouvert avec Discord, puis la création d'un compte au code) et ouverte à tous le 12 novembre 2026 (`CODE_LOGIN_OPEN`, `src/lib/compte/connexion-code.ts`). Une nouvelle version de la fonction se remet en ligne par la même commande ; le pilote l'essaie de nouveau avec `/code` et `/fiche`.

# [GAL] Les Gaulois — site du clan

Site statique Astro du clan OpenFront [GAL], publié sur GitHub Pages : <https://les-gaulois.github.io/> (dépôt `les-gaulois/les-gaulois.github.io`, branche `main`). La GitHub Action `.github/workflows/site.yml` collecte l'API OpenFront toutes les heures dans `data/`, puis reconstruit et publie le site. Seuls la connexion (avec Discord, ou par un code), l'espace Direction, le QG, la carte de l'alliance (fenêtre « Alliance » de la page Carte) et le village des Gaulois (`/village` : vestiaire, statères, boutique, marché, place animée) ont un serveur (Supabase), auquel chaque page publiée envoie aussi un compte de la visite, sans cookie ni adresse IP (onglet « Activité du site » de la Direction). La Conquête des Gaulois, ancien jeu de territoires, a été retirée le 6 novembre 2026 : ne pas la reproposer, ne pas réutiliser son code ni `config/conquete.json`.

Détails : `README.md`, `docs/API_AUDIT.md` (API), `docs/DESIGN.md` (design), `docs/DIRECTION.md` (connexion, rôles, Supabase), `NOTICE.md` (licences).

## Autonomie : tu décides et tu publies

La personne qui pilote le projet ne développe pas et t'a confié le site en autonomie complète.

- Tu décides seul des choix techniques et de design, dans le cadre des règles ci-dessous. Tu ne demandes pas d'accord pour modifier, committer, pousser sur `main` ni mettre en ligne. Un push sur `main` publie le site : c'est voulu.
- Avant tout push : la procédure de la skill `publier`, qui commence par `verifier`. Rien ne part tant qu'un contrôle échoue.
- Tu ne t'arrêtes pour demander que dans ces cas : une dépense, quelle qu'elle soit ; la suppression de données du vrai projet Supabase ou de l'historique dans `data/` ; une migration qui supprime ou vide une table ou une colonne ; une action hors de ce dépôt (comptes GitHub, Supabase, Discord, cron-job.org) ; une question que ces règles ne tranchent pas. Alors : prépare tout, explique en une phrase ce qui bloque, et attends.
- Les sections « Données », « Secrets » et « Licences » ne se négocient pas. Si une demande les contredit, explique pourquoi et propose autre chose.
- Chaque changement visible du site ajoute son entrée en tête de `content/nouveautes.json`, en français simple et sans rien inventer : les visiteurs y lisent ce qui a changé.
- En fin de tâche, rapporte en français simple, sans embellir : ce qui est fait, ce qui est en ligne, ce qui a échoué et pourquoi. Une étape à la fois, sans jargon inutile.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement, <http://localhost:4321> |
| `npm run build` | Images de marque, fichiers du film, puis `dist/` |
| `npm run preview -- --host 127.0.0.1 --port 4321` | Sert `dist/` (configuration `site-gal` de `.claude/launch.json`) |
| `npm run lint` · `npm run typecheck` · `npm test` | ESLint · `astro check` + `tsc` · Vitest |
| `npm run test:e2e` | Playwright sur `dist/` : après `npm run build` |
| `npm run data:fetch` · `npm run data:carte` | Collecte dans `data/` · seulement la carte des clans |
| `npm run verifier:ligne` | Contrôle le vrai projet Supabase sans rien écrire (variables à poser dans le shell) |
| `npm run village:economie` | Mesure l'économie du village sur `data/`, dans le terminal, sans rien écrire ni envoyer |

Node 22 ou plus. Sous Windows, le shell est Git Bash : chemins avec `/`.

## Carte du projet

- `config/clan.ts` : tag, nom, liens, logos, date de création du clan. Les champs à `null` ou `[]` masquent leur section.
- `src/pages/*.astro` : une page par fichier, mise en page `src/layouts/Base.astro` (en-tête, navigation, pied de page). Le plan du site, rubriques et onglets, est dans `src/lib/nav.ts`. Pages personnelles `compte`, `qg`, `direction` et fiches `membres/[id]` en `noindex` ; `admin` ne fait plus que mener à la Direction, où est l'administration.
- `src/components/` : `.astro` statiques, `.tsx` Preact hydratés (`client:idle`, `client:visible` ou `client:only="preact"`). `src/components/compte/` : écrans de la connexion.
- `src/lib/` : calculs purs et testés. `schemas.ts` (Zod), `data.ts` (lecture de `data/` et `content/`), `compte/` (client Supabase `api.ts`, `preflight.ts`, `roster.ts`), `clanmap/` (carte des clans, `etat.ts` son état pixel par pixel), `village/` (le village des Gaulois : `contrat.ts` fait foi entre les écrans et le serveur, `vie.ts` la règle des lieux, `lumiere.ts`, `economie.ts`, `consigne-repliques.ts` la consigne des bulles), Gaulois sur les images du robot (`gaulois-joueurs.ts` lecture au serveur et contrat, `gaulois-envois.ts` branchement dans les envois, `gaulois-sprite.ts` dessin), `compagnon/` (le Gaulois compagnon qui suit le visiteur), `alliance/` (carte de l'alliance : masques des zones, bilans, invitations), `fx/` (logique des effets).
- `src/scripts/` : scripts navigateur — `fx.ts` effets, `holo.ts` guerrier en relief de l'accueil (répliques dans `src/lib/fx/repliques.ts`), `film.ts` film de la carte, `carte-console.ts` fenêtres de la page Carte (`fenetre-libre.ts` : la fenêtre « Alliance » se déplace, change de taille, s'agrandit ou se réduit), `alliance-ecran.ts` carte de l'alliance (fenêtre « Alliance », écrans dans `src/components/carte/alliance/`, détail dans `docs/DIRECTION.md`), `nouveautes.ts` point des nouveautés du site, `visite.ts` compte des visites (logique dans `src/lib/activite-site.ts`), `compagnon.ts` le Gaulois compagnon de toutes les pages (`src/components/GauloisCompagnon.astro`, répliques dans `src/lib/compagnon/repliques.ts`).
- `src/styles/global.css` : jetons de couleur et classes `.stage`, `.card`, `.btn-*`, `.wrap`.
- `content/` : textes du clan, JSON et Markdown (skill `contenu-clan`). `content/nouveautes.json` : le journal des mises à jour du site, que tu tiens (skill `publier`). `data/` : écrit par la collecte, jamais à la main.
- `scripts/` : collecte et outils Node (`tsx`). `supabase/migrations/` : schéma, figé une fois appliqué. `supabase/functions/code-discord/` : la seule fonction serveur (Deno), la connexion par un code demandé dans le Discord du clan, les commandes du robot (/fiche, /clan, /records, /carte, /guide, /rival, /moi, /gaulois du village des Gaulois, `gaulois.ts`), le panneau des rôles (/roles et ses boutons), les tickets d'assistance (/tickets, `tickets.ts`) et les concours en tombola (/concours, `concours.ts`, réveillés chaque minute par pg_cron ; billets numérotés dessinés par `billets.ts` sur les fonds que publie le site sous `/tombola/`), avec le jeton du robot dans le secret `LE_GAULOIS_BOT_TOKEN` de Supabase, mise en ligne par le pilote. Elle crée elle-même ses commandes Discord après chaque mise en ligne (`definitions.ts`, `inscription.ts`) : une nouvelle commande ne demande ni « Reset Token » ni `npm run discord:commande`, que le pilote ne doit plus refaire (il en a assez).
- `tests/unit/` Vitest ; `tests/e2e/` Playwright, `site.spec.ts` liste les pages contrôlées.
- `public/brand/` logos source, `public/generated/` dérivés (ignoré par Git), `public/carte-monde/` page HTML autonome.
- `.claude/worktrees/` : d'autres sessions y travaillent. Ne jamais arrêter un processus par son nom ou sa ligne de commande : vérifier le port et le chemin, puis arrêter ce processus-là seulement.

## Règles

### Données : rien d'inventé

- Aucune stat, aucun joueur, aucun résultat, aucun texte ni conseil de jeu inventé. Un chiffre vient de l'API ou d'un calcul documenté dans `src/lib/` et testé.
- Date de mise à jour visible. « Pas de données » n'est pas zéro. Pas d'historique présenté comme du temps réel. Pas de mélange entre stats de clan et classé. Pas de classement recalculé.
- Si l'API échoue : garder les dernières données valides et le signaler (`data/meta.json`). Un refus de l'API (403) ne se contourne pas.
- Stats des membres : `stats.team` uniquement. Seule exception, voulue par le pilote le 13 novembre 2026 : le niveau et le prestige du compte OpenFront, à part des stats du clan et dits « tout le jeu » ; ni rating FFA, ni Elo, ni place au classé. Le `publicId` d'un anonyme n'est jamais publié.
- Dons : aucun nom de donateur sans une liste fournie par le clan ; ni nom ni montant de ce qui n'est visible qu'aux membres ; seules les capsules comptent, jamais de renvoi vers le Plutonium, monnaie payante.
- Les conditions d'OpenFront (sections 5 et 6.5) interdisent robots et scripts : aucune lecture automatique de ce qui demande un compte de joueur.

### Secrets

- Dépôt public : aucun secret, jamais. `.env` reste local, `.env.example` est tenu à jour, `supabase/.temp/` reste ignoré. Les identifiants Discord de l'encadrement n'entrent jamais dans le dépôt.
- Jamais `git add -A`, `git add --all` ni `git add .` : ajouter les fichiers par leur nom et relire `git diff --cached` avant de committer.

### Licences

- Le site est sous AGPL-3.0-only (`LICENSE`, `NOTICE.md`). Le code d'OpenFront (AGPL) et son dossier `resources/` (CC BY-SA 4.0) se réutilisent seulement avec : origine, modification et date en tête du fichier, mention « © OpenFront and Contributors » visible, ligne ajoutée au tableau de `NOTICE.md`. Jamais : son dossier `proprietary/`, les assets de son CDN, son logo, ni une mise en page qui ferait passer le site pour officiel. Détail : skill `donnees-openfront`.
- Aucune référence à Astérix, pas de copie du site du clan [FR], pas de marque Discord : texte seul sur le bouton.

### Design et accessibilité

- Jetons, scènes et boutons de `docs/DESIGN.md` (skill `design-gal`). Aucune maquette ni valeur fictive dans l'interface.
- WCAG AA, `prefers-reduced-motion` respecté, bouton pause de l'en-tête obligatoire, aucun défilement horizontal de 360 à 1 920 px, clic droit natif conservé sur les liens, champs, texte sélectionné et avec Maj. Une animation ne change jamais une valeur.
- `.btn` écrase la classe `hidden` de Tailwind : masquer via un conteneur.

### Serveur Supabase

- Le serveur décide de tout : droits et résultats vérifiés en SQL, jamais en masquant un bouton. Le navigateur n'appelle que des fonctions SQL via `src/lib/compte/api.ts`. Trois exceptions, dans ce même fichier : `uploadDiscordImage` dépose une image des messages Discord, sous la règle d'accès du stockage (admins et fondateur), `signInWithCode` envoie un code de connexion à la fonction serveur `code-discord`, et `noteSiteVisit` envoie le compte d'une visite à `note_site_visit` sans charger le code de Supabase.
- L'identité vient de `auth.identities`, ou, pour la connexion par code, d'une commande `/code` signée par Discord et vérifiée par `code-discord` ; jamais de `raw_user_meta_data` ni de l'adresse e-mail, qu'un joueur peut choisir. Un compte sans Discord ne peut rien demander. Un compte Discord n'a qu'un compte sur le site.
- Une migration appliquée ne se modifie jamais : on en ajoute une nouvelle. Détail et mise en ligne : skill `supabase`.

### Le village des Gaulois

- Design et graphisme par Claude Fable 5.2, code par Claude Opus 5.5 : c'est la demande du pilote pour tout agent lancé sur le village. Détail des lots, des règles et des choix : « Le village des Gaulois » de `docs/DIRECTION.md`.
- Les statères viennent des « points rapportés au clan », 30 par point, jamais « des victoires ». Ils ne s'achètent pas. Le solde est privé : aucun classement des plus riches.
- Rien n'est du temps réel : OpenFront ne dit pas qui joue en ce moment, et le robot Discord ne voit que l'état vocal, relevé toutes les 5 minutes. L'écran le dit.
- L'API Claude n'écrit que les bulles des Gaulois, à partir de faits sans identité (`src/lib/village/consigne-repliques.ts`), sous un plafond tenu par le serveur. Toute autre dépense ou tout autre usage de l'API se demande au pilote. La clé est le secret GitHub `ANTHROPIC_API_KEY`, jamais dans le dépôt.
- Aucun dessin ne rappelle une œuvre existante ; pas de case pour se retirer de la place (choix du pilote).

## Skills et sous-agent du projet

Dans `.claude/skills/` : `verifier` (tous les contrôles), `publier` (synchronisation, commit, push, suivi de l'Action, contrôle du site en ligne), `nouvelle-page`, `contenu-clan`, `design-gal`, `donnees-openfront`, `supabase`, `tests-e2e`. Le sous-agent `relecteur` (`.claude/agents/`) relit un changement avec un regard neuf avant publication.

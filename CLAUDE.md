# [GAL] Les Gaulois — site du clan

Site statique Astro du clan OpenFront [GAL], publié sur GitHub Pages : <https://les-gaulois.github.io/> (dépôt `les-gaulois/les-gaulois.github.io`, branche `main`). La GitHub Action `.github/workflows/site.yml` collecte l'API OpenFront toutes les heures dans `data/`, puis reconstruit et publie le site. Ont un serveur (Supabase) : la connexion (Discord ou code), l'espace Direction, le QG, la carte de l'alliance (fenêtre « Alliance » de /carte) et « Mon Gaulois » (`/village`, écran de jeu plein écran : le Gaulois en pixels de chaque membre, sa carte, son vestiaire, le pass, la forge, la boutique, les boosters, la vitrine, la loterie, le duel et le casino ; `/boutique` y renvoie). Chaque page publiée envoie aussi un compte de la visite, sans cookie ni adresse IP.

Retirés : la Conquête des Gaulois (6 novembre 2026) : ne pas la reproposer, ne pas réutiliser son code ni `config/conquete.json`. Le monde du village en pixels (15 novembre 2026 : place, chantier, grand feu à l'écran, intérieurs, almanach, bulles écrites par Claude ; le Gaulois et ses objets restent) : ne pas le refaire sans la demande du pilote. Le coffre du druide (19 novembre 2026) : ne pas le relancer ni réutiliser son code sans sa demande.

Détails : `README.md`, `docs/CARTE-DU-PROJET.md` (carte détaillée et règles détaillées du village), `docs/DIRECTION.md` (connexion, rôles, Supabase, village : sommaire de `docs/direction/`), `docs/DESIGN.md` (design : sommaire de `docs/design/`), `docs/API_AUDIT.md` (API), `NOTICE.md` (licences).

## Autonomie : tu décides et tu publies

La personne qui pilote le projet ne développe pas et t'a confié le site en autonomie complète.

- Tu décides seul des choix techniques et de design, dans le cadre des règles ci-dessous. Tu ne demandes pas d'accord pour modifier, committer, pousser sur `main` ni mettre en ligne. Un push sur `main` publie le site : c'est voulu.
- Avant tout push : la procédure de la skill `publier`, qui commence par `verifier`. Rien ne part tant qu'un contrôle échoue.
- Tu ne t'arrêtes pour demander que dans ces cas : la maquette d'une nouvelle fonction, à faire valider avant de la construire (« Travailler sans gaspiller ») ; une dépense, quelle qu'elle soit ; la suppression de données du vrai projet Supabase ou de l'historique dans `data/` ; une migration qui supprime ou vide une table ou une colonne ; une action hors de ce dépôt (comptes GitHub, Supabase, Discord, cron-job.org) ; une question que ces règles ne tranchent pas. Alors : prépare tout, explique en une phrase ce qui bloque, et attends.
- Les sections « Données », « Secrets » et « Licences » ne se négocient pas. Si une demande les contredit, explique pourquoi et propose autre chose.
- Chaque changement visible du site ajoute son entrée en tête de `content/nouveautes.json`, en français simple et sans rien inventer, avec son rang (`rank`) : `top` pour ce qu'un joueur doit retenir, rien pour une nouveauté ordinaire, `minor` pour une retouche ou une correction, `staff` pour ce qui ne concerne que l'équipe gauloise (skill `publier`, étape 1).
- En fin de tâche, rapporte en français simple, sans embellir : ce qui est fait, ce qui est en ligne, ce qui a échoué et pourquoi. Une étape à la fois, sans jargon inutile.

## Travailler sans gaspiller

Mesure du 26 novembre 2026 : environ 9 600 $ de tokens en trois semaines, dont 75 % dans des sessions à plus de 200 000 tokens de contexte et 33 % dans les sous-agents ; près de 50 heures d'attente des builds et e2e ; plus de 50 000 lignes construites puis retirées.

- **Maquette d'abord.** Une nouvelle fonction (jeu, écran, page, système) commence par une maquette (Artifact, page d'essai ou dessin) que le pilote valide. Ni migration, ni serveur, ni tests avant son accord. Le monde du village (33 000 lignes), la Conquête (16 000) et le coffre du druide (4 800) ont été retirés après avoir été construits en entier.
- **Une demande, une session.** Quand le pilote passe à un sujet sans lien, ou revient après une longue pause sur une longue session, propose une nouvelle session avec un court brief plutôt que de continuer : chaque action relit toute la conversation.
- **Vérifier avant de proposer.** Une idée ne se propose qu'après avoir cherché si elle existe déjà (`grep -rni` dans `scripts/`, `src/lib/`, `supabase/`, `docs/direction/`), jamais de mémoire : le 26 novembre 2026, six idées de messages Discord proposées existaient toutes. Lire peu, c'est lire juste, pas ne pas vérifier.
- **Lire peu.** `grep -n` puis lecture de la partie utile ; `docs/` se lit par parties (`docs/direction/`, `docs/design/`) ; ne pas relire un fichier déjà lu s'il n'a pas changé ; couper les longues sorties (`| head`, `| tail -40`).
- **Contrôles ciblés pendant le travail, série complète une fois avant de publier** (skill `verifier`).
- **Sous-agents seulement pour un vrai lot** : brief court, rapport court. Le relecteur tourne sur Sonnet ; Fable dessine, Opus code (règle du village).
- **Ce fichier reste court** (moins de 25 000 caractères, `tests/unit/claude-md.test.ts`) : une règle, un interdit, un renvoi. Le détail d'une fonction, son histoire et les citations du pilote vont dans `docs/` ou `docs/CARTE-DU-PROJET.md`.

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

Le détail, fichier par fichier, est dans `docs/CARTE-DU-PROJET.md` : le lire avant de toucher une partie.

- `config/clan.ts` : tag, nom, liens, logos, date de création. Les champs à `null` ou `[]` masquent leur section.
- `src/pages/*.astro` : une page par fichier, mise en page `src/layouts/Base.astro` ; plan du site dans `src/lib/nav.ts`. `compte`, `qg`, `direction` et `membres/[id]` en `noindex` ; `admin` mène à la Direction.
- `src/components/` : `.astro` statiques, `.tsx` Preact hydratés ; `compte/` la connexion, `village/` « Mon Gaulois » (boutique, boosters, vestiaire, forge, pass, vitrine, loterie, `duel/`, `duel-salles/`, `duel-tableau/`, `casino/`), `jeu/` le kit du jeu, `accueil/` le jeu sur l'accueil, `carte/alliance/`.
- `src/lib/` : calculs purs et testés. `schemas.ts` (Zod), `data.ts`, `compte/` (`api.ts`, seul client Supabase), `clanmap/`, `village/` (`contrat.ts` fait foi entre écrans et serveur ; un fichier par système : économie, boutique, bannières, défilé, forge et fusion, familiers, modèles, vitrine, loterie, pass, duel, casino), `jeu/` (dessins et sons en cases), `rejeu/` (films, bilan et utilité, journal « Entre Gaulois », lecteur du replay), `alliance/`, `compagnon/`, `fx/`.
- `src/scripts/` : scripts navigateur (effets, carte, accueil, compagnon, nouveautés, visites, paysages du jeu).
- `src/styles/feuilles/` : la feuille de style en morceaux, dans l'ordre de la cascade (`01-socle.css` jetons et classes de base ; pages de chaque morceau dans `src/lib/feuilles.ts`). Plus de `global.css`.
- `src/integrations/precharge-modules.ts` : `modulepreload` de chaque page (cache froid de GitHub Pages après publication) ; les blocs entrent en fondu sans attendre un script (`fx-entree`).
- `content/` : textes du clan (skill `contenu-clan`), `content/nouveautes.json` le journal des mises à jour. `data/` : écrit par la collecte, jamais à la main.
- `scripts/` : collecte et outils Node (`tsx`). `supabase/migrations/` : schéma, figé une fois appliqué. `supabase/functions/code-discord/` : la seule fonction serveur (Deno) : connexion par code, commandes du robot (/fiche, /clan, /records, /carte, /guide, /rival, /moi, /gaulois, /feu, /macarte, /roles, /tickets, /concours), moteur du duel (`duel/`), dessins des objets. Jeton du robot : secret `LE_GAULOIS_BOT_TOKEN` de Supabase. Elle crée elle-même ses commandes Discord après chaque mise en ligne (`definitions.ts`, `inscription.ts`) : ne jamais demander au pilote un « Reset Token » ni `npm run discord:commande`.
- Déjà publié sur Discord (`scripts/envoyer-*`, README « Commandes », `docs/direction/`) : gazette, alertes de place, records, paliers, bilan de la veille, bienvenue, plus actifs, nouveautés, course du soir, jouer ensemble, arrivées en image, victoires et score d'utilité, achats, marché, duels, gros gains du casino, appels du QG, demandes d'adhésion, concours, tickets, rôles.
- Duel : une carte par objet de la garde-robe. Après tout objet ajouté, relancer `npx tsx scripts/fabriquer-effets-duel.ts` (un nouveau légendaire, divin ou objet de saison demande d'abord son effet unique dans ce script), puis une migration qui reprend les blocs de `scripts/fabriquer-sql-duel.ts`. Le moteur SQL est comparé au TypeScript sur le banc PGlite (`tests/unit/banc-pglite.ts`).
- Le code d'OpenFront ne tourne que dans un conteneur sans réseau ni droits, dans un job sans secret : `rejouer` de `victoires.yml` (carte de fin des victoires, `scripts/rejouer-victoires.ts`) et `films` de `site.yml` (parties à revoir, `scripts/filmer-parties.ts`). Les films, le vrai lecteur du replay et les cartes en GIF (filmées après le build, `scripts/filmer-cartes.ts`) sont gardés dans le cache du workflow, jamais dans Git ; le lecteur se publie sur un site à part (`REPLAY_SITE`), jamais sur les-gaulois.github.io.
- `tests/unit/` Vitest ; `tests/e2e/` Playwright : `outils-site.ts` porte `PAGES`, la liste des pages contrôlées, `site.spec.ts` les contrôles communs, `site-*.spec.ts` un domaine chacun.
- `public/brand/` logos source, `public/generated/` dérivés (ignoré par Git), `public/carte-monde/` page autonome, `public/paysages/` paysages du jeu (pas sous `public/jeu/`, que le lecteur vide).
- `.claude/worktrees/` : d'autres sessions y travaillent. Ne jamais arrêter un processus par son nom ou sa ligne de commande : vérifier le port et le chemin, puis arrêter ce processus-là seulement.

## Règles

### Données : rien d'inventé

- Aucune stat, aucun joueur, aucun résultat, aucun texte ni conseil de jeu inventé. Un chiffre vient de l'API ou d'un calcul documenté dans `src/lib/` et testé.
- Date de mise à jour visible. « Pas de données » n'est pas zéro. Pas d'historique présenté comme du temps réel. Pas de mélange entre stats de clan et classé. Pas de classement recalculé.
- Si l'API échoue : garder les dernières données valides et le signaler (`data/meta.json`). Un refus de l'API (403) ne se contourne pas.
- Stats des membres : `stats.team` uniquement. Deux exceptions voulues par le pilote : le niveau et le prestige du compte OpenFront (13 novembre 2026), à part des stats du clan et dits « tout le jeu », sans rating FFA, Elo ni place au classé ; le bilan des Gaulois de « Revoir une partie » et son score d'utilité (17 novembre 2026), par partie et en moyenne par membre au pseudo public (page « Les plus utiles » et fiche du membre), faits des seuls nombres de la fiche de la partie et des dons relevés au rejeu (`src/lib/rejeu/bilan.ts`) : jamais mêlé aux stats du clan ni au classé, jamais appelé Elo, et l'écran dit ce qu'il ne mesure pas. Le `publicId` d'un anonyme n'est jamais publié.
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
- Deux thèmes, au choix du visiteur par le bouton de l'en-tête (`src/scripts/mode.ts`), sinon le réglage de l'appareil : le clair « Neige Marine » (page blanche, écriture marine, scènes colorées) et le sombre « Nuit Marine » (`data-mode="sombre"` sur `<html>`). Jamais `#fff` pour un texte, un filet ou une icône : `var(--ecriture)`. Toute couleur en dur doit se lire dans les deux thèmes. Ne retirer aucun des deux, ni reproposer Encre, Ardoise, Braise ou Crépuscule, sans sa demande.
- WCAG AA, `prefers-reduced-motion` respecté, bouton pause de l'en-tête obligatoire, aucun défilement horizontal de 360 à 1 920 px, clic droit natif conservé sur les liens, champs, texte sélectionné et avec Maj. Une animation ne change jamais une valeur.
- `.btn` écrase la classe `hidden` de Tailwind : masquer via un conteneur.

### Serveur Supabase

- Le serveur décide de tout : droits et résultats vérifiés en SQL, jamais en masquant un bouton. Le navigateur n'appelle que des fonctions SQL via `src/lib/compte/api.ts`. Trois exceptions, dans ce même fichier : `uploadDiscordImage` (image des messages Discord, sous la règle d'accès du stockage : admins et fondateur), `signInWithCode` (code de connexion vers `code-discord`) et `noteSiteVisit` (compte d'une visite vers `note_site_visit`, sans charger le code de Supabase).
- L'identité vient de `auth.identities`, ou, pour la connexion par code, d'une commande `/code` signée par Discord et vérifiée par `code-discord` ; jamais de `raw_user_meta_data` ni de l'adresse e-mail, qu'un joueur peut choisir. Un compte sans Discord ne peut rien demander. Un compte Discord n'a qu'un compte sur le site.
- Une migration appliquée ne se modifie jamais : on en ajoute une nouvelle. Détail et mise en ligne : skill `supabase`.

### Le village des Gaulois

Le détail de chaque règle et son histoire : `docs/CARTE-DU-PROJET.md`, « Le village des Gaulois », et la partie du même nom de `docs/DIRECTION.md`.

- Design et graphisme par Claude Fable 5.2, code par Claude Opus 5.5 : demande du pilote pour tout agent lancé sur le village.
- **Statères** : 60 par point rapporté au clan (30 jusqu'au 27 novembre 2026, sans effet rétroactif), jamais « des victoires » ; ils ne s'achètent pas. Le solde ne se montre qu'à son titulaire, aucun classement des plus riches ; les totaux de l'onglet Village de la Direction s'affichent sans seuil. Seules créations de statères : les points, la loterie, le don du titulaire, et une fois chacun le trop-payé rendu du 21 novembre 2026 et novembre doublé du 27 novembre 2026 (nature `points_doubles`). Ne pas en ajouter d'autre.
- **Pas de temps réel** venu d'OpenFront (le robot ne voit que l'état vocal, toutes les 5 minutes) : l'écran le dit. Seule exception : les salles du duel, temps réel entre deux membres, le serveur interrogé chaque seconde, sans abonnement temps réel.
- **L'API Claude** n'écrit plus rien pour le site : toute dépense ou tout usage se demande au pilote, et une clé n'entre jamais dans le dépôt. Le coffre du druide est fermé (migration `20261121000400`, cagnotte vide) : ne pas le relancer ni réutiliser son code ; le pilote veut plus tard un autre jeu sur le site, sans Claude et gratuit.
- Aucun dessin ne rappelle une œuvre existante ; pas de case pour cacher son Gaulois aux autres membres.
- **Familiers** (100) : seulement dans leur pochette, 1 000 statères (le serveur refuse moins de 500), jamais deux fois le même, jamais à la boutique ni au marché. **Trésors des bannières** (20) : seulement dans la pochette des bannières, 1 000 statères, jamais deux fois ; 40 pochettes sur 100 rendent 20 à 60 % du prix.
- **Divin** : quatre tenues de cinq pièces, seulement dans la pochette surprise, dix fois moins souvent qu'un légendaire ; jamais à la boutique ni au marché ; la fusion de la forge (trois objets d'une rareté pour un de la suivante) s'arrête au légendaire.
- **Gaulois uniques** (11 corps) : boutique de 6 000 à 15 000 statères (`internal.modeles_prix`) ou pochette à 1 600, qui rend 85 fois sur 100 de 20 à 60 % du prix, sinon un unique jamais reçu ; jamais au marché. Ne pas reproposer le champignon, l'esprit du chêne, la grenouille ni le golem.
- **Prix** (21 novembre 2026) : bannières, finitions et cadres de carte au double du prix d'un objet de leur rareté. Une pochette reste un pari juste au prix de la boutique : son prix ne baisse qu'avec ceux de ce qu'elle donne. Le trop-payé rendu ne se refait pas pour une autre baisse sans sa demande.
- **Le pass** (« Le sentier » dans le code) : saisons de six semaines (la 1 du 17 novembre au 28 décembre 2026), 30 paliers, missions du jour, calendrier, défi du clan, étal du jour. Les paliers donnent des objets de la boutique, jamais de statères, divin, familier, bannière ni Gaulois unique ; le 30e l'objet de saison (rareté `saison` : ni boutique, étal, marché, revente, pochette ni forge ; saison 1 : la « Couronne du solstice ») et l'insigne de saison. Une saison suivante s'ajoute par migration avant la fin de la précédente. Ne pas reproposer l'objet qui grandit, l'œuf à couver ni le marchand ambulant.
- **La loterie** : chaque mardi à 21 h 30 (Paris), sur les sept jours d'avant, l'or puis l'argent puis le bronze, un gagnant ne regagne pas ; lots 3 000, 1 500 et 750 statères et des pochettes offertes, ouvertes avec leurs règles. Plus aucun billet ne s'achète : un booster de loterie par jour joué avec le clan (sept par semaine au plus), autant de billets que de points ce jour-là, une fois sur 10 un ticket d'or de 5 billets de plus, tiré par le serveur à l'ouverture. Ne pas rouvrir l'achat de billets ni revenir au lundi. La scène montre la part de tous : ne pas la cacher ni la remettre sur un fond.
- **Paliers de victoires** : 10, 25, 50, 100, 200, 350, 500, 700, 900, 1 000, 1 500, 2 000, 2 500 et 3 000 victoires sous le tag (`WIN_TIERS`, `internal.paliers_de_victoires`), sans jamais annoncer un palier peut-être dépassé avant le changement (`passerAuxNouveauxPaliers`). Chaque palier franchi par un compte validé offre une fois un booster surprise, non revendable, sans statère créé ; la première lecture d'un compte n'est que son point de départ.
- **Rayons « Cartes »** (33 finitions de la carte du membre) **et « Cadres »** (26 cadres animés) : prix d'une bannière de leur rareté, jamais au marché, en pochette ni à la revente, pas d'achat pendant un essai en mode GOD. Cadres communs et peu communs en sept cases, les autres en dix avec blason, coins sculptés et lumière sur l'image : ne pas les simplifier ; pas de cadre sur le podium de l'accueil.
- **Don de statères** : un seul compte, celui de `internal.stateres_don_titulaire` (posé par le pilote, jamais dans le dépôt), 1 à 100 000 par don, noté au journal de l'équipe. Ne l'ouvrir à aucun autre compte ni à un rôle, ne jamais y montrer un solde.
- **Pochette de statères** : 200 statères, six lots de 60 à 13 100 qui rendent en moyenne exactement le prix, dix par jour. Ne changer un lot qu'en gardant la moyenne égale au prix.
- **Le marché** : boutique tournante (un tiers des objets par semaine, du mardi 21 h 30 au suivant), demandes d'achat (statères mis de côté, rendus à la fermeture), annonces Discord, tableau du marché sans nom de membre. Le prix le plus haut au marché reste celui de la boutique : ne pas le relever. Ne pas ouvrir le marché aux familiers, Gaulois uniques, trésors, divin, cartes ni cadres.
- **Revente au jeu** : 70 % du prix (ou de ce qui a été payé, si c'est moins) pour un achat à la boutique, 50 % pour un objet d'une pochette surprise payée ; rien pour un objet reçu sans payer, acheté au marché ou divin ; un paiement n'ouvre qu'un droit. Ne pas monter la part des pochettes.
- **Le duel « Coup pour coup »** : ouvert à tous (`internal.duel_ouvert`, à ne refermer ou rouvrir que sur sa demande). Il ne crée ni ne prend de statère : 3 duels comptés par jour, 4 avec la flamme, des pas du pass pour un duel gagné. Salles en direct de 25 à 1 000 statères : le serveur prend les deux mises au début, le gagnant reçoit les deux moins 10 % pour la cagnotte de la saison, égalité mises rendues ; 30 secondes par manche, qui ne pose pas à temps ou quitte perd ; main fixée en entrant ; 3 matchs misés par jour contre un même adversaire, 10 en tout, pas de choix de l'adversaire, pas de mise en mode GOD. La cagnotte ne redistribue que ce que les mises y ont mis (50, 30 et 20 %, le mardi qui suit la fin de saison). Ne pas changer la règle du tableau des duellistes sans refaire l'essai contre le hasard et réécrire son chiffre dans l'écran.
- **Le casino** : ouvert à tous les membres validés (`internal.casino_ouvert`, à ne refermer que sur sa demande). Statères seulement : jamais d'achat, de dépôt, de retrait, de bonus ni d'euros, aucun faux gagnant, aucune cagnotte, aucun classement des gains ; seul un coup qui gagne 1 000 statères ou plus part sur Discord, avec sa vraie chance (`internal.casino_annonce_seuil`). Jetons de 10 à 200, 200 au plus de mise de départ par tour, 50 000 statères misés au plus par jour de Paris et par compte, compléments du vingt-et-un compris, plafond atteint visible en grand. Mode GOD : on joue sans mise. Le serveur tire avant l'animation ; chaque jeu rend en moyenne exactement la mise, sauf le vingt-et-un (99,43 % joué au mieux, jamais plus) : ne changer aucune chance sans que son test de rendement exact reste vrai. Jamais de « presque gagné » à la machine ni de numéros « chauds ». Ne pas reproposer la pochette à 95 %, le chaudron commun ni le double ou rien.

### Choix du pilote à ne pas refaire sans sa demande

- L'ouverture des boosters (le serveur tire, le joueur ouvre le paquet et retourne une seule carte qui reste) : mouvement, lumières et sons.
- Les cartes des cosmétiques : pixel art holographique du mystique au divin, entre-deux à l'épique, cartes lisses sans reflet pour le reste ; pleine image aux bandeaux fins pour le légendaire, le saison et le divin, objet qui déborde par le haut pour le mystique.
- Le dessin du pass (la bannière du membre pour seul décor, route de pavés, un booster par palier, piste repliée sur dix paliers).
- La loterie, « le podium d'abord » : les trois cases des lots où le gagnant paraît devant sa bannière, la ligne des parts en ruban, sans or pour les billets achetés, et les règles dans un pli, pas en étiquettes en haut de l'écran.
- Les huit paysages animés derrière l'écran du jeu, qui tournent toutes les 15 minutes : pas de retour à la bannière et aux collines.
- Les cartes du podium de l'accueil : pas de retour au guerrier seul.
- /gaulois en GIF paysage avec le niveau et la flamme, filmé par le site : pas de retour à l'image fixe seule ni au format en hauteur.
- Le journal « Entre Gaulois » nomme les vrais pseudos (tag du clan seulement s'il est au classement officiel), jamais « Gaulois 1 » ni « un adversaire » ; pas les embargos.
- Le calcul de l'utilité ne change pas sans refaire l'essai contre le hasard (`scripts/essai-utilite.ts`) ; le score envoyé après chaque victoire reprend le calcul du bilan, jamais refait à part.
- À l'écran, « Les pochettes » s'appellent « Les boosters » et « Le sentier » « Le pass » ; les noms internes, fonctions SQL et adresses restent. Le marché en images ne montre jamais le nom d'un membre.

## Skills et sous-agent du projet

Dans `.claude/skills/` : `verifier` (contrôles ciblés, puis la série complète), `publier` (synchronisation, commit, push, suivi de l'Action, contrôle du site en ligne), `nouvelle-page`, `contenu-clan`, `design-gal`, `donnees-openfront`, `supabase`, `tests-e2e`. Le sous-agent `relecteur` (`.claude/agents/`, sur Sonnet) relit un changement avant publication.

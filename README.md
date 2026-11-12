# Site du clan [GAL] Les Gaulois

Site communautaire du clan [GAL] sur [OpenFront](https://openfront.io/). Site non officiel, sans lien avec les éditeurs d'OpenFront.

Le site est statique (Astro). Une GitHub Action récupère les données de l'API toutes les heures et reconstruit le site. Les visiteurs n'appellent jamais l'API.

- Audit de l'API : [docs/API_AUDIT.md](docs/API_AUDIT.md)
- Choix de design : [docs/DESIGN.md](docs/DESIGN.md)
- Connexion Discord, rôles et espace Direction, seule partie avec un serveur : [docs/DIRECTION.md](docs/DIRECTION.md)

## Le plan du site

Le plan est dans `src/lib/nav.ts`. Une rubrique répond à une question de visiteur, et un contenu n'a qu'une page. L'accueil résume et renvoie : il ne remplace aucune page.

| Rubrique | Pages | Ce qu'on y cherche |
|---|---|---|
| Accueil | `/` | Ce qui a changé depuis la dernière visite, les annonces et événements, le clan au classement officiel, les Gaulois de la semaine (podium, plus actifs, fil du clan, Gaulois mis à l'honneur), sa place dans le clan et la porte du QG (avant le classement pour qui a dit « C'est moi ») |
| Actu | `/gazette`, `/parties`, `/nouveautes` | Le bilan de la semaine, les parties une par une, les mises à jour du site expliquées |
| Résultats | `/classement`, `/rivaux`, `/progression`, `/records` | La liste officielle, la course et le comparateur, les courbes, les podiums des joueurs et les records |
| Membres | `/membres`, `/membres/:id`, `/qg` | Les paliers, l'encadrement, le classé, la liste, les fiches ; le QG, face privée réservée aux membres validés, en onglets ; l'administration de l'encadrement est dans `/direction` |
| Carte | `/carte` | Le film, puis revoir l'histoire, où en est GAL et le détail |
| Guides | `/debuter`, `/activite`, `/outils` | Les guides, quand jouer et le jeu en groupe, le calculateur et les outils |
| Rejoindre | `/rejoindre` | Les étapes pour entrer dans le clan |

Hors des rubriques, dans le pied de page de chaque page : `/mentions-legales` (l'éditeur et les hébergeurs, exigés par la loi ; version anonyme choisie par le pilote) et `/confidentialite` quand la connexion est ouverte.

## Installation

Il faut Node.js 22 ou plus.

```bash
npm install
```

```bash
npm run dev
```

Le site s'ouvre sur http://localhost:4321. Aucun secret n'est nécessaire.

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run data:fetch` | Collecte les données dans `data/` |
| `npm run data:carte` | Met à jour seulement la carte des clans, sans attendre le délai d'une journée |
| `npm run membres:relire` | Relit la liste des membres pour la connexion. Sans ses réglages, elle ne fait rien. |
| `npm run encadrement:prevenir` | Signale à un salon privé de l'encadrement les demandes d'adhésion qui attendent, sans aucun nom. Sans son lien, elle ne fait rien : voir [docs/DIRECTION.md](docs/DIRECTION.md). |
| `npm run sauvegarde` | Sauvegarde chiffrée des données de la connexion, faite par l'Action « Sauvegarde chiffrée ». Sans sa phrase de passe, elle ne fait rien. |
| `npm run sauvegarde:relancer` | Lance l'Action « Sauvegarde chiffrée » si la semaine n'a pas encore sa sauvegarde : le robot horaire s'en charge. |
| `npm run sauvegarde:compte-rendu` | Dit au salon privé de l'encadrement si la sauvegarde est faite ou ratée : dernière étape de l'Action « Sauvegarde chiffrée ». |
| `npm run sauvegarde:verifier fichier.bin` | Vérifie qu'une sauvegarde téléchargée s'ouvre avec la phrase de passe, sans rien écrire : seuls les nombres de lignes s'affichent. |
| `npm run sauvegarde:ouvrir fichier.bin` | Ouvre une sauvegarde téléchargée et écrit son contenu en clair dans `.cache/sauvegarde/`. Pour les deux commandes, la phrase se tape dans le terminal, sans s'afficher, jamais dans une conversation. Voir [docs/DIRECTION.md](docs/DIRECTION.md). |
| `npm run discord:verifier` | Demande à Discord si le lien du salon marche, sans rien envoyer, une fois par nouveau lien. Sans son lien, elle ne fait rien. |
| `npm run discord:commande` | Crée la commande `/code` de la connexion par code sur le serveur Discord du clan, une fois, depuis le poste du pilote. Le jeton du robot se colle quand elle le demande, sans s'afficher. Voir « Se connecter avec un code » dans [docs/DIRECTION.md](docs/DIRECTION.md). |
| `npm run gazette:envoyer` | Envoie la dernière gazette sur Discord. Sans son lien, elle ne fait rien : voir « La gazette sur Discord ». |
| `npm run alertes:envoyer` | Envoie une alerte si GAL a changé de place, sur le salon de la gazette. Sans son lien, elle ne fait rien : voir « Les alertes de place ». |
| `npm run records:envoyer` | Envoie un message si le clan a battu un de ses records, sur le salon de la gazette. Sans son lien, ne fait rien : voir « Les alertes de record ». |
| `npm run paliers:envoyer` | Envoie les paliers franchis par les membres, sur le salon de la gazette. Sans son lien, elle ne fait rien : voir « Les paliers franchis sur Discord ». |
| `npm run hier:envoyer` · `bienvenue:envoyer` · `actifs:envoyer` · `nouveautes:envoyer` | Envoient les messages du jour sur le salon de la gazette : le bilan de la veille, la bienvenue aux nouveaux, les plus actifs et les nouveautés du site. Sans leur lien, elles ne font rien : voir « Les messages du jour sur Discord ». |
| `npm run course:envoyer` | Envoie la course du soir sur le salon de la gazette, à partir de 21 h : place, score, écarts et points gagnés. Sans son lien, elle ne fait rien : voir « La course du soir ». |
| `npm run verifier:ligne` | Contrôle le vrai projet Supabase, sans rien y écrire : voir [docs/DIRECTION.md](docs/DIRECTION.md) |
| `npm run build` | Génère le favicon, l'image de partage, les fichiers du film, l'image d'aperçu de chaque fiche de membre et celle de l'accueil, puis construit `dist/` |
| `npm run preview` | Sert le dossier `dist/` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `astro check` et `tsc` |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:e2e` | Parcours, accessibilité et largeurs d'écran (Playwright). À lancer après `npm run build`. |

Pour les tests Playwright, installez une première fois le navigateur :

```bash
npx playwright install chromium
```

## Configuration

### Le clan : `config/clan.ts`

Le tag, le nom, les liens et les noms des logos s'y trouvent. Les valeurs à remplir sont à `null` ou `[]`, et leur section reste masquée tant qu'elles sont vides :

| Champ | Affiché sur |
|---|---|
| `description` | Accueil |
| `history`, `values`, `entryConditions` | Rejoindre |

`join.inviteOnly` indique si le clan est sur invitation. Cette valeur a été relevée à la main le 5 novembre 2026 et ne se met pas à jour seule : à modifier si le clan change de statut dans le jeu.

`archiveStart` fixe le début de la progression, le 10 avril 2026, date de création du clan dans le jeu. Il est lu lors de la première collecte, celle qui reprend tout l'historique. Pour le reculer, supprimez aussi `data/meta.json` et `data/sessions/`, puis relancez la collecte.

### Les logos : `public/brand/`

Déposez les fichiers sous ces noms, en `.svg`, `.webp`, `.png`, `.jpg` ou `.jpeg` :

| Fichier | Utilisation |
|---|---|
| `banner` | Bas de l'accueil et image de partage |
| `logo-vertical` | Grand visuel de la page Rejoindre ; celui de l'accueil si `tete` manque |
| `badge` | En-tête et favicon (recadré en cercle) |
| `logo-horizontal` | Non utilisé pour l'instant |
| `tete` | La tête du guerrier dans son cercle, sans texte : le logo en mode Matrix de l'accueil, de la Direction et du QG, redessiné en caractères au moment du build |

Pour changer de version, remplacez le fichier sous le même nom : le prochain build en tire des images légères (`npm run brand`). Sans ces fichiers, le site affiche un lettrage provisoire ; sans `tete`, la Direction et le QG n'ont pas de logo Matrix, et l'accueil reprend le logo vertical. Les six originaux sont conservés dans `brand-sources/`, qui n'est pas publié.

### L'environnement : `.env.example`

`SITE_URL` et `BASE_PATH` ne servent qu'à construire les liens. Sur GitHub Pages, l'Action les renseigne seule.

Les autres valeurs ne concernent que la connexion Discord : voir [docs/DIRECTION.md](docs/DIRECTION.md). Sans elles, la connexion n'apparaît pas et le site reste entièrement statique.

## Mettre à jour les contenus

Tout se modifie depuis GitHub, sans outil particulier. L'enregistrement relance la construction du site.

| Contenu | Fichier | Format |
|---|---|---|
| Annonces | `content/announcements.json` | `[{ "date": "2026-11-05", "title": "…", "body": "…", "url": "https://… (facultatif)" }]` |
| Événements | `content/events.json` | `[{ "start": "2026-11-20T20:00:00.000Z", "title": "…", "description": "… (facultatif)", "url": "https://… (facultatif)" }]` |
| Outils communautaires | `content/links.json` | `{ "tools": [{ "name": "…", "url": "https://…", "description": "…" }] }` |
| Guides par mode | `content/guide/*.md` | Markdown |
| Guide du clan, chapitre par chapitre | `content/guide-clan/*.md` | Markdown |
| Nouveautés du site | `content/nouveautes.json` | `[{ "date": "2026-11-08", "kind": "nouveau", "title": "…", "body": "…", "link": { "href": "/page", "label": "…" } (facultatif) }]` — `kind` : `nouveau`, `ameliore`, `corrige` ou `retire` ; la plus récente en tête |

**Les nouveautés du site expliquent chaque mise à jour.** Chaque changement qu'un visiteur ou l'encadrement peut remarquer ajoute son entrée en tête de `content/nouveautes.json`, le jour de sa mise en ligne : un titre, puis une ou deux phrases simples, 200 caractères au plus, sur ce qui change pour le visiteur. Les données collectées chaque heure n'y vont pas. Le bouton « Nouveautés » de l'en-tête, sur grand écran, montre les trois dernières ; sur téléphone, elles sont dans le menu ; la page `/nouveautes` les donne toutes, par jour. Un point rouge signale au visiteur une entrée parue depuis son dernier passage : son navigateur garde seulement la marque de la dernière vue (`gal-nouveautes`). À la première visite, cette marque est retenue sans allumer de point : rien n'est nouveau pour ce visiteur.

**Les donateurs se recopient à la main.** Le jeu les réserve aux membres du clan : fiche de [GAL], onglet « Dons », puis « Top donateurs ». Aucune route publique ne les donne, et le site n'utilise aucun compte. Publier ces noms rend publique une information que le jeu garde entre membres : c'est au clan d'en décider. Tant que le fichier est vide, la page n'affiche aucun nom et renvoie vers le jeu.

Pour publier un guide, écrivez le texte dans le fichier, puis retirez la ligne `draft: true` en tête. Un événement passé disparaît au build suivant. Un fichier JSON au mauvais format est ignoré : la section s'affiche alors comme vide, et le build le signale dans ses journaux.

**D'où viennent les guides de `/debuter`.** Le guide du clan reprend les deux PDF Guide Gaulois d'octobre 2026. Les fiches par mode viennent du [wiki OpenFront](https://openfront.wiki/Main_Page), sous licence CC BY-SA 4.0 : garder sa mention sous la section, et réécrire plutôt que copier (voir `NOTICE.md`). Ce wiki a des pages périmées : quand deux sources divergent, c'est le code public du jeu qui tranche. Le graphique du chapitre 2 est calculé par `src/lib/growth.ts`, il ne se modifie pas à la main.

## Les données

Tout est écrit dans `data/` :

| Fichier | Contenu | Fréquence |
|---|---|---|
| `leaderboard.json` | Classement officiel | Chaque heure |
| `sessions/AAAA-MM.json` | Sessions du clan, sans doublon | Chaque heure |
| `members.json` | Membres et leurs stats d'équipe | Une fois par jour |
| `.cache/member-games/players.json`, hors de `data/` | Pour chaque membre avec pseudo, ses 10 dernières parties sous le tag : le jour, la carte, le format et le résultat. Aucun anonyme. Hors de Git, dans le cache de l'Action | Quand ses parties selon `stats.team` ont bougé, environ 150 appels par passage |
| `.cache/member-games/results.json`, hors de `data/` | Pour chaque membre avec pseudo, ses parties publiques en équipe sous le tag, hors classé : l'identifiant de la partie, son heure de début et le résultat, lus dans sa liste officielle. Aucun anonyme, aucun pseudo, rien de ce qui est joué hors du tag. Hors de Git, dans le cache de l'Action | Quand ses parties selon `stats.team` ont bougé ; son historique une fois, page après page, au plus 150 pages par passage |
| `member-weeks.json` | Pour chaque membre avec pseudo, ses victoires et ses parties selon `stats.team` au dernier relevé d'un lundi et, pour chaque semaine, les joueurs aux victoires, les plus actifs et les paliers franchis. Aucun anonyme | Chaque lundi, au premier passage |
| `history/AAAA-MM-JJ.json` | Instantané quotidien : rang, score, totaux | Chaque heure, dernière valeur du jour conservée |
| `rivals/AAAA-MM-JJ.json` | Tags et scores de tout le classement du jour, dans l'ordre officiel | Chaque heure, dernière valeur du jour conservée |
| `ranked.json` | Par mode classé : places lues, membres avec pseudo sur ces places, et combien dans les 10 premières. Aucun nom ni chiffre individuel | Chaque heure |
| `games/AAAA-MM.json` | Pour chaque partie du clan : carte, durée, équipe gagnante, et tag, nombre de joueurs et équipe des clans d'au moins 2 joueurs. Aucun joueur | Chaque heure, 400 parties au plus par passage, jamais relues |
| `clanmap/film.bin`, `clanmap/film.json` | Film de la carte des clans : changements de cases, chiffres et date de chaque image, journées de GAL | Une fois par jour |
| `clanmap/terrain.webp` | Fond de carte, tiré de Giant World Map d'OpenFront (CC BY-SA 4.0) | Une seule fois |
| `clanmap/journal.json` | Un relevé par jour : pixels, rang, capsules et troupes de GAL | Une fois par jour |
| `meta.json` | Date du dernier succès et dernière erreur de chaque jeu de données | Chaque heure |

Si l'API échoue ou si une réponse ne passe pas la validation Zod, les derniers fichiers valides sont conservés, l'erreur est notée dans `meta.json` et le site l'affiche. Si la collecte s'arrête entièrement, le navigateur du visiteur signale les données périmées : au bout de 4 h pour le classement et les sessions, 36 h pour les membres et la carte.

### La carte des clans

La carte vient de `/public/clanmap/history`, la route documentée par OpenFront pour construire ce genre de film. L'historique brut ne va pas dans Git : il pèse déjà environ 40 Mo. Il reste dans `.cache/clanmap/`, conservé entre deux exécutions par le cache de l'Action. S'il est perdu, la collecte suivante le retélécharge entièrement, soit plus de 350 appels à ce jour, et sur GitHub elle le fait sans attendre le délai d'une journée. Chaque page lue est gardée, donc une panne en cours de route ne fait pas tout recommencer.

À chaque mise à jour, tout l'historique est rejoué. Chaque événement annonce l'ancien propriétaire du pixel, et le rejeu doit retomber dessus. Au moindre écart, le film n'est pas remplacé et l'erreur s'affiche sur la page. Si OpenFront remet un jour sa carte à zéro, il faudra supprimer le cache `clanmap-…` dans l'onglet **Actions → Caches** pour repartir de son nouvel historique.

Le terrain est la carte publique Giant World Map, dans le dépôt du jeu, sous licence CC BY-SA 4.0 avec l'attribution « OpenFront » : `resources/maps/giantworldmap/map.bin`, fixé à un commit dans `src/lib/clanmap/terrain.ts`. La collecte le garde dans le même cache et s'en sert pour compter la terre neutre au contact de GAL. S'il ne répond pas, ou si sa surface de terre n'est plus celle de `OFFICIAL_MAP`, le film reste valable et ce chiffre disparaît de la page. Le fond de carte `terrain.webp` en est une version réduite et assombrie : la page cite sa source et sa licence, et ces mentions doivent rester. Si OpenFront change son terrain, il faudra refaire le fond et le commit à la main.

La page `/carte-monde/` est à part : une page HTML autonome dans `public/carte-monde/`, sans la mise en page du site, qui dessine la carte « World » du jeu dans un canvas à partir de `manifest.json` et `map4x.bin`, copiés du dossier `resources/maps/world` du dépôt d'OpenFront (CC BY-SA 4.0, attribution « OpenFront », commit noté dans la page). Son code des couleurs du terrain et du dessin des territoires est repris du client d'OpenFront (AGPL-3.0), signalé et daté en tête de la page et dans `NOTICE.md`. Sa fonction `paintTerritory` colorie un territoire de clan par remplissage sur la terre seulement, comme le jeu dessine un territoire : intérieur translucide, bord plus foncé. Le territoire affiché est la part des terres que GAL tient sur la carte officielle, reportée sur la surface de cette carte (`worldTerritory`, lu par la page dans `/carte-monde/territoire.json`). Sa forme est une illustration, écrite comme telle : la carte « World » n'est pas celle sur laquelle les clans peignent, et le vrai tracé de GAL est sur la page Carte.

Le film compte 480 images au plus, 5 000 événements par image pour l'instant, plus une coupure à chaque minuit de Paris pour qu'il puisse s'arrêter sur la fin exacte d'une journée. Cette taille ne double que si le film devient trop long. Les images déjà écrites ne changent donc pas d'un jour à l'autre, et `film.bin` reste non compressé pour que Git ne stocke presque que les nouvelles. Le fichier est déclaré binaire dans `.gitattributes`, sans quoi Git pourrait le corrompre sous Windows.

Tous les calculs sont dans `src/lib/` et testés :

- **Rang :** position dans la liste de l'API, sans recalcul.
- **Score :** champ `weightedWins` de l'API.
- **Points gagnés de la course du soir :** somme des `score` positifs des sessions du clan, de 20 h la veille à 20 h, à plusieurs ou seul sous le tag d'après `clanPlayerCount`. Ce n'est pas la hausse du score, qui perd aussi chaque jour une part de sa valeur : le message donne les deux. Voir « La course du soir ».
- **Taux de victoire :** `victoires ÷ parties`. Sans partie, il n'y a pas de taux.
- **Écart avec un voisin :** différence de `weightedWins`.
- **Stats d'un membre :** champ `stats.team` de l'API.
- **Fiche d'un membre :** une page `/membres/:id` par membre avec pseudo, en `noindex`, avec ses stats `stats.team`, sa date d'arrivée et ses dernières parties. Celles-ci viennent de `/public/player/:id/games` et sont le détail de `stats.team` : publiques, en équipe, hors classé, avec le tag, gagnées ou perdues. Aucune statistique n'en est tirée, et rien de ce que le joueur fait hors du tag n'est gardé.
- **Meilleurs créneaux :** les plus de parties sur 90 jours, puis les plus de joueurs du clan par partie. Un créneau sous 5 parties est écarté.
- **Jeu en groupe :** `victoires ÷ parties` selon `clanPlayerCount`, sur toutes les sessions archivées. Une taille sous 30 parties est écartée. Le bloc disparaît si la plus grande taille retenue ne gagne pas plus que la plus petite.
- **Course avec les voisins :** score de GAL moins celui du clan voisin, sur chaque relevé de `data/rivals/`. Voisins : le clan au-dessus et les deux en dessous dans le dernier classement. Un clan absent d'un relevé laisse un trou, pas un zéro.
- **Joueurs au classé :** `/public/leaderboard/ranked`, pages 1 et 2, croisé avec les membres avec pseudo par `publicId`. Le site n'écrit que des décomptes par mode : les stats publiées d'un membre restent `stats.team`, or le classé peut venir de parties jouées hors du tag. Ces décomptes restent à part des stats de clan.
- **Records du clan :** plus longue série de victoires (par heure de début), journée de Paris avec le plus de victoires, plus de joueurs du clan et plus d'équipes dans une partie gagnée. Une partie où `totalPlayerCount` vaut moins de 2 est écartée : seul contre des robots, elle fausserait les records. Il n'y a pas de record de score pour cette raison : ces parties y arrivaient en tête.
- **Équipe d'un clan dans une partie :** l'API ne donne pas encore l'équipe des perdants, et sa liste de vainqueurs oublie ceux partis avant la fin. `placeClans` applique donc la règle du jeu : tout le clan dans une seule équipe, le plus gros clan d'abord, dans l'équipe la moins remplie. Si une fiche de joueur donne son équipe (`team`), elle remplace ce calcul. Si le résultat contredit un vainqueur officiel ou la session, la partie est écartée des face-à-face.
- **Face-à-face :** parties où GAL et un clan de la liste officielle avaient chacun au moins 2 joueurs avec des stats, dans des équipes différentes, sur 90 jours : gagnées par l'équipe de GAL, par celle de l'autre clan, ou par une troisième. Un clan rencontré moins de 30 fois est écarté, et la liste s'arrête à 12 clans. Au-delà de 5 % de parties écartées parmi les 200 dernières du clan à 2 joueurs ou plus, les chiffres sont suspendus : la règle du jeu a peut-être changé. Depuis le 10 novembre 2026, à la demande du pilote, ils ne s'affichent plus que dans le comparateur de la page Nos rivaux, et dans le journal des parties. Les résultats par format et par carte de jeu ont été retirés de la page Records le même jour.
- **Bilan personnel :** sur l'accueil, pour le membre qui a retenu son pseudo, l'écart entre ses chiffres de la page Membres (`stats.team`) et ceux que son navigateur a gardés de sa visite précédente (`src/lib/moi-visite.ts`) : parties et victoires de plus, place aux victoires des deux visites, palier franchi. Même règle des trois heures que le résumé du clan, et rien ne quitte l'appareil.
- **Semaine en cours :** en haut de la gazette, les parties depuis le lundi à Paris jusqu'à la dernière collecte, et la semaine d'avant arrêtée au même moment de la semaine (`src/lib/semaine.ts`). Les chiffres sont datés, jamais donnés pour la semaine entière.
- **Simulateur de classement (QG) :** `/simulateur.json`, construit avec le site (`src/lib/simulateur-donnees.ts`), calculé dans le navigateur (`src/lib/simulateur.ts`, `src/lib/simulateur-vue.ts`). La règle du score d'OpenFront, vérifiée sur 130 classements relevés du 5 au 11 novembre 2026 (écart moyen 0,03 %, au plus 0,26 %) : chaque partie ajoute `max(score, 0)`, divisé par deux tous les 30 jours et retiré 90 jours après le début de la partie. Pour GAL, ses parties donnent le vieillissement exact de son score ; pour les autres clans, leur rythme se lit entre deux relevés quotidiens du classement (à 4 % près en moyenne, vérifié sur GAL) et leurs sorties de fenêtre sont estimées. La projection suppose des rythmes constants ; sa marge est mesurée sur l'archive de GAL, horizon par horizon et pour chacun des deux rythmes de départ (`backtest`), depuis le premier jour où la fenêtre et le rythme sont archivés : le 17 juillet 2026 au rythme de 7 jours, le 9 août à celui de 30. L'écran tire cette date des données. Elle n'est montrée que pour le rythme mesuré, sans case changée, et qu'avec au moins deux fois l'horizon en départs (les départs de jours voisins se recouvrent) : au 11 novembre 2026, à 7, 14 et 30 jours, pas à 60 ni à 90. Un classement relevé en retard ne fait pas compter deux fois les jours déjà couverts par les parties. Un test refait le score officiel à partir des données du dépôt.
- **Seul ou en groupe :** sur chaque fiche, les parties de la liste officielle du membre, retrouvées dans les sessions du clan, rangées selon le nombre de Gaulois de la partie (seul, à 2, à 3, à 4 et plus) et par format (`src/lib/seul-groupe.ts`). Victoires et taux seulement : aucun point par joueur. La phrase de comparaison n'apparaît qu'avec au moins 20 parties de chaque côté.
- **Outils du QG :** `/semaine-du-clan.json`, construit avec le site (`src/lib/semaine-du-clan.ts`), donne les victoires du clan des trois dernières semaines, du lundi au dimanche à Paris, une semaine n'étant dite complète qu'une fois son dimanche relevé (`completeThrough`) ; les victoires de chaque membre avec pseudo depuis le relevé du lundi, avec la même règle que les paliers de la semaine (`milestonesSinceMonday`), sans baisse ni anonyme ; et le score de chaque clan du classement. L'objectif et le pronostic de la semaine, et l'onglet « Moi », en tirent leurs chiffres (`src/lib/compte/outils.ts`) : progression d'un objectif de victoires, écart au centième avec un clan, pronostics les plus proches, à égalité tous. Le serveur ne garde que ce que les membres déclarent.
- **Belle partie d'hier :** sur l'accueil, la partie de la veille de la collecte où le plus de Gaulois jouaient ensemble, au moins 2 ; à égalité, une victoire d'abord, puis la plus récente (`src/lib/belle-partie.ts`). Aucune partie à plusieurs la veille : rien n'est affiché.
- **Records récents :** sur la page Records, « Nouveau record » marque un record établi dans les 7 derniers jours couverts ; dans la gazette, « Record du clan » marque un temps fort de la semaine qui est aussi le record de tout l'historique, même valeur et même moment (`src/lib/records-battus.ts`). Égaler un ancien record n'en est pas un.
- **Gazette :** une édition par semaine complète, du lundi au dimanche à Paris, publiée une fois le dimanche définitif (`completeThrough`). Parties et victoires viennent des sessions, les temps forts du même calcul que les records, sur cette seule semaine. Rang et score viennent de `data/history/`. Le territoire vient de la fin des journées terminées de la carte, et à défaut des relevés de `data/clanmap/journal.json` (`territoryReadings`). Pour chacun : le dernier relevé d'avant la semaine, sinon le premier de la semaine, puis le dernier de la semaine. Sans relevé, la page écrit « Pas de données ». Les arrivées comptent les `joinedAt` de la semaine dans la liste actuelle : ceux déjà repartis n'y sont pas. Les phrases ne font que dire les chiffres, sans commentaire.
- **Ma place :** sur l'accueil, position d'un membre parmi ceux dont les stats sont connues, triés par `stats.team.wins`, comme la page Membres. Deux membres à égalité partagent la même place. La liste ne se charge que si un pseudo est tapé ou retenu. Le bouton « C'est moi » garde le `publicId` dans le navigateur du visiteur, jamais ailleurs, et seulement pour un membre dont le pseudo est déjà public : chercher quelqu'un ne retient rien. Un membre parti du clan, ou devenu anonyme, est retiré de ce stockage au chargement suivant de la liste.
- **Depuis votre dernière visite :** sur l'accueil, l'écart entre les chiffres de la page et ceux que le navigateur a gardés de la visite précédente (`src/lib/visite.ts`). Trois heures sans revenir font une nouvelle visite, et recharger la page garde le résumé. Rien ne quitte l'appareil. Le titre donne la date de la visite, et les phrases parlent du « dernier relevé » : le film de la carte ne se relit qu'une fois par jour. Deux relevés ne disent rien de ce qui s'est passé entre eux : les phrases donnent les deux valeurs, sans commentaire. Un relevé absent n'écrit rien, et une première visite n'affiche rien. Sur la page Carte, le même relevé garde la date de la dernière image du film : au retour, le film reprend après elle et dit ce que GAL a gagné ou perdu depuis (`src/lib/clanmap/reprise.ts`).
- **Joueurs de la semaine :** la différence de `stats.team.wins` entre deux relevés du lundi, faits au premier passage du robot, soit vers 0 h 53 à Paris, dans `src/lib/week-players.ts`. Le podium, et jusqu'à 5 lignes en cas d'égalité. Cela compte des victoires, donc d'abord du temps de jeu : sur deux relevés du 5 au 7 novembre 2026, le trio aux victoires est le trio aux parties, et il reste le même dans 100 % de 20 000 tirages où chacun aurait le même taux de victoire. Ce n'est pas un classement de niveau, le message et la page le disent, et aucun taux de victoire n'est classé. Il faut un relevé au début et à la fin de la semaine, et deux relevés du lundi éloignés de 7 jours à plus de 6 h près ne donnent pas de semaine. Sans relevé du lundi d'avant, le départ est le plus ancien relevé de la semaine gardé dans l'historique Git de `data/members.json`, lu par l'API de GitHub avec le jeton de l'Action (`src/lib/member-history.ts`). La période est alors plus courte, et le titre l'écrit avec ses dates, par exemple « du 5 nov. au 8 nov. » pour la semaine du 2 au 8 novembre 2026. Moins de deux jours : pas de podium, et rien ne le remplace. Un anonyme n'a pas d'identifiant à suivre, et un membre sans relevé de départ, comme un arrivant, n'est pas compté.
- **Les plus actifs et les paliers de la semaine :** depuis le 9 novembre 2026, le relevé du lundi garde aussi les parties (victoires et défaites de `stats.team`), et chaque semaine arrêtée note ceux qui ont le plus joué et les paliers de victoires franchis (100, 250, 500, 1 000, 2 500, 5 000), sur la même période et avec les mêmes règles que le podium. Une semaine arrêtée avant n'a ni l'un ni l'autre : la gazette et l'accueil n'affichent alors rien, jamais un zéro. Les deux listes se ressemblent souvent : qui joue beaucoup gagne beaucoup. L'accueil montre en plus les paliers franchis depuis le relevé du lundi, d'après la liste du moment (`milestonesSinceMonday`), et choisit ses lignes dans `src/lib/vie-du-clan.ts`.
- **Records des joueurs :** sur la page Records, le plus de victoires en une semaine et le plus de parties en une semaine, lus dans les semaines arrêtées gardées par `data/member-weeks.json` (les mêmes que le podium et les plus actifs de la gazette), et le plus de victoires sous le tag au total, dans la liste officielle (`src/lib/records-joueurs.ts`). Ce total n'est pas daté : il peut compter des parties jouées sous le tag avant l'arrivée du joueur dans la liste. Pour les semaines, seuls les membres encore dans le clan et nommés, avec leur pseudo du moment, comptent, comme dans la gazette. Une semaine relevée en cours de route garde sa vraie période, plus courte. À égalité dans une semaine, tous sont cités ; d'une semaine à l'autre, la première à atteindre le chiffre garde le record. Un détenteur sans pseudo public n'est jamais nommé. La couverture des semaines (« Semaines relevées depuis le … ») reste écrite sous les chiffres ; le périmètre et la réserve sur le niveau sont dans « Comment lire ces chiffres ». Comme le podium, cela compte d'abord le temps de jeu, pas le niveau.
- **Podiums des joueurs :** sur la page Records, pour chaque membre avec pseudo encore dans le clan, sa plus longue série de victoires et sa journée de Paris avec le plus de victoires ; les 5 premiers de chaque (`src/lib/podiums.ts`). Les parties viennent de la liste officielle de chaque membre, `/public/player/:id/sessions`, 100 par page : celles qui sont publiques, en équipe, hors classé, avec le tag. Mesuré le 10 novembre 2026 sur 3 membres et 181 parties : ce sont exactement les lignes de `stats.team` de `/public/player/:id/games`, avec le même résultat, y compris les parties où le joueur n'est jamais apparu sur la carte, des défaites sans session du clan que le détail des parties ne montre pas. Une défaite coupe donc une série comme dans le bilan officiel. Cette liste range Humains contre Nations avec les parties en équipe : une victoire n'est comptée que si le clan a une session pour cette partie, et une défaite coupe la série dans tous les cas, si bien qu'un chiffre peut être un peu plus bas que le bilan officiel, jamais plus haut. Une victoire seul contre des robots ne compte pas, une défaite y coupe la série, et les parties plus récentes que les sessions relevées attendent le passage suivant. Un joueur est relu quand ses parties selon `stats.team` ont bougé, donc environ une fois par jour, jusqu'à six heures avant la lecture précédente, dont seule l'heure est gardée : une partie quittée tôt n'apparaît qu'à sa fin. À égalité, le premier à atteindre le chiffre passe devant, et deux joueurs qui l'atteignent dans la même partie partagent la place. Une série se gagne en équipe, et une grosse journée demande d'abord beaucoup de parties : ce n'est pas un classement de niveau. Un membre parti ou devenu anonyme est retiré du fichier au passage suivant. Les éliminations, demandées le même jour, ne sont pas reprises : ce n'est pas `stats.team` (section « Podiums des joueurs » de [docs/API_AUDIT.md](docs/API_AUDIT.md)).
- **Paliers :** chaque membre est rangé à son plus haut palier de `stats.team.wins` : 10, 50, 100, 250, 500, 1 000, 2 500 ou 5 000 victoires. Ces seuils sont un choix du site, pas du jeu. Un palier compte des victoires, donc d'abord des parties jouées : il ne dit pas qui joue le mieux. Mesuré le 7 novembre 2026 sur les 440 membres avec au moins une partie : victoires et parties sont corrélées à 0,98, et si tous gagnaient au taux du clan, 86 % resteraient au même palier. C'est la version autorisée des trophées proposés le 6 novembre 2026, qui auraient demandé d'autres stats que `stats.team`. Dans un palier, les pseudos sont rangés par ordre alphabétique. Un membre sans stats n'est rangé nulle part.
- **Paliers de pixels :** sur la page Carte, le prochain palier du territoire de GAL et ce qu'il manque, avec les seuils des grands moments du film (`THRESHOLDS` de `src/lib/clanmap/moments.ts`). Ces seuils sont un choix du site, pas du jeu.
- **Comparateur de clans :** les chiffres de deux clans de la liste officielle, côte à côte, sur ses 90 jours glissants. Le taux vaut `wins ÷ games` et les joueurs par partie `playerSessions ÷ games`, qui retombe sur la moyenne de `clanPlayerCount` : mesuré le 7 novembre 2026 sur GAL, 2,643 des deux côtés. L'écart de score suit les relevés de `data/rivals/`, 90 au plus : un clan absent d'un relevé laisse un trou. Le face-à-face vient du calcul décrit plus haut, sinon rien n'est écrit ; s'il est suspendu, la page le dit, avec la date du détail des parties. Rien n'est noté. La page précise que le taux ne dit pas qui joue le mieux : le 7 novembre 2026, il est corrélé à 0,70 aux joueurs par partie sur les 105 clans de la liste, et GAL gagne 23,8 % de ses parties à 1 Gaulois, 79,2 % à 5 ou plus.
- **Dernières parties :** une ligne par session des 30 derniers jours de Paris, de la plus récente à la plus ancienne. La carte et la durée viennent de `/public/game/:id`, « — » tant que le détail n'est pas lu, et la page dit combien le sont. « Autres clans » ne cite que la liste officielle, avec au moins 2 joueurs : un tag se choisit librement. Le côté de chaque clan vient du même calcul que les face-à-face, et disparaît avec eux si ce calcul est suspendu. Le taux n'est écrit que sans filtre. La page et son fichier `/parties.json` ne contiennent aucun joueur. Mesures : section « Détail d'une partie » de [docs/API_AUDIT.md](docs/API_AUDIT.md).
- **Territoire sur la carte :** pixels rejoués depuis l'historique. L'ordre des clans suit le nombre de pixels, comme la liste de la carte officielle. Ce n'est pas le classement des clans.
- **Pixels pris et perdus :** comptés à chaque changement de main d'un pixel. Les terres neutres sont comptées à part.
- **Objectif :** pixels du clan juste devant, moins ceux de GAL, plus 1.
- **Coûts de la carte :** 1 capsule = 100 troupes, 1 pixel neutre = 1 000 troupes. Ils traduisent les réserves du clan en pixels neutres. Règles lues dans le code de la carte, dans `src/lib/clanmap/economy.ts`. **Si le jeu les change, il faut les mettre à jour à la main.**
- **Grands moments du film :** déduits des chiffres de chaque image dans `src/lib/clanmap/moments.ts`, sans texte écrit à la main. Chacun porte la date de son image.
- **Journées de GAL :** les dates viennent de l'historique officiel et se comptent en jours de Paris (`src/lib/clanmap/replay.ts`, `days.ts`). Le solde d'une journée est ses pixels pris moins ses pixels perdus. Les deux records ne regardent que les journées terminées. La gazette prend le territoire à la fin de ces journées, et le relevé quotidien de `journal.json` pour le reste.

Le calculateur de troupes est documenté dans `src/lib/calculator.ts`. Il reprend les constantes du jeu au commit `5b75bd3`. **Si le jeu change ses règles d'attaque, il faut les mettre à jour à la main.**

## Déploiement sur GitHub Pages

Le site est publié sur <https://les-gaulois.github.io/>. Cette adresse vient du nom du dépôt : un dépôt nommé `les-gaulois.github.io`, dans l'organisation GitHub `les-gaulois`, publie à la racine de cette adresse. Ne pas le renommer : l'adresse du site changerait, sans renvoi automatique depuis l'ancienne.

Les anciens liens, en `solymix-jodariou.github.io/Gaulois-V2/`, passent par un petit dépôt à part, [`Solymix-Jodariou/solymix-jodariou.github.io`](https://github.com/Solymix-Jodariou/solymix-jodariou.github.io), qui envoie vers la même page du site. Ne pas le supprimer : ces liens casseraient.

Pour réinstaller le site ailleurs, rien n'est déployé tant que vous ne faites pas ces étapes. L'offre gratuite de GitHub Pages demande un dépôt public.

1. Créez un dépôt GitHub public et poussez le projet sur la branche `main`.
2. Dans **Settings → Pages**, choisissez **GitHub Actions** comme source.
3. Dans **Actions**, lancez **Données et site** une première fois.

Le workflow `.github/workflows/site.yml` tourne ensuite chaque heure, à chaque push sur `main` et à la demande. GitHub peut retarder les exécutions planifiées, en sauter, et désactiver celles d'un dépôt qu'il juge inactif. Depuis le 6 novembre 2026, une tâche de [cron-job.org](https://cron-job.org) nommée « Collecte GAL » lance donc le workflow à la minute 53 de chaque heure, avec un jeton GitHub qui ne doit donner que le droit **Actions** sur ce dépôt. Une seconde tâche, « Victoires GAL », à créer le 11 novembre 2026 avec le même jeton, doit lancer toutes les 5 minutes le workflow des victoires : voir « Les victoires sur Discord ». Si ce jeton expire ou est supprimé, la collecte retombe sur le seul planning de GitHub, et les victoires sur les rares passages qu'il lance. Si les données se figent, l'état du site de `/direction` le signale à l'encadrement. Regardez alors l'onglet **Actions**, puis cette tâche et la date de son jeton dans les réglages du compte GitHub.

## La connexion Discord

Les membres se connectent avec Discord, un officier valide leur compte dans `/direction`, et l'encadrement publie annonces, événements, sondages et mot d'accueil depuis `/direction`. Le site a une face publique, lue par tous, et une face privée, le QG (`/qg`) : les membres validés y préviennent les autres quand ils attendent dans un salon d'OpenFront, votent, proposent des idées, voient qui vient et choisissent de se montrer sur le mur avec leur photo Discord. Depuis le 11 novembre 2026, ils y ont aussi leur place dans le clan sans taper leur pseudo, « Ce soir je joue », l'objectif et le pronostic de la semaine, le bouton du salon vocal, les GG et les parrains. Rien du QG n'est écrit dans les pages publiées : le serveur ne le donne qu'à un compte validé. C'est la seule partie du site qui a un serveur et une base de données (Supabase), **branchée à un vrai projet depuis le 6 novembre 2026** : voir [docs/DIRECTION.md](docs/DIRECTION.md). Le reste du site n'en dépend pas et continue de marcher si elle tombe.

Pour les joueurs qui refusent de lier leur compte Discord, une connexion par code est prête depuis le 12 novembre 2026 : `/code` dans le Discord du clan, puis le code sur le site. Elle s'ouvre à tous une fois installée chez Supabase et Discord par le pilote, et essayée : voir « Se connecter avec un code » dans [docs/DIRECTION.md](docs/DIRECTION.md). Sous le bouton de connexion, un bloc dit déjà ce que Discord donne au site.

Les appels du QG peuvent aussi partir dans un salon Discord du clan, avec un ping du rôle quand l'appel le demande : ce n'est pas le robot qui les poste, mais le serveur, dès l'appel, avec un lien réglé dans l'onglet « Discord » de `/direction`. Voir « Les appels sur Discord » dans [docs/DIRECTION.md](docs/DIRECTION.md).

Depuis le 11 novembre 2026, cet onglet est un menu dont les rubriques se déroulent, et sa première, « Message Discord », permet aux admins et au fondateur d'écrire un message mis en forme, avec des embeds et des images, et de l'envoyer dans un salon du clan. Là encore, c'est le serveur qui poste, par le webhook du salon. Voir « Les messages Discord » dans [docs/DIRECTION.md](docs/DIRECTION.md).

**La Conquête des Gaulois, un jeu de territoires, a été retirée du site le 6 novembre 2026. Ses tables restent dans le projet Supabase en ligne, inutilisées, et ses fichiers déjà appliqués restent dans `supabase/migrations/`, jusqu'à ce que le clan s'en occupe.** Le fichier `config/conquete.json` reste lui aussi, sans plus servir.

## La gazette sur Discord

Le site peut poster chaque édition de la gazette dans un salon du serveur, tout seul. **C'est prêt, mais rien ne part tant que le clan n'a pas fait ces deux étapes**, qu'un site ne peut pas faire à sa place :

1. Sur Discord, dans le salon choisi : **Modifier le salon → Intégrations → Webhooks → Nouveau webhook**. Donnez-lui un nom, par exemple « Gazette GAL », sinon le message portera le nom donné par défaut. Puis **Copier l'URL du webhook**. Ce lien permet d'écrire dans le salon : il ne se partage pas.
2. Sur le site, `/direction#discord`, partie « Le salon des nouvelles » : collez le lien, puis **Enregistrer et envoyer un essai**. Avant le 11 novembre 2026, il allait dans le secret GitHub `DISCORD_WEBHOOK_GAZETTE`, qui ne sert plus que si rien n'est réglé sur le site : voir « Les salons du robot sur Discord » dans [docs/DIRECTION.md](docs/DIRECTION.md).

Au passage suivant du robot, la dernière édition part une fois. Pour un essai, posez d'abord le lien d'un salon privé : l'édition y part et sa trace est notée. Remplacez ensuite ce lien par celui du vrai salon : le premier message du clan sera l'édition suivante. Les alertes de place et les paliers franchis partent avec le même lien, mais seulement après la gazette du lundi 9 novembre 2026 : posé avant ce lundi 9 h, le vrai lien reçoit donc d'abord cette gazette. Posé plus tard, le premier message du salon peut être une alerte ou des paliers.

Pour vérifier un nouveau lien sans rien poster : au passage suivant, l'étape « Vérifier le lien Discord » de l'onglet **Actions** demande à Discord si le webhook existe (`src/lib/discord-check.ts`). Elle écrit son nom et sa date de création, lue dans son identifiant : celle du webhook qu'on vient de créer. Elle ne le fait qu'une fois par lien, et note la date dans `data/discord-lien.json`. Un lien que Discord ne reconnaît pas laisse un avertissement qui commence par « Lien Discord : », à chaque passage jusqu'à ce qu'il soit corrigé.

Chaque nouvelle édition part ensuite le lundi, au premier passage du robot après 9 h, heure de Paris, donc vers 9 h 53. Le premier passage du lundi relit exprès la liste des membres et le film de la carte, pour couvrir le dimanche. Si l'une de ces lectures échoue, le message l'attend jusqu'au premier passage après 21 h, puis part sans ce qui manque. Les semaines passées ne sont pas rattrapées. Seul le robot de la branche `main` envoie. Si Discord ne répond pas, le robot réessaie au passage suivant, et la collecte continue. La dernière édition envoyée est notée dans `data/gazette-envoi.json`, écrit par le robot seulement.

Le message est une image dessinée par le robot (`src/lib/gazette-image.ts`), avec un bouton vers la page. Elle reprend les chiffres de la page et ne dessine pas ce qui manque. Le texte y est converti en tracés à partir des polices du site, en versions fixes (`@fontsource/outfit`, `@fontsource/inter`), et Discord reçoit une description de l'image pour les lecteurs d'écran. Si elle ne peut pas être dessinée, ou si Discord refuse ce format (400, 403 ou 413), le message part aussitôt en texte, en blocs. Il ne peut mentionner personne. Dans le texte, les pseudos sont échappés pour qu'ils ne puissent ni mettre en forme le message ni y glisser un lien. Une semaine sans joueurs n'a pas de podium, et rien ne le remplace. Un message posté ne se corrige pas : il ne donne que le territoire d'une journée terminée, et rien ne part si un mois de sessions est illisible ou si la semaine n'a aucune partie.

`MESSAGE_FORMAT`, dans `src/lib/gazette-discord.ts`, ne se change que si le lien du salon des nouvelles pointe vers un salon d'essai : cela renvoie une fois la dernière édition, pour voir un nouveau message. Ne passez au vrai salon qu'après avoir vu le message dans le salon d'essai : `format` dans `data/gazette-envoi.json` dit qu'un message est parti, pas qu'il portait l'image. Un repli en texte laisse un avertissement dans l'onglet **Actions**.

Pour arrêter, débranchez le salon dans la Direction, et supprimez le secret s'il existe encore. Supprimer seulement le webhook laisse le robot réessayer à chaque passage, sans rien poster : depuis le 11 novembre 2026, l'étape « Vérifier les salons Discord » le signale à chaque passage, et l'onglet Discord de la Direction le montre. Une panne se lit dans l'onglet **Actions** : l'Action reste verte, mais l'étape « Envoyer la gazette sur Discord » porte un avertissement qui commence par « Gazette : ».

Le robot envoie après avoir enregistré les données : s'il ne peut plus pousser sur `main`, plus rien ne part. Limite : s'il envoie le message puis n'arrive pas à noter l'envoi après trois essais, l'édition repart une fois au passage suivant.

## Les alertes de place

Le robot poste aussi un message quand GAL gagne ou perd une place, au classement officiel des clans ou sur la carte des clans. Il utilise le même salon et le même lien que la gazette : il n'y a rien d'autre à régler. Débrancher le salon des nouvelles dans la Direction, et supprimer le secret s'il existe encore, arrête les deux. Tant que le secret pointe vers un salon d'essai, les alertes y partent aussi, et elles comptent comme annoncées : elles ne repartent pas vers le vrai salon.

Peu de messages, et seulement du vrai (`src/lib/alerts.ts`) :

- **Lancement :** les alertes commencent après l'envoi de la gazette du lundi 9 novembre 2026, pour qu'elle soit le premier message du salon.
- **Classement :** OpenFront le recalcule environ une fois par heure, et `end` date chaque calcul. Un changement de place ne compte que s'il tient sur deux calculs, à au moins 50 minutes d'écart, du même côté de la place annoncée, et l'alerte donne la place du dernier. Une place qui fait le yo-yo d'un calcul à l'autre n'envoie rien.
- **Carte :** relevée environ une fois par jour. Chaque relevé est comparé à la dernière place annoncée. L'alerte attend le passage suivant du robot, pour que le bouton montre la nouvelle carte. C'est le territoire en pixels, pas le classement des clans, et le message le dit.
- **Le site :** l'alerte du classement part dès le second calcul. Le site montre déjà la place, sauf si elle a encore bougé au dernier calcul, comme 3e puis 4e : il peut alors montrer la précédente quelques minutes. Attendre davantage ferait taire une chute continue, car le robot ne lit en général chaque calcul qu'une fois.
- **Jamais la nuit :** de 23 h à 8 h, heure de Paris, l'alerte attend le matin. Si la place est revenue entre-temps, rien ne part.
- **Au plus deux alertes par jour** à Paris, une seule par passage du robot, et seulement sur un relevé récent : moins de 2 heures pour le classement, moins d'un jour pour la carte.
- **Au premier passage**, les places du moment servent de départ : rien n'est envoyé.

Le message donne la nouvelle place, l'écart avec les clans juste devant et juste derrière, et l'heure du relevé, avec une image (`src/lib/alerts-image.ts`, même dessin que la gazette) et un bouton vers `/classement` ou `/carte`. Il ne peut mentionner personne, et les tags des autres clans sont échappés. Si GAL sort du classement ou n'a plus de pixel sur la carte, rien ne part ; à son retour, sa place est comparée à la dernière annoncée.

La place annoncée, celle qui attend un second calcul et les envois du jour sont notés dans `data/alertes-envoi.json`, écrit par le robot seulement. S'il devient illisible, les places du moment servent de nouveau départ, avec un avertissement : seule une alerte en attente peut s'y perdre. Une panne se lit comme pour la gazette : l'étape « Envoyer les alertes de place sur Discord » porte un avertissement qui commence par « Alertes : ». Même limite aussi : une alerte envoyée mais non notée repart une fois.

## Les paliers franchis sur Discord

Le robot poste aussi un message quand des membres passent un palier de victoires en équipe sous le tag : 50, 100, 250, 500, 1 000, 2 500 ou 5 000, les paliers du site à partir de 50 (`src/lib/paliers-franchis.ts`). Jusqu'au 11 novembre 2026, ils partaient à partir de 100 ; le pilote a demandé 50 pour que le salon vive : sur les relevés de la liste du 5 au 8 novembre 2026, les paliers de 10 et 50 victoires ont été passés 6 fois, celui de 100 une fois. Le passage à 50 ne se fait qu'une fois : un membre noté sous 100 part de 50 s'il y est, et ce palier-là n'est pas annoncé pour lui, puisqu'on ne sait pas quand il l'a passé. Le bilan de la semaine, dans la gazette et sur l'accueil, garde les paliers à partir de 100. Même salon, même lien et même lancement que les alertes.

- **Quand :** la liste des membres est relue environ une fois par jour. Chaque relecture est comparée à la précédente : un membre avec pseudo présent aux deux, qui a passé un palier entre elles, est noté avec le plus haut palier passé.
- **Qui :** un nouveau membre, ou un pseudo apparu, n'a pas de point de départ : il n'est pas cité. Un anonyme ne l'est jamais, ni un joueur sans stats ou repassé sous son palier. Un membre parti ou sans pseudo est oublié à chaque passage de la collecte, même sans lien Discord : son identifiant ne reste pas dans le fichier. Un palier ne se note qu'une fois, même si le chiffre recule puis remonte.
- **Combien :** un seul message par jour à Paris, jamais la nuit, avec tout ce qui a été noté depuis le précédent. Il attend le passage du robot qui suit la relecture, quand le site montre les nouveaux paliers. Au premier passage, les paliers du moment servent de départ : rien n'est envoyé.

Le message cite chaque pseudo, relié à sa fiche, avec le palier passé et la période entre les deux relevés, et rappelle qu'un palier compte d'abord les parties jouées. L'image (`src/lib/paliers-franchis-image.ts`) montre cinq joueurs au plus. Le texte en écrit quinze au plus, moins si de longs pseudos le rendaient trop long pour Discord, et compte les autres. Le bouton ouvre la fiche s'il n'y a qu'un joueur, sinon les paliers de la page Membres. Le palier de chaque membre avec pseudo à la dernière relecture, ceux en attente et le jour du dernier message sont notés dans `data/paliers-envoi.json`, écrit par le robot seulement. Une panne laisse un avertissement qui commence par « Paliers : » sur l'étape « Envoyer les paliers franchis sur Discord ».

## Les messages du jour sur Discord

Depuis le 11 novembre 2026, le salon de la gazette reçoit aussi des messages du jour, pour qu'il vive : le pilote en voulait deux ou trois par jour. Le bilan d'hier part chaque jour et les plus actifs presque chaque jour ; la bienvenue, les nouveautés et les paliers seulement quand il y a de quoi. Sur les relevés du 5 au 11 novembre 2026, cela fait souvent quatre ou cinq messages par jour, sans compter la gazette et les alertes. Même salon, même lien et même lancement que les alertes. Chacun part au plus une fois par jour à Paris, jamais de 23 h à 8 h, et à partir d'une heure à lui, pour que les messages s'étalent dans la journée (`SEND_FROM_HOUR` de `src/lib/salon-discord.ts`). Le robot passe vers la 53e minute de chaque heure : un message de 17 h part vers 17 h 53. Aucun ne mentionne qui que ce soit, et les pseudos sont échappés, comme pour les paliers ; ils sont écrits tels qu'ils sont sur la page Membres.

- **Hier chez les Gaulois, dès 9 h** (`src/lib/hier-discord.ts`, image `src/lib/hier-image.ts`) : les parties, les victoires et le taux de la veille, comptés comme les barres des jours de la page Progression, avec l'écart au jour d'avant s'il a des parties ; la plus longue série de victoires de la journée, avec la règle des records (sans les parties jouées seul contre des robots, et une série en cours à minuit repart de zéro) ; la belle partie de l'accueil, celle où le plus de Gaulois jouaient ensemble, sans le nom de la carte, dont la traduction demanderait un crédit. Le message attend que la collecte ait fini la journée (`completeThrough`). Une journée sans partie relevée n'envoie rien, un jour manqué n'est pas rattrapé, et un mois de sessions illisible n'envoie rien, avec un avertissement. Le dernier jour envoyé est noté dans `data/hier-envoi.json`.
- **Bienvenue, dès 12 h** (`src/lib/bienvenue-discord.ts`, image `src/lib/bienvenue-image.ts`) : les arrivées dans le clan (`joinedAt` de la liste des membres) entre le relevé du message précédent et le dernier, de ceux qui sont encore là. Les pseudos sont cités, reliés à leur fiche, quinze au plus dans le texte et cinq sur l'image ; les anonymes sont seulement comptés. Si la liste donne une nouvelle date d'arrivée à un joueur parti puis revenu, il est de nouveau accueilli. Le message attend que le site montre les fiches des nouveaux. `data/bienvenue-envoi.json` ne garde que l'heure du relevé et le jour du message, aucun identifiant.
- **Les plus actifs, dès 17 h** (`src/lib/actifs.ts`, `src/lib/actifs-discord.ts`, image `src/lib/actifs-image.ts`) : les membres avec pseudo qui ont joué le plus de parties en équipe sous le tag (`stats.team`, victoires et défaites) entre le relevé de la liste du message précédent et le dernier, avec leurs victoires. Même podium que les plus actifs de la semaine : trois places, cinq lignes au plus en cas d'égalité. Le message rappelle que cela compte le temps de jeu, pas le niveau. Un membre sans relevé de départ n'est pas compté. Une période de plus de trois jours (panne du robot ou de Discord) n'est pas envoyée : le dernier relevé sert de nouveau départ. Les parties et victoires de départ de chaque membre avec pseudo sont notées dans `data/actifs-envoi.json`, que la collecte nettoie des membres partis à chaque passage, même sans lien.
- **Les nouveautés du site, dès 19 h** (`src/lib/nouveautes-discord.ts`) : les entrées de `content/nouveautes.json` ajoutées depuis le message précédent, en texte, avec la phrase et le lien de chacune, ou les titres seuls si le message serait trop long. Une entrée se reconnaît à son jour et à son titre : une entrée de plus de trois jours n'est plus une nouvelle, elle est notée sans être envoyée. Les entrées passées sont notées dans `data/nouveautes-envoi.json`.

Au premier passage, la bienvenue, les plus actifs et les nouveautés prennent la liste ou les entrées du moment comme départ, sans rien envoyer ; le bilan d'hier n'a pas de départ à attendre. Après un refus de Discord, rien n'est noté et le passage suivant réessaie. Les états sont relus avec leur schéma : illisibles, ils repartent comme au premier passage, avec un avertissement. Une panne laisse un avertissement qui commence par « Hier : », « Bienvenue : », « Plus actifs : » ou « Nouveautés : » sur l'étape de chaque message.

## Les alertes de record

Le robot poste aussi un message quand le clan bat un de ses records (`src/lib/records-discord.ts`, script `scripts/envoyer-records.ts`) : plus longue série de victoires, meilleure journée, le plus de Gaulois dans une partie gagnée, victoire avec le plus d'équipes en jeu. Ce sont les records de la page Records, calculés par `clanRecords` : rien n'est recalculé pour l'alerte. Même salon et même lien que la gazette.

- **Battu, pas égalé :** la marque doit dépasser strictement celle annoncée. Égaler un record n'envoie rien.
- **Un seul message par jour** à Paris, jamais la nuit (de 23 h à 8 h, le message attend le matin), et les records battus au même passage partent ensemble.
- **Lancement et premier passage** comme les alertes de place : après la gazette du 9 novembre 2026, et les records du moment servent de départ.
- **En texte,** avec une ligne par record, sa date, l'ancienne marque, un lien vers `/records` et la date de la collecte. Personne ne peut être mentionné.

Les records annoncés et les envois du jour sont notés dans `data/records-envoi.json`, écrit par le robot seulement. S'il devient illisible, les records du moment servent de nouveau départ, avec un avertissement.

## Jouer ensemble sur Discord

Une fois par semaine, à partir du mardi 14 h, jamais la nuit, le robot poste « Jouer ensemble » pour la semaine finie (`src/lib/groupes-discord.ts`, script `scripts/envoyer-groupes.ts`) : la part des parties jouées à au moins deux Gaulois et des points gagnés qu'elles ont rapportés, les points par partie selon le nombre de Gaulois (sessions du clan), et les duos de membres avec pseudo qui ont le plus gagné ensemble (leurs listes officielles, `.cache/member-games/results.json`, restreintes aux parties du clan). Trois places, cinq lignes au plus en cas d'égalité. Le message dit que cela compte d'abord le temps de jeu à deux. Les pseudos sont échappés, reliés à leur fiche, et personne n'est mentionné. Il attend le mardi parce que les listes des membres ne sont relues qu'une fois par jour ; s'il manque le mardi, il part un autre jour de la semaine, jamais deux fois. La dernière semaine passée est notée dans `data/groupes-envoi.json`. Même salon et même lien que la gazette.

## La course du soir

Chaque soir, le robot poste aussi la course au classement (`src/lib/course-soir.ts`, script `scripts/envoyer-course.ts`). C'est ce que le clan a gardé de son ancien rapport, le 11 novembre 2026 ; ses autres nouvelles ont leurs propres messages, sans doublon. Même salon et même lien que la gazette.

- **Quand :** une fois par jour, à partir de 21 h à Paris, jamais de 23 h à 8 h, comme les messages du jour (`SEND_FROM_HOUR.course`) : vers 21 h 53. Il faut un classement relu depuis moins de deux heures, et des sessions relues après 21 h. Sinon, rien ne part ce soir-là, et le lendemain ne rattrape pas la veille.
- **La course :** la place de GAL parmi cinq lignes de la liste officielle, GAL compris, avec leur score, puis l'écart avec le clan juste devant et celui juste derrière. Le score et les écarts sont comparés au message de la veille, avec le même voisin et du même côté. Le changement d'un écart s'écrit en mots (« retard en hausse de… ») : un signe se lirait à l'envers pour un retard. Sans message la veille, rien n'est comparé.
- **Les points gagnés :** de 20 h la veille à 20 h, heure de Paris, la somme des `score` positifs des sessions du clan, ce que chaque partie a ajouté aux victoires pondérées au moment où elle s'est jouée. Ils sont séparés entre les parties à plusieurs Gaulois et celles d'un Gaulois seul sous le tag. Deux soirs de suite ne sautent ni ne comptent deux fois aucune partie, changement d'heure compris. Une partie n'est relevée qu'une fois finie, et 99 % des parties du clan durent moins d'une heure : d'où l'attente de sessions relues après 21 h.
- **Ce que le message ne dit pas :** les scores négatifs vont aux défaites pondérées, qui ne comptent pas pour la place, et il ne les montre pas. Il ne donne jamais de points par joueur : l'API ne les donne pas, et le site ne publie d'un membre que `stats.team`. Il ne cite aucun pseudo.
- **Les points ne sont pas la hausse du score.** Le score perd chaque jour une part de sa valeur (demi-vie de 30 jours) et oublie les parties de plus de 90 jours. Le 10 novembre 2026, 60,13 points ont été gagnés pour un score monté de 2,25 seulement. Le message donne donc la vraie variation du score officiel à côté des points, et le dit en toutes lettres.

Le message est en texte, avec une image (`src/lib/course-soir-image.ts`, même dessin que les alertes de place) et un bouton vers `/classement`. Il ne peut mentionner personne, et les tags des autres clans sont échappés. Le jour du dernier message, le score et les écarts qu'il donnait sont notés dans `data/course-envoi.json`, écrit par le robot seulement. Un état illisible fait partir le message sans comparaison, avec un avertissement. Une panne laisse un avertissement qui commence par « Course : » sur l'étape « Envoyer la course du soir sur Discord ».

## Les victoires sur Discord

Depuis le 11 novembre 2026, à la demande du pilote (« pareil que ce bot », le robot OpenFront BotAPP qui annonce chaque victoire de [GAL], « dans la même ADN que nos webhooks avec l'image de la carte ») : chaque victoire du clan part dans un **salon à part**, le salon des victoires, réglé dans Direction > Discord (secret de secours `DISCORD_WEBHOOK_VICTOIRES`). Sans lien, rien ne part. Une victoire par message : une quarantaine par jour (médiane de 38 par jour de Paris du 22 octobre au 10 novembre 2026, de 21 à 78), d'où un salon à part plutôt que celui de la gazette. Un même lien peut servir aux deux si le clan préfère.

- **Quoi** (`src/lib/victoires.ts`, script `scripts/envoyer-victoires.ts`) : chaque session gagnée du clan, sauf une partie seul contre des robots, lue sur l'API dans les six dernières heures et dans `data/sessions/`. Le détail de la partie (`/public/game/:id`) donne la carte, la durée et les joueurs. Le message cite **tous les membres du clan dans la partie** qui y ont des stats (le même compte que `clanPlayerCount`), éliminés avant la fin compris, comme le bot, **sous le nom qu'ils portaient dans la partie**, anonymes compris : demande du pilote, le même soir. Un membre avec pseudo est reconnu dans la liste des membres par son identifiant public, et relié à sa fiche. Un autre porteur du tag est vérifié sur sa fiche publique d'OpenFront (`/public/player/:id`, ses clans seulement) : le jeu retire le tag d'un vrai clan à qui n'en est pas membre, sauf quand sa liste des tags ne se charge pas. Un joueur que rien ne donne membre est seulement compté (« 1 joueur sous le tag, hors du clan »), jamais nommé ; si sa fiche ne se lit pas, la victoire attend le passage suivant. Ni nom ni identifiant ne sont écrits dans `data/`. Mesuré sur les 20 dernières victoires du 11 novembre 2026 : les 92 Gaulois des listes de vainqueurs étaient tous membres du clan, dont 17 sans pseudo public ; le nom en partie diffère parfois du pseudo de la liste.
- **Quand :** le workflow `.github/workflows/victoires.yml` passe toutes les 5 minutes, lancé par la tâche « Victoires GAL » de cron-job.org, et prend environ une minute : une victoire part au passage qui suit son arrivée dans l'API, jour et nuit, dans l'ordre des débuts, deux secondes entre deux messages, dix au plus par passage. Le délai entre la fin d'une partie et son arrivée dans `/public/clan/GAL/sessions` n'est pas encore mesuré : à relever sur les premières victoires. D'après ses messages du 9 au 11 novembre 2026, le robot OpenFront BotAPP postait entre 1 et 7 minutes après la fin de la partie (début plus durée). Chaque passage de la collecte lance aussi l'envoi, en secours, une fois ses données enregistrées : sans la tâche, les victoires partent à chaque passage de la collecte, donc chaque heure tant que « Collecte GAL » tourne. Le planning de GitHub n'est pas utilisé : il saute la plupart de ses passages sur ce dépôt. Une victoire commencée il y a plus de six heures n'est plus annoncée (le journal de l'Action le dit) : un envoi arrêté ne déverse pas son retard. Au premier passage, les victoires du moment servent de départ.
- **Le message** (`src/lib/victoires-discord.ts`) : la carte, le format, les Gaulois sur le nombre de joueurs, leurs noms, la durée, l'heure de début (que Discord écrit à l'heure de chacun) et les points gagnés (le `score` de la session), avec deux boutons : la partie sur OpenFront et les dernières parties du site. Jamais « et autres » : si les liens vers les fiches rendaient le texte trop long pour Discord, les noms partent sans lien. Personne ne peut être mentionné, et les noms sont échappés.
- **L'image** (`src/lib/victoires-image.ts`, même dessin que les autres messages du robot) : la vignette de la carte, à gauche, et les chiffres à droite, puis tous les Gaulois en pastilles, plus petites au-delà de trois lignes. La vignette est `resources/maps/<carte>/thumbnail.webp` du dépôt d'OpenFront, lue au moment de l'envoi (CC BY-SA 4.0, crédit dans l'image et dans le message, voir `NOTICE.md`) ; son eau, transparente, prend la couleur de la mer du jeu, et une carte entourée d'eau baigne dans la mer jusqu'au bord du cadre. Sans vignette (carte inconnue, GitHub en panne), les chiffres passent côte à côte ; sans image, le message part en texte.

Les victoires passées sont notées dans `data/victoires-envoi.json` (identifiant et heure de début, rien d'autre), oubliées au bout d'un jour, écrites après chaque message accepté et enregistrées sur `main` par le workflow : une étape coupée en route ne renvoie rien. Une seconde copie est gardée dans le cache de l'Action (clés `victoires-envoi-…`, onglet **Actions > Caches**) : si l'enregistrement sur `main` échoue, les deux copies sont réunies au passage suivant, et rien ne repart. Pour tout remettre à zéro, il faut donc supprimer le fichier et ces caches ; le passage suivant repart alors des victoires du moment, sans rien envoyer. Deux envois ne tournent jamais en même temps. Une partie dont le détail ne se lit pas attend le passage suivant ; un refus de Discord arrête le passage, et le suivant réessaie. Une panne laisse un avertissement qui commence par « Victoires : » dans l'exécution du workflow « Victoires sur Discord ».

**Renvoyer des victoires déjà notées**, quand le salon ne les a pas reçues alors que Discord les a acceptées (un lien qui menait à un autre salon) : écrire leurs identifiants de partie dans `config/victoires-rattrapage.json`, avec la raison (`pourquoi`), puis publier. Au passage suivant, chacune repart une seule fois, avec le même message, si elle a commencé il y a moins d'un jour ; elle est alors notée dans la liste `resent` de `data/victoires-envoi.json`, et ne repart plus. Le fichier peut rester tel quel : au bout d'un jour, il ne renvoie plus rien. Une victoire refusée par Discord n'a pas besoin d'y être : elle n'est pas notée, et repart seule quand le lien remarche, tant qu'elle a moins de six heures. Premier usage, le 12 novembre 2026 : le lien du salon était mal réglé, les deux victoires de la nuit étaient parties avec l'ancien lien, et celles de la matinée, refusées (404), sont reparties seules une fois le lien corrigé.

**La tâche de cron-job.org, à créer par le clan** : comme « Collecte GAL », une requête `POST` vers `https://api.github.com/repos/les-gaulois/les-gaulois.github.io/actions/workflows/victoires.yml/dispatches`, corps `{"ref":"main"}`, avec les mêmes en-têtes et le même jeton (droit **Actions** sur ce dépôt), toutes les 5 minutes. Le plus simple : dupliquer « Collecte GAL », la nommer « Victoires GAL », changer `site.yml` en `victoires.yml` dans l'adresse et l'horaire en « toutes les 5 minutes ». Chaque passage dure environ une minute de machine GitHub, gratuite pour un dépôt public. Les conditions de GitHub Actions écartent les usages sans lien avec le projet du dépôt ; ces envois publient les résultats du clan, comme la gazette, mais 288 passages par jour pèsent plus qu'un passage par heure : si GitHub le jugeait abusif, toute la publication du site en souffrirait. Pour revenir à un envoi par heure, il suffit de mettre la tâche « Victoires GAL » en pause.

## Animations

Les effets au curseur et aux clics sont dans `src/scripts/fx.ts`. Ils sont décrits dans [docs/DESIGN.md](docs/DESIGN.md). Les visiteurs peuvent les couper avec le bouton pause de l'en-tête ou le réglage « réduire les animations » de leur système.

## Limites connues

- La route de la liste des membres n'est pas documentée par OpenFront et peut changer. En cas de panne, le site garde la dernière liste valide.
- Le passé du rang et du score n'existe pas dans l'API : ces courbes partent du premier instantané. Celles des clans voisins partent du premier fichier de `data/rivals/`.
- Le classement classé ne reconnaît que les membres avec un pseudo public : les chiffres affichés sont donc des minimums. Il ne dit pas non plus sous quel tag ces parties ont été jouées.
- Le classement couvre 90 jours glissants : ce ne sont pas des totaux depuis la création du clan.
- Une fiche peut écrire « Pas de données » pour ses dernières parties, sans en donner la raison : pas encore lues, joueur qui ne répond pas, ou parties trop anciennes pour la lecture, limitée à quelques pages. Les parties de chaque joueur restent hors de Git, mais les anciennes versions de la liste des membres sont dans son historique public. Si le cache de l'Action est perdu, les fiches écrivent « Pas de données » le temps de se remplir.
- Le lien « Ouvrir » de la page Dernières parties mène à `https://openfront.io/game/:id`, adresse que le jeu utilise pour partager une partie, sans être documentée. Le 7 novembre 2026, seules les parties jouées avec la version actuelle du jeu s'y rejouaient : les autres partent vers `replay.openfront.io`, qui échoue. La page le dit. Si ce n'est plus vrai, ou si l'adresse change, il faut reprendre cette note et `replayUrl`.
- La gazette ne donne le rang que depuis le 5 novembre 2026, premier relevé, et le territoire que depuis le 29 octobre 2026, début de la carte. Le lundi matin, le territoire du dimanche peut venir d'un relevé fait dans la journée : sa date reste écrite, et le chiffre se précise avec le film suivant. Ses arrivées ne comptent que les membres encore dans le clan : une ancienne édition perd donc un arrivant quand il repart. Elles attendent une liste de membres relevée après le dimanche : le lundi matin, elles peuvent rester en « Pas de données » jusqu'à la relecture suivante de la liste, au plus tard le soir.
- Une alerte de place n'est pas instantanée : le robot passe une à deux fois par heure, un changement au classement attend le calcul suivant d'OpenFront, la carte n'est relevée qu'une fois par jour, puis son alerte attend le passage suivant. La nuit, l'alerte attend 8 h.
- Le détail des parties se lit petit à petit, des plus récentes aux plus anciennes : les pages disent combien sont lues, et les totaux depuis le début n'apparaissent qu'à la fin de cette lecture. Une partie qui ne répond pas reste à lire : rien de définitif n'est écrit. Après 25 échecs dans un passage, ou 5 sans aucune partie lue, la page signale une panne. Les équipes des clans sont retrouvées par calcul tant que les fiches ne les donnent pas : si OpenFront change sa façon de les former, il faudra adapter `placeClans`.
- La route documentée de la carte ne donne pas les troupes des clans. Le site n'affiche donc pas le coût exact d'un pixel ennemi. Le message prévu pour OpenFront, à la section 10 de [docs/API_AUDIT.md](docs/API_AUDIT.md), demande cette donnée.
- Le trésor vient de `/clans/GAL`, une route non documentée. Elle n'a pas répondu à la collecte sur GitHub le 6 novembre 2026. Depuis le 9 novembre 2026, la page Carte ne donne pas de case vide aux réserves : une ligne sous « GAL en chiffres » dit qu'il n'y a pas de données.
- Le film ne filtre pas les dessins peints par les joueurs sur la carte.
- Le jeu ne publie pas qui a peint quel pixel : le site ne peut classer personne pour sa peinture.
- De la connexion, seules la connexion Discord d'un compte et la désignation du fondateur ont été essayées en vrai. Il n'y a plus de test automatique des droits côté serveur : voir [docs/DIRECTION.md](docs/DIRECTION.md).

## Licence

Le code est sous [AGPL-3.0-only](LICENSE). [NOTICE.md](NOTICE.md) liste ce que la licence ne couvre pas (nom, logos et textes du clan, données d'OpenFront) et les conditions à respecter si du code d'OpenFront est repris.

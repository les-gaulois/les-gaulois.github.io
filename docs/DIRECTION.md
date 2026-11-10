# La connexion et l'espace Direction

Comment les membres se connectent avec Discord, ce que chaque rôle peut faire, comment la direction du clan publie depuis le site, et comment tout installer.

C'est la seule partie du site qui a un serveur et une base de données (Supabase). Le reste du site n'en dépend pas et continue de marcher si elle tombe. La Conquête des Gaulois, le jeu pour lequel cette connexion avait été créée, a été retirée du site le 6 novembre 2026 : ses tables restent dans le projet Supabase en ligne, inutilisées.

**État au 6 novembre 2026 :** en ligne sur le vrai projet Supabase. La connexion Discord et la désignation du fondateur ont été essayées avec un vrai compte. Le reste n'a été testé qu'en local, sur un vrai Postgres et un vrai navigateur.

## Ce que voit chacun

- **Un visiteur :** un bouton « Se connecter » dans l'en-tête de toutes les pages. Tant qu'il n'a pas de session, son navigateur ne télécharge pas Supabase.
- **Un membre connecté :** son nom dans l'en-tête, qui mène à son compte. Une fois validé, un lien « QG » s'y ajoute : c'est la face privée du site, décrite plus bas. Sur téléphone, seul « QG » reste, faute de place : le compte s'ouvre depuis le QG. Sur l'accueil, il répond « Je viens » aux événements.
- **Un officier, un admin, le fondateur :** à la place de son nom, les liens « Direction » et « QG ». Sur téléphone, seul « QG » reste, faute de place : la Direction et le compte s'ouvrent depuis le QG.
  - Quand des demandes attendent, une pastille jaune donne leur nombre à côté du lien « QG », sur toutes les pages, et le lien mène alors droit à l'onglet des demandes (`/qg#demandes`). Le serveur ne donne ce nombre qu'à l'encadrement (`count_pending_requests`, migration `20261108000100_pastille_direction.sql`). Il se relit à chaque page, et aussitôt qu'une demande est traitée au QG. En vue joueur, ni lien Direction ni pastille.
  - Jusqu'au 10 novembre 2026, la pastille était sur « Direction », et seul ce lien restait sur téléphone : les demandes se traitaient alors dans `/admin`.

Sans `PUBLIC_SUPABASE_URL` et `PUBLIC_SUPABASE_KEY`, aucun de ces éléments n'apparaît et le site reste entièrement statique.

## La face publique et la face privée

Le site a deux faces depuis le 9 novembre 2026.

- **La face publique :** tout ce qui vient de l'API publique d'OpenFront (classement, carte, records, gazette, membres), les guides, les annonces et les événements. Tout le monde la lit, sans compte.
- **La face privée, le QG (`/qg`) :** réservée aux membres validés. Sa page publiée ne contient que la porte. Son contenu n'est écrit dans aucune page du site ni dans le dépôt : le serveur le donne en un appel, `get_qg`, qui refuse un visiteur, un compte en attente et un compte suspendu.

**Comment on est reconnu membre**, une seule fois :

1. Le joueur se connecte avec Discord.
2. Il tape son pseudo ou son identifiant OpenFront dans `/compte`.
3. Le site vérifie qu'il figure dans la liste des membres de GAL.
4. Un officier confirme que c'est bien lui. Ensuite, le site le reconnaît à chaque visite.

L'identifiant OpenFront seul ne peut pas ouvrir le QG : il est public, dans l'API du jeu et dans l'adresse de chaque fiche de membre. L'étape 4 deviendra automatique le jour où OpenFront acceptera le site dans sa liste (voir « Vérifier les membres : la limite à connaître »).

## Le QG des membres : `/qg`

En bleu, comme le reste du site : c'est l'espace des membres, pas celui de l'encadrement. Un visiteur y lit la porte et les quatre étapes ; le bouton de connexion ramène à `/compte`, là où se fait la demande.

**En onglets, depuis le 10 novembre 2026** (demande du pilote : « rien n'est rangé », « tout est extrêmement petit ») : une partie à la fois, sous une barre d'onglets, en plus grand. Un membre validé a **Salons, Décisions, Événements, Idées et Le mur** ; l'encadrement a en plus **Demandes et Comptes**, et les admins et le fondateur **Journal** : l'ancienne administration, décrite plus bas. Une partie vide n'a pas d'onglet : Décisions n'apparaît qu'avec un sondage, Événements qu'avec un événement à venir. Le mur garde le sien, qui porte le bouton « Me montrer aux autres membres ». Au-dessus des onglets restent le nom du membre, ses liens (Mon compte, et Direction pour l'encadrement) et le mot de l'encadrement. Le détail de l'affichage est dans [DESIGN.md](DESIGN.md), « Les espaces de travail en onglets ».

- L'onglet ouvert est dans l'adresse (`/qg#idees`) : un lien peut ouvrir un onglet, comme celui du pop-up des appels (`/qg#salons`) ou de la pastille (`/qg#demandes`). Un onglet que le compte n'a pas, par exemple `#demandes` pour un membre ou en vue joueur, laisse le premier.
- Un nombre sur un onglet dit ce qui attend le membre : un Gaulois dans un salon, un sondage sans sa voix ; pour l'encadrement, les idées à trancher et les demandes. Tout vient du serveur.
- Une partie cachée reste dans la page : un brouillon, une recherche ou un appel en cours ne se perdent pas d'un onglet à l'autre. Les onglets de l'encadrement ne lisent le serveur qu'au premier passage : un membre ne déclenche aucun appel d'administration.

- **Se montrer aux autres membres :** un choix de chaque membre, désactivé au départ (`set_member_visibility`, colonne `profiles.show_to_members`). Activé, les autres membres validés voient son nom sur le site, son rôle et sa photo de profil Discord, sur le mur et parmi ceux qui viennent à un événement.
  - La photo n'est recopiée nulle part : le serveur lit son adresse dans `auth.identities` (`internal.discord_avatar`), et n'accepte qu'une photo choisie par le membre, à l'adresse exacte du serveur d'images de Discord. Le navigateur revérifie (`safeAvatar`). Sans photo lisible, l'initiale du nom s'affiche. L'image par défaut d'un compte sans photo est le logo de Discord : elle est écartée.
  - **Cette adresse contient l'identifiant Discord du membre.** Un membre validé peut donc lire l'identifiant de ceux qui se montrent. Le QG le dit sous le bouton, avant le choix, et la page de confidentialité aussi. Le bouton est dans l'onglet « Le mur ». Le cacher demanderait de recopier les photos sur le serveur du site.
  - **Ailleurs sur le site,** depuis le 9 novembre 2026 : un membre validé connecté voit aussi ces photos à côté des pseudos, sur les podiums de l'accueil et de la gazette, les records des joueurs, l'encadrement de la page Membres et la fiche du membre. Les pages publiées ne portent que des emplacements vides (`data-face`). `src/scripts/visages.ts` appelle `get_member_faces` (migration `20261109000200_gaulois_de_la_semaine.sql`), qui ne répond qu'à un membre validé : la photo de chaque membre qui se montre, avec son pseudo d'aujourd'hui dans la liste officielle, retrouvé par l'empreinte de `private_links` et `clan_roster`, et non le nom gardé le jour de sa validation. La photo suit donc un changement de pseudo, et un autre membre qui prendrait l'ancien ne reçoit jamais la photo d'un autre. Un membre sorti de la liste n'a pas de visage. Sur la porte du QG de l'accueil, `get_qg` dit en plus ce qui attend les membres (`qgWaiting`). Un visiteur ne déclenche aucun appel.
    - Deux garde-fous de plus : un pseudo porté par plusieurs membres de la liste officielle n'a pas d'emplacement (`singlePseudos`, au build), et le serveur comme le navigateur (`memberFacesOf`) écartent un pseudo porté par deux membres, casse comprise.
    - Du 9 novembre 2026 à la mise en ligne de cette migration, les photos venaient du mur de `get_qg`, par le nom gardé à la validation : un changement de pseudo les faisait disparaître.
- **Le mot de l'encadrement,** en haut du QG.
- **Rejoindre un Gaulois** (`#salons`, migration `20261109000300_appels_aux_salons.sql`), depuis le 9 novembre 2026 : un membre validé qui attend dans un salon d'OpenFront colle le lien que le jeu donne pour inviter ses amis (bouton de copie en haut de l'écran d'un salon public en équipes ou d'un salon privé, ou barre d'adresse) et indique le format (`save_lobby_call`). Le QG en garde la liste (`src/components/compte/QgSalons.tsx`). Depuis le 10 novembre 2026, à la demande du pilote, les membres validés connectés reçoivent l'appel sur les pages du site qui ont l'en-tête commun (toutes, sauf la carte « World », page autonome), pas seulement au QG : un pop-up bleu, sur le dégradé des scènes bleues (`stage-blue`, sans la classe `.stage` et ses effets), qui reste jusqu'à leur clic sur la croix ou la touche Échap, avec deux notes douces jouées par le navigateur et un bouton « Couper le son », qui devient « Remettre le son » (`src/components/compte/AppelsGaulois.tsx`, monté par `Base.astro` dans `<main>`). Un seul pop-up à la fois, le plus récent, et un lien « N autres appels attendent au QG ». Celui qui lance l'appel reçoit aussi l'alerte, depuis le 10 novembre 2026, à la demande du pilote, qui n'avait rien reçu en essayant : « Votre appel est lancé », « Vous attendez dans un salon … », « Les membres connectés reçoivent la même alerte » et un bouton « Gérer mon appel », qui mène au QG pour le retirer : pas de lien vers son propre salon, où il est déjà, car on ne sait pas ce que ferait OpenFront d'une seconde ouverture (`freshCalls`, `ownCallSentence`). Son propre appel ne compte ni dans le titre de l'onglet ni dans « N autres appels ». Un appel fini passe au passé, « Votre appel est terminé » ou « Appel terminé », « … attendait dans un salon … » (`endedCallSentence`), sans bouton ; la fenêtre suit aussi un changement de format. Un seul relevé par page, toutes les 20 secondes, que se partagent le pop-up et la liste du QG (`src/components/compte/appels.ts`). Un visiteur sans session ne déclenche aucun appel ; un compte pas encore validé ou suspendu reçoit un refus, et la page s'arrête aussitôt de demander (`isFinalRefusal`). Un appel fermé ne revient pas d'une page à l'autre ; un appel resté ouvert revient sur la page suivante, mais ne sonne et n'est annoncé qu'une fois par onglet (`sessionStorage`). Le site ne lit rien chez OpenFront : demandé d'abord comme une détection automatique des tags dans les salons, impossible et interdit, voir `docs/API_AUDIT.md`, « Salons en attente ».
  - **Ce que garde le serveur :** l'identifiant de la partie, de 8 à 10 lettres et chiffres comme dans le jeu, jamais l'adresse collée ; le site refait l'adresse `https://openfront.io/game/<id>` (`lobbyIdOf`, `lobbyUrl`), car openfront.io ne lit que cet identifiant pour rejoindre (`docs/API_AUDIT.md`, « Salons en attente »). Un appel par membre, montré 15 minutes au plus ou jusqu'à `end_lobby_call` ; un nouveau salon une fois par minute au plus, car chaque appel fait sonner le QG des autres. La table `internal.lobby_calls` n'est pas sauvegardée : `get_lobby_calls` et `save_lobby_call` effacent les appels finis.
  - **Ce que voient les membres :** le pseudo d'aujourd'hui de celui qui appelle, retrouvé comme pour les visages, sinon le nom du compte ; sa photo seulement s'il a choisi de se montrer. Appeler, c'est se montrer le temps de l'appel : le formulaire le dit.
  - **Les formats :** Duos, Trios, Quads, 2 à 7 équipes, salon privé. Pas de chacun pour soi : le jeu y cache les tags (`disableClanTags`) et y retire son propre bouton de copie, et ses conditions y interdisent toute entente arrangée hors de la partie (section 6.2). En Duos, Trios et Quads, l'appel rappelle la taille des équipes, 2, 3 ou 4 : le jeu met un clan entier dans une seule équipe et passe en spectateurs ceux qui n'y tiennent pas. Le site ne sait pas qui a déjà rejoint : il ne parle pas de places libres. Un salon privé ne compte pas au classement des clans, et l'appel le dit.
  - **Le navigateur** relit les appels toutes les 20 secondes, et dès que l'onglet redevient visible ; en arrière-plan, il peut espacer ses relectures jusqu'à une minute. Sur téléphone, un onglet en arrière-plan ou un écran éteint est gelé : ni appel ni son jusqu'au retour, ce que le QG dit. Le son attend un geste du membre sur la page, comme l'exigent les navigateurs : la fin d'un toucher, un clic ou une touche, écoutés jusqu'à ce que le son soit prêt ; au doigt, le début d'un toucher ne suffit pas. Il se coupe d'un bouton, au QG ou dans le pop-up. Ce choix et les appels fermés restent dans le seul navigateur du membre (`localStorage`). Le titre de l'onglet compte les appels en attente, sans clignoter.
  - **Le pop-up** est rendu à la fin de `<body>`, hors de `<main>` : la page et son pied de page ont chacun leur plan (`z-index: 1`), et le pied de page le recouvrait en bas de page. Tant qu'il est ouvert, la page réserve sa hauteur en bas (`scroll-padding-bottom` et marge du `<body>`) : l'élément qui a le focus et le pied de page ne passent jamais dessous (WCAG 2.2, 2.4.11). Il ne prend pas le focus ; Échap le ferme, après les menus de l'en-tête. Sa hauteur ne dépasse jamais l'écran : au-delà, il défile, croix comprise. Il passe au-dessus des ondes du fond (`z-index` 65), garde un fond plein et une bordure pour le mode contraste élevé, et sa zone d'annonce aux lecteurs d'écran est toujours dans la page, même vide.
- **Décisions :** les sondages ouverts, où l'on vote, puis les 30 derniers fermés avec leur résultat. Les sondages ne sont plus sur l'accueil : `get_site_news` ne les donne plus, leurs totaux ne sortent qu'au QG.
- **Événements à venir :** comme sur l'accueil, avec « Je viens » et, en plus, les membres qui viennent parmi ceux qui ont choisi de se montrer (12 au plus par événement). Les autres ne sont que comptés : « et 3 autres membres ».
- **Boîte à idées :** un membre validé propose une idée de 10 à 500 caractères, sous son nom, trois à l'étude au plus (`save_idea`). Les autres la soutiennent (`support_idea`) : le site montre le nombre de soutiens, jamais qui soutient. L'encadrement tranche, au QG même : retenue, écartée ou faite, avec un mot facultatif de 300 caractères (`decide_idea`).
  - L'auteur retire son idée quand il veut. L'encadrement peut retirer celle d'un autre (`delete_idea`). Le journal note qui a tranché ou retiré l'idée de qui, jamais le texte : ce journal ne s'efface pas.
  - Une idée part avec le compte de son auteur. Les idées d'un compte suspendu ne sont plus montrées, et ses soutiens ne comptent plus.
  - Les idées et leurs soutiens sont dans des tables privées, `internal.ideas` et `internal.idea_supports`, que l'API ne montre pas.
- **Le mur des membres :** ceux qui ont choisi de se montrer, l'encadrement d'abord, avec le nombre de comptes validés.
- **En vue joueur,** l'encadrement voit le QG sans les commandes de décision. Le serveur garde le vrai rôle.

Le contrôle `npm run verifier:ligne` vérifie qu'un visiteur n'entre pas dans le QG.

## L'espace Direction : `/direction`

- **En onglets, depuis le 10 novembre 2026 :** Vue d'ensemble, Annonces, Événements, Sondages, Mot d'accueil, Gaulois de la semaine, et Fondateur pour le fondateur seul. Au-dessus : le nom, les liens vers le QG et Mon compte, et « Voir le site comme un joueur ».
- **En rouge :** `/direction` a le thème rouge de l'encadrement ([DESIGN.md](DESIGN.md), « Thème rouge de l'encadrement »), comme les onglets de l'encadrement au QG, pour qu'on sache où l'on est. Seul l'affichage change. La page reste rouge pour tout visiteur, y compris en vue joueur, où elle est fermée comme pour un membre.
- **Ce qui attend une décision**, dans la vue d'ensemble : demandes à traiter, membres validés, encadrement, suspendus. Chaque case mène à l'onglet du QG où l'on décide (`/qg#demandes`, `/qg#comptes`). L'onglet Vue d'ensemble compte les demandes qui attendent.
- **État du site :** la dernière collecte publiée, chaque source de l'API d'OpenFront (à jour, en retard ou en échec, avec l'erreur), la dernière relecture de la liste officielle et le dernier envoi de la gazette sur Discord.
  - Tout vient de `data/meta.json`, de `data/gazette-envoi.json` et du serveur. Les délais sont ceux des pages du site (`src/lib/freshness.ts`).
  - L'âge se calcule dans le navigateur, chaque minute. Si la collecte ou la mise en ligne s'arrête, la page n'est plus reconstruite, mais elle vieillit à l'écran et le signale. Laquelle des deux s'est arrêtée se lit dans l'onglet **Actions**.
  - La gazette est donnée sans jugement de retard. Un fichier d'envoi absent ou illisible donne « aucun envoi noté ».
  - Le calcul est dans `src/lib/etat-site.ts`.
- **Annonces et événements :** publiés sans passer par GitHub, visibles aussitôt sur l'accueil, même sans compte. Ils s'ajoutent à ceux de `content/*.json`, qui restent valables. Si le serveur ne répond pas, l'accueil garde ceux du dépôt.
  - **Répéter chaque semaine :** un nouvel événement peut revenir de 2 à 12 semaines, à la même heure de Paris, changement d'heure compris (`save_event_series`). Chaque rendez-vous est un événement ordinaire, qui se modifie ou se supprime seul et garde ses propres réponses. L'accueil n'en montre que le prochain, avec « Encore 4 rendez-vous, jusqu'au … » : ce texte reste juste même si un rendez-vous est déplacé ou supprimé.
  - **« Je viens » :** sur l'accueil, un membre validé connecté répond pour lui-même, seulement à un événement à venir (`set_attendance`). Tout le monde voit le nombre ; l'espace Direction donne les noms (`list_event_attendance`). Les réponses sont dans une table privée, `internal.event_attendance`, que l'API ne montre pas. Un compte suspendu n'est ni compté ni nommé. Les événements du dépôt n'ont pas de réponses.
- **Sondages :** une question et de 2 à 6 choix, avec une fin facultative dans les 90 jours (`save_poll`). Trois sondages ouverts au plus : le QG, seul endroit où l'on vote, les montre tous, avant les sondages fermés.
  - Les membres validés votent au QG, une voix chacun, qu'ils peuvent changer tant que le sondage est ouvert (`vote_poll`).
  - Seuls les membres validés voient les totaux, jamais qui a voté quoi : les voix sont dans une table privée, `internal.poll_votes`, et aucune fonction ne le donne. La voix d'un compte suspendu ne compte plus.
  - Un sondage fermé, à la main ou par sa date, garde son résultat au QG, dans les décisions passées. Le supprimer efface ses votes. Un sondage ne se modifie pas : cela fausserait les voix déjà données.
  - Un sondage dont les totaux seraient illisibles n'affiche aucun résultat, plutôt qu'un « 0 voix » faux.
- **Mot d'accueil :** un texte de l'encadrement, de 2 000 caractères au plus, que chaque membre validé lit en haut du QG (`save_welcome` ; `get_welcome` le relit pour l'encadrement). Un texte vide l'efface. C'est un texte commun : tout l'encadrement, officiers compris, peut le réécrire.
- **Gaulois de la semaine :** l'encadrement, officiers compris, choisit un membre de la liste officielle pour la semaine en cours, du lundi au dimanche à Paris, avec un mot facultatif de 300 caractères (`save_weekly_pick`), et peut retirer le choix que l'accueil montre, de cette semaine ou de la précédente (`delete_weekly_pick`). Le serveur n'accepte qu'un pseudo de `clan_roster`, sans homonyme. L'accueil le montre à tous, sous le podium de « Les Gaulois de la semaine », jamais le nom de qui l'a choisi (`get_site_news`, case `weekly_pick`) : toute sa semaine, et la suivante tant qu'aucun autre n'est choisi, avec sa semaine écrite. Un joueur qui n'est plus dans la liste publique (parti, ou pseudo retiré) n'est pas affiché, comme dans la gazette. Les choix passés restent dans la table et les sauvegardes ; en retirer un ancien se fait dans l'éditeur SQL. Le journal note qui a choisi ou retiré qui, jamais le mot. Les choix sont dans une table privée, `internal.weekly_picks`, et dans la sauvegarde (`export_site` version 3).
- Les brouillons des sondages et du mot d'accueil survivent, eux aussi, à un aller-retour en vue joueur.
- **Transmettre le rôle de fondateur :** visible du fondateur seul. Il faut retaper le nom de la personne. L'ancien fondateur devient admin.
- **Voir le site comme un joueur :** le bouton en haut de l'espace montre tout le site comme à un membre sans grade : plus de lien « Direction » dans l'en-tête, plus de boutons de l'encadrement dans `/compte`, plus d'onglets de l'encadrement au QG, et `/direction` fermé comme pour un membre. Une bande en haut de chaque page le rappelle et permet d'en sortir.
  - Seul l'affichage change : le serveur garde le vrai rôle. Un bouton de membre agit pour de vrai : « Effacer mon compte » efface le compte d'un officier ou d'un admin, et le serveur le refuse au fondateur.
  - Le choix reste dans le navigateur (`gal-vue-joueur`) jusqu'à la sortie ou la déconnexion, y compris quand la session se perd seule (jeton révoqué, déconnexion sur un autre appareil). Il vaut pour les pages ouvertes ensuite, dans tous les onglets : une page déjà ouverte ailleurs garde sa vue jusqu'à son prochain chargement, pour ne pas fermer un formulaire en cours. Les brouillons d'annonce et d'événement survivent à un aller-retour.

Une annonce parle au nom du clan : le nom de son auteur n'est pas public, seuls l'encadrement et le journal le connaissent.

## L'administration, au QG

Depuis le 10 novembre 2026, à la demande du pilote, l'administration est dans les onglets de l'encadrement du QG (`src/components/compte/AdminPanels.tsx`), aux couleurs du thème rouge. L'ancienne adresse `/admin` reste, pour les liens déjà donnés et les retours de connexion : elle mène à `/qg#demandes` en gardant la suite de l'adresse (`/admin#comptes` ouvre les comptes). L'onglet s'appelle « Comptes » et non « Membres » : l'onglet de rubrique « Membres », juste au-dessus, mène à la page publique.
- **Si le QG ne se lit pas** (`get_qg` en panne), ses parties de membre s'effacent et un message le dit, mais les salons et les onglets de l'encadrement restent : on peut toujours valider un membre. Après une action, si la relecture échoue, l'écran garde l'état d'avant et le dit à l'endroit de l'action.

- **Demandes :** valider ou refuser, avec une raison facultative.
  - De la plus ancienne à la plus récente, chacune dit depuis combien de temps elle attend. Au-delà de 2 jours, elle passe en jaune (`src/lib/compte/requests.ts`).
  - Des raisons de refus toutes prêtes (« Pas reconnu sur Discord. »…) remplissent le champ sans rien envoyer : on peut les compléter. La raison d'un refus est montrée telle quelle au membre, dans `/compte`. Une validation n'en montre aucune.
  - La durée d'attente se recalcule chaque minute. L'écran montre au plus les 200 demandes les plus anciennes, ce que le serveur renvoie.
- **Membres :** rôles, suspensions et rétablissements. Un rôle choisi dans la liste ne part qu'après « Confirmer » : au clavier ou d'un doigt, on choisit vite un autre rôle par erreur. Après « Confirmer » ou « Annuler », le focus revient à la liste du rôle.
  - **Le nom « Gaulois n° … » :** celui de tout compte jusqu'à sa validation. Le compte prend alors le pseudo de sa demande dans la liste officielle. Validé hors de la liste, ou membre sans pseudo public, il garde ce nom : un compte validé ne peut plus lier son profil OpenFront, sauf par « Refaire la demande », plus bas. Une ligne sous le tableau le rappelle, avec la date de la dernière relecture de la liste.
  - **La colonne « Liste » :** le profil OpenFront n'est lié qu'à la validation. Un compte validé y lit « Oui » si ce profil est dans la liste du jour, « Plus dans la liste » s'il y figurait sous un pseudo le jour de sa demande, et « Pas trouvé dans la liste » sinon, y compris sans aucun lien, comme après une restauration de la sauvegarde.
    - « Pas trouvé » et non « absent » : une demande que la liste n'a pas reconnue garde l'empreinte du texte tapé, souvent un pseudo, alors que la liste ne garde que celle de l'identifiant public. Un compte validé hors de la liste n'y est donc jamais retrouvé, même si le joueur entre dans le clan ensuite. Le journal note une telle validation, « hors de la liste officielle », sauf quand la personne valide sa propre demande, comme le fondateur à l'installation.
    - Un compte en attente y lit « Demande à traiter » ou « Aucune demande en cours », d'après les demandes ouvertes, relues avec la liste des comptes. La case écrit « — » tant qu'elles ne sont pas lues, si leur lecture échoue (un message le dit, avec « Réessayer »), et, quand le serveur renvoie son maximum de 200 demandes, pour un compte qui n'en a aucune parmi elles.
    - Le calcul est dans `src/lib/compte/admin-members.ts`. Sur téléphone, le tableau défile de côté dans son cadre, sans couper les mots.
  - Jusqu'au 9 novembre 2026, cette colonne écrivait « — » pour tout compte en attente, et « Plus dans la liste » pour tout compte validé qu'elle ne trouvait pas dans la liste, même s'il n'y avait jamais figuré.
  - **Refaire la demande**, pour les admins et le fondateur, depuis le 9 novembre 2026 (migration `20261109000400_refaire_la_demande.sql`, fonction `reset_member_link`). Sur un compte validé « Pas trouvé dans la liste », ce bouton le remet en attente, après une question qui dit ce qui va changer.
    - Le lien avec OpenFront est défait, le nom redevient « Gaulois n° … », et le QG se ferme jusqu'à la nouvelle validation. Comme pour une suspension, tant que le compte attend, ses voix, ses « Je viens », ses idées et ses soutiens ne comptent plus et ne s'affichent plus ; rien n'est effacé, et ils comptent de nouveau après sa validation.
    - Un rôle de l'encadrement est retiré, et la question le dit avant : sinon, il reviendrait tout seul à la validation, sans que l'officier qui valide le voie. Il se redonne ensuite, comme tout rôle. Le journal note ce retrait comme un changement de rôle.
    - Le message qui suit dit qui prévenir sur Discord, et le focus y va. Dans « Mon compte », la personne lit que l'encadrement lui demande de refaire sa demande, avec son pseudo exact, tel qu'il apparaît sur la page Membres, ou son identifiant public si elle y figure comme « Membre anonyme » : un membre sans pseudo public n'est retrouvé que par lui. Sa nouvelle demande arrive dans l'onglet Demandes, comme une autre, et suit le chemin ordinaire jusqu'à un officier.
    - Le serveur refuse un compte que la liste trouve (`member_in_roster`), un compte qui n'est pas validé, son propre compte, et, comme pour une suspension, un rang égal ou supérieur au sien. Sous le tableau, une phrase explique la case, et ne parle du bouton que s'il est à l'écran ; sinon, elle dit qui peut le faire.
    - Le journal note « a remis … en attente, pour une nouvelle demande », avec le nom du moment s'il a changé depuis.
    - Le bouton s'offre aussi à un membre sans pseudo public qui a quitté le clan, que le site ne distingue pas d'un compte validé hors de la liste. Son lien était juste : le remettre en attente le défait. Enjeu faible, puisqu'il n'est plus dans le clan.
- **Journal**, pour les admins et le fondateur : une phrase par action, la plus récente d'abord, par exemple « Chef a changé le rôle de Recrue : Membre → Officier ». Les détails viennent du serveur (rôles, raison, titre, date d'un événement) : un détail absent n'est pas écrit, et un code sans libellé s'affiche tel quel. Le serveur note de la même façon une publication et une modification, d'où « a publié ou modifié ». Filtres par personne (qui agit ou qui est visé) et par type d'action. L'écran lit les 500 dernières entrées, le maximum du serveur, et en montre 50 à la fois. Les phrases sont dans `src/lib/compte/admin-log.ts`, et un test vérifie que chaque action notée par le serveur du site a la sienne.

## Prévenir l'encadrement sur Discord

Le robot horaire signale les demandes d'adhésion qui attendent, sur un salon Discord **privé** de l'encadrement (`scripts/prevenir-encadrement.ts`, `src/lib/encadrement-discord.ts`).

- **Quand :** une nouvelle demande déclenche un message au passage suivant du robot, dans l'heure. Une demande qui attend depuis plus de 24 h vaut un rappel, une fois par jour au plus. Rien entre 23 h et 8 h, heure de Paris, comme les alertes de place.
- **Quoi :** « 2 demandes d'adhésion attendent sur le site du clan. La plus ancienne attend depuis 3 jours. », avec le lien de l'onglet des demandes au QG (`/qg#demandes` ; avant le 10 novembre 2026, `/admin`, qui y mène toujours). Ni nom, ni identifiant, ni mention : personne n'est appelé.
- **La mise en service :** au premier passage de jour du robot où rien n'a encore jamais été noté, s'il n'y a aucune demande à annoncer, un message part : « L'avis à l'encadrement est en place… ». Il prouve que le lien marche et que c'est le bon salon, sans attendre une vraie demande. Il est noté avant l'envoi : il part une fois au plus, et si Discord le refuse, l'exécution du robot l'affiche en avertissement, sans le renvoyer. Changer ensuite le lien pour un autre salon ne le renvoie pas.
- **Les sauvegardes :** le même salon reçoit le compte rendu de chaque sauvegarde chiffrée (voir plus bas).
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
- sondages avec leurs seuls totaux, et mot d'accueil ;
- idées de la boîte à idées, avec le seul nombre de leurs soutiens, et le choix de chacun de se montrer.

L'export (fonction `export_site`, réservée à la clé de service) ne garde que le nécessaire :

- **Des votes, les totaux par choix seulement.** Personne n'apprend qui a voté quoi, pas même avec la phrase de passe. Après une restauration, les sondages reviennent sans leurs voix individuelles.
- **Des soutiens aux idées, le nombre par idée seulement,** pour la même raison.
- **Ni l'empreinte du `publicId` OpenFront, ni les textes libres d'une demande** (ce que le joueur a tapé, son mot pour l'officier). Avec l'API publique, ils pourraient lever l'anonymat d'un membre anonyme si la phrase était devinée. Après une restauration, le lien avec le profil OpenFront est perdu : au QG, onglet Comptes, un tel compte validé s'affiche « Pas trouvé dans la liste », et « Refaire la demande » le remet en attente, pour que la personne refasse sa demande. Le fondateur, que personne ne peut remettre en attente, l'est dans l'éditeur SQL, avant de refaire sa demande.
- **Ni les rôles prévus**, qu'on ne lit que dans l'éditeur de Supabase, **ni la liste officielle**, qui se relit, **ni les tables de l'ancien jeu**.
- **Ni les comptes de connexion eux-mêmes** (`auth.users`, gérés par Supabase). Si le projet est perdu, chacun se reconnecte avec Discord, et l'encadrement retrouve rôles et données par l'identifiant Discord de `private_links`.

Comment elle est gardée :

- **Chiffrée avant de sortir :** AES-256-GCM, avec une clé tirée de la phrase de passe par scrypt, réglé lent exprès (N = 2^18) pour qu'une phrase coûte cher à deviner (`src/lib/sauvegarde.ts`). Le fichier porte ses réglages, et tout son en-tête est authentifié : une seule lettre changée le rend inutilisable.
- **Gardée 90 jours** par GitHub, dans l'exécution de l'Action, sous **Artifacts**. Le dépôt est public : n'importe quel compte GitHub peut télécharger ce fichier, illisible sans la phrase. Rien n'est écrit en clair, ni sur le disque de l'Action ni dans le dépôt. Le journal de l'Action ne donne que le nombre de lignes de chaque table.
- **Sans phrase de passe dans GitHub,** le robot ne lance aucune sauvegarde et l'affiche en avertissement à chacun de ses passages, sur la page de l'exécution, sans qu'il faille ouvrir le journal. Lancée à la main, l'Action ne sauvegarde rien et l'affiche aussi.
- **Lancée par le robot horaire :** le planning de GitHub saute la plupart de ses passages sur ce dépôt (les 6, 7 et 8 novembre 2026, quatre exécutions planifiées sur vingt-quatre ont démarré chaque jour, et la première sauvegarde du lundi n'a pas eu lieu). Le job `sauvegarde-de-la-semaine` de `site.yml` regarde donc à chaque passage du robot si la semaine a son fichier gardé, la semaine commençant le lundi à 7 h UTC (8 h à Paris en hiver, 9 h en été, après les heures de silence). Sinon, il lance l'Action. Une sauvegarde ratée est relancée au passage suivant, avec trois essais au plus dans la semaine, lancements à la main compris ; au-delà, l'exécution du robot l'affiche en avertissement, et il attend le lundi suivant. Une sauvegarde restée plus d'une heure en file d'attente est signalée aussi (`src/lib/sauvegarde-relance.ts`).
- **Les droits de ce job :** le seul droit Actions de GitHub, qui permet de lancer une exécution, mais aussi d'en annuler ou d'en effacer une avec ses fichiers. Il ne peut pas écrire dans le dépôt, et le job qui travaille sur `data/` n'a pas ce droit sur les sauvegardes. La phrase ne passe pas par lui : seulement le fait qu'elle existe.
- **Sur demande :** onglet **Actions → Sauvegarde chiffrée → Run workflow**. Une sauvegarde faite à la main compte pour sa semaine.
- **Le compte rendu :** à la fin d'une exécution, le salon privé de l'encadrement reçoit l'un de trois messages, sans nom ni donnée personnelle (`src/lib/sauvegarde-discord.ts`) :
  - « Sauvegarde chiffrée faite le… GitHub la garde jusqu'au… » ;
  - « …n'a rien gardé : la phrase de passe ou un autre réglage manque… » ;
  - « …a échoué… », avec le lien de l'exécution.

  Une exécution finie entre 23 h et 8 h n'a pas de compte rendu, et il n'est pas reporté au matin. Une exécution annulée ou arrêtée par son délai n'en a pas non plus. Le robot lance celle de la semaine de jour. Sans le secret `DISCORD_WEBHOOK_ENCADREMENT`, il n'y a pas de compte rendu, et un envoi raté ne fait pas échouer la sauvegarde.

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
| Voir le nombre de présents à un événement | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Demander sa validation | | ✓ | | | | |
| Entrer au QG : sondages et totaux, idées, mur, mot d'accueil | | | ✓ | ✓ | ✓ | ✓ |
| Répondre « Je viens », voter, proposer ou soutenir une idée, se montrer aux autres membres | | | ✓ | ✓ | ✓ | ✓ |
| Retirer sa propre idée | | | ✓ | ✓ | ✓ | ✓ |
| Voir les appels aux salons, prévenir les Gaulois de son salon, retirer son appel | | | ✓ | ✓ | ✓ | ✓ |
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
2. Faire sa demande dans `/compte`, se désigner fondateur, valider sa propre demande au QG, onglet Demandes (détail à l'étape 4 de l'installation), puis ouvrir `/direction`.
3. Publier une annonce, puis la voir sur l'accueil dans une fenêtre privée.
4. Connecter un second compte, faire une demande et la valider.

## Ce qui n'a pas été vérifié

- **L'espace Direction et un second compte sur le vrai Supabase.** La connexion Discord, elle, a été essayée le 6 novembre 2026 : `on_auth_user_updated` remplit bien le nom et l'identifiant depuis `auth.identities`. Le nom gardé est le nom d'utilisateur Discord, pas le nom affiché.
- **Un vrai téléphone, Firefox et Safari.**
- **La vue joueur avec un vrai compte de l'encadrement.** Le 8 novembre 2026, elle n'a été essayée qu'avec un faux serveur, dans un vrai navigateur : bouton, bande, en-tête, `/compte`, `/direction` et `/admin`.
- **L'avis à l'encadrement, pour une vraie demande.** Le secret `DISCORD_WEBHOOK_ENCADREMENT` est posé. Le 9 novembre 2026 à 12:53 UTC, le robot a envoyé le message de mise en service : Discord l'a accepté, sans avertissement, et `app_state` l'a noté. Un message de demande n'est pas encore parti, faute de demande.
- **La sauvegarde chiffrée, elle, a été vérifiée de bout en bout.** Le 9 novembre 2026 :
  - le secret `SAUVEGARDE_CLE` a été posé, et l'Action lancée à la main a gardé `sauvegarde-2` ;
  - la direction a rouvert ce fichier avec la phrase telle qu'elle l'a rangée (`npm run sauvegarde:verifier`) ;
  - à 12:53 UTC, le robot a lancé lui-même la sauvegarde de la semaine (`sauvegarde-3`), et son compte rendu est parti sur le salon de l'encadrement, sans avertissement.

  Le compte rendu d'une sauvegarde ratée n'a pas encore servi.
- **Le QG.** Le 9 novembre 2026, il n'a été essayé qu'avec un faux serveur, dans un vrai navigateur : la porte, un compte en attente, un membre, l'encadrement. Sa migration (`20261109000100_qg_des_membres.sql`) n'a tourné sur aucun Postgres avant le vrai projet. Le nom du champ où Discord donne la photo (`avatar_url`, sinon `picture`) n'a pas été lu sur le vrai projet : si une photo manque au premier essai réel, c'est là qu'il faut regarder. D'ici là, l'initiale s'affiche.
- **Les appels aux salons.** Le 9 novembre 2026, essayés seulement avec un faux serveur, dans Chromium, à 1 280, 375 et 360 px : 41 contrôles, dont le lien d'un autre site refusé, l'envoi de l'identifiant seul, le pop-up et ses deux notes, la croix et Échap, le rechargement, l'appel fini, le son coupé, le bas de page (pop-up au-dessus du pied de page, pied de page fini au-dessus du pop-up), le bouton atteint au clavier jamais caché dessous, aucun défilement horizontal et axe sans erreur. Le son n'a été que compté, pas écouté. Sa migration (`20261109000300_appels_aux_salons.sql`), et le fichier collé dans l'éditeur SQL, ont tourné le même jour sur PGlite (Postgres compilé pour le navigateur et Node), avec des copies simplifiées de ce qu'elle utilise du schéma (`require_rank`, `fail`, `profiles`, `private_links`, `clan_roster`) : 26 contrôles, dont les droits des visiteurs, les refus, la minute entre deux salons, retirer puis relancer, le compte suspendu et l'effacement des appels finis. Ces copies ne sont pas les vraies fonctions : le premier essai réel reste à faire. Aucun lien de salon réel d'OpenFront n'a été ouvert : le format `https://openfront.io/game/<id>` vient du code du jeu (`ClientEnv.gamePath`, `CopyButton.ts`), commit `ac60675`.
  - **Installée le 9 novembre 2026 au soir,** collée par le pilote dans l'éditeur SQL, avec la ligne de `supabase_migrations.schema_migrations`. Un second « Run » a répondu « relation lobby_calls already exists », sans effet : la transaction s'arrête à sa première ligne. Une requête en lecture seule, collée par le pilote, a confirmé l'installation : les trois fonctions, dans la version à 8 à 10 caractères, la ligne de la migration, aucune fonction ouverte aux visiteurs, les trois ouvertes aux comptes connectés, la RLS active sur `internal.lobby_calls`. Le contrôle par la CLI (`migration list`) et `verifier:ligne` ont été refusés à Claude ce soir-là (lecture du vrai projet).
  - **Sur toutes les pages,** le 10 novembre 2026, essayé de même avec un faux serveur, dans Chromium : 34 contrôles. Un visiteur sans session ne demande rien sur une page sans annonces publiques ; un compte en attente reçoit un seul refus, puis plus aucune demande ; un membre validé voit le pop-up sur l'accueil, le classement et le QG, avec ses deux notes et le titre de l'onglet ; un appel fermé ne revient pas sur la page suivante ; au QG, un seul pop-up par appel ; « Couper le son » du pop-up coupe aussi le bouton du QG ; Échap ; bas de page ; à 375 et 360 px, un seul pop-up, une croix de 44 px, aucun défilement horizontal ; axe sans erreur partout. Le même jour, après l'alerte donnée à celui qui appelle : 45 contrôles, dont l'envoi du formulaire du QG, la fenêtre « Votre appel est lancé » avec son lien et ses deux notes, et axe sans erreur.
- **Refaire la demande.** Le 9 novembre 2026, sa migration (`20261109000400_refaire_la_demande.sql`) a tourné sur PGlite après les 19 autres, les vraies, dans l'ordre : seuls `auth`, `storage` et les rôles de Supabase étaient simulés. Les contrôles portent sur chaque refus, la remise en attente, le rôle retiré et sa ligne au journal, une nouvelle demande trouvée dans la liste puis validée par un officier, et les droits des visiteurs. Le fichier collé dans l'éditeur SQL a tourné aussi, sur une base où les 19 autres migrations étaient installées, avec un second « Run » qui s'arrête sans rien abîmer. L'écran n'a été essayé qu'avec un faux serveur, dans Chromium. Le premier essai réel reste à faire.
  - **Installée le 9 novembre 2026 au soir,** collée par le pilote dans l'éditeur SQL : l'installation par la CLI (`db push`) a été refusée à Claude. `migration list` montre la migration des deux côtés, `verifier:ligne` passe avec la clé publique (« Un visiteur ne remet pas un compte en attente »), et le serveur répond à un visiteur « permission denied for function reset_member_link » : la fonction existe, fermée aux visiteurs.
- **Le Gaulois de la semaine et les visages au pseudo d'aujourd'hui.** Le 9 novembre 2026, ils n'ont été essayés qu'avec un faux serveur, dans un vrai navigateur. Leur migration (`20261109000200_gaulois_de_la_semaine.sql`) n'a tourné sur aucun Postgres avant le vrai projet : `npm run verifier:ligne` dit si elle est installée (« Le Gaulois de la semaine est installé ») et fermée aux visiteurs.
- **Les événements répétés, « Je viens », les sondages et le mot d'accueil.** Le 8 novembre 2026, ils n'ont été essayés qu'avec un faux serveur, dans un vrai navigateur. Leur migration (`20261108000200_vie_du_clan.sql`) est installée sur le vrai projet, et ses droits contrôlés en lecture seule ; les fonctions elles-mêmes n'y ont pas encore servi.
- **La confirmation d'un rôle, l'attente des demandes et les raisons toutes prêtes.** Le 8 novembre 2026, ils n'ont été essayés qu'avec un faux serveur, dans un vrai navigateur.
- **Le journal en phrases, la pastille et l'état du site.** Le 8 novembre 2026, ils n'ont été essayés qu'avec un faux serveur, dans un vrai navigateur. La fonction de la pastille a été installée sur le vrai projet, et ses droits contrôlés en lecture seule.
- **Le thème rouge sur les écrans connectés.** Le 8 novembre 2026, axe n'a trouvé aucun défaut sur `/direction` et `/admin` connectés, sur bureau et téléphone, mais avec un faux serveur. Le 10 novembre 2026, de même pour chaque onglet du QG et de la Direction après leur passage en onglets, avec en plus le clavier, les adresses d'onglet et les largeurs de 360 à 1 920 px. Aucun vrai compte n'a servi. Les tests automatiques, construits sans serveur de connexion, ne voient de ces pages que la carte « connexion pas ouverte ».
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

Enfin, au QG, onglet **Demandes** (`/qg#demandes`), validez votre propre demande : votre pseudo OpenFront devient votre nom sur le site.

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

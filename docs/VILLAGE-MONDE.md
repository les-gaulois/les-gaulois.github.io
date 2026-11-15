# Le monde du village des Gaulois

Le détail du lot 7 du village des Gaulois (résumé dans `docs/DIRECTION.md`, « Le village des Gaulois »). Demandé par le
pilote le 14 novembre 2026, après une liste d'idées de Claude Fable 5.2 : « le village qui se bâtit tout seul », « le grand
feu », « la forge aux souvenirs », puis « un vrai univers où les persos se déplacent sans avoir à changer de page, un grand
écran immersif, sans page ». Au fil de la journée, il a ajouté : un ciel au maximum de détail (« ça doit être immersif »),
des Gaulois et des bâtiments plus petits, de la place jusqu'à 1 000 Gaulois avec un moteur fluide pour 250 à 350, des
éléments d'OpenFront (bateaux, train, usine à armes, missile, « tir et explosion, le missile monte exploser »), puis une
perspective juste (« B, les terrasses »), des maisons qui ne soient pas « des carrés » et de meilleurs arbres.

Design et graphisme par Claude Fable 5.2, code par Claude Opus 5.5 (règle du pilote pour le village). Chaque partie
ci-dessous est le compte rendu de l'agent qui l'a faite ; une étape plus récente d'un même agent dit ce qu'elle remplace.

## Ce qui est réglé, en bref

- **Le chantier** (`src/lib/village/chantier-liste.ts`, calcul `chantier.ts`) : 15 bâtiments de 100 à 3 000 points
  rapportés au clan, 14 400 en tout, comptés depuis le 1er novembre 2026 à minuit, heure de Paris, sur le score positif
  des sessions publiques du clan (`data/sessions/`). Mesure du 14 novembre 2026 : 1 064 points depuis le 1er novembre,
  2 039 en octobre ; le village entier demande environ sept mois au rythme d'octobre.
- **Le grand feu** : les points rapportés au clan sur les 7 × 24 heures qui finissent au relevé ; seuils 100, 175, 325 et
  475 (des braises, un petit feu, un beau feu, un grand feu, un feu de joie), tirés des semaines passées du clan.
- **La forge** : 150 statères par gravure, une plaque par objet ; un objet gravé ne se vend pas au marché ; les autres
  membres ne voient une plaque que si le pseudo du compte est public.
- **Les pièces d'OpenFront** (`src/lib/village/openfront/`) : dessins originaux des idées du jeu, jamais ses images, son
  logo ni ce qui vient de son CDN ; combats de dessin animé (tirs, obus, explosions sur le camp du clan inventé en violet),
  sans sang, sans victime et sans éclair blanc qui clignote.
- **Rien n'est du temps réel** : chantier et feu « au dernier relevé » des sessions, dont l'heure est écrite ; « pas de
  données » n'est jamais zéro.

## Mise en ligne

1. Le pilote colle `.cache/a-coller-forge.sql` (refait par `npx tsx scripts/a-coller-forge.ts`) dans l'éditeur SQL de
   Supabase ; dernière ligne : « forge : installée ». Avant, la fenêtre de la forge dit que le serveur ne répond pas, et le
   reste du village marche.
2. Publier le site : `/village` devient le monde, `/village/monde.json` publie l'état du chantier et du feu.
3. Le pilote remet la fonction `code-discord` en ligne
   (`npx supabase functions deploy code-discord --remote=zxavwcupauheheqxfdez --use-api --no-verify-jwt --yes`) :
   `/feu` s'inscrit seule, sans Reset Token ; `/etat` dit `"feu":true` une fois `/village/monde.json` lisible.
4. Le premier passage du robot note les bâtiments déjà finis sans les annoncer ; le prochain fini part sur Discord.

## Le monde : l'écran immersif

### Le monde du village : un seul écran (14 novembre 2026)

Demandes du pilote : « un vrai univers où les persos se déplacent sans avoir à changer de page, un grand écran immersif,
sans page » ; puis « je veux un maximum de détail, ça doit être immersif » ; puis, après les premières planches : « les
Gaulois sont trop gros, ainsi que les bâtiments », « un monde vivant qui pourra accueillir jusqu'à 1000 membres gaulois »,
« des éléments OpenFront, bateaux, usine, train, missile […] tir et explosion ». `/village` n'a plus d'onglets : c'est un
monde en pixels qui remplit la fenêtre sous l'en-tête, où l'on se promène dans les deux sens, de plus ou moins près, et
où les fenêtres s'ouvrent par-dessus. Design et écran : Claude Fable 5.2.

- **Le plan** (`src/lib/village/monde/plan.ts`) : une colline vue de face, en étages, à l'échelle des Gaulois (48 × 64).
  Du haut vers le bas : le ciel et les lointains ; les **terrasses** (des rues de maisons) ; la **grand-rue** (la lisière,
  le ruisseau, le rempart, les maisons, la place et le grand feu, la taverne, la forge, la salle de réunion, le marché,
  la palissade, le poste de défense, le champ de bataille, le camp d'en face) ; le **bas** (la voie ferrée et son viaduc
  sur le ravin du ruisseau, la gare, l'usine, le silo, la batterie, le port et la mer à l'est). Tout dépend du seul
  nombre de Gaulois du village, de 0 à 1 000 : le même nombre donne le même monde. Une maison de 4 lits par tranche de 4
  Gaulois (trois au moins) ; les trois premières sont sur la grand-rue, les suivantes garnissent les terrasses, du milieu
  vers les côtés, en laissant passer les escaliers ; une terrasse de plus quand la précédente est pleine. Les terrasses
  courent sur toute la largeur du monde (le pilote, 14 novembre 2026 : deux étages de maisons de moins) : une seule
  jusqu'à une centaine de Gaulois, trois de plus de quatre-vingts maisons pour 1 000. Les places de maison encore
  libres de la terrasse entamée sont des jardins (`plan.jardins`), que les maisons remplaceront. La terrasse de tables de la taverne, les bancs de la salle de réunion et le pré du champ de
  bataille grandissent avec le village (un quart, un cinquième et un cinquième des Gaulois y tiennent à l'aise), pas avec
  ceux qui s'y trouvent : le monde ne bouge pas d'une relecture à l'autre. Un visiteur, à qui le serveur ne dit rien des
  membres, voit le village de départ. Chaque étage se dessine dans son repère (la ligne du fond à la rangée 300) et se
  pose dans le monde à sa hauteur (`dy`) ; la plus haute ligne est toujours à la rangée 330, sous le ciel. Le plan lit la
  largeur et la hauteur de chaque dessin fait par un autre (`taillesDesDessins`).
- **Le dessin** : le ciel et les lointains dans `ciel.ts` (dégradé tramé, soleil, lune à sa phase du jour, étoiles, voie
  lactée, nuages, quatre plans en parallaxe, plus la ville lointaine d'OpenFront entre les collines et la forêt) ; le
  terrain des étages dans `etages.ts` (terrasses, murs de soutènement, pentes, escaliers, cascade du ruisseau, ravin,
  falaise, rivage, mer, sièges du dehors) ; les pièces dans `pieces.ts` (étal, camp, ruisseau, mobilier) ; les
  maisons dans `maisons.ts`, la taverne et la salle de réunion ouvertes sur le devant dans `salles.ts`, les arbres dans
  `arbres.ts` ; l'assemblage dans `composition.ts`, par tuiles carrées de 512 cases,
  composées et peintes seulement autour de ce que l'écran voit, plus la liste de ce qui bouge lentement par-dessus (le
  grand feu, les bâtiments à plusieurs images, la forge, l'usine, le port, les navires, la houle, les reflets).
- **Les jardins** (`jardins.ts`, demande du pilote du 14 novembre 2026 : « ajouter des jardins, des clôtures, des arbres
  et des chemins pour remplir ») : les pentes entre les étages sont découpées en parcelles de 168 cases, chacune son
  motif d'après sa colonne (potager clos et verger, bosquet de sapins et de bouleaux, linge et petit puits, sentier en
  lacet et murets, verger et ruches, vigne, meules et cabane, pré fleuri et mare), posé sur les ressauts de la pente,
  jamais sur un escalier ni sur la cascade. Le pré du bas a une clôture le long de la voie, des meules, des haies et
  des fleurs au premier plan : rien de haut là où passent les promeneurs.
- **Les Gaulois** (`postes.ts`, `acteurs.ts`, `marche.ts`, `MondeHabitants.tsx`) : chacun a son lit, celui de son rang
  dans la réponse du serveur (quatre par maison). À la taverne et en réunion : 15 sièges dedans, puis ceux du dehors. Au
  champ de bataille : trois rangs face à ceux d'en face. Ceux de la place se promènent chacun dans sa rue (celle de sa
  maison), un sur trois sur la grand-rue, quelques-uns dans le pré du bas. Un lieu plus plein que prévu se serre. Celui
  qui n'est pas sur la grand-rue la rejoint par l'escalier, d'un coup, avant de marcher vers un autre lieu ; on monte à
  une terrasse de la même façon. Ce qui est hors de l'écran n'est pas redessiné.
- **L'approche** (`camera.ts`, `MondeScene.tsx`) : quatre niveaux, une case valant 1, 2, 3 ou 4 pixels (toujours entiers).
  À l'arrivée, le niveau 1 : un Gaulois fait 48 pixels sur 64, on voit la grand-rue, une terrasse et le bas d'un coup sur
  un grand écran. Boutons + et −, touches + et −, Ctrl + molette, pincement à deux doigts. Le passage dure une seconde :
  tout le dessin grandit ou rétrécit doucement, puis le monde est redessiné net ; vers le loin, il est d'abord redessiné
  au nouveau niveau, pour que rien ne manque sur les bords. Figé, le niveau change d'un coup. La caméra va dans les deux
  sens (glisser, molette, flèches) ; un monde moins haut que l'écran se pose en bas, le ciel remplit le haut.
- **Les événements** (`evenements.ts`, `MondeVie.tsx`) : un décor animé, réglé sur l'horloge du monde dans un cycle de dix
  minutes : le train passe une fois par cycle, une minute et demie au plus, et entre au dépôt du port ; notre navire et celui d'en face échangent un coup de
  canon (l'obus tombe à l'eau devant la cible) ; la trappe du silo s'ouvre, le missile monte, file au-dessus du village
  et explose sur le pré devant le camp d'en face ; une fusée d'en face est arrêtée en l'air par la batterie. Espacés
  d'une minute au moins, lents, sans éclair ni clignotement, sans sang ni victime ; rien ne vient d'une vraie partie,
  aucun texte ne les présente comme tels, et rien ne se passe en pause ni avec « réduire les animations ». Depuis
  l'almanach (15 novembre 2026, plus bas), le cycle suit l'heure réelle, la même pour tous, et non plus le temps passé
  sur la page ; un cycle sur deux, un petit moment de l'almanach peut prendre la place du missile.
- **Les bêtes** (`betes.ts`) : deux vaches devant l'étable, des poules près du potager, le chien de la place, une
  charrette et son âne sur le chemin, des chèvres et des poules sur les terrasses et dans le pré du bas. Dessins
  originaux ; elles vont et viennent comme des promeneurs.
- **L'écran** (`src/components/village/monde/`) : `MondeScene` (la scène, les gestes, l'approche, les étiquettes),
  `MondeDecor` (fond et premier plan), `MondeVie` (événements et bêtes), `camera-du-monde.ts`, `horloge.ts`,
  `MondeInterface` (la petite carte : un bouton par quartier, onze en tout, la grand-rue puis la gare, l'usine et le
  port ; la rangée d'icônes ; les fenêtres ; la ligne « Code source · Mentions légales · © OpenFront and Contributors »),
  `MondeFenetres`. `VillageApp.tsx` tient le tout et bâtit le plan pour le nombre de Gaulois lu au serveur.
- **Ce que le dessin montre est écrit** : les étiquettes du chantier, du feu et des lieux sont de vrais boutons ; un clic
  sur une maison de la grand-rue ouvre « Mon Gaulois », sur l'étal « Le marché », sur la forge « La forge ». Le dessin
  est `aria-hidden` ; la scène prend le focus (flèches, Début, Fin, + et −), la caméra vient à l'étiquette atteinte par
  Tab. Au-delà de 60 Gaulois vus de loin, les noms ne s'écrivent plus sous chacun (sauf le sien) : ils restent au
  survol, au toucher et dans « Qui est où ».
- **Sans script**, la page défile et dit le chantier et le feu en texte ; la mise en page d'écran ne vaut qu'avec
  `:root.village-monde`.
- **Limite connue** : chaque Gaulois est encore un élément de la page. À 1 000 Gaulois, l'écran tient 60 images par
  seconde au repos, mais un long glissement de la caméra tombe autour de 16 : le rendu sur une seule toile est à faire.

### Troisième étape : la grand-rue devant, les terrasses derrière (14 novembre 2026)

Le pilote : « la perspective est mauvaise », puis le choix de la proposition B, « les terrasses » ; « design mieux les
maisons, ça ressemble à des carrés » ; « tu peux améliorer le modèle des arbres ». Ce paragraphe remplace, dans ce qui
précède, tout ce qui parle des terrasses au même plan, des jardins sur les pentes, des quatre niveaux d'approche et de la
limite connue (le rendu de la foule est refait, voir « Le moteur de la foule »). Design : Claude Fable 5.2.

- **La perspective** (`plan.ts`, `lointain.ts`, `MondeTerrasses` dans `MondeDecor.tsx`) : la grand-rue est au premier
  plan ; derrière elle, des terrasses de maisons dessinées deux fois plus petites (une case du fond vaut une demi-case du
  premier plan), pâlies vers la couleur du ciel (de 20 à 62 % de brume), et qui glissent moins vite que le premier plan
  de gauche à droite (la première suit 86 % du déplacement de la caméra, chacune 6 % de moins). De haut en bas, elles
  suivent la caméra comme le reste : elles restent posées derrière la grand-rue. Tout est vu de côté, posé sur son sol :
  maisons, arbres, clôtures, haies, linge, puits, ruches, meules. Sous chaque terrasse, un mur de soutènement et un talus
  vu de face, à contre-jour, sans rien de semé dessus (plus de potager, de mare ni de sentier vus du dessus), avec un
  escalier de pierre. Le ciel et les lointains sont au-dessus de la plus haute terrasse.
- **Combien de terrasses** : deux au moins. Les trois premières maisons sont sur la grand-rue ; les autres sont réparties
  d'une terrasse à l'autre, du milieu vers les côtés ; quatre places sur cinq au plus portent une maison, les autres un
  jardin (grenier sur pilotis, petite hutte et linge, verger, puits et banc, meules et ruches). On ajoute une terrasse
  quand il en faut : 3 à 250 et 300 Gaulois, 4 au plus à 350, 6 à 1 000 (testé : 12 au plus).
- **Les maisons** (`maisons.ts`) : quatre modèles de quatre lits (grande hutte ronde, longère, maison à colombages,
  chaumière à appentis) et deux dépendances fermées (grenier sur pilotis, petite hutte). L'intérieur n'est ouvert que
  sur les lits, et l'ouverture suit la charpente. Chaque maison peut être retournée et change de teinte ; deux voisines
  ne sont jamais du même modèle.
- **Les arbres** (`arbres.ts`) : chêne, hêtre, bouleau, sapin, saule, pommier, noisetier, buisson ; tronc noueux, racines,
  feuillage en masses éclairées d'un côté, ombre portée au pied ; taille, sens et teinte changent d'un arbre à l'autre.
  Ils remplacent partout les anciens arbres : lisières, grand-rue, terrasses, pied de la grande pente du bas.
- **Les Gaulois des terrasses** (`postes.ts`) : celui qui dort dans une maison du fond, ou qui se promène sur sa terrasse,
  porte l'échelle 0,5 et la parallaxe de sa terrasse ; le moteur de la foule le dessine deux fois plus petit, sous le
  décor du premier plan (`fondDuPlan` de `foule.ts`). En chemin vers un autre lieu, il rejoint la grand-rue d'un saut, par
  l'escalier.
- **L'approche** (`camera.ts`) : trois niveaux, une case du premier plan valant 1, 2 ou 4 pixels ; le fond en vaut toujours
  la moitié. À l'arrivée, le niveau 2 (un Gaulois de la grand-rue fait 96 pixels sur 128) ; sur un écran étroit, le
  niveau 1, pour voir plus qu'une maison. Au niveau 1, le fond est à un demi-pixel par case : le navigateur l'adoucit.
- **Le cadrage** (`cadrageDuMonde`, `camera-du-monde.ts`) : envoyée vers la grand-rue, la caméra pose le bas de la rue en
  bas de l'écran et montre la colline au-dessus ; ailleurs, le point visé est au milieu.
- **Deux retouches dans le moteur de la foule** (`foule.ts`, `MondeHabitants.tsx`), faites par le designer : la parallaxe
  ne joue plus que de gauche à droite (`decalageDuPlan`), et un plan du fond se range sous tout le premier plan
  (`fondDuPlan`). Les tests du moteur ont été mis à jour.
- **Le thème clair** : l'interface du monde (fenêtres, rangée d'icônes, petite carte, boutons d'approche, étiquettes)
  suit le thème « Neige Marine » du site ; les contours posés sur le dessin restent blancs (`var(--sur-couleur)`).
- **Limites connues** : rien de tout cela n'a été vu avec un vrai compte ni sur un vrai téléphone.
- **Cadence mesurée** (Chromium sans carte graphique, 1 920 × 1 080, niveau 2) : à 300 Gaulois, 49 images par seconde au
  repos et 40 pendant un glissement ; à 1 000, 52 et 34. Premier Gaulois à l'écran en 0,4 seconde. Non mesuré sur un vrai
  poste avec carte graphique.

### Quatrième étape : le fond pâli et vivant, les deux salles redessinées (14 novembre 2026)

Le pilote, après la mise en ligne : pâlir les Gaulois des terrasses comme leur décor, faire fumer les maisons du fond et
y remettre des bêtes, redessiner la taverne et la salle de réunion, « plus carrées que les nouvelles maisons ». Design :
Claude Fable 5.2.

- **Les Gaulois des terrasses sont pâlis** (`voileDuPlan` de `foule.ts`, `MondeHabitants.tsx`) : une fois les Gaulois
  d'une toile du fond peints, le moteur pose sur elle un seul voile, de la couleur du ciel près de l'horizon à cette heure
  (`brumeDuFond` de `lointain.ts`) et de la part de brume de leur terrasse (de 20 à 62 %), qui ne teinte que ce qui est
  peint. Les dessins tout faits ne changent pas ; les Gaulois de la grand-rue ne sont pas touchés.
- **Les fumées du fond** (`MondeTerrasses`) : une fumée lente à la cheminée d'une maison sur deux, à l'échelle de sa
  terrasse, d'autant plus pâle que la terrasse est loin ; elle glisse avec elle. Le bouton pause la fige comme les autres.
- **Les bêtes des terrasses** (`betes.ts`, `MondeBetes`) : sur chaque terrasse, derrière le village, deux poules, deux
  chèvres, et un chien une terrasse sur deux ; dessinées à demi-échelle, pâlies comme leur terrasse, rangées en
  profondeur avec ses Gaulois, et qui glissent avec elle.
- **La taverne et la salle de réunion** (`salles.ts`) : la taverne est une grande chaumière en croupe, au faîte qui
  fléchit, avec une lucarne, la souche de sa cheminée, un cellier de pierre adossé sous un appentis de chaume, l'enseigne
  au bout d'une potence et une guirlande de houblon ; la salle de réunion est une halle à fronton (le bouclier du clan,
  deux cornes croisées), avec une tourelle de pierre, un mât et sa bannière, deux marches. L'ouverture suit la charpente
  (deux grands aisseliers cintrés). Les places assises n'ont pas bougé : huit et sept sièges dedans, à la même place
  depuis le bord gauche, puis la terrasse de tables et les bancs dehors, qui grandissent toujours avec le village (un
  quart et un cinquième des Gaulois). Les emplacements sont plus larges (456 et 440 cases au lieu de 372) : l'annexe est
  à droite, ce qui suit est poussé d'autant.

## Le monde : la marche, l'état du monde et les plaques

### Le monde du village : le vrai état, la marche, les plaques (14 novembre 2026)

Code : Claude Opus 5.5, sur l'écran du designer (Claude Fable 5.2), sans en changer l'apparence.

- **Le vrai état** : `/village` reçoit l'état du monde de `etatDuMondeDuSite()` (`src/lib/village/monde-site.ts`), le même
  que `/village/monde.json` lu par /feu : le chantier et le grand feu calculés à la construction sur les sessions publiques
  du clan. L'état d'essai du designer (`monde/provisoire.ts`, dates inventées) est supprimé. Les nombres s'écrivent comme
  sur Discord (`monde/textes.ts`, règles de `chantier.ts`) : points rapportés arrondis vers le bas (`pointsAffiches`), ce
  qui reste arrondi vers le haut (`pointsQuiRestent`), en entiers : « Encore 437 points pour finir le pont », « 13 points
  posés sur 450 », « 617 points rapportés au clan en 7 jours ». L'étiquette du chantier et celle du feu portent l'heure du
  relevé. Sans données (`chantier` ou `feu` à `null`), l'écran le dit à leur place, dans leur fenêtre et dans le texte sans
  script : « Pas de données », jamais un zéro ni un bâtiment montré fini.
- **La marche** (`monde/acteurs.ts`, `monde/marche.ts`, calculs purs testés dans `tests/unit/village-monde-marche.test.ts`)
  : à chaque relecture du serveur (toutes les 5 minutes, page visible) et à chaque minute de l'horloge, celui qui arrive au
  village paraît à sa place, celui qui part disparaît ; celui dont le lieu change sort par la porte (d'un coup s'il
  dormait), marche au pas jusqu'à la porte du nouveau lieu et y prend sa place (dans son lit d'un coup). Une relecture
  pendant sa marche le fait repartir de là où il est, vers le dernier lieu dit. Une route plus longue que 960 cases est
  coupée en son milieu : on le voit partir et arriver, jamais plus d'une minute environ en chemin. Pause ou « réduire les
  animations » : chacun est d'un coup à sa place, sans marcher. Page cachée, rien ne tourne : l'horloge du dessin suit le
  navigateur, l'heure et la relecture attendent que la page redevienne visible, et le repère « vous » de la petite carte
  ne se relit plus deux fois par seconde (il suit les pas).
- **Les plaques de la forge sur la place** : `lireVillage` (`ecran-place.ts`) lit `gravures` de chaque Gaulois
  (`lirePlaques` de `forge.ts`) ; `plaquesEnMots` y met le nom de chaque objet, de la tête à l'arme. Elles se lisent au
  survol d'un Gaulois, au toucher (sous son nom et ce qui le place là) et dans « Qui est où » : le nom de l'objet, puis le
  texte gravé. Le serveur ne donne que celles qu'on peut voir.
- **Échap** est écoutée dès l'arrivée sur la page et la fenêtre prend le focus juste après son affichage : une touche
  pressée aussitôt la fenêtre ouverte la referme et rend le focus à son icône.
- **Ménage** : l'ancienne place en onglets ne sert plus (`PlaceDuVillage.tsx`, `PlaceScene.tsx`, `lieux.ts` et
  `composerLieu`, les tailles de `ecran-place.ts`, les huttes, la palissade et le petit feu de `decor.ts`, la promenade de
  poste en poste de `mouvement.ts`, et leur feuille de style) : supprimés, avec leurs tests. Le mobilier des intérieurs
  (table, torche, fenêtre, tonneau, fût, étagère) n'existe plus qu'une fois, dans `monde/pieces.ts`. `useFige` est dans
  `src/components/village/fige.ts`. Restent, utilisés ailleurs : `decor.ts` (planche, grain, couleurs du dehors),
  `poses.ts` (le compagnon, le monde), `lieux-icones.ts`, `PlaceToile.tsx`, `PlaceToucher.tsx`.
- **Tests** : `tests/unit/village-monde-marche.test.ts` (la marche arrive toujours, sans dépasser son but ; sauts ; route
  coupée ; relectures, départs, arrivées, pause), `village-monde-textes.test.ts` (les mots du chantier et du feu, les
  adresses), `village-ecran-place.test.ts` (les plaques) ; `tests/e2e/village.spec.ts` (le monde d'un visiteur : étiquettes
  et heure du relevé comparées à `/village/monde.json`, fenêtres par les icônes et par l'adresse, Échap, clavier, pause,
  texte sans script, WCAG AA fenêtre par fenêtre, aucun défilement horizontal de 360 à 1 920 px).

## Le monde : le rendu de la foule

### Le moteur de la foule : 250 à 350 Gaulois fluides, 1 000 possibles (14 novembre 2026)

Demandes du pilote : « un monde vivant qui pourra accueillir jusqu'à 1 000 membres gaulois », puis « fais le moteur pour
250, 350 personnes ». Code : Claude Opus 5.5, sur l'écran du designer (Claude Fable 5.2), sans en changer l'apparence.

- **Une foule peinte, plus un élément par Gaulois** (`MondeHabitants.tsx`) : chaque Gaulois était un élément de la page
  avec sa petite toile, son nom, son étiquette et ses bulles (environ 2 100 éléments à 350 Gaulois, 5 500 à 1 000) ; le
  navigateur recalculait tout cela à chaque image d'un glissement. Désormais toute la foule se peint dans quelques toiles
  posées sur le décor, à la taille des cases (la feuille de style les agrandit sans flou, comme le décor), et seulement
  autour de ce que l'écran voit (la vue et une marge de 96 à 240 cases). La caméra glisse sans rien repeindre tant qu'elle
  reste dans la marge ; au-delà, la foule se repeint aussitôt autour de la nouvelle vue. Le mouvement reste à huit temps
  par seconde (l'horloge du monde).
- **Des dessins tout faits** (`foule-dessins.ts`) : chaque Gaulois, dans chaque pose qu'on lui voit (debout, les deux
  pas de la marche, la chope posée ou levée, assis, les deux souffles du dormeur, et les guerriers d'en face), est peint
  une fois dans une petite image gardée en mémoire (`ImageBitmap`, ou une petite toile si le navigateur ne sait pas la
  faire), par tenue et par pose : une relecture du serveur ne refait rien. Les 2 400 dernières servies sont gardées, les
  plus anciennes s'oublient (la mémoire reste stable, même à 1 000). Ce qui manque se fait au plus 6 millisecondes par
  image ; le reste attend l'image suivante (dans la marge, hors de la vue).
- **Devant, derrière** (`src/lib/village/monde/foule.ts`, testé dans `tests/unit/village-monde-foule.test.ts`) : comme
  avant, ce qui est plus bas à l'écran passe devant. Une seule toile tant que rien du décor ne s'intercale entre deux
  Gaulois qui se touchent ; une toile de plus là où une bête, le grand feu, une fumée ou le train passe devant les uns et
  derrière les autres. Est rangé ainsi tout ce qui, dans le monde, porte un z-index écrit dans la page (la règle du
  décor du designer) ; le test vérifie, sur des centaines de foules tirées au hasard, que les toiles se voient case pour
  case comme chaque Gaulois à part.
- **Le texte reste du texte** : les noms, l'étiquette du survol (avec les plaques de la forge), les bulles de Claude, le
  « z » des dormeurs, la flèche et le nom du sien, la bulle du toucher sont toujours des éléments de la page, avec les
  mêmes classes, mais seulement pour ceux qui en ont besoin : le sien ; ceux dont le nom s'écrit (de près, ou dans un
  village de 60 Gaulois au plus, vu de loin) ; qui a une réplique ; qui dort ; qui est survolé (une seconde de plus,
  le temps du fondu) ; qui vient d'être touché. Elles ne prennent ni le clic ni le survol : la scène les donne à la foule.
- **Toucher et survol** : un clic ou un toucher trouve le Gaulois sous le doigt, le plus en avant (son corps, ou son nom
  écrit), et le fait parler (`PlaceToucher.tsx`, inchangé) ; un Gaulois devant une maison ou l'étal passe avant le bouton
  de dessous, comme avant. Un glissement, ou Entrée sur un bouton, ne touche personne. Au survol de la souris, son
  étiquette s'ouvre et la main le montre. Le sursaut de celui qu'on agace est peint dans la toile (une case, de 0,12 à
  0,48 seconde), seulement quand les animations tournent.
- **Ce qui ne change pas** : la marche d'un lieu à l'autre et les relectures (`acteurs.ts`, `marche.ts`), les bulles,
  la pause et « réduire les animations » (chacun posé à sa place, la caméra repeint), les quatre niveaux d'approche, le
  monde caché aux lecteurs d'écran (« Qui est où » en est l'équivalent texte). Page cachée, rien ne tourne : la foule ne
  se repeint qu'au battement de l'horloge du monde, aux mouvements de la caméra et après un rendu.
- **Les plans (pour la proposition « les terrasses »)** : une place (`Place` de `postes.ts`) peut dire deux réglages,
  facultatifs et sans effet par défaut. `echelle` : la taille d'une case de son plan en cases du premier plan (1 devant,
  0,5 deux fois plus petit) ; à l'écran, une case de ce plan vaut `caseDuPlan(niveau, echelle)` pixels, l'échelle fois
  le niveau d'approche, arrondie, jamais moins d'un pixel (0,5 donne 1, 1, 2, 2 pixels aux niveaux 1 à 4). `parallaxe` :
  la part du déplacement de la caméra que son plan suit (1 devant ; 0,6 glisse moins vite) ; dans le calque du monde, qui
  suit toute la caméra, le plan est décalé de `decalageDuPlan` = arrondi((1 − parallaxe) × caméra × niveau) pixels, dans
  les deux sens. La place (`x`, `y`) se compte en cases de son plan ; à l'écran, depuis le coin de la scène, elle est au
  pixel `x × caseDuPlan + décalage.x − arrondi(caméra.x × niveau)` (de même en hauteur). Le dessin, l'ombre, les toiles,
  le clic, le survol, les étiquettes (leur `--place-case` devient la case du plan), la bulle et « aller voir le sien »
  (`milieuPourVoir`) en tiennent compte ; deux plans ne partagent jamais une toile. En chemin d'un lieu à l'autre, un
  Gaulois est au premier plan (il marche sur la grand-rue ; terrasses et lits se rejoignent d'un saut). La profondeur
  reste la rangée sous ses pieds, en cases de son plan : un plan du fond doit avoir des rangées plus petites que ce qui
  passe devant lui. Calculs dans `foule.ts`, testés.
- **Seule différence visible** : l'ombre sous un Gaulois debout est une ellipse en cases (26 sur 5), au lieu d'une ellipse
  lisse ; de près, son bord est en marches d'escalier, comme le reste du dessin.

## Les bâtiments du chantier

#### Les bâtiments du lot A et le chantier (dessin : Claude Fable 5.2, 14 novembre 2026)

`src/lib/village/batiments/lot-a.ts` dessine en pixels, à l'échelle des Gaulois (48 × 64 cases), les cinq premiers
bâtiments du chantier, au format `DessinDeBatiment` :

| Bâtiment | Taille (cases) | Ce qu'on voit | Ce qui change la nuit |
|---|---|---|---|
| `palissade` | 240 × 112 | Deux tronçons de pieux taillés en pointe, liés de deux cordes ; au milieu, la porte du village : deux gros poteaux, un linteau lié de corde, deux battants ouverts vers le dedans (le passage, 72 cases de large et 88 de haut, est vide : on voit le monde derrière) | Une torche sur chaque poteau, flamme fixe |
| `puits` | 66 × 88 | Margelle de pierres, deux poteaux, petit toit de bardeaux, treuil avec sa corde, manivelle, seau pendu | Rien n'éclaire |
| `four` | 124 × 132 | Dôme de terre sur un socle de pierres, gueule en arc de pierres, conduit qui traverse un auvent de chaume, tas de bûches, pelle à enfourner | La gueule rougeoie (couleur fixe), sa lueur sur le socle |
| `potager` | 180 × 64 | Clôture basse de gaules tressées, deux planches bordées de bois (choux, carottes, haricots à rames, poireaux, courges), un épouvantail sans visage, un panier | Rien n'éclaire |
| `tour` | 80 × 170 | Quatre pieux écartés au pied, croix de contreventement, échelle, plateforme à garde-corps de planches, toit pointu de chaume | La lanterne du guetteur, fixe |

Seul le four a un mouvement : sa fumée, en 3 images (`images: 3`) qui se suivent sans saut (les bouffées montent de deux
cases par image et sont espacées de six) ; l'image 0 reste quand tout est figé. Les matières et les couleurs sont celles
de `paletteDuDehors` (`decor.ts`), plus une pierre grise ; tout suit `couleurDuDehors`, sauf ce qui éclaire, qui ne
s'allume qu'à la tombée du jour (comme la porte des huttes) et ne clignote jamais. Rien n'est tiré au hasard (`alea`).

`src/lib/village/batiments/chantier.ts` (`enChantier(fini, avancement, lumiere)`) sert aux 15 bâtiments : il ne lit que
les cases non vides du dessin fini et rend toujours un dessin de la même taille.

- À 0 : la terre retournée, des piquets et un cordeau sur l'emprise du bâtiment, un tas de matériaux (rondins, planches,
  pierres).
- Entre 0 et 1, un bâtiment haut monte du bas vers le haut : ses rangées du bas sont posées, et un échafaudage de
  perches de bois clair (une tous les 26 cases environ), de planchers (un tous les 20 cases), d'écharpes et de
  ligatures de corde suit la silhouette de ce qui reste à faire ; une échelle va du sol au plancher où l'on travaille.
- Un bâtiment bas et large (emprise de plus de 1,6 fois sa hauteur : palissade, potager, pont, rempart…) se bâtit de
  gauche à droite, par tranches d'environ 30 cases, trois tranches montant à la fois : à gauche c'est fini, au milieu
  on y travaille sous l'échafaudage, à droite le cordeau et le tas de matériaux attendent.
- À 1 : le dessin fini, rendu tel quel.

Les planches de contrôle se refont avec l'atelier (`atelier-batiment.mts <id> <dossier>`).

**Lot B des bâtiments (`src/lib/village/batiments/lot-b.ts`, design Claude Fable 5.2).** Cinq bâtiments du chantier, dessinés case par case à l'échelle des Gaulois, avec les matières du village (`paletteDuDehors` : bois, chaume, torchis) et une pierre grise un peu chaude propre à ce lot. Le pont (149 × 46 cases) : une passerelle de bois bombée sur deux culées de pierre, plancher à hauteur de marche aux deux bouts, garde-corps et corde, une lanterne à chaque bout ; entre les culées les cases sont vides, le monde y dessine le ruisseau. Le grenier sur pilotis (124 × 140) : coffre de planches sous un toit de chaume, pilotis coiffés d'une pierre plate, porte ouverte sur le tas de grain, petite échelle, sacs. Le moulin (212 × 156) est un moulin à eau : maison de torchis sur soubassement de pierre, porte de 72 cases, et une roue à douze bras devant son mur de pierre, nourrie par une auge de bois, le bas dans un bassin ; la roue avance d'un quarante-huitième de tour par image et se retrouve pareille après ses 4 images (`BRAS`, `MOULIN_IMAGES`), l'eau qui tombe glisse avec elle. Le lavoir (190 × 104) : toit de chaume sur poteaux, bassin de pierre et pierres plates à laver, baquet, battoir, corde à linge avec un drap, un linge rouge et une tunique bleue, panier d'osier. Le colombier (84 × 164) : tour ronde de pierre, deux rangs de trous d'envol sur leurs bandeaux, toit de chaume pointu avec une lucarne ; trois pigeons bougent en 3 images (l'un picore, l'autre aussi, celui de la lucarne se retourne). Ce qui éclaire (lanternes du pont, fenêtres du moulin) est éteint le jour et s'allume quand le jour baisse (`veille`, comme les huttes), sans jamais clignoter. Rien n'est tiré au hasard : même lumière et même image, même dessin.

**Le lot C des bâtiments** (`src/lib/village/batiments/lot-c.ts`, design Claude Fable 5.2) dessine, à l'échelle des Gaulois, les cinq derniers bâtiments du chantier. Tout est calculé case par case, sans rien d'aléatoire ; les matières sont celles de `decor.ts` (bois, chaume, torchis), plus une pierre sèche et des tuiles de bois dont la teinte de nuit se déduit de celle de jour. La lumière vient d'en haut à gauche. Les lanternes et les fenêtres s'allument quand le jour baisse (même règle que la porte des huttes) et ne bougent jamais ; leur lueur ne teinte que les cases déjà posées, jamais le vide.

- `etable` (164 × 120, 2 images) : torchis en haut, planches en bas, toit de chaume, porte à deux vantaux de 72 cases, une baie où une bête regarde dehors, un abreuvoir, une meule de foin, une fourche, une lanterne. À l'image 1, la bête baisse la tête de 4 cases.
- `halle` (240 × 150, 1 image) : grand toit de tuiles de bois à quatre pans sur cinq gros poteaux et leurs aisseliers, poteaux du fond plus minces, fronton aux deux boucliers du clan, corde de fanions bleu, blanc, rouge, deux lanternes. Entre les poteaux, les cases sont vides sur 82 cases de haut (de la rangée 64 au sol de terre battue, rangée 146) : le monde y pose les étals et les Gaulois.
- `chene` (212 × 170, 3 images) : tronc large et noueux (creux, nœuds, mousse, racines, un chicot), 27 boules de feuillage sur deux plans, une balançoire de corde sur la longue branche de droite (planche aux rangées 147 à 149) et un banc à gauche. Le feuillage respire : à chaque image, une boule sur trois s'écarte d'une case.
- `rempart` (240 × 126, 1 image) : mur de pierres sèches avec les bouts de ses poutres en quinconce, chemin de ronde (plancher aux rangées 22 à 25) sur corbeaux, parapet et créneaux de bois, boucliers du clan, une échelle, deux lanternes.
- `grande-tour` (96 × 170, 1 image) : fût de pierre, porte cintrée, deux meurtrières, hourd de bois à trois baies éclairées la nuit, toit pointu de tuiles de bois, et la bannière du clan : bleu nuit, les trois couleurs à la hampe, « GAL » en lettres de 5 × 7 cases. Les couleurs sont celles de la salle de réunion (`TRICOLORE`) et du blason ; rien d'OpenFront ni de Discord.

## Le grand feu et la forge, en dessins

**Le grand feu et la forge (dessins).** Le grand feu est dessiné par `supabase/functions/code-discord/grand-feu.ts` (`imageDuGrandFeu(niveau, image)`), dans le dossier de la fonction parce que `/feu` le dessine aussi : une toile de 96 × 120 cases, les pierres du foyer sur la dernière rangée, 6 images en boucle (`IMAGES_DU_FEU`). Cinq niveaux qui se reconnaissent d'un coup d'œil : des braises dans la cendre et un filet de fumée ; un petit feu sur deux bûches croisées ; un beau feu sur un tas de bûches ; un grand feu sur des bûches dressées en faisceau ; un feu de joie sur un bûcher de rondins empilés, plus haut qu'un Gaulois et demi. Les flammes sont des langues calculées qui ondulent lentement, sans raccord entre la dernière image et la première : ni étincelle, ni éclair, ni saut de taille (la hauteur varie de 3 pour cent au plus). Les couleurs du feu ne changent pas avec l'heure ; le fichier n'importe rien et ne tire rien au hasard. La forge est `FORGE` de `src/lib/village/batiments/forge.ts` (204 × 170 cases, 4 images lentes) : un atelier ouvert sur le devant sous un toit de chaume, le foyer de pierre sous sa hotte et sa cheminée, le soufflet sur son bâti, l'enclume sur son billot avec une lame encore chaude, le baquet d'eau, les outils, deux épées et un bouclier au mur ; personne dans le dessin. Le dehors suit l'heure (`couleurDuDehors`) ; les braises, la flamme et la lame chaude gardent leur couleur, et leur lueur rend au dedans ses couleurs du jour près du foyer, de plus en plus la nuit. D'une image à l'autre, le soufflet bouge d'une case, les braises changent d'un ton et la fumée serpente. Les 20 rangées du haut ne portent que la fumée de la cheminée. `PLAQUE` (7 × 6 cases) est la petite plaque dorée d'un objet gravé, `PLAQUE_GRANDE` (40 × 16) la même en grand, sans texte : le texte s'écrit en HTML sur son champ uni (cases 4 à 35 en largeur, 3 à 12 en hauteur). Design : Claude Fable 5.2.

## Le chantier, le grand feu et le robot

**Le chantier, le grand feu et le robot** (14 novembre 2026, code par Claude Opus 5.5). Idées 1 et 2 du pilote : le village qui se bâtit tout seul, et le grand feu.

- **Le calcul** (`src/lib/village/chantier.ts`, testé dans `tests/unit/village-chantier.test.ts`) rend l'`EtatDuMonde` de `monde-etat.ts` à partir des sessions du clan (`data/sessions/`) et de l'heure de leur relevé, `meta.sessions.coveredUntil` de `data/meta.json` (l'instant jusqu'où les sessions sont relevées sans trou). Les points rapportés au clan sont le `score` positif des sessions, comme pour les statères : une défaite ne retire rien, une partie lue deux fois (même `gameId`) ne compte qu'une fois. Le **chantier** compte les parties commencées depuis `DEBUT_DU_CHANTIER` (1er novembre 2026, minuit à Paris) jusqu'au relevé ; les bâtiments de `BATIMENTS` se remplissent dans l'ordre, et `fini_le` est le début de la partie qui a fait passer le seuil (les parties rangées par début, puis par identifiant). Le **feu** compte les parties commencées dans les 7 × 24 heures qui finissent au relevé : une fenêtre qui glisse, sans saut à minuit, qui ne fait pas baisser le feu chaque nuit ; son niveau vient de `SEUILS_DU_FEU`. Les scores sont additionnés en décimal exact (1 063,91 et non 1 063,9100000000003).
- **« Pas de données » n'est pas zéro.** Sans relevé : `releve`, `chantier` et `feu` à `null`. Un mois de sessions illisible (`unreadableSessionFiles` de `data.ts`) qui touche la période : `chantier` à `null` s'il est du mois du début du chantier ou après (le fichier d'octobre compte : minuit à Paris le 1er novembre est encore le 31 octobre en temps universel), `feu` à `null` s'il touche ses 7 jours. Un relevé d'avant le début du chantier : `chantier` à `null`. Un relevé de plus de 48 heures au moment du calcul (`RELEVE_DU_FEU_MAX_MS`) : `feu` à `null`, pour qu'un feu d'une autre semaine ne passe pas pour celui de la semaine en cours ; le chantier reste, daté, puisqu'il ne fait que grandir.
- **L'arrondi pour l'affichage.** L'état garde les nombres exacts. Des points rapportés s'écrivent arrondis vers le bas (`pointsAffiches`) : jamais plus que rapporté, et un nombre écrit n'atteint un seuil entier que si le vrai nombre l'atteint. « Encore N points pour finir … » : N arrondi vers le haut (`pointsQuiRestent`), jamais 0 tant que le bâtiment n'est pas fini ; posés et restants écrits font toujours le coût. `avancementDuBatiment` donne la part posée (1 seulement fini) pour `dessinDuBatiment`, `batimentEnCours` le bâtiment en cours.
- **Le site** : `etatDuMondeDuSite()` (`src/lib/village/monde-site.ts`) fait ce calcul à la construction, et `/village/monde.json` (`src/pages/village/monde.json.ts`) le publie : des totaux du clan, aucun joueur. Mesure du 14 novembre 2026, relevé de 13 h 53 : 1 063,91 points rapportés depuis le 1er novembre ; la palissade finie le 2 novembre, le puits le 4, le four à pain le 7, le potager le 9, la tour de guet le 13 novembre à 22 h 03 ; le pont en cours, 13,91 posés, encore 437 ; le feu à 617,25 points sur 7 × 24 heures, un feu de joie.
- **L'annonce sur Discord** (`src/lib/chantier-discord.ts`, image `src/lib/chantier-image.ts`, script `npm run chantier:envoyer`, étape « Annoncer les bâtiments finis du village sur Discord » du workflow, juste après la collecte) : chaque bâtiment fini part sur le salon des nouvelles, réglé dans Direction > Discord (sinon le secret `DISCORD_WEBHOOK_GAZETTE`), en image avec un bouton « Voir le village », sans texte ; le texte ne part que si l'image ne se dessine pas. L'image (1 200 × 660) : le nom du bâtiment, « chantier terminé au village des Gaulois », l'heure du relevé, les points rapportés au clan qu'il a coûtés, le jour où son chantier s'est terminé et l'heure de la partie qui l'a fini, le prochain chantier et ce qu'il lui manque (ou « Tout est bâti »), et à droite le bâtiment en plein jour, à la plus grande case entière qui tienne (2 pixels pour la palissade, très large, 3 pour la tour de guet et la grande tour, très hautes). Au premier passage, les bâtiments déjà finis sont notés comme connus sans être annoncés ; un bâtiment ne part jamais deux fois ; plusieurs finis d'un coup partent dans l'ordre ; un envoi refusé est retenté au passage suivant. État dans `data/chantier-envoi.json`. `npm run images:apercu` dessine le dernier bâtiment fini et des exemples (`17-chantier…`).
- **/feu** (`supabase/functions/code-discord/feu.ts`, dans `definitions.ts`, inscrite seule après la mise en ligne de la fonction) lit `/village/monde.json` sur le site publié (gardé cinq minutes, comme les fiches), sans lui faire confiance, et répond à tout le salon : le grand feu de son niveau (`imageDuGrandFeu`, image 0) au milieu de la place de /gaulois au moment de la journée à Paris, avec le logo du clan (496 × 320), la phrase en petit sous l'image, « Un feu de joie : 617 points rapportés au clan sur les 7 derniers jours, au relevé du 14 novembre à 13 h 53. » (l'heure du relevé est toujours écrite), et un bouton « Voir le village ». Le feu, une toile de 96 × 120 cases, n'entre pas dans le décor à 4 pixels par case : il prend la plus grande case entière qui le laisse tenir entre le haut de l'image et le sol, 2 pixels aujourd'hui. Sans fichier lisible, sans feu ou avec un relevé de plus de 48 heures, une phrase au seul joueur qui la tape, sans image. `/etat` dit `"feu":true` quand le fichier se lit. Les noms du feu et la limite de 48 heures sont recopiés dans la fonction (qui ne lit que son dossier) ; un test les garde identiques à ceux du site.

## La forge aux souvenirs : le serveur

**La forge aux souvenirs** (14 novembre 2026, migration `20261114001000_village_forge.sql`). Idée du pilote : « On paie des statères pour graver une vraie partie sur son épée : “12 novembre, à quatre, 2,33 points rapportés”. Les objets racontent enfin quelque chose, et les statères servent à autre chose qu'à la boutique. » Règles du chef de chantier, code par Claude Opus 5.5 ; l'écran est à faire par Claude Fable 5.2 sur le contrat (`MaForge`, `PlaqueVue`, `RefusForge`, `PRIX_GRAVURE` de `src/lib/village/contrat.ts` ; lecture, textes et refus dans `src/lib/village/forge.ts`).

- **La règle** : un membre validé qui a créé son Gaulois grave une de ses propres parties qui ont rapporté des points au clan, prise dans son journal des statères (crédits de nature `victoire`, gardés jusqu'à l'effacement du compte : `get_ma_forge` en donne les 100 dernières), sur un objet qu'il porte ou possède : un objet à rareté d'un des cinq emplacements d'objets (tête, haut, bas, pieds, arme), gratuit ou de son inventaire. Jamais le corps, le visage ni une case « rien » (`objet_non_gravable`). Une plaque par objet et par compte ; regraver la remplace et se paie de nouveau ; la même plaque une seconde fois est refusée sans rien débiter (`deja_grave`, un double clic ne paie pas deux fois) ; effacer est gratuit.
- **Le texte de la plaque** se fait des seuls faits de la partie, copiés du journal au moment de graver : le jour à Paris (« 1er novembre », « 12 novembre », sans l'année, comme l'exemple du pilote), le nombre de Gaulois du clan dans la partie (le `clanPlayerCount` de la session : « seul », « à deux »… « à vingt », puis « à 23 ») et les points rapportés au clan, arrondis à deux décimales (une demie vers le haut, sans zéro inutile, au singulier sous 2 : « 1,5 point rapporté », « 2 points rapportés » ; sous un centième, « moins de 0,01 point rapporté », jamais « 0 point »). La règle est écrite deux fois, à l'identique : `internal.forge_plaque` et `texteDeLaPlaque` ; l'essai les compare sur 538 valeurs, et un test garde les mêmes mots. Aucun nom, aucun identifiant ni aucune heure de partie n'est gardé avec la plaque.
- **Le prix** : 150 statères (`PRIX_GRAVURE`, `internal.forge_prix` : un test garde les deux identiques), une ligne `gravure` au journal des statères (`ref` : « emplacement/objet »), dans la même transaction que la plaque ; c'est la table des soldes qui refuse un solde insuffisant. Le prix vu à l'écran est vérifié (`prix_change`), comme à la boutique. Le prix n'est pas réglable dans la Direction : il change par une migration.
- **Le marché** : le dernier exemplaire d'un objet gravé ne se met pas en vente (`objet_grave` : effacer la plaque d'abord). Choix de cette migration : un double de la pochette se vend, la plaque reste sur l'exemplaire gardé. `objet_porte` et `achete_au_marche` passent avant `objet_grave`, qui ne dit « effacez la plaque » que si cela suffit. Un objet en vente n'est plus à soi : il ne se grave pas.
- **Qui voit une plaque** : son propriétaire, toujours (`get_ma_forge`, `get_mon_gaulois`, son Gaulois sur la place). Les autres comptes validés et l'encadrement, sur la place (`gravures` de chaque Gaulois de `get_village`), seulement les plaques des objets que ce Gaulois porte, et seulement si son compte a un pseudo public unique dans la liste du clan, la règle de `partie_le` : le jour et les points d'une partie, croisés avec les sessions publiques du clan, donneraient l'identifiant OpenFront d'un membre anonyme. Pour un anonyme, la liste est vide, comme pour qui n'a rien gravé : la place ne dit pas qui est anonyme, ni ce qu'un membre possède sans le porter. `plaques_vues` de `get_ma_forge` dit au membre si les autres voient ses plaques.
- **Ce qui est gardé** : `internal.gaulois_gravures`, la plaque de chaque objet gravé (l'objet, le jour, le nombre de Gaulois, les points, l'heure de la gravure), jusqu'à ce qu'elle soit effacée, remplacée, ou que le compte soit effacé. La sauvegarde chiffrée ne la garde pas, par la règle de la sauvegarde : le jour et les points d'une partie désigneraient le joueur OpenFront d'un membre. Après une restauration, les plaques sont perdues ; leurs débits restent au journal comme les autres achats. La page Confidentialité le dit. Rien n'est écrit au journal de l'encadrement.
- **L'onglet Village de la Direction** : `get_village_economie` donne en plus `gravures` (`{ total, trente_jours }`, les statères dépensés à la forge), sous la règle des 5 comptes. Les « dépensés » restent ceux de la boutique et des pochettes. Comme distribués, moins dépensés, moins gravures, égale en circulation, la circulation est « pas donnée » tant que de 1 à 4 comptes ont gravé. Depuis l'intégration du 14 novembre 2026, l'onglet en montre la ligne « Payés à la forge » (`direction.ts` lit ce champ quand il est là).
- **Les appels** (`call()` de `src/lib/compte/api.ts`, réponse lue par `lireMaForge`) : `get_ma_forge` (compte connecté non suspendu) ; `graver_objet` avec `p_emplacement`, `p_objet`, `p_partie` (le champ `partie` d'une partie de `parties`, jamais montré) et `p_prix_vu` (le `prix` reçu) ; `effacer_gravure` avec `p_emplacement`, `p_objet`. Les trois répondent la forge à jour et ont la limite d'appels des gestes. Les plaques de la place et du vestiaire se lisent par `lirePlaques`.
- **Mise en ligne** : coller `.cache/a-coller-forge.sql` (fait par Claude, hors de Git : la migration seule, dans une transaction, notée dans `supabase_migrations.schema_migrations`), APRÈS le fichier du village et la garde-robe, puis **Run**. Sa dernière ligne doit dire : « forge : installée ». Puis publier le site. Pas de remise en ligne de la fonction `code-discord`. Avant le SQL, `npm run verifier:ligne` signale « La forge du village est installée » à regarder.
- **Essayé sans vrai compte** : la migration sur PGlite, toutes les migrations rejouées (108 contrôles : droits sous les vrais rôles, chaque refus, solde, prix changé, regraver, double clic, effacer, objet gravé au marché, double vendu, objet acheté au marché, plaques vues ou non selon le pseudo public, pseudo porté par deux membres, anonyme, en attente, suspendu, limite d'appels, effacement du compte, texte et jour à Paris comparés au site) ; le fichier à coller collé deux fois sur une base déjà peuplée (22 contrôles : données intactes, place, vestiaire, marché et économie identiques à avant hors des ajouts, règle des 5 comptes avec 1, 4 et 5 graveurs) ; 17 erreurs glissées exprès dans la migration, toutes repérées. Jamais sur le vrai projet, avec un vrai compte, ni avec un écran.

## La forge aux souvenirs : la fenêtre

**L'écran de la forge** (14 novembre 2026, design et écran : Claude Fable 5.2). La fenêtre « La forge » du monde du village (`src/components/village/monde/FenetreForge.tsx`, branchée dans `MondeFenetres.tsx` à la place de « La forge ouvre bientôt. » ; calculs purs dans `src/lib/village/ecran-forge.ts`, testés par `tests/unit/village-ecran-forge.test.ts` ; styles dans la section « La forge du village », dans `src/styles/feuilles/14-monde.css`).

- **Le parcours**, en deux vues dans la même fenêtre. D'abord la bourse (le solde) et le prix (« Une gravure : 150 statères », tous deux donnés par le serveur), puis « Choisissez un objet » : les cases du vestiaire, trois de front, les objets portés d'abord (marque « porté »), puis ceux qui ont déjà une plaque, puis les autres (`rangerLesObjets`). Un objet gravé porte la petite plaque dorée (`PLAQUE`) au coin de son image ; son texte est dans le nom de la case et au survol. Un clic mène à **l'établi** : le nom de l'objet, « Changer d'objet », la grande plaque dorée (`PLAQUE_GRANDE`, 8 pixels par case) avec le texte écrit par-dessus en vrai texte, une ligne par fait (`lignesDeLaPlaque` : « 12 novembre, » / « à quatre, » / « 2,33 points rapportés »), sombre sur l'or (7 pour 1 de contraste). Dessous, « Choisissez une partie » : une rangée par partie (des boutons radio), le `texte` que le serveur donne et l'heure de son début à Paris pour distinguer deux parties du même jour ; les 6 plus récentes d'abord, « Voir les parties plus anciennes » pour les autres. La partie choisie s'écrit aussitôt sur la plaque (« Aperçu de la plaque »). Le champ `partie` n'est jamais montré ni écrit dans la page : il ne sert qu'à l'appel.
- **Graver** : le bouton « Graver pour 150 statères » (« Regraver… » si l'objet a déjà une plaque) ouvre la confirmation, un vrai `<dialog>` de la famille de la boutique : « Graver pour 150 statères ? », la plaque, l'objet, « Elle remplace la plaque « … » » s'il y en avait une, puis le prix, la bourse et ce qu'il restera. Après la gravure : « C'est gravé », la plaque et « Il vous reste N statères ». Le prix envoyé (`p_prix_vu`) est celui que la confirmation a montré. Après un refus, le compte de l'ouverture s'efface : il ne reste que les mots du refus (`messageDeLaForge(code) ?? errorMessage(code)`) et « Fermer », et la forge est relue (après `prix_change`, le nouveau prix est partout). Le bouton s'éteint et dit pourquoi, en mots (`etatDuBouton`) : « Il vous manque 60 statères. », « Choisissez une partie. », « Cet objet porte déjà cette plaque. ».
- **Effacer** : gratuit, mais ne se rattrape pas. « Effacer la plaque » est à part, entre deux filets, sous tout le reste ; il ne part qu'au second clic (`clicSurBoutonArme`, `desarmerALaPerte` : le second clic d'un double clic ne compte pas ; Échap, un clic ailleurs ou le focus qui part désarment), et dit, une fois armé : « La plaque sera perdue, et ses statères ne reviennent pas. »
- **Les cas** : visiteur, la porte (une plaque vierge, « Connectez-vous pour graver vos parties sur vos objets. », la connexion par Discord ou par code, comme au vestiaire) ; compte en attente, « La forge s'ouvre une fois votre compte validé. » et « Voir mon compte » ; compte validé sans Gaulois, « La forge grave les objets de votre Gaulois. » et « Créez votre Gaulois », qui ouvre « Mon Gaulois » ; aucune partie, « Vos parties qui rapportent des points au clan viendront ici, prêtes à graver. » ; qui voit les plaques, d'après `plaques_vues` : « Sur la place, les autres membres voient les plaques des objets que vous portez. » ou « Votre pseudo n'est pas public : vous seul voyez vos plaques. ». Un compte en attente qui n'a pas encore donné son lien OpenFront est d'abord mené à « Mon Gaulois » par le monde, comme partout.
- **Quand elle se lit** : `get_ma_forge` part à l'ouverture de la fenêtre (jamais à l'arrivée sur la page), et de nouveau à chaque réouverture, sans rien effacer : la bourse, la tenue et l'inventaire ont pu changer au vestiaire ou au marché. Une gravure ou un effacement émet `gal:forge-plaques` (`PLAQUES_CHANGEES`) : le vestiaire, s'il est ouvert, relit ses plaques.
- **Le vestiaire** (`src/components/compte/Vestiaire.tsx`) : les plaques du compte viennent de `gravures` de `get_mon_gaulois` (`lirePlaques`, `plaqueDe`). La case d'un objet gravé, dans « À vous », porte la petite plaque au coin bas de son image ; « Gravé : 12 novembre, … » est dans son nom accessible et au survol (`motsDeLaPlaque`).
- **Accessibilité et calme** : le focus suit le parcours (au nom de l'objet quand l'établi s'ouvre, à la case quittée quand on en change, au titre de la confirmation à chaque étape, à l'établi après la gravure) ; une zone `role="status"` annonce la gravure et l'effacement ; Échap ferme la confirmation sans fermer la fenêtre. Aucune animation. Sur un téléphone, la fenêtre est le panneau qui monte du bas ; sur un grand écran, l'établi reste en vue pendant qu'on choisit une partie.
- **Essayé sans vrai compte** : build à faux serveur hors du projet, Chromium de Playwright à 1 920 × 1 080, 1 366 × 650 et 375 × 812, avec un faux serveur qui tient le solde et les plaques : graver, regraver, même plaque, effacer, chaque refus du serveur, panne, solde trop bas, prix changé, pseudo non public, en attente, sans Gaulois, visiteur, aucune partie, 100 parties, largeurs de 360 à 1 920 px ; axe sans erreur. Jamais avec un vrai compte ni sur le vrai projet.
- **Fait ensuite par d'autres** : les plaques sur les Gaulois de la place (survol, toucher et « Qui est où », `MondePlaques.tsx`) et la ligne « Payés à la forge » de l'onglet Village de la Direction.

## Le monde d'OpenFront autour du village

### Le port et les navires (`src/lib/village/openfront/port.ts`)

Lot « port » du monde d'OpenFront autour du village, dessiné case par case par Claude Fable 5.2 : des dessins originaux des idées du jeu (un port, des navires), sans aucune image d'OpenFront. Les matières du village (bois, pierre, corde) y rencontrent la tôle peinte, les rivets et la fumée. Tout est au format `DessinDeBatiment`, à l'échelle des Gaulois, et rien n'est tiré au hasard.

- **`port`** (460 × 212 cases, 4 images) : de gauche à droite, le phare, l'entrepôt de planches au toit de tôle (grande porte coulissante ouverte, enseigne « GAL »), la grue jaune sur portique avec une caisse au crochet, des tonneaux, une pile de caisses, six bittes d'amarrage, deux lampadaires, le mât de signaux et le pavillon du clan. La dernière rangée est le niveau de l'eau. La pierre va des colonnes 0 à 213, le ponton de bois sur pilotis de 214 à 455 (`PORT_PONTON`) : entre les pilotis, les cases sont vides et laissent voir l'eau du monde. Les Gaulois marchent sur la bande du quai, rangées 176 à 183 (`PORT_QUAI`) ; on passe sous la grue. Ce qui bouge : la fumée du poêle et le pavillon. La nuit : lanterne du phare (fixe, elle ne tourne pas et ne clignote pas), fenêtres, lampe de l'entrepôt, lampadaires, feux.
- **`navire-transport`** (236 × 142), **`navire-guerre`** (330 × 154), **`navire-commerce`** (300 × 148) : vus de côté, proue à droite, 4 images ; la dernière rangée est la ligne de flottaison, les 30 rangées du haut (`NAVIRE_MARGE`) sont pour la fumée. Aux images 2 et 3, le navire s'enfonce d'une case ; le pavillon ondule, la fumée monte, le radar du navire de guerre fait un demi-tour. La nuit : hublots, passerelle et feux de position allumés.
- **`navire-ennemi`** (330 × 154, 4 images) : le navire de guerre du clan d'en face, inventé, en prune et ocre (`prune` de `paletteDuDehors`), sans nom ni lettres, proue à gauche.
- **`tir-canon`** (64 × 44, 5 images) : la bouffée au bout d'un canon ; la bouche est au milieu du bord gauche (`TIR_BOUCHE`), le coup part vers la droite (à retourner pour l'ennemi). Le feu grossit en orange et jaune (images 0 et 1), retombe dans sa fumée (2), puis la fumée seule se défait (3 et 4) : pas d'éclair blanc. À jouer une seule fois, sans boucle.
- **`obus`** (14 × 5, 2 images) : le projectile, pointe à droite, un petit sillage.
- `NAVIRE_GUERRE_BOUCHES` donne les cases des bouches des canons du navire de guerre (ajouter 1 à `y` aux images 2 et 3 ; pour l'ennemi, `x` devient `329 − x`).

### Le chemin de fer autour du village (`src/lib/village/openfront/train.ts`)

Demande du pilote du 14 novembre 2026 : « des éléments OpenFront […] train ». Sept pièces au format `DessinDeBatiment`,
à l'échelle des Gaulois (48 × 64 cases), dans `LOT_TRAIN`. Ce sont des dessins originaux de l'idée du train, faits case
par case pour ce site : aucune image d'OpenFront n'a été ouverte ni recopiée, rien ne vient d'une autre œuvre. Les
matières sont celles du village (pierre, bois, torchis, chaume de `paletteDuDehors`), avec du fer riveté, du laiton, du
cuivre et du verre. Les couleurs sont celles du blason du clan (bleu nuit, bleu, blanc, rouge) ; chaque couleur du dehors
suit l'heure par `couleurDuDehors`. Ce qui éclaire (fenêtres, lanternes, fanal, foyer, guichet) garde sa couleur et ne
s'allume que quand le jour baisse. Rien n'est tiré au hasard. Design : Claude Fable 5.2.

| Pièce | Taille (cases) | Images | Ce qu'on y voit |
|---|---|---|---|
| `gare` | 344 × 178 | 1 | Salle d'attente (soubassement de pierre, colombages, chaume, lucarne à horloge, enseigne « GARE », porte ouverte de 74 cases sur le guichet, deux fenêtres à volets bleus), quai de pierre haut de 10 cases, marquise de fer et de verre sur trois colonnes, lambrequin, trois lanternes pendues et une à la porte, banc, barrière, tableau des horaires (des traits, pas de texte), tonneau, caisse, malle, bidons de lait, cloche, fanion bleu blanc rouge, panneau « LES GAULOIS ». La nuit, les lanternes réchauffent ce qui les entoure. |
| `rail` | 48 × 14 | 1 | Rail, selles, bouts des traverses tous les 12 cases, ballast, brins d'herbe. Se répète bout à bout sans raccord. |
| `viaduc` | 168 × 190 | 1 | Une arche de pierre de taille (ouverture de 120 cases, piles de 48), claveaux, clef de voûte, imposte, corniche à modillons, ancres de fer, lierre et mousse au pied, la voie dessus. Se répète bout à bout sans raccord (une demi-pile à chaque bord). |
| `locomotive` | 195 × 146 | 4 | Locomotive à vapeur bleu nuit, avant à droite : trois roues motrices rouges, bielles, cylindre, chaudière cerclée de laiton, dôme, cheminée, fanal, abri marqué « GAL ». À chaque image, les roues font un quart de tour, les bielles suivent, la fumée monte et file vers l'arrière ; la boucle est sans saut. |
| `wagon-marchandises` | 132 × 92 | 2 | Wagon couvert bleu, porte blanche entrouverte sur une caisse et un sac. |
| `wagon-citerne` | 132 × 92 | 2 | Cuve blanche aux bandes bleue et rouge, dôme, passerelle, échelle. |
| `wagon-voyageurs` | 132 × 96 | 2 | Voiture rouge, crème et bleu nuit, six fenêtres éclairées la nuit. |

Repères pour poser les pièces (`REPERES_DU_TRAIN`, exporté par le même fichier) :

- **Le dessus du rail est la première rangée** de `rail` et de `viaduc`. La **dernière rangée d'une pièce roulante est
  le bas de ses roues** : on la pose juste au-dessus de cette première rangée (`y du train + sa hauteur = y du rail`).
- **Attelage** : les quatre pièces roulantes se posent bout à bout, sans espace ni recouvrement ; les tampons se
  touchent, leur milieu est à 23 cases au-dessus de la dernière rangée, les deux moitiés de la chaîne se rejoignent.
  Ordre conseillé, de gauche à droite : marchandises (bleu), citerne (blanc), voyageurs (rouge), locomotive : le train
  fait le drapeau. Train entier : 591 cases de long.
- Les roues des wagons ont 2 images, celles de la locomotive 4 : donner le même compteur d'images à toutes les pièces
  (chacune le ramène à son nombre d'images). L'image 0 est celle qui reste quand tout est figé.
- La locomotive mesure 101 cases de haut sans sa fumée ; au-dessus, il n'y a que la fumée.
- Le viaduc : sous sa rangée 94 (comptée du haut), il ne reste que les piles ; on peut les enterrer dans le sol ou dans
  l'eau pour un viaduc moins haut.
- La gare : le quai est à 10 cases au-dessus de la dernière rangée (un Gaulois qui attend a les pieds dessus) ; le
  milieu de la porte est à la colonne 78, le milieu du banc à la colonne 235 ; le centre de l'horloge est à la colonne
  78, rangée 59, cadran de rayon 9. L'horloge est peinte arrêtée à 10 h 10 : c'est un décor, pas une heure.

### L'usine et la défense (monde d'OpenFront autour du village)

`src/lib/village/openfront/defense.ts` (objet `LOT_DEFENSE`, design Claude Fable 5.2) : huit pièces au format
`DessinDeBatiment`, à l'échelle des Gaulois, dessinées case par case pour ce site. Ce sont les idées du jeu (usine, silo,
missile, défense), jamais ses images : aucun fichier d'OpenFront n'a été ouvert ni recopié. Les couleurs du dehors suivent
l'heure ; verrières, lampes, voyants et feu gardent la leur et ne clignotent jamais.

| Pièce | Taille (cases) | Images | Ce qui bouge |
|---|---|---|---|
| `usine` | 336 × 240 | 4 | la fumée des trois cheminées (3 cases par image), deux caisses d'obus sur le tapis roulant (6 cases par image) |
| `silo` | 240 × 122 | 4 | la trappe à deux vantaux : fermée (0), 30, 60 puis 90 degrés (3) |
| `missile` | 24 × 114 | 2 | la flamme ; le corps fait 86 rangées, la flamme les 28 du dessous |
| `batterie` | 250 × 132 | 4 (+ 4 de tir) | l'antenne du radar (un huitième de tour par image) ; `dessiner(lumiere, 4)` à `(lumiere, 7)` : le tir d'une fusée, à passer une seule fois |
| `poste-defense` | 210 × 136 | 4 | le drapeau du clan |
| `ville-lointaine` | 480 × 110 | 1 | rien (fond en parallaxe, trois plans bleutés, fenêtres allumées la nuit) |
| `explosion` | 160 × 160 | 8 | la boule de feu gonfle (0 à 2), la fumée sombre la gagne (3, 4), monte et se défait (5 à 7) ; débris de bois et de toile prune |
| `interception` | 80 × 80 | 5 | la même en petit, en l'air, fumée claire, morceaux du missile qui retombent |

Les repères pour poser les pièces sont exportés dans `REPERES_DEFENSE` (cases comptées depuis le coin en haut à gauche de
chaque dessin) : bouches des cheminées de l'usine (86, 62), (150, 44) et (224, 80), son portail et le départ du tapis ;
bouche du silo, colonne 120 et rangée 78 (le missile se pose derrière le silo, son milieu sur cette colonne, et ne se
voit qu'au-dessus de cette rangée ; trappe grande ouverte à l'image 3, 40 cases entre les vantaux pour un missile de 24) ;
milieu de l'antenne du radar (206, 28) ; bouche du tube de la batterie (74, 40), la fusée part vers le haut à gauche à
26 degrés ; pied de l'explosion (80, 159) ; milieu de l'interception (40, 38).

Le combat a été voulu par le pilote le 14 novembre 2026 (« tir et explosion, le missile monte exploser »). Limites
gardées : ni sang, ni victime, ni personnage blessé, pas de champignon atomique, et aucun éclair — le feu n'est jamais
blanc (du rouge au jaune pâle), la clarté ne change que peu à peu d'une image à l'autre. Les couleurs du clan (bleu,
blanc, rouge sur bleu nuit, lues sur le blason de `public/brand/`) sont sur le missile, l'enseigne de l'usine, la
batterie et le drapeau du poste.

## Entrer dans les bâtiments (15 novembre 2026)

Le pilote a choisi cette idée de Claude Fable 5.2 le 15 novembre 2026, dans une liste d'usages pour son crédit de l'API
Claude. Les dessins ont été faits par des agents de Claude Code, sans ce crédit. Quand les points rapportés au clan
finissent un bâtiment du chantier, on peut y entrer : une fenêtre montre son dedans, dessiné case par case et vu de côté
comme une maison de poupée, avec le Gaulois du visiteur debout dedans. Un bâtiment pas encore fini ne s'ouvre pas : son
intérieur se découvre le jour où le chantier le termine.

### Les dessins (design : Claude Fable 5.2)

Le contrat est dans `src/lib/village/interieurs/type.ts`. Sept bâtiments ont un vrai dedans (`BATIMENTS_A_INTERIEUR`).
La palissade, le puits, le potager, le pont, le lavoir, la halle (ouverte entre ses poteaux), le grand chêne et le
rempart n'en ont pas. Chaque dessin fait de 320 à 480 cases de large et de 180 à 270 de haut, à l'échelle des Gaulois,
donc plus grand que son dehors. Il en reprend les matières et les formes, vues de près, et toutes ses cases sont pleines.

| Id | Titre | Taille | Images | Ce qui bouge |
|---|---|---|---|---|
| `four` | Dans le fournil | 400 × 236 | 3 | la fumée du conduit, la buée des pains |
| `tour` | En haut de la tour de guet | 360 × 264 | 4 | le fanion du clan à la pointe du toit |
| `grenier` | Dans le grenier | 400 × 232 | 4 | la queue du chat sur le coffre |
| `moulin` | Dans le moulin | 440 × 264 | 4 | la roue, l'arbre, le rouet, la lanterne, la meule, le grain, la farine, l'eau |
| `colombier` | Dans le colombier | 320 × 270 | 4 | les pigeons qui picorent tour à tour |
| `etable` | Dans l'étable | 440 × 210 | 4 | les vaches qui baissent la tête à leur tour |
| `grande-tour` | Dans la grande tour | 360 × 270 | 2 | les plis de la bannière du clan |

- **Lot 1** (`lot-1.ts`) : des coupes, le chaume tranché en haut, le ciel de l'heure autour, la terre tranchée en bas.
  - Le fournil a le dôme du dehors en grand : la gueule où la braise rougeoie, les pains qui refroidissent, le pétrin, les sacs de farine et leur chat.
  - La tour de guet est sa plateforme. On y voit le coin du guetteur, la corne, la cloche et le pays vu de haut, qui suit l'heure. Son fanion est bleu nuit, les trois couleurs seulement à la hampe.
  - Le grenier : les lames de lumière entre les planches, les sacs, le van, la souris sous les pilotis.
  - Le moulin est vu tourné d'un quart, pour que l'arbre de la roue traverse le mur et mène le rouet, la lanterne et la meule.
- **Lot 2** (`lot-2.ts`) : les deux tours sont rondes, et une même projection courbe le mur, le sol et le plafond.
  - Le colombier : neuf rangs de nids, le mât tournant et son échelle.
  - L'étable : le fenil, la vache fauve du dehors, une vache pie et un veau.
  - La grande tour est la salle de garde. Au mur, la grande bannière bleu nuit « GAL » à frange d'or, avec un râtelier de lances et l'escalier vers la trappe.
- **La lumière** : chaque dessin est fait aux couleurs du plein jour, puis éclairé.
  - Ce qui est dedans suit `couleurDuDedans`, ce qui est dehors suit `couleurDuDehors`.
  - Le jour, le soleil entre par les ouvertures (rougi à l'aube et au crépuscule).
  - Quand le jour baisse, une lanterne par pièce et la gueule du four s'allument, sans bouger ni clignoter.
- **Le reste** : rien n'est tiré au hasard. Aucun texte ni chiffre, sauf les lettres « GAL » de la bannière, comme dehors. Un dessin coûte de 50 à 90 ms. Le lot 2 garde ses derniers dessins en mémoire ; la fenêtre garde le plein jour de la pièce ouverte (voir plus bas).

### La fenêtre (code : Claude Opus 5.5)

- **Qui peut entrer** (`src/lib/village/ecran-interieur.ts`, `interieursOuverts`) : un bâtiment fini (`fini_le`) dont le
  dedans est dessiné (`interieurDe`), dans l'ordre du chantier. Sans données du chantier, rien ne s'ouvre.
- **Trois chemins pour entrer** :
  - un bouton posé sur le bâtiment dans le monde, « Entrer dans le four à pain » (`data-interieur`), au clic, au toucher ou au clavier ;
  - le bouton « Entrer » de la fenêtre du chantier ;
  - l'adresse `#interieur-<id>`. Celle d'un bâtiment fermé ou inconnu laisse le monde seul.
- **La fenêtre** (`FenetreInterieur.tsx`, sur le cadre commun des fenêtres du monde) : le titre du dessin, Échap, une
  seule fenêtre à la fois. Le focus revient au bâtiment à la fermeture. La toile est `aria-hidden`. À côté, pour les
  lecteurs d'écran seulement : « Le dedans du four à pain, dessiné en pixels. »
- **La taille d'une case** (`dedansALEcran`) : le plus grand nombre entier de pixels de l'écran qui laisse tout le dessin
  tenir. Ce sont des pixels de l'écran, pas de la page : c'est ce qui garde les cases nettes à 125 % sous Windows et sur
  téléphone. Mesuré : 2 pixels à 1 280 × 800, la fenêtre resserrée autour du dessin. Si même un pixel ne tient pas, le
  dessin est réduit et adouci (`data-net="false"`).
- **Lumière et mouvement** : le dessin suit la lumière du village, relue à la minute. Il change d'image une fois par seconde au plus. En pause ou avec « réduire les animations », il reste sur l'image 0. Page cachée, rien ne tourne.
- **Le Gaulois du visiteur** (`dedansAvecLeGaulois`) :
  - seulement celui que `get_village` marque `moi`, jamais un autre : debout, dans sa tenue, tourné vers la droite, avec son ombre, ses 64 cases posées sur `place.pied` ;
  - il est éclairé comme la pièce là où il se tient (`lumiereDeLEndroit` : le dessin à cette lumière comparé au même en plein jour, gardé pour la pièce ouverte), jamais plus clair qu'en plein jour. La nuit, il garde environ la moitié de ses couleurs dans le four, les trois quarts dans l'étable ;
  - un visiteur, ou un membre sans Gaulois, voit la pièce vide.
- **Tests** :
  - `tests/unit/village-interieurs-fenetre.test.ts` : qui entre, adresse, pixel par case sur des milliers de tailles et six densités, image, Gaulois posé et éclairé ;
  - `village-interieurs-dessins.test.ts` : le contrat de chaque dessin ;
  - `village-interieurs-lot-1.test.ts` et `village-interieurs-lot-2.test.ts` ;
  - `tests/e2e/village.spec.ts` : clavier, clic, Échap, focus, adresse, « Entrer » du chantier, pause, axe, de 360 à 1 920 px. Ces tests trouvent les bâtiments ouverts dans la page.
- **Limites** :
  - jamais vu sur un vrai téléphone ni avec un vrai compte ;
  - à 1 920 × 1 080, la largeur des grandes fenêtres limite les dessins larges à 2 pixels par case ;
  - comme les grandes fenêtres, celle-ci peut couvrir les boutons d'approche, jamais la mention d'OpenFront.

## L'almanach des petits moments (15 novembre 2026)

Le pilote a choisi cette idée de Claude Fable 5.2 le 15 novembre 2026, avec 650 moments. De temps en temps, un moment rare
passe dans le monde : une charrette de foin, un vol d'oies, la brume du matin sur le ruisseau. On ne revoit presque
jamais le même.

C'est un décor animé, comme les événements d'OpenFront :
- rien ne vient d'une vraie partie ni d'un membre ;
- rien ne change une valeur, aucun texte ne s'affiche ;
- rien ne se passe en pause, avec « réduire les animations » ou page cachée.

Contrat : `src/lib/village/monde/almanach/type.ts`.

### Les figurants (design : Claude Fable 5.2)

`figurants.ts` réunit 50 dessins originaux, case par case, à l'échelle des Gaulois, tournés vers la droite, de 1 à 4
images. Ils sont rangés par milieu, chacun dans son fichier `figurants-<milieu>.ts`, avec la boîte à dessin dans
`figurants-outils.ts` :
- **ciel** : 12 (oies, étourneaux, cigognes, corbeaux, mouettes, buse, héron, hirondelles, arc-en-ciel, chouette, chauves-souris, étoile filante) ;
- **eau** : 11 (canards, cygne, héron au gué, poisson, barque, bois flotté, libellules, grenouille, martin-pêcheur, loutre, bateau d'écorce) ;
- **sol** : 10 bêtes (lapin, renard, hérisson, biche et faon, écureuil, chat, faisan, moineaux, papillons, lucioles), et 6 gens de passage (colporteur, berger et moutons, porteur de lanterne, pêcheur, gardeuse d'oies, porteur de fagot) ;
- **toits** : 5 ;
- **nappes** : 6 (brume du matin, brume sur l'eau, pluie fine, feuilles, fumée qui traîne, aigrettes).

Ils ne refont pas les bêtes de `betes.ts`. Il n'y a pas de sanglier, et rien ne dit une saison. Les gens de passage, sous
capuche, chapeau ou coiffe, ne ressemblent à aucun Gaulois de membre, et leur description pour l'API le redit.

### Le moteur (code : Claude Opus 5.5)

- **Les lieux** (`ancres.ts`) : 24 points du premier plan, du bas et du ciel, sans les terrasses du fond. Chacun a :
  - sa phrase pour l'API, son milieu et sa place autour ;
  - ses zones par milieu (au gué, l'eau et la rive suivent le vrai lit du ruisseau) ;
  - les bâtiments qu'il demande (devant le moulin, le lavoir, le colombier…).

  Les 24 se posent dans le monde de 0 à 1 000 Gaulois.
- **Les réglages des figurants** (`reglages-figurants.ts`) :
  - le pêcheur, assis sur la rive, son fil sur l'eau, ne se retourne pas ;
  - l'étoile filante et la fumée ne vont que vers la droite ;
  - le pied d'un figurant d'eau est dans l'eau ;
  - chacun garde ses heures.
- **Le moment** (`moment.ts`) : un titre (jamais affiché), des phases de la journée, des bâtiments, un lieu, une durée de
  15 à 120 secondes, et 1 à 4 rôles faits d'étapes (`t`, `x`, `y`, opacité). `validerMoment` rend la raison de chaque
  refus (19 raisons). Elle contrôle :
  - la vitesse selon l'allure : posé 0, lent 4, au pas 12, en vol 40 cases par seconde ;
  - l'entrée et la sortie en fondu, l'opacité changeant de 0,5 par seconde au plus ;
  - le sens imposé, et le pied dans sa zone, huit fois par seconde, comme l'écran le pose.

  `sontDoublons` écarte le même passage au même lieu.
- **Le jeu** (`jeu.ts`, `MondeVie.tsx`) : des lignes droites à vitesse égale. Le figurant se tourne du côté où il va, ses
  images tournent lentement, il se range par la rangée de son pied, et ce qui vole passe devant le décor. Ses dessins sont
  gardés par lumière. `moments.json` est chargé à part, seulement quand le monde s'anime.
- **Le programme** (`programme.ts`) :
  - tout suit l'heure réelle, la même pour tous ;
  - un créneau toutes les vingt minutes, une minute après le premier échange de tirs et une minute avant le second ;
  - quand un moment y passe, le missile de ce cycle ne part pas, et rien ne joue jamais en même temps ;
  - chaque jour de Paris a son ordre des moments ;
  - un moment ne vient qu'à sa phase et quand ses bâtiments sont finis (`MondeScene` passe l'état du chantier), et il ne repasse pas dans la journée tant qu'il en reste d'autres ;
  - sans moments, rien ne change.

### L'écriture par l'API Claude, une seule fois

C'est le seul usage de l'API Claude hors des bulles, demandé par le pilote (règle de `CLAUDE.md`).

- **Le modèle** : Claude Fable 5.2, effort `medium`, par l'API Message Batches (moitié prix), en sortie structurée
  (`ecriture.ts`, `scripts/almanach-ecrire.ts`).
- **La consigne** : le catalogue des 50 figurants avec leurs règles, les 24 lieux, les règles et deux exemples validés.
  Elle ne contient aucune donnée du site, aucun membre, aucun chiffre du clan, et un test vérifie qu'elle ne lit ni le
  disque ni le réseau.
- **Les requêtes** : 65 requêtes de 10 moments, chacune avec sa graine (une phase, trois lieux, une forme). Puis
  validation, doublons écartés, et deux lots de complément au plus, jusqu'à 650 moments gardés dans `moments.json`. Le
  journal de l'écriture est dans `ecriture.json`.
- **L'argent** :
  - le plafond est dans `config/almanach.json` (60 $) ;
  - avant chaque envoi, le pire coût (chaque requête à 32 000 jetons de sortie) doit tenir sous ce qui reste ;
  - le pire cas du premier lot est de 54,18 $ ; le coût réel estimé, de 15 à 25 $ ;
  - une réponse sans `usage` compte sa part du pire coût ;
  - les essais sont comptés sous le même plafond.
- **Jamais deux fois** : chaque lot créé est noté dans `lots_connus`. Avant d'en créer un, les lots récents du compte sont
  relus, et un lot inconnu arrête tout. Le lot est créé sans nouvel essai du SDK.
- **L'Action** (`.github/workflows/almanach.yml`) :
  - elle ne part que sur un push de la branche `robot/almanach`, jamais sur `main` ni à heure fixe ;
  - elle commite `moments.json`, `ecriture.json` et `essai.json` sur cette branche ;
  - avec `"essai": true` dans `config/almanach.json`, elle ne fait qu'une requête, écrite dans `essai.json`, pour regarder les moments avant de payer le lot ;
  - un lot pas fini reste noté en route (sortie 2), et un nouveau push le reprend sans le renvoyer.
- **Tests** : `tests/unit/village-almanach-*.test.ts`, avec un faux client. Ils couvrent les ancres à 0, 1, 50, 300 et
  1 000 Gaulois, chaque règle de validation, le programme, la consigne sans données, le plafond, les lots inconnus du
  compte et les réponses sans `usage`.

### L'écriture faite (15 novembre 2026, nuit)

- **L'essai** (run 43661380946) : une requête, 10 moments lus, 10 valides, 0,49 $. Regardés dans le vrai monde sur des
  planches : le pêcheur lance au gué, le colporteur passe devant le moulin avec un chat, la biche et son faon traversent
  la lisière.
- **Le lot** (run 43661651687) :
  - premier lot : 65 requêtes, 650 moments lus et tous valides, dont 460 gardés et 190 doublons écartés (14,46 $) ;
  - complément : 33 requêtes, 329 valides sur 330 (un titre refusé), 190 gardés (8,24 $) ;
  - aucune requête perdue.
- **Ce qu'on a** : 650 moments gardés pour 23,18 $ en tout, essai compris, sous le plafond de 60 $ (`ecriture.json`).
  Les 50 figurants, les 24 lieux et les quatre moments de la journée sont tous servis : 258 moments de jour, 208 de nuit,
  184 au crépuscule et 162 à l'aube, un moment pouvant valoir pour plusieurs.
- `essai.json` est resté sur la branche `robot/almanach` : le site ne le lit pas.

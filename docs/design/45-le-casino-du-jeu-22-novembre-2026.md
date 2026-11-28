<!-- Partie de docs/DESIGN.md : « Le kit du jeu (21 novembre 2026) » › « Le casino du jeu (22 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### Le casino du jeu (22 novembre 2026)

`/village#casino`, « Le casino » : six jeux en statères (sept avec le poker du barde, 28 novembre 2026 : cinq cartes du vingt-et-un sur le feutre, la carte gardée monte avec son étiquette d’or, le conseil du barde cerne d’or ce qu’il garde, la table des gains allume la main sortie ; classes `pk-*` ; « Mon bilan » sous les jeux du hall, classes `cas-bilan-*`) dans la direction « Le Palais d'or » choisie par le pilote (« fais en
sorte que ça reste cohérent avec le reste du Mon Gaulois »), pixel de luxe, laque noire, or et bordeaux la nuit, ivoire et or
le jour (le pourpre de la maquette est devenu bordeaux, « le velours de théâtre, plus chaud », choix du pilote du soir
du 22 novembre 2026). Maquettes jouables de Claude Fable 5.2, validées, **portées telles quelles** : mêmes dessins, mêmes mouvements, mêmes
lumières, mêmes sons ; ne pas les changer sans la demande du pilote. Code de Claude Opus 5.5. Le serveur tire tout, d'abord
(contrat `src/lib/village/contrat-casino.ts`, « Le casino des Gaulois » de `docs/DIRECTION.md`) ; l'écran ne fait que montrer.

- **Le bordeaux** (soir du 22 novembre 2026) : le pourpre de la maquette est devenu le bordeaux d'un velours de théâtre
  (rampes `BORDEAUX` et `ROSE`, `JOUR` réchauffé en ivoire rosé, bouton et ruban reteints couleur à couleur par
  `BORDEAUX_DU_BOUTON` et `BORDEAUX_DU_RUBAN`, panneaux de nuit en laque bordeaux presque noire). Tons posés par Claude Opus
  5.5 sur la réponse du pilote (« Opus maintenant ») pendant que Claude Fable 5.2 était à sa limite. La relecture prévue pour
  Fable n'a plus lieu : le pilote a tranché « fini avec opus », et Opus a fait les finitions le 23 novembre 2026, sur
  captures avant et après de chaque jeu : le lustre du velours (tons 5 à 8 de `BORDEAUX`) remonté vers la clarté du pourpre
  de la maquette, le feutre (tons 2 à 4) inchangé ; la laque `NOIR` passée du bleu nuit à un noir à peine chaud aux reflets
  gris froid ; le jeton de 200 en velours des tons 5 et 6, qui se détache de la laque de nuit et du rubis du 20 ; une case
  perdue se voile (`cas-eteint` : moins de couleur, un peu moins de lumière, comme un insigne éteint du kit) au lieu de
  s'assombrir, et son chiffre crème passe au-dessus de AA (environ 6 de contraste, 4 avant) ; la piste de nuit de la course
  en gris de lune, plus en lavande ; les mots des grandes cases des dés et de la table des gains de la machine à la hauteur
  de leurs cases (avec la hauteur de ligne du site, ils touchaient le biseau ou le halo d'une case gagnée), et une ligne
  perdue de la machine voilée comme toute case perdue. Sans autre changement que la rampe : `ROSE`, `JOUR`, le bouton et le
  ruban bordeaux, la palissade (argent, bois, étiquette neutre d'un rendu partiel), les multiples en crème des dés et le
  vingt-et-un (son dos de cartes, ses enseignes tissées et le jeton de sa caisse prennent les nouveaux tons 5 et 6). Toute
  écriture garde AA dans les deux thèmes (test dans `jeu-casino.test.ts`). Un jeu ne recopie jamais une couleur : il passe
  par les rampes et les jetons `--cas-*`.
- **Les pierres du tapis et leur écriture** (23 novembre 2026) : survolée, une pierre (rouge, bleue, verte) s'entoure d'or et
  son biseau s'éclaire, mais son cœur garde son ton : il s'éclaircissait et faisait tomber le chiffre crème et les multiples
  d'or sous AA (jusqu'à 1,5 sur l'émeraude). L'émeraude a un cœur plus profond (ton 2) que le rubis et le saphir (ton 3).
  Un test vérifie le crème et l'or sur chaque pierre, au repos, survolée et voilée (`cas-eteint`, filtre lu dans la feuille).
- **Dans le vrai cadre du jeu** : la barre, le menu (une entrée de plus, « Le casino », icône d'un dé d'os sur un statère,
  « Nouveau » jusqu'à la première ouverture sur l'appareil), le paysage. L'onglet ne paraît que si le serveur répond à
  `get_casino` (`casino/acces.ts`), et, mise en ligne en deux temps (23 novembre 2026), au seul pilote tant que
  `CASINO_POUR_TOUS` est faux : il essaie la roue avec son vrai compte pendant que les autres jeux sont portés ; la
  constante est passée à vrai le 23 novembre 2026 avec la grande nouveauté : l'onglet paraît à tout compte qui peut jouer (`peut_jouer`). Ses écrans ne se chargent qu'à l'ouverture de sa partie. La salle est un `jeu-ecran` aux
  matières du palais, son enseigne un ruban bordeaux qui dit le jeu ouvert.
- **Le hall** (`Hall.tsx`) : les catégories (tables, machines, courses) en boutons bordeaux, l'or pour celle qui est choisie ;
  la bannière « À l'affiche » (le palais, ses colonnes, ses tentures, ses lustres, la grande roue sur sa table, le croupier en
  pied) ; les six vignettes, chacune avec son croupier en médaillon et ce que le jeu rend en moyenne ; « Vos dernières
  parties », les six plus récentes du compte lues au serveur (mise, rendu, solde de la partie) ; le jeu juste en trois lignes, les
  règles en pli, et ce qui a été misé aujourd'hui, lu au serveur (sur le plafond du jour tant qu'il y en avait un : aucun depuis le 27 novembre 2026). Jamais rien d'un autre compte.
- **Une seule bourse, celle de la barre.** Un jeu l'annonce en deux temps, avec les nombres du serveur : la mise prise dès la
  réponse (`prendreLaMise`), le gain une fois le résultat montré (`finDeTour`, `solde_apres`). La barre ne montre jamais un
  résultat avant l'animation. En essai GOD, une étiquette « Essai » ; rien n'est misé ni rendu.
- **Le commun des jeux** : le pupitre (jetons de 10 à 200, « Sur la table n sur 200 », reprendre, tout reprendre, « mêmes
  mises », le bouton d'or ; il prévient avant le serveur : table, reste du jour, bourse), le croupier (un vrai Gaulois du clan
  habillé de la garde-robe, cinq visages, son annonce lue aux lecteurs d'écran), la plaque du résultat à cinq niveaux (rien,
  rendu partiel, mise rendue, gain, grand gain : l'or et le « + » seulement pour un gain ; son chiffre saute), la pluie lente
  de statères des grands gains, les sons (famille des boosters, rien au-dessus de 7 400 Hz).
- **Un jeu se met en page d'après sa table**, pas la fenêtre : `.cas-table` est le conteneur `casino` des requêtes de conteneur
  (les largeurs de la maquette, faite pour un cadre : 1 540 px à 1 920, 1 060 à 1 440, 310 à 390).
- **La roue du charron** (`Roue.tsx`, `casino-roue.ts`) : la roue peinte point par point, sa lumière fixe pendant que les
  cases tournent dessous, la bille qui court, descend, tinte contre les cloisons et tombe dans la case que le serveur a tirée
  (`mouvementDeLaRoue`, testé : elle finit toujours sur ce numéro) ; le tapis en long sur une table large, en hauteur sur une
  table étroite ; « Vos tours » ; les jetons gagnants qui restent un instant, les autres qui s'effacent. Rouge et bleu se
  disent aussi par une forme : l'icône du coin (losange, rond) sur une case large ; sur une case étroite, où cette icône
  chevauchait le chiffre, et dans « Vos tours », qui n'avait que la couleur, une marque de 5 cases sous le chiffre, comme
  l'index d'une carte : losange plein, anneau percé (`--cas-marque-losange`, `--cas-marque-rond` de `casino-pieces.ts`,
  dessin de Claude Opus 5.5, 23 novembre 2026). Une case étroite du tapis en hauteur (38 px) tient tout juste le chiffre,
  l'écart et la marque : n'y rien ajouter.
- **Le vingt-et-un** (`VingtEtUn.tsx`, sa table `scene-vingt-et-un.ts`, dessins `casino-vingt-et-un.ts`, sons
  `casino-vingt-et-un-sons.ts`, mots `src/lib/village/ecran-vingt-et-un.ts`) : le jeu de cartes gaulois (torques, flammes,
  épées, chênes ; valet, dame et roi en vrais Gaulois du site, habillés de la garde-robe, identiques point par point à la
  maquette ; dos de velours bordeaux), le donneur et ses visages, la carte cachée qu'il soulève sur un as ou un 10, les
  totaux en pastille (« 7 ou 17 »), l'étiquette de chaque main, les jetons qui arrivent sur le rond et en repartent, la
  lueur d'or et la pluie lente du 21 d'entrée. Le serveur tire chaque carte au moment de la donner ; l'écran montre ses
  faits dans l'ordre, et chaque carte montrée est celle du serveur. Doubler et séparer se ferment quand le complément
  dépasse la bourse ou le reste du jour (sauf en essai GOD). Le druide conseille d'après les seules cartes visibles. Une
  main laissée ouverte (jeu quitté, page rechargée) se pose d'un coup et reprend où elle était (`lire_vingt_et_un`).
  Au clavier, le focus va à « Tirer » après la donne et à « Rejouer » après la main.
- **La machine du forgeron** (`Machine.tsx`, `casino-machine.ts`) : la machine de laque et d'or peinte à deux tailles (le
  forgeron sur son socle à partir de 1 240 pixels de table), sa table des gains peinte et en grand sur le feutre (une seule colonne sous 920 pixels de table, où la grande machine
  écraserait le pupitre). Le levier
  s'attrape et se tire (il résiste, cède, remonte en ressort), ou un clic, Entrée, Espace ; en bas, la mise part et le serveur
  tire le résultat et les neuf cases (`jouer_machine`), puis les rouleaux tournent et s'arrêtent de gauche à droite, avec un
  rebond, sur ces cases (`bandeDuRouleau`, `posDuRouleau`, testés). Les statères tombent dans le bac, un par dizaine gagnée ;
  la fête des 20 et 100 fois (fanion, lueur, deux pluies pour 100). La mise est le jeton choisi : le pupitre n'a ni
  « reprendre » ni « mêmes mises » (son double `usePupitreDeLaMachine` prévient comme celui du commun). « Voir chaque gain » :
  des coups d'essai tirés dans le navigateur, sans appel au serveur, « Rien n'est compté ».
- **Les dés** (`Des.tsx`, `casino-des.ts`) : la piste de velours vue de trois quarts, le croupier, son renardeau et son
  cornet de cuir et d'or ; le cornet secoué puis versé, les deux dés d'ivoire qui tombent, se cognent et basculent vers les
  faces tirées par le serveur (`jouer_des`), tournés dès le départ pour y finir (`unDe`, `etatDuDe`, testés pour les 36
  tirages) ; la plaque d'or de la somme. Le tapis de quatorze paris, onze de front ou six sur une table étroite ; les cases
  gagnantes se dorent et gardent leur chiffre (les multiples y passent en crème pour rester AA), leur gain écrit dessus.
- **La course des familiers** (`Course.tsx`, `casino-course.ts`) : six vrais familiers du site (les dessins du dépôt, tournés
  vers la droite), une plaque d'or par couloir avec sa cote, un seul couloir par course ; le serveur tire le gagnant, puis la
  course est écrite pour lui (`ecrireLaCourse` des règles du serveur) : il passe la ligne le premier, personne ne recule ni
  ne saute (testé, image par image). Le champ de courses de trois quarts (pré, gué, forêt, tribune d'or de vrais Gaulois), la
  caméra qui glisse avec le meneur sans zoomer, la corde où chaque couloir avance, le croupier qui commente à mi-course et
  dans la dernière ligne droite, le galop, la tribune et le tambour. Au repos, la scène vit lentement (14 images par
  seconde : nuages, tribune), rien en pause.
- **La palissade** (`Palissade.tsx`, `casino-palissade.ts`) : le grand panneau de laque, son triangle de velours bordeaux,
  huit rangées de pieux d'or au-dessus de neuf coupes ; la chute suit pieu par pieu le chemin tiré par le serveur (les pieux
  frappés s'enfoncent d'un point et s'éclairent) et finit toujours dans sa coupe (testé sur les 256 chemins). Plusieurs
  lâchers à la suite, 200 au plus en train de tomber ; la barre ne montre jamais un gain avant sa coupe
  (`bourseDesLachers`). Le panneau « Les coupes » et leurs chances sur 256 ; un rendu partiel reste neutre, jamais en or
  ni avec un « + ».
- **Le plafond du jour, lisible d'un coup d'œil** (24 novembre 2026, demande du pilote : « que ce soit mieux lisible quand on
  dépasse ce montant ») : atteint, un bandeau en tête du hall (« Plafond du jour atteint », ce qui a été misé, le compte à
  rebours jusqu'à minuit, heure de Paris, en grands chiffres) et, dans chaque pupitre, les jetons et le bouton d'or éteints
  avec la même phrase à côté des jetons ; il reste moins qu'une table pleine, « Encore n statères aujourd'hui », discrètement
  (`Plafond.tsx`, `etatDuPlafond` et `avantMinuitAParis` d'`ecran-casino.ts`). Les nombres sont ceux de `get_casino`
  (`plafond`, `reste_du_jour`) : aucun écran n'écrit le plafond. Un refus du plafond par le serveur fait relire le casino ; à
  minuit, il se relit seul. Au vingt-et-un, doubler et séparer éteints disent pourquoi (bulle et lecteur d'écran).
- **Rien ne se fige** (24 novembre 2026) : une animation qui lève est retirée seule de la boucle (`anime`), et le jeu ouvert
  repart (`PANNE_DU_CASINO`) en finissant son tour sans mouvement ; tout appel du casino sans réponse au bout de 20 secondes
  devient un refus (« Le serveur ne répond pas · Si cela dure, rechargez la page », `avecDelai` d'`api.ts`), et le vingt-et-un
  relit alors sa main ; le refus de cadence (30 actions par minute) dit dans combien de secondes on rejoue. Le vingt-et-un
  ne se fie qu'au serveur pour le mode GOD (une vraie main pendant un essai : refus `mode_god`, dit par le croupier), et une
  table qui échoue pose la main sans mouvement au lieu de s'arrêter.
- **Pause et « réduire les animations »** : le résultat se pose sans mouvement (la roue s'arrête où elle est si la pause
  arrive en plein tour), pas de pluie, pas de reflet. Échap ou le bouton de retour ramènent au hall ; un tour quitté en
  plein mouvement se finit sans animation (la bourse reçoit son solde, la partie s'inscrit).

**Les fichiers.**

| Fichier | Rôle |
|---|---|
| `src/lib/jeu/casino-toile.ts` | La toile en points, les rampes des matières, les objets peints (jetons, piles, cartes, dés, bille, cadres, lueurs), les pièces des tables |
| `src/lib/jeu/casino-dessins.ts` | Les croupiers (tenues et visages), les familiers, le statère : les vrais dessins du site |
| `src/lib/jeu/casino-pieces.ts` | Les images fixes dans `/village/kit.css` : pièces du palais, des tables, icônes `--cas-pic-*`, icône du menu |
| `src/lib/jeu/casino-hall.ts` | La roue de trois quarts, les six vignettes, la bannière |
| `src/lib/jeu/casino-roue.ts` | La roue peinte et son mouvement |
| `src/lib/jeu/casino-vingt-et-un.ts` | Le jeu de cartes gaulois, la table du vingt-et-un et sa mise en page, les icônes des gestes, le druide (et ses sons dans `casino-vingt-et-un-sons.ts`) |
| `src/lib/jeu/casino-machine.ts`, `casino-des.ts` | La machine du forgeron et les dés : dessins de la maquette, mouvement qui finit sur le tirage du serveur, sons |
| `src/lib/jeu/casino-course.ts` | Le champ de courses : décor, coureurs, tribune, caméra, sons, pièces des couloirs |
| `src/lib/jeu/casino-palissade.ts` | Le panneau de la palissade, la chute écrite d'après le chemin du serveur, ses sons, la bourse pendant les chutes |
| `src/lib/jeu/casino-scene.ts` | Ce qu'une scène animée demande à la page (images, surfaces, pinceau) ; la page le donne par `casino/images.ts` |
| `src/lib/jeu/casino-sons.ts` | Les sons du casino |
| `src/lib/village/ecran-casino.ts` | Les jeux du hall, la lecture de `get_casino`, les résumés, les mots des refus, le niveau d'un tour, le pupitre |
| `src/components/village/casino/` | `LeCasino.tsx` (la salle ; les jeux dans `JEUX_OUVERTS`), `Hall.tsx`, les jeux (`Roue.tsx`, `VingtEtUn.tsx` et sa table `scene-vingt-et-un.ts`, `Machine.tsx`, `Des.tsx`, `Course.tsx`, `Palissade.tsx`, avec `images.ts` pour les images de leurs scènes), et le commun : `contexte.ts` (`useCasino`), `Pupitre.tsx`, `Croupier.tsx`, `Pieces.tsx`, `commun.ts`, `serveur.ts` et `acces.ts` (la lecture de `get_casino` pour le menu). Les coups passent par `casino.*` de `src/lib/compte/api.ts` ; les règles (numéros rouges, ordre de la roue, paris) viennent de `src/lib/village/casino/` |
| `src/styles/feuilles/27-jeu-casino.css` | Tout sous `.casino-jeu`, classes `cas-…` (commun et hall) et `<jeu>-…` |

**Ajouter un jeu** : un composant dans `src/components/village/casino/` (racine `cas-jeu <jeu>-jeu`, `useCasino`,
`useCroupier`, `usePupitre`, le tirage du serveur avant toute animation, `prendreLaMise` puis `finDeTour`), ses dessins de la
maquette dans `src/lib/jeu/casino-<jeu>.ts`, une ligne dans `JEUX_OUVERTS`, ses styles à la suite de la feuille en
`@container casino`. Un jeu absent de `JEUX_OUVERTS` montre « Bientôt ». Tout dessin nouveau passe par Claude Fable 5.2.


<!-- Partie de docs/DESIGN.md : « Le kit du jeu (21 novembre 2026) » › « Les cartes des cosmétiques (22 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### Les cartes des cosmétiques (22 novembre 2026)

Demande du pilote : « que tous les cosmétiques ressemblent à des cartes pixel art super stylées », avec « les effets dégagés
par le cosmétique », pour « les boosters, boutiques, vestiaires etc. ». Il a choisi sur modèles (Claude Fable 5.2, Artifact
privé) : du pixel art holographique pour le mystique, le légendaire et le divin, un entre-deux pour l'épique, et pour le reste
des cartes « jolies mais pas en pixel art et non holographiques ». Ne pas changer ces trois façons sans sa demande.

- **Où** : toute chose posée sur son fond d'objet est une carte, dans les cases du vestiaire, de la boutique, des familiers,
  des Gaulois uniques, de la forge (`Case` de `Cases.tsx`, la case de la forge), au marché (`CaseObjet` de `MarcheCase.tsx`),
  dans l'étal et la fin du pass, et en grand dans les fenêtres d'achat et d'objet reçu (`CaseMontree` de
  `BoutiqueDialogue.tsx`, `grande`), qui s'inclinent vers le pointeur. La face des cartes qui sortent des boosters prend le
  même cadre, dessiné sous les mots (`habillerUnePlanche`, posé par `faceDeCarte` de `src/lib/jeu/boosters.ts`) ; le
  mouvement, les lumières et les sons de l'animation n'ont pas changé. Le corps, le visage, les coupes et « rien » gardent la
  case d'avant ; la vitrine aussi. Dans un booster d'objet, de familier, de Gaulois unique, de bannières ou de statères,
  d'un palier du pass et dans le booster d'essai, la carte qui sort du paquet **est** la grande carte de la chose, avec
  toute sa description (demandes du pilote : « je préfère qu'on voie la carte en gros avec toute la description contenue
  dans la carte », puis, le soir du 22 novembre 2026, « tu peux virer la peu détaillée et qu'il n'y ait qu'une seule carte
  en ouvrant le booster ») : son dos est dessiné à sa taille (`dosDeCarte(l, h)`), et passé la tranche au retournement,
  c'est elle qui se montre et qui reste dans sa fête (`vraie` de `SceneDuBooster.ts`, `carteFinale`
  d'`OuvertureDuBooster.tsx`, `.bst-vraie` de `17-jeu-boosters.css`). La scène grandit à sa hauteur plutôt que la carte ne
  rapetisse, et garde l'air de ses boutons au-dessus d'elle ; le paquet, la déchirure, la sortie, la fête, les lumières et
  les sons n'ont pas changé, la fête se pose autour de la carte à sa taille. Le booster de loterie garde sa face dessinée. Au marché, à la forge et dans les fenêtres, les marques (« à vous », « porté », « Nouveau », « essai », la coche,
  la plaque) sont dans les coins de l'image, jamais sur le nom ; l'intérieur de la carte prend les jetons du thème clair, la carte garde ceux
  de la page, pour que ses anneaux d'état se voient dans les deux thèmes.
- **Trois façons** (`styleDeCarte` de `src/lib/jeu/cartes-d-objets.ts`, `data-carte` sur la carte) : « lisse » (de base,
  commun, peu commun : cadre net, coins arrondis, un filet de plus au peu commun, aucun reflet) ; « entre » (épique : quatre
  coins en cases, un pointillé, un reflet doux qui suit le pointeur) ; « pixel » (mystique, légendaire, saison, divin : cadre
  en cases posé en neuf parts par `border-image`, bossages à gemme dans les coins, écussons en haut et en bas, feuille
  holographique masquée par le motif de la rareté, lumière qui passe sur le cadre, papier étoilé au divin).
- **Trois mises en page** (`faconDeLaCarte`, choix du pilote du 22 novembre 2026 sur les modèles v2 de Claude Fable 5.2 :
  « pour les mystiques Par le haut, le nom devant ; et divin et légendaire Les bandeaux fins », et « dans les cases je
  préfère B et 1 ») : la **pleine image** pour le légendaire, le légendaire de saison et le divin (la scène de la chose sur
  toute la carte, prolongée en trame au-delà de 88 cases, `prolongerLaScene` ; un liseré en cases à coins à gemme,
  `lisereEnNeufParts`, des joyaux au milieu des bords du divin et du saison ; un bandeau fin en haut, nom et rareté, un en
  bas, rang du duel ; la chose en grand entre les deux, `placerDansLaZone` ; en grand, la fiche des effets monte du bas au
  survol d'une souris, ou par le bandeau du bas, qui en est le bouton, ou d'un appui sur la carte) ; le **débordement**
  pour le mystique (la carte à fenêtre, mais la chose sort par le haut et passe sur le cadre, le nom devant elle, cerné de
  clair, `placerQuiDeborde`) ; la carte **simple** pour les autres. La chose est posée comme sur son fond d'objet : un
  objet au milieu, un familier au sol, un buste contre le bas ; sa scène, dans la couleur de la chose, garde sa place calme
  et pose son sol sous elle (`zoneDansLaScene`, comme la face des boosters). Pièces dans `CartesRares.tsx` (petites
  `PetitePleine`, `PetiteDeborde` ; grandes `GrandePleine`, `GrandeDeborde`) et `CarteDeSortie.tsx` (la carte de la
  sortie des boosters, 70 cases de large, 116 de haut en pleine image, à 4 pixels la case, 3 ou 2 sur un écran petit ou
  bas, `caseDeLaSortie`, pour que la bourse et les boutons restent dans l'écran). Le numéro au pied de la fiche
  (« n° 56/273 ») est la place de la carte dans le catalogue du duel : il change quand le catalogue est refait.
- **Les pièces** : `CarteDObjet.tsx` (habit, reflet, rang du duel, fiche des effets, bulle au survol), feuille
  `24-cartes.css` (classes `co-…`, racine `co-carte`, rien du jeu : « Mon compte » pose aussi ces cartes). Une case du
  dessin vaut toujours un nombre entier de pixels (`--co-p`, 2 sur une petite carte, 3 ou 4 en grand).
- **Les effets** sont ceux du duel « Coup pour coup » : rôle, force, prix en énergie, mots-clés, effet unique, panoplie,
  repos ; pour un familier, l'effet de son compagnon. Tant que le duel est fermé, seul qui le voit (le
  pilote) les lit : le calcul se charge à la demande (`useEffetsDeLaChose` de `src/components/village/effets-des-cartes.ts`,
  `duel/effets-des-cartes.ts`), rien n'en part vers les autres comptes. Sur une petite carte, le rang du duel (tuile du
  rôle, force, éclairs, icônes des mots-clés) ; au survol ou au focus du clavier, la bulle de toutes les phrases ; en grand
  et sous la carte sortie d'un booster, la fiche entière. Le reflet ne change aucune valeur.
- **Claires dans les deux thèmes** (choix du pilote contre les cartes sombres) : la carte pose ses jetons du thème clair, son
  blanc passe par `--co-lumiere`. Le reflet suit le pointeur ; au repos, seule la grande carte en cases bouge, lentement ;
  tout s'arrête avec la pause et « réduire les animations ».
- **Les cartes spéciales statères** (22 novembre 2026, maquette « Cartes des statères » de Claude Fable 5.2 ; le pilote
  a laissé Claude choisir, « Choisis pour moi ») : tout dans l'or, une carte par lot du booster de statères, « Quelques
  pièces », « La petite pile », « La bourse », « Le coffret », « Le grand coffre », « Le trésor », et la carte « Statères
  rendus » à la fin d'un booster des bannières ou des Gaulois uniques qui rend une part de son prix. La richesse monte par
  la forme, jamais par la seule couleur : plus de pièces dans la scène, la façon des cartes des cosmétiques (lisse aux
  lots 1 et 2 et au rendu, entre-deux à la bourse, en cases du coffret au trésor, avec reflet, éclats et prisme), des pions
  pleins pour le rang, un pion par lot de la liste du serveur (« Lot 3 sur 6 ») ; le rendu a sa jauge, un cran par dizaine
  du prix rendue. Quatre pixels la case, trois ou deux sur un écran petit ou bas (`caseQuiTient`), pour que la bourse et
  les boutons restent dans l'écran. La somme et la part,
  écrites en grands chiffres de cases, sont celles de la réponse du serveur, et la carte se lit d'un seul nom pour les
  lecteurs d'écran (« 640 statères rendus, 40 % du prix »). Dessins `src/lib/jeu/cartes-de-stateres.ts` (les pièces de
  `statere.ts` du robot), carte `CarteDeStateres.tsx`, classes `cs-…` de `24-cartes.css` ; c'est elle qui sort du booster
  et se retourne. Le booster de loterie n'en a pas : il donne des billets, pas des statères.
- **La carte de poche** (soir du 22 novembre 2026, demande du pilote : « le même affichage pour la boutique et les
  vestiaires : des véritables cartes avec les infos dessus » ; dessin de Claude Fable 5.2) : dans les grilles de la
  boutique et du vestiaire (rayons d'objets, familiers, Gaulois uniques), la grande carte en plus serré, 80 cases de
  2 pixels (160 pixels, 152 au plus étroit), deux de front sur un téléphone, quatre dans le panneau de la boutique
  (`.cases.co-grille`). De haut en bas : le prix en énergie, le nom, la tuile du rôle et la force ; l'image sur son fond,
  ses marques dans les coins (« Nouveau », « en vente », « 2 exemplaires », « essai », la plaque) ; la rareté (icône et
  mot) et le repos ; les effets du duel écrits à 11 pixels (l'effet unique, les mots-clés, la phrase du rôle ; une ligne
  entière ou rien, `lignesDePoche` de `src/lib/village/carte-de-poche.ts`) ; la panoplie ; l'état (prix, cadenas,
  « Revient… », « À vous », « Porté »). « Tout lire » retourne la carte : son dos porte toute la fiche et le numéro, Échap
  le referme. Le bouton de la carte reste `button.case` (le glisser du vestiaire le prend) ; le pli et le dos sont à côté,
  dans l'emplacement (`CarteDePoche.tsx`, classes `co-poche`, `co-emplacement`, `co-pli`, `co-dos` de `24-cartes.css`). Les
  trois façons et les deux mises en page rares sont gardées (`PetitePleine`, `PetiteDeborde` prennent sa tête et son
  bas). Le marché, la forge et les fenêtres gardent la petite carte d'avant ; un trait du visage, une coupe, « Aucun »
  gardent leur case.
- **Le défilé des cartes** (22 novembre 2026, à la place du livre des bannières, à la demande du pilote ; maquette de
  Claude Fable 5.2, choix faits par Claude à sa demande) : les bannières, les finitions et les cadres en grandes cartes
  (`DefileDeCartes.tsx`, calculs dans `src/lib/village/defile.ts`, classes `dc-…` de `24-cartes.css`), à la boutique et
  dans « Ma bannière sur /gaulois ». La carte du milieu en grand, ses voisines aux trois quarts, les suivantes à la moitié,
  posées par l'écran sur un ressort sans rebond. Tout est dans la carte : nom, rareté (icône et mot), prix ou « À vous »,
  « Du booster », et la marque « Sur /gaulois » ou « Sur ma carte » ; la carte prend la largeur de son image. Une bannière
  à `--dc-c` pixels la case (2, 3, 4, 5 selon la largeur de la bande, `container-type`), la carte du membre à `--dc-fx`
  (2, 3 sur une très grande bande haute) sur une table marine, la lumière holographique sur le cadre seul. Les flèches
  descendent sous la bande quand elle est étroite ; au bout de la liste, elles pâlissent mais gardent le focus
  (`aria-disabled`). La bande est une `listbox` (options avec `aria-setsize` et `aria-posinset`) ; la carte choisie n'est
  jamais cachée. Dans l'écran du jeu, ni dégradé ni filet autour de la bande, des flèches carrées à l'ombre franche.


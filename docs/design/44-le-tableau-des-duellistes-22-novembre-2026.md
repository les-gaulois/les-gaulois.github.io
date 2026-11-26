<!-- Partie de docs/DESIGN.md : « Le kit du jeu (21 novembre 2026) » › « Le tableau des duellistes (22 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### Le tableau des duellistes (22 novembre 2026)

`/village#duel`, « Le tableau » (`src/components/village/duel-tableau/`, feuille `26-jeu-duel-tableau.css`, classes `dt-` sous
`.duel-jeu`) : les duellistes de la semaine et de la saison. Dessin et spécification de Claude Fable 5.2, code de Claude Opus 5.5.
Le serveur classe et fait foi (« Le tableau des duellistes » de `docs/DIRECTION.md`) ; l'écran lit une fois, à l'ouverture.

- **L'entrée** (`Entree.tsx`) : un panneau sur toute la largeur de l'accueil du duel, l'icône du tableau (un panneau de bois à trois
  lignes or, argent, bronze), ton rang de la semaine en étiquette d'or (« 2e ») ou les duels qu'il te manque en bleu (« Encore 3 »),
  et à droite le premier de la semaine (médaille, buste, nom, note). Au téléphone : l'icône, le titre et l'étiquette. Il ne paraît que si
  le serveur connaît le tableau.
- **La vue** (`LeTableau.tsx`) : la tête (retour, icône, titre) et deux onglets, « La semaine » (une page de calendrier) et « La saison »
  (une couronne de feuilles), d'or et enfoncé quand il est ouvert, aux flèches du clavier. Puis, dans l'ordre : la date de fin, en
  toutes lettres ; **le podium d'abord**, comme à la loterie, trois marches où chaque Gaulois paraît devant sa bannière, la médaille
  chiffrée à cheval sur le bord (la deuxième à gauche, la première relevée) ; « Ta place » (ton rang, ta note, tes duels, la barre de la
  note avec son repère à 50, tes semaines gagnées) ou, pas encore classé, « Encore 3 duels » et une barre à crans, sans note ; « La
  semaine d'avant », le dernier duelliste de la semaine avec l'insigne ; la liste à partir de la quatrième place (rang, buste, nom,
  insignes, barre, note, duels, gagnés, égalités ; au téléphone, une petite ligne de mots sous le nom) ; ta ligne sous un filet si tu
  es classé après les vingt premiers ; le pli « Comment on est classé », avec la phrase de l'essai contre le hasard. L'onglet de la
  saison ajoute en tête la cagnotte (le chaudron des salles, la somme) et, sous chaque marche, sa part : une pile de pièces, « 50 pour
  cent », le montant. Une saison partagée montre ce que chacun a reçu ; personne de classé : trois marches vides et « On paraît ici à
  partir de 5 duels comptés ». La barre de la note est d'or à 50 et plus, bleue dessous : la couleur double le nombre écrit.
- **L'insigne du duelliste de la semaine** (`src/lib/village/insigne-du-duel.ts`, 24 cases, au format des insignes de saison) : un écu à
  pointe bordé d'or, parti bleu et rouge, l'éclat d'or du coup au milieu, contour marine puis liseré clair pour les deux thèmes. Pas
  d'épées croisées : elles sont au palier des 200 victoires. `InsigneDuDuel.tsx` est prêt pour la carte du membre (« Ma carte », à poser par sa session).
- Rien ne bouge en boucle : le survol d'un onglet, le plein d'une barre, et rien sous « réduire les animations » ou la pause du jeu.
  Jamais un solde : les seuls montants sont la cagnotte, qui n'est à personne, et ses parts.
- Regardé le 22 novembre 2026 sur une construction à faux serveur, à 1 920, 1 280, 820, 390 et 360 px de large, dans les deux thèmes,
  sans défilement horizontal ni défaut relevé par axe.


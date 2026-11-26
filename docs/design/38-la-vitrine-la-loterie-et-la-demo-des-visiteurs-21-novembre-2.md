<!-- Partie de docs/DESIGN.md : « Le kit du jeu (21 novembre 2026) » › « La vitrine, la loterie et la démo des visiteurs (21 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### La vitrine, la loterie et la démo des visiteurs (21 novembre 2026)

D'après la maquette validée par le pilote, dessin de Claude Fable 5.2, feuille `21-jeu-vitrine-loterie.css`.

- **La vitrine** (`/village#vitrine`, `VitrineDuJeu.tsx`) : le ruban, la recherche, les cartes des Gaulois du clan. Les cartes
  et leur fenêtre en grand restent celles de `Vitrine.tsx` (bannière, finition, familier, rareté, « où trouver cet objet »),
  que « Mon compte » atteint par le choix de la bannière : ce fichier ne connaît rien du jeu. L'écran du jeu lui donne sa
  fenêtre (`Fenetre`, celle des boosters) et sa marque « Moi » (`moi`, une étiquette du kit). Un nom de membre s'écrit en
  lettres du site ; dans le ruban d'une fenêtre, en pixels seulement si l'écriture sait tous ses signes.
- **La loterie** (`/village#loterie`) : la mise en page choisie par le pilote, « le podium d'abord », ne change pas (la toile
  dans un `jeu-ecran-cadre`, les règles dans un pli). « Vos boosters de la semaine » : les sept jours du mardi au lundi
  (`semaineDesBoosters` de `src/lib/village/loterie.ts`), chacun avec son petit booster, fermé, ouvert, ou sa place vide.
  Un booster fermé s'ouvre par l'animation validée (`OuvertureDuBooster`, sorte `loterie`) : le serveur ouvre d'abord
  (`ouvrir_booster_loterie`, qui tire le ticket d'or), puis le joueur ouvre le paquet et retourne la carte de ses billets ;
  sans ticket d'or, la carte prend les couleurs et la lumière du commun ; avec, celles du légendaire. Jamais de nom de rareté
  sur cette carte. Depuis le soir du 21 novembre 2026 (« améliorer la page la loterie ») : un compte à rebours dessiné
  jusqu'au mardi 21 h 30 (`decompteDuTirage`), le podium de la toile en socles de pixels or, argent et bronze, les lots en
  pièce et en petits boosters, le gagnant plus grand (`LoterieToile.ts`, pièces de `src/lib/jeu/loterie-pieces.ts`) ; vos
  billets en pile dessinée, le ticket d'or qui brille, votre part en disque ; le booster du jour en vedette ; le tirage pas
  encore vu en tête de la page, comme un événement, joué une fois avec les sons du jeu (un tic par cran de la pointe, le son
  d'une carte retournée à chaque marche), puis ses gagnants en cartes.
- **Les visiteurs** (`/village` sans être connecté) : sous la porte, « Essayez un booster » (`DemoDuJeu.tsx`), un booster
  surprise d'essai avec la même animation, sur un tirage d'exemple fait dans le navigateur avec les chances de départ du tirage
  (`src/lib/village/demo-booster.ts`), sans rien envoyer au serveur ; « Rejoins le clan pour jouer » (la page Rejoindre, la
  connexion) ; puis la vitrine écrite à la construction, en cartes comme celles des membres (bannière relevée comme pour la
  liste, cadre de la rareté portée). Avec le serveur, « Mon Gaulois » ne montre ces blocs qu'aux visiteurs (`data-demo-visiteur`,
  `data-vitrine-publique`).


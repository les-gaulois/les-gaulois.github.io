<!-- Partie de docs/DESIGN.md : « Le kit du jeu (21 novembre 2026) » › « Le pass et la forge du jeu (21 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### Le pass et la forge du jeu (21 novembre 2026)

`/village#sentier` (`Sentier.tsx`) et `/village#forge` (`Forge.tsx`, `Fusion.tsx`, `Moule.tsx`), habillés du kit d'après la
maquette validée par le pilote ; ils ne sont plus posés dans un `jeu-ecran`, ils ont leurs panneaux. Dessins en cases de
Claude Fable 5.2 dans `src/lib/jeu/pass-forge.ts` (booster de palier reteint par rareté, page du calendrier, étendard du défi,
sceau, tuile de la route, dalle numérotée, coche, place du creuset), posés dans la page par `ImageEnCases.tsx` (une planche
peinte une fois par clé, à un nombre entier de pixels par case) ; sons de la forge dans `src/lib/jeu/sons-de-la-forge.ts` ;
calculs de l'écran dans `src/lib/village/ecran-pass.ts` (testés) ; feuille `20-jeu-pass-forge.css`.

- **Le pass garde le dessin choisi par le pilote** (16 novembre 2026) : la bannière du membre pour seul décor de la scène, la
  route de pavés, une case par palier, le Gaulois debout sur sa dalle, la piste repliée sur dix paliers, l'album au survol.
  La pochette de chaque palier est devenue un booster à la couleur de sa rareté ; un palier atteint s'ouvre par l'animation
  validée des boosters (`OuvertureDuBooster`, son paquet passé par `autre`), le serveur ayant tiré d'abord. Le 30e palier
  montre l'objet de la saison lui-même, et la récompense de fin de saison (objet légendaire de saison et insigne) a son panneau
  à côté de la saison et de ses XP. « Aujourd'hui » : les missions en cartes à icône, la présence en petit calendrier dessiné,
  le défi du clan en étendard qui se remplit (à côté de la carte de France du jeu, gardée avec sa mention), l'étal du jour.
- **La forge** : la fusion (raretés en boutons du jeu, creuset à places creusées, chaudron qui se remplit, moule gardé tel quel)
  et la gravure (grande plaque gardée, parties à cocher, effacement à part, au second clic) dans des panneaux du jeu ; leurs
  fenêtres sont celles des boosters (`FenetreDuBooster`). La fusion gagne ses sons : l'objet posé, la coulée, le démoulage,
  la gravure ; tous coupés avec le son du jeu.
- Les cases d'objets restent claires à la couleur de leur rareté dans les deux thèmes, comme à la boutique.


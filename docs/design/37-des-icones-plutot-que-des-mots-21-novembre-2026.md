<!-- Partie de docs/DESIGN.md : « Le kit du jeu (21 novembre 2026) » › « Des icônes plutôt que des mots (21 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### Des icônes plutôt que des mots (21 novembre 2026)

Demande du pilote, le soir du 21 novembre 2026 : « des icônes à la place des écritures dans "le corps" ; pareil dans la
boutique il manque des icônes, et […] des icônes aussi pour commun, peu commun, épique, etc. au lieu de * ** *** **** ***** ».
Dessins de Claude Fable 5.2.

- **Les raretés** : une icône par rareté (commun, peu commun, épique, mystique, légendaire, légendaire de saison, divin),
  dans sa couleur, qui monte en prestige de l'une à l'autre (`src/lib/jeu/icones-de-rarete.ts`, composant
  `IconeDeRarete.tsx`). Elle remplace partout les losanges qui comptaient la rareté : la marque des cases (`MarqueDeRarete`,
  donc vestiaire, boutique, marché, vitrine, forge, pass, boosters), les filtres de rareté, l'album des boosters, les chances
  et la face des cartes de booster. Le nom de la rareté reste écrit là où il l'était, et dit aux lecteurs d'écran. L'image
  est faite dans la page, sans la feuille du kit : la même sert à l'inscription de « Mon compte ».
- **Le corps** : les sept parties du rayon du corps (corps, peau, cheveux, barbe, yeux, bouche, cicatrice) sont des
  boutons du kit à icône seule (`trait-…` d'`icones.ts`) ; le mot reste pour les lecteurs d'écran et dans la bulle du survol.
  Hors du jeu, à l'inscription, les pastilles écrites d'avant restent.
- **La boutique** : chaque rayon a son icône au-dessus de son nom (`rayon-…`), le filtre « Tout » aussi, et les titres et
  boutons du marché et de l'essayage portent la leur devant le mot (`action-…` : marché, essayage, vendre, demander,
  acheter, revendre, porter, sélection de la semaine). Sur un bouton d'action, le mot reste : il dit ce que fait le bouton.
  Sur un grand écran, l'icône du rayon prend la place de la vignette de ce que le Gaulois y porte, qui se posait au-dessus
  de l'onglet : le Gaulois de l'essayage, à côté, le montre déjà (règle de `19-jeu-boutique.css`, à retirer pour la remettre).
- **La fiche d'un booster** prend la mise en page du téléphone d'après sa propre place (requête de conteneur de
  `17-jeu-boosters.css`) : sur un écran moyen, de 768 à 1 180 pixels, son prix sortait de la page.


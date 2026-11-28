<!-- Partie de docs/DESIGN.md : « Le kit du jeu (21 novembre 2026) » › « Les cartes des cosmétiques (22 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### Les cartes des cosmétiques : un seul modèle (28 novembre 2026)

Demande du pilote, sur l'aperçu « Cartes pleine image » validé rareté par rareté : « oui construis et importe-le partout sur
le site ! je veux qu'un seul modèle de cartes et NON plusieurs ! ». Il remplace les trois façons du 22 novembre (lisse,
entre-deux, pixel art), la pleine image aux bandeaux fins, le débordement du mystique, la carte de poche et la carte de
sortie. Ne pas en refaire d'autre sans sa demande.

- **Le composant** : `src/components/village/CarteDeCosmetique.tsx` ; calculs sans navigateur dans
  `src/lib/jeu/carte-du-cosmetique.ts` (taille, place de la chose, scène, motifs, contour, tons) ; une seule boucle de lumière
  pour toute la page dans `lumiere-des-cartes.ts` ; classes `cc-…` en tête de `src/styles/feuilles/24-cartes.css`,
  `@property --cc-x`, `--cc-y`, `--cc-o` dans le socle ; noms, coûts et forces en Jersey 10 (`@fontsource/jersey-10`, OFL).
- **La forme** : une carte à collectionner, 63 sur 88, soit 70 sur 98 cases ; coins arrondis lisses, aucun cadre, un rebord
  léger de deux cases à la couleur claire de la rareté. Une case vaut `--u`, la largeur de la carte sur 70 (requête de
  conteneur) : la même carte se pose en petit dans une grille (148 à 176 pixels, `.cases.cc-grille`) et en grand dans une
  fenêtre ou à la sortie d'un booster (`grande`, à la largeur qui tient dans l'écran).
- **Trois plans en relief**, qui bougent avec une inclinaison lente : la scène de la chose (`fondSeul` prolongée par
  `prolongerLaScene`) et ce que la rareté y pose (divin : prisme et cosmos ; légendaire et saison : dorure à spirales ;
  mystique : rouelle d'émail ; épique : gravure) ; la chose seule en grand (agrandie de 1 à 3 fois), cernée d'une case à la
  couleur de sa rareté, qui s'allume au survol ; le devant (étoiles, feuilles d'or qui tombent, perles d'émail qui montent,
  éclats). Commun, peu commun et objets de base : aucun reflet, leurs bandeaux font le plan de devant.
- **L'écriture** : en tête, le coût en énergie dans une pièce, le nom et le rôle au duel, la force dans un écusson ; la boîte
  des effets (mots-clés et repos) s'ouvre d'un appui sur toutes les lignes du duel (`ficheDe`) ; en pied, la rareté,
  l'emplacement et le numéro du duel. Divin et légendaire : l'écriture flotte sur l'image (« plein ») ; mystique sur un voile,
  épique sur un bandeau de verre ; commun et peu commun sur des bandeaux pleins. Sous 190 pixels de large, les noms des
  mots-clés, « Force » et l'emplacement laissent leurs icônes.
- **Les effets** ne paraissent qu'à qui voit le duel (`useEffetsDeLaChose`, `useDuelVisible`).
- **Le mouvement** : seule une grande carte promène sa lumière au repos ; une petite la garde posée et la suit sous le pointeur.
  La pause de la page (`fx-off`) et celle de la fenêtre d'un booster (`bst-fige`) figent tout ; si l'appareil demande moins
  d'animations, rien ne penche ni ne glisse. La lumière ne change aucune valeur.
- **Dans une page** : une carte peut être un bouton (`bouton` : la case du vestiaire, que le glisser de `Essayage.tsx` prend
  par `button.cc-carte`) ; la boîte des effets est posée au-dessus (`.cc-dessus`, même inclinaison), jamais un bouton dans un
  bouton. Ses marques vont dans les coins de l'image ; son état (prix, « À vous », « Porté ») sous elle.

Les autres cosmétiques, choisis par le pilote sur la version 14 de l'aperçu (idées « A ») :

- **Familier** « Sur son lieu » : au sol de sa scène, agrandi deux fois au plus, sa famille sous son nom, sa phrase de
  compagnon dans la boîte, « Familier » et sa taille au pied (`carteDuFamilier` de `cartes-des-choses.ts`).
- **Gaulois unique** « Le corps seul » : la créature entière, sans habits (`modeleNu`), debout sur sa scène, sa description
  dans la boîte, qui s'ouvre d'un appui (`carteDuModele`).
- **Bannière** : la carte couchée, 124 sur 89 cases, la bannière entière en pleine image ; essayée, le Gaulois du membre devant
  elle (`CarteDeBanniereCouchee` de `Bannieres.tsx`).
- **Finition et cadre de la carte du membre** « La carte la porte » : la vignette couvre toute la carte (`imagePleine`) ; la
  vraie carte du membre, animée, reste sous le défilé (« Sur ma carte »).
- **Statères** « La pièce » : une pièce de 24 cases au milieu sur des rayons d'or (`rayonsDOr`), le montant à la place du nom,
  toujours en or ; plus le lot est gros, plus la carte brille (`CarteDeStateres.tsx`).

Rejetés : le médaillon, le portrait, la table marine, le trésor de près, et la bannière debout.

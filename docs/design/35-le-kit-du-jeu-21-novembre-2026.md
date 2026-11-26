<!-- Partie de docs/DESIGN.md : « Le kit du jeu (21 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

## Le kit du jeu (21 novembre 2026)

« Mon Gaulois » (`/village`) est un écran de jeu plein écran depuis le 21 novembre 2026, d'après la maquette validée par le
pilote (planche de Claude Fable 5.2, et la fiche de projet « Mon Gaulois »). Ses pièces sont **dessinées en pixels**, jamais faites de dégradés ni de
bordures de site (« pas des trucs Paint »), dans les deux thèmes, et fines : un point du kit, `--jeu-p`, vaut 2 pixels.

**Le cadre de jeu.** `<Base cadre="jeu">` pose `data-ecran="jeu"` sur `<html>` et retire l'en-tête, la rubrique et le pied
de page du site. La page pose elle-même, par des fentes, ce qui les remplace : `BarreDuJeu.astro` dans `barre-jeu` (le fond
de l'écran, le logo dessiné qui est le `<h1>` et ramène à « Ma carte », la place des ressources, le son, la
musique, la pause, le thème et le retour au site), `PiedDuJeu.astro` dans `pied-jeu` (mentions légales, confidentialité,
code source, mention d'OpenFront) et le lien de `/village/kit.css` dans `tete`. Les autres pages n'importent ainsi rien du jeu
(tests/unit/feuilles.test.ts). La pause et le thème sont les boutons du site (`data-fx-toggle`, `data-mode-toggle`).

**Les fichiers.**

| Fichier | Rôle |
|---|---|
| `src/lib/jeu/planche.ts` | La planche : une image en cases, et les outils de la maquette (`R`, `rr`, `poly`, `ell`, `lig`, `cerne`, `volume`, `grille`, `tresse`), sans navigateur, testés |
| `src/lib/jeu/palette.ts` | La palette, une lettre par couleur, et les couleurs des pièces qui changent avec le thème |
| `src/lib/jeu/ecriture.ts` | L'écriture en capitales de 5 cases sur 7, accents compris (`enCapitales`, `largeurDuTexte`, `ecrire`) |
| `src/lib/jeu/pieces.ts` | Les cadres en neuf parts (panneau, écran, infobulle, tube), les pleins des barres, les boutons à trois états, les rubans, les étiquettes, le compteur |
| `src/lib/jeu/icones.ts` | Les icônes : 24 cases en couleur (menu, chiffres, parties du corps `trait-…`, rayons `rayon-…`, boutique et marché `action-…`), 16 cases en blanc (boutons de la barre) |
| `src/lib/jeu/paliers-de-victoires.ts` | Les quatorze paliers de victoires et leurs insignes, voulus par le pilote ; `WIN_TIERS` (liste des membres, Discord), encore à 8 paliers, doit la reprendre |
| `src/lib/jeu/logo.ts` | Le logo « Mon Gaulois » |
| `src/lib/jeu/kit-css.ts` | À la construction : chaque image fixe du kit en PNG, dans les variables de `/village/kit.css` |
| `src/lib/jeu/dans-la-page.ts` | Dans la page : les mots et nombres qui changent, en images, une par thème quand leur couleur en dépend |
| `src/lib/jeu/sons.ts` | Les sons courts (actifs après le premier clic) et la musique (coupée au départ), un seul réglage pour toute la page (boosters, carillon des objets reçus) |
| `src/lib/jeu/boosters.ts`, `boosters-dessins.ts`, `sons-des-boosters.ts` | L'ouverture des boosters (21 novembre 2026) : les cinq paquets, le dos et les faces des cartes, le ciel, les fissures, et les sons validés par le pilote ; la scène est `src/components/village/SceneDuBooster.ts`, ses pièces `KitDesBoosters.tsx`, sa feuille `17-jeu-boosters.css` |
| `src/components/jeu/Pixels.tsx` | Les composants : `Px` (texte), `Icone`, `PetiteIcone`, `Insigne`, `Etiquette`, `Compteur` |
| `src/components/jeu/MenuDuJeu.tsx` | Le menu : de vrais onglets (`role="tab"`, clavier), en colonne sur ordinateur, en bas sur téléphone |
| `src/components/jeu/RessourcesDuJeu.tsx` | Le palier du pass et la bourse, dans la barre |
| `src/components/jeu/MaCarte.tsx` | « Ma carte » : la carte du joueur et ses chiffres de clan (`src/lib/jeu/chiffres-de-carte.ts`, `/village/chiffres.json`) |
| `src/styles/feuilles/16-jeu.css` | La feuille du kit et du cadre de jeu |
| `src/lib/jeu/fonds-du-jeu.ts`, `public/paysages/` | Le fond de l'écran (21 novembre 2026) : huit paysages animés en cases de Claude Fable 5.2 (camp de guerre, forêt des chênes, falaises et flotte, sommets, plaine dorée, cité sur la colline, au-dessus des nuages, lac miroir), de jour en thème clair et de nuit en thème sombre. Le pilote les a tous retenus sur la galerie d'essai et les veut « intervallés de 15 minutes » : le fond change au quart d'heure de l'horloge, le même pour tous, en fondu de 3 secondes (`fondDuMoment`). Chaque paysage est un script classique chargé à son tour par `src/scripts/jeu.ts`, qui ajoute à `window.FONDS` un objet `monter`/`dessiner` (contrat `FondDuJeu`) ; toile d'environ 640 × 360 cases (`toileDuFond`), graine fixe, rien de réseau. Ils ont remplacé la bannière du joueur et les collines pâles derrière l'écran ; la bannière reste sur la carte. Trente images par seconde ; chaque case fait exactement `echelle` pixels (le surplus est coupé) ; une hauteur à peine plus petite, comme la barre d'adresse d'un téléphone au défilement, garde la toile au lieu de la refaire ; le changement de quart d'heure attend que le navigateur souffle. Une attente posée à même le paysage (« Lecture de votre compte… ») a sa bande de la couleur de la page. Changer un fichier : monter `VERSION_DES_FONDS`. Les quatre fonds « au style d'OpenFront » de la galerie n'ont pas été retenus |
| `src/lib/jeu/icones-de-rarete.ts` | Les sept icônes de rareté (11 cases, une par rareté, du commun au divin, légendaire de saison compris), qui remplacent les losanges ; affichées par `IconeDeRarete.tsx`, sans la feuille du kit (« Des icônes plutôt que des mots », plus bas) |
| `src/lib/jeu/vestiaire.ts` | Les pièces du vestiaire (dessin de Claude Fable 5.2) : cadre des cartes et des emplacements par rareté, trame, cadre de la bannière, socle, lueur, viseur, coche, éclat d'un essai, plateau ; variables `--jeu-v-…` de `/village/kit.css` |
| `src/components/village/VestiaireDuJeu.tsx` | Le vestiaire du jeu : le Gaulois, ses huit emplacements, les cartes du rayon ouvert (« Le vestiaire du jeu », plus bas) |
| `src/components/village/Essayage.tsx` | Le glisser du vestiaire : une carte lâchée sur le Gaulois vole vers son emplacement ; le geste, prise ou défilement, se décide dans `src/lib/jeu/geste.ts` |
| `src/styles/feuilles/18-jeu-vestiaire.css` | La feuille du vestiaire du jeu |
| `src/lib/jeu/loterie-dessins.ts` | Le booster de loterie (dessin de Claude Fable 5.2) : la carte de ses billets, avec ou sans ticket d'or, le billet, le ticket d'or, le petit booster de la semaine ; son paquet est la sorte `loterie` de `boosters-dessins.ts` |
| `src/components/village/VitrineDuJeu.tsx`, `DemoDuJeu.tsx` | La vitrine du jeu, et la démonstration des visiteurs (« La vitrine, la loterie et la démo des visiteurs », plus bas) |
| `src/lib/jeu/pass-forge.ts`, `sons-de-la-forge.ts` | Les dessins en cases du pass et de la forge, et les sons de la forge (Claude Fable 5.2) ; posés dans la page par `src/components/village/ImageEnCases.tsx`, feuille `20-jeu-pass-forge.css` (« Le pass et la forge du jeu », plus bas) |

**S'en servir dans une partie** (habillage du vestiaire, de la boutique, des boosters, du pass, de la forge, de la vitrine, de
la loterie) :

- Un cadre : `<div class="jeu-panneau jeu-n9">` (panneau du jeu) ou `jeu-ecran jeu-n9` (fond de page au centre, pour du
  contenu en lettres du site). Un ruban : `<h3 class="jeu-ruban jeu-n9"><Px t="Mes chiffres" couleur="creme" relief="ombre" /></h3>`
  (`jeu-ruban-bleu` pour le bleu).
- Un bouton : `<button class="jeu-btn jeu-n9">` (or, l'action) ou `jeu-btn jeu-btn-bleu jeu-n9` ; son texte : `<Px t="Ouvrir"
  couleur="encre" />` sur l'or, `couleur="creme" relief="cerne"` sur le bleu. Le petit bruit et le rebond viennent seuls
  (`src/scripts/jeu.ts`).
- Une barre : `<div class="jeu-tube jeu-n9"><div class="jeu-plein jeu-n9 jeu-plein-or" style="--part:0.37" /></div>` (or, bleu,
  vert, violet ; `jeu-crans` pour des crans, `jeu-repere` pour un repère).
- Une icône : `<Icone nom="forge" />` ; un insigne : `<Insigne rang={3} />` ; une pastille : `<Etiquette t="Nouveau" />`.
- Un nouveau dessin : l'ajouter au module qui convient (`icones.ts`, `pieces.ts`) avec les outils de la planche, puis à
  `kit-css.ts` s'il est fixe ; un test vérifie sa taille (tests/unit/jeu-kit.test.ts). Dessin par Claude Fable 5.2, code par
  Claude Opus 5.5 (demande du pilote).
- Un son : `jouer("piece")`, `jouer("carillon", 0, 5)` de `src/lib/jeu/sons.ts`, toujours après un geste du visiteur.
- Les écrans du jeu se lisent dans les deux thèmes ; jamais `#fff` pour un texte ; tout mouvement s'arrête avec la pause
  (`fx-off`) et « réduire les animations ».

**La boutique en écran de jeu** (21 novembre 2026, `/village#boutique`, maquette validée par le pilote, dessin de Claude
Fable 5.2) : elle n'est plus posée dans un `jeu-ecran`, elle a ses propres panneaux. Le titre en ruban, la sélection de la
semaine (boutique tournante) et son compte à rebours jusqu'au mardi 21 h 30, la bourse, le marché en images (des cases
d'objets, une étiquette « À vendre », « Demandé », « À vous »…, le prix en pièce, jamais le nom d'un membre ; « Vendre un
objet », « Demander » et « Revendre au jeu » en boutons), puis l'essayage à côté des neuf rayons en onglets dessinés et des
filtres de rareté en boutons du jeu. Les objets gardent le dessin de `Cases.tsx` (cartes claires à la couleur de leur rareté :
le pilote n'aime pas les cartes sombres pour les cosmétiques). « Nouveau » : un rayon dont la sélection de la semaine n'a pas
encore été ouverte sur l'appareil (`src/lib/village/boutique-jeu.ts`). Pièces : `src/components/village/BoutiqueDuJeu.tsx` ;
feuille : `19-jeu-boutique.css`, tout sous `.boutique-jeu` (les boosters partagent `Boutique.tsx`, le vestiaire les cases).


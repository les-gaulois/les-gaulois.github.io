<!-- Partie de docs/DESIGN.md : « Le thème clair « Neige Marine » (14 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

## Le thème clair « Neige Marine » (14 novembre 2026)

Le pilote a demandé à voir « plusieurs thèmes en blanc au lieu de bleu », puis « plusieurs panels blancs et couleurs d'écriture ». Sur des planches (le bleu et sept essais, huit pages, ordinateur et téléphone) et un site d'essai à trois réglages (fond, écriture, blocs), il a choisi « le 1, Neige Marine » : **page blanche, écriture bleu marine, grands blocs colorés gardés**, et l'a voulu aussi pour le guide, le QG et la Direction. Cette section l'emporte sur les valeurs sombres citées dans le reste de ce document, qui décrivent le thème bleu d'avant et valent encore pour les îlots sombres.

**Le principe : chaque jeton garde son nom et son rôle, seule sa valeur change.** `navy` reste le fond de la page (blanc), `night` le creux d'un champ, `surface` une carte, `muted` le texte secondaire, `blue-text` un lien. Ce qui s'écrivait en blanc sur le bleu s'écrit avec `var(--ecriture)`, marine sur la page.

| Jeton | Valeur | Contraste |
|---|---|---|
| `navy` (page) | `#FFFFFF` | |
| `night` (champ, pied de page) | `#F4F6FB` | |
| `surface` (carte) | `#F5F7FC` | |
| `surface-2` (état actif, en-tête de tableau) | `#E6ECF9` | |
| `line` | `#D5DCEE` | |
| `line-strong` | `#7A88B4` | 3,5:1 sur la page, 3,3:1 sur une carte |
| `--ecriture` (titres, gros chiffres, icônes) | `#0A1230` | 18,4:1 sur la page, 17,2:1 sur une carte |
| `--texte-courant` | `#1B2444` | 15,2:1 sur la page |
| `muted` | `#4A5677` | 7,3:1 sur la page, 6,8:1 sur une carte |
| `blue-text`, `ally` (liens) | `#0A4FD6` | 6,8:1 sur la page, 6,3:1 sur une carte |
| `blue` (bouton principal) | `#0B5FFF` | blanc dessus 5,1:1 (6,8:1 au survol) |
| `red` | `#D91228` | 5,2:1 sur la page, 4,8:1 sur une carte : un cran plus foncé que `#FF1A2E`, pour se lire en texte (lettrine, « CONTRE » de la Carte) |
| `warn` | `#8A5600` | un ambre foncé : 6,2:1 sur la page |
| `ok` | `#17743A` | 5,8:1 sur la page |
| `danger` | `#C4232F` | 5,8:1 sur la page |
| `win` / `loss` (graphiques) | `#2F6FED` / `#C9611C` | des aplats, jamais du texte |

**Les règles à tenir :**

- **Jamais `#fff` pour un texte, un filet ou une icône : `var(--ecriture)`.** Un blanc translucide s'écrit `color-mix(in srgb, var(--ecriture) 18%, transparent)`. Le test `tests/unit/theme-clair.test.ts` refuse tout blanc en dur hors de la valeur d'un jeton, et contrôle les contrastes de ce tableau, du thème rouge et du Terminal.
- **Une exception, sur une image** : la ligne d'un membre qui porte sa bannière dans la liste des membres (`.ligne-banniere`, choix du pilote, 16 novembre 2026). L'écriture y est claire (`var(--sur-couleur)`) et cernée de marine, parce qu'elle n'est jamais sur la page blanche mais toujours sur l'image, claire ou sombre. Ne pas l'étendre à un texte posé sur la page. Depuis le 17 novembre 2026, la ligne [GAL] du classement des clans fait de même sur la bannière du clan (`.ligne-clan`) : « La flotte de nuit », choisie par le pilote parmi dix (`src/lib/banniere-clan.ts`), une bande en pixels dessinée pour cette ligne seule, répétée sur sa largeur, qu'aucune autre ligne ne porte ; le filet rouge reste, le reflet qui passait sur la ligne est retiré.
- **Les îlots sombres** (`.btn-primary`, `.stage-blue`, `.stage-indigo`, `.stage-wine`, `.card-accent`) reposent `--ecriture: #fff` et tous les jetons du thème bleu d'avant (valeurs des tableaux « Couleurs » et « Thème rouge », plus bas), ainsi que `color` : tout ce qu'ils contiennent se lit comme avant, sans une règle de plus. La scène « nuit » (`.stage-night`) n'en est pas un : elle est claire, avec son filet.
- **Un fond de couleur vive posé par une règle** (onglet choisi du guide, bouton survolé du Terminal, pastille bleue) pose `--ecriture: #fff` dans cette même règle. Si une règle plus précise remplace ce fond par un fond clair (c'est le cas sur la Carte), elle pose `--ecriture: inherit`. Le texte sélectionné, qui ne peut pas poser de variable, prend `var(--sur-couleur)`.
- **Les couples inversés s'inversent tout seuls** : `.btn-secondary` et un filtre actif (`.chip[aria-pressed]`) ont pour fond `--ecriture` et pour texte `navy` — marine à texte blanc sur la page, blanc à texte marine dans une scène colorée.
- **Le décor** : croix de la table des cartes en marine (28 %), plus de coins assombris, lueurs de page à 5 et 3 % sur les pages ouvertes à tous, 8 et 4 % au QG et à la Direction. Les gros chiffres ne gardent leur lueur bleue que dans une scène colorée. Les cartes ont une ombre d'un pixel à la place du reflet de vitre. Le fond animé des cases de conquête est à 45 % : sur le blanc, il ressortait bien plus. Le guerrier de l'accueil s'écrit en marine là où il était blanc ; sa lueur et son socle sont à peine un voile.
- **Les ombres portées** (menu ouvert, fenêtre libre, bulle) : `var(--ombre)`, un marine à 22 %.
- **L'anneau du focus clavier** prend `var(--anneau)` : l'écriture de ce qui entoure l'élément. Le bouton principal, îlot sombre à lui seul, ne la repose pas : son anneau, tracé hors de lui, serait blanc sur la page blanche.
- **La barre du navigateur** (`theme-color`) et le site installé (`manifest`) sont blancs ; `color-scheme` est `light`. En thème sombre, voir la section suivante.

**Le thème rouge de la Direction, en clair :** page blanche, cartes rosées (`#FCF3F4`, `surface-2` `#F7DFE3`, filets `#EDCCD2` et `#B56D79`), écriture bordeaux `#3A0812` (17,2:1), texte courant `#3B1620`, texte secondaire `#6B4A52` (7,7:1), liens `#B00F27` (7,1:1), boutons `#D4132F` (blanc dessus 5,3:1).

**Le style Terminal, en clair :** au QG, un écran à peine bleuté (`navy` `#F6F8FD`), quadrillé de bleu à 7 et 13 %, des cartes et des champs blancs, des lignes de balayage à 4,5 % et plus de coins assombris ; contour des champs `#6A7BAD` (4,2:1) ; **le vert de la machine devient un vert sapin, `#166534`** (7,1:1 sur une carte, 6,7:1 sur la page) ; la lueur des chiffres et des champs passe de 60 à 22 %. À la Direction, le même écran à peine rosé (`#FFF9F9`), quadrillé de rouge, contour `#B0606D` (4,4:1). Le guide du clan garde le blanc du site, comme avant il gardait son bleu.

**Ce qui n'a pas changé :** les images dessinées par le robot pour Discord et les images d'aperçu (elles gardent leur fond marine), la mer et les couleurs de la carte des clans, les scènes peintes du village, les prestiges, les raretés (leur texte, lui, est foncé sur la page).

**Essayé sans vrai compte :** l'intérieur du QG (« Moi »), de la Direction (« Vue d'ensemble ») et du vestiaire du village a été regardé avec un faux serveur et des réponses vides ; les onglets remplis de vraies données, la place et le marché du village ne l'ont pas été.


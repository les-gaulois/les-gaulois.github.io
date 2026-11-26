<!-- Partie de docs/DESIGN.md : « Couleurs ». Sommaire et ordre des parties : docs/DESIGN.md. -->

## Couleurs

Les jetons sont définis dans `src/styles/feuilles/01-socle.css`, le socle de la feuille du site (« Les feuilles de style, en morceaux », plus haut).

**Depuis le 14 novembre 2026, les valeurs de ce tableau sont celles des îlots sombres** (bouton principal, scènes colorées) : sur la page, chaque jeton a sa valeur claire, donnée dans « Le thème clair », plus haut.

| Jeton | Valeur | Usage |
|---|---|---|
| `navy` | `#0A1230` | Le fond de toutes les pages ouvertes à tous, Carte et guide compris, avec une lueur bleue et un reflet rouge presque effacés (5 et 3 %). Blanc 18,4:1. `#050B1F` du 12 au 13 novembre 2026 |
| `night` | `#081029` | Champs, barre d'onglets : un bleu plus sombre, plus de noir (`#020614` jusqu'au 13 novembre 2026). Le pied de page et la scène « nuit » ont le bleu de la page et des cartes |
| `surface` | `#101B45` | Cartes, onglets de rubrique, fond des grands tableaux, scène « nuit ». Texte secondaire 10:1, liens 8,8:1 |
| `surface-2` | `#182658` | État actif, avatars, en-tête des grands tableaux |
| `line` | `#24346B` | Bordures |
| `line-strong` | `#5469AE` | Contour des champs, carte survolée : 3,19:1 sur une carte, 3,6:1 sur un champ |
| `blue` | `#0B5FFF` | **Bouton principal uniquement** |
| `blue-text` | `#9DBCFF` | Liens : le bleu du logo n'est pas assez contrasté sur le fond marine. Aussi la couleur unie des jauges (`.meter`) : sur leur fond, 6,5:1 sur la page, 4,6:1 dans une scène indigo |
| `flag-blue` | `#0B5FFF` | Le bleu du drapeau : filet tricolore, frontière (QG et Direction). Il ne change pas avec le thème. La barre de lecture est rouge depuis le 13 novembre 2026 sur les pages ouvertes à tous |
| `red` | `#FF1A2E` | Filet, marqueur de page et de ligne active ; depuis le 13 novembre 2026, aussi la lettrine des titres de section, le repère et le filet du premier chiffre clé, la barre de lecture en haut de l'écran. 4,8:1 sur la page. Jamais en fond : un fond rouge reste la marque de la Direction |
| `muted` | `#C0C9E2` | Texte secondaire |
| `warn` | `#FFC857` | Données périmées et erreurs de collecte, et ce qui attend l'encadrement : demandes à traiter, pastille, points de l'état du site. Et le survol d'un pseudo (`.pseudo`), un état passager qui ne se confond pas avec un avertissement |
| `--texte-courant` | `#E3E8F4` | Le texte courant des pages (`main`), un blanc adouci : 15,0:1 sur la page. Les titres et les gros chiffres restent en blanc pur |
| `ok` | `#A6E3B4` | Une réussite : le message après un envoi (`.form-success`). Dans les onglets de la Direction, ce qui est en règle ou fait (« Validé », « OK », « Branché ») |
| `danger` | `#FF6B6B` | Ce qui est bloqué ou en échec, en texte : un compte suspendu, une demande absente de la liste, un lien refusé ; et les boutons qui retirent (« Suspendre », « Refuser », « Supprimer ») sous la souris ou au clavier. Le rouge du drapeau (`red`) reste un accent |
| `ally` | `#9DBCFF` | Un joueur allié dans l'onglet Comptes ; ailleurs à la Direction, une information sans jugement (« Demain », « Info », un rôle). Le bleu clair des liens du site, qui ne change pas avec le thème |

**Couleurs des prestiges (13 novembre 2026) :** l'emblème du niveau des comptes, sur la liste des membres et les fiches (`src/components/NiveauEmblem.tsx`), prend les couleurs que le jeu donne à chaque prestige, l'or de la Légende et le prisme du prestige 10 (`src/lib/niveau.ts`, voir `NOTICE.md`). Ce ne sont pas des jetons : elles ne colorent que la jauge et le bord de l'emblème, jamais un texte, et le chiffre reste blanc. La note de lecture de la liste en donne la clé.

**Règle du tricolore :** en accent dans l'interface (filets, soulignement de la page active, loader). Pas de texte blanc sur le rouge vif, trop peu contrasté à petite taille.


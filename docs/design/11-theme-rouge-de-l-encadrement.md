<!-- Partie de docs/DESIGN.md : « Couleurs » › « Thème rouge de l'encadrement ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### Thème rouge de l'encadrement

`/direction` est rouge : l'encadrement sait d'un coup d'œil qu'il est dans son espace, administration comprise. La page passe `theme="rouge"` à `Base.astro`, qui pose `data-theme="rouge"` sur `<html>` (du 10 au 12 novembre 2026, les onglets de l'administration au QG le portaient aussi). Le socle de la feuille (`01-socle.css`) redonne alors à chaque jeton une teinte rouge, rôle pour rôle : aucun composant n'a de couleur à lui. Les noms ne changent pas : `navy` y est un bordeaux très sombre, `blue` le rouge du bouton principal.

| Jeton | Thème rouge | Contraste vérifié |
|---|---|---|
| `navy` | `#300A10` | Texte blanc 17,9:1. Le fond porte une lueur rouge et un reflet bleu |
| `night` | `#22060B` | Texte blanc 19,1:1 |
| `surface` | `#3F121A` | Texte blanc 16:1, `muted` 9,6:1, liens 8,1:1 |
| `surface-2` | `#501A23` | Texte blanc 13,9:1, liens 7,1:1 |
| `line` | `#6B2C37` | Bordures |
| `line-strong` | `#9E5D68` | 3,2:1 sur une carte, 3,8:1 sur `night` |
| `blue` | `#D4132F` | Bouton principal : texte blanc 5,3:1, et 7,1:1 au survol (`#B00F27`) |
| `blue-text` | `#FF9DAD` | Liens |
| `muted` | `#E2C0C6` | Texte secondaire |
| `--texte-courant` | `#F4E4E7` | Texte courant, le blanc adouci teinté de rose : 14,5:1 |

- Le filet tricolore, la frontière et la barre de lecture gardent le bleu du drapeau (`flag-blue`) : c'est l'identité du clan.
- **Bleu, blanc, rouge sur la page blanche (14 novembre 2026).** Le blanc du drapeau ne s'écrit pas avec `--ecriture`, qui est marine sur la page : le filet et le guerrier se lisaient bleu, noir, rouge. Le segment du milieu du filet (`.tribar`) est blanc (`--sur-couleur`), cerné d'un filet d'un pixel (`line-strong`). Le guerrier en caractères est **en relief** : son blanc reste blanc (`--logo-blanc: var(--sur-couleur)`), sans aucun fond, et deux ombres courtes de la couleur de l'écriture (`--logo-relief`, une serrée et une douce, bordeaux à la Direction) le détachent de la page comme un gaufrage ; son bleu est celui du drapeau. La même ombre est posée sur le dessin à plat (`.console-logo`) et sur la toile du guerrier de l'accueil (`.holo-toile`). Choisi par le pilote sur une planche de cinq essais (halo fondu, argent sans fond, blanc cerné, relief, dans une scène) ; un disque marine plein derrière le guerrier a été refusé (« je déteste ça, je veux que ce soit fondu ») : ne pas le remettre.
- Les effets s'inversent : le rouge mène et le bleu répond. Clic gauche et toucher rouges, clic droit bleu, traînée du curseur et territoires ambiants surtout rouges.
- `.form-problem`, un refus du serveur ou un avertissement comme « Absent de la liste », s'y écrit en jaune `warn`, la couleur de « Plus dans la liste » : en rose, il se perdrait dans le décor.
- `/compte` reste bleu : c'est la page de chaque membre, pas un espace de l'encadrement.
- Un test e2e vérifie que `/direction` est rouge, que `/qg` reste bleu dans son style Terminal et que toutes les autres pages restent bleues. Axe contrôle aussi ses contrastes, mais les tests construisent le site sans serveur de connexion : il n'y voit que la carte « connexion pas ouverte ». Les vrais écrans (tuiles, formulaires, tableau, onglets, refus en jaune) ont été contrôlés par axe avec un faux serveur, sur bureau et téléphone : le 8 novembre 2026, puis le 10 novembre pour chaque onglet du QG et de la Direction.


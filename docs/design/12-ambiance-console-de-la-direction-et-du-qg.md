<!-- Partie de docs/DESIGN.md : « Couleurs » › « Ambiance console de la Direction et du QG ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### Ambiance console de la Direction et du QG

Depuis le 11 novembre 2026, à la demande du pilote (« un thème un peu hacker, admin, trop cool », « il faut que ça fonde avec le reste »), `/direction` ajoute au rouge l'ambiance d'un poste de commandement. La page passe `ambiance="console"` à `Base.astro`, qui pose `data-ambiance="console"` sur `<html>`. Tout est dans `src/styles/feuilles/01-socle.css`, section « Ambiance console », sous ce sélecteur : sans lui, les classes `console-*` ne font rien. Les couleurs, les titres en Outfit, le tricolore, les boutons, l'en-tête, le pied de page et le fond animé restent ceux du site. Le QG la prend aussi depuis le 12 novembre 2026, en bleu : voir « Le QG en style Terminal », plus bas.

| Élément | Rendu |
|---|---|
| Grille | Le pas des cases de conquête (28 px), un trait plus marqué toutes les 4 cases, le rouge du marqueur à 9 et 16 %, qui s'efface vers les bords : les cases qui s'allument au passage du curseur tombent dedans |
| Écran | Lignes de balayage fixes (noir à 15 %, une tous les 4 px) et coins assombris, derrière le contenu |
| Invite | `gal@direction:~$` en chasse fixe au-dessus du titre, et un curseur en pavé rouge qui clignote. Décorative : masquée aux lecteurs d'écran |
| Titre | Un décalage bleu et rouge, net et fixe, le tricolore vu à travers un écran. Sans lueur rouge ni couleurs à demi transparentes depuis le 14 novembre 2026 : sur la page blanche, elles rendaient le titre flou |
| Chasse fixe | JetBrains Mono (OFL-1.1), jeton `--font-console` : menu des parties, libellés et chiffres des tuiles, rôle, état du site, dates et nombres (`.tnum`), noms des champs. Pas `--font-mono`, dont se servent le champ du code de connexion et les formules des guides. La police (40 Ko) n'était préchargée que sur la Direction et le QG ; depuis le 12 novembre 2026, elle l'est sur toutes les pages, où le poste de commandement s'en sert |
| Cartes | Des repères aux quatre coins, comme un viseur (`--console-repere`), décoratifs. Le style Terminal les remplace par des cadres en traits doubles |
| Tuiles | Libellé en capitales espacées, chiffre blanc en chasse fixe avec une lueur, jaune quand des demandes attendent |
| Compte | Un voyant vert allumé devant le rôle |
| État du site | Depuis le 14 novembre 2026, une pastille devant chaque ligne : « OK » en vert `ok`, « À voir » en jaune `warn`, « Info » en bleu `ally` (voir « Les douze autres onglets de la Direction ») ; les étiquettes `[ OK ]` d'avant sont retirées |
| Champs | Curseur de saisie rouge, lueur autour du champ où l'on écrit. Pas de capitales sur le nom d'un champ : « Retapez « Nom » pour confirmer » doit montrer le nom tel qu'il faut le taper |

- **Mouvement :** à l'ouverture, l'invite s'écrit lettre à lettre en 0,9 s, et une bande de lumière descend une fois l'écran en 2,8 s, derrière le contenu, puis s'éteint. Le curseur clignote comme celui d'un terminal (voir plus haut, « Mouvement » des pages ouvertes à tous). Avec le bouton pause ou « réduire les animations », l'invite est entière d'emblée et la bande n'apparaît jamais : au repos, elle est invisible. Elle est portée par `<html>` lui-même, que `.fx-off *` ne vise pas : une règle à part l'arrête.
- **Contrastes :** la grille, l'écran et la bande sont des calques fixes sous `main` et le pied de page (z-index 1) : aucun texte n'y perd. Ils disparaissent à l'impression et en contraste élevé. Le 11 novembre 2026, avec un faux serveur, axe n'a trouvé aucun défaut sur les onglets Vue d'ensemble, Annonces et Événements, sur bureau et téléphone, et aucune largeur de 360 à 1 920 px ne déborde.


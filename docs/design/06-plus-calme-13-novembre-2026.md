<!-- Partie de docs/DESIGN.md : « Le poste de commandement » › « Plus calme (13 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### Plus calme (13 novembre 2026)

Le 12 novembre 2026 au soir, le pilote a transmis des remarques reçues sur le design, puis a répondu « Oui, vas-y » : les petites retouches d'abord (moins de gras, pseudos, jauges unies, infos de service en petit italique, voir « Typographie »), puis ce lot, montré sur neuf planches avant/après et validé en entier (« Oui, tout »). Tout est dans `src/styles/feuilles/07-calme.css`, section « Plus calme : le second lot », et dans `PageHeader.astro`. Toutes ces règles visent les pages avec `data-lettres` : le QG et la Direction gardent leur écran du style Terminal, halo et lueurs compris. Seule exception, les aplats des scènes, que reprend le pop-up des appels des Gaulois, sur toutes les pages.

| Remarque | Ce qui change |
|---|---|
| « enlever la surbrillance sur TOUT » | Plus de halo qui suit la souris, dans un bloc ou sur la page (`#fx-aurora`), ni de frontière tricolore au survol, ni de lueur autour des gros chiffres, ni de lumière qui passe sur le titre, ni de reflet qui passe sur la ligne de GAL, ni de ligne éclairée au survol d'un tableau, ni de rayonnement du bouton principal. Sur la Carte et le guide, les icônes et le titre perdent aussi leur lueur. Restent : le contour blanc du focus clavier, les cases du fond qui s'allument sous la souris, les vagues au clic et le guerrier de l'accueil |
| « réagencer les hauts de pages » | Le filet tricolore et l'invite sur une ligne (elles passent l'une sous l'autre sur un petit écran), un titre de 64 px au plus au lieu de 96 (80 px depuis le 14 novembre 2026, voir « Tailles »), et à sa droite, quand la place le permet, l'introduction et la date ; sinon, elles passent dessous (`flex-wrap`). Sur un ordinateur, le contenu commence dans le premier écran. Le titre compact du QG et de la Direction ne change pas |
| « enlever le bg dans les tableaux et en mettre un qui contraste » | Les grands tableaux (`.data-table`) ont un fond uni, `surface`, un filet autour et des coins de carte ; leur en-tête est en `surface-2`. La trame du décor ne passe plus derrière les lignes |
| « dégradés plus discrets, 3/5 % » | Les scènes en aplats (voir « Scènes »), la carte mise en avant de la gazette aussi, et la lueur de la page passe de 30 à 5 % |
| « plus utiliser la seconde couleur qui est le rouge » | Le rouge en touches : lettrines des titres de section, repère et filet du premier chiffre clé, barre de lecture. Jamais en fond |
| « la même DA du bleu en bg sur TOUT le site, arrêter le noir et le bleu foncé » | Un seul bleu de fond, `#0A1230`, pour toutes les pages ouvertes à tous ; la Carte et le guide quittent le noir du Terminal pour ce bleu, avec des lignes d'écran plus légères. Plus de coins assombris, plus de scène ni de pied de page noirs. La barre du navigateur et le site installé prennent ce bleu |

Les images du robot sur Discord gardent leur fond : elles ne sont pas des pages du site.


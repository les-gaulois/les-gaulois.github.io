<!-- Partie de docs/DESIGN.md : « Le thème sombre « Nuit Marine » (16 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

## Le thème sombre « Nuit Marine » (16 novembre 2026)

Le pilote a rapporté que « beaucoup de personnes » trouvaient le site « trop clair », et a demandé cinq propositions sombres « avec la possibilité de choisir clair ou sombre ». Sur des captures du vrai site (Nuit Marine, Encre, Ardoise, Braise, Crépuscule), il a choisi « le 1, Nuit Marine » : **le bleu marine que le site avait avant le 14 novembre**, l'envers de « Neige Marine ». Le thème clair reste « Neige Marine » ; les quatre autres propositions sont écartées.

**Le choix du visiteur :**

- Un bouton de l'en-tête, à côté de la pause (`[data-mode-toggle]`, `src/scripts/mode.ts`) : la lune en clair, le soleil en sombre, « Thème sombre » enfoncé ou non pour les lecteurs d'écran. Avec le bouton de connexion, la place manque sous 640 px : le choix est alors dans le menu, en toutes lettres (« Passer au thème sombre », « Passer au thème clair »).
- Sans choix de sa part, le site suit le réglage de son appareil (`prefers-color-scheme`), y compris s'il change pendant la visite. Dès qu'il appuie, son choix est retenu dans son navigateur (clé `gal-mode`, « clair » ou « sombre »), et rien n'est envoyé.
- `Base.astro` pose `data-mode="sombre"` sur `<html>` par un script en ligne, avant le premier affichage : la page ne s'ouvre jamais d'abord en clair. Il met aussi `color-scheme` à `dark` et la barre du navigateur (`theme-color`) au fond de la page, `#0A1230`, ou `#300A10` à la Direction.

**Les couleurs :** `:root[data-mode="sombre"]` (`01-socle.css`) repose chaque jeton avec la valeur des îlots sombres, celles du tableau « Couleurs », plus bas : page `#0A1230`, creux `#081029`, cartes `#101B45` et `#182658`, filets `#24346B` et `#5469AE` (3,2:1 sur une carte), écriture blanche, texte courant `#E3E8F4`, texte secondaire `#C0C9E2`, liens `#9DBCFF`. Aucun composant ne change : qui écrit en `var(--ecriture)` et pose ses fonds par les jetons se lit dans les deux thèmes.

- **Un seul bleu de fond**, au QG, au guide et à la Carte compris (remarque du pilote du 12 novembre : « garder la même DA du bleu en bg sur TOUT le site ») : le sélecteur du thème sombre passe devant la palette claire du Terminal et celle de `07-calme.css`, en comptant un sélecteur d'attribut de plus qu'elles. Le Terminal garde son bleu de bouton, `#0A4FD6`, et son vert devient `#4ADE80`.
- **La Direction et toute zone rouge** : le bordeaux d'avant le 14 novembre (page `#300A10`, creux `#22060B`, cartes `#3F121A` et `#501A23`, filets `#6B2C37` et `#9E5D68`, liens `#FF9DAD`, texte secondaire `#E2C0C6`).
- **Les scènes colorées, le bouton principal, le drapeau, les Gaulois et les bannières** sont les mêmes dans les deux thèmes.
- **Une règle de plus à tenir** : une couleur écrite en dur doit se lire sur le blanc et sur le marine, ou passer par un jeton. Un script qui dessine dans la couleur de l'écriture la lit au moment de dessiner (`getPropertyValue("--ecriture")`), le visiteur pouvant changer de thème sans recharger.

Contrôles : `tests/unit/theme-sombre.test.ts` (contrastes de la page, du QG et de la Direction, sélecteurs qui passent devant le Terminal) et, dans `tests/e2e/site.spec.ts`, le bouton, le choix retenu, l'appareil en sombre et l'accessibilité de chaque page en sombre.


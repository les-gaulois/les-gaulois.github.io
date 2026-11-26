<!-- Partie de docs/DESIGN.md : « Le kit du jeu (21 novembre 2026) » › « Les fonds d'objets (22 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### Les fonds d'objets (22 novembre 2026)

Demande du pilote : « un fond, une bannière pour chaque item, pour chaque cosmétique du jeu, pour chaque familier, pour
qu'il y ait un fond derrière qui soit propre », avec Claude Fable 5.2. Chaque objet à rareté (273), familier (100) et Gaulois
unique (11) est posé sur sa petite scène en pixels, dans les cases du vestiaire, de la boutique, de la forge, du pass, de la
vitrine, du marché, des fenêtres d'achat et sur la face des cartes qui sortent des boosters (une fenêtre de 62 × 34 cases
encadrée de la couleur de la rareté, au-dessus du nom ; l'animation n'a pas changé). Pas derrière le corps, le visage ni les
bannières, qui sont elles-mêmes des fonds. À ne pas confondre avec les « fonds du jeu » (paysages derrière tout l'écran,
`src/lib/jeu/fonds-du-jeu.ts`).

- **41 scènes en six lots**, dessinées par Claude Fable 5.2 (`src/lib/village/fonds-objets/scenes-a.ts` à `scenes-f.ts`,
  catalogue dans `socle.ts`) : la campagne, le front et le métal, mers et saisons, le village en fête, légendes et trésors,
  le divin (une scène par tenue divine). La table `attribution.ts` donne la sienne à chaque chose d'après son sujet ; un test
  refuse une chose sans scène.
- **Une variante par chose** : la graine tirée de sa clé déplace le décor, sa couleur la plus présente teinte un détail. Deux
  choses de la même scène n'ont jamais le même fond.
- **La finition commune** (`finition.ts`) : un halo clair derrière la chose, son ombre au sol, puis la rareté sans un mot,
  qui grandit du commun au divin (éclats dans les coins, aura d'or du légendaire, rayons turquoise du divin).
- **Clair et calme** : luminance moyenne d'au moins 0,40 à toute taille et tout rang (le test la mesure ; le pilote n'aime
  pas les cartes sombres), le milieu sans détail fin, trame ordonnée et jamais de bruit.
- **Au grain de la chose** : une case du fond vaut une case du dessin, agrandi comme avant ; le fond remplit la place de
  l'image à une case près (`DessinSurFond.tsx`, qui mesure la boîte). L'atelier `scripts/atelier-gaulois/fonds.ts` montre
  chaque scène aux tailles des écrans et toutes les choses de chaque scène (`.cache/atelier-fonds/`).


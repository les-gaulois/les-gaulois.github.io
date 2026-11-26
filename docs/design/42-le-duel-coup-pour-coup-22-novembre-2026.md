<!-- Partie de docs/DESIGN.md : « Le kit du jeu (21 novembre 2026) » › « Le duel « Coup pour coup » (22 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### Le duel « Coup pour coup » (22 novembre 2026)

`/village#duel` (`src/components/village/duel/`, feuille `22-jeu-duel.css`, tout sous `.duel-jeu`) : le duel de cartes
de « Mon Gaulois », repris de la maquette validée par le pilote (« j'aime beaucoup », Claude Fable 5.2), et les écrans
dessinés autour par Claude Fable 5.2 (icônes de `dessins-ecran.ts`). Les règles sont au moteur partagé
(`supabase/functions/code-discord/duel/`) : l'écran ne fait que montrer ce qu'il rend (`moteur-du-site.ts`).

- **Qui le voit** : tout membre quand le serveur dit le duel ouvert ; tant qu'il est fermé, le pilote seul (`acces.ts`).
  Une adresse `#duel` qu'on n'a pas le droit d'ouvrir ramène à « Ma carte ». Son icône de menu est dessinée dans la page
  (`image` d'`OngletDuJeu`), sans toucher aux icônes du kit.
- **La scène** (`SceneDuDuel.ts`) : la maquette telle quelle, sur les outils du kit (`Planche`, écriture, icônes de rareté) :
  les deux Gaulois devant la bannière du lieu, la main qui vit, l'aperçu avant de poser, la carte d'en face cachée, la
  révélation, les coups, les mots-clés, la fatigue, la fin ; le premier duel guidé en quatre bulles (`gal-duel-guide`). Les
  cartes (`dessins-des-cartes.ts`) restent claires à la couleur de leur rareté, avec les finitions holographiques de la
  maquette ; les sons (`sons-du-duel.ts`) passent par le réglage du son du jeu. Une manche se joue dans la page (machine du
  navigateur, entraînement) ou au serveur (`jouer`, duel compté) ; une partie reprise rejoue ses manches sans les montrer.
  Sur téléphone, l'arène prend toute la largeur de l'écran. Une carte se pose si le moteur la dit libre (`libres` : quand
  toutes se reposent, celles qui reviennent le plus tôt restent jouables), la règle même du serveur.
- **Les gestes d'armes** (`src/lib/jeu/gestes-armes.ts`, chorégraphies de Claude Fable 5.2) : au lieu de la poussée de la
  maquette, le Gaulois se sert de l'objet de sa carte. Il tient toujours l'arme de sa main ; une frappe suit la famille de
  cette arme (la lame tranche, la masse s'abat, la lance pique, l'arc et la fronde tirent un projectile qui vole jusqu'à
  l'adversaire), la tête cogne, le haut garde, les pieds prennent de l'élan, le bas souffle. Chaque geste part pour que
  son coup touche à l'instant de l'impact, la garde d'en face encaisse à ce même instant, et l'élan de chaque arme l'amène
  juste au contact. Pendant son geste, le Gaulois passe devant les cartes posées au milieu. La toile d'un Gaulois tient
  l'image entière d'un geste (`IMAGE_DU_GESTE`), plus grande que lui ; sous `prefers-reduced-motion`, chaque geste n'est
  qu'une pose fixe.
- **Pour les salles en direct** (vague 2) : `entreeDirecte` (la scène part sans « Entrer dans l'arène »),
  `interrompre(verdict, mot)` (la fin tout de suite, même quand une carte attend le serveur) et `libelles` (les mots des
  deux boutons de la fin).
- **L'accueil** (`LeDuel.tsx`) : l'entraînement en trois niveaux (apprenti, guerrier, druide), ma défense (mes cinq cartes,
  repoussés et fois battu), ma collection (« 21 sur 273 »), le boss du jour et les défis (`BossEtDefis.tsx`), et l'entrée
  « Les salles » (`duel-salles/Entree.tsx`, à la session des salles), qui ne paraît que si le serveur a les salles ; leur
  vue (`duel-salles/LesSalles.tsx`) ne se charge qu'en y entrant et emporte la main de jeu. Juste après, l'entrée
  « Le tableau » (`duel-tableau/Entree.tsx`, à la session du tableau et de la saison), qui se cache aussi sans le serveur ;
  sa vue (`duel-tableau/LeTableau.tsx`) se charge de même à la demande.
- **Le boss du jour** : un Gaulois unique debout sur sa bannière, son pouvoir, et le bouton pour l'affronter. Au serveur,
  le duel est compté (`commencer_duel` puis une manche à la fois) ; une partie laissée en route reprend où elle en était,
  contre son boss, même le lendemain. Tant que le serveur n'a pas le duel, la machine du navigateur le joue pour l'essai,
  sans rien gagner. La logique sans écran est dans `partie-du-boss.ts`, testée.
- **Les défis** : de petites énigmes du contenu, une consigne courte chacune, joués dans la page sans le serveur. Ceux
  qu'on a réussis ne sont retenus que sur l'appareil (`gal-duel-defis`).
- **La collection** (`Recueil.tsx`) : les vraies cartes du membre (son inventaire et les cartes de base). Une carte qu'on n'a
  pas est grisée (proposition de Claude Fable 5.2 : face pâlie sans couleur, objet en silhouette, bord en pointillé), avec
  où la trouver (boutique, booster, pass, qui mènent à leur partie ; le divin au booster seul, la saison au pass seul). Le
  même recueil sert de tiroir pour changer une carte de sa main, sous la bourse.
- **Ma main de défense** : le Gaulois « chez toi » devant sa bannière, les cinq cartes, la bourse, « Enregistrer » ;
  l'historique de ceux qui t'ont battu et de ceux que tu as repoussés. Au téléphone, deux boutons dans l'en-tête montrent
  l'une ou l'autre. Une défense enregistrée, ici ou sur un autre appareil, devient aussi la main de jeu (boss,
  entraînement, salles), gardée sur l'appareil (`gal-duel-main`) ; une carte changée dans l'arène ne change qu'elle
  (24 novembre 2026, `choisirLaMainDeJeu` d'`ecran-duel.ts`). Quand « Enregistrer » est grisé, la carte qui n'est plus
  dans la garde-robe est cerclée de rouge (une ombre : le contour reste au focus), « Plus à toi » dessous si la carte est
  assez large, et la raison s'écrit en clair sous le bouton (`phraseDuRefus`).
- **Le badge « carte de duel »** sous un objet sorti du booster surprise : retiré le 22 novembre 2026, la grande carte de la fin du booster porte ses effets (« Les cartes des cosmétiques »).



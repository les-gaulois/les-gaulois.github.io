<!-- Partie de docs/DESIGN.md : « Couleurs » › « Le menu des parties » › « Les icônes des parties ». Sommaire et ordre des parties : docs/DESIGN.md. -->

#### Les icônes des parties

Le 12 novembre 2026, le pilote a demandé « des petites icônes dans le thème gaulois et hacker » pour chaque partie de la Direction et du QG. Chaque partie a la sienne dans le menu : après le chemin dans le bouton, entre la branche et le nom dans la liste.

- **Gaulois :** des objets d'un village et d'un camp gaulois. Aucun ne vient d'une œuvre protégée : le casque ailé est celui du logo du clan, et il n'y a ni menhir, ni potion, ni serpe, ni personnage.
- **Hacker :** dessinées en pixels, sur une grille de 13 cases sur 13. **En pastilles depuis le 14 novembre 2026**, comme le guide du clan (le pilote : « pareil, mets-moi ça en couleur », pour le QG, puis « pareil à la Direction ») : chaque icône a la couleur de son rang dans le menu, du rouge au rose (onze teintes, `src/lib/teintes.ts`, règles `[data-teinte]` et `.pastille-icone`), sur une petite case de la même couleur, pâle. Jusque-là, en vert de terminal avec la lueur d'un écran au phosphore. Dans la partie ouverte, en vidéo inversée, l'icône est blanche comme son nom, sans case. Rien ne bouge.
- **Deux teintes :** une case est pleine ou en demi-teinte (à moitié transparente), pour le détail : les ailes du casque, la porte, les chaînes de la balance.
- **Taille :** 26 px, soit 2 px par case : les bords des cases tombent sur les pixels de l'écran. Un nombre impair de cases laisse une colonne au milieu pour les objets symétriques.
- **Où :** les dessins sont du texte dans `src/lib/icones-parties.ts` (« # » plein, « + » demi-teinte, « . » vide), avec le calcul du tracé, testé ; `IconePartie.tsx` les affiche. Une partie nomme son icône par `icon` dans `QG_TABS` ou `DIRECTION_TABS`, une fenêtre de la page Carte dans `FENETRES` (`src/lib/carte-console.ts`) : sans elle, ou avec un nom qui n'existe pas, `npm run typecheck` échoue (la construction seule ne vérifie pas les types).
- **Décoratives :** masquées aux lecteurs d'écran, le nom de la partie est écrit à côté. En contraste élevé, elles reprennent la couleur du texte qui les porte et perdent leur case : le système n'impose pas ses couleurs à un `<svg>`, et l'icône blanche de la partie ouverte ne se verrait plus sur un fond clair (trouvé par le relecteur).

| Partie | Icône |
|---|---|
| QG · Moi | Le casque ailé du guerrier (`casque`) |
| QG · Salons | Le feu de camp, où l'on se retrouve (`feu`) |
| QG · Ce soir | La lune, une étoile derrière elle (`lune`) : jamais entre ses cornes, où elle ferait un autre emblème |
| QG · La semaine | Un calendrier à chevilles, sept jours (`calendrier`) |
| QG · Simulateur | L'abaque (`abaque`) |
| QG · Décisions, Direction · Sondages | La balance (`balance`) : la même chose, vue des deux côtés |
| QG et Direction · Événements | La bannière (`banniere`) |
| QG · Idées | L'éclair de Taranis (`eclair`) |
| QG · Le mur | Un mur de pierres (`mur`) |
| Direction · Vue d'ensemble | La tour de guet (`tour`) |
| Direction · Demandes | La porte de la palissade (`porte`) |
| Direction · Comptes | Le bouclier (`bouclier`) |
| Direction · Journal | La tablette (`tablette`) |
| Direction · Annonces | Le cor (`cor`) |
| Direction · Mot d'accueil | La hutte (`hutte`) |
| Direction · Gaulois de la semaine | Le coq (`coq`) |
| Direction · Objectif | Le javelot dans la cible (`cible`) |
| Direction · Discord | Le corbeau messager (`corbeau`) : pas de logo de Discord |
| Direction · Fondateur | La clé du village (`cle`) |
| Carte · Objectif | Le javelot dans la cible (`cible`), comme l'objectif de la Direction |
| Carte · Clans | Trois boucliers ronds (`boucliers`) |
| Carte · Moments | Le sablier (`sablier`) |
| Carte · Journées | Le calendrier à chevilles (`calendrier`), comme la semaine du QG |
| Carte · Zones | Le fanion planté sur la butte (`fanion`) |
| Carte · Fronts | Deux épées croisées (`epees`) |
| Carte · Chiffres | Le bâton à encoches, quatre traits et un cinquième en travers (`encoches`) |
| Carte · Réglages | La roue du char (`roue`) |
| Carte · bouton « Vue d'ensemble » | La tour de guet (`tour`), comme la vue d'ensemble de la Direction |
| Carte · Alliance, outil « Déplacer » | Quatre flèches, vers les quatre côtés (`fleches`) |
| Carte · Alliance, outil « Pinceau » | Le pinceau en biais, sa virole en demi-teinte (`pinceau`) |
| Carte · Alliance, outil « Rectangle » | Un cadre plein, rempli en demi-teinte (`cadre`) |
| Carte · Alliance, outil « Gomme » | La gomme posée sur la ligne (`gomme`) |

Une nouvelle partie reçoit une nouvelle icône, dessinée dans la même grille : un test refuse deux dessins identiques. La même chose garde la même icône d'une page à l'autre (l'objectif, la vue d'ensemble) ; deux fenêtres de la page Carte n'ont jamais la même.


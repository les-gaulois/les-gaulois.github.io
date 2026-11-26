<!-- Partie de docs/DESIGN.md : « Le kit du jeu (21 novembre 2026) » › « Les salles du duel (22 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### Les salles du duel (22 novembre 2026)

`/village#duel`, « Les salles » (`src/components/village/duel-salles/`, feuille `23-jeu-duel-salles.css`, classes `ds-` sous
`.duel-jeu`) : les matchs en direct, avec mise, entre deux membres. Dessin et spécification de Claude Fable 5.2, code de
Claude Opus 5.5. Le serveur fait foi (« Les salles du duel » de `docs/DIRECTION.md`) ; l'écran le relit environ chaque seconde.

- **L'entrée** (`Entree.tsx`) : un panneau sur toute la largeur de l'accueil du duel, l'icône des salles (deux cartes face à
  face, la pièce de la mise), la frise des six emblèmes (cachée au téléphone) et la cagnotte de la saison. Il ne paraît que si
  le serveur connaît les salles.
- **Les dessins** (`dessins-salles.ts`) : l'icône des salles, six emblèmes de 32 cases sur la même planche de bois (une pièce,
  deux pièces, deux piles, une bourse, un coffret, un coffre d'or), la cagnotte (un chaudron de pièces), le sablier des 30
  secondes (sept images, un cran toutes les cinq secondes, sable rouge aux cinq dernières), la place vide (un tabouret et une
  silhouette en pointillé), le dos de carte « a posé » (coche verte) ou « réfléchit » (trois points), la machine de l'essai
  (une tête d'automate en bois), le cadenas, les deux pièces de la mise rendue.
- **Le hall** : ta main (cinq petites cartes ; un clic ouvre le tiroir du recueil), les matchs du jour en tube à crans, les six
  salles (prix ; « Attend » quand un Gaulois y attend ; cadenas et emblème grisé quand elle est fermée pour toi, sans dire
  pourquoi : jamais un solde), les règles dans un pli. Pendant l'essai (duel fermé), un bandeau dit que la machine joue en face
  et que rien n'est misé. Au téléphone, la main tient sur une ligne et les six salles se voient sans défiler.
- **L'attente** : ton Gaulois, la place vide en face, le temps écoulé (« 0:42 », la seule heure de l'écran), « On cherche un
  Gaulois » et trois carrés qui prennent l'or à tour de rôle, lentement ; « Quitter la salle » ne coûte rien et ne touche jamais
  un match qui viendrait de commencer. Tient dans un écran de téléphone.
- **Le match** : la scène du duel, telle quelle, branchée sur le serveur (`pont.ts`) ; la carte d'en face reste un dos jusqu'à
  la révélation. Au-dessus, un bandeau : partir (avec confirmation, « Quitter, c'est perdre »), le sablier et les secondes
  (comptées sur l'horloge du serveur ; rouges aux cinq dernières, avec un son discret par seconde), l'état d'en face
  (« réfléchit », « a posé »), le pot et ce qu'en reçoit le gagnant. Le lecteur d'écran entend le début de chaque manche, dix
  et cinq secondes, et « a posé », jamais chaque seconde.
- **La fin** : la scène entre seule (`entreeDirecte`) et finit dans son propre panneau, dont les boutons disent « Les salles »
  et « Rejouer ici » (`libelles`). Au combat, elle joue la dernière manche ; un match fini autrement (le temps, un départ, le
  duel fermé) y finit tout de suite (`interrompre`, options de la scène ajoutées par la session de l'écran du duel) ; sous le
  bilan, la raison et ce que dit le serveur de l'argent. Le panneau de fin des salles (`Fin.tsx`) sert quand la scène n'est pas
  là, une fin retrouvée en revenant : l'issue, « Gagné 180 » en vert, « Perdu 100 » en rouge ou « Mise rendue », la raison, la
  part de la cagnotte, « Rejouer » dans la même salle et « Les salles ». Au téléphone, il se pose au milieu, au-dessus du menu
  du bas.
- **Essayé** avec un faux serveur dans Chromium, à 1 440 × 900 et 390 × 700, dans les deux thèmes (60 contrôles : pas de
  défilement horizontal, les six salles, l'attente et la scène qui tiennent dans l'écran, la carte d'en face cachée, la carte
  posée au clavier, la fin, axe sur le hall et la fin, aucune erreur de page). Jamais avec deux vrais comptes.


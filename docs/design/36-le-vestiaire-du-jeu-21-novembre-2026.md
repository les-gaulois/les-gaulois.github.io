<!-- Partie de docs/DESIGN.md : « Le kit du jeu (21 novembre 2026) » › « Le vestiaire du jeu (21 novembre 2026) ». Sommaire et ordre des parties : docs/DESIGN.md. -->

### Le vestiaire du jeu (21 novembre 2026)

`/village#gaulois` (`VestiaireDuJeu.tsx`, maquette validée par le pilote) : le Gaulois du membre en grand devant sa
bannière, sur un socle, ses huit emplacements autour de lui (à gauche la tête, le haut, le bas, les pieds ; à droite le
corps, l'arme, le familier, la bannière), et les cartes du rayon ouvert, les cases claires à la couleur de leur rareté
(`Case` de `Cases.tsx`, que le pilote aime : à affiner, pas à changer).

- **Les emplacements sont les onglets** des rayons d'avant (mêmes identifiants, `vestiaire-rayon-<rayon>`, flèches, Début
  et Fin), plus le familier et la bannière, qui avaient leur pli au-dessus des rayons. Chacun montre ce qu'il porte, dans le
  cadre de sa rareté, « Nouveau » en billet doré, et son essai (`data-essai`). La collection du rayon (« 12 sur 62 ») est
  écrite au-dessus de ses cartes. À l'inscription, seuls les six premiers paraissent.
- **Le glisser** (`Essayage.tsx`) : on attrape une carte, on la lâche sur la scène du Gaulois ; elle vole jusqu'à son
  emplacement, le Gaulois change de tenue (un essai jusqu'à « Enregistrer », comme avant : la case enregistrée garde sa
  coche, celle de l'écran porte « essai »), saute, et le vestiaire fait son bruit (`enfile`, `enfile2`). Lâchée à côté, la
  carte revient ; Échap pendant la prise aussi. Un clic, Entrée ou Espace font la même chose sans glisser. La prise se fait
  par délégation sur le panneau, et la carte reçoit à l'arrivée le clic d'un visiteur : les cases gardent leur code.
- **Au doigt**, défiler ne prend jamais une carte : en rangée qui défile de côté (`touch-action: pan-x`, téléphone), le
  doigt qui part vers le haut ou le bas prend la carte ; en grille (`pan-y`, grand écran), le doigt qui part de côté
  (`src/lib/jeu/geste.ts`, testé). La feuille du vestiaire doit garder ces deux valeurs.
- **La pause et « réduire les animations »** : rien ne vole, le changement se fait d'un coup ; la carte tenue suit toujours
  le pointeur, puisque c'est le visiteur qui la bouge.
- **La copie qui vole** est posée dans `body`, dans une enveloppe `.vestiaire-jeu.vj-fantome` : les règles des cartes
  s'écrivent sous `.vestiaire-jeu .case`, pour qu'elle leur ressemble.
- **Rien ne se perd** : tout le vestiaire d'avant (`useVestiaire` de `src/components/compte/Vestiaire.tsx`) sert aussi
  à l'inscription dans « Mon compte », qui garde la page d'avant, sans rien du jeu (le test des feuilles le vérifie). La
  bourse n'est plus dans le vestiaire du jeu : la barre du jeu la montre toujours.


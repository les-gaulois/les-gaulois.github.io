# Le monde du village des Gaulois, retiré

Le monde du village en pixels (lot 7 du village des Gaulois, 14 et 15 novembre 2026) a été retiré du site le
15 novembre 2026, à la demande du pilote : « je crois que je suis parti trop loin, sauf la partie cosmétiques et perso,
c'est sympa car il s'affiche sur les images du clan », puis « enlève la partie villages ». Le site est fait pour les
joueurs d'OpenFront ; le Gaulois et ses objets sont là pour valoriser les bons joueurs du clan. Ne pas refaire le monde
sans sa demande. Le résumé est dans `docs/DIRECTION.md`, au début de « Le village des Gaulois ».

Ce fichier racontait le monde lot par lot (l'écran immersif, la foule jusqu'à 1 000 Gaulois, la grand-rue et ses
terrasses, le port, le train, l'usine et la défense d'OpenFront, le chantier de 15 bâtiments, le grand feu, la forge, le
dedans des bâtiments, l'almanach des 650 petits moments écrits par Claude Fable 5.2 pour 23,18 dollars). Ce récit, et
tout le code retiré, se lisent dans l'historique de Git, avant le commit du retrait : `git show 9f8eb9fd:docs/VILLAGE-MONDE.md`.

## Ce qui reste de ce lot

- **La forge aux souvenirs**, devenue l'onglet « La forge » de la page « Mon Gaulois » (`/village`,
  `src/components/village/Forge.tsx`, la plaque dorée dans `src/lib/village/plaque.ts`, les styles dans
  `src/styles/feuilles/14-forge.css`). Ses règles ne changent pas : 150 statères par gravure, une plaque par objet, un
  objet gravé ne se vend pas au marché, une plaque ne se lit des autres membres que pour un pseudo public
  (`get_ma_forge`, `graver_objet`, `effacer_gravure`, migration `20261114001000_village_forge.sql`).
- **Le calcul du chantier et du grand feu** (`src/lib/village/chantier-liste.ts`, `chantier.ts`, `monde-etat.ts`,
  `monde-site.ts`), que le site publie toujours dans `/village/monde.json` pour la commande /feu du robot Discord
  (`supabase/functions/code-discord/feu.ts`), mise en ligne par le pilote. Le feu : les points rapportés au clan sur les
  7 × 24 heures qui finissent au relevé, seuils 100, 175, 325 et 475. Le site ne montre plus ni le chantier ni le feu, et
  le robot n'annonce plus les bâtiments finis.
- **Le relevé vocal** (`scripts/animer-village.ts`, `src/lib/village/vie-releve.ts`), toutes les 5 minutes dans
  `victoires.yml`, pour le fond « salle de réunion » de /gaulois. Il n'envoie plus rien à l'API Claude : plus de bulles.
- **Au serveur, rien n'est retiré** : tables, fonctions et données restent (`get_village`, bulles, plafond), sans page qui
  les appelle. Retirer une table ou ses données se demande au pilote.

<!-- Partie de docs/DIRECTION.md : « Le village des Gaulois » › « La revente au jeu ». Sommaire et ordre des parties : docs/DIRECTION.md. -->

### La revente au jeu

Demande du pilote, le 17 novembre 2026 : « donner la possibilité de pouvoir revendre au système 70 % de la valeur de son cosmétique ». À 70 % pour tout, une pochette surprise de 200 statères, qui donne en moyenne 290 statères d'objets (`npm run village:economie`), en aurait rendu 203 : le jeu aurait créé des statères. Je lui ai posé la question ; son choix : « achetés 70 %, le reste 50 % », et rien pour les objets reçus sans payer.

Migration `20261117000400_revente_au_jeu.sql` (elle ne fait qu'ajouter : une table, six fonctions, aucune fonction existante remplacée), formes dans `src/lib/village/revente.ts`, écran `DialogueRevente` de `MarcheDialogues.tsx`, ouvert par « Revendre au jeu » dans la carte du marché de l'onglet « La boutique ».

- La revente ne regarde pas l'objet mais ce que le compte a payé pour lui. Chaque paiement noté au journal des statères ouvre un droit de revente pour ce même objet, qui ne sert qu'une fois (`internal.village_reventes`, une ligne par droit servi).
- Acheté à la boutique (journal `achat`, l'étal du sentier aussi) : 70 % du prix de sa rareté aujourd'hui, ou 70 % de ce qui avait été payé si c'était moins. L'étal vend avec une remise de 30 % : sans cette seconde borne, il aurait rendu tout ce qu'il recevait, et l'on aurait acheté puis revendu sans fin (trouvé à la relecture).
- Tiré d'une pochette surprise payée (journal `pochette`) : 50 %. La pochette reste perdante : 145 pour 200 en moyenne.
- Aucun droit, donc pas de revente au jeu : un palier du sentier, une pochette gagnée à la loterie (son prix est crédité puis débité dans la même opération : la migration le reconnaît), une fusion à la forge, un objet divin (il n'a pas de prix), un achat fait pendant un essai du mode GOD (noté `test_…`), et un objet acheté au marché. Ce dernier point est mon choix, dit au pilote : l'achat à la boutique à l'origine de l'objet a déjà ouvert un droit chez le vendeur ; en ouvrir un second chez l'acheteur ferait rendre au jeu plus qu'il n'a reçu.
- Comme au marché : le dernier exemplaire d'un objet porté ou gravé ne part pas, ni l'exemplaire venu du marché quand il ne reste que lui. Rien ne se revend pendant un essai du mode GOD.
- Seuls les objets de la garde-robe (de la tête à l'arme) se revendent : ni familier, ni bannière, ni Gaulois unique.
- Les deux parts sont dans `internal.revente_taux_achat()` et `internal.revente_taux_autre()`. Ne jamais monter la seconde au-dessus de 200 divisé par la valeur moyenne d'une pochette (68 % aujourd'hui), ni ouvrir un droit pour un objet reçu sans payer : le jeu créerait des statères. Cette borne bouge avec les réglages de la Direction : baisser le prix de la pochette, monter les chances des raretés hautes ou monter les prix des raretés fait rendre plus aux pochettes déjà ouvertes, car un droit de pochette se calcule au prix du jour. Avant de toucher à ces réglages, relancer `npm run village:economie` et vérifier que la moitié de la valeur moyenne d'une pochette reste sous son prix.
- Qui a acheté un objet, l'a vendu au marché, puis le reçoit d'un palier peut revendre ce dernier : le droit va à l'objet, pas à l'exemplaire. Le jeu ne rend alors que 70 % d'un achat qu'il a bien encaissé.
- À savoir : dans l'onglet Village de la Direction, « dépensés » additionne les achats et les pochettes sans retrancher les reventes.
- Essayée le 17 novembre sur une base de test (PGlite, tables réduites) : 21 cas, dont le même droit refusé deux fois, la pochette gagnée, le palier, le divin, le marché, la gravure et le mode GOD.
- Migration collée par le pilote le 17 novembre 2026 : contrôlé sans compte, `get_ma_revente` et `revendre_objet` existent et refusent un visiteur (`permission denied`). Sur un serveur qui ne la connaîtrait pas, le bouton « Revendre au jeu » ne paraît pas.


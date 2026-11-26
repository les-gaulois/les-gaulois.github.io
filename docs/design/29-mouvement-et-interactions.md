<!-- Partie de docs/DESIGN.md : « Mouvement et interactions ». Sommaire et ordre des parties : docs/DESIGN.md. -->

## Mouvement et interactions

L'idée centrale reprend le principe d'OpenFront, la conquête de territoire : derrière la page, une grille de cases s'allume et s'éteint. **Cet effet est purement décoratif : il n'affiche aucune donnée du clan.**

| Geste | Effet |
|---|---|
| Déplacer la souris | Les cases s'allument sur son passage, les blocs s'inclinent (le halo qui suivait le curseur dans les blocs est retiré le 13 novembre 2026), les boutons sont attirés, le logo suit le curseur. À l'accueil, le guerrier tourne la tête vers lui et le suit du regard |
| Survoler un bloc | Rien ne s'allume depuis le 13 novembre 2026 (une frontière tricolore en faisait le tour) : « enlever la surbrillance sur TOUT » |
| Clic gauche | Vague de conquête bleue, onde de choc et éclats. L'onde traverse aussi le bloc cliqué. |
| Clic droit sur le fond | Vague de conquête rouge, onde de choc et éclats. L'onde traverse aussi le bloc cliqué. |
| Clic gauche sur le logo | Pulsation et vague plus grande. À l'accueil, le guerrier répond dans sa bulle |
| Clic droit sur le logo | Tour complet du logo et vague rouge plus grande. À l'accueil, le guerrier fait son tour dans l'espace : on le voit de dos |
| Toucher un écran | Vague bleue. Pas d'effet de survol. À l'accueil, le guerrier regarde un moment l'endroit touché |
| Défiler | Blocs qui apparaissent en fondu, titres mot à mot, barre de progression, chiffres clés qui se lèvent en fondu, déjà à leur vraie valeur (ils montaient de zéro jusqu'au 14 novembre 2026) |
| Survoler le graphique des parties | Colonne glissante, repère de valeur, barres voisines éclairées |
| Cliquer sur un graphique ou la heatmap | Une onde se propage depuis le clic, bleue ou rouge selon le bouton |
| Survoler la heatmap | Réticule sur le jour et l'heure, infobulle qui suit le curseur |
| Changer de période | Barres qui repoussent, balayage tricolore, nouveaux chiffres qui se lèvent en fondu |
| Trier les membres | Les lignes glissent vers leur nouvelle place |
| Rien | Lente flottaison du logo, petits territoires qui naissent et disparaissent seuls. À l'accueil, sans curseur, le guerrier regarde lentement autour de lui, et dit une réplique de temps en temps |
| Ouvrir une page | L'invite s'écrit. À l'accueil, le guerrier tombe en colonnes, dans ses couleurs, puis prend son relief |
| Ouvrir un chapitre du guide | Le chapitre glisse de 12 px, du côté d'où il vient, et sa commande s'écrit dans la barre de sa fenêtre, une fois |

**Depuis le 8 novembre 2026, les blocs ne sont plus conquis case par case à leur apparition, et la frontière ne fait plus le tour d'un bloc toute seule.** Le pilote trouvait ces mouvements agressifs : des cases recouvraient ce qu'on lisait. Les blocs apparaissent en fondu, et la conquête reste pour les gestes du visiteur, ses clics et la première vague de l'accueil. Un graphique ou un tableau posé sur le fond sans case (`.fx-block`) apparaît en fondu comme un bloc, et ses animations attendent qu'il entre à l'écran ; dans une scène, il apparaît avec elle. Il n'a ni halo ni onde à lui : leur bord dessinerait la case qu'il n'a plus.

Sur les pages rouges de l'encadrement, le bleu et le rouge échangent leurs rôles dans tous ces gestes : traînée du curseur, clic gauche, toucher et territoires ambiants y sont rouges, le clic droit et l'onde qu'il lance bleus.


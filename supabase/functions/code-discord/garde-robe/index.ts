/**
 * La garde-robe du village des Gaulois : les objets ajoutés au catalogue du lot 1 le 14 novembre 2026 (demande du pilote :
 * « 200 modèles de plus avec ensemble des cosmétiques », et des yeux, bouches et cicatrices gratuits dès la création).
 * Un fichier par lot de dessins, chacun d'un seul auteur ; `gaulois.ts` les range dans le catalogue (`OBJETS`). Les dessins
 * sont de Claude Fable 5.2, originaux, faits pour le clan [GAL].
 *
 * Un lot n'importe de `gaulois.ts` que des types : ses couleurs sont écrites en clair, pour qu'aucun import ne tourne en
 * rond.
 */
import type { ObjetDuLot } from "../gaulois.ts";
import { LOT_ARME_A } from "./arme-a.ts";
import { LOT_ARME_B } from "./arme-b.ts";
import { LOT_BAS } from "./bas.ts";
import { LOT_HAUT_A } from "./haut-a.ts";
import { LOT_HAUT_B } from "./haut-b.ts";
import { LOT_PIEDS } from "./pieds.ts";
import { LOT_TETE_A } from "./tete-a.ts";
import { LOT_TETE_B } from "./tete-b.ts";
import { LOT_VISAGE } from "./visage.ts";

/** Tous les objets de la garde-robe, lot après lot. */
export const GARDE_ROBE: readonly ObjetDuLot[] = [...LOT_VISAGE, ...LOT_TETE_A, ...LOT_TETE_B, ...LOT_HAUT_A, ...LOT_HAUT_B, ...LOT_BAS, ...LOT_PIEDS, ...LOT_ARME_A, ...LOT_ARME_B];

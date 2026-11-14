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

/** Tous les objets de la garde-robe, lot après lot. */
export const GARDE_ROBE: readonly ObjetDuLot[] = [];

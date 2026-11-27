/**
 * Novembre doublé (le pilote, 27 novembre 2026 : « et bien sûr rembourser ceux du mois de novembre avec un message quand il
 * entre dans mon gaulois avec + (montant stateres) avec explications », puis « si ils ont gagné 6000 ils auront +6000 »).
 *
 * Le jour où un point rapporté au clan est passé de 30 à 60 statères (`STATERES_PAR_POINT`, `stateres.ts`), le serveur a
 * versé une fois à chaque compte la somme de ses crédits de novembre à 30 (migration 20261127000100,
 * `internal.stateres_points_doubles`). Ce fichier lit sa réponse et écrit le message que le membre voit une seule fois en
 * entrant dans « Mon Gaulois » (`PointsDoubles.tsx`) : le montant, d'abord, puis pourquoi. Le serveur sait s'il a été vu.
 */
import { STATERES_PAR_POINT } from "../stateres";
import { nombre, stateres } from "./ecran-boutique";

/** Ce que valait un point rapporté au clan avant le 27 novembre 2026. */
export const ANCIEN_PAR_POINT = 30;

/** Le rattrapage d'un compte, tel que le serveur le rend. */
export interface PointsDoubles {
  montant: number;
  parties: number;
  vu: boolean;
}

const entierPositif = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x > 0;

/** La réponse du serveur (`doubles` de `get_mes_points_doubles`), ou `null` si elle n'a pas la bonne forme ou est vide. */
export function lirePointsDoubles(x: unknown): PointsDoubles | null {
  if (typeof x !== "object" || x === null) return null;
  const { montant, parties, vu } = x as Record<string, unknown>;
  if (!entierPositif(montant) || !entierPositif(parties) || typeof vu !== "boolean") return null;
  return { montant, parties, vu };
}

/** Le message : le montant en titre, puis pourquoi, en trois phrases courtes. */
export function motsDesPointsDoubles(d: Pick<PointsDoubles, "montant" | "parties">): { titre: string; lignes: [string, string, string] } {
  const une = d.parties === 1;
  return {
    titre: `+${stateres(d.montant)}`,
    lignes: [
      `Un point rapporté au clan vaut maintenant ${STATERES_PAR_POINT} statères, au lieu de ${ANCIEN_PAR_POINT}.`,
      une
        ? `Votre partie de novembre vous avait rapporté ${stateres(d.montant)} : ${d.montant > 1 ? "vous les recevez" : "vous le recevez"} une seconde fois.`
        : `Vos ${nombre(d.parties)} parties de novembre vous avaient rapporté ${stateres(d.montant)} : ${d.montant > 1 ? "vous les recevez" : "vous le recevez"} une seconde fois.`,
      d.montant > 1 ? "Ils sont déjà dans votre bourse." : "Il est déjà dans votre bourse.",
    ],
  };
}

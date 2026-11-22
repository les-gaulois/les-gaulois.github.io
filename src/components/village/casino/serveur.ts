import { casino } from "../../../lib/compte/api";
import type { EtatDuCasino } from "../../../lib/village/contrat-casino";
import { lireEtatDuCasino } from "../../../lib/village/ecran-casino";

/**
 * La lecture de l'état du casino pour l'onglet du menu (`acces.ts`), chargée à la demande. Les coups passent par `casino` de
 * `src/lib/compte/api.ts` (`casino.roue`, `casino.machine`…), le seul point de contact du navigateur avec le serveur.
 */

/** L'état du casino pour ce compte, ou `null` si le serveur ne le connaît pas (la migration n'est pas encore collée). */
export async function lireLeCasino(): Promise<EtatDuCasino | null> {
  try {
    return lireEtatDuCasino(await casino.etat());
  } catch {
    return null;
  }
}

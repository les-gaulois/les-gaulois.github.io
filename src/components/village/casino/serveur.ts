import { call, casino } from "../../../lib/compte/api";
import type { EtatDuCasino } from "../../../lib/village/contrat-casino";
import { casinoMontre, lireEtatDuCasino } from "../../../lib/village/ecran-casino";
import { lireModeGod } from "../../../lib/village/god";
import { CASINO_POUR_TOUS } from "./acces";

/**
 * La lecture de l'état du casino pour l'onglet du menu (`acces.ts`), chargée à la demande. Les coups passent par `casino` de
 * `src/lib/compte/api.ts` (`casino.roue`, `casino.machine`…), le seul point de contact du navigateur avec le serveur.
 */

/**
 * L'état du casino pour ce compte, ou `null` quand l'onglet ne doit pas paraître : le serveur ne connaît pas le casino, ou il
 * n'est pas encore ouvert à tous et ce compte n'est pas son titulaire (`CASINO_POUR_TOUS`).
 */
export async function lireLeCasino(): Promise<EtatDuCasino | null> {
  try {
    if (!CASINO_POUR_TOUS) {
      const god = await call<unknown>("get_village_god").then(lireModeGod, () => null);
      if (!casinoMontre(CASINO_POUR_TOUS, god)) return null;
    }
    return lireEtatDuCasino(await casino.etat());
  } catch {
    return null;
  }
}

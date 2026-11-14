/**
 * L'état du monde du village tel que le site le construit : les sessions du clan de `data/sessions/`, l'heure de leur
 * relevé (`meta.sessions.coveredUntil` de `data/meta.json`) et les mois illisibles, lus par `data.ts` à la construction,
 * puis le calcul de `chantier.ts`. La page `/village` le reçoit, et `/village/monde.json` le publie pour /feu.
 * Rien n'est du temps réel : tout est au dernier relevé, et le feu disparaît si ce relevé a plus de 48 heures.
 */
import { loadMeta, loadSessions, unreadableSessionFiles } from "../data";
import { etatDuMonde } from "./chantier";
import type { EtatDuMonde } from "./monde-etat";

/** L'état du monde au moment de la construction du site (`maintenant`, l'heure du calcul, sert au seul âge du relevé). */
export function etatDuMondeDuSite(maintenant: Date = new Date()): EtatDuMonde {
  return etatDuMonde({
    sessions: loadSessions(),
    releve: loadMeta().sessions.coveredUntil,
    moisIllisibles: unreadableSessionFiles().map((fichier) => fichier.replace(/\.json$/, "")),
    maintenant,
  });
}

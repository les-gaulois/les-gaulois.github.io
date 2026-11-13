/**
 * L'état d'un réglage de l'onglet Discord de la Direction, d'un coup d'œil (14 novembre 2026, demande du pilote : les
 * onglets « comme pour la section compte », avec des codes couleur). Une couleur et son mot, tirés de ce que le serveur
 * rend déjà (`set`, `last`, `check`…) : rien n'est deviné, et un état inconnu n'est jamais une réussite. Les phrases
 * complètes restent celles de `discord-appels.ts`, `discord-salons.ts` et `discord-message.ts`.
 *
 * Vert `ok` en règle, jaune `warn` à regarder, rouge `danger` en échec, bleu `ally` une information, gris `muted` rien à faire.
 */
import type { DiscordCalls, LastSend } from "./discord-appels";
import type { SavedImage } from "./discord-images";
import type { MessageSalon, SentMessage } from "./discord-message";
import { checkFails, type RobotSalon } from "./discord-salons";

export type EtatTon = "ok" | "warn" | "danger" | "ally" | "muted";

export interface Etat {
  ton: EtatTon;
  mot: string;
}

const BRANCHE: Etat = { ton: "ok", mot: "Branché" };
const PAS_REGLE: Etat = { ton: "warn", mot: "Pas réglé" };
const SANS_REPONSE: Etat = { ton: "warn", mot: "Discord sans réponse" };

/** Ce que le dernier envoi change à l'état d'un salon branché ; `null` : rien, l'envoi est accepté, oublié ou absent. */
function etatDuDernierEnvoi(last: LastSend | null): Etat | null {
  switch (last?.outcome.state) {
    case "refused":
      return { ton: "danger", mot: "Dernier envoi refusé" };
    case "unsent":
      return { ton: "danger", mot: "Dernier envoi non parti" };
    case "timeout":
    case "silent":
      return SANS_REPONSE;
    case "waiting":
      return { ton: "ally", mot: "Essai en cours" };
    default:
      return null;
  }
}

/**
 * Un salon du robot. Branché ici : le contrôle du robot sur ce lien, puis le dernier essai. Pas branché ici : le robot
 * peut poster avec le secret GitHub, ce que dit son dernier contrôle ; sinon rien ne part.
 */
export function etatDuSalon(salon: RobotSalon): Etat {
  const { check } = salon;
  if (salon.set) {
    if (check?.source === "direction" && checkFails(check)) return { ton: "danger", mot: "Lien refusé" };
    return etatDuDernierEnvoi(salon.last) ?? BRANCHE;
  }
  if (check?.source !== "secret") return PAS_REGLE;
  if (checkFails(check)) return { ton: "danger", mot: "Secret GitHub refusé" };
  if (check.status !== null && check.status >= 200 && check.status < 300) return { ton: "ally", mot: "Par le secret GitHub" };
  return SANS_REPONSE;
}

/** Les appels du QG sur Discord. */
export function etatDesAppels(calls: DiscordCalls): Etat {
  if (!calls.set) return PAS_REGLE;
  return etatDuDernierEnvoi(calls.last) ?? BRANCHE;
}

/** Le ping des appels : possible seulement avec un rôle réglé. `null` : pas de salon, donc rien à dire. */
export function etatDuPing(calls: DiscordCalls): Etat | null {
  if (!calls.set) return null;
  return calls.role ? { ton: "ally", mot: "Ping possible" } : { ton: "muted", mot: "Sans ping" };
}

/** Le lien du salon vocal, lu par `get_qg_tools` (`null` : pas de lien). */
export const etatDuVocal = (voice: string | null): Etat => (voice === null ? PAS_REGLE : { ton: "ok", mot: "Réglé" });

/** L'inventaire d'images : son nombre, et les images dont le fichier manque. Un inventaire vide ne dit rien. */
export function etatsDesImages(images: readonly SavedImage[]): Etat[] {
  const missing = images.filter((image) => image.missing).length;
  const etats: Etat[] = [];
  if (images.length > 0) etats.push({ ton: "muted", mot: images.length === 1 ? "1 image" : `${images.length} images` });
  if (missing > 0) etats.push({ ton: "warn", mot: missing === 1 ? "1 fichier manquant" : `${missing} fichiers manquants` });
  return etats;
}

/** Un salon ajouté pour les messages : ce que Discord a répondu à la lecture de son webhook. */
export function etatDuSalonAjoute(salon: MessageSalon): Etat {
  if (salon.checking) return { ton: "ally", mot: "Vérification" };
  const status = salon.checkStatus;
  if (status === null) return { ton: "muted", mot: "Pas vérifié" };
  if (status === 0) return SANS_REPONSE;
  return status >= 200 && status < 300 ? { ton: "ok", mot: "Lien vérifié" } : { ton: "danger", mot: "Lien refusé" };
}

/** Un message envoyé : retiré du salon, sinon ce que Discord a répondu à l'envoi. */
export function etatDuMessage(message: SentMessage): Etat {
  if (message.remove.state === "done") return { ton: "muted", mot: "Retiré" };
  switch (message.outcome.state) {
    case "accepted":
      return { ton: "ok", mot: "Accepté" };
    case "refused":
      return { ton: "danger", mot: "Refusé" };
    case "unsent":
    case "unreached":
      return { ton: "danger", mot: "Non parti" };
    case "timeout":
    case "silent":
      return { ton: "warn", mot: "Sans réponse" };
    case "waiting":
      return { ton: "ally", mot: "En attente" };
    case "forgotten":
      return { ton: "muted", mot: "Envoyé" };
  }
}

/** Le plus grave de plusieurs états, pour le trait de couleur d'un ensemble : échec, puis à regarder, puis le reste. */
export function tonLePlusGrave(etats: readonly Etat[]): EtatTon {
  for (const ton of ["danger", "warn", "ally", "ok"] as const) if (etats.some((etat) => etat.ton === ton)) return ton;
  return "muted";
}

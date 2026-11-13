/** La discussion de l'alliance : l'heure d'un message, en heure de Paris, et ce qui reste à lire. */
import { parisParts } from "../time";
import type { MessageAlliance } from "./types";

/** Un message garde au plus 500 caractères, comme le serveur l'exige. */
export const MESSAGE_MAX = 500;

const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const jour = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" });

/** « 14:05 » le jour même, « hier, 14:05 », puis « 12 nov., 14:05 ». */
export function heureDuMessage(at: string, maintenant: Date): string {
  const d = new Date(at);
  const ce = parisParts(d).date;
  const aujourdhui = parisParts(maintenant).date;
  const hier = parisParts(new Date(maintenant.getTime() - 86_400_000)).date;
  const h = heure.format(d);
  if (ce === aujourdhui) return h;
  if (ce === hier) return `hier, ${h}`;
  return `${jour.format(d)}, ${h}`;
}

/**
 * Les messages arrivés depuis la dernière lecture de la discussion, hors des siens. `vu` : le numéro du dernier message
 * lu dans ce navigateur, `null` à la première visite (rien n'est alors compté comme nouveau).
 */
export function nonLus(messages: readonly MessageAlliance[], vu: number | null): number {
  if (vu === null) return 0;
  return messages.filter((m) => m.id > vu && !m.mine).length;
}

/** Le numéro du dernier message, pour noter ce qui est lu. */
export const dernierNumero = (messages: readonly MessageAlliance[]): number | null => messages.at(-1)?.id ?? null;

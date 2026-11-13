/** La discussion de l'alliance : ce qui reste à lire. L'heure d'un message, en français ou en anglais, est dans `textes.ts`. */
import type { MessageAlliance } from "./types";

/** Un message garde au plus 500 caractères, comme le serveur l'exige. */
export const MESSAGE_MAX = 500;

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

/**
 * La pastille de l'en-tête : le nombre de demandes qui attendent un officier.
 * Le serveur ne le donne qu'à l'encadrement (`count_pending_requests`). Quand une demande est traitée
 * sur la page, l'administration le signale, et la pastille se relit sans attendre la page suivante.
 */
export const PENDING_CHANGED = "gal-demandes-traitees";

export function announcePendingChange(): void {
  window.dispatchEvent(new Event(PENDING_CHANGED));
}

/** Ce que les lecteurs d'écran entendent après le nombre de la pastille, accordé. `null` : pas de pastille. */
export function pendingWords(count: number | null): string | null {
  if (count === null || count <= 0) return null;
  return count === 1 ? "demande à traiter" : "demandes à traiter";
}

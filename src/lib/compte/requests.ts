/**
 * Les demandes d'adhésion, côté administration : depuis combien de temps elles attendent, et les raisons toutes prêtes.
 * Le serveur les donne déjà de la plus ancienne à la plus récente (`list_membership_requests`).
 */
import { fmtDuration } from "../format";

/** Au-delà de ce délai, une demande attend trop : elle passe en jaune. */
export const LATE_REQUEST_HOURS = 48;

export interface RequestWait {
  text: string;
  late: boolean;
}

export function requestWait(createdAt: string, now: Date): RequestWait {
  const ms = now.getTime() - Date.parse(createdAt);
  return {
    text: ms < 60_000 ? "en attente depuis moins d'une minute" : `en attente depuis ${fmtDuration(ms)}`,
    late: ms > LATE_REQUEST_HOURS * 3_600_000,
  };
}

/**
 * Des raisons de refus toutes prêtes, qui remplissent le champ sans rien envoyer : on peut les compléter.
 * Le membre lit la raison d'un refus telle quelle, dans « Mon compte » : « Votre dernière demande a été refusée : … ».
 * Une validation n'en montre aucune : rien à proposer pour elle.
 */
export const READY_REASONS = ["Pas reconnu sur Discord.", "Pseudo absent de la liste officielle.", "Demande en double."] as const;

/** Le serveur ne donne pas plus de demandes que cela (`list_membership_requests`). */
export const REQUESTS_LIMIT = 200;

/** Le résumé en haut de la liste. Les demandes arrivent de la plus ancienne à la plus récente. */
export function requestsSummary(count: number, oldest: RequestWait): string {
  if (count === 1) return `1 demande, ${oldest.text}.`;
  const capped = count >= REQUESTS_LIMIT ? ` L'écran montre les ${REQUESTS_LIMIT} plus anciennes.` : "";
  return `${count} demandes, de la plus ancienne à la plus récente. La première est ${oldest.text}.${capped}`;
}

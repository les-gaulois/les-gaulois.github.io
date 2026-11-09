/**
 * La colonne « Liste » de l'onglet Membres, dans /admin : où en est chaque compte face à la liste officielle du clan.
 *
 * Le profil OpenFront n'est lié qu'à la validation (`internal.approve_membership`) : avant, le site ne sait pas
 * quel joueur est derrière le compte, qui garde son nom « Gaulois n° … ». À la validation, `openfront_username`
 * reçoit le pseudo lu dans la liste le jour de la demande : présent, il prouve que le joueur y figurait.
 * `in_roster` compare le profil lié à la liste relue chaque jour (`list_members`).
 *
 * Une demande que la liste n'a pas reconnue garde l'empreinte du texte tapé (`request_membership`), souvent un pseudo.
 * La liste ne garde que l'empreinte de l'identifiant public : un compte validé ainsi n'y est jamais retrouvé, même
 * si le joueur entre dans le clan ensuite. Le site ne peut donc pas dire qu'il en est absent, seulement qu'il ne l'y trouve pas.
 */
import { REQUESTS_LIMIT } from "./requests";
import type { MemberRow, RequestRow } from "./types";

export type RosterCell = "in" | "left" | "not_found" | "request" | "no_request" | "unknown";

export const ROSTER_CELL_LABELS: Record<RosterCell, string> = {
  in: "Oui",
  // Il y figurait sous un pseudo le jour de sa demande, et son identifiant n'y est plus.
  left: "Plus dans la liste",
  // Validé hors de la liste, ou membre sans pseudo public sorti depuis : ni « absent » ni « plus », que le site ne peut pas vérifier.
  not_found: "Pas trouvé dans la liste",
  request: "Demande à traiter",
  no_request: "Aucune demande en cours",
  unknown: "—",
};

/** Ce qui demande un coup d'œil de l'encadrement s'écrit en jaune (`docs/DESIGN.md`, couleur `warn`). */
export const ROSTER_CELL_WARN: ReadonlySet<RosterCell> = new Set(["left", "not_found", "request"]);

/** Les demandes en attente, par numéro de Gaulois. `complete` est faux quand le serveur a coupé la liste. */
export interface OpenRequests {
  numbers: ReadonlySet<number>;
  complete: boolean;
}

/** `null` tant que les demandes ne sont pas lues, ou si leur lecture a échoué : on ne devine rien. */
export function openRequests(rows: readonly Pick<RequestRow, "number">[] | null): OpenRequests | null {
  if (rows === null) return null;
  return { numbers: new Set(rows.map((r) => r.number)), complete: rows.length < REQUESTS_LIMIT };
}

export function rosterCell(member: Pick<MemberRow, "number" | "status" | "linked" | "in_roster" | "openfront_username">, requests: OpenRequests | null): RosterCell {
  if (member.linked) {
    if (member.in_roster) return "in";
    return member.openfront_username ? "left" : "not_found";
  }
  // Pas encore de profil lié : seul un compte en attente peut faire une demande.
  if (member.status !== "pending" || requests === null) return "unknown";
  if (requests.numbers.has(member.number)) return "request";
  // Liste coupée : ce compte peut avoir une demande parmi celles que l'écran ne voit pas.
  return requests.complete ? "no_request" : "unknown";
}

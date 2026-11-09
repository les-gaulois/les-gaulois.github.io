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
 * « Refaire la demande » (`reset_member_link`) remet un tel compte en attente, pour que la personne indique son pseudo exact.
 */
import { REQUESTS_LIMIT } from "./requests";
import { ROLE_LABELS, type MemberRow, type RequestRow, type Role } from "./types";

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
  // Validé sans aucun lien, par exemple après une restauration de la sauvegarde : la liste ne le trouve pas non plus.
  if (member.status === "validated") return "not_found";
  // Pas encore de profil lié : seul un compte en attente peut faire une demande.
  if (member.status !== "pending" || requests === null) return "unknown";
  if (requests.numbers.has(member.number)) return "request";
  // Liste coupée : ce compte peut avoir une demande parmi celles que l'écran ne voit pas.
  return requests.complete ? "no_request" : "unknown";
}

/** Le rang d'un rôle, comme `internal.rank_of` sur le serveur. */
export const ROLE_RANK: Record<Role, number> = { member: 1, officer: 2, admin: 3, founder: 4 };

/**
 * Le bouton « Refaire la demande » : pour un compte validé que la liste ne trouve pas, et pour un admin ou le fondateur,
 * qui ne touche qu'aux rôles en dessous du sien. Le serveur revérifie tout (`reset_member_link`) : ceci ne fait qu'afficher.
 */
export function canRedoRequest(member: Pick<MemberRow, "number" | "status" | "linked" | "in_roster" | "openfront_username" | "role">, viewerRank: number): boolean {
  return viewerRank >= 3 && member.status === "validated" && rosterCell(member, null) === "not_found" && ROLE_RANK[member.role] < viewerRank;
}

/** Ce que la personne indique dans sa nouvelle demande. Un membre sans pseudo public n'est retrouvé que par son identifiant. */
const WHAT_TO_GIVE = "son pseudo OpenFront exact, ou son identifiant public si elle est anonyme dans la liste";

/** La question posée avant d'agir : ce qui change pour le compte, et ce que la personne devra faire. */
export function redoRequestQuestion(name: string, role: Role): string {
  const lost = role === "member" ? "" : ` Son rôle d'encadrement (${ROLE_LABELS[role]}) lui sera retiré : il pourra lui être redonné après sa validation.`;
  return `Remettre le compte ${name} en attente ?\n\nLe QG lui restera fermé jusqu'à sa nouvelle validation.${lost} La personne devra refaire sa demande dans « Mon compte », avec ${WHAT_TO_GIVE}, puis un officier la validera.`;
}

/** Le message après coup : ce qui est fait, et la suite à donner, avec le nom Discord sous lequel prévenir la personne. */
export function redoRequestDone(name: string, discordName: string | null): string {
  return `Le compte ${name} est remis en attente. Prévenez ${discordName ?? "la personne"} sur Discord : sa demande est à refaire dans « Mon compte », avec ${WHAT_TO_GIVE}. Sa nouvelle demande arrivera ensuite dans l'onglet Demandes.`;
}

/** La phrase sous le tableau, quand la case « Pas trouvé dans la liste » est à l'écran : elle ne parle du bouton que s'il y est. */
export function notFoundHelp(buttonShown: boolean): string {
  const what = "« Pas trouvé dans la liste » : un tel compte n'est relié à aucun membre de la liste officielle.";
  return buttonShown
    ? `${what} « Refaire la demande » le remet en attente, pour que la personne indique ${WHAT_TO_GIVE}.`
    : `${what} Un admin peut le remettre en attente, ou le fondateur s'il s'agit d'un admin, pour une nouvelle demande.`;
}

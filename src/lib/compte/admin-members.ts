/**
 * La colonne « Liste » de l'onglet Comptes, dans la Direction : où en est chaque compte face à la liste officielle du clan.
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

/** Un joueur allié invité sur la carte de l'alliance, tel que le donne `list_alliance_allies` à l'encadrement. */
export interface AllyMark {
  number: number;
  tag: string;
  alias: string;
  /** Accepté par l'encadrement ; sinon, il a ouvert son lien et attend. */
  approved: boolean;
  /** Il entre en ce moment : accepté, et son clan est dans notre alliance. */
  active: boolean;
}

/**
 * Le statut d'un compte qui est un joueur allié, dans la liste des comptes de la Direction : sans ce repère, il ressemble à
 * un nouveau Gaulois « En attente » qui n'a pas fait sa demande (remarque du pilote, 13 novembre 2026).
 */
export function allyStatus(ally: AllyMark): string {
  const { state, who } = allyStatusParts(ally);
  return `${state} · ${who}`;
}

/** Les deux moitiés de `allyStatus` : l'état, qui s'écrit dans la pastille de couleur, et le joueur, écrit en gris à côté. */
export function allyStatusParts(ally: AllyMark): { state: string; who: string } {
  const who = `[${ally.tag}] ${ally.alias}`;
  if (!ally.approved) return { state: "Allié en attente de votre accord", who };
  if (!ally.active) return { state: "Allié sans accès, son clan n'est plus dans notre alliance", who };
  return { state: "Allié", who };
}

/**
 * Le serveur ne donne pas plus de comptes à la fois (`list_members` : au plus 500). Il les trie par statut : en demander
 * moins couperait d'abord les suspendus, et la case « Suspendus » de la vue d'ensemble ouvrirait un filtre vide.
 */
export const MEMBERS_LIMIT = 500;

/**
 * Vrai quand l'écran n'a peut-être pas tous les comptes : la liste est revenue pleine, ou elle vient déjà d'une recherche
 * faite par le serveur. La recherche à chaque lettre ne voit alors qu'une partie des comptes : la touche Entrée la confie au serveur.
 */
export function listMayBeCut(rowCount: number, serverSearch: string): boolean {
  return serverSearch !== "" || rowCount >= MEMBERS_LIMIT;
}

/*
 * Filtres et couleurs de l'onglet Comptes (demande du pilote, 13 novembre 2026 : « c'est chiant de descendre la page pour
 * voir les membres », « ajoute des code couleur style vert rouge ect »).
 *
 * Chaque compte a un seul état : validé, en attente, suspendu, ou allié (un compte en attente que la carte de l'alliance
 * connaît comme joueur allié). Les quatre filtres d'état font donc, ensemble, le total de « Tous ». « Encadrement » et
 * « À vérifier » les recoupent. Le serveur revérifie toute action : ces filtres ne font qu'afficher.
 */

/** La couleur d'une case : vert (ok), jaune (à regarder), rouge (bloqué), bleu (allié), gris (rien à faire). */
export type MemberTone = "ok" | "warn" | "danger" | "ally" | "muted";

export type MemberState = "validated" | "pending" | "suspended" | "ally";

export function memberState(member: Pick<MemberRow, "status">, ally: AllyMark | undefined): MemberState {
  if (member.status === "pending" && ally) return "ally";
  return member.status;
}

export type MemberFilter = "all" | "validated" | "pending" | "suspended" | "ally" | "staff" | "check";

export const MEMBER_FILTERS: readonly { id: MemberFilter; label: string; tone: MemberTone | null }[] = [
  { id: "all", label: "Tous", tone: null },
  { id: "validated", label: "Validés", tone: "ok" },
  { id: "pending", label: "En attente", tone: "warn" },
  { id: "suspended", label: "Suspendus", tone: "danger" },
  { id: "ally", label: "Alliés", tone: "ally" },
  // Comme la case « Encadrement » de la vue d'ensemble (`get_direction_overview`) : les comptes validés d'un rôle au-dessus de membre.
  { id: "staff", label: "Encadrement", tone: null },
  // Ce qui s'écrit en jaune dans la colonne Liste, et l'allié qui attend l'accord de l'encadrement.
  { id: "check", label: "À vérifier", tone: "warn" },
];

type Filterable = Pick<MemberRow, "number" | "status" | "linked" | "in_roster" | "openfront_username" | "role">;

/** Ce qui demande un coup d'œil : une case jaune de la colonne Liste, ou un allié qui attend l'accord de l'encadrement. */
export function needsCheck(member: Filterable, requests: OpenRequests | null, ally: AllyMark | undefined): boolean {
  if (member.status === "pending" && ally) return !ally.approved;
  return ROSTER_CELL_WARN.has(rosterCell(member, requests));
}

export function inFilter(member: Filterable, filter: MemberFilter, requests: OpenRequests | null, ally: AllyMark | undefined): boolean {
  switch (filter) {
    case "all":
      return true;
    case "staff":
      return member.status === "validated" && member.role !== "member";
    case "check":
      return needsCheck(member, requests, ally);
    default:
      return memberState(member, ally) === filter;
  }
}

/** Le nombre de comptes de chaque filtre, pour les boutons au-dessus de la liste. */
export function filterCounts(rows: readonly Filterable[], requests: OpenRequests | null, allies: ReadonlyMap<number, AllyMark>): Record<MemberFilter, number> {
  const counts = Object.fromEntries(MEMBER_FILTERS.map((f) => [f.id, 0])) as Record<MemberFilter, number>;
  for (const m of rows) {
    const ally = allies.get(m.number);
    for (const f of MEMBER_FILTERS) if (inFilter(m, f.id, requests, ally)) counts[f.id] += 1;
  }
  return counts;
}

/** Sans accents ni majuscules : « teutates » trouve « Teutatès ». */
const plain = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** La recherche, à chaque lettre tapée : le nom, le nom Discord, le pseudo OpenFront lié ou le numéro de Gaulois. */
export function matchesSearch(member: Pick<MemberRow, "number" | "name" | "discord_name" | "openfront_username">, query: string): boolean {
  const q = plain(query);
  if (!q) return true;
  return [member.name, member.discord_name, member.openfront_username, String(member.number)].some((field) => field !== null && plain(field).includes(q));
}

/** La couleur de la case Statut. */
export function statusTone(member: Pick<MemberRow, "status">, ally: AllyMark | undefined): MemberTone {
  if (member.status === "pending" && ally) {
    if (!ally.approved) return "warn";
    return ally.active ? "ally" : "muted";
  }
  return member.status === "validated" ? "ok" : member.status === "pending" ? "warn" : "danger";
}

/** La couleur de la case Liste. Un allié n'est pas concerné par la liste officielle de GAL. */
export function rosterTone(cell: RosterCell, ally: AllyMark | undefined): MemberTone {
  if (ally) return "muted";
  if (cell === "in") return "ok";
  return ROSTER_CELL_WARN.has(cell) ? "warn" : "muted";
}

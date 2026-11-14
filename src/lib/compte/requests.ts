/**
 * Les demandes d'adhésion, côté administration : depuis combien de temps elles attendent, ce que dit chaque ligne de l'onglet
 * Demandes de la Direction (`DirectionDemandes.tsx`), et les raisons toutes prêtes.
 * Le serveur les donne déjà de la plus ancienne à la plus récente (`list_membership_requests`).
 */
import { fmtDateTime, fmtDuration, fmtInt } from "../format";
import type { RequestRow } from "./types";

/** Au-delà de ce délai, une demande attend trop : elle passe en jaune. */
export const LATE_REQUEST_HOURS = 48;

export interface RequestWait {
  text: string;
  /** La durée seule, pour la colonne étroite de la liste : « 3 jours », « moins d'une minute ». */
  short: string;
  late: boolean;
}

export function requestWait(createdAt: string, now: Date): RequestWait {
  const ms = now.getTime() - Date.parse(createdAt);
  const short = ms < 60_000 ? "moins d'une minute" : fmtDuration(ms);
  return {
    text: `en attente depuis ${short}`,
    short,
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

/** La dernière lecture de la liste officielle du clan, que le serveur donne avec les demandes (`app_state`, clé `roster`). */
export interface RosterRead {
  total: number;
  read_at: string;
}

/**
 * La phrase sur la liste officielle, en tête de l'onglet. `undefined` : le serveur n'a pas encore répondu, ou a échoué ; on
 * n'en sait rien, donc on n'en dit rien. `null` : il a répondu que la liste n'a jamais été relue, ce qui se dit en jaune.
 */
export function rosterLine(roster: RosterRead | null | undefined): { text: string; never: boolean } | null {
  if (roster === undefined) return null;
  if (roster === null) return { text: "La liste officielle n'a encore jamais été relue : aucun contrôle automatique pour l'instant.", never: true };
  return { text: `Liste officielle relue le ${fmtDateTime(roster.read_at)} : ${fmtInt(roster.total)} ${roster.total > 1 ? "membres" : "membre"}.`, never: false };
}

/** Le nom qui désigne le joueur sur sa ligne, ses boutons et le message : son nom Discord, sinon son nom sur le site. */
export const requestWho = (r: Pick<RequestRow, "discord_name" | "name">): string => r.discord_name ?? r.name;

/** La couleur d'une demande, au trait de la ligne et à la pastille : vert dans la liste officielle, rouge absent. */
export const requestTone = (r: Pick<RequestRow, "in_roster">): "ok" | "danger" => (r.in_roster ? "ok" : "danger");

/** Le mot de la pastille. La couleur n'est jamais seule à dire l'état. */
export const rosterLabel = (r: Pick<RequestRow, "in_roster">): string => (r.in_roster ? "Dans la liste" : "Absent de la liste");

/**
 * Le texte à côté de la pastille : le pseudo trouvé dans la liste, « membre sans pseudo public » s'il y est sans pseudo, ou ce
 * que le joueur a indiqué s'il n'y est pas. Vide quand il n'y a rien à dire.
 */
export function rosterDetail(r: Pick<RequestRow, "in_roster" | "roster_username" | "claimed_text">): string {
  if (r.in_roster) return r.roster_username ?? "membre sans pseudo public";
  return r.claimed_text ? `a indiqué « ${r.claimed_text} »` : "";
}

/** Le rang dans le jeu, quand il aide à décider. Un simple membre n'a pas de mention. */
export const GAME_ROLES: Readonly<Record<string, string>> = { leader: "Chef dans le jeu", officer: "Officier dans le jeu" };

/** La mention du rang dans le jeu, ou `null` : simple membre, rang inconnu ou absent. */
export function gameRoleLabel(role: string | null): string | null {
  if (role === null || !Object.hasOwn(GAME_ROLES, role)) return null;
  return GAME_ROLES[role] ?? null;
}

/**
 * La ligne de détails sous le nom : le nom sur le site (quand le nom Discord le remplace au-dessus), l'identifiant Discord, puis
 * la date de la demande, à l'heure de Paris.
 */
export function requestDetails(r: Pick<RequestRow, "name" | "discord_name" | "discord_id" | "created_at">): string {
  const parts: string[] = [];
  if (r.discord_name) parts.push(r.name);
  if (r.discord_id) parts.push(`Discord : ${r.discord_id}`);
  parts.push(`demandé le ${fmtDateTime(r.created_at)}`);
  return parts.join(" · ");
}

/** Le message après une décision acceptée par le serveur : il nomme le joueur, puisque sa ligne vient de quitter la liste. */
export const decisionMessage = (who: string, approve: boolean): string => (approve ? `Membre validé : ${who}.` : `Demande refusée : ${who}.`);

/** Le bouton qui ouvre le champ « Raison » : refermé sur un texte, il le dit (« Raison écrite »). Des espaces ne sont pas un texte. */
export const reasonToggleLabel = (open: boolean, reason: string): string => (!open && reason.trim() !== "" ? "Raison écrite" : "Raison");

/**
 * Les brouillons (raisons écrites, champs ouverts) des seules demandes encore dans la liste : une demande traitée, ici ou par un
 * autre officier, emporte le sien. Rend le même objet quand rien ne part, pour ne pas redessiner l'écran pour rien.
 */
export function keepDrafts<T>(drafts: Record<number, T>, ids: Iterable<number>): Record<number, T> {
  const still = new Set(ids);
  const kept = Object.entries(drafts).filter(([id]) => still.has(Number(id)));
  return kept.length === Object.keys(drafts).length ? drafts : (Object.fromEntries(kept) as Record<number, T>);
}

/** Les brouillons sans celui d'une demande que le serveur vient d'accepter de traiter. Même objet si elle n'en avait pas. */
export function dropDraft<T>(drafts: Record<number, T>, id: number): Record<number, T> {
  return keepDrafts(
    drafts,
    Object.keys(drafts)
      .map(Number)
      .filter((other) => other !== id),
  );
}

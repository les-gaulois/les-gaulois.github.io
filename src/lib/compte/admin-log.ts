/**
 * Le journal de l'administration, en clair : chaque ligne du serveur devient une phrase.
 * Le serveur garde les codes (`role_changed`…) et leurs détails. Rien n'est inventé ici :
 * un détail absent n'est pas écrit, et un code sans libellé reste affiché tel quel.
 */
import { fmtCount } from "../format";
import { ROLE_LABELS, type LogRow, type Role } from "./types";

/** Le serveur ne lit pas plus de lignes que cela (`list_admin_log`). */
export const LOG_LIMIT = 500;
/** Les lignes montrées d'abord, puis à chaque « Afficher plus ». */
export const LOG_PAGE = 50;

export type LogCategory = "requests" | "roles" | "suspensions" | "news" | "settings" | "other";

export const LOG_CATEGORIES: readonly { id: LogCategory; label: string }[] = [
  { id: "requests", label: "Demandes" },
  { id: "roles", label: "Rôles" },
  { id: "suspensions", label: "Suspensions" },
  { id: "news", label: "Publications : annonces, événements, sondages, mot d'accueil, idées, Gaulois et objectif de la semaine" },
  { id: "settings", label: "Réglages : les salons Discord et le salon vocal" },
  { id: "other", label: "Autres" },
];

const CATEGORIES: Record<string, LogCategory> = {
  membership_approved: "requests",
  membership_refused: "requests",
  member_link_reset: "requests",
  role_changed: "roles",
  role_preset_applied: "roles",
  founder_bootstrap: "roles",
  founder_transferred: "roles",
  member_suspended: "suspensions",
  member_reinstated: "suspensions",
  announcement_saved: "news",
  announcement_deleted: "news",
  event_saved: "news",
  event_series_saved: "news",
  event_deleted: "news",
  poll_saved: "news",
  poll_closed: "news",
  poll_deleted: "news",
  welcome_saved: "news",
  idea_decided: "news",
  idea_removed: "news",
  weekly_pick_saved: "news",
  weekly_pick_deleted: "news",
  weekly_goal_saved: "news",
  weekly_goal_deleted: "news",
  discord_calls_saved: "settings",
  discord_calls_cleared: "settings",
  discord_salon_saved: "settings",
  discord_salon_cleared: "settings",
  voice_channel_saved: "settings",
  voice_channel_cleared: "settings",
};

/** Les salons du robot, comme le journal les nomme. Un salon inconnu reste « un salon Discord du robot ». */
const ROBOT_SALONS: Record<string, string> = { nouvelles: "le salon Discord des nouvelles", encadrement: "le salon Discord de l'encadrement" };

/** Les décisions de la boîte à idées, comme le journal les écrit. Mêmes codes que `IDEA_STATUS_LABELS` du QG. */
const IDEA_DECISIONS: Record<string, string> = { open: "a remis à l'étude", kept: "a retenu", declined: "a écarté", done: "a noté comme faite" };

export const categoryOf = (action: string): LogCategory => CATEGORIES[action] ?? "other";

/** Un compte supprimé n'a plus de nom : le journal le dit, sans en inventer un. */
export const GONE_SUBJECT = "Un compte supprimé";
export const GONE_OBJECT = "un compte supprimé";

/** Une ligne du journal : `who`, en gras, commence la phrase, et `what` la termine, point compris. */
export interface LogLine {
  who: string;
  what: string;
}

function textOf(details: Record<string, unknown>, key: string): string | null {
  const value = details[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function roleOf(details: Record<string, unknown>, key: string): string | null {
  const value = details[key];
  return typeof value === "string" && Object.hasOwn(ROLE_LABELS, value) ? ROLE_LABELS[value as Role] : null;
}

/** `when` écrit une date du serveur (le début d'un événement) : `fmtDateTime` sur la page. */
export function describe(row: LogRow, when: (iso: string) => string): LogLine {
  const details = row.details ?? {};
  const who = row.actor ?? GONE_SUBJECT;
  const target = row.target ?? GONE_OBJECT;
  // « de Recrue », mais « d'un compte supprimé ».
  const ofTarget = row.target === null ? `d'${GONE_OBJECT}` : `de ${row.target}`;
  const reason = textOf(details, "reason");
  const title = textOf(details, "title");
  const withReason = (start: string) => `${start}${reason ? ` : « ${reason} »` : ""}.`;
  const titled = (start: string) => `${start}${title ? ` « ${title} »` : ""}`;
  const question = textOf(details, "question");
  const questioned = (start: string) => `${start}${question ? ` « ${question} »` : ""}`;

  switch (row.action) {
    case "membership_approved":
      // La personne est validée à son propre nom dans deux cas : le fondateur qui valide sa demande à l'installation,
      // et un rôle prévu par la direction. Dans le second, la ligne du rôle prévu s'affiche juste au-dessus.
      if (row.actor !== null && row.actor === row.target) return { who, what: "a validé sa propre demande." };
      return { who, what: `a validé la demande ${ofTarget}${details["in_roster"] === false ? ", hors de la liste officielle" : ""}.` };
    case "membership_refused":
      return { who, what: withReason(`a refusé la demande ${ofTarget}`) };
    // « Refaire la demande ». Le journal lit le nom d'aujourd'hui : celui du moment n'est écrit que s'il a changé depuis.
    case "member_link_reset": {
      const then = textOf(details, "name");
      const formerly = then !== null && row.target !== null && then !== row.target ? ` (alors ${then})` : "";
      return { who, what: `a remis ${target}${formerly} en attente, pour une nouvelle demande.` };
    }
    case "role_changed": {
      const from = roleOf(details, "from");
      const to = roleOf(details, "to");
      return { who, what: from && to ? `a changé le rôle ${ofTarget} : ${from} → ${to}.` : `a changé le rôle ${ofTarget}.` };
    }
    case "role_preset_applied": {
      const role = roleOf(details, "role");
      return { who: row.target ?? GONE_SUBJECT, what: `reçoit son rôle prévu par la direction${role ? ` : ${role}` : ""}.` };
    }
    case "founder_bootstrap":
      return { who, what: "reçoit le rôle de fondateur, à l'installation du site." };
    case "founder_transferred":
      return { who, what: `a transmis le rôle de fondateur à ${target}.` };
    case "member_suspended":
      return { who, what: withReason(`a suspendu ${target}`) };
    case "member_reinstated":
      return { who, what: `a rétabli ${target}.` };
    // Le serveur note de la même façon une publication et une modification.
    case "announcement_saved":
      return { who, what: `${titled("a publié ou modifié l'annonce")}.` };
    case "announcement_deleted":
      return { who, what: `${titled("a supprimé l'annonce")}.` };
    case "event_saved": {
      const start = textOf(details, "starts_at");
      return { who, what: `${titled("a publié ou modifié l'événement")}${start ? `, prévu le ${when(start)}` : ""}.` };
    }
    case "event_series_saved": {
      const start = textOf(details, "starts_at");
      const weeks = details["weeks"];
      const times = typeof weeks === "number" && Number.isInteger(weeks) && weeks > 1 ? `, ${weeks} semaines de suite` : "";
      return { who, what: `${titled("a publié l'événement")} chaque semaine${times}${start ? `, à partir du ${when(start)}` : ""}.` };
    }
    case "event_deleted":
      return { who, what: `${titled("a supprimé l'événement")}.` };
    case "poll_saved":
      return { who, what: `${questioned("a lancé le sondage")}.` };
    case "poll_closed":
      return { who, what: `${questioned("a fermé le sondage")}.` };
    case "poll_deleted":
      return { who, what: `${questioned("a supprimé le sondage")}.` };
    case "welcome_saved":
      return { who, what: details["empty"] === true ? "a effacé le mot d'accueil." : "a modifié le mot d'accueil." };
    // Le texte d'une idée n'est jamais dans le journal, qui ne s'efface pas : seulement son auteur.
    case "idea_decided": {
      const status = textOf(details, "status");
      const verb = status !== null && Object.hasOwn(IDEA_DECISIONS, status) ? IDEA_DECISIONS[status] : null;
      return { who, what: verb ? `${verb} une idée ${ofTarget}.` : `a tranché une idée ${ofTarget}.` };
    }
    case "idea_removed":
      return { who, what: `a retiré une idée ${ofTarget}.` };
    // Le pseudo choisi est public : c'est celui de la liste officielle. Le mot qui l'accompagne n'est pas dans le journal.
    case "weekly_pick_saved": {
      const player = textOf(details, "player");
      return { who, what: player ? `a choisi ${player} comme Gaulois de la semaine.` : "a choisi le Gaulois de la semaine." };
    }
    case "weekly_pick_deleted": {
      const player = textOf(details, "player");
      return { who, what: player ? `a retiré ${player} du Gaulois de la semaine.` : "a retiré le Gaulois de la semaine." };
    }
    // L'objectif de la semaine : un nombre de victoires, ou le tag d'un clan du classement officiel.
    case "weekly_goal_saved": {
      const wins = details["wins"];
      const clan = textOf(details, "clan");
      if (details["kind"] === "wins" && typeof wins === "number") return { who, what: `a fixé l'objectif de la semaine : ${fmtCount(wins, "victoire")}.` };
      if (details["kind"] === "clan" && clan) return { who, what: `a fixé l'objectif de la semaine : face au clan ${clan}.` };
      return { who, what: "a fixé l'objectif de la semaine." };
    }
    case "weekly_goal_deleted":
      return { who, what: "a retiré l'objectif de la semaine." };
    // Le lien du salon vocal n'est pas dans le journal.
    case "voice_channel_saved":
      return { who, what: "a réglé le lien du salon vocal." };
    case "voice_channel_cleared":
      return { who, what: "a retiré le lien du salon vocal." };
    // Le lien du webhook n'est jamais dans le journal : seulement s'il y a un rôle pour les pings.
    case "discord_calls_saved": {
      const mention = details["mention"];
      return { who, what: `a branché le salon Discord des appels${mention === true ? ", avec un rôle pour les pings" : mention === false ? ", sans rôle pour les pings" : ""}.` };
    }
    case "discord_calls_cleared":
      return { who, what: "a débranché le salon Discord des appels." };
    // Le lien du webhook n'est jamais dans le journal : seulement le salon du robot.
    case "discord_salon_saved":
    case "discord_salon_cleared": {
      const salon = textOf(details, "salon");
      const name = salon !== null && Object.hasOwn(ROBOT_SALONS, salon) ? ROBOT_SALONS[salon] : "un salon Discord du robot";
      return { who, what: `${row.action === "discord_salon_saved" ? "a branché" : "a débranché"} ${name}.` };
    }
    case "account_deleted":
      return { who: row.actor ?? "Un membre", what: "a supprimé son compte." };
    default:
      return { who, what: `a fait une action sans libellé : ${row.action}.` };
  }
}

export interface LogFilter {
  /** Un nom : les lignes où cette personne agit ou est visée. */
  person: string | null;
  category: LogCategory | null;
}

export function filterLog(rows: readonly LogRow[], { person, category }: LogFilter): LogRow[] {
  return rows.filter((row) => (category === null || categoryOf(row.action) === category) && (person === null || row.actor === person || row.target === person));
}

/** Les noms du journal, pour le filtre : qui agit et qui est visé, sans doublon, par ordre alphabétique. */
export function logPeople(rows: readonly LogRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.actor) names.add(row.actor);
    if (row.target) names.add(row.target);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

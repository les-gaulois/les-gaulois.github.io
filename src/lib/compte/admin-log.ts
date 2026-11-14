/**
 * Le journal de l'administration, en clair : chaque ligne du serveur devient une phrase.
 * Le serveur garde les codes (`role_changed`…) et leurs détails. Rien n'est inventé ici :
 * un détail absent n'est pas écrit, et un code sans libellé reste affiché tel quel.
 */
import { fmtCount } from "../format";
import { parisParts } from "../time";
import { ROLE_LABELS, type LogRow, type Role } from "./types";

/** Le serveur ne lit pas plus de lignes que cela (`list_admin_log`). */
export const LOG_LIMIT = 500;
/** Les lignes montrées d'abord, puis à chaque « Afficher plus ». */
export const LOG_PAGE = 50;

export type LogCategory = "requests" | "roles" | "suspensions" | "news" | "settings" | "alliance" | "other";

/**
 * `label` : le nom du filtre. `one` : le mot écrit sur chaque ligne. `help` : ce que le type contient, dans l'aide repliée ;
 * `null` quand le nom suffit.
 */
export const LOG_CATEGORIES: readonly { id: LogCategory; label: string; one: string; help: string | null }[] = [
  { id: "requests", label: "Demandes", one: "Demande", help: null },
  { id: "roles", label: "Rôles", one: "Rôle", help: null },
  { id: "suspensions", label: "Suspensions", one: "Suspension", help: null },
  { id: "news", label: "Publications", one: "Publication", help: "annonces, événements, sondages, mot d'accueil, idées, Gaulois et objectif de la semaine, messages Discord" },
  { id: "settings", label: "Réglages", one: "Réglage", help: "les salons Discord, le salon vocal, l'inventaire d'images, les prix et les bulles du village" },
  { id: "alliance", label: "Alliance", one: "Alliance", help: "la carte de l'alliance : alliances, clans, zones, joueurs alliés et messages retirés" },
  { id: "other", label: "Autres", one: "Autre", help: null },
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
  village_prix_saved: "settings",
  village_pochette_saved: "settings",
  village_bubbles_set: "settings",
  village_cap_set: "settings",
  discord_message_sent: "news",
  discord_message_removed: "news",
  discord_message_salon_added: "settings",
  discord_message_salon_removed: "settings",
  discord_image_saved: "settings",
  discord_image_renamed: "settings",
  discord_image_removed: "settings",
  alliance_saved: "alliance",
  alliance_deleted: "alliance",
  alliance_clan_set: "alliance",
  alliance_invite_created: "alliance",
  alliance_invite_cancelled: "alliance",
  alliance_ally_joined: "alliance",
  alliance_ally_requested: "alliance",
  alliance_ally_approved: "alliance",
  alliance_ally_refused: "alliance",
  alliance_ally_cancelled: "alliance",
  alliance_ally_removed: "alliance",
  alliance_ally_left: "alliance",
  alliance_zone_saved: "alliance",
  alliance_zone_deleted: "alliance",
  alliance_zone_state: "alliance",
  alliance_zone_approved: "alliance",
  alliance_zone_refused: "alliance",
  alliance_zones_ordered: "alliance",
  alliance_message_deleted: "alliance",
  alliance_message_pinned: "alliance",
  alliance_message_unpinned: "alliance",
};

/** Les salons du robot, comme le journal les nomme. Un salon inconnu reste « un salon Discord du robot ». */
const ROBOT_SALONS: Record<string, string> = {
  nouvelles: "le salon Discord des nouvelles",
  encadrement: "le salon Discord de l'encadrement",
  victoires: "le salon Discord des victoires",
  alliance: "le salon Discord de l'alliance",
};

/** L'état d'une zone de l'alliance, comme le journal l'écrit (migration 20261113001000). */
const ZONE_STATES: Record<string, string> = { a_prendre: "à prendre", en_cours: "en cours", tenue: "tenue", abandonnee: "abandonnée" };

/** Les décisions de la boîte à idées, comme le journal les écrit. Mêmes codes que `IDEA_STATUS_LABELS` du QG. */
const IDEA_DECISIONS: Record<string, string> = { open: "a remis à l'étude", kept: "a retenu", declined: "a écarté", done: "a noté comme faite" };

export const categoryOf = (action: string): LogCategory => CATEGORIES[action] ?? "other";

/** Le salon d'un message Discord, comme le journal le nomme : celui du robot, celui des appels, ou un salon ajouté, par son nom. */
function messageSalon(details: Record<string, unknown>): string {
  const salon = textOf(details, "salon");
  const name = textOf(details, "name");
  if (salon === "appels") return "le salon Discord des appels";
  if (salon?.startsWith("robot:")) {
    const robot = salon.slice("robot:".length);
    return (Object.hasOwn(ROBOT_SALONS, robot) ? ROBOT_SALONS[robot] : null) ?? "un salon Discord du robot";
  }
  return name ? `le salon Discord « ${name} »` : "un salon Discord";
}

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

/** « de Membre », mais « d'Officier » et « d'Admin ». */
const fromRole = (label: string): string => (/^[aeiouyàâäéèêëîïôöûü]/iu.test(label) ? `d'${label}` : `de ${label}`);

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
    // En mots, sans flèche : le pilote ne lit pas les signes.
    case "role_changed": {
      const from = roleOf(details, "from");
      const to = roleOf(details, "to");
      return { who, what: from && to ? `a fait passer ${target} ${fromRole(from)} à ${to}.` : `a changé le rôle ${ofTarget}.` };
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
    // Le village des Gaulois : les réglages de la boutique, faits dans l'onglet Village de la Direction.
    case "village_prix_saved":
      return { who, what: "a changé les prix de la boutique du village." };
    case "village_pochette_saved":
      return { who, what: "a changé le prix ou les chances de la pochette surprise du village." };
    // Les bulles des Gaulois, écrites par Claude : la coupure et le plafond de dépense du mois, en dollars.
    case "village_bubbles_set":
      return { who, what: details["actives"] === false ? "a coupé les bulles du village." : "a remis les bulles du village." };
    case "village_cap_set": {
      const avant = details["avant"];
      const apres = details["apres"];
      return { who, what: typeof avant === "number" && typeof apres === "number" ? `a changé le plafond des bulles du village de ${avant} $ à ${apres} $.` : "a changé le plafond des bulles du village." };
    }
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
    // Les messages Discord écrits dans la Direction : le salon seulement, jamais le texte ni le lien du webhook.
    case "discord_message_sent":
      // `unsent` : le serveur a noté le message, mais n'a pas pu l'envoyer à Discord.
      return details["unsent"] === true
        ? { who, what: `a voulu envoyer un message dans ${messageSalon(details)}, qui n'a pas pu partir du serveur.` }
        : { who, what: `a envoyé un message dans ${messageSalon(details)}.` };
    case "discord_message_removed":
      return { who, what: `a retiré un message ${messageSalon(details).replace(/^le /, "du ").replace(/^un /, "d'un ")}.` };
    case "discord_message_salon_added":
    case "discord_message_salon_removed": {
      const name = textOf(details, "name");
      const salon = name ? `le salon Discord « ${name} »` : "un salon Discord";
      return { who, what: row.action === "discord_message_salon_added" ? `a ajouté ${salon} pour les messages.` : `a retiré ${salon} des messages.` };
    }
    // L'inventaire d'images des messages Discord : le nom de l'image seulement, jamais son adresse.
    case "discord_image_saved":
    case "discord_image_removed": {
      const name = textOf(details, "name");
      const image = name ? `l'image « ${name} »` : "une image";
      return { who, what: row.action === "discord_image_saved" ? `a enregistré ${image} dans l'inventaire des messages Discord.` : `a retiré ${image} de l'inventaire des messages Discord.` };
    }
    case "discord_image_renamed": {
      const name = textOf(details, "name");
      const from = textOf(details, "from");
      return { who, what: name && from ? `a renommé l'image « ${from} » en « ${name} » dans l'inventaire des messages Discord.` : "a renommé une image de l'inventaire des messages Discord." };
    }
    // La carte de l'alliance : les noms des alliances, des zones et des joueurs invités ; jamais le lien d'invitation, ni le texte d'un message.
    case "alliance_saved": {
      const name = textOf(details, "name");
      const alliance = name ? `l'alliance « ${name} »` : "une alliance";
      return { who, what: details["new"] === true ? `a créé ${alliance}.` : `a modifié ${alliance}.` };
    }
    case "alliance_deleted": {
      const name = textOf(details, "name");
      return { who, what: name ? `a supprimé l'alliance « ${name} ».` : "a supprimé une alliance." };
    }
    case "alliance_clan_set": {
      const tag = textOf(details, "tag") ?? "un clan";
      const name = textOf(details, "name");
      if (details["alliance"] === null || details["alliance"] === undefined) return { who, what: `a sorti ${tag} de son alliance.` };
      return { who, what: `a rangé ${tag} dans l'alliance${name ? ` « ${name} »` : ""}.` };
    }
    case "alliance_invite_created":
    case "alliance_invite_cancelled": {
      const note = textOf(details, "note");
      const tag = textOf(details, "tag");
      const pour = `${note ?? "un joueur"}${tag ? ` (${tag})` : ""}`;
      return { who, what: row.action === "alliance_invite_created" ? `a invité ${pour} sur la carte de l'alliance.` : `a annulé l'invitation de ${pour}.` };
    }
    case "alliance_ally_joined":
    case "alliance_ally_left": {
      const alias = textOf(details, "alias");
      const tag = textOf(details, "tag");
      const nom = `${alias ? ` sous le nom « ${alias} »` : ""}${tag ? `, joueur de ${tag}` : ""}`;
      return { who, what: row.action === "alliance_ally_joined" ? `est entré sur la carte de l'alliance${nom}.` : `a quitté la carte de l'alliance${nom}.` };
    }
    // Depuis la migration 20261113000500 : le joueur qui ouvre son lien attend l'accord de l'encadrement.
    case "alliance_ally_requested": {
      const tag = textOf(details, "tag");
      return { who, what: `a ouvert son invitation à la carte de l'alliance${tag ? `, comme joueur de ${tag}` : ""}, et attend l'accord de l'encadrement.` };
    }
    case "alliance_ally_cancelled": {
      const tag = textOf(details, "tag");
      return { who, what: `a annulé sa demande d'accès à la carte de l'alliance${tag ? `, comme joueur de ${tag}` : ""}, avant l'accord de l'encadrement.` };
    }
    case "alliance_ally_approved":
    case "alliance_ally_refused": {
      const tag = textOf(details, "tag");
      return { who, what: `${row.action === "alliance_ally_approved" ? "a accepté" : "a refusé"} ${row.target ?? GONE_OBJECT}${tag ? `, joueur de ${tag},` : ""} sur la carte de l'alliance.` };
    }
    case "alliance_ally_removed": {
      const alias = textOf(details, "alias");
      const tag = textOf(details, "tag");
      return { who, what: `a retiré l'accès à la carte de l'alliance ${ofTarget}${alias ? `, « ${alias} »` : ""}${tag ? ` de ${tag}` : ""}.` };
    }
    case "alliance_zone_saved":
    case "alliance_zone_deleted": {
      const zone = title ? `la zone « ${title} »` : "une zone";
      // Depuis la migration 20261113000700, un joueur allié dessine les zones de son clan : le journal le dit, sans son nom choisi.
      const tag = textOf(details, "tag");
      const pour = details["ally"] === true && tag ? `, en joueur allié de ${tag}` : "";
      if (row.action === "alliance_zone_deleted") return { who, what: `a supprimé ${zone} de la carte de l'alliance${pour}.` };
      return { who, what: `${details["new"] === true ? "a dessiné" : "a modifié"} ${zone} sur la carte de l'alliance${pour}.` };
    }
    // Depuis la migration 20261113001000 : l'état et l'ordre des zones, le message épinglé.
    case "alliance_zone_state": {
      const state = textOf(details, "state");
      const label = state && Object.hasOwn(ZONE_STATES, state) ? ZONE_STATES[state] : null;
      return { who, what: `a passé ${title ? `la zone « ${title} »` : "une zone"} de la carte de l'alliance${label ? ` à « ${label} »` : " à un autre état"}.` };
    }
    // Depuis la migration 20261113001100 : la zone d'un allié acceptée ou refusée par l'encadrement.
    case "alliance_zone_approved":
    case "alliance_zone_refused": {
      const tag = textOf(details, "tag");
      const zone = `${title ? `la zone « ${title} »` : "une zone"}${tag ? ` de ${tag}` : ""}`;
      const par = row.target ?? GONE_OBJECT;
      // Une zone acceptée puis modifiée par un allié : c'est sa modification qui est acceptée, ou refusée et défaite.
      if (row.action === "alliance_zone_refused" && details["restored"] === true) return { who, what: `a refusé la modification de ${zone}, faite par ${par} : sa version acceptée est revenue sur la carte de l'alliance.` };
      if (row.action === "alliance_zone_approved" && details["new"] === false) return { who, what: `a accepté la modification de ${zone}, faite par ${par}, sur la carte de l'alliance.` };
      return { who, what: `${row.action === "alliance_zone_approved" ? "a accepté" : "a refusé"} ${zone}, dessinée par ${par}, sur la carte de l'alliance.` };
    }
    case "alliance_zones_ordered":
      return { who, what: "a changé l'ordre des priorités des zones de la carte de l'alliance." };
    case "alliance_message_deleted":
      return { who, what: `a retiré un message ${ofTarget} de la discussion de l'alliance.` };
    case "alliance_message_pinned":
      return { who, what: `a épinglé un message ${ofTarget} en haut de la discussion de l'alliance.` };
    case "alliance_message_unpinned":
      return { who, what: "a désépinglé le message en haut de la discussion de l'alliance." };
    case "account_deleted":
      return { who: row.actor ?? "Un membre", what: "a supprimé son compte." };
    default:
      return { who, what: `a fait une action sans libellé : ${row.action}.` };
  }
}

/* ---------- L'écran du journal : couleur, recherche, nombres et jours ---------- */

/** La couleur d'une ligne. Mêmes noms que `DirTon` de `direction-kit.tsx` et que l'attribut `data-dir-ton`. */
export type LogTone = "ok" | "warn" | "danger" | "ally" | "muted";

/** Vert : une demande, un allié ou une zone acceptés, un compte rétabli. */
const TONE_OK: ReadonlySet<string> = new Set(["membership_approved", "member_reinstated", "alliance_ally_approved", "alliance_zone_approved"]);
/** Rouge : un refus ou une suspension. */
const TONE_DANGER: ReadonlySet<string> = new Set(["membership_refused", "member_suspended", "alliance_ally_refused", "alliance_zone_refused"]);
/** Jaune : quelqu'un attend une suite de l'encadrement. */
const TONE_WARN: ReadonlySet<string> = new Set(["member_link_reset", "alliance_ally_requested"]);

/**
 * La couleur d'une ligne, jamais seule : la ligne porte le mot de son type et sa phrase. Vert, une chose acceptée ou rétablie ;
 * rouge, un refus, une suspension ou un message Discord qui n'a pas pu partir ; jaune, quelqu'un attend une suite ; bleu,
 * un rôle ; gris, tout le reste (publications, réglages, vie de la carte de l'alliance).
 */
export function toneOf(row: Pick<LogRow, "action" | "details">): LogTone {
  if (TONE_OK.has(row.action)) return "ok";
  if (TONE_DANGER.has(row.action)) return "danger";
  if (row.action === "discord_message_sent" && row.details?.["unsent"] === true) return "danger";
  if (TONE_WARN.has(row.action)) return "warn";
  if (categoryOf(row.action) === "roles") return "ally";
  return "muted";
}

/**
 * Sans accents ni majuscules : « teutates » trouve « Teutatès ». Copie de `plain` d'`admin-members.ts` (onglet Comptes) :
 * `src/lib/` n'a pas de fonction commune pour cela, et le seul équivalent exporté, `searchKey`, appartient à l'inventaire
 * d'images Discord (`discord-images.ts`).
 */
const plain = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Le jour d'une ligne à Paris, « AAAA-MM-JJ ». */
export const logDay = (at: string): string => parisParts(at).date;

/**
 * Une ligne prête pour l'écran, calculée une seule fois quand le journal arrive, et non à chaque lettre tapée : sa phrase, ce
 * que la recherche lit (la phrase sans accents ni majuscules), son type, sa couleur et son jour de Paris.
 */
export interface LogEntry {
  row: LogRow;
  line: LogLine;
  text: string;
  category: LogCategory;
  tone: LogTone;
  day: string;
}

/** `when` écrit une date du serveur dans la phrase, comme pour `describe`. */
export function logEntry(row: LogRow, when: (iso: string) => string): LogEntry {
  const line = describe(row, when);
  return { row, line, text: plain(`${line.who} ${line.what}`), category: categoryOf(row.action), tone: toneOf(row), day: logDay(row.at) };
}

/** La recherche, à chaque lettre tapée : dans la phrase entière, donc le nom de qui agit, de qui est visé, et ce qui est fait. */
export function matchesLogSearch(entry: Pick<LogEntry, "text">, query: string): boolean {
  const q = plain(query);
  return q === "" || entry.text.includes(q);
}

/** Le nombre de lignes de chaque type, pour les filtres. */
export function logCounts(entries: readonly Pick<LogEntry, "category">[]): Record<LogCategory, number> {
  const counts: Record<LogCategory, number> = { requests: 0, roles: 0, suspensions: 0, news: 0, settings: 0, alliance: 0, other: 0 };
  for (const entry of entries) counts[entry.category] += 1;
  return counts;
}

const dayTitle = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Le titre d'un jour « AAAA-MM-JJ » : « Samedi 14 novembre 2026 », et « 1er » pour le premier du mois. */
export function fmtLogDay(day: string): string {
  const text = dayTitle.format(new Date(`${day}T00:00:00.000Z`)).replace(/ 1 /, " 1er ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Les lignes rangées par jour de Paris, dans l'ordre où le serveur les donne (les plus récentes d'abord), un seul groupe par
 * jour. Le serveur range par numéro de ligne, pas par heure : deux actions notées au même instant de part et d'autre de
 * minuit peuvent arriver croisées. Chacune va alors sous son jour, qui n'a toujours qu'un titre.
 */
export function groupByDay<T extends Pick<LogEntry, "day">>(entries: readonly T[]): { day: string; rows: T[] }[] {
  const days: { day: string; rows: T[] }[] = [];
  const byDay = new Map<string, T[]>();
  for (const entry of entries) {
    const rows = byDay.get(entry.day);
    if (rows) rows.push(entry);
    else {
      const fresh = [entry];
      byDay.set(entry.day, fresh);
      days.push({ day: entry.day, rows: fresh });
    }
  }
  return days;
}

/**
 * Jouer ensemble : chaque semaine, sur le salon de la gazette, la part des parties de GAL jouées à plusieurs et ce qu'elles
 * ont rapporté, les points par partie selon le nombre de Gaulois, et les duos de membres avec pseudo qui ont le plus gagné
 * ensemble. Demandé par le pilote le 11 novembre 2026, après la mesure : sur 90 jours, 39 % des parties se jouaient seul et
 * ne rapportaient que 3 % des points.
 *
 * - La semaine finie, du lundi au dimanche à Paris. Le message part à partir du mardi 14 h, jamais la nuit, une seule fois,
 *   jusqu'au dimanche qui suit : qui jouait avec qui vient des listes officielles des membres, relues au plus une fois par
 *   jour (`.cache/member-games/results.json`), d'où le jour d'attente. Les parties et les points, eux, viennent des sessions
 *   du clan.
 * - Un duo compte les parties où les deux membres étaient, et une victoire seulement si les deux l'ont gagnée : OpenFront peut
 *   compter une défaite pour un joueur parti avant la fin (3 % des parties partagées début novembre 2026). Cela compte d'abord
 *   le temps de jeu à deux, pas un niveau : le message le dit.
 * - Un message posté ne se corrige pas : il attend que la collecte ait fini le dimanche, que la liste des membres ait été relue
 *   depuis, et que la liste de parties de chaque membre soit à jour. Sinon, il réessaie au passage suivant, jusqu'au dimanche.
 * - Une semaine sans partie relevée n'envoie rien, et elle est notée comme passée.
 */
import { z } from "zod";
import { alertsStarted } from "./alerts";
import { postText } from "./discord-post";
import { fmtDec1, fmtDay, fmtInt, fmtScore } from "./format";
import { escapeDiscord } from "./gazette-discord";
import { ParisDay, sendWindow, siteLink } from "./salon-discord";
import type { StoredMemberResults, StoredMembers, StoredSession } from "./schemas";
import { GROUP_SIZES, groupOf, type GroupSize } from "./simulateur";
import { addDays, mondayOf, parisParts, parisStartOf } from "./time";

export const GroupsState = z.object({
  /** Le lundi de la dernière semaine passée : envoyée, ou sans partie. */
  lastWeek: ParisDay.nullable(),
  /** Le jour, à Paris, du dernier message envoyé. */
  lastSentOn: ParisDay.nullable(),
});
export type GroupsState = z.infer<typeof GroupsState>;

/** Le message part à partir de cette heure de Paris, le mardi au plus tôt. */
export const GROUPS_FROM_HOUR = 14;
/** Le podium des duos : trois places, cinq lignes au plus en cas d'égalité. */
export const DUOS_PODIUM = 3;
export const DUOS_PODIUM_MAX = 5;

export interface Duo {
  a: { id: string; name: string };
  b: { id: string; name: string };
  games: number;
  wins: number;
}

export interface WeekGroups {
  /** Le lundi de la semaine. */
  monday: string;
  games: number;
  /** Parties jouées à au moins deux Gaulois. */
  groupGames: number;
  points: number;
  groupPoints: number;
  /** Points bruts par partie, par taille de groupe. `null` : aucune partie de cette taille. */
  perGame: Record<GroupSize, number | null>;
  duos: Duo[];
}

/** La semaine dont on parlerait maintenant : la semaine finie, du mardi au dimanche qui suivent. `null` le lundi. */
export function weekToSend(now: Date): string | null {
  const { date, weekday } = parisParts(now);
  return weekday >= 1 ? addDays(mondayOf(date), -7) : null;
}

/** Le podium des duos : les plus de victoires ensemble, puis les plus de parties. */
function podium(duos: Duo[]): Duo[] {
  const sorted = duos
    .filter((d) => d.wins > 0)
    .sort((x, y) => y.wins - x.wins || y.games - x.games || `${x.a.name} ${x.b.name}`.localeCompare(`${y.a.name} ${y.b.name}`, "fr"));
  const last = sorted[DUOS_PODIUM - 1]?.wins;
  if (last === undefined) return sorted;
  const kept = sorted.filter((d) => d.wins >= last);
  return kept.length <= DUOS_PODIUM_MAX ? kept : sorted.filter((d) => d.wins > last);
}

/** Le bilan d'une semaine. `null` : aucune partie relevée cette semaine-là. */
export function weekGroups({ monday, sessions, results, members }: { monday: string; sessions: readonly StoredSession[]; results: StoredMemberResults; members: StoredMembers | null }): WeekGroups | null {
  const start = Date.parse(parisStartOf(monday));
  const end = Date.parse(parisStartOf(addDays(monday, 7)));
  const inWeek = (iso: string) => {
    const t = Date.parse(iso);
    return t >= start && t < end;
  };
  const week = sessions.filter((s) => inWeek(s.gameStart));
  if (week.length === 0) return null;
  const bySize = Object.fromEntries(GROUP_SIZES.map((s) => [s, { games: 0, points: 0 }])) as Record<GroupSize, { games: number; points: number }>;
  for (const s of week) {
    const row = bySize[groupOf(s.clanPlayerCount)];
    row.games++;
    row.points += Math.max(s.score, 0);
  }
  const points = week.reduce((sum, s) => sum + Math.max(s.score, 0), 0);
  const groupWeek = week.filter((s) => s.clanPlayerCount >= 2);

  // Qui jouait avec qui : les membres avec pseudo d'aujourd'hui, partie par partie, seulement dans les parties du clan de la
  // semaine (une partie Humains contre Nations est dans la liste d'un joueur, pas dans les sessions du clan).
  const weekIds = new Set(week.map((s) => s.gameId));
  const names = new Map((members?.members ?? []).flatMap((m) => (m.username && m.publicId ? [[m.publicId, m.username] as const] : [])));
  const byGame = new Map<string, { id: string; won: number }[]>();
  for (const [id, result] of Object.entries(results)) {
    if (!names.has(id)) continue;
    for (const [gameId, , won] of result.games) {
      if (!weekIds.has(gameId)) continue;
      const players = byGame.get(gameId) ?? [];
      players.push({ id, won });
      byGame.set(gameId, players);
    }
  }
  const duos = new Map<string, Duo>();
  for (const players of byGame.values()) {
    const sorted = [...players].sort((x, y) => x.id.localeCompare(y.id));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        const key = `${a.id} ${b.id}`;
        const duo = duos.get(key) ?? { a: { id: a.id, name: names.get(a.id) ?? "" }, b: { id: b.id, name: names.get(b.id) ?? "" }, games: 0, wins: 0 };
        duo.games++;
        duo.wins += Math.min(a.won, b.won);
        duos.set(key, duo);
      }
    }
  }
  return {
    monday,
    games: week.length,
    groupGames: groupWeek.length,
    points,
    groupPoints: groupWeek.reduce((sum, s) => sum + Math.max(s.score, 0), 0),
    perGame: Object.fromEntries(GROUP_SIZES.map((s) => [s, bySize[s].games > 0 ? bySize[s].points / bySize[s].games : null])) as Record<GroupSize, number | null>,
    duos: podium([...duos.values()]),
  };
}

const share = (part: number, total: number) => (total > 0 ? `${fmtInt(Math.round((100 * part) / total))} %` : "—");
const SIZE_WORDS: Record<GroupSize, string> = { "1": "seul", "2": "à 2", "3": "à 3", "4": "à 4 et plus" };

/** Le texte du message. Les pseudos sont échappés et reliés à leur fiche ; personne n'est mentionné. */
export function groupsContent(week: WeekGroups, siteUrl: string): string {
  const site = siteUrl.replace(/\/$/, "");
  const who = (p: { id: string; name: string }) => `[**${escapeDiscord(p.name)}**](<${siteLink(site, `/membres/${encodeURIComponent(p.id)}`)}>)`;
  const perGame = GROUP_SIZES.flatMap((s) => (week.perGame[s] === null ? [] : [`${SIZE_WORDS[s]} : ${fmtScore(week.perGame[s])}`]));
  const lines = [
    `**Jouer ensemble, la semaine du ${fmtDay(week.monday)} au ${fmtDay(addDays(week.monday, 6))}**`,
    `👥 À plusieurs : ${share(week.groupGames, week.games)} des ${fmtInt(week.games)} parties, pour ${share(week.groupPoints, week.points)} des points gagnés.`,
    `📈 Points par partie : ${perGame.join(" ; ")}.`,
  ];
  if (week.duos.length > 0) {
    lines.push("🤝 Les duos qui ont le plus gagné ensemble :");
    week.duos.forEach((d, i) => lines.push(`${i + 1}. ${who(d.a)} et ${who(d.b)} : ${fmtInt(d.wins)} victoire${d.wins > 1 ? "s" : ""} ensemble, sur ${fmtInt(d.games)} partie${d.games > 1 ? "s" : ""}`));
    lines.push("Ces nombres comptent d'abord le temps passé à jouer à deux, pas un niveau.");
  }
  lines.push(`[Seul ou en groupe, sur la fiche de chaque membre](<${siteLink(site, "/membres")}>)`);
  return lines.join("\n");
}

export const groupsPayload = (week: WeekGroups, siteUrl: string): Record<string, unknown> => ({
  content: groupsContent(week, siteUrl),
  avatar_url: siteLink(siteUrl, "/generated/icon-192.png"),
  allowed_mentions: { parse: [] },
});

/**
 * Les données d'une semaine sont-elles complètes ? `null` : oui ; sinon, ce qui manque. La collecte doit avoir fini le dimanche,
 * la liste des membres avoir été relue depuis la fin de la semaine, et la liste de parties de chaque membre avec pseudo être
 * à jour (`seen` égal à ses parties selon `stats.team`). Sans aucune liste, rien ne part : jamais un message sans ses duos.
 */
export function weekReady({ monday, completeThrough, members, results }: { monday: string; completeThrough: string | null; members: StoredMembers | null; results: StoredMemberResults }): string | null {
  if (completeThrough === null || completeThrough < addDays(monday, 6)) return "la collecte n'a pas encore fini le dimanche";
  if (!members || Date.parse(members.fetchedAt) < Date.parse(parisStartOf(addDays(monday, 7)))) return "la liste des membres n'a pas été relue depuis la fin de la semaine";
  const behind = members.members.filter((m) => {
    if (!m.username || !m.publicId || !m.team) return false;
    const games = m.team.wins + m.team.losses;
    if (games === 0) return false;
    return results[m.publicId]?.seen !== games;
  }).length;
  if (behind > 0) return `${fmtInt(behind)} liste${behind > 1 ? "s" : ""} de parties pas encore relue${behind > 1 ? "s" : ""}`;
  return null;
}

export interface GroupsPassDeps {
  stored: GroupsState | null;
  gazetteLastSent: string | null;
  now: Date;
  /** Ce qui manque pour que la semaine soit complète, `null` si rien : voir `weekReady`. */
  ready: (monday: string) => string | null;
  /** Le bilan d'une semaine, `null` sans partie : voir `weekGroups`. */
  summary: (monday: string) => WeekGroups | null;
  send: (week: WeekGroups) => Promise<boolean>;
  log: (line: string) => void;
}

/** Un passage du robot. `state` : l'état à écrire, `null` s'il n'a pas changé. Après un échec, le passage suivant réessaie. */
export async function groupsPass({ stored, gazetteLastSent, now, ready, summary, send, log }: GroupsPassDeps): Promise<{ state: GroupsState | null; failed: boolean }> {
  if (!alertsStarted(gazetteLastSent)) {
    log("Jouer ensemble : les messages commencent après la gazette du lundi 9 novembre, premier message du salon.");
    return { state: null, failed: false };
  }
  const state = stored ?? { lastWeek: null, lastSentOn: null };
  const monday = weekToSend(now);
  if (monday === null) {
    log("Jouer ensemble : le lundi, les listes des membres ne sont pas encore relues ; le message part dès demain.");
    return { state: null, failed: false };
  }
  if (state.lastWeek !== null && state.lastWeek >= monday) {
    log(`Jouer ensemble : la semaine du ${monday} est déjà passée.`);
    return { state: null, failed: false };
  }
  const missing = ready(monday);
  if (missing !== null) {
    // Le samedi et le dimanche, derniers jours pour l'envoyer : un avertissement dans l'Action dit pourquoi rien ne part.
    const late = parisParts(now).weekday >= 5;
    log(`${late ? "::warning::" : ""}Jouer ensemble : la semaine du ${monday} attend (${missing}).${late ? " Sans données complètes d'ici dimanche soir, elle ne partira pas." : ""}`);
    return { state: null, failed: false };
  }
  const week = summary(monday);
  if (!week) {
    log(`Jouer ensemble : aucune partie relevée la semaine du ${monday}, rien à envoyer.`);
    return { state: { ...state, lastWeek: monday }, failed: false };
  }
  const window = sendWindow(now, GROUPS_FROM_HOUR, state.lastSentOn);
  if (!window.open) {
    log(`Jouer ensemble : rien à envoyer pour l'instant (${window.reason}).`);
    return { state: null, failed: false };
  }
  if (!(await send(week))) return { state: null, failed: true };
  log(`Jouer ensemble : semaine du ${monday} envoyée (${fmtInt(week.games)} parties, ${fmtDec1((100 * week.groupGames) / week.games)} % à plusieurs).`);
  return { state: { lastWeek: monday, lastSentOn: parisParts(now).date }, failed: false };
}

export interface GroupsSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  week: WeekGroups;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie le message en texte. Un échec se retente au passage suivant. */
export const sendGroups = ({ link, week, siteUrl, fetch, log }: GroupsSendDeps) => postText({ link, text: groupsPayload(week, siteUrl), label: "Jouer ensemble", fetch, log });

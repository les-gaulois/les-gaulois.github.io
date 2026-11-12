/**
 * La gazette : le bilan de chaque semaine complète, du lundi au dimanche à Paris, écrit à partir des seules données collectées.
 * Aucun commentaire ni jugement : les phrases ne font que dire les chiffres et leur date, et ce qui n'a pas été relevé reste absent, jamais à zéro.
 */
import { fmtCount, fmtDate, fmtDay, fmtInt, fmtPct, fmtPoints, fmtRank, fmtScore } from "./format";
import { clanRecords, type ClanRecords } from "./results";
import type { TerritoryReading } from "./clanmap/days";
import { namedWeekActive, namedWeekMilestones, namedWeekPlayers, type WeekActivePlayer, type WeekMilestonePlayer, type WeekPlayer, type WeekTop } from "./week-players";
import type { HistorySnapshot, StoredMembers, StoredSession } from "./schemas";
import { winRate } from "./stats";
import { addDays, mondayOf, parisParts } from "./time";

export interface WeekTotals {
  games: number;
  wins: number;
  winRate: number | null;
}

/** Deux relevés d'une même mesure. `start` : le dernier avant la semaine, sinon le premier de la semaine. `null` : un seul relevé. */
export interface Evolution<T> {
  start: T | null;
  end: T;
}

/** Un arrivant avec un pseudo public, et l'identifiant de sa fiche quand il en a une. Un anonyme n'en a jamais. */
export interface WeekArrival {
  username: string;
  id: string | null;
}

export interface WeekArrivals {
  count: number;
  /** Les pseudos publics, dans l'ordre d'arrivée. */
  named: WeekArrival[];
  anonymous: number;
}

export interface GazetteEdition {
  /** Le lundi et le dimanche de la semaine, AAAA-MM-JJ. */
  from: string;
  to: string;
  totals: WeekTotals;
  /** La semaine d'avant, si elle est complète dans l'archive. */
  previous: WeekTotals | null;
  /** `null` : aucune victoire cette semaine-là, à plusieurs. */
  highlights: ClanRecords | null;
  /** `null` : pas de relevé du classement cette semaine-là. */
  standing: Evolution<HistorySnapshot> | null;
  /** `null` : pas de relevé de la carte des clans cette semaine-là. */
  territory: Evolution<TerritoryReading> | null;
  /** `null` : pas de liste de membres, liste antérieure à la fin de la semaine, ou semaine antérieure à la première arrivée connue. */
  arrivals: WeekArrivals | null;
  /** Les membres avec pseudo qui ont le plus gagné cette semaine. `null` : pas de relevé de départ ou d'arrivée. */
  players: WeekPlayer[] | null;
  /** L'heure du relevé de départ de ce podium : voir `playersPeriod`. `null` sans podium. */
  playersSince: string | null;
  /** Ceux qui ont le plus joué, sur la période du podium. `null` : sans podium, ou parties pas relevées cette semaine-là. */
  active: WeekActivePlayer[] | null;
  /** Les paliers de victoires franchis, sur la période du podium. `null` : sans podium, ou pas relevés cette semaine-là. Vide : aucun. */
  milestones: WeekMilestonePlayer[] | null;
}

export interface GazetteSources {
  sessions: readonly StoredSession[];
  history: readonly HistorySnapshot[];
  /** Les relevés du territoire : voir `territoryReadings`. */
  territory: readonly TerritoryReading[];
  /** Les joueurs de chaque semaine, par son lundi : voir `src/lib/week-players.ts`. */
  weekTops: Readonly<Record<string, WeekTop>>;
  members: StoredMembers | null;
  archiveStart: string;
  /** Dernier jour UTC définitif : le dimanche de Paris se termine avant la fin du dimanche UTC. */
  completeThrough: string | null;
}

function evolution<T extends { date: string }>(rows: readonly T[], from: string, to: string): Evolution<T> | null {
  const inside = rows.filter((r) => r.date >= from && r.date <= to);
  const end = inside.at(-1);
  if (!end) return null;
  const start = rows.filter((r) => r.date < from).at(-1) ?? inside[0] ?? null;
  return { start: start === end ? null : start, end };
}

const byDate = <T extends { date: string }>(rows: readonly T[]) => [...rows].sort((a, b) => a.date.localeCompare(b.date));

/** Une édition par semaine complète couverte par l'archive, de la plus récente à la plus ancienne. */
export function gazetteEditions({ sessions, history, territory, weekTops, members, archiveStart, completeThrough }: GazetteSources): GazetteEdition[] {
  if (!completeThrough) return [];
  const startMonday = mondayOf(archiveStart);
  const first = startMonday === archiveStart ? archiveStart : addDays(startMonday, 7);
  // Le dimanche doit être définitif : si le dernier jour définitif n'est pas un dimanche, sa semaine n'est pas finie.
  const last = addDays(mondayOf(addDays(completeThrough, 1)), -7);

  const byWeek = new Map<string, StoredSession[]>();
  for (const s of sessions) {
    const monday = mondayOf(parisParts(s.gameStart).date);
    const week = byWeek.get(monday);
    if (week) week.push(s);
    else byWeek.set(monday, [s]);
  }
  const totalsOf = (monday: string): WeekTotals => {
    const list = byWeek.get(monday) ?? [];
    const wins = list.filter((s) => s.hasWon).length;
    return { games: list.length, wins, winRate: winRate(wins, list.length) };
  };

  const snapshots = byDate(history);
  const readings = byDate(territory);
  // L'identifiant n'est gardé que pour un pseudo public, pour mener à sa fiche : celui d'un anonyme n'est jamais écrit.
  const joined = [...(members?.members ?? [])]
    .map((m) => ({ date: parisParts(m.joinedAt).date, at: m.joinedAt, username: m.username, id: m.username ? (m.publicId ?? null) : null }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const firstJoin = joined[0]?.date ?? null;
  const listDate = members ? parisParts(members.fetchedAt).date : null;

  const editions: GazetteEdition[] = [];
  for (let from = last; from >= first; from = addDays(from, -7)) {
    const to = addDays(from, 6);
    const arrivals = joined.filter((m) => m.date >= from && m.date <= to);
    const named = arrivals.flatMap((m) => (m.username ? [{ username: m.username, id: m.id }] : []));
    // Une liste relevée avant la fin de la semaine ne connaît pas toutes ses arrivées : son décompte serait un faux chiffre.
    const known = firstJoin !== null && listDate !== null && to >= firstJoin && listDate > to;
    editions.push({
      from,
      to,
      totals: totalsOf(from),
      previous: from > first ? totalsOf(addDays(from, -7)) : null,
      highlights: clanRecords(byWeek.get(from) ?? []),
      standing: evolution(snapshots, from, to),
      territory: evolution(readings, from, to),
      arrivals: known ? { count: arrivals.length, named, anonymous: arrivals.length - named.length } : null,
      ...withPlayers(weekTops[from], members),
    });
  }
  return editions;
}

/** Le podium d'une semaine et ce qui porte sur la même période. Sans podium, rien d'autre n'est donné : la période ne serait pas écrite. */
function withPlayers(top: WeekTop | undefined, members: StoredMembers | null): Pick<GazetteEdition, "players" | "playersSince" | "active" | "milestones"> {
  const players = namedWeekPlayers(top, members);
  if (!players || !top) return { players: null, playersSince: null, active: null, milestones: null };
  return { players, playersSince: top.since, active: namedWeekActive(top, members), milestones: namedWeekMilestones(top, members) };
}

/**
 * La période du podium : « de la semaine » s'il part du lundi, sinon ses dates, car elle est alors plus courte.
 * `null` sans podium.
 */
export function playersPeriod({ from, to, players, playersSince }: Pick<GazetteEdition, "from" | "to" | "players" | "playersSince">): string | null {
  if (!players || !playersSince) return null;
  const start = parisParts(playersSince).date;
  return start <= from ? "de la semaine" : `du ${fmtDay(start)} au ${fmtDay(to)}`;
}

/** Ce que compte le podium, puis d'où viennent les chiffres : pour le message Discord, dans la description de son image et dans son texte de secours. */
export const PODIUM_METHOD = "Victoires en équipe sous le tag entre deux relevés, membres avec pseudo présents aux deux.";
export const DATA_SOURCE = "Données publiques d'OpenFront.";

/** Les éditions précédentes montrées d'abord sur la page de la gazette : les plus anciennes restent dans la page, repliées ensemble. */
export const GAZETTE_RECENT_EDITIONS = 6;

export const weekLabel = ({ from, to }: Pick<GazetteEdition, "from" | "to">) => `du ${fmtDay(from)} au ${fmtDay(to)} ${to.slice(0, 4)}`;

/** Termine une phrase par une date : les mois abrégés finissent déjà par un point (« 1 nov. »), pas les autres (« 3 août »). */
export const endingOn = (date: string) => {
  const day = fmtDay(date);
  return day.endsWith(".") ? day : `${day}.`;
};

export const rankWords = (rank: number | null) => (rank === null ? "hors de la liste" : fmtRank(rank));

/**
 * La phrase du classement, toujours datée. `null` : pas de relevé cette semaine-là.
 * Ni « reste » ni « passe » : deux relevés ne disent rien de ce qui s'est passé entre eux, ni du reste de la semaine.
 */
export function standingSentence(standing: GazetteEdition["standing"], tag: string): string | null {
  if (!standing) return null;
  const { start, end } = standing;
  if (!start) return end.rank === null ? `[${tag}] est hors de la liste officielle le ${endingOn(end.date)}` : `[${tag}] est ${fmtRank(end.rank)} au classement officiel le ${endingOn(end.date)}`;
  return `Au classement officiel, [${tag}] est ${rankWords(start.rank)} le ${fmtDay(start.date)} et ${rankWords(end.rank)} le ${endingOn(end.date)}`;
}

/** Les lignes du panneau du classement. */
export function standingDetails({ start, end }: Evolution<HistorySnapshot>): string[] {
  const ranks = start ? `${rankWords(start.rank)} le ${fmtDay(start.date)}, ${rankWords(end.rank)} le ${endingOn(end.date)}` : `Seul relevé de la semaine : le ${endingOn(end.date)}`;
  if (end.score === null) return [ranks];
  return [ranks, start && start.score !== null ? `Score : ${fmtScore(start.score)}, puis ${fmtScore(end.score)}.` : `Score : ${fmtScore(end.score)}.`];
}

/** Les lignes du panneau de la carte des clans. */
export function territoryDetails({ start, end }: Evolution<TerritoryReading>): string[] {
  const now = end.rank === null ? `pixels le ${endingOn(end.date)}` : `pixels le ${fmtDay(end.date)}, ${fmtRank(end.rank)} sur la carte.`;
  if (!start) return [now];
  const diff = end.pixels - start.pixels;
  return [now, `${fmtInt(start.pixels)} pixels le ${fmtDay(start.date)}, soit ${diff < 0 ? "−" : "+"}${fmtInt(Math.abs(diff))}.`];
}

/** Pourquoi le classement manque : `first` est la date de son tout premier relevé. */
export function standingGap(first: string | null, to: string): string {
  if (first !== null && first <= to) return "Aucun relevé du classement cette semaine-là.";
  return first ? `L'API ne donne pas le passé du classement : il est relevé depuis le ${endingOn(first)}` : "L'API ne donne pas le passé du classement.";
}

/** Pourquoi le territoire manque : `first` est la date de son tout premier relevé. */
export function territoryGap(first: string | null, to: string): string {
  if (first !== null && first <= to) return "Aucun relevé du territoire cette semaine-là.";
  return first ? `Le territoire est relevé depuis le ${endingOn(first)}` : "Le territoire n'est pas encore relevé.";
}

/** Pourquoi les arrivées manquent : `membersAt` est l'heure de relevé de la liste des membres. */
export function arrivalsGap(membersAt: string | null, to: string): string {
  if (!membersAt) return "La liste des membres n'a pas encore été relevée.";
  if (parisParts(membersAt).date <= to) return `La liste des membres date du ${fmtDate(membersAt)} : elle ne couvre pas encore toute cette semaine.`;
  return "La liste officielle ne connaît pas d'arrivée aussi ancienne.";
}

/** Ce qui change par rapport à la semaine d'avant. `null` : rien à comparer. */
export function comparisonSentence({ totals, previous }: GazetteEdition): string | null {
  if (!previous) return null;
  if (previous.games === 0) return totals.games === 0 ? null : "Aucune partie la semaine d'avant.";
  const diff = totals.games - previous.games;
  const games = diff === 0 ? "Autant de parties que la semaine d'avant." : `${fmtCount(Math.abs(diff), "partie")} de ${diff > 0 ? "plus" : "moins"} que la semaine d'avant.`;
  if (totals.winRate === null || previous.winRate === null) return games;
  // L'écart se calcule sur les taux tels qu'ils s'affichent : le lecteur doit pouvoir le refaire de tête.
  const shown = (rate: number) => Math.round(rate * 10) / 10;
  return `${games} Taux de victoire : ${fmtPoints(shown(totals.winRate) - shown(previous.winRate))}.`;
}

/**
 * Le chapeau de l'édition : ce qu'elle dit d'abord, sans aucun commentaire.
 * Sur l'accueil, `standing: false` : le bloc du classement officiel, plus bas, donne le rang du moment ; la gazette garde l'évolution.
 */
export function editionLead(edition: GazetteEdition, tag: string, { standing = true }: { standing?: boolean } = {}): string {
  const { games, wins, winRate: rate } = edition.totals;
  const sentences = [games === 0 ? "Aucune partie enregistrée cette semaine-là." : `${fmtCount(games, "partie")} et ${fmtCount(wins, "victoire")}, soit ${fmtPct(rate)}.`];
  const before = edition.previous;
  if (before && before.games > 0) sentences.push(`La semaine d'avant : ${fmtCount(before.games, "partie")}, ${fmtPct(before.winRate)}.`);
  const rank = standing ? standingSentence(edition.standing, tag) : null;
  if (rank) sentences.push(rank);
  return sentences.join(" ");
}

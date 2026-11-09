/**
 * La vie du clan sur l'accueil : ce que les membres viennent de faire, en quelques lignes.
 * Rien n'est mesuré ici qui ne le soit ailleurs. Le podium, les plus actifs, les arrivées et les paliers d'une semaine
 * finie viennent de la gazette ; les paliers de la semaine en cours, du relevé du lundi ; les records, de la page Records
 * et de la page Carte. Ce module choisit quoi montrer et le met en mots, sans rien inventer : une ligne sans donnée n'existe pas.
 */
import { fmtCount, fmtDate, fmtDay, fmtEpochDay, fmtInt } from "./format";
import { RECORD_KEYS, recentRecordKeys, type RecordKey } from "./records-battus";
import type { ClanRecords } from "./results";
import { addDays, parisParts } from "./time";
import type { WeekMilestonePlayer } from "./week-players";

/** Les pseudos écrits avant « et N autres » : au-delà, la ligne ne se lit plus. */
export const NAMES_SHOWN = 5;
/** Un record de territoire se signale pendant ces jours-là, comme un record du clan. */
export const RECENT_DAYS = 7;

export interface MilestoneGroup {
  tier: number;
  /** Par ordre alphabétique : à l'intérieur d'un palier, personne n'est devant personne. */
  players: { id: string; username: string }[];
}

/** Les paliers franchis, regroupés par palier, du plus haut au plus bas. */
export function milestoneGroups(players: readonly WeekMilestonePlayer[]): MilestoneGroup[] {
  const tiers = [...new Set(players.map((p) => p.tier))].sort((a, b) => b - a);
  return tiers.map((tier) => ({
    tier,
    players: players
      .filter((p) => p.tier === tier)
      .map(({ id, username }) => ({ id, username }))
      .sort((a, b) => a.username.localeCompare(b.username, "fr")),
  }));
}

/** Les paliers franchis depuis le relevé du lundi, avec les heures des deux relevés : voir `milestonesSinceMonday`. */
export interface CurrentMilestones {
  since: string;
  until: string;
  players: readonly WeekMilestonePlayer[];
}

/**
 * `current` : depuis le relevé du lundi, la semaine n'est pas finie, et les deux relevés sont datés.
 * `edition` : la période du podium de la dernière gazette.
 */
export type HomeMilestones = { when: "current"; groups: MilestoneGroup[]; since: string; until: string } | { when: "edition"; groups: MilestoneGroup[] };

/**
 * Les paliers à montrer sur l'accueil : ceux de la semaine en cours dès qu'il y en a un, sinon ceux de la dernière gazette.
 * `null` : aucun palier franchi à citer, ou rien de relevé. La ligne ne s'affiche alors pas.
 */
export function homeMilestones(current: CurrentMilestones | null, edition: readonly WeekMilestonePlayer[] | null): HomeMilestones | null {
  if (current && current.players.length > 0) return { when: "current", groups: milestoneGroups(current.players), since: current.since, until: current.until };
  if (edition && edition.length > 0) return { when: "edition", groups: milestoneGroups(edition) };
  return null;
}

/**
 * « depuis le lundi 9 nov., d'après la liste du 11 nov. » : la page est statique et la liste n'est relue qu'une fois par jour.
 * Les deux dates restent écrites, pour qu'une liste qui vieillit se voie.
 */
export function currentMilestonesPeriod(since: string, until: string): string {
  return `depuis le lundi ${fmtDay(parisParts(since).date)}, d'après la liste du ${fmtDay(parisParts(until).date)}`;
}

/** Finit une phrase par un point, sans le doubler : un mois abrégé (« 8 nov. ») en porte déjà un. */
export const endSentence = (text: string) => (text.endsWith(".") ? text : `${text}.`);

/** Combien d'autres après les premiers cités. `total` peut dépasser la liste : des arrivées sans pseudo public, par exemple. */
export function restAfter(total: number, shown: number): string | null {
  const rest = total - shown;
  if (rest < 1) return null;
  return rest === 1 ? "et 1 autre" : `et ${fmtInt(rest)} autres`;
}

const RECORD_WORDS: Record<RecordKey, (r: ClanRecords) => string> = {
  streak: (r) => `plus longue série, ${fmtCount(r.streak.wins, "victoire")}, terminée le ${fmtDate(r.streak.endedAt)}`,
  bestDay: (r) => `meilleure journée, ${fmtCount(r.bestDay.wins, "victoire")} sur ${fmtCount(r.bestDay.games, "partie")}, le ${fmtDate(`${r.bestDay.date}T12:00:00Z`)}`,
  biggestGroup: (r) => `le plus de Gaulois dans une partie gagnée, ${fmtCount(r.biggestGroup.players, "joueur")}, le ${fmtDate(r.biggestGroup.at)}`,
  mostTeams: (r) => `victoire avec le plus d'équipes en jeu, ${fmtCount(r.mostTeams.teams, "équipe")}, le ${fmtDate(r.mostTeams.at)}`,
};

/** Les records du clan établis dans les sept derniers jours couverts, en mots : les mêmes que la page Records signale. */
export function recentRecordLines(records: ClanRecords | null, coveredUntil: string | null): string[] {
  if (!records) return [];
  const recent = recentRecordKeys(records, coveredUntil, RECENT_DAYS);
  return RECORD_KEYS.filter((key) => recent.has(key)).map((key) => RECORD_WORDS[key](records));
}

/**
 * Le plus grand territoire du clan sur la carte des clans, s'il date des sept derniers jours du relevé de la carte.
 * `null` : maximum plus ancien, ou sans date (film d'une ancienne version). Ce n'est ni le classement des clans, ni un des
 * records de la page Records : l'accueil l'écrit sur sa propre ligne. C'est un maximum atteint à un instant : le territoire
 * du moment, lui, est dans le bloc de la carte.
 */
export function recentTerritoryRecord(peak: { pixels: number; at?: number | undefined } | null, fetchedAt: string | null): string | null {
  if (!peak || peak.at === undefined || !fetchedAt || peak.pixels < 1) return null;
  const day = parisParts(new Date(peak.at * 1000)).date;
  const read = parisParts(fetchedAt).date;
  // En jours du calendrier de Paris, comme les records du clan : un changement d'heure n'allonge pas la fenêtre.
  const since = addDays(read, -(RECENT_DAYS - 1));
  if (day < since || day > read) return null;
  return `${fmtInt(peak.pixels)} pixels, le ${fmtEpochDay(peak.at)}`;
}

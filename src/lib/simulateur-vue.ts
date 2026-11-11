/**
 * Ce que le simulateur de classement affiche, calculé à partir de `/simulateur.json` (voir `simulateur-donnees.ts`) et du
 * scénario choisi au QG. Rien ne vient du serveur du site : tout est public et refait dans le navigateur.
 */
import type { BacktestRow, PaceWindow, SimClan, SimData } from "./simulateur-donnees";
import {
  DAY_MS,
  GROUP_SIZES,
  STEADY_SCORE,
  crossings,
  dailyPoints,
  pointsPerGame,
  projectGal,
  projectScore,
  requiredRate,
  type GroupSize,
  type Scenario,
} from "./simulateur";
import { addDays, parisParts } from "./time";

/** Les horizons proposés, en jours. Ce sont aussi ceux de la mesure de fiabilité. */
export const HORIZONS = [7, 14, 30, 60, 90] as const;
export type Horizon = (typeof HORIZONS)[number];
/**
 * En dessous, une marge mesurée sur trop peu de départs n'est pas montrée. Les départs de jours voisins se recouvrent : il en
 * faut aussi au moins deux fois l'horizon, soit environ trois périodes distinctes.
 */
export const MARGIN_MIN_SAMPLES = 20;
export const MARGIN_MIN_PERIODS = 2;
/** Les clans montrés autour de GAL dans le classement projeté. */
export const TABLE_NEIGHBOURS = 4;
/** Les changements de place listés, au plus. */
export const CROSSINGS_SHOWN = 5;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Le fichier relu : `null` s'il n'a pas la forme attendue, plutôt qu'un calcul faux. */
export function parseSimData(raw: unknown): SimData | null {
  if (!isRecord(raw) || typeof raw["asOf"] !== "string" || !Number.isFinite(Date.parse(raw["asOf"])) || typeof raw["tag"] !== "string") return null;
  const { points, pace, clans, backtest } = raw;
  if (!Array.isArray(points) || !Array.isArray(pace) || !Array.isArray(clans) || !Array.isArray(backtest)) return null;
  if (!points.every((p) => Array.isArray(p) && p.length === 2 && isNumber(p[0]) && isNumber(p[1]))) return null;
  const okPace = pace.every((w) => isRecord(w) && isNumber(w["days"]) && isRecord(w["sizes"]) && GROUP_SIZES.every((s) => isRecord((w["sizes"] as Record<string, unknown>)[s])));
  const okClans = clans.every((c) => isRecord(c) && typeof c["tag"] === "string" && isNumber(c["score"]) && (c["rate"] === null || isNumber(c["rate"])));
  if (!okPace || !okClans) return null;
  if (!(raw["official"] === null || isNumber(raw["official"])) || !(raw["rank"] === null || isNumber(raw["rank"]))) return null;
  return raw as unknown as SimData;
}

/** Le scénario de départ : le rythme de la fenêtre choisie ; les points par victoire, eux, sur 30 jours, plus stables. */
export function scenarioFrom(pace: PaceWindow, reference: PaceWindow): Scenario {
  const out = {} as Scenario;
  for (const size of GROUP_SIZES) {
    const own = pace.sizes[size];
    const ref = reference.sizes[size];
    const pointsPerWin = ref.wins > 0 ? ref.points / ref.wins : own.wins > 0 ? own.points / own.wins : 0;
    out[size] = { games: own.games / pace.days, winRate: own.games > 0 ? own.wins / own.games : 0, pointsPerWin };
  }
  return out;
}

/** Le rythme d'un clan pour la projection : mesuré, sinon supposé régulier sur ses 90 jours. */
export const clanRate = (clan: SimClan): number => clan.rate ?? clan.score / STEADY_SCORE;

/** La date, à Paris, du jour `day` compté depuis le classement : en jours de calendrier, changement d'heure compris. */
export const dayDate = (asOf: number, day: number): string => addDays(parisParts(new Date(asOf)).date, day);

export interface ProjectedClan {
  tag: string;
  now: number;
  rankNow: number;
  curve: number[];
  then: number;
  rankThen: number;
  isUs: boolean;
}

export interface Simulation {
  horizon: number;
  /** Les jours déjà couverts par des parties relevées après le classement : le scénario commence après eux. */
  knownDays: number;
  dates: string[];
  rate: number;
  gal: number[];
  galWithoutGames: number[];
  clans: ProjectedClan[];
  us: ProjectedClan | null;
  changes: { tag: string; day: number; date: string; ahead: boolean }[];
}

/** La projection de tout le classement, jour par jour, avec le scénario de GAL. `null` : GAL n'est pas au classement relevé. */
export function simulate(data: SimData, scenario: Scenario, horizon: number): Simulation | null {
  if (data.official === null) return null;
  const asOf = Date.parse(data.asOf);
  const days = Array.from({ length: horizon + 1 }, (_, d) => d);
  const rate = dailyPoints(scenario);
  const knownDays = data.coveredUntil ? Math.max(0, (Date.parse(data.coveredUntil) - asOf) / DAY_MS) : 0;
  const gal = days.map((d) => projectGal(data.official!, data.points, asOf, rate, d, knownDays));
  const galWithoutGames = days.map((d) => projectGal(data.official!, data.points, asOf, 0, d));
  const projected = data.clans.map((clan, i) => {
    const isUs = clan.tag === data.tag;
    const curve = isUs ? gal : days.map((d) => projectScore(clan.score, clanRate(clan), d));
    return { tag: clan.tag, now: clan.score, rankNow: i + 1, curve, then: curve[horizon] ?? clan.score, rankThen: 0, isUs };
  });
  [...projected].sort((a, b) => b.then - a.then).forEach((clan, i) => (clan.rankThen = i + 1));
  const changes = projected
    .filter((c) => !c.isUs)
    .flatMap((c) => crossings(gal, c.curve).map((x) => ({ tag: c.tag, day: x.day, date: dayDate(asOf, x.day), ahead: x.ahead })))
    .sort((a, b) => a.day - b.day)
    .slice(0, CROSSINGS_SHOWN);
  return { horizon, knownDays, dates: days.map((d) => dayDate(asOf, d)), rate, gal, galWithoutGames, clans: projected, us: projected.find((c) => c.isUs) ?? null, changes };
}

/** Les clans à montrer dans le classement projeté : GAL et ses voisins, plus le clan visé s'il est plus loin. */
export function tableRows(sim: Simulation, target: string | null): ProjectedClan[] {
  const order = [...sim.clans].sort((a, b) => a.rankThen - b.rankThen);
  const us = order.findIndex((c) => c.isUs);
  if (us === -1) return [];
  const rows = order.slice(Math.max(0, us - TABLE_NEIGHBOURS), us + TABLE_NEIGHBOURS + 1);
  const extra = target ? order.find((c) => c.tag === target && !rows.includes(c)) : undefined;
  return extra ? [...rows, extra].sort((a, b) => a.rankThen - b.rankThen) : rows;
}

/** Le clan visé par défaut : le plus proche de GAL au score, entre celui juste devant et celui juste derrière. */
export function defaultTarget(data: SimData): string | null {
  if (data.rank === null || data.official === null) return null;
  const official = data.official;
  const near = [data.clans[data.rank - 2], data.clans[data.rank]].filter((c): c is SimClan => c !== undefined);
  near.sort((a, b) => Math.abs(a.score - official) - Math.abs(b.score - official));
  return near[0]?.tag ?? null;
}

export interface Objective {
  tag: string;
  /** GAL est devant ce clan aujourd'hui. */
  aheadNow: boolean;
  /** Au bout de l'horizon, avec le scénario choisi. */
  aheadThen: boolean;
  /** Les points gagnés par jour qu'il faut, au moins, pour finir devant. */
  required: number;
  /** Ce qu'apporte le scénario choisi. */
  rate: number;
  /** Les parties en plus, par jour, qu'il faudrait pour combler l'écart, taille de groupe par taille. Vide : rien à combler. */
  extraGames: { size: GroupSize; games: number }[];
}

/** Ce qu'il faut à GAL pour finir devant un clan au bout de l'horizon. `null` : clan inconnu, ou GAL hors classement. */
export function objective(sim: Simulation, scenario: Scenario, tag: string): Objective | null {
  const clan = sim.clans.find((c) => c.tag === tag && !c.isUs);
  if (!clan || !sim.us) return null;
  const end = sim.horizon;
  // Un classement relevé avec plus de retard que l'horizon : le scénario n'aurait aucun jour pour agir.
  if (end - sim.knownDays <= 0) return null;
  const required = requiredRate(clan.curve[end] ?? clan.then, sim.galWithoutGames[end] ?? 0, end - sim.knownDays);
  const missing = required - sim.rate;
  const extraGames =
    missing > 0
      ? (["4", "3", "2"] as const).flatMap((size) => {
          const each = pointsPerGame(scenario[size]);
          return each > 0 ? [{ size, games: missing / each }] : [];
        })
      : [];
  return { tag, aheadNow: sim.us.now > clan.now, aheadThen: (sim.gal[end] ?? 0) > (clan.curve[end] ?? 0), required, rate: sim.rate, extraGames };
}

/** Le premier départ de la mesure de fiabilité pour ce rythme, AAAA-MM-JJ. `null` : aucune mesure. */
export function backtestSince(backtest: readonly BacktestRow[], pace: number): string | null {
  const days = backtest.filter((r) => r.pace === pace && r.since !== null).map((r) => r.since as string);
  return days.length > 0 ? days.reduce((a, b) => (a < b ? a : b)) : null;
}

/** La mesure a-t-elle assez de recul pour être montrée ? */
export const marginReady = (row: BacktestRow): boolean => row.gal !== null && row.gal.samples >= Math.max(MARGIN_MIN_SAMPLES, MARGIN_MIN_PERIODS * row.horizon);

/**
 * La marge mesurée pour cet horizon et ce rythme de départ, en part du score (0,12 = 12 %). Elle ne vaut que pour le rythme
 * mesuré, sans case changée. `null` : pas assez de recul pour la mesurer.
 */
export function marginFor(backtest: readonly BacktestRow[], horizon: number, pace: number): number | null {
  const row = backtest.find((r) => r.horizon === horizon && r.pace === pace);
  return row && marginReady(row) ? (row.gal?.p90 ?? null) : null;
}

/** Les points qu'une victoire de ce groupe vaut aujourd'hui, puis dans 30, 60 et 90 jours. */
export const victoryValue = (pointsPerWin: number): number[] => [0, 30, 60, 90].map((d) => (d >= 90 ? 0 : pointsPerWin * 2 ** (-d / 30)));

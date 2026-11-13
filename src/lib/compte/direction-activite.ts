/**
 * Les règles de l'onglet « Activité du site » de la Direction (`src/components/compte/DirectionActivite.tsx`), en plus de
 * celles de `src/lib/activite-site.ts` : la tendance sur sept jours et ses mots, les repères des semaines, les parts des
 * visites, la période des listes et les phrases calculées de l'écran.
 * Rien n'est inventé : tout sort de ce que rend `get_site_activity`, et un jour sans donnée n'est jamais un zéro.
 *
 * Les unités, telles que le serveur les compte (migration `20261113001500_activite_du_site.sql`) :
 * - `days[].visitors` : les navigateurs venus ce jour-là, une fois chacun. Pour un jour, visiteurs et visites sont le même
 *   nombre ; additionnés sur plusieurs jours, ce sont des **visites** (un navigateur, un jour) : un navigateur venu trois
 *   jours en fait trois. La tendance, le total et « Les visites » sont des sommes de jours : ils disent « visites ».
 * - `week.visitors`, `month.visitors` : chaque navigateur une fois dans la semaine, dans le mois : des **visiteurs**.
 */
import { lastDays, share, type SiteActivity } from "../activite-site";
import { fmtDay, fmtInt } from "../format";

type Days = Pick<SiteActivity, "days" | "today" | "since">;

/** Les mots accordés : « 0 visite », « 1 visite », « 2 visites » (zéro et un au singulier, en français). */
export const visitsWord = (n: number) => (n > 1 ? "visites" : "visite");
export const visitorsWord = (n: number) => (n > 1 ? "visiteurs" : "visiteur");
export const viewsWord = (n: number) => (n > 1 ? "pages vues" : "page vue");

/** Un jour court, « 14 nov. », et « 1er déc. » pour le premier du mois. */
export const dayWords = (day: string) => fmtDay(day).replace(/^1 /, "1er ");

/** En dessous de cet écart, en pour cent arrondi, deux semaines sont dites « stables ». */
export const TREND_STABLE_BELOW = 5;

/**
 * Sous ce nombre de visites dans l'une des deux semaines, la tendance ne donne pas de pour cent : sur de petits nombres,
 * quelques visites de plus ou de moins font un grand écart qui ne veut rien dire.
 */
export const TREND_MIN_VISITS = 50;

/**
 * Le premier jour du compteur ne compte pas dans la tendance : le compteur a commencé en cours de journée (le 13 novembre
 * 2026), ce jour-là n'est pas entier. La comparaison attend donc ce jour plus deux semaines entières.
 */
export const TREND_WAIT_DAYS = 15;

export type TrendWay = "hausse" | "baisse" | "stable" | "peu";

export type WeekTrend =
  | {
      ready: true;
      /** Les visites des sept derniers jours finis, hier compris : aujourd'hui, en cours, n'y est pas. */
      current: number;
      /** Les visites des sept jours d'avant. */
      previous: number;
      way: TrendWay;
      /** L'écart en pour cent arrondi, sans signe, rapporté aux sept jours d'avant ; `null` quand `way` vaut « peu ». */
      percent: number | null;
    }
  | {
      ready: false;
      /** Le premier jour où les deux semaines seront entièrement comptées. */
      from: string;
    };

/** Le jour `AAAA-MM-JJ` décalé de `n` jours : un calcul sur les dates seules, qu'aucun changement d'heure ne touche. */
export const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * La tendance : les visites (un navigateur, un jour) des sept derniers jours finis, contre celles des sept jours d'avant.
 * Deux périodes de même longueur, finies, avec les mêmes jours de la semaine, en jours de Paris tels que le serveur les
 * donne (`today` vient du serveur : l'horloge du navigateur n'y est pour rien, et un changement d'heure ne déplace aucun
 * jour). Elle n'existe que lorsque les quatorze jours sont entiers, après le premier jour du compteur
 * (`TREND_WAIT_DAYS`) ; avant, la fonction rend le jour où elle le sera. Sous `TREND_MIN_VISITS` visites dans l'une des
 * deux semaines : « peu », sans pour cent. Sans aucune visite comptée (`since` nul) : `null`.
 */
export function weekTrend(activity: Days): WeekTrend | null {
  if (activity.since === null) return null;
  const from = shiftDay(activity.since, TREND_WAIT_DAYS);
  if (activity.today < from) return { ready: false, from };
  // Quinze jours, du plus ancien à aujourd'hui : les sept d'avant, les sept derniers finis, puis aujourd'hui, laissé de côté.
  // Tous sont après le premier jour du compteur : un jour sans ligne y est un vrai zéro.
  const days = lastDays(activity, 15);
  const sum = (start: number, end: number) => days.slice(start, end).reduce((total, d) => total + (d.visitors ?? 0), 0);
  const previous = sum(0, 7);
  const current = sum(7, 14);
  if (previous < TREND_MIN_VISITS || current < TREND_MIN_VISITS) return { ready: true, current, previous, way: "peu", percent: null };
  const diff = current - previous;
  // L'écart arrondi sur sa valeur sans signe : une hausse et une baisse de même taille ont le même pour cent. En entiers
  // d'abord, pour que 4,5 % ne devienne pas 4,499… %.
  const percent = Math.round((Math.abs(diff) * 100) / previous);
  const way: TrendWay = percent < TREND_STABLE_BELOW ? "stable" : diff > 0 ? "hausse" : "baisse";
  return { ready: true, current, previous, way, percent };
}

/** Les couleurs de l'onglet : un sous-ensemble de celles des pièces communes (`DirTon`, `direction-kit.tsx`). */
export type ActivityTone = "ok" | "warn" | "muted";

/** La couleur et le mot d'une tendance, jamais l'une sans l'autre. Une baisse est « à regarder », pas un échec. */
export const TREND_LOOK: Record<TrendWay, { tone: ActivityTone; word: string }> = {
  hausse: { tone: "ok", word: "En hausse" },
  baisse: { tone: "warn", word: "En baisse" },
  stable: { tone: "muted", word: "Stable" },
  peu: { tone: "muted", word: "Trop peu de visites" },
};

/** La pastille d'une tendance pas encore possible. */
export const TREND_EARLY: { tone: ActivityTone; word: string } = { tone: "muted", word: "Trop tôt" };

/** La phrase sous le chiffre de la tendance : l'unité, puis l'écart en mots et le chiffre des sept jours d'avant. */
export function trendText(trend: WeekTrend & { ready: true }): string {
  const head = `${visitsWord(trend.current)} jusqu'à hier`;
  const before = fmtInt(trend.previous);
  if (trend.percent === null) return `${head}, ${trend.previous === 0 ? "aucune" : before} les 7 jours d'avant`;
  const diff = trend.current - trend.previous;
  if (diff === 0) return `${head}, autant que les 7 jours d'avant`;
  if (trend.percent === 0) return `${head}, presque autant que les 7 jours d'avant (${before})`;
  return `${head}, ${fmtInt(trend.percent)} % de ${diff > 0 ? "plus" : "moins"} que les 7 jours d'avant (${before})`;
}

/** La phrase d'une tendance pas encore possible : le jour où elle le sera. */
export function trendWaitText(from: string): string {
  return `Comparaison avec les 7 jours d'avant à partir du ${dayWords(from)}`;
}

/** Ce que dit l'aide repliée de la tendance, seuils compris. */
export const TREND_HELP =
  `« 7 derniers jours » : les visites des sept derniers jours finis, hier compris, comparées à celles des sept jours d'avant ; ` +
  `aujourd'hui, pas fini, n'y est pas. Un navigateur venu trois jours y fait trois visites : ce chiffre peut dépasser celui ` +
  `de la semaine, qui compte chaque visiteur une fois. « Stable » : moins de ${TREND_STABLE_BELOW} % d'écart. « Trop peu de ` +
  `visites » : moins de ${TREND_MIN_VISITS} visites l'une des deux semaines, trop peu pour qu'un écart veuille dire quelque ` +
  `chose. « Trop tôt » : le compteur n'a pas encore ces quatorze jours entiers ; son premier jour, commencé en cours de ` +
  `journée, n'y compte pas.`;

/**
 * Les places des repères sous les colonnes des jours : chaque lundi. Sans lundi dans la période (un compteur de moins
 * d'une semaine), le premier jour.
 */
export function weekTicks(days: string[]): number[] {
  const mondays = days.flatMap((day, i) => (isMonday(day) ? [i] : []));
  return mondays.length > 0 ? mondays : days.length > 0 ? [0] : [];
}

const isMonday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() === 1;

/**
 * La légende sous les colonnes des jours : elle dit ce que sont les dates écrites (`weekTicks`), les lundis ou, faute de
 * lundi, le premier jour compté ; la colonne d'aujourd'hui est la plus pâle.
 */
export function dayTicksLegend(days: string[]): string {
  return `${days.some(isMonday) ? "Dates : les lundis" : "Date : le premier jour compté"}. Plus pâle : aujourd'hui, en cours.`;
}

export interface VisitShare {
  key: "touch" | "signed_in" | "newcomers";
  label: string;
  count: number;
  /** La part en pour cent arrondie, ou `null` sans visite. */
  percent: number | null;
}

/** Les parts des visites de la période : sur écran tactile, connectées, venues pour la première fois. */
export function visitShares(days: SiteActivity["days"]): { visits: number; shares: VisitShare[] } {
  const sum = (key: "visitors" | VisitShare["key"]) => days.reduce((total, d) => total + d[key], 0);
  const visits = sum("visitors");
  const row = (key: VisitShare["key"], label: string): VisitShare => ({ key, label, count: sum(key), percent: share(sum(key), visits) });
  return {
    visits,
    shares: [row("touch", "Sur téléphone ou tablette"), row("signed_in", "Connectés à leur compte du site"), row("newcomers", "Venus pour la première fois")],
  };
}

/** La longueur d'un trait, de 0 à 100, à la mesure du plus grand. Un zéro n'a pas de trait. */
export function traitLength(value: number, max: number): number {
  return max > 0 && value > 0 ? Math.min(100, (value / max) * 100) : 0;
}

/**
 * La période des listes, des heures et des parts : les 30 jours que rend le serveur, ou moins si le compteur est plus
 * jeune, dite depuis son premier jour.
 */
export function periodText(activity: Days): string {
  const counted = lastDays(activity, 30).filter((d) => d.visitors !== null);
  return counted.length < 30 ? `depuis le ${dayWords(counted[0]?.day ?? activity.today)}` : "sur 30 jours";
}

/** Les visiteurs d'hier : `null` si le compteur ne tournait pas encore, zéro s'il tournait sans visite. */
export function yesterdayVisitors(activity: Days): number | null {
  const [yesterday] = lastDays(activity, 2);
  return yesterday?.visitors ?? null;
}

/** L'heure la plus vue ; à égalité, la plus tôt ; 0 h sans aucune heure. */
export function busiestHour(hours: { hour: number; views: number }[]): number {
  let best: { hour: number; views: number } | null = null;
  for (const h of hours) if (best === null || h.views > best.views) best = h;
  return best?.hour ?? 0;
}

/** Ce qu'écrit le graphique des jours au-dessus des colonnes, pour le jour lu. */
export function dayReadout(day: { day: string; visitors: number; views: number }, today: string): string {
  return `${dayWords(day.day)}${day.day === today ? " (en cours)" : ""} : ${fmtInt(day.visitors)} ${visitorsWord(day.visitors)}, ${fmtInt(day.views)} ${viewsWord(day.views)}`;
}

/** Ce qu'écrit le graphique des heures au-dessus des colonnes, pour l'heure lue. */
export function hourReadout(hour: { hour: number; views: number }): string {
  return `De ${hour.hour} h à ${hour.hour + 1} h : ${fmtInt(hour.views)} ${viewsWord(hour.views)}`;
}

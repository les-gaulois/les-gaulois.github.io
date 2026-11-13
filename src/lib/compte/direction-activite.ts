/**
 * Les règles de l'onglet « Activité du site » de la Direction (`src/components/compte/DirectionActivite.tsx`), en plus de
 * celles de `src/lib/activite-site.ts` : la tendance sur sept jours, les repères des semaines et les parts des visites.
 * Rien n'est inventé : tout sort des jours rendus par `get_site_activity`, et un jour sans donnée n'est jamais un zéro.
 */
import { lastDays, share, type SiteActivity } from "../activite-site";

type Days = Pick<SiteActivity, "days" | "today" | "since">;

/** En dessous de cet écart, en pour cent arrondi, deux semaines sont dites « stables ». */
export const TREND_STABLE_BELOW = 5;

export type TrendWay = "hausse" | "baisse" | "stable";

export type WeekTrend =
  | {
      ready: true;
      /** Les visites des sept derniers jours finis, hier compris : aujourd'hui, en cours, n'y est pas. */
      current: number;
      /** Les visites des sept jours d'avant. */
      previous: number;
      way: TrendWay;
      /** L'écart en pour cent arrondi, sans signe ; `null` quand les sept jours d'avant n'ont aucune visite. */
      percent: number | null;
    }
  | {
      ready: false;
      /** Le premier jour où les deux semaines seront entièrement comptées. */
      from: string;
    };

const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * La tendance : les visites (un navigateur, un jour) des sept derniers jours finis, contre celles des sept jours d'avant.
 * Deux périodes de même longueur, finies, avec les mêmes jours de la semaine : la comparaison est sûre. Elle n'existe que
 * lorsque les quatorze jours sont après le début du compteur ; avant, la fonction rend le jour où elle le sera. Sans aucune
 * visite comptée (`since` nul) : `null`.
 */
export function weekTrend(activity: Days): WeekTrend | null {
  if (activity.since === null) return null;
  const days = lastDays(activity, 15);
  const sum = (from: number, to: number) => {
    let total = 0;
    for (const d of days.slice(from, to)) {
      if (d.visitors === null) return null;
      total += d.visitors;
    }
    return total;
  };
  const previous = sum(0, 7);
  const current = sum(7, 14);
  if (previous === null || current === null) return { ready: false, from: shiftDay(activity.since, 14) };
  if (previous === 0) return { ready: true, current, previous, way: current > 0 ? "hausse" : "stable", percent: null };
  const signed = Math.round(((current - previous) / previous) * 100);
  const way: TrendWay = Math.abs(signed) < TREND_STABLE_BELOW ? "stable" : signed > 0 ? "hausse" : "baisse";
  return { ready: true, current, previous, way, percent: Math.abs(signed) };
}

/**
 * Les places des repères sous les colonnes des jours : chaque lundi. Sans lundi dans la période (un compteur de moins
 * d'une semaine), le premier jour.
 */
export function weekTicks(days: string[]): number[] {
  const mondays = days.flatMap((day, i) => (new Date(`${day}T00:00:00Z`).getUTCDay() === 1 ? [i] : []));
  return mondays.length > 0 ? mondays : days.length > 0 ? [0] : [];
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

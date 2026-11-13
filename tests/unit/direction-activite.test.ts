import { describe, expect, it } from "vitest";
import { share, type SiteActivity } from "../../src/lib/activite-site";
import {
  TREND_EARLY,
  TREND_HELP,
  TREND_LOOK,
  TREND_MIN_VISITS,
  TREND_STABLE_BELOW,
  TREND_WAIT_DAYS,
  busiestHour,
  dayReadout,
  dayTicksLegend,
  dayWords,
  hourReadout,
  periodText,
  shiftDay,
  traitLength,
  trendText,
  trendWaitText,
  visitShares,
  visitorsWord,
  visitsWord,
  viewsWord,
  weekTicks,
  weekTrend,
  yesterdayVisitors,
  type WeekTrend,
} from "../../src/lib/compte/direction-activite";

/** Les espaces insécables des nombres et des dates, ramenées à des espaces ordinaires pour comparer les phrases. */
const plain = (s: string) => s.replace(/[  ]/g, " ");

const TODAY = "2026-11-30";
const shift = (n: number, from = TODAY) => shiftDay(from, n);
const row = (day: string, visitors: number): SiteActivity["days"][number] => ({ day, visitors, views: visitors * 3, newcomers: 0, touch: 0, signed_in: 0 });

/**
 * Une activité : les sept jours d'avant à `previous` visites (un nombre par jour, ou une liste de sept), les sept derniers
 * jours finis à `current`, aujourd'hui à 999 ; le compteur commence `since` (par défaut, bien avant).
 */
function weeks(previous: number | number[], current: number | number[], { since = shift(-40), today = TODAY } = {}) {
  const seven = (v: number | number[]) => (Array.isArray(v) ? v : Array.from({ length: 7 }, () => v));
  const values = [...seven(previous), ...seven(current)];
  // Le serveur n'a aucune ligne avant le début du compteur.
  const days = [...values.map((v, i) => row(shiftDay(today, -14 + i), v)), row(today, 999)].filter((d) => d.day >= since);
  return { today, since, days };
}

describe("weekTrend", () => {
  it("compare les sept derniers jours finis aux sept d'avant, sans aujourd'hui", () => {
    expect(weekTrend(weeks(10, 12))).toEqual({ ready: true, current: 84, previous: 70, way: "hausse", percent: 20 });
  });

  it("prend exactement les bons jours : d'il y a 14 jours à il y a 8, puis d'il y a 7 à hier", () => {
    // Chaque jour a son propre nombre : une erreur d'un jour changerait les sommes.
    const previous = [100, 101, 102, 103, 104, 105, 106];
    const current = [200, 201, 202, 203, 204, 205, 206];
    const activity = weeks(previous, current);
    // Un jour de trop, avant ou après : il ne doit pas compter.
    activity.days.unshift(row(shift(-15), 5000));
    expect(weekTrend(activity)).toMatchObject({ previous: 721, current: 1421 });
  });

  it("ne se trompe pas de jour autour d'un changement d'heure ni d'une fin d'année", () => {
    // 25 octobre 2026 : la journée de Paris a 25 heures ; 28 mars 2027 : 23 heures. Le 31 décembre passe à l'année suivante.
    for (const today of ["2026-10-30", "2026-10-26", "2027-04-02", "2027-03-29", "2027-01-03"]) {
      const previous = [60, 61, 62, 63, 64, 65, 66];
      const current = [70, 71, 72, 73, 74, 75, 76];
      const activity = weeks(previous, current, { today, since: shiftDay(today, -60) });
      expect(activity.days.map((d) => d.day)).toEqual(Array.from({ length: 15 }, (_, i) => shiftDay(today, -14 + i)));
      expect(weekTrend(activity)).toMatchObject({ previous: 441, current: 511 });
    }
    expect(shiftDay("2026-10-25", 1)).toBe("2026-10-26");
    expect(shiftDay("2027-03-28", -1)).toBe("2027-03-27");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("dit une baisse sans signe", () => {
    expect(weekTrend(weeks(10, 8))).toMatchObject({ way: "baisse", percent: 20 });
  });

  it(`dit stable sous ${TREND_STABLE_BELOW} % d'écart, en hausse ou en baisse à partir de ${TREND_STABLE_BELOW} %`, () => {
    expect(TREND_STABLE_BELOW).toBe(5);
    expect(weekTrend(weeks(100, 104))).toMatchObject({ way: "stable", percent: 4 });
    expect(weekTrend(weeks(100, 105))).toMatchObject({ way: "hausse", percent: 5 });
    expect(weekTrend(weeks(100, 96))).toMatchObject({ way: "stable", percent: 4 });
    expect(weekTrend(weeks(100, 95))).toMatchObject({ way: "baisse", percent: 5 });
    expect(weekTrend(weeks(100, 100))).toMatchObject({ way: "stable", percent: 0 });
  });

  it("arrondit une hausse et une baisse de même taille au même pour cent", () => {
    // 1 400 visites d'un côté, 63 de plus ou de moins de l'autre : 4,5 % des deux côtés, arrondi à 5.
    expect(weekTrend(weeks(200, [200, 200, 200, 200, 200, 200, 263]))).toMatchObject({ previous: 1400, current: 1463, way: "hausse", percent: 5 });
    expect(weekTrend(weeks(200, [200, 200, 200, 200, 200, 200, 137]))).toMatchObject({ previous: 1400, current: 1337, way: "baisse", percent: 5 });
  });

  it(`ne donne pas de pour cent sous ${TREND_MIN_VISITS} visites l'une des deux semaines`, () => {
    expect(TREND_MIN_VISITS).toBe(50);
    const few = (previous: number[], current: number[]) => weekTrend(weeks(previous, current));
    const p = (total: number) => [total, 0, 0, 0, 0, 0, 0];
    expect(few(p(49), p(400))).toEqual({ ready: true, previous: 49, current: 400, way: "peu", percent: null });
    expect(few(p(400), p(49))).toEqual({ ready: true, previous: 400, current: 49, way: "peu", percent: null });
    expect(few(p(50), p(50))).toMatchObject({ way: "stable", percent: 0 });
    expect(few(p(50), p(100))).toMatchObject({ way: "hausse", percent: 100 });
  });

  it("n'invente pas de pour cent quand les sept jours d'avant sont à zéro", () => {
    expect(weekTrend(weeks(0, 30))).toEqual({ ready: true, previous: 0, current: 210, way: "peu", percent: null });
    expect(weekTrend(weeks(0, 0))).toEqual({ ready: true, previous: 0, current: 0, way: "peu", percent: null });
  });

  it("compte pour zéro un jour sans ligne après le début du compteur", () => {
    const activity = weeks(10, 10);
    activity.days = activity.days.filter((d) => d.day !== shift(-3));
    expect(weekTrend(activity)).toMatchObject({ current: 60, previous: 70, way: "baisse", percent: 14 });
  });

  it("attend deux semaines entières après le premier jour du compteur, et dit depuis quand", () => {
    expect(TREND_WAIT_DAYS).toBe(15);
    // Le premier jour, commencé en cours de journée, serait le premier des sept jours d'avant : trop tôt d'un jour.
    expect(weekTrend(weeks(10, 10, { since: shift(-14) }))).toEqual({ ready: false, from: shift(1) });
    expect(weekTrend(weeks(10, 10, { since: shift(-15) }))).toMatchObject({ ready: true, previous: 70, current: 70 });
    expect(weekTrend({ today: TODAY, since: TODAY, days: [row(TODAY, 4)] })).toEqual({ ready: false, from: shift(15) });
    // Le compteur du site a commencé le 13 novembre 2026 : la première comparaison, le 28.
    expect(weekTrend({ today: "2026-11-14", since: "2026-11-13", days: [] })).toEqual({ ready: false, from: "2026-11-28" });
  });

  it("ne rend rien sans aucune visite comptée", () => {
    expect(weekTrend({ today: TODAY, since: null, days: [] })).toBeNull();
  });
});

describe("TREND_LOOK", () => {
  it("donne à chaque tendance sa couleur et son mot", () => {
    expect(TREND_LOOK).toEqual({
      hausse: { tone: "ok", word: "En hausse" },
      baisse: { tone: "warn", word: "En baisse" },
      stable: { tone: "muted", word: "Stable" },
      peu: { tone: "muted", word: "Trop peu de visites" },
    });
    expect(TREND_EARLY).toEqual({ tone: "muted", word: "Trop tôt" });
  });
});

describe("trendText", () => {
  type Ready = Extract<WeekTrend, { ready: true }>;
  const ready = (current: number, previous: number, way: Ready["way"], percent: number | null): Ready => ({ ready: true, current, previous, way, percent });

  it("dit l'écart en mots, avec le chiffre des sept jours d'avant", () => {
    expect(plain(trendText(ready(84, 70, "hausse", 20)))).toBe("visites jusqu'à hier, 20 % de plus que les 7 jours d'avant (70)");
    expect(plain(trendText(ready(56, 70, "baisse", 20)))).toBe("visites jusqu'à hier, 20 % de moins que les 7 jours d'avant (70)");
    expect(plain(trendText(ready(1463, 1400, "hausse", 5)))).toBe("visites jusqu'à hier, 5 % de plus que les 7 jours d'avant (1 400)");
  });

  it("dit 100 % et plus", () => {
    expect(plain(trendText(ready(100, 50, "hausse", 100)))).toBe("visites jusqu'à hier, 100 % de plus que les 7 jours d'avant (50)");
    expect(plain(trendText(ready(1250, 50, "hausse", 2400)))).toBe("visites jusqu'à hier, 2 400 % de plus que les 7 jours d'avant (50)");
  });

  it("ne dit pas « 0 % de plus »", () => {
    expect(trendText(ready(700, 700, "stable", 0))).toBe("visites jusqu'à hier, autant que les 7 jours d'avant");
    expect(plain(trendText(ready(1001, 1000, "stable", 0)))).toBe("visites jusqu'à hier, presque autant que les 7 jours d'avant (1 000)");
    expect(plain(trendText(ready(999, 1000, "stable", 0)))).toBe("visites jusqu'à hier, presque autant que les 7 jours d'avant (1 000)");
  });

  it("donne les deux chiffres sans pour cent quand il y a trop peu de visites, de zéro compris", () => {
    expect(trendText(ready(80, 0, "peu", null))).toBe("visites jusqu'à hier, aucune les 7 jours d'avant");
    expect(trendText(ready(12, 49, "peu", null))).toBe("visites jusqu'à hier, 49 les 7 jours d'avant");
    expect(trendText(ready(1, 1, "peu", null))).toBe("visite jusqu'à hier, 1 les 7 jours d'avant");
    expect(trendText(ready(0, 30, "peu", null))).toBe("visite jusqu'à hier, 30 les 7 jours d'avant");
  });

  it("suit weekTrend de bout en bout", () => {
    const trend = weekTrend(weeks(10, 12));
    expect(trend?.ready).toBe(true);
    if (trend?.ready) expect(trendText(trend)).toBe("visites jusqu'à hier, 20 % de plus que les 7 jours d'avant (70)");
  });
});

describe("trendWaitText et TREND_HELP", () => {
  it("dit le jour de la première comparaison, « 1er » compris", () => {
    expect(plain(trendWaitText("2026-11-28"))).toBe("Comparaison avec les 7 jours d'avant à partir du 28 nov.");
    expect(plain(trendWaitText("2026-12-01"))).toBe("Comparaison avec les 7 jours d'avant à partir du 1er déc.");
  });

  it("écrit les seuils tels que le calcul les applique", () => {
    expect(TREND_HELP).toContain(`moins de ${TREND_STABLE_BELOW} % d'écart`);
    expect(TREND_HELP).toContain(`moins de ${TREND_MIN_VISITS} visites`);
    expect(TREND_HELP).toContain("premier jour");
  });
});

describe("les mots accordés", () => {
  it("met zéro et un au singulier", () => {
    expect([0, 1, 2].map(visitsWord)).toEqual(["visite", "visite", "visites"]);
    expect([0, 1, 2].map(visitorsWord)).toEqual(["visiteur", "visiteur", "visiteurs"]);
    expect([0, 1, 2].map(viewsWord)).toEqual(["page vue", "page vue", "pages vues"]);
  });

  it("écrit « 1er » pour le premier du mois, et lui seul", () => {
    expect(plain(dayWords("2026-12-01"))).toBe("1er déc.");
    expect(plain(dayWords("2026-11-14"))).toBe("14 nov.");
    expect(plain(dayWords("2026-11-11"))).toBe("11 nov.");
  });
});

describe("weekTicks", () => {
  it("rend la place de chaque lundi", () => {
    // Le 30 novembre 2026 est un lundi.
    expect(weekTicks([shift(-8), shift(-7), shift(-6), shift(-1), TODAY])).toEqual([1, 4]);
  });

  it("rend le premier jour faute de lundi, et rien sans jour", () => {
    expect(weekTicks([shift(-3), shift(-2)])).toEqual([0]);
    expect(weekTicks([])).toEqual([]);
  });
});

describe("dayTicksLegend", () => {
  it("dit « les lundis » seulement quand les dates écrites sont des lundis", () => {
    expect(dayTicksLegend([shift(-8), shift(-7), TODAY])).toBe("Dates : les lundis. Plus pâle : aujourd'hui, en cours.");
    // Le compteur du site : vendredi 13 et samedi 14 novembre 2026, sans lundi : la date écrite est le premier jour.
    expect(weekTicks(["2026-11-13", "2026-11-14"])).toEqual([0]);
    expect(dayTicksLegend(["2026-11-13", "2026-11-14"])).toBe("Date : le premier jour compté. Plus pâle : aujourd'hui, en cours.");
  });
});

describe("share", () => {
  it("arrondit au plus proche, sans l'erreur des nombres à virgule", () => {
    // 23 / 40 * 100 vaut 57,4999… en nombres à virgule : 57 avant la correction.
    expect(share(23, 40)).toBe(58);
    expect(share(29, 200)).toBe(15);
    expect(share(1, 3)).toBe(33);
    expect(share(2, 3)).toBe(67);
  });

  it("rend 0 et 100 aux bords, et rien sans base", () => {
    expect(share(0, 5)).toBe(0);
    expect(share(5, 5)).toBe(100);
    expect(share(0, 0)).toBeNull();
  });
});

describe("visitShares", () => {
  it("additionne la période et arrondit les parts", () => {
    const days = [
      { day: shift(-1), visitors: 30, views: 90, newcomers: 3, touch: 20, signed_in: 0 },
      { day: TODAY, visitors: 10, views: 20, newcomers: 2, touch: 3, signed_in: 1 },
    ];
    const { visits, shares } = visitShares(days);
    expect(visits).toBe(40);
    expect(shares.map((s) => [s.key, s.label, s.count, s.percent])).toEqual([
      ["touch", "Sur téléphone ou tablette", 23, 58],
      ["signed_in", "Connectés à leur compte du site", 1, 3],
      ["newcomers", "Venus pour la première fois", 5, 13],
    ]);
  });

  it("n'a pas de part sans visite", () => {
    const { visits, shares } = visitShares([]);
    expect(visits).toBe(0);
    expect(shares.every((s) => s.count === 0 && s.percent === null)).toBe(true);
  });
});

describe("traitLength", () => {
  it("mesure à la longueur du plus grand", () => {
    expect(traitLength(10, 10)).toBe(100);
    expect(traitLength(5, 10)).toBe(50);
    expect(traitLength(1, 3)).toBeCloseTo(33.333, 2);
  });

  it("ne trace rien pour un zéro, ni sans mesure", () => {
    expect(traitLength(0, 10)).toBe(0);
    expect(traitLength(0, 0)).toBe(0);
    expect(traitLength(3, 0)).toBe(0);
  });

  it("ne dépasse jamais la case", () => {
    expect(traitLength(12, 10)).toBe(100);
  });
});

describe("periodText", () => {
  it("dit « sur 30 jours » quand le compteur a les trente jours", () => {
    expect(periodText({ today: TODAY, since: shift(-200), days: [] })).toBe("sur 30 jours");
    expect(periodText({ today: TODAY, since: shift(-29), days: [] })).toBe("sur 30 jours");
  });

  it("dit depuis quand quand le compteur est plus jeune", () => {
    expect(plain(periodText({ today: TODAY, since: shift(-28), days: [] }))).toBe("depuis le 2 nov.");
    expect(plain(periodText({ today: "2026-11-14", since: "2026-11-13", days: [] }))).toBe("depuis le 13 nov.");
    expect(plain(periodText({ today: "2026-12-01", since: "2026-12-01", days: [] }))).toBe("depuis le 1er déc.");
  });
});

describe("yesterdayVisitors", () => {
  it("n'a pas de données avant le compteur, un vrai zéro après", () => {
    expect(yesterdayVisitors({ today: TODAY, since: TODAY, days: [row(TODAY, 4)] })).toBeNull();
    expect(yesterdayVisitors({ today: TODAY, since: shift(-1), days: [row(TODAY, 4)] })).toBe(0);
    expect(yesterdayVisitors({ today: TODAY, since: shift(-5), days: [row(shift(-1), 87), row(TODAY, 4)] })).toBe(87);
  });
});

describe("busiestHour", () => {
  it("rend l'heure la plus vue, la plus tôt à égalité", () => {
    expect(busiestHour([{ hour: 3, views: 5 }, { hour: 21, views: 40 }, { hour: 22, views: 40 }])).toBe(21);
  });

  it("rend 0 h sans aucune page vue", () => {
    expect(busiestHour([])).toBe(0);
    expect(busiestHour(Array.from({ length: 24 }, (_, hour) => ({ hour, views: 0 })))).toBe(0);
  });
});

describe("dayReadout et hourReadout", () => {
  it("écrit le jour lu, « en cours » pour aujourd'hui, avec les bons accords", () => {
    expect(plain(dayReadout({ day: TODAY, visitors: 62, views: 224 }, TODAY))).toBe("30 nov. (en cours) : 62 visiteurs, 224 pages vues");
    expect(plain(dayReadout({ day: shift(-1), visitors: 1, views: 1 }, TODAY))).toBe("29 nov. : 1 visiteur, 1 page vue");
    expect(plain(dayReadout({ day: "2026-12-01", visitors: 0, views: 0 }, TODAY))).toBe("1er déc. : 0 visiteur, 0 page vue");
    expect(plain(dayReadout({ day: shift(-2), visitors: 1234, views: 5678 }, TODAY))).toBe("28 nov. : 1 234 visiteurs, 5 678 pages vues");
  });

  it("écrit l'heure lue, de 23 h à 24 h comprise", () => {
    expect(plain(hourReadout({ hour: 21, views: 744 }))).toBe("De 21 h à 22 h : 744 pages vues");
    expect(hourReadout({ hour: 23, views: 1 })).toBe("De 23 h à 24 h : 1 page vue");
    expect(hourReadout({ hour: 0, views: 0 })).toBe("De 0 h à 1 h : 0 page vue");
  });
});

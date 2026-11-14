import { describe, expect, it } from "vitest";
import { closesLabel, closestGuesses, weekSpan, winsProgress, type ClosedWeek, type WeeklyGoal } from "../../src/lib/compte/outils";
import {
  REREADS_PER_CLOSE,
  TIMER_MAX_MS,
  alreadyCounted,
  clanBars,
  clanGoalState,
  closedSummary,
  closestWords,
  gapWords,
  mineWords,
  nextReread,
  predictionClosed,
  predictionState,
  untilClose,
  winsGoalState,
  type Rereads,
} from "../../src/lib/compte/qg-semaine";
import type { ClanWeek, ClanWeekFile } from "../../src/lib/semaine-du-clan";

// Les espaces insécables des nombres français, ramenées à une espace simple.
const plain = (s: string | null | undefined) => s?.replace(/\s/g, " ");
const week = (wins: number, complete: boolean, from = "2026-11-02"): ClanWeek => ({ from, games: wins * 2, wins, complete });
const closed = (guesses: ClosedWeek["guesses"]): ClosedWeek => ({ week: "2026-11-02", closesAt: "2026-11-03T23:00:00.000Z", guesses });
const file = (weeks: ClanWeek[], until: string | null = "2026-11-10T21:53:32.706Z"): ClanWeekFile => ({ until, weeks, gains: null, clans: null });
const ms = (iso: string) => Date.parse(iso);

describe("l'objectif de victoires", () => {
  it("est en cours tant que la semaine n'est pas entièrement relevée", () => {
    expect(winsGoalState(300, week(206, false))).toEqual({ ton: "ally", mot: "En cours", done: 206, target: 300, reached: false, share: 206 / 300, missing: 94, final: false });
  });
  it("reprend le calcul des outils du QG, sans le refaire", () => {
    for (const [target, data] of [
      [300, week(206, false)],
      [40, week(206, false)],
      [400, week(293, true)],
      [1, week(0, false)],
    ] as const) {
      expect(winsGoalState(target, data)).toMatchObject(winsProgress(target, data) ?? {});
    }
  });
  it("est atteint dès que le compte y est, semaine finie ou non, barre pleine", () => {
    expect(winsGoalState(40, week(206, false))).toMatchObject({ ton: "ok", mot: "Atteint", share: 1, missing: 0 });
    expect(winsGoalState(40, week(40, true))).toMatchObject({ ton: "ok", mot: "Atteint", final: true });
  });
  it("est manqué seulement sur une semaine entièrement relevée", () => {
    expect(winsGoalState(400, week(293, true))).toMatchObject({ ton: "danger", mot: "Manqué", missing: 107, final: true });
    expect(winsGoalState(400, week(399, false))).toMatchObject({ ton: "ally", mot: "En cours", missing: 1, final: false });
  });
  it("d'une semaine finie : manqué ou atteint, jamais en cours", () => {
    expect(winsGoalState(294, week(293, true))?.mot).toBe("Manqué");
    expect(winsGoalState(293, week(293, true))?.mot).toBe("Atteint");
    expect(winsGoalState(1, week(0, true))).toMatchObject({ mot: "Manqué", done: 0, share: 0, missing: 1 });
  });
  it("ne dit rien sans données : ce n'est pas zéro victoire", () => {
    expect(winsGoalState(300, null)).toBeNull();
    expect(winsGoalState(0, week(10, false))).toBeNull();
    expect(winsGoalState(Number.NaN, week(10, false))).toBeNull();
  });
});

describe("l'objectif « un clan »", () => {
  it("dit devant, derrière ou à égalité", () => {
    expect(clanGoalState(12.5)).toEqual({ ton: "ok", mot: "Devant" });
    expect(clanGoalState(-0.01)).toEqual({ ton: "warn", mot: "Derrière" });
    expect(clanGoalState(0)).toEqual({ ton: "ally", mot: "À égalité" });
  });
  it("donne les deux scores, le plus haut remplit sa barre", () => {
    const clans = {
      end: "2026-11-13T21:00:00.000Z",
      scores: [
        { tag: "GAL", score: 500 },
        { tag: "UN", score: 1000 },
      ],
    };
    expect(clanBars(clans, "GAL", "UN")).toEqual({ ours: 500, theirs: 1000, oursShare: 0.5, theirsShare: 1 });
    expect(clanBars(clans, "UN", "GAL")).toMatchObject({ oursShare: 1, theirsShare: 0.5 });
  });
  it("ne donne rien si l'un des deux n'est pas au classement, ni de barre sans score", () => {
    const clans = {
      end: "2026-11-13T21:00:00.000Z",
      scores: [
        { tag: "GAL", score: 0 },
        { tag: "UN", score: 0 },
      ],
    };
    expect(clanBars(clans, "GAL", "ZZZ")).toBeNull();
    expect(clanBars(null, "GAL", "UN")).toBeNull();
    expect(clanBars(clans, "GAL", "UN")).toMatchObject({ oursShare: 0, theirsShare: 0 });
  });
});

describe("l'état du pronostic", () => {
  it("à faire, fait, puis clos une fois l'heure passée", () => {
    expect(predictionState(null, false)).toEqual({ ton: "warn", mot: "À faire" });
    expect(predictionState(0, false)).toEqual({ ton: "ok", mot: "Fait" });
    expect(predictionState(250, true)).toEqual({ ton: "muted", mot: "Clos" });
    expect(predictionState(null, true)).toEqual({ ton: "muted", mot: "Clos" });
  });
});

describe("la clôture du pronostic", () => {
  const closesAt = "2026-11-17T23:00:00.000Z";

  it("se ferme à la minute pile, pas à la suivante", () => {
    expect(predictionClosed(closesAt, ms(closesAt) - 1)).toBe(false);
    expect(predictionClosed(closesAt, ms(closesAt))).toBe(true);
    expect(predictionClosed(closesAt, ms(closesAt) + 1)).toBe(true);
    // Le serveur écrit « +00:00 », le navigateur « Z » : la même heure.
    expect(predictionClosed("2026-11-17T23:00:00+00:00", ms(closesAt))).toBe(true);
  });
  it("ferme une heure illisible plutôt que de laisser envoyer", () => {
    expect(predictionClosed("mardi soir", 0)).toBe(true);
    expect(untilClose("mardi soir", 0)).toBeNull();
  });
  it("règle la minuterie sur la clôture même", () => {
    expect(untilClose(closesAt, ms(closesAt) - 60_000)).toBe(60_000);
    expect(untilClose(closesAt, ms(closesAt) - 1)).toBe(1);
    expect(untilClose(closesAt, ms(closesAt))).toBeNull();
    // Une clôture lointaine ne fait pas partir la minuterie tout de suite.
    expect(untilClose(closesAt, ms(closesAt) - 40 * 86_400_000)).toBe(TIMER_MAX_MS);
  });
  it("suit le changement d'heure : minuit à Paris, en heure d'été comme en heure d'hiver", () => {
    // Semaine du 19 au 25 octobre 2026 : on passe à l'heure d'hiver le dimanche 25. Sa clôture, mercredi 21 à minuit, est
    // encore en heure d'été (22 h en temps universel). La semaine suivante ferme à 23 h en temps universel.
    expect(weekSpan("2026-10-19")).toBe("du 19 oct. au 25 oct.");
    expect(closesLabel("2026-10-20T22:00:00+00:00")).toBe("jusqu'au mardi 20 oct. à minuit");
    expect(predictionClosed("2026-10-20T22:00:00+00:00", ms("2026-10-20T21:59:59.999Z"))).toBe(false);
    expect(predictionClosed("2026-10-20T22:00:00+00:00", ms("2026-10-20T22:00:00.000Z"))).toBe(true);
    expect(closesLabel("2026-10-27T23:00:00+00:00")).toBe("jusqu'au mardi 27 oct. à minuit");
    // Semaine du 23 au 29 mars 2026, passage à l'heure d'été le dimanche 29 : clôture encore en heure d'hiver.
    expect(weekSpan("2026-03-23")).toBe("du 23 mars au 29 mars");
    expect(closesLabel("2026-03-24T23:00:00+00:00")).toBe("jusqu'au mardi 24 mars à minuit");
  });
});

describe("la relecture à la clôture", () => {
  const closesAt = "2026-11-17T23:00:00.000Z";
  const t0 = ms(closesAt);

  it("relit tout de suite, puis au plus une fois par minute", () => {
    const first = nextReread(null, closesAt, t0);
    expect(first).toEqual({ closesAt, count: 1, at: t0 });
    // Le réveil de la minute peut tomber une seconde après la clôture : pas de deuxième relecture si tôt.
    expect(nextReread(first, closesAt, t0 + 1_000)).toBeNull();
    expect(nextReread(first, closesAt, t0 + 60_000)).toEqual({ closesAt, count: 2, at: t0 + 60_000 });
  });
  it("s'arrête après quelques essais si le serveur rend toujours la même semaine : jamais en continu", () => {
    let done: Rereads | null = null;
    let calls = 0;
    for (let minute = 0; minute < 24 * 60; minute++) {
      const next = nextReread(done, closesAt, t0 + minute * 60_000);
      if (next) {
        done = next;
        calls++;
      }
    }
    expect(calls).toBe(REREADS_PER_CLOSE);
  });
  it("repart de zéro à la clôture suivante", () => {
    const spent: Rereads = { closesAt, count: REREADS_PER_CLOSE, at: t0 };
    expect(nextReread(spent, closesAt, t0 + 3_600_000)).toBeNull();
    expect(nextReread(spent, "2026-11-24T23:00:00.000Z", ms("2026-11-24T23:00:00.000Z"))).toMatchObject({ count: 1 });
  });
});

describe("ce que la semaine pronostiquée compte déjà", () => {
  const started = file([week(75, false, "2026-11-09"), week(293, true, "2026-11-02")]);
  const winsGoal = (w: string): WeeklyGoal => ({ week: w, kind: "wins", wins: 300 });

  it("dit le relevé de la semaine commencée, avec son heure", () => {
    expect(plain(alreadyCounted("2026-11-09", null, started))).toBe("75 victoires déjà au 10 nov., 22:53.");
    expect(plain(alreadyCounted("2026-11-09", { week: "2026-11-09", kind: "clan", clan: "UN" }, started))).toBe("75 victoires déjà au 10 nov., 22:53.");
    expect(plain(alreadyCounted("2026-11-09", null, file([week(0, false, "2026-11-09")])))).toBe("0 victoire déjà au 10 nov., 22:53.");
  });
  it("se tait quand l'objectif de la même semaine le montre déjà", () => {
    expect(alreadyCounted("2026-11-09", winsGoal("2026-11-09"), started)).toBeNull();
    expect(alreadyCounted("2026-11-09", winsGoal("2026-11-02"), started)).not.toBeNull();
  });
  it("ne dit rien d'une semaine pas commencée, finie, ni sans fichier lisible", () => {
    expect(alreadyCounted("2026-11-16", null, started)).toBeNull();
    expect(alreadyCounted("2026-11-02", null, started)).toBeNull();
    expect(alreadyCounted("2026-11-09", null, null)).toBeNull();
    expect(alreadyCounted("2026-11-09", null, undefined)).toBeNull();
    expect(alreadyCounted("2026-11-09", null, file([week(75, false, "2026-11-09")], null))).toBeNull();
  });
  it("donne l'heure de Paris d'un relevé fait après le changement d'heure", () => {
    // Le 25 octobre 2026 à 2 h 30 en temps universel : 3 h 30 à Paris, déjà en heure d'hiver (une heure d'avance).
    const autumn = file([week(12, false, "2026-10-19")], "2026-10-25T02:30:00.000Z");
    expect(plain(alreadyCounted("2026-10-19", null, autumn))).toBe("12 victoires déjà au 25 oct., 03:30.");
  });
});

describe("une semaine close", () => {
  const guesses = [
    { name: "Epona", wins: 310, mine: false },
    { name: "Moi", wins: 280, mine: true },
    { name: "Tarvos", wins: 400, mine: false },
    { name: "Cassi", wins: 276, mine: false },
  ];

  it("finale : range du plus près au plus loin, avec l'écart de chacun", () => {
    const summary = closedSummary(closed(guesses), week(293, true));
    expect(summary.status).toBe("final");
    expect(summary.etat).toEqual({ ton: "ok", mot: "Final" });
    expect(summary.wins).toBe(293);
    expect(summary.guesses.map((g) => [g.name, g.gap, g.closest])).toEqual([
      ["Moi", 13, true],
      ["Epona", 17, false],
      ["Cassi", 17, false],
      ["Tarvos", 107, false],
    ]);
    expect(summary.closest.map((g) => g.name)).toEqual(["Moi"]);
    expect(summary.mine).toMatchObject({ name: "Moi", gap: 13, closest: true });
  });
  it("finale : tous les plus près en cas d'égalité, de part et d'autre du résultat", () => {
    const summary = closedSummary(
      closed([
        { name: "A", wins: 290, mine: false },
        { name: "B", wins: 296, mine: true },
        { name: "C", wins: 200, mine: false },
      ]),
      week(293, true),
    );
    expect(summary.closest.map((g) => g.name)).toEqual(["A", "B"]);
  });
  it("finale : les mêmes plus près que les outils du QG, même avec beaucoup d'égalités", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `G${i}`, wins: i % 3 === 0 ? 290 : i % 3 === 1 ? 296 : 250 + i, mine: i === 4 }));
    const summary = closedSummary(closed(many), week(293, true));
    expect(summary.closest.map((g) => g.name)).toEqual(closestGuesses(many, 293).map((g) => g.name));
    expect(summary.closest).toHaveLength(20);
    expect(summary.closest.every((g) => g.gap === 3)).toBe(true);
    // Les égalités gardent l'ordre reçu du serveur.
    expect(summary.guesses.slice(0, 20).map((g) => g.name)).toEqual(many.filter((g) => g.wins !== 250 + Number(g.name.slice(1))).map((g) => g.name));
    expect(summary.mine).toMatchObject({ name: "G4", closest: true });
  });
  it("provisoire : le total relevé, mais ni gagnant ni écart", () => {
    const summary = closedSummary(closed(guesses), week(206, false));
    expect(summary.status).toBe("provisoire");
    expect(summary.etat).toEqual({ ton: "warn", mot: "Provisoire" });
    expect(summary.wins).toBe(206);
    expect(summary.closest).toEqual([]);
    expect(summary.guesses.map((g) => g.name)).toEqual(["Epona", "Moi", "Tarvos", "Cassi"]);
    expect(summary.guesses.every((g) => g.gap === null && !g.closest)).toBe(true);
    expect(summary.mine).toMatchObject({ name: "Moi", gap: null });
  });
  it("sans données ou fichier illisible : pas de total, ce n'est pas zéro", () => {
    const summary = closedSummary(closed(guesses), null);
    expect(summary.status).toBe("sans-donnees");
    expect(summary.etat).toEqual({ ton: "muted", mot: "Pas de données" });
    expect(summary.wins).toBeNull();
    expect(summary.closest).toEqual([]);
    expect(closestWords(summary.closest)).toBeNull();
  });
  it("sans pronostic du membre, ni aucun pronostic", () => {
    expect(closedSummary(closed([{ name: "A", wins: 1, mine: false }]), week(293, true)).mine).toBeNull();
    expect(closedSummary(closed([]), week(293, true))).toMatchObject({ guesses: [], closest: [], mine: null });
  });
  it("ne modifie pas la liste reçue", () => {
    const list = closed(guesses);
    const before = JSON.stringify(list);
    closedSummary(list, week(293, true));
    expect(JSON.stringify(list)).toBe(before);
  });
});

describe("le plus près, en mots", () => {
  const final = (list: ClosedWeek["guesses"], wins = 293) => closedSummary(closed(list), week(wins, true));

  it("un seul : son nom, son pronostic, son écart ; « vous » pour le membre", () => {
    expect(closestWords(final([{ name: "Tarvos", wins: 300, mine: false }]).closest)).toEqual({ label: "Le plus près", text: "Tarvos (300), écart de 7" });
    expect(closestWords(final([{ name: "Moi", wins: 280, mine: true }]).closest)).toEqual({ label: "Le plus près", text: "vous (280), écart de 13" });
  });
  it("à égalité : tous, l'écart dit une fois", () => {
    const two = final([
      { name: "Epona", wins: 290, mine: false },
      { name: "Moi", wins: 296, mine: true },
    ]);
    expect(closestWords(two.closest)).toEqual({ label: "Les plus près", text: "Epona (290) et vous (296), écart de 3 chacun" });
    const exact = final([
      { name: "A", wins: 293, mine: false },
      { name: "B", wins: 293, mine: false },
      { name: "C", wins: 293, mine: false },
    ]);
    expect(closestWords(exact.closest)).toEqual({ label: "Les plus près", text: "A (293), B (293) et C (293), exact" });
  });
  it("de grands nombres, écrits à la française", () => {
    expect(plain(closestWords(final([{ name: "A", wins: 9999, mine: false }], 1).closest)?.text)).toBe("A (9 999), écart de 9 998");
  });
  it("rien sur une semaine provisoire", () => {
    expect(closestWords(closedSummary(closed([{ name: "A", wins: 1, mine: false }]), week(5, false)).closest)).toBeNull();
  });
});

describe("le pronostic du membre et les écarts en mots", () => {
  it("l'écart seulement sur une semaine finale", () => {
    const guesses = [
      { name: "A", wins: 290, mine: false },
      { name: "Moi", wins: 299, mine: true },
    ];
    const finalMine = closedSummary(closed(guesses), week(293, true)).mine;
    const provisionalMine = closedSummary(closed(guesses), week(206, false)).mine;
    expect(finalMine && mineWords(finalMine)).toBe("299, écart de 6");
    expect(provisionalMine && mineWords(provisionalMine)).toBe("299");
  });
  it("exact, ou l'écart en victoires", () => {
    expect(gapWords(0)).toBe("exact");
    expect(gapWords(1)).toBe("écart de 1");
    expect(plain(gapWords(1250))).toBe("écart de 1 250");
  });
});

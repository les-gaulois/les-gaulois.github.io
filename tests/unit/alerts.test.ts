import { describe, expect, it } from "vitest";
import {
  AlertState,
  EMPTY_ALERT_STATE,
  alertHeadline,
  alertsStarted,
  gapParts,
  gapSentences,
  mapReading,
  markSent,
  parseAlertState,
  placeChange,
  planAlert,
  plainTag,
  rankReading,
  sourceLine,
  type PlaceAlert,
  type PlaceReading,
} from "../../src/lib/alerts";
import type { StoredClanMapFilm, StoredLeaderboard } from "../../src/lib/schemas";

const OTHERS = ["UN", "ITA", "AST", "NU", "EU", "JR"];
const entry = (clanTag: string, weightedWins: number) => ({ clanTag, games: 10, wins: 5, losses: 5, playerSessions: 20, weightedWins, weightedLosses: 1, weightedWLRatio: 1 });

/** Un classement où GAL est à la place `galRank`, calculé par OpenFront à `end` et relevé par le robot à `fetchedAt`. */
function board(end: string, galRank: number, fetchedAt = end): StoredLeaderboard {
  const tags = [...OTHERS];
  tags.splice(galRank - 1, 0, "GAL");
  return { start: "2026-08-10T07:27:13.816Z", end, fetchedAt, clans: tags.map((tag, i) => entry(tag, 3000 - i * 150.25)) };
}
const rankAt = (end: string, galRank: number, fetchedAt = end): PlaceReading => rankReading(board(end, galRank, fetchedAt), "GAL")!;

/** Un film réduit à ce que les alertes lisent : la place de GAL et l'ordre des clans. */
function film(fetchedAt: string, order: (string | null)[], rank: number | null = order.indexOf("GAL") + 1): StoredClanMapFilm {
  return {
    fetchedAt,
    galSummary: rank === null ? null : { rank },
    standings: order.map((tag, i) => ({ tag, color: 0x112233 * (i + 1), pixels: 400_000 - i * 50_000 })),
  } as unknown as StoredClanMapFilm;
}
const MAP_ORDER = ["LUX", "UN", "JR", "GAL", "AST", "ITA"];
const mapAt = (fetchedAt: string, order: (string | null)[] = MAP_ORDER): PlaceReading => mapReading(film(fetchedAt, order), "GAL")!;

// En novembre, Paris est à UTC+1 : 09:27Z est 10 h 27 à Paris.
const at = (iso: string) => new Date(iso);
/** Les espaces insécables des nombres français, remplacées pour comparer. */
const plain = (s: string) => s.replace(new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g"), " ");
const START: AlertState = { rank: { announced: 2, pending: null }, map: { announced: 4 }, sent: [] };

describe("rankReading", () => {
  it("prend la place dans l'ordre de la liste officielle, sans recalcul, et date le calcul d'OpenFront", () => {
    const reading = rankAt("2026-11-08T09:27:13.816Z", 2, "2026-11-08T09:31:52.241Z");
    expect(reading).toMatchObject({ kind: "rank", rank: 2, computedAt: "2026-11-08T09:27:13.816Z", fetchedAt: "2026-11-08T09:31:52.241Z" });
    expect(reading.above).toEqual({ tag: "UN", rank: 1, gap: 150.25 });
    expect(reading.below).toEqual({ tag: "ITA", rank: 3, gap: 150.25 });
  });
  it("montre cinq clans, GAL au milieu sauf en haut ou en bas de la liste", () => {
    expect(rankAt("2026-11-08T09:27:13.816Z", 2).rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(rankAt("2026-11-08T09:27:13.816Z", 4).rows.map((r) => r.rank)).toEqual([2, 3, 4, 5, 6]);
    const last = rankAt("2026-11-08T09:27:13.816Z", 7);
    expect(last.rows.map((r) => r.rank)).toEqual([3, 4, 5, 6, 7]);
    expect(last.rows.filter((r) => r.gal)).toEqual([{ rank: 7, tag: "GAL", value: 3000 - 6 * 150.25, color: null, gal: true }]);
    expect(last.below).toBeNull();
  });
  it("sans GAL dans la liste, ou sans liste, il n'y a pas de relevé", () => {
    const without = board("2026-11-08T09:27:13.816Z", 2);
    expect(rankReading({ ...without, clans: without.clans.filter((c) => c.clanTag !== "GAL") }, "GAL")).toBeNull();
    expect(rankReading(null, "GAL")).toBeNull();
  });
});

describe("mapReading", () => {
  it("prend la place de GAL sur la carte, les clans autour avec leur couleur, et les écarts en pixels", () => {
    const reading = mapAt("2026-11-07T17:00:01.344Z");
    expect(reading).toMatchObject({ kind: "map", rank: 4, fetchedAt: "2026-11-07T17:00:01.344Z", computedAt: "2026-11-07T17:00:01.344Z" });
    expect(reading.rows.map((r) => [r.rank, r.tag])).toEqual([[2, "UN"], [3, "JR"], [4, "GAL"], [5, "AST"], [6, "ITA"]]);
    expect(reading.rows[0]?.color).toBe(0x112233 * 2);
    expect(reading.above).toEqual({ tag: "JR", rank: 3, gap: 50_000 });
    expect(reading.below).toEqual({ tag: "AST", rank: 5, gap: 50_000 });
  });
  it("garde un clan supprimé depuis, sans lui inventer de nom", () => {
    const reading = mapAt("2026-11-07T17:00:01.344Z", ["LUX", "UN", null, "GAL", "AST"]);
    expect(reading.above?.tag).toBeNull();
    expect(plainTag(reading.above?.tag ?? null)).toBe("un clan supprimé");
  });
  it("sans pixel pour GAL, sans film, ou si le rang ne correspond pas à l'ordre des clans, il n'y a pas de relevé", () => {
    expect(mapReading(film("2026-11-07T17:00:01.344Z", ["LUX", "UN"], null), "GAL")).toBeNull();
    expect(mapReading(null, "GAL")).toBeNull();
    expect(mapReading(film("2026-11-07T17:00:01.344Z", MAP_ORDER, 3), "GAL")).toBeNull();
  });
});

describe("planAlert", () => {
  const readings = (rank: PlaceReading | null, map: PlaceReading | null = mapAt("2026-11-08T08:00:00.000Z")) => ({ rank, map });

  it("au premier passage, note les places du moment sans rien envoyer", () => {
    const plan = planAlert(null, readings(rankAt("2026-11-08T09:27:13.816Z", 2)), at("2026-11-08T09:31:52.241Z"));
    expect(plan.alert).toBeNull();
    expect(plan.reason).toContain("premier passage");
    expect(plan.state).toEqual(START);
    expect(AlertState.safeParse(plan.state).success).toBe(true);
  });
  it("n'envoie rien et ne change rien si aucune place n'a bougé", () => {
    const plan = planAlert(START, readings(rankAt("2026-11-08T09:27:13.816Z", 2)), at("2026-11-08T09:31:52.241Z"));
    expect(plan).toEqual({ state: START, alert: null, reason: "aucune place n'a changé" });
    expect(plan.state).toBe(START);
  });
  it("une nouvelle place au classement attend un second calcul d'OpenFront", () => {
    const plan = planAlert(START, readings(rankAt("2026-11-08T09:27:13.816Z", 3)), at("2026-11-08T09:31:52.241Z"));
    expect(plan.alert).toBeNull();
    expect(plan.state.rank).toEqual({ announced: 2, pending: { rank: 3, since: "2026-11-08T09:27:13.816Z" } });
    expect(plan.reason).toContain("3e en attente");
  });
  it("relire le même calcul ne confirme rien : OpenFront le garde une heure", () => {
    const first = planAlert(START, readings(rankAt("2026-11-08T09:27:13.816Z", 3)), at("2026-11-08T09:31:52.241Z"));
    const again = planAlert(first.state, readings(rankAt("2026-11-08T09:27:13.816Z", 3, "2026-11-08T09:53:30.000Z")), at("2026-11-08T09:53:30.000Z"));
    expect(again.alert).toBeNull();
    expect(again.state).toBe(first.state);
  });
  it("confirmée par le calcul suivant, la place part, avec la place annoncée d'avant", () => {
    const first = planAlert(START, readings(rankAt("2026-11-08T09:27:13.816Z", 3)), at("2026-11-08T09:31:52.241Z"));
    const next = rankAt("2026-11-08T10:28:05.000Z", 3, "2026-11-08T10:53:30.000Z");
    const plan = planAlert(first.state, readings(next), at("2026-11-08T10:53:31.000Z"));
    expect(plan.alert).toEqual({ kind: "rank", from: 2, reading: next });
  });
  it("une place qui fait le yo-yo d'un calcul à l'autre n'envoie rien", () => {
    let state = START;
    const ends = ["2026-11-08T09:27:00.000Z", "2026-11-08T10:28:00.000Z", "2026-11-08T11:29:00.000Z", "2026-11-08T12:30:00.000Z"];
    ends.forEach((end, i) => {
      const plan = planAlert(state, readings(rankAt(end, i % 2 === 0 ? 3 : 2)), at(end));
      expect(plan.alert).toBeNull();
      state = plan.state;
    });
    expect(state.rank).toEqual({ announced: 2, pending: null });
  });
  it("GAL 3e puis 4e a bien perdu sa 2e place : l'écart tient deux calculs, et l'alerte donne la dernière place", () => {
    const first = planAlert(START, readings(rankAt("2026-11-08T09:27:00.000Z", 3, "2026-11-08T09:31:00.000Z")), at("2026-11-08T09:31:00.000Z"));
    const fourth = rankAt("2026-11-08T10:28:00.000Z", 4, "2026-11-08T10:31:00.000Z");
    const other = planAlert(first.state, readings(fourth), at("2026-11-08T10:31:00.000Z"));
    expect(other.state.rank?.pending).toEqual({ rank: 4, since: "2026-11-08T09:27:00.000Z" });
    // Le robot ne lit en général chaque calcul qu'une fois : attendre de relire la 4e place ferait taire une chute continue.
    expect(other.alert).toEqual({ kind: "rank", from: 2, reading: fourth });
  });
  it("une chute continue, une place par calcul, est annoncée sans attendre qu'elle s'arrête", () => {
    let state = START;
    const sent: number[] = [];
    ["2026-11-08T09:27:00.000Z", "2026-11-08T10:28:00.000Z", "2026-11-08T11:29:00.000Z", "2026-11-08T12:30:00.000Z"].forEach((end, i) => {
      const fetchedAt = new Date(Date.parse(end) + 26 * 60_000).toISOString();
      const plan = planAlert(state, readings(rankAt(end, 3 + i, fetchedAt)), at(fetchedAt));
      state = plan.alert ? markSent(plan.state, plan.alert, at(fetchedAt)) : plan.state;
      if (plan.alert) sent.push(plan.alert.reading.rank);
    });
    // 3e, 4e : alerte « 4e ». Puis 5e, 6e : alerte « 6e ». Deux alertes, la limite du jour.
    expect(sent).toEqual([4, 6]);
  });
  it("de part et d'autre de la place annoncée, rien n'est prouvé : annoncé 3e, GAL lu 4e puis 2e n'envoie rien", () => {
    let state: AlertState = { ...START, rank: { announced: 3, pending: null } };
    const passes: [string, number, string][] = [
      ["2026-11-08T09:27:00.000Z", 4, "2026-11-08T09:31:00.000Z"],
      ["2026-11-08T09:27:00.000Z", 4, "2026-11-08T09:53:00.000Z"],
      ["2026-11-08T10:28:00.000Z", 2, "2026-11-08T10:31:00.000Z"],
      ["2026-11-08T10:28:00.000Z", 2, "2026-11-08T10:53:00.000Z"],
    ];
    for (const [end, place, fetchedAt] of passes) {
      const plan = planAlert(state, readings(rankAt(end, place, fetchedAt)), at(fetchedAt));
      expect(plan.alert).toBeNull();
      state = plan.state;
    }
    expect(state.rank?.pending).toEqual({ rank: 2, since: "2026-11-08T10:28:00.000Z" });
    // Le calcul suivant donne encore 2e : là, la 2e place a tenu deux calculs.
    const confirmed = rankAt("2026-11-08T11:29:00.000Z", 2, "2026-11-08T11:31:00.000Z");
    expect(planAlert(state, readings(confirmed), at("2026-11-08T11:31:00.000Z")).alert).toEqual({ kind: "rank", from: 3, reading: confirmed });
  });
  it("une place qui alterne entre deux nouvelles places est annoncée une fois, que le robot lise chaque calcul une ou deux fois", () => {
    // Un passage 26 minutes après chaque calcul d'OpenFront, ou deux, 3 et 26 minutes après.
    for (const delays of [[26], [3, 26]]) {
      let state = START;
      const sent: number[] = [];
      ["2026-11-08T09:27:00.000Z", "2026-11-08T10:28:00.000Z", "2026-11-08T11:29:00.000Z", "2026-11-08T12:30:00.000Z", "2026-11-08T13:31:00.000Z"].forEach((end, i) => {
        for (const delay of delays) {
          const fetchedAt = new Date(Date.parse(end) + delay * 60_000).toISOString();
          const plan = planAlert(state, readings(rankAt(end, i % 2 === 0 ? 3 : 4, fetchedAt)), at(fetchedAt));
          state = plan.alert ? markSent(plan.state, plan.alert, at(fetchedAt)) : plan.state;
          if (plan.alert) sent.push(plan.alert.reading.rank);
        }
      });
      // 3e, 4e : la 2e place est perdue, annoncée 4e. Ensuite, 3e puis 4e : retour à la place annoncée, rien ne part.
      expect(sent, `${delays.length} passage(s) par calcul`).toEqual([4]);
    }
  });
  it("la nuit aussi, l'alerte part dès le second calcul, sans attendre le matin", () => {
    // 2 h 30 et 3 h 30 à Paris : plus d'heures de silence depuis le 14 novembre 2026.
    const first = planAlert(START, readings(rankAt("2026-11-08T01:30:00.000Z", 3)), at("2026-11-08T01:31:00.000Z"));
    expect(first.alert).toBeNull();
    const second = rankAt("2026-11-08T02:30:00.000Z", 3);
    expect(planAlert(first.state, readings(second), at("2026-11-08T02:31:00.000Z")).alert).toEqual({ kind: "rank", from: 2, reading: second });
    // Revenue au second calcul : rien ne part.
    const back = planAlert(first.state, readings(rankAt("2026-11-08T02:30:00.000Z", 2)), at("2026-11-08T02:31:00.000Z"));
    expect(back.alert).toBeNull();
    expect(back.state.rank?.pending).toBeNull();
  });
  it("de 23 h à 8 h comme de jour", () => {
    const first = planAlert(START, readings(rankAt("2026-11-08T20:30:00.000Z", 3)), at("2026-11-08T20:31:00.000Z"));
    expect(planAlert(first.state, readings(rankAt("2026-11-08T21:31:00.000Z", 3)), at("2026-11-08T21:59:00.000Z")).alert).not.toBeNull();
    expect(planAlert(first.state, readings(rankAt("2026-11-08T22:01:00.000Z", 3)), at("2026-11-08T22:03:00.000Z")).alert).not.toBeNull();
  });
  it("au plus deux alertes par jour à Paris : la suivante attend le lendemain", () => {
    const busy: AlertState = { ...START, rank: { announced: 2, pending: { rank: 3, since: "2026-11-08T09:27:00.000Z" } }, sent: ["2026-11-08T08:23:00.000Z", "2026-11-08T12:53:00.000Z"] };
    const plan = planAlert(busy, readings(rankAt("2026-11-08T16:30:00.000Z", 3)), at("2026-11-08T16:31:00.000Z"));
    expect(plan.alert).toBeNull();
    expect(plan.reason).toContain("déjà 2 alertes");
    // Le lendemain à 8 h 23, la place est toujours la même : l'alerte part.
    expect(planAlert(busy, readings(rankAt("2026-11-09T07:20:00.000Z", 3)), at("2026-11-09T07:23:00.000Z")).alert?.kind).toBe("rank");
  });
  it("une seule alerte par passage : le classement d'abord, la carte au passage suivant", () => {
    const state: AlertState = { ...START, rank: { announced: 2, pending: { rank: 3, since: "2026-11-08T09:27:00.000Z" } } };
    const moved = mapAt("2026-11-08T10:00:00.000Z", ["LUX", "UN", "GAL", "JR", "AST"]);
    const plan = planAlert(state, readings(rankAt("2026-11-08T10:28:00.000Z", 3), moved), at("2026-11-08T10:31:00.000Z"));
    expect(plan.alert?.kind).toBe("rank");
    const after = markSent(plan.state, plan.alert!, at("2026-11-08T10:31:00.000Z"));
    const next = planAlert(after, readings(rankAt("2026-11-08T10:28:00.000Z", 3, "2026-11-08T10:53:00.000Z"), moved), at("2026-11-08T10:53:00.000Z"));
    expect(next.alert).toEqual({ kind: "map", from: 4, reading: moved });
  });
  it("n'envoie pas un relevé trop ancien : le classement a plus de deux heures, faute de collecte", () => {
    const state: AlertState = { ...START, rank: { announced: 2, pending: { rank: 3, since: "2026-11-08T07:27:00.000Z" } } };
    const old = rankAt("2026-11-08T08:28:00.000Z", 3, "2026-11-08T08:31:00.000Z");
    expect(planAlert(state, readings(old), at("2026-11-08T10:30:00.000Z")).alert).not.toBeNull();
    const plan = planAlert(state, readings(old), at("2026-11-08T10:32:00.000Z"));
    expect(plan.alert).toBeNull();
    expect(plan.reason).toContain("trop ancien");
  });
  it("la carte : chaque nouveau relevé est comparé à la dernière place annoncée, une seule fois", () => {
    const moved = mapAt("2026-11-08T12:53:00.000Z", ["LUX", "UN", "JR", "AST", "GAL"]);
    const plan = planAlert(START, readings(rankAt("2026-11-08T13:20:00.000Z", 2), moved), at("2026-11-08T13:23:00.000Z"));
    expect(plan.alert).toEqual({ kind: "map", from: 4, reading: moved });
    const after = markSent(plan.state, plan.alert!, at("2026-11-08T13:23:00.000Z"));
    expect(planAlert(after, readings(rankAt("2026-11-08T13:28:00.000Z", 2), moved), at("2026-11-08T13:53:00.000Z")).alert).toBeNull();
    // Un film de plus d'un jour ne part pas.
    expect(planAlert(START, readings(rankAt("2026-11-09T12:28:00.000Z", 2), moved), at("2026-11-09T13:00:00.000Z")).alert).toBeNull();
  });
  it("la carte attend le passage suivant, quand le site montre le nouveau relevé", () => {
    const moved = mapAt("2026-11-08T12:53:00.000Z", ["LUX", "UN", "JR", "AST", "GAL"]);
    const now = planAlert(START, readings(rankAt("2026-11-08T12:28:00.000Z", 2), moved), at("2026-11-08T12:54:00.000Z"));
    expect(now.alert).toBeNull();
    expect(now.reason).toContain("attend que le site");
    expect(now.state).toBe(START);
    expect(planAlert(START, readings(rankAt("2026-11-08T12:28:00.000Z", 2), moved), at("2026-11-08T13:08:00.000Z")).alert?.kind).toBe("map");
  });
  it("la carte aussi parle la nuit, et respecte la limite par jour", () => {
    // Relevée à 22 h 53 à Paris, regardée à 23 h 23.
    const late = mapAt("2026-11-08T21:53:00.000Z", ["LUX", "UN", "JR", "AST", "GAL"]);
    expect(planAlert(START, readings(null, late), at("2026-11-08T22:23:00.000Z")).alert).toEqual({ kind: "map", from: 4, reading: late });
    // Relevée à 15 h 53, regardée à 16 h 23, après deux alertes dans la journée.
    const busy: AlertState = { ...START, sent: ["2026-11-08T08:23:00.000Z", "2026-11-08T12:53:00.000Z"] };
    const capped = planAlert(busy, readings(null, mapAt("2026-11-08T14:53:00.000Z", ["LUX", "UN", "JR", "AST", "GAL"])), at("2026-11-08T15:23:00.000Z"));
    expect(capped.alert).toBeNull();
    expect(capped.reason).toContain("déjà 2 alertes");
  });
  it("un état sans place du classement la prend sans rien envoyer", () => {
    const noRank: AlertState = { rank: null, map: { announced: 4 }, sent: [] };
    const plan = planAlert(noRank, readings(rankAt("2026-11-08T09:27:00.000Z", 3)), at("2026-11-08T09:31:00.000Z"));
    expect(plan.alert).toBeNull();
    expect(plan.state.rank).toEqual({ announced: 3, pending: null });
  });
  it("une place disparue, faute de relevé, ne fait rien partir et ne change rien", () => {
    const pending: AlertState = { ...START, rank: { announced: 2, pending: { rank: 3, since: "2026-11-08T09:27:00.000Z" } } };
    const plan = planAlert(pending, readings(null, null), at("2026-11-08T10:31:00.000Z"));
    expect(plan.state).toBe(pending);
    expect(plan.reason).toBe("aucun relevé lisible");
  });
});

describe("alertsStarted", () => {
  it("attend la gazette du lundi 9 novembre 2026, pour qu'elle soit le premier message du salon", () => {
    expect(alertsStarted(null)).toBe(false);
    expect(alertsStarted("2026-10-26")).toBe(false);
    expect(alertsStarted("2026-11-02")).toBe(true);
    expect(alertsStarted("2026-11-09")).toBe(true);
  });
});

describe("parseAlertState", () => {
  it("sans fichier, c'est le premier passage", () => {
    expect(parseAlertState(null)).toEqual({ state: null, warning: null });
  });
  it("lit un état noté par le robot", () => {
    expect(parseAlertState(JSON.stringify(START))).toEqual({ state: START, warning: null });
  });
  it("un fichier illisible ne bloque pas les alertes pour toujours : les places du moment servent de nouveau départ, et un avertissement le dit", () => {
    for (const raw of ["{", "[]", JSON.stringify({ ...START, sent: ["hier"] }), JSON.stringify({ ...START, rank: { announced: 0, pending: null } })]) {
      const { state, warning } = parseAlertState(raw);
      expect(state).toBeNull();
      expect(warning).toContain("illisible");
    }
  });
});

describe("markSent", () => {
  it("annonce la nouvelle place, efface l'attente et compte l'envoi, sans garder ceux de plus de deux jours", () => {
    const state: AlertState = { ...START, rank: { announced: 2, pending: { rank: 3, since: "2026-11-08T09:27:00.000Z" } }, sent: ["2026-11-05T09:00:00.000Z", "2026-11-07T15:00:00.000Z"] };
    const alert: PlaceAlert = { kind: "rank", from: 2, reading: rankAt("2026-11-08T10:28:00.000Z", 3) };
    const after = markSent(state, alert, at("2026-11-08T10:31:00.000Z"));
    expect(after).toEqual({ rank: { announced: 3, pending: null }, map: { announced: 4 }, sent: ["2026-11-07T15:00:00.000Z", "2026-11-08T10:31:00.000Z"] });
    expect(AlertState.safeParse(after).success).toBe(true);
    expect(markSent(EMPTY_ALERT_STATE, { kind: "map", from: 4, reading: mapAt("2026-11-08T10:00:00.000Z", ["LUX", "GAL"]) }, at("2026-11-08T10:31:00.000Z")).map).toEqual({ announced: 2 });
  });
});

describe("les mots de l'alerte", () => {
  const rank = (from: number, to: number): PlaceAlert => ({ kind: "rank", from, reading: rankAt("2026-11-08T09:27:13.816Z", to) });

  it("dit si GAL monte ou recule, et où", () => {
    expect(alertHeadline(rank(3, 2), "GAL")).toBe("[GAL] monte à la 2e place du classement des clans");
    expect(alertHeadline(rank(2, 4), "GAL")).toBe("[GAL] recule à la 4e place du classement des clans");
    expect(alertHeadline(rank(2, 1), "GAL")).toBe("[GAL] monte à la 1re place du classement des clans");
    expect(alertHeadline({ kind: "map", from: 5, reading: mapAt("2026-11-07T17:00:01.344Z") }, "GAL")).toBe("[GAL] monte à la 4e place sur la carte des clans");
  });
  it("écrit le changement avec son signe, pas seulement sa couleur", () => {
    expect(placeChange(rank(3, 2))).toBe("+1 place");
    expect(placeChange(rank(2, 4))).toBe("−2 places");
  });
  it("donne d'abord l'avance après une montée, d'abord le retard après une baisse", () => {
    expect(gapParts(rank(3, 2), plainTag).map(plain)).toEqual(["150,25 d'avance sur [ITA], 3e", "150,25 de retard sur [UN], 1er"]);
    expect(gapParts(rank(1, 2), plainTag).map(plain)).toEqual(["150,25 de retard sur [UN], 1er", "150,25 d'avance sur [ITA], 3e"]);
    const map = gapParts({ kind: "map", from: 5, reading: mapAt("2026-11-07T17:00:01.344Z") }, plainTag).map(plain);
    expect(map).toEqual(["50 000 pixels d'avance sur [AST], 5e", "50 000 pixels de retard sur [JR], 3e"]);
  });
  it("écrit une phrase par écart : la virgule décimale ne se mêle pas aux séparateurs", () => {
    expect(plain(gapSentences(gapParts(rank(3, 2), plainTag)))).toBe("150,25 d'avance sur [ITA], 3e. 150,25 de retard sur [UN], 1er.");
    expect(gapSentences([])).toBe("");
  });
  it("à égalité, ne parle ni d'avance ni de retard", () => {
    const reading = rankAt("2026-11-08T09:27:13.816Z", 2);
    const tied: PlaceAlert = { kind: "rank", from: 3, reading: { ...reading, below: { tag: "ITA", rank: 3, gap: 0 } } };
    expect(gapParts(tied, plainTag)[0]).toBe("à égalité avec [ITA], 3e");
  });
  it("date le classement à l'heure du calcul d'OpenFront, à Paris, et dit ce que mesure la carte", () => {
    expect(sourceLine(rankAt("2026-11-08T09:27:13.816Z", 2, "2026-11-08T09:31:52.241Z"))).toBe(
      "Liste officielle d'OpenFront, arrêtée au 8 nov., 10:27. Score : victoires pondérées, demi-vie de 30 jours.",
    );
    expect(sourceLine(mapAt("2026-11-07T17:00:01.344Z"))).toBe("Carte au relevé du 7 nov., 18:00. Territoire en pixels, ce n'est pas le classement des clans.");
  });
});

import { describe, expect, it } from "vitest";
import {
  closesLabel,
  closestGuesses,
  clanGap,
  clanGoalSentence,
  clanWeekOf,
  ggPodium,
  isOfficialClan,
  liveHours,
  liveMine,
  memberOfPseudo,
  othersPlanned,
  parseQgTools,
  peakHour,
  planChoices,
  planLabel,
  planOthersLabel,
  predictionProblem,
  sameHour,
  voiceLinkOf,
  weekSpan,
  winsProgress,
  type WallMember,
} from "../../src/lib/compte/outils";
import type { StoredMember } from "../../src/lib/schemas";

const plain = (s: string | null) => s?.replace(/ | /g, " ") ?? null;
const AVATAR = "https://cdn.discordapp.com/avatars/123456789012345678/abcdef.png";

// Une réponse de get_qg_tools, telle que la migration 20261111000400_outils_du_qg.sql la construit.
const answer = {
  ok: true,
  me: { number: 7, pseudo: "PseudoUn", mentor: false, gg: 2 },
  voice: "https://discord.com/channels/123456789012345678/876543210987654321",
  plans: {
    mine: "2026-11-11T20:00:00+00:00",
    hours: [
      { at: "2026-11-11T21:00:00+00:00", count: 3, faces: [{ name: "Alpha", role: "member", avatar: AVATAR }] },
      { at: "2026-11-11T20:00:00+00:00", count: 1, faces: [] },
    ],
  },
  goal: { week: "2026-11-09", kind: "wins", wins: 300, clan: null },
  wall: [
    { name: "Chef", role: "founder", avatar: null, number: 1, gg: 0, given: false },
    { name: "Alpha", role: "member", avatar: AVATAR, number: 7, gg: 2, given: false },
  ],
  mentors: [{ name: "Bravo", role: "officer", avatar: null, discord: "bravo_42", mine: false }],
  predictions: {
    week: "2026-11-16",
    closes_at: "2026-11-17T23:00:00+00:00",
    mine: null,
    count: 4,
    closed: [{ week: "2026-11-09", closes_at: "2026-11-10T23:00:00+00:00", guesses: [{ name: "Alpha", wins: 280, mine: true }] }],
  },
};

describe("parseQgTools", () => {
  it("lit la réponse du serveur, heures rangées dans l'ordre", () => {
    const tools = parseQgTools(answer)!;
    expect(tools.me).toEqual({ number: 7, pseudo: "PseudoUn", mentor: false, gg: 2 });
    expect(tools.voice).toBe(answer.voice);
    expect(tools.plans.hours.map((h) => h.at)).toEqual(["2026-11-11T20:00:00+00:00", "2026-11-11T21:00:00+00:00"]);
    expect(tools.goal).toEqual({ week: "2026-11-09", kind: "wins", wins: 300 });
    expect(tools.wall[1]).toEqual({ name: "Alpha", role: "member", avatar: AVATAR, number: 7, gg: 2, given: false });
    expect(tools.mentors[0]).toEqual({ name: "Bravo", role: "officer", avatar: null, discord: "bravo_42", mine: false });
    expect(tools.predictions).toEqual({ week: "2026-11-16", closesAt: "2026-11-17T23:00:00+00:00", mine: null, count: 4, closed: [{ week: "2026-11-09", closesAt: "2026-11-10T23:00:00+00:00", guesses: [{ name: "Alpha", wins: 280, mine: true }] }] });
  });

  it("écarte ce qui est illisible plutôt que de le deviner", () => {
    const tools = parseQgTools({
      ...answer,
      voice: "https://exemple.com/channels/123456789012345678/876543210987654321",
      goal: { week: "2026-11-09", kind: "clan", clan: "<b>" },
      plans: { mine: "pas une date", hours: [{ at: "2026-11-11T21:00:00Z", count: 0, faces: [] }, { at: "x", count: 2, faces: [] }] },
      wall: [{ name: "Sans numéro", role: "member", avatar: null, gg: 1 }, { name: "Rôle inconnu", role: "roi", avatar: null, number: 3, gg: 0 }],
      mentors: [{ name: "Photo piégée", role: "member", avatar: "https://exemple.com/x.png", discord: "  ", mine: true }],
      predictions: { week: "lundi", closes_at: "x", count: 1 },
    })!;
    expect(tools.voice).toBeNull();
    expect(tools.goal).toBeNull();
    expect(tools.plans).toEqual({ mine: null, hours: [] });
    expect(tools.wall).toEqual([]);
    expect(tools.mentors).toEqual([{ name: "Photo piégée", role: "member", avatar: null, discord: null, mine: true }]);
    expect(tools.predictions).toBeNull();
  });

  it("rend null pour une réponse sans sa forme : le QG garde ses autres onglets", () => {
    expect(parseQgTools(null)).toBeNull();
    expect(parseQgTools({ ok: false, error: "not_validated" })).toBeNull();
    expect(parseQgTools({ ...answer, wall: null })).toBeNull();
  });
});

describe("le salon vocal", () => {
  it("ne garde qu'un lien de salon Discord, remis en forme comme le serveur", () => {
    expect(voiceLinkOf("https://discord.com/channels/123456789012345678/876543210987654321")).toBe("https://discord.com/channels/123456789012345678/876543210987654321");
    expect(voiceLinkOf("  https://ptb.discord.com/channels/123456789012345678/876543210987654321/ ")).toBe("https://discord.com/channels/123456789012345678/876543210987654321");
    expect(voiceLinkOf("https://discordapp.com/channels/123456789012345678/876543210987654321")).toBe("https://discord.com/channels/123456789012345678/876543210987654321");
    expect(voiceLinkOf("https://discord.com/channels/123456789012345678")).toBeNull();
    expect(voiceLinkOf("https://discord.com/api/webhooks/123456789012345678/abc")).toBeNull();
    expect(voiceLinkOf("http://discord.com/channels/123456789012345678/876543210987654321")).toBeNull();
    expect(voiceLinkOf("javascript:alert(1)")).toBeNull();
    expect(voiceLinkOf(42)).toBeNull();
  });
});

describe("Ce soir je joue", () => {
  // Mercredi 11 novembre 2026, 18 h 20 à Paris (17 h 20 UTC).
  const now = new Date("2026-11-11T17:20:00.000Z");

  it("propose l'heure en cours et les onze suivantes, à l'heure pile", () => {
    const choices = planChoices(now);
    expect(choices).toHaveLength(12);
    expect(choices[0]).toBe("2026-11-11T17:00:00.000Z");
    expect(choices[11]).toBe("2026-11-12T04:00:00.000Z");
    expect(choices.map((at) => planLabel(at, now)).slice(0, 4)).toEqual(["Maintenant", "19 h", "20 h", "21 h"]);
    expect(planLabel("2026-11-11T23:00:00.000Z", now)).toBe("0 h");
  });

  it("reconnaît la même heure, quelle que soit l'écriture de l'instant", () => {
    expect(sameHour("2026-11-11T20:00:00+00:00", "2026-11-11T20:00:00.000Z")).toBe(true);
    expect(sameHour("2026-11-11T20:00:00Z", "2026-11-11T21:00:00Z")).toBe(false);
    expect(sameHour(null, "2026-11-11T20:00:00Z")).toBe(false);
  });

  it("trouve l'heure où il y aura le plus de monde, la plus proche en cas d'égalité", () => {
    const hour = (at: string, count: number) => ({ at, count, faces: [] });
    expect(peakHour([hour("2026-11-11T19:00:00Z", 2), hour("2026-11-11T20:00:00Z", 4), hour("2026-11-11T21:00:00Z", 4)])?.at).toBe("2026-11-11T20:00:00Z");
    expect(peakHour([hour("2026-11-11T19:00:00Z", 1), hour("2026-11-11T20:00:00Z", 1)])).toBeNull();
    expect(peakHour([])).toBeNull();
  });

  it("compte les autres membres, sans soi, et oublie une heure finie", () => {
    const tools = parseQgTools(answer)!;
    const before = new Date("2026-11-11T19:30:00.000Z");
    expect(othersPlanned(tools.plans, before)).toBe(3);
    expect(othersPlanned({ ...tools.plans, mine: null }, before)).toBe(4);
    // 21 h 30 UTC : l'heure de 20 h, la sienne, est finie ; reste celle de 21 h.
    expect(othersPlanned(tools.plans, new Date("2026-11-11T21:30:00.000Z"))).toBe(3);
    expect(othersPlanned(tools.plans, new Date("2026-11-11T22:00:00.000Z"))).toBe(0);
  });

  it("ne garde que les heures pas encore finies, même la page restée ouverte", () => {
    const hours = parseQgTools(answer)!.plans.hours;
    expect(liveHours(hours, new Date("2026-11-11T20:59:59.000Z")).map((h) => h.at)).toEqual(["2026-11-11T20:00:00+00:00", "2026-11-11T21:00:00+00:00"]);
    expect(liveHours(hours, new Date("2026-11-11T21:00:00.000Z")).map((h) => h.at)).toEqual(["2026-11-11T21:00:00+00:00"]);
    expect(liveMine("2026-11-11T20:00:00+00:00", new Date("2026-11-11T20:30:00.000Z"))).toBe("2026-11-11T20:00:00+00:00");
    expect(liveMine("2026-11-11T20:00:00+00:00", new Date("2026-11-11T21:00:00.000Z"))).toBeNull();
    expect(liveMine(null, new Date())).toBeNull();
  });

  it("dit ceux qui ne se montrent pas, après les visages", () => {
    expect(planOthersLabel(3, 1)).toBe("et 2 autres membres");
    expect(planOthersLabel(2, 1)).toBe("et 1 autre membre");
    expect(planOthersLabel(3, 0)).toBeNull();
    expect(planOthersLabel(1, 0)).toBeNull();
    expect(planOthersLabel(2, 2)).toBeNull();
  });
});

describe("les GG", () => {
  const member = (name: string, gg: number): WallMember => ({ name, role: "member", avatar: null, number: name.length, gg, given: false });

  it("garde le podium, égalités comprises, sans ceux qui n'ont rien reçu", () => {
    expect(ggPodium([member("A", 1), member("B", 5), member("C", 0), member("D", 3)]).map((m) => m.name)).toEqual(["B", "D", "A"]);
    expect(ggPodium([member("A", 2), member("B", 2), member("C", 2), member("D", 2), member("E", 3)]).map((m) => m.name)).toEqual(["E", "A", "B", "C", "D"]);
    // Six lignes à égalité : la dernière place partagée ne tient pas, elle n'est pas montrée.
    expect(ggPodium([member("A", 9), member("B", 1), member("C", 1), member("D", 1), member("E", 1), member("F", 1)]).map((m) => m.name)).toEqual(["A"]);
    expect(ggPodium([member("A", 0)])).toEqual([]);
  });
});

describe("l'objectif de la semaine", () => {
  const weeks = [{ from: "2026-11-09", games: 120, wins: 75, complete: false }];

  it("mesure les victoires de la semaine de l'objectif", () => {
    expect(winsProgress(300, clanWeekOf(weeks, "2026-11-09"))).toEqual({ done: 75, target: 300, reached: false, share: 0.25 });
    expect(winsProgress(50, clanWeekOf(weeks, "2026-11-09"))).toEqual({ done: 75, target: 50, reached: true, share: 1 });
    expect(winsProgress(300, clanWeekOf(weeks, "2026-11-02"))).toBeNull();
  });

  it("calcule l'écart avec un clan du classement, au centième", () => {
    const clans = { end: "2026-11-11T16:43:11.548Z", scores: [{ tag: "UN", score: 10945.93 }, { tag: "GAL", score: 2308.7 }, { tag: "ITA", score: 2117.64 }] };
    expect(clanGap(clans, "GAL", "ITA")).toBe(191.06);
    expect(clanGap(clans, "GAL", "UN")).toBe(-8637.23);
    expect(clanGap(clans, "GAL", "XYZ")).toBeNull();
    expect(clanGap(null, "GAL", "ITA")).toBeNull();
    expect(plain(clanGoalSentence("ITA", 191.06))).toBe("191,06 d'avance sur ITA au score : à garder jusqu'à dimanche.");
    expect(plain(clanGoalSentence("UN", -8637.23))).toBe("8 637,23 de retard sur UN au score : à rattraper.");
    expect(clanGoalSentence("AST", 0)).toBe("À égalité de score avec AST.");
    expect(isOfficialClan(clans, "ITA")).toBe(true);
    expect(isOfficialClan(clans, "XYZ")).toBe(false);
    expect(isOfficialClan(null, "ITA")).toBe(false);
  });

  it("écrit la semaine", () => {
    expect(weekSpan("2026-11-16")).toBe("du 16 nov. au 22 nov.");
  });
});

describe("le pronostic", () => {
  it("dit la clôture comme un membre la lit, changement d'heure compris", () => {
    expect(closesLabel("2026-11-17T23:00:00+00:00")).toBe("jusqu'au mardi 17 nov. à minuit");
    expect(closesLabel("2026-03-31T22:00:00+00:00")).toBe("jusqu'au mardi 31 mars à minuit");
  });

  it("trouve les plus proches, tous en cas d'égalité", () => {
    const guesses = [
      { name: "A", wins: 280, mine: false },
      { name: "B", wins: 300, mine: true },
      { name: "C", wins: 320, mine: false },
    ];
    expect(closestGuesses(guesses, 297).map((g) => g.name)).toEqual(["B"]);
    expect(closestGuesses(guesses, 310).map((g) => g.name)).toEqual(["B", "C"]);
    expect(closestGuesses([], 10)).toEqual([]);
  });

  it("refuse ce qui n'est pas un nombre de victoires", () => {
    expect(predictionProblem("300")).toBeNull();
    expect(predictionProblem(" 0 ")).toBeNull();
    expect(plain(predictionProblem("-1"))).toBe("Indiquez un nombre de victoires, de 0 à 10 000.");
    expect(predictionProblem("12,5")).not.toBeNull();
    expect(predictionProblem("10001")).not.toBeNull();
    expect(predictionProblem("")).not.toBeNull();
  });
});

describe("Moi", () => {
  const member = (username: string | null, publicId: string | null): StoredMember => ({ role: "member", joinedAt: "2026-05-01T00:00:00.000Z", publicId, username, team: { wins: 1, losses: 0 } });

  it("retrouve le membre par son pseudo, s'il est le seul à le porter", () => {
    const list = [member("Alpha", "aaa"), member("Double", "bbb"), member("double", "ccc"), member(null, null)];
    expect(memberOfPseudo(list, "alpha")?.publicId).toBe("aaa");
    expect(memberOfPseudo(list, "Double")).toBeNull();
    expect(memberOfPseudo(list, "Absent")).toBeNull();
    expect(memberOfPseudo(list, null)).toBeNull();
  });
});

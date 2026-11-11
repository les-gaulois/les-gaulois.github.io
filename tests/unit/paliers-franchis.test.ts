import { describe, expect, it } from "vitest";
import {
  ANNOUNCED_TIERS,
  announcedTier,
  crossingWords,
  DISCORD_TIERS,
  discordTier,
  forgetMilestoneMembers,
  markMilestonesSent,
  MilestoneState,
  milestonePlayers,
  milestonesDue,
  namedTiers,
  observeMembers,
  othersWords,
  parseMilestoneState,
  periodWords,
  rescaleTiers,
} from "../../src/lib/paliers-franchis";
import type { StoredMember, StoredMembers } from "../../src/lib/schemas";

const member = (publicId: string | null, username: string | null, wins: number | null): StoredMember => ({
  role: "member",
  joinedAt: "2026-10-01T00:00:00.000Z",
  publicId,
  username,
  team: wins === null ? null : { wins, losses: 10 },
});
const list = (fetchedAt: string, members: StoredMember[]): StoredMembers => ({ fetchedAt, total: members.length, members });

// En novembre, Paris est à UTC+1.
const FIRST = "2026-11-08T01:53:38.580Z";
const SECOND = "2026-11-08T21:53:00.000Z";
const at = (iso: string) => new Date(iso);
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");

const before = list(FIRST, [member("a", "Alpha", 95), member("b", "Beta", 240), member("c", "Gamma", 990), member(null, null, 99), member("d", "Delta", 12)]);

describe("les paliers annoncés", () => {
  it("sur Discord, sont ceux du site à partir de 50 victoires depuis le 11 novembre 2026", () => {
    expect(DISCORD_TIERS).toEqual([50, 100, 250, 500, 1000, 2500, 5000]);
    expect([0, 49, 50, 99, 100, 249, 250, 5001].map(discordTier)).toEqual([0, 0, 50, 50, 100, 100, 250, 5000]);
  });
  it("dans le bilan de la semaine, restent ceux du site à partir de 100 victoires", () => {
    expect(ANNOUNCED_TIERS).toEqual([100, 250, 500, 1000, 2500, 5000]);
    expect([0, 99, 100, 249, 250, 999, 1000, 5001].map(announcedTier)).toEqual([0, 0, 100, 100, 250, 500, 1000, 5000]);
  });
  it("ne suivent que les membres avec pseudo, identifiant et stats : jamais un anonyme", () => {
    expect(namedTiers(list(FIRST, [member("a", "Alpha", 150), member(null, null, 300), member("x", null, 300), member("s", "SansStats", null)]))).toEqual({ a: 100 });
  });
});

describe("observeMembers", () => {
  it("au premier passage, note les paliers du moment sans rien mettre en attente", () => {
    expect(observeMembers(null, before)).toEqual({ reading: { at: FIRST, tiers: { a: 50, b: 100, c: 500, d: 0 } }, tiersFrom: 50, pending: null, lastSentOn: null });
  });
  it("à la relecture suivante, note chaque membre présent aux deux qui a franchi un palier, avec le plus haut franchi", () => {
    const start = observeMembers(null, before);
    const after = list(SECOND, [member("a", "Alpha", 101), member("b", "Beta", 520), member("c", "Gamma", 995), member(null, null, 130), member("d", "Delta", 60)]);
    const next = observeMembers(start, after);
    expect(next.pending).toEqual({ since: FIRST, until: SECOND, players: [{ id: "a", tier: 100 }, { id: "b", tier: 500 }, { id: "d", tier: 50 }] });
    expect(next.reading).toEqual({ at: SECOND, tiers: { a: 100, b: 500, c: 500, d: 50 } });
    expect(MilestoneState.safeParse(next).success).toBe(true);
  });
  it("un état noté à partir de 100 passe à 50 sans annoncer un palier de 50 passé on ne sait quand", () => {
    // Noté avant le 11 novembre 2026 : 0 voulait dire « moins de 100 victoires ».
    const old: MilestoneState = { reading: { at: FIRST, tiers: { a: 0, b: 100, e: 0, f: 0, g: 0 } }, pending: null, lastSentOn: null };
    const after = list(SECOND, [member("a", "Alpha", 97), member("b", "Beta", 260), member("e", "Epsilon", 55), member("f", "Phi", 130), member("g", "Gamma", 40)]);
    const next = observeMembers(old, after);
    expect(next.pending).toEqual({ since: FIRST, until: SECOND, players: [{ id: "b", tier: 250 }, { id: "f", tier: 100 }] });
    expect(next.reading.tiers).toEqual({ a: 50, b: 250, e: 50, f: 100, g: 0 });
    expect(next.tiersFrom).toBe(50);
    // Ensuite, un passage à 50 s'annonce comme les autres.
    const third = observeMembers({ ...next, pending: null }, list("2026-11-09T18:00:00.000Z", [member("g", "Gamma", 52)]));
    expect(third.pending?.players).toEqual([{ id: "g", tier: 50 }]);
  });
  it("le passage à 50 ne se fait qu'une fois, même sans nouvelle relecture", () => {
    const old: MilestoneState = { reading: { at: FIRST, tiers: { a: 0, b: 100 } }, pending: null, lastSentOn: null };
    const same = list(FIRST, [member("a", "Alpha", 95), member("b", "Beta", 240)]);
    const rescaled = observeMembers(old, same);
    expect(rescaled).toEqual({ ...old, reading: { at: FIRST, tiers: { a: 50, b: 100 } }, tiersFrom: 50 });
    expect(rescaleTiers(rescaled, same)).toBe(rescaled);
    expect(observeMembers(rescaled, same)).toBe(rescaled);
  });
  it("un nouveau membre, ou un pseudo apparu, n'a pas de point de départ : rien n'est noté pour lui", () => {
    const start = observeMembers(null, before);
    const after = list(SECOND, [...before.members, member("n", "Nouveau", 300), member("p", "PseudoNeuf", 1200)]);
    const next = observeMembers(start, after);
    expect(next.pending).toBeNull();
    expect(next.reading.tiers).toMatchObject({ n: 250, p: 1000 });
  });
  it("sans nouvelle relecture, ne change rien", () => {
    const start = observeMembers(null, before);
    expect(observeMembers(start, before)).toBe(start);
  });
  it("oublie à chaque passage un membre parti ou qui a retiré son pseudo, même en attente", () => {
    const start = observeMembers(null, before);
    const crossed = observeMembers(start, list(SECOND, [member("a", "Alpha", 101), member("b", "Beta", 520), member("c", "Gamma", 995)]));
    // Le même relevé, nettoyé d'heure en heure : Beta a supprimé son compte, Gamma a retiré son pseudo.
    const cleaned = observeMembers(crossed, list(SECOND, [member("a", "Alpha", 101), member("c", null, 995)]));
    expect(cleaned.reading.tiers).toEqual({ a: 100 });
    expect(cleaned.pending?.players).toEqual([{ id: "a", tier: 100 }]);
    // Plus personne en attente : plus rien à envoyer.
    expect(observeMembers(cleaned, list(SECOND, [])).pending).toBeNull();
  });
  it("garde les paliers en attente d'une relecture à l'autre, et la période part de la première", () => {
    const start = observeMembers(null, before);
    const first = observeMembers(start, list(SECOND, [member("a", "Alpha", 101), member("b", "Beta", 240), member("c", "Gamma", 990)]));
    const third = "2026-11-09T18:00:00.000Z";
    const next = observeMembers(first, list(third, [member("a", "Alpha", 260), member("b", "Beta", 251), member("c", "Gamma", 990)]));
    expect(next.pending).toEqual({ since: FIRST, until: third, players: [{ id: "a", tier: 250 }, { id: "b", tier: 250 }] });
  });
  it("ne note pas deux fois un palier, même si le chiffre recule puis remonte", () => {
    const start = observeMembers(null, list(FIRST, [member("a", "Alpha", 260)]));
    const down = observeMembers(start, list(SECOND, [member("a", "Alpha", 240)]));
    expect(down.reading.tiers).toEqual({ a: 250 });
    expect(observeMembers(down, list("2026-11-09T18:00:00.000Z", [member("a", "Alpha", 262)])).pending).toBeNull();
  });
  it("une liste plus ancienne que la dernière relecture ne compte pas comme une relecture", () => {
    const start = observeMembers(null, list(SECOND, [member("a", "Alpha", 95)]));
    expect(observeMembers(start, list(FIRST, [member("a", "Alpha", 150)]))).toBe(start);
  });
});

describe("milestonesDue", () => {
  const pending = { reading: { at: SECOND, tiers: { a: 100 } }, pending: { since: FIRST, until: SECOND, players: [{ id: "a", tier: 100 }] }, lastSentOn: null };

  it("sans palier en attente, rien ne part", () => {
    expect(milestonesDue({ ...pending, pending: null }, at("2026-11-09T10:00:00.000Z")).due).toBe(false);
  });
  it("jamais la nuit, de 23 h à 8 h à Paris", () => {
    expect(milestonesDue(pending, at("2026-11-08T22:01:00.000Z")).reason).toContain("la nuit");
    expect(milestonesDue(pending, at("2026-11-09T06:53:00.000Z")).due).toBe(false);
    expect(milestonesDue(pending, at("2026-11-09T07:23:00.000Z")).due).toBe(true);
  });
  it("un seul message par jour à Paris", () => {
    const sent = markMilestonesSent(pending, at("2026-11-09T09:23:00.000Z"));
    expect(sent).toEqual({ ...pending, pending: null, lastSentOn: "2026-11-09" });
    const again = { ...sent, pending: pending.pending };
    expect(milestonesDue(again, at("2026-11-09T21:53:00.000Z")).reason).toContain("déjà un message aujourd'hui");
    expect(milestonesDue(again, at("2026-11-10T07:23:00.000Z")).due).toBe(true);
  });
  it("attend que le site montre les nouveaux paliers : le passage suivant la relecture", () => {
    // Liste relue à 10 h 53 à Paris.
    const fresh = { ...pending, pending: { ...pending.pending, until: "2026-11-09T09:53:00.000Z" } };
    const soon = milestonesDue(fresh, at("2026-11-09T09:58:00.000Z"));
    expect(soon.due).toBe(false);
    expect(soon.reason).toContain("attend que le site");
    expect(milestonesDue(fresh, at("2026-11-09T10:53:00.000Z")).due).toBe(true);
  });
});

describe("forgetMilestoneMembers", () => {
  it("oublie un membre parti ou sans pseudo, même en attente, et ne change rien sinon", () => {
    const state = { reading: { at: SECOND, tiers: { a: 100, b: 250, c: 0 } }, pending: { since: FIRST, until: SECOND, players: [{ id: "a", tier: 100 }, { id: "b", tier: 250 }] }, lastSentOn: null };
    expect(forgetMilestoneMembers(state, new Set(["a", "b", "c"]))).toBe(state);
    expect(forgetMilestoneMembers(state, new Set(["a", "c"]))).toEqual({ ...state, reading: { at: SECOND, tiers: { a: 100, c: 0 } }, pending: { since: FIRST, until: SECOND, players: [{ id: "a", tier: 100 }] } });
    expect(forgetMilestoneMembers(state, new Set(["c"])).pending).toBeNull();
  });
});

describe("milestonePlayers", () => {
  it("cite le pseudo du moment, du plus haut palier au plus bas, puis par ordre alphabétique, et oublie qui n'a plus de pseudo", () => {
    const now = list(SECOND, [member("a", "Zoé", 101), member("b", "Éloïse", 120), member("c", "Marc", 600), member("d", null, 300)]);
    const pending = { since: FIRST, until: SECOND, players: [{ id: "a", tier: 100 }, { id: "b", tier: 100 }, { id: "c", tier: 500 }, { id: "d", tier: 250 }] };
    expect(milestonePlayers(pending, now).map((p) => [p.username, p.tier])).toEqual([["Marc", 500], ["Éloïse", 100], ["Zoé", 100]]);
  });
  it("ne cite pas un joueur repassé sous son palier depuis, ni un joueur sans stats", () => {
    const now = list(SECOND, [member("a", "Alpha", 240), member("b", "Beta", null), member("c", "Gamma", 251)]);
    const pending = { since: FIRST, until: SECOND, players: [{ id: "a", tier: 250 }, { id: "b", tier: 100 }, { id: "c", tier: 250 }] };
    expect(milestonePlayers(pending, now).map((p) => p.username)).toEqual(["Gamma"]);
  });
});

describe("parseMilestoneState", () => {
  it("lit l'état, et repart des paliers du moment s'il est illisible, avec un avertissement", () => {
    const state = observeMembers(null, before);
    expect(parseMilestoneState(JSON.stringify(state))).toEqual({ state, warning: null });
    expect(parseMilestoneState(null)).toEqual({ state: null, warning: null });
    for (const raw of ["{", "[]", JSON.stringify({ ...state, lastSentOn: "hier" }), JSON.stringify({ ...state, pending: { since: FIRST, until: SECOND, players: [] } })]) {
      expect(parseMilestoneState(raw).warning).toContain("illisible");
    }
  });
});

describe("les mots du message", () => {
  it("disent le palier, la période à l'heure de Paris, et comptent les autres", () => {
    expect(plain(crossingWords(1000))).toBe("passe le cap des 1 000 victoires");
    expect(periodWords({ since: FIRST, until: SECOND })).toBe("entre les relevés de la liste des membres du 8 nov., 02:53 et du 8 nov., 22:53");
    expect(othersWords(1)).toBe("Et 1 autre membre.");
    expect(othersWords(3)).toBe("Et 3 autres membres.");
  });
});

import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { activeDue, activePlayers, activeReading, ActiveState, forgetActiveMembers, MAX_PERIOD_MS, type ActiveReading } from "../../src/lib/actifs";
import { activeContent, activePass, activePayload, sendActive, type ActivePassDeps } from "../../src/lib/actifs-discord";
import { activeCard, activeImageAlt } from "../../src/lib/actifs-image";
import { GazetteFonts, renderGazetteCard, type CardText, type GazetteCard, type Measure } from "../../src/lib/gazette-image";
import type { StoredMember, StoredMembers } from "../../src/lib/schemas";

const WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_123";
const SITE = "https://x.test/";
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
/** Une largeur approchée, pour tester la mise en page sans police. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);

const member = (publicId: string | null, username: string | null, wins: number, losses: number): StoredMember => ({ role: "member", joinedAt: "2026-10-01T00:00:00.000Z", publicId, username, team: { wins, losses } });
const list = (fetchedAt: string, members: StoredMember[]): StoredMembers => ({ fetchedAt, total: members.length, members });

// En novembre, Paris est à UTC+1.
const T0 = "2026-11-10T17:54:00.000Z";
const T1 = "2026-11-11T13:54:00.000Z";
const BASE: ActiveReading = { at: T0, games: { a: 100, b: 50, c: 30, d: 10, e: 5 }, wins: { a: 60, b: 30, c: 20, d: 5, e: 2 } };
const NOW_LIST = list(T1, [
  member("a", "Alpha", 80, 60),
  member("b", "Beta", 40, 30),
  member("c", "Gamma", 25, 15),
  member("d", "Delta", 15, 15),
  member("e", "Epsilon", 2, 3),
  // Arrivé depuis le relevé de départ : pas de point de départ, pas compté.
  member("f", "Nouveau", 300, 300),
  member(null, null, 500, 500),
]);
const STATE: ActiveState = { base: BASE, lastSentOn: "2026-11-10" };
const PERIOD = { since: T0, until: T1 };
const PLAYERS = activePlayers(BASE, NOW_LIST);

/** Rien ne sort de l'image, et deux textes de la même ligne ne se chevauchent pas. */
function expectClean(card: GazetteCard): void {
  const leftOf = (t: CardText) => (t.anchor === "end" ? t.x - measure(t.text, t.font, t.size) : t.anchor === "middle" ? t.x - measure(t.text, t.font, t.size) / 2 : t.x);
  const rightOf = (t: CardText) => leftOf(t) + measure(t.text, t.font, t.size);
  for (const t of card.texts) {
    expect(leftOf(t), t.text).toBeGreaterThanOrEqual(0);
    expect(rightOf(t), t.text).toBeLessThanOrEqual(card.width);
    expect(t.y, t.text).toBeLessThanOrEqual(card.height);
  }
  for (const a of card.texts) {
    for (const b of card.texts) {
      if (a === b || a.y !== b.y) continue;
      expect(rightOf(a) <= leftOf(b) || rightOf(b) <= leftOf(a), `« ${a.text} » et « ${b.text} » se chevauchent`).toBe(true);
    }
  }
}

describe("activePlayers", () => {
  it("garde le podium des parties jouées entre les deux relevés, avec les victoires, et partage les places à égalité", () => {
    expect(PLAYERS).toEqual([
      { id: "a", username: "Alpha", games: 40, wins: 20, place: 1 },
      { id: "b", username: "Beta", games: 20, wins: 10, place: 2 },
      { id: "d", username: "Delta", games: 20, wins: 10, place: 2 },
    ]);
  });
  it("un relevé de départ sans les victoires d'un joueur ne lui en invente pas : il n'est pas cité", () => {
    const damaged = { ...BASE, wins: { b: 30, c: 20, d: 5, e: 2 } };
    expect(activePlayers(damaged, NOW_LIST).map((p) => p.id)).toEqual(["b", "d"]);
  });
  it("ne compte ni un nouveau membre, ni un anonyme, ni un membre qui n'a pas joué", () => {
    const ids = activePlayers(BASE, NOW_LIST).map((p) => p.id);
    expect(ids).not.toContain("f");
    expect(ids).not.toContain("e");
    expect(activeReading(NOW_LIST).games).not.toHaveProperty("null");
  });
});

describe("activeDue", () => {
  const due = (now: string, members: StoredMembers = NOW_LIST, state: ActiveState = STATE) => activeDue(state, members, new Date(now));
  it("part dès 17 h à Paris, une fois par jour, après un nouveau relevé", () => {
    expect(due("2026-11-11T16:53:00.000Z")).toEqual({ due: true, reason: "", restart: false });
    expect(due("2026-11-11T14:53:00.000Z").reason).toBe("le message part à partir de 17 h");
    expect(due("2026-11-11T16:53:00.000Z", NOW_LIST, { ...STATE, lastSentOn: "2026-11-11" }).reason).toContain("déjà un message aujourd'hui");
    // 23 h 53 à Paris : plus d'heures de silence depuis le 14 novembre 2026. Après minuit, le message du jour attend 17 h.
    expect(due("2026-11-11T22:53:00.000Z")).toEqual({ due: true, reason: "", restart: false });
    expect(due("2026-11-11T23:53:00.000Z").reason).toBe("le message part à partir de 17 h");
  });
  it("sans nouveau relevé, rien ne part", () => {
    expect(due("2026-11-11T16:53:00.000Z", list(T0, NOW_LIST.members)).reason).toBe("pas de nouveau relevé de la liste depuis le dernier message");
  });
  it("attend que le site montre le nouveau relevé", () => {
    expect(due("2026-11-11T16:53:00.000Z", list("2026-11-11T16:50:00.000Z", NOW_LIST.members)).reason).toBe("le message attend que le site montre le nouveau relevé");
  });
  it("une période de plus de trois jours n'est pas envoyée : nouveau départ", () => {
    const old = { ...STATE, base: { ...BASE, at: new Date(Date.parse(T1) - MAX_PERIOD_MS - 60_000).toISOString() } };
    expect(due("2026-11-11T16:53:00.000Z", NOW_LIST, old)).toMatchObject({ due: false, restart: true });
  });
});

describe("forgetActiveMembers", () => {
  it("oublie un membre parti ou sans pseudo, et ne change rien sinon", () => {
    expect(forgetActiveMembers(STATE, new Set(["a", "b", "c", "d", "e"]))).toBe(STATE);
    expect(forgetActiveMembers(STATE, new Set(["a"]))).toEqual({ ...STATE, base: { at: T0, games: { a: 100 }, wins: { a: 60 } } });
  });
});

describe("le message", () => {
  it("cite chaque joueur, relié à sa fiche, avec ses parties, ses victoires et la période, et ne peut mentionner personne", () => {
    expect(plain(activeContent(PLAYERS, PERIOD, "GAL", SITE)).split("\n")).toEqual([
      "**Les plus actifs chez [GAL]**",
      "🥇 [**Alpha**](<https://x.test/membres/a/>) : 40 parties, 20 victoires",
      "🥈 [**Beta**](<https://x.test/membres/b/>) : 20 parties, 10 victoires",
      "🥈 [**Delta**](<https://x.test/membres/d/>) : 20 parties, 10 victoires",
      "[Voir les membres du clan](<https://x.test/liste/>)",
      "-# Parties en équipe sous le tag, entre les relevés de la liste des membres du 10 nov., 18:54 et du 11 nov., 14:54. Membres avec pseudo public seulement. Compte le temps de jeu, pas le niveau.",
    ]);
    expect(activePayload(PLAYERS, PERIOD, "GAL", SITE, null)).toMatchObject({ allowed_mentions: { parse: [] } });
  });
  it("un pseudo ne peut ni mettre en forme le message ni y glisser un lien", () => {
    const tricky = [{ id: "z", username: "**@everyone** [lien](https://pirate.test)", games: 3, wins: 1, place: 1 }];
    const content = activeContent(tricky, PERIOD, "GAL", SITE);
    expect(content).not.toContain("**@everyone**");
    expect(content).not.toContain("](https://pirate.test)");
  });
  it("avec l'image : un seul joueur, le bouton ouvre sa fiche ; plusieurs, la page des membres", () => {
    const image = { alt: "Description.", filename: "plus-actifs.png" };
    expect(activePayload(PLAYERS.slice(0, 1), PERIOD, "GAL", SITE, image)).toMatchObject({ components: [{ type: 1, components: [{ label: "Voir la fiche de Alpha", url: "https://x.test/membres/a/" }] }] });
    // Le message est l'image seule, avec son bouton : aucun texte ne l'accompagne.
    expect(activePayload(PLAYERS, PERIOD, "GAL", SITE, image)).toEqual({
      avatar_url: "https://x.test/generated/icon-192.png",
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: "plus-actifs.png", description: "Description." }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir les membres du clan", url: "https://x.test/liste/" }] }],
    });
  });
  it("part en texte si l'image ne se dessine pas, et n'écrit jamais le lien", async () => {
    const logs: string[] = [];
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await sendActive({ link: WEBHOOK, players: PLAYERS, period: PERIOD, renderImage: () => Promise.reject(new Error("police")), tag: "GAL", siteUrl: SITE, fetch: fetch as unknown as typeof globalThis.fetch, log: (l) => logs.push(l) })).toBe(true);
    for (const line of logs) expect(line).not.toContain("abc-DEF_123");
  });
});

describe("activePass", () => {
  const NOW = new Date("2026-11-11T16:53:00.000Z");
  const setup = (over: Partial<ActivePassDeps> = {}) => {
    const logs: string[] = [];
    const send = vi.fn(async () => true);
    const deps: ActivePassDeps = { stored: STATE, members: NOW_LIST, gazetteLastSent: "2026-11-02", now: NOW, send, log: (l) => logs.push(l), ...over };
    return { deps, logs, send };
  };
  it("au premier passage, le relevé du moment sert de départ : rien n'est envoyé", async () => {
    const { deps, send } = setup({ stored: null });
    expect(await activePass(deps)).toEqual({ state: { base: activeReading(NOW_LIST), lastSentOn: null }, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("envoie le podium avec sa période, puis la liste du moment devient le départ", async () => {
    const { deps, send } = setup();
    expect(await activePass(deps)).toEqual({ state: { base: activeReading(NOW_LIST), lastSentOn: "2026-11-11" }, failed: false });
    expect(send).toHaveBeenCalledWith(PLAYERS, PERIOD);
  });
  it("après un refus de Discord, garde le départ : le passage suivant réessaie", async () => {
    const { deps } = setup({ send: async () => false });
    expect(await activePass(deps)).toEqual({ state: null, failed: true });
  });
  it("hors de l'heure, ne change que ce qu'il faut oublier", async () => {
    const { deps, send } = setup({ now: new Date("2026-11-11T14:53:00.000Z"), stored: { ...STATE, base: { ...BASE, games: { ...BASE.games, parti: 4 }, wins: { ...BASE.wins, parti: 1 } } } });
    expect(await activePass(deps)).toEqual({ state: STATE, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("si personne n'a joué, rien ne part et le relevé du moment devient le départ", async () => {
    const still = list(T1, [member("a", "Alpha", 60, 40), member("b", "Beta", 30, 20)]);
    const { deps, send } = setup({ members: still, stored: { base: { at: T0, games: { a: 100, b: 50 }, wins: { a: 60, b: 30 } }, lastSentOn: null } });
    expect(await activePass(deps)).toEqual({ state: { base: activeReading(still), lastSentOn: null }, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("après une trop longue période, repart du relevé du moment sans rien envoyer", async () => {
    const { deps, send } = setup({ stored: { ...STATE, base: { ...BASE, at: "2026-11-06T10:00:00.000Z" } } });
    expect((await activePass(deps)).state).toEqual({ base: activeReading(NOW_LIST), lastSentOn: "2026-11-10" });
    expect(send).not.toHaveBeenCalled();
  });
  it("avant la gazette du lundi 9 novembre, ou sans liste lisible, ne fait rien", async () => {
    for (const over of [{ gazetteLastSent: "2026-10-26" }, { members: null }]) {
      const { deps, send } = setup(over);
      expect(await activePass(deps)).toEqual({ state: null, failed: false });
      expect(send).not.toHaveBeenCalled();
    }
  });
  it("l'état noté se relit", () => {
    expect(ActiveState.safeParse({ base: activeReading(NOW_LIST), lastSentOn: "2026-11-11" }).success).toBe(true);
  });
});

describe("activeCard", () => {
  it("écrit le titre, la période et chaque joueur avec sa place, ses parties et ses victoires, sans rien faire déborder", () => {
    const card = activeCard(PLAYERS, PERIOD, "GAL", SITE, measure);
    const texts = card.texts.map((t) => plain(t.text));
    // L'en-tête dit qui est compté : sans texte dans le message, « 1er » se lirait comme le plus actif de tout le clan.
    for (const expected of ["Parties en équipe sous le tag [GAL], membres avec pseudo public", "Les plus actifs", "Entre les relevés de la liste du 10 nov., 18:54 et du 11 nov., 14:54", "1er", "Alpha", "40 parties, 20 victoires", "2e", "Delta", "x.test/liste", "Compte le temps de jeu, pas le niveau."]) {
      expect(texts).toContain(expected);
    }
    expectClean(card);
  });
  it("de longs pseudos ne débordent pas", () => {
    const long = ["Capitaine Barbe GOAT.7362", "ROYAUME DES MOUETTES.9917", "WWWWWWWWWWWWWWWW", "lechevalier2fer.6301", "Иван Петрович"].map((username, i) => ({ id: `${i}`, username, games: 1234, wins: 999, place: i + 1 }));
    expectClean(activeCard(long, PERIOD, "GAL", SITE, measure));
  });
  it("dit l'essentiel à un lecteur d'écran", () => {
    expect(plain(activeImageAlt(PLAYERS.slice(0, 1), PERIOD, "GAL"))).toBe(
      "Les plus actifs chez [GAL], parties en équipe sous le tag, entre les relevés de la liste des membres du 10 nov., 18:54 et du 11 nov., 14:54. 1er, Alpha : 40 parties, 20 victoires. Membres avec pseudo public seulement. Compte le temps de jeu, pas le niveau.",
    );
  });
  it("se dessine avec les polices du site", async () => {
    const root = process.cwd();
    const fonts = new GazetteFonts(root);
    const card = activeCard(PLAYERS, PERIOD, "GAL", SITE, fonts.width);
    expect(await sharp(await renderGazetteCard(card, fonts, root)).metadata()).toMatchObject({ width: card.width, height: card.height, format: "png" });
  });
});

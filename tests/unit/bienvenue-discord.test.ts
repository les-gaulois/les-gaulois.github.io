import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { arrivalsSince, sendWelcome, welcomeContent, welcomeDue, welcomePass, welcomePayload, WelcomeState, type WelcomePassDeps } from "../../src/lib/bienvenue-discord";
import { welcomeCard, welcomeImageAlt } from "../../src/lib/bienvenue-image";
import { GazetteFonts, renderGazetteCard, type CardText, type GazetteCard, type Measure } from "../../src/lib/gazette-image";
import { MAX_NAMES } from "../../src/lib/paliers-franchis-discord";
import type { StoredMember, StoredMembers } from "../../src/lib/schemas";

const WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_123";
const SITE = "https://x.test/";
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
/** Une largeur approchée, pour tester la mise en page sans police. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);

const member = (publicId: string | null, username: string | null, joinedAt: string): StoredMember => ({ role: "member", joinedAt, publicId, username, team: { wins: 1, losses: 1 } });
const list = (fetchedAt: string, members: StoredMember[]): StoredMembers => ({ fetchedAt, total: members.length, members });

// En novembre, Paris est à UTC+1.
const T0 = "2026-11-10T17:54:00.000Z";
const T1 = "2026-11-11T13:54:00.000Z";
const NOW_LIST = list(T1, [
  member("old", "Ancien", "2026-10-01T00:00:00.000Z"),
  // Pile au relevé de départ : déjà dans ce relevé, donc déjà passé.
  member("edge", "Pile", T0),
  member("z", "Zoé", "2026-11-11T09:12:00.000Z"),
  member("e", "Éloïse", "2026-11-10T20:12:00.000Z"),
  member(null, null, "2026-11-11T01:00:00.000Z"),
  member(null, null, "2026-11-11T02:00:00.000Z"),
]);
const STATE: WelcomeState = { until: T0, lastSentOn: "2026-11-10" };
const ARRIVALS = arrivalsSince(NOW_LIST, T0);

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

describe("arrivalsSince", () => {
  it("prend les arrivées entre les deux relevés, cite les pseudos dans l'ordre d'arrivée et compte les anonymes", () => {
    expect(ARRIVALS).toEqual({
      since: T0,
      until: T1,
      named: [
        { id: "e", username: "Éloïse", joinedAt: "2026-11-10T20:12:00.000Z" },
        { id: "z", username: "Zoé", joinedAt: "2026-11-11T09:12:00.000Z" },
      ],
      anonymous: 2,
    });
  });
});

describe("welcomeDue", () => {
  const due = (now: string, members: StoredMembers = NOW_LIST, state: WelcomeState = STATE) => welcomeDue(state, members, new Date(now));
  it("part dès 12 h à Paris, une fois par jour, après un nouveau relevé que le site montre", () => {
    expect(due("2026-11-11T14:53:00.000Z")).toEqual({ due: true, reason: "" });
    expect(due("2026-11-11T10:53:00.000Z").reason).toBe("le message part à partir de 12 h");
    expect(due("2026-11-11T14:53:00.000Z", NOW_LIST, { ...STATE, lastSentOn: "2026-11-11" }).reason).toContain("déjà un message aujourd'hui");
    expect(due("2026-11-11T14:53:00.000Z", list(T0, NOW_LIST.members)).reason).toBe("pas de nouveau relevé de la liste depuis le dernier message");
    expect(due("2026-11-11T14:00:00.000Z", list("2026-11-11T13:55:00.000Z", NOW_LIST.members)).reason).toBe("le message attend que le site montre les fiches des nouveaux");
  });
});

describe("le message", () => {
  it("accueille chaque pseudo, relié à sa fiche, compte les anonymes, et ne peut mentionner personne", () => {
    expect(plain(welcomeContent(ARRIVALS, "GAL", SITE).content).split("\n")).toEqual([
      "**Bienvenue chez les Gaulois !**",
      "👋 [**Éloïse**](<https://x.test/membres/e/>)",
      "👋 [**Zoé**](<https://x.test/membres/z/>)",
      "Et 2 joueurs sans pseudo public.",
      "[Voir les membres du clan](<https://x.test/membres/>)",
      "-# Arrivées dans le clan [GAL] entre les relevés de la liste des membres du 10 nov., 18:54 et du 11 nov., 14:54, de ceux qui sont encore là au dernier relevé.",
    ]);
    expect(welcomePayload(ARRIVALS, "GAL", SITE, null)).toMatchObject({ allowed_mentions: { parse: [] } });
  });
  it("sans pseudo, une phrase entière ; un seul anonyme au singulier", () => {
    const content = (anonymous: number) => welcomeContent({ ...ARRIVALS, named: [], anonymous }, "GAL", SITE).content;
    expect(content(1)).toContain("\n1 joueur sans pseudo public a rejoint le clan.\n");
    expect(content(3)).toContain("\n3 joueurs sans pseudo public ont rejoint le clan.\n");
  });
  it("au-delà de quinze pseudos, compte les autres", () => {
    const named = Array.from({ length: MAX_NAMES + 3 }, (_, i) => ({ id: `${i}`, username: `Joueur${i}`, joinedAt: T1 }));
    const { content, written } = welcomeContent({ ...ARRIVALS, named, anonymous: 0 }, "GAL", SITE);
    expect(written).toBe(MAX_NAMES);
    expect(content).toContain("Et 3 autres membres avec pseudo.");
  });
  it("avec l'image : le fichier joint et un bouton vers les membres", () => {
    expect(welcomePayload(ARRIVALS, "GAL", SITE, { alt: "Description.", filename: "bienvenue.png" })).toMatchObject({
      attachments: [{ id: 0, filename: "bienvenue.png", description: "Description." }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir les membres du clan", url: "https://x.test/membres/" }] }],
    });
  });
  it("part en texte si l'image ne se dessine pas, et n'écrit jamais le lien", async () => {
    const logs: string[] = [];
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await sendWelcome({ link: WEBHOOK, arrivals: ARRIVALS, renderImage: () => Promise.reject(new Error("police")), tag: "GAL", siteUrl: SITE, fetch: fetch as unknown as typeof globalThis.fetch, log: (l) => logs.push(l) })).toBe(true);
    for (const line of logs) expect(line).not.toContain("abc-DEF_123");
  });
});

describe("welcomePass", () => {
  const NOW = new Date("2026-11-11T14:53:00.000Z");
  const setup = (over: Partial<WelcomePassDeps> = {}) => {
    const logs: string[] = [];
    const send = vi.fn(async () => true);
    const deps: WelcomePassDeps = { stored: STATE, members: NOW_LIST, gazetteLastSent: "2026-11-02", now: NOW, send, log: (l) => logs.push(l), ...over };
    return { deps, logs, send };
  };
  it("au premier passage, le relevé du moment sert de départ : rien n'est envoyé", async () => {
    const { deps, send } = setup({ stored: null });
    expect(await welcomePass(deps)).toEqual({ state: { until: T1, lastSentOn: null }, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("accueille les arrivées, puis note le relevé et le jour", async () => {
    const { deps, send } = setup();
    expect(await welcomePass(deps)).toEqual({ state: { until: T1, lastSentOn: "2026-11-11" }, failed: false });
    expect(send).toHaveBeenCalledWith(ARRIVALS);
  });
  it("après un refus de Discord, ne note rien : le passage suivant réessaie", async () => {
    const { deps } = setup({ send: async () => false });
    expect(await welcomePass(deps)).toEqual({ state: null, failed: true });
  });
  it("sans arrivée, rien ne part, et le relevé est noté sans prendre le message du jour", async () => {
    const { deps, send } = setup({ members: list(T1, [member("old", "Ancien", "2026-10-01T00:00:00.000Z")]) });
    expect(await welcomePass(deps)).toEqual({ state: { until: T1, lastSentOn: "2026-11-10" }, failed: false });
    expect(send).not.toHaveBeenCalled();
  });
  it("hors de l'heure, ou avant la gazette du lundi 9 novembre, ou sans liste lisible, ne change rien", async () => {
    for (const over of [{ now: new Date("2026-11-11T09:53:00.000Z") }, { gazetteLastSent: "2026-10-26" }, { members: null }]) {
      const { deps, send } = setup(over);
      expect(await welcomePass(deps)).toEqual({ state: null, failed: false });
      expect(send).not.toHaveBeenCalled();
    }
  });
  it("l'état noté se relit, et ne contient aucun identifiant de membre", () => {
    const state = { until: T1, lastSentOn: "2026-11-11" };
    expect(WelcomeState.safeParse(state).success).toBe(true);
    expect(JSON.stringify(state)).not.toMatch(/"e"|"z"/);
  });
});

describe("welcomeCard", () => {
  it("écrit le titre, la période, chaque pseudo avec l'heure de son arrivée, et compte les anonymes, sans rien faire déborder", () => {
    const card = welcomeCard(ARRIVALS, "GAL", SITE, measure, true);
    const texts = card.texts.map((t) => plain(t.text));
    for (const expected of ["Arrivées dans le clan [GAL]", "Bienvenue chez les Gaulois", "Entre les relevés de la liste du 10 nov., 18:54 et du 11 nov., 14:54", "10 nov., 21:12", "Éloïse", "11 nov., 10:12", "Zoé", "Et 2 joueurs sans pseudo public.", "x.test/membres"]) {
      expect(texts).toContain(expected);
    }
    expectClean(card);
  });
  it("au-delà de cinq pseudos, montre les premiers et compte les autres", () => {
    const named = Array.from({ length: 8 }, (_, i) => ({ id: `${i}`, username: `Joueur${i}`, joinedAt: T1 }));
    const texts = welcomeCard({ ...ARRIVALS, named, anonymous: 0 }, "GAL", SITE, measure, true).texts.map((t) => t.text);
    expect(texts).toContain("Joueur4");
    expect(texts).not.toContain("Joueur5");
    expect(texts).toContain("Et 3 autres membres avec pseudo. La liste complète est dans le message.");
  });
  it("dit l'essentiel à un lecteur d'écran", () => {
    expect(plain(welcomeImageAlt(ARRIVALS, "GAL"))).toBe(
      "Bienvenue chez les Gaulois : arrivées dans le clan [GAL] entre les relevés de la liste des membres du 10 nov., 18:54 et du 11 nov., 14:54. Éloïse (arrivée : 10 nov., 21:12) ; Zoé (arrivée : 11 nov., 10:12). Et 2 joueurs sans pseudo public.",
    );
  });
  it("se dessine avec les polices du site", async () => {
    const root = process.cwd();
    const fonts = new GazetteFonts(root);
    const card = welcomeCard(ARRIVALS, "GAL", SITE, fonts.width, true);
    expect(await sharp(await renderGazetteCard(card, fonts, root)).metadata()).toMatchObject({ width: card.width, height: card.height, format: "png" });
  });
});

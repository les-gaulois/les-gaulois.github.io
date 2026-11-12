import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { GazetteFonts, renderGazetteCard, type CardText, type GazetteCard, type Measure } from "../../src/lib/gazette-image";
import type { MilestonePlayer, PendingMilestones } from "../../src/lib/paliers-franchis";
import { milestoneCard, milestoneImageAlt } from "../../src/lib/paliers-franchis-image";
import { MAX_CHIPS, MAX_COMPACT_ROWS, MAX_ROWS } from "../../src/lib/salon-image";

/** Une largeur approchée, pour tester la mise en page sans police. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);
const SITE = "https://les-gaulois.github.io";
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
const words = (card: GazetteCard) => card.texts.map((t) => plain(t.text));
const PENDING: PendingMilestones = { since: "2026-11-08T01:53:38.580Z", until: "2026-11-08T21:53:00.000Z", players: [] };
const player = (username: string, tier: number): MilestonePlayer => ({ id: username, username, tier });
/** Des pseudos inventés, aussi longs et variés que les plus longs de la liste : majuscules, espaces, points, chiffres, accents, cyrillique. */
const LONG_NAMES = ["ProfesseurTrébuchet", "Capitaine Barbe GOAT.7362", "ROYAUME DES MOUETTES.9917", "WWWWWWWWWWWWWWWW", "lechevalier2fer.6301", "Иван Петрович"];

/** Rien ne sort de l'image, et deux textes de la même ligne ne se chevauchent pas. `width` : la mesure de contrôle. */
function expectClean(card: GazetteCard, width: Measure = measure): void {
  const leftOf = (t: CardText) => (t.anchor === "end" ? t.x - width(t.text, t.font, t.size) : t.anchor === "middle" ? t.x - width(t.text, t.font, t.size) / 2 : t.x);
  const rightOf = (t: CardText) => leftOf(t) + width(t.text, t.font, t.size);
  for (const t of card.texts) {
    expect(leftOf(t), t.text).toBeGreaterThanOrEqual(0);
    expect(rightOf(t), t.text).toBeLessThanOrEqual(card.width);
    expect(t.y, t.text).toBeLessThanOrEqual(card.height);
  }
  for (const a of card.texts) {
    for (const b of card.texts) {
      if (a === b || a.y !== b.y) continue;
      const apart = rightOf(a) <= leftOf(b) || rightOf(b) <= leftOf(a);
      expect(apart, `« ${a.text} » et « ${b.text} » se chevauchent`).toBe(true);
    }
  }
  for (const r of card.rects) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(card.width + 0.01);
    expect(r.y + r.height).toBeLessThanOrEqual(card.height);
  }
}

describe("milestoneCard", () => {
  it("écrit le titre, ce que comptent les paliers, la période, et chaque palier avec son pseudo", () => {
    const card = milestoneCard([player("Marc", 1000), player("Alpha", 100)], PENDING, "GAL", SITE, measure);
    const text = words(card);
    // L'en-tête dit ce qui est compté et qui peut être cité : sans texte dans le message, rien d'autre ne le dirait.
    expect(text).toContain("Victoires en équipe sous le tag [GAL], membres avec pseudo public");
    expect(text).toContain("Paliers franchis");
    expect(text).toContain("Entre les relevés de la liste du 8 nov., 02:53 et du 8 nov., 22:53");
    for (const expected of ["1 000 victoires", "Marc", "100 victoires", "Alpha", "les-gaulois.github.io/membres", "Un palier compte d'abord les parties jouées, pas le niveau."]) expect(text).toContain(expected);
    expectClean(card);
  });
  it("au singulier pour un seul joueur, et l'image est plus courte", () => {
    const one = milestoneCard([player("Marc", 250)], PENDING, "GAL", SITE, measure);
    expect(words(one)).toContain("Palier franchi");
    expect(one.height).toBeLessThan(milestoneCard([player("Marc", 250), player("Alpha", 100)], PENDING, "GAL", SITE, measure).height);
  });
  it("de six à dix joueurs, nomme tout le monde sur des lignes plus basses, sans compter personne", () => {
    const five = milestoneCard(Array.from({ length: MAX_ROWS }, (_, i) => player(`Joueur${i}`, 100)), PENDING, "GAL", SITE, measure);
    const crowd = Array.from({ length: MAX_COMPACT_ROWS }, (_, i) => player(`Joueur${i}`, 100));
    const card = milestoneCard(crowd, PENDING, "GAL", SITE, measure);
    const text = words(card);
    for (const p of crowd) expect(text).toContain(p.username);
    expect(text.filter((t) => t === "100 victoires")).toHaveLength(MAX_COMPACT_ROWS);
    expect(text.join(" ")).not.toMatch(/autres? membres?/);
    // Deux fois plus de joueurs, mais pas une image deux fois plus haute : les lignes sont plus basses.
    expect(card.height).toBeLessThan(2 * five.height);
    expectClean(card);
  });
  it("au-delà de dix joueurs, les dix plus hauts paliers en lignes, les autres en pastilles avec leur palier : tous nommés", () => {
    const crowd = Array.from({ length: 20 }, (_, i) => player(`Joueur${i}`, i < 10 ? 500 : 50));
    const card = milestoneCard(crowd, PENDING, "GAL", SITE, measure);
    const text = words(card);
    for (let i = 0; i < 10; i++) expect(text).toContain(`Joueur${i}`);
    for (let i = 10; i < 20; i++) expect(text).toContain(`Joueur${i} · 50 victoires`);
    // Le message n'a plus de texte : l'image ne peut renvoyer à rien d'autre qu'elle-même.
    expect(text.join(" ")).not.toMatch(/autres? membres?|dans le message/);
    expectClean(card);
  });
  it("ne compte des membres sans les nommer qu'au-delà de ce qu'une image peut porter", () => {
    const crowd = Array.from({ length: MAX_COMPACT_ROWS + MAX_CHIPS + 3 }, (_, i) => player(`J${i}`, 50));
    const card = milestoneCard(crowd, PENDING, "GAL", SITE, measure);
    expect(words(card)).toContain("Et 3 autres membres.");
    expect(words(card).join(" ")).not.toContain("dans le message");
    expectClean(card);
  });
  it("ne déborde pas et ne chevauche rien, avec de longs pseudos et le plus haut palier, en lignes comme en pastilles", () => {
    expectClean(milestoneCard(LONG_NAMES.slice(0, 5).map((n) => player(n, 5000)), PENDING, "GAL", SITE, measure));
    expectClean(milestoneCard(LONG_NAMES.map((n) => player(n, 5000)), PENDING, "GAL", SITE, measure));
    expectClean(milestoneCard([...LONG_NAMES, ...LONG_NAMES, ...LONG_NAMES].map((n, i) => player(`${n}${i}`, 5000)), PENDING, "GAL", SITE, measure));
  });
});

describe("milestoneImageAlt", () => {
  it("dit tout ce que l'image montre, et tient dans la limite de Discord", () => {
    const alt = plain(milestoneImageAlt([player("Marc", 1000), player("Alpha", 100)], PENDING, "GAL"));
    expect(alt).toBe(
      "Paliers franchis chez [GAL] : victoires en équipe sous le tag, entre les relevés de la liste des membres du 8 nov., 02:53 et du 8 nov., 22:53. Marc passe le cap des 1 000 victoires ; Alpha passe le cap des 100 victoires. Membres avec pseudo public seulement. Un palier compte d'abord les parties jouées, pas le niveau.",
    );
  });
  it("une longue liste ne coupe aucun pseudo : les autres sont comptés, et les réserves de la fin restent entières", () => {
    const crowd = Array.from({ length: 40 }, (_, i) => player(`${"x".repeat(40)}${i}`, 100));
    const alt = plain(milestoneImageAlt(crowd, PENDING, "GAL"));
    expect(alt.length).toBeLessThanOrEqual(1024);
    const written = crowd.filter((p) => alt.includes(`${p.username} passe le cap des 100 victoires`)).length;
    expect(written).toBeGreaterThan(5);
    expect(written).toBeLessThan(40);
    expect(alt.endsWith(`${crowd[written - 1]!.username} passe le cap des 100 victoires. Et ${40 - written} autres membres. Membres avec pseudo public seulement. Un palier compte d'abord les parties jouées, pas le niveau.`)).toBe(true);
    expect(alt).not.toContain(crowd[written]!.username);
  });
});

describe("renderGazetteCard, pour les paliers", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);

  it("ne déborde pas et ne chevauche rien avec la vraie police, avec les pseudos les plus longs", () => {
    expectClean(milestoneCard(LONG_NAMES.map((n, i) => player(n, [5000, 2500, 1000, 500, 250, 100][i] ?? 100)), PENDING, "GAL", SITE, fonts.width), fonts.width);
    expectClean(milestoneCard(LONG_NAMES.slice(0, 5).map((n) => player(n, 5000)), PENDING, "GAL", SITE, fonts.width), fonts.width);
    expectClean(milestoneCard([...LONG_NAMES, ...LONG_NAMES, ...LONG_NAMES].map((n, i) => player(`${n}${i}`, 5000)), PENDING, "GAL", SITE, fonts.width), fonts.width);
    expectClean(milestoneCard([player("Brennus.5264", 100)], PENDING, "GAL", SITE, fonts.width), fonts.width);
  });
  it("dessine une vraie image PNG, avec le logo", async () => {
    const card = milestoneCard([player("Vercingé FR", 1000), player("Floooo", 250)], PENDING, "GAL", SITE, fonts.width);
    const png = await renderGazetteCard(card, fonts, root);
    expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 1200, height: card.height });
    const { x, y, size } = card.logo;
    const logo = await sharp(png).extract({ left: x, top: y, width: size, height: size }).stats();
    expect(logo.channels.some((channel) => channel.stdev > 10)).toBe(true);
  });
});

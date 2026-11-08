import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { GazetteFonts, renderGazetteCard, type CardText, type GazetteCard, type Measure } from "../../src/lib/gazette-image";
import type { MilestonePlayer, PendingMilestones } from "../../src/lib/paliers-franchis";
import { MAX_ROWS, milestoneCard, milestoneImageAlt } from "../../src/lib/paliers-franchis-image";

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
    const card = milestoneCard([player("Marc", 1000), player("Alpha", 100)], PENDING, "GAL", SITE, measure, true);
    const text = words(card);
    expect(text).toContain("Victoires en équipe sous le tag [GAL]");
    expect(text).toContain("Paliers franchis");
    expect(text).toContain("Entre les relevés de la liste du 8 nov., 02:53 et du 8 nov., 22:53");
    for (const expected of ["1 000 victoires", "Marc", "100 victoires", "Alpha", "les-gaulois.github.io/membres", "Un palier compte d'abord les parties jouées, pas le niveau."]) expect(text).toContain(expected);
    expectClean(card);
  });
  it("au singulier pour un seul joueur, et l'image est plus courte", () => {
    const one = milestoneCard([player("Marc", 250)], PENDING, "GAL", SITE, measure, true);
    expect(words(one)).toContain("Palier franchi");
    expect(one.height).toBeLessThan(milestoneCard([player("Marc", 250), player("Alpha", 100)], PENDING, "GAL", SITE, measure, true).height);
  });
  it("au-delà de cinq joueurs, montre les premiers et compte les autres", () => {
    const crowd = Array.from({ length: MAX_ROWS + 2 }, (_, i) => player(`Joueur${i}`, 100));
    const text = words(milestoneCard(crowd, PENDING, "GAL", SITE, measure, true));
    expect(text).toContain("Joueur4");
    expect(text).not.toContain("Joueur5");
    expect(text).toContain("Et 2 autres membres. La liste complète est dans le message.");
  });
  it("ne renvoie pas au message pour des pseudos qu'il n'écrit pas", () => {
    const crowd = Array.from({ length: 20 }, (_, i) => player(`Joueur${i}`, 100));
    const text = words(milestoneCard(crowd, PENDING, "GAL", SITE, measure, false));
    expect(text).toContain("Et 15 autres membres.");
    expect(text.join(" ")).not.toContain("dans le message");
  });
  it("ne déborde pas et ne chevauche rien, avec de longs pseudos et le plus haut palier", () => {
    expectClean(milestoneCard(LONG_NAMES.slice(0, 5).map((n) => player(n, 5000)), PENDING, "GAL", SITE, measure, true));
  });
});

describe("milestoneImageAlt", () => {
  it("dit tout ce que l'image montre, et tient dans la limite de Discord", () => {
    const alt = plain(milestoneImageAlt([player("Marc", 1000), player("Alpha", 100)], PENDING, "GAL"));
    expect(alt).toBe(
      "Paliers franchis chez [GAL], entre les relevés de la liste des membres du 8 nov., 02:53 et du 8 nov., 22:53. Marc passe le cap des 1 000 victoires ; Alpha passe le cap des 100 victoires. Un palier compte d'abord les parties jouées, pas le niveau.",
    );
    expect(milestoneImageAlt(Array.from({ length: 40 }, (_, i) => player("x".repeat(40) + i, 100)), PENDING, "GAL").length).toBeLessThanOrEqual(1024);
  });
});

describe("renderGazetteCard, pour les paliers", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);

  it("ne déborde pas et ne chevauche rien avec la vraie police, avec les pseudos les plus longs", () => {
    expectClean(milestoneCard(LONG_NAMES.map((n, i) => player(n, [5000, 2500, 1000, 500, 250, 100][i] ?? 100)), PENDING, "GAL", SITE, fonts.width, true), fonts.width);
    expectClean(milestoneCard([player("Brennus.5264", 100)], PENDING, "GAL", SITE, fonts.width, true), fonts.width);
  });
  it("dessine une vraie image PNG, avec le logo", async () => {
    const card = milestoneCard([player("Vercingé FR", 1000), player("Floooo", 250)], PENDING, "GAL", SITE, fonts.width, true);
    const png = await renderGazetteCard(card, fonts, root);
    expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 1200, height: card.height });
    const { x, y, size } = card.logo;
    const logo = await sharp(png).extract({ left: x, top: y, width: size, height: size }).stats();
    expect(logo.channels.some((channel) => channel.stdev > 10)).toBe(true);
  });
});

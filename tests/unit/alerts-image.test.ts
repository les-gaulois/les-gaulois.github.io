import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { PlaceAlert, PlaceReading, PlaceRow } from "../../src/lib/alerts";
import { alertCard, alertImageAlt } from "../../src/lib/alerts-image";
import { GazetteFonts, renderGazetteCard, type CardText, type GazetteCard, type Measure } from "../../src/lib/gazette-image";

/** Une largeur approchée, pour tester la mise en page sans police. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);
const SITE = "https://les-gaulois.github.io";
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
const words = (card: GazetteCard) => card.texts.map((t) => plain(t.text));

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

const row = (rank: number, tag: string | null, value: number, gal = false, color: number | null = null): PlaceRow => ({ rank, tag, value, color, gal });

/** Les vrais chiffres du 8 novembre 2026 à 8 h 27 : GAL 2e, juste devant [ITA]. */
const official: PlaceReading = {
  kind: "rank",
  rank: 2,
  fetchedAt: "2026-11-08T07:31:52.241Z",
  computedAt: "2026-11-08T07:27:13.816Z",
  rows: [row(1, "UN", 10723.1), row(2, "GAL", 2203.53, true), row(3, "ITA", 2072.43), row(4, "AST", 1933.96), row(5, "NU", 1281.88)],
  above: { tag: "UN", rank: 1, gap: 8519.57 },
  below: { tag: "ITA", rank: 3, gap: 131.1 },
};
/** Le relevé de la carte du 7 novembre 2026 à 18 h : GAL 4e, devant [AST]. */
const territory: PlaceReading = {
  kind: "map",
  rank: 4,
  fetchedAt: "2026-11-07T17:00:01.344Z",
  computedAt: "2026-11-07T17:00:01.344Z",
  rows: [row(2, "UN", 368044, false, 10741301), row(3, "JR", 177365, false, 3191476), row(4, "GAL", 121976, true, 3718648), row(5, "AST", 117080, false, 13273604), row(6, "ITA", 96918, false, 3462041)],
  above: { tag: "JR", rank: 3, gap: 55389 },
  below: { tag: "AST", rank: 5, gap: 4896 },
};
const gain: PlaceAlert = { kind: "rank", from: 3, reading: official };
const mapGain: PlaceAlert = { kind: "map", from: 5, reading: territory };

describe("alertCard", () => {
  it("écrit le classement, la nouvelle place, le changement signé et la date du calcul", () => {
    const text = words(alertCard(gain, "GAL", SITE, measure));
    expect(text).toContain("Classement des clans");
    expect(text).toContain("[GAL] monte à la 2e place");
    expect(text).toContain("+1 place");
    expect(text).toContain("Liste officielle d'OpenFront, arrêtée au 8 nov., 08:27");
    expect(text).toContain("131,10 d'avance sur [ITA], 3e · 8 519,57 de retard sur [UN], 1er");
    expect(text).toContain("les-gaulois.github.io/classement");
    expect(text).toContain("Score : victoires pondérées, demi-vie de 30 jours");
  });
  it("écrit chaque clan avec sa place et son chiffre : la barre ne dit rien de plus", () => {
    const card = alertCard(gain, "GAL", SITE, measure);
    const text = words(card);
    for (const expected of ["1er", "[UN]", "10 723,10", "2e", "[GAL]", "2 203,53", "5e", "[NU]", "1 281,88"]) expect(text).toContain(expected);
    // Cinq lignes, et seule celle de GAL porte le filet rouge.
    expect(card.rects.filter((r) => r.height === 72)).toHaveLength(5);
    expect(card.rects.filter((r) => r.color === "#FF1A2E" && r.width === 6)).toHaveLength(1);
  });
  it("sur la carte, colore chaque barre de la couleur du clan dans le jeu, et dit que ce n'est pas le classement", () => {
    const card = alertCard(mapGain, "GAL", SITE, measure);
    const text = words(card);
    expect(text).toContain("Carte des clans");
    expect(text).toContain("Carte au relevé du 7 nov., 18:00");
    expect(text).toContain("4 896 pixels d'avance sur [AST], 5e · 55 389 pixels de retard sur [JR], 3e");
    expect(text).toContain("Territoire en pixels, ce n'est pas le classement des clans");
    expect(text).toContain("les-gaulois.github.io/carte");
    expect(card.rects.some((r) => r.color === "rgb(56,189,248)")).toBe(true);
  });
  it("après une baisse, le retard passe d'abord et le changement porte le signe moins", () => {
    const text = words(alertCard({ kind: "rank", from: 1, reading: official }, "GAL", SITE, measure));
    expect(text).toContain("[GAL] recule à la 2e place");
    expect(text).toContain("−1 place");
    expect(text).toContain("8 519,57 de retard sur [UN], 1er · 131,10 d'avance sur [ITA], 3e");
  });
  it("ne déborde pas et ne chevauche rien, avec un clan supprimé, de très grands nombres et une place lointaine", () => {
    const far: PlaceReading = {
      ...territory,
      rank: 104,
      rows: [row(102, "ABCDE", 1234567), row(103, null, 1234566), row(104, "GAL", 1234565, true), row(105, "WWWWW", 1234564), row(106, "MMMMM", 1)],
      above: { tag: null, rank: 103, gap: 1 },
      below: { tag: "WWWWW", rank: 105, gap: 1 },
    };
    const card = alertCard({ kind: "map", from: 1, reading: far }, "GAL", SITE, measure);
    expect(words(card)).toContain("Clan supprimé");
    expect(words(card)).toContain("1 pixel de retard sur un clan supprimé, 103e · 1 pixel d'avance sur [WWWWW], 105e");
    expectClean(card);
  });
});

describe("alertImageAlt", () => {
  it("dit tout ce que l'image montre", () => {
    const alt = plain(alertImageAlt(gain, "GAL"));
    expect(alt).toContain("[GAL] monte à la 2e place du classement des clans (+1 place).");
    expect(alt).toContain("Liste officielle d'OpenFront, arrêtée au 8 nov., 08:27. Score : victoires pondérées, demi-vie de 30 jours.");
    expect(alt).toContain("1er [UN], 10 723,10 ; 2e [GAL], 2 203,53");
    expect(alt).toContain("131,10 d'avance sur [ITA], 3e. 8 519,57 de retard sur [UN], 1er.");
    expect(plain(alertImageAlt(mapGain, "GAL"))).toContain("4e [GAL], 121 976 pixels");
    expect(alt.length).toBeLessThanOrEqual(1024);
  });
});

describe("renderGazetteCard, pour une alerte", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);

  it("ne déborde pas et ne chevauche rien avec la vraie police", () => {
    for (const alert of [gain, mapGain, { kind: "rank" as const, from: 1, reading: official }, { kind: "map" as const, from: 2, reading: { ...territory, rank: 4 } }]) {
      expectClean(alertCard(alert, "GAL", SITE, fonts.width), fonts.width);
    }
  });
  it("dessine une vraie image PNG à la bonne taille, avec le logo", async () => {
    const card = alertCard(mapGain, "GAL", SITE, fonts.width);
    const png = await renderGazetteCard(card, fonts, root);
    expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 1200, height: 700 });
    expect(png.length).toBeGreaterThan(20_000);
    expect(png.length).toBeLessThan(2_000_000);
    const { x, y, size } = card.logo;
    const logo = await sharp(png).extract({ left: x, top: y, width: size, height: size }).stats();
    expect(logo.channels.some((channel) => channel.stdev > 10)).toBe(true);
  });
});

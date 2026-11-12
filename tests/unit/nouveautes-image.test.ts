import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { GazetteFonts, renderGazetteCard } from "../../src/lib/gazette-image";
import { MAX_ENTRIES } from "../../src/lib/nouveautes-discord";
import { newsCard, newsImageAlt, newsPeriod } from "../../src/lib/nouveautes-image";
import { Nouveautes, type Nouveaute } from "../../src/lib/schemas";
import { approx, expectClean, words } from "./card-checks";

const SITE = "https://x.test/";
const entry = (date: string, title: string, kind: Nouveaute["kind"] = "nouveau"): Nouveaute => ({ date, kind, title, body: `Ce qui change avec ${title}.` });
const NEW = entry("2026-11-12", "Les messages Discord en images");
const BETTER = entry("2026-11-12", "L'accueil commence par le classement", "ameliore");
const FIXED = entry("2026-11-11", "Une date corrigée", "corrige");

describe("newsPeriod", () => {
  it("écrit le jour des entrées, ou du premier au dernier", () => {
    expect(newsPeriod([NEW, BETTER])).toBe("Le 12 novembre 2026");
    expect(newsPeriod([NEW, FIXED])).toBe("Du 11 au 12 novembre 2026");
    expect(newsPeriod([entry("2026-11-01", "A"), entry("2026-10-31", "B")])).toBe("Du 31 octobre au 1er novembre 2026");
    expect(newsPeriod([entry("2027-01-01", "A"), entry("2026-12-31", "B")])).toBe("Du 31 décembre 2026 au 1er janvier 2027");
    expect(newsPeriod([])).toBe("");
  });
});

describe("newsCard", () => {
  it("écrit le titre, les jours, et chaque nouveauté avec sa sorte, sans sa phrase", () => {
    const card = newsCard([NEW, BETTER, FIXED], SITE, approx);
    const text = words(card);
    for (const expected of ["Mises à jour du site", "Nouveau sur le site du clan", "Du 11 au 12 novembre 2026", "Nouveau", NEW.title, "Amélioré", BETTER.title, "Corrigé", FIXED.title, "x.test/nouveautes"]) {
      expect(text).toContain(expected);
    }
    // La phrase de chaque nouveauté reste sur la page : l'image ne la coupe pas, elle ne l'écrit pas.
    expect(text.join(" ")).not.toContain("Ce qui change avec");
    expectClean(card);
  });
  it("jusqu'à dix nouveautés, des lignes plus basses ; au-delà, compte les autres", () => {
    const five = newsCard(Array.from({ length: 5 }, (_, i) => entry("2026-11-12", `Nouveauté ${i}`)), SITE, approx);
    const ten = newsCard(Array.from({ length: MAX_ENTRIES }, (_, i) => entry("2026-11-12", `Nouveauté ${i}`)), SITE, approx);
    expect(words(ten).filter((t) => t.startsWith("Nouveauté "))).toHaveLength(MAX_ENTRIES);
    expect(words(ten).join(" ")).not.toContain("autres nouveautés");
    expect(ten.height).toBeLessThan(2 * five.height);
    const many = newsCard(Array.from({ length: MAX_ENTRIES + 3 }, (_, i) => entry("2026-11-12", `Nouveauté ${i}`)), SITE, approx);
    expect(words(many)).toContain("Nouveauté 9");
    expect(words(many)).not.toContain("Nouveauté 10");
    expect(words(many)).toContain("Et 3 autres nouveautés.");
    for (const card of [five, ten, many]) expectClean(card);
  });
  it("donne les titres et les phrases à un lecteur d'écran, ou les titres seuls s'ils sont trop nombreux", () => {
    expect(newsImageAlt([NEW, FIXED])).toBe(
      "Nouveau sur le site du clan. Du 11 au 12 novembre 2026. Nouveau : Les messages Discord en images. Ce qui change avec Les messages Discord en images. Corrigé : Une date corrigée. Ce qui change avec Une date corrigée.",
    );
    const long = Array.from({ length: 10 }, (_, i) => ({ ...entry("2026-11-12", `Nouveauté ${i}`), body: "x".repeat(200) }));
    const alt = newsImageAlt(long);
    expect(alt.length).toBeLessThanOrEqual(1024);
    expect(alt).toContain("Nouveau : Nouveauté 9.");
    expect(alt).not.toContain("xxx");
  });
});

describe("renderGazetteCard, pour les nouveautés", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);

  it("les vraies nouveautés du site tiennent en entier sur l'image, sans titre coupé", async () => {
    const { default: raw } = await import("../../content/nouveautes.json");
    const entries = Nouveautes.parse(raw);
    // Chaque titre du journal se dessine avec les polices du site, et aucun n'est coupé par des points de suspension.
    for (let i = 0; i < entries.length; i += MAX_ENTRIES) {
      const batch = entries.slice(i, i + MAX_ENTRIES);
      const card = newsCard(batch, SITE, fonts.width);
      expectClean(card, fonts.width);
      for (const item of batch) expect(words(card)).toContain(item.title);
    }
  });
  it("dessine une vraie image PNG, en lignes hautes comme en lignes basses", async () => {
    for (const count of [2, MAX_ENTRIES]) {
      const card = newsCard(Array.from({ length: count }, (_, i) => entry("2026-11-12", `Nouveauté numéro ${i}`, i % 2 ? "ameliore" : "nouveau")), SITE, fonts.width);
      expect(await sharp(await renderGazetteCard(card, fonts, root)).metadata()).toMatchObject({ format: "png", width: 1200, height: card.height });
    }
  });
});

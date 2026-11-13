import { describe, expect, it } from "vitest";
import { CARD_COLORS, type GazetteCard, type Measure } from "../../src/lib/gazette-image";
import { ICONES_PARTIES, ICONE_DEMI, ICONE_PLEIN } from "../../src/lib/icones-parties";
import { ICON_TILE, iconRects, iconTileParts, wrapWords } from "../../src/lib/lignes-icones-image";
import { PANEL_ROLES, rolesCard, rolesImageAlt, ROLES_HOW, ROLES_KICKER, ROLES_NOTE, ROLES_TITLE } from "../../src/lib/roles-discord";
import { BODY_TOP, CARD_MARGIN, CARD_WIDTH, FOOTER_HEIGHT } from "../../src/lib/salon-image";

// Une police à chasse fixe imaginaire : chaque signe vaut un peu plus d'une demi-taille.
const measure: Measure = (text, _font, size) => [...text].length * size * 0.55;
const SITE = "https://les-gaulois.github.io";
const textsOf = (card: GazetteCard) => card.texts.map((t) => t.text);
/** Les grandes cases : les rectangles bordés du filet du site, plus larges qu'une icône. */
const tilesOf = (card: GazetteCard) => card.rects.filter((r) => r.stroke === CARD_COLORS.LINE && r.width > 200);

describe("l'image du panneau des rôles", () => {
  const card = rolesCard(SITE, measure);

  it("écrit chaque rôle, ce qu'il fait, et comment s'en servir, avec l'invite de /roles", () => {
    const texts = textsOf(card);
    for (const text of [ROLES_KICKER, ROLES_HOW, ROLES_NOTE, "les-gaulois.github.io", ROLES_TITLE]) expect(texts, text).toContain(text);
    expect(texts.join(" ")).toContain("./roles");
    const all = texts.join(" ");
    for (const role of PANEL_ROLES) {
      expect(texts).toContain(role.label);
      // La phrase passe sur plusieurs lignes : écrite en entier, dans l'ordre, une ligne après l'autre.
      expect(all).toContain(role.description);
    }
  });

  it("pose quatre grandes cases, deux par rangée, de même taille, sous l'en-tête et au-dessus du bas", () => {
    const tiles = tilesOf(card);
    expect(tiles).toHaveLength(PANEL_ROLES.length);
    const [a, b, c, d] = tiles;
    expect(a!.y).toBe(BODY_TOP);
    expect(b!.y).toBe(a!.y);
    expect(c!.y).toBe(d!.y);
    expect(c!.y).toBeGreaterThan(a!.y + a!.height);
    expect(a!.x).toBe(CARD_MARGIN);
    expect(b!.x + b!.width).toBe(CARD_WIDTH - CARD_MARGIN);
    for (const tile of tiles) expect([tile.width, tile.height]).toEqual([a!.width, a!.height]);
    expect(card.height).toBe(d!.y + d!.height + FOOTER_HEIGHT);
  });

  it("garde chaque texte dans l'image, à la largeur où Discord la montre", () => {
    for (const text of card.texts) {
      const width = measure(text.text, text.font, text.size);
      const left = text.anchor === "end" ? text.x - width : text.anchor === "middle" ? text.x - width / 2 : text.x;
      expect(left, text.text).toBeGreaterThanOrEqual(0);
      expect(left + width, text.text).toBeLessThanOrEqual(card.width);
      expect(text.y, text.text).toBeLessThanOrEqual(card.height);
    }
    // Lu à environ 590 pixels de large, la moitié : rien en dessous de 18 pixels dans l'image.
    for (const text of card.texts) expect(text.size, text.text).toBeGreaterThanOrEqual(18);
  });

  it("dessine la grande icône de chaque rôle au milieu du haut de sa case, sans déborder", () => {
    const tiles = tilesOf(card);
    PANEL_ROLES.forEach((role, i) => {
      const tile = tiles[i]!;
      const lines = ICONES_PARTIES[role.icone];
      const left = tile.x + tile.width / 2 - (lines.length * ICON_TILE.cell) / 2;
      const pixels = iconRects(lines, left, tile.y + ICON_TILE.pad, ICON_TILE.cell, CARD_COLORS.BLUE_TEXT, CARD_COLORS.BLUE);
      expect(card.rects, role.key).toEqual(expect.arrayContaining(pixels));
      for (const pixel of pixels) {
        expect(pixel.x >= tile.x && pixel.y >= tile.y && pixel.x + pixel.width <= tile.x + tile.width && pixel.y + pixel.height <= tile.y + tile.height, `${role.key} ${pixel.x},${pixel.y}`).toBe(true);
      }
    });
  });

  it("chaque rôle a son icône dans la grille du site, et aucune ne sert deux fois", () => {
    for (const role of PANEL_ROLES) expect(ICONES_PARTIES[role.icone], role.key).toBeDefined();
    expect(new Set(PANEL_ROLES.map((role) => role.icone)).size).toBe(PANEL_ROLES.length);
  });

  it("se décrit en entier aux lecteurs d'écran, sans dépasser la limite de Discord", () => {
    const alt = rolesImageAlt(SITE);
    expect(alt.length).toBeLessThanOrEqual(1024);
    expect(alt).toContain(`${ROLES_TITLE}, sur le serveur Discord du clan.`);
    expect(alt).toContain("Tournois : être prévenu quand un tournoi s'annonce.");
    expect(alt).toContain("« Mes rôles »");
    expect(alt).toContain("Le site du clan : les-gaulois.github.io.");
    for (const role of PANEL_ROLES) expect(alt).toContain(`${role.label} : `);
  });
});

describe("les grandes cases", () => {
  it("écrivent tous les noms d'une grille à la même taille, la plus grande qui tienne", () => {
    const rows = [
      { label: "Court", description: "Une phrase", icone: "cor" as const },
      { label: "Un nom bien plus long que sa case", description: "Une phrase", icone: "cadeau" as const },
    ];
    const names = iconTileParts(rows, 100, 2, measure).texts.filter((t) => t.font === "strong");
    expect(new Set(names.map((t) => t.size)).size).toBe(1);
    expect(names[0]!.size).toBeLessThan(ICON_TILE.name);
    expect(iconTileParts([], 100, 2, measure).bottom).toBe(100);
  });

  it("coupent une phrase entre les mots, jamais au milieu d'un mot", () => {
    expect(wrapWords("un deux trois quatre", "body", 10, 60, measure)).toEqual(["un deux", "trois", "quatre"]);
    expect(wrapWords("  ", "body", 10, 60, measure)).toEqual([]);
  });
});

describe("les cases d'une icône", () => {
  it("une suite de cases voisines de même teinte fait un seul rectangle", () => {
    expect(iconRects(["##+#", ".#.."], 10, 20, 5, "plein", "demi")).toEqual([
      { x: 10, y: 20, width: 10, height: 5, radius: 0, color: "plein" },
      { x: 20, y: 20, width: 5, height: 5, radius: 0, color: "demi" },
      { x: 25, y: 20, width: 5, height: 5, radius: 0, color: "plein" },
      { x: 15, y: 25, width: 5, height: 5, radius: 0, color: "plein" },
    ]);
  });

  it("couvre exactement les cases de chaque icône du panneau", () => {
    for (const role of PANEL_ROLES) {
      const lines = ICONES_PARTIES[role.icone];
      const rects = iconRects(lines, 0, 0, 1, "plein", "demi");
      const area = (color: string) => rects.filter((r) => r.color === color).reduce((sum, r) => sum + r.width, 0);
      expect(area("plein"), role.key).toBe(lines.join("").split(ICONE_PLEIN).length - 1);
      expect(area("demi"), role.key).toBe(lines.join("").split(ICONE_DEMI).length - 1);
    }
  });
});

import { describe, expect, it } from "vitest";
import { CARD_COLORS, type GazetteCard, type Measure } from "../../src/lib/gazette-image";
import { ICONES_PARTIES, ICONE_DEMI, ICONE_PLEIN } from "../../src/lib/icones-parties";
import { iconRects, PANEL_ROLES, rolesCard, rolesImageAlt, ROLES_HOW, ROLES_KICKER, ROLES_NOTE, ROLES_TITLE } from "../../src/lib/roles-discord";
import { BODY_TOP, FOOTER_HEIGHT } from "../../src/lib/salon-image";

// Une police à chasse fixe imaginaire : chaque signe vaut un peu plus d'une demi-taille.
const measure: Measure = (text, _font, size) => [...text].length * size * 0.55;
const SITE = "https://les-gaulois.github.io";
const textsOf = (card: GazetteCard) => card.texts.map((t) => t.text);

describe("l'image du panneau des rôles", () => {
  const card = rolesCard(SITE, measure);

  it("écrit chaque rôle, ce qu'il fait, et comment s'en servir", () => {
    const texts = textsOf(card);
    for (const text of [ROLES_KICKER, ROLES_TITLE, ROLES_HOW, ROLES_NOTE, "les-gaulois.github.io"]) expect(texts, text).toContain(text);
    for (const role of PANEL_ROLES) {
      expect(texts).toContain(role.label);
      expect(texts).toContain(role.description);
    }
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
    // L'en-tête complet, quatre lignes de 116 pixels séparées de 14, puis le bas.
    expect(card.height).toBe(BODY_TOP + 4 * 116 + 3 * 14 + FOOTER_HEIGHT);
  });

  it("dessine l'icône de chaque rôle au milieu de sa case, sans déborder", () => {
    const tiles = card.rects.filter((r) => r.width === 88 && r.height === 88);
    expect(tiles).toHaveLength(PANEL_ROLES.length);
    PANEL_ROLES.forEach((role, i) => {
      const tile = tiles[i]!;
      // Treize cases de six pixels : 78 pixels dans une case de 88, cinq de marge de chaque côté.
      const pixels = iconRects(ICONES_PARTIES[role.icone], tile.x + 5, tile.y + 5, 6, CARD_COLORS.BLUE_TEXT, CARD_COLORS.BLUE);
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

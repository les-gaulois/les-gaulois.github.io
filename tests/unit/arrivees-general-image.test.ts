import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { DECORS, drawnName, type Decor } from "../../src/lib/arrivees";
import { GENERAL_TIPS } from "../../src/lib/arrivees-general";
import {
  GENERAL_AVATAR,
  GENERAL_GAULOIS_MAX,
  GENERAL_HEIGHT,
  GENERAL_NAME,
  GENERAL_SCENES,
  GENERAL_SEAL,
  GENERAL_TITLE,
  GENERAL_VILLAGE,
  GENERAL_WIDTH,
  GENERAL_ZONE,
  gauloisRect,
  generalLayout,
  generalName,
  generalSvg,
  pseudoOf,
  renderGeneral,
  type GeneralGaulois,
  type GeneralImage,
  type GeneralLayout,
} from "../../src/lib/arrivees-general-image";
import { WarriorAssets } from "../../src/lib/arrivees-image";
import { TENUE_DE_DEPART, tenueAuHasard } from "../../src/lib/gaulois";
import { drawnWidth, GazetteFonts, type CardText, type Measure } from "../../src/lib/gazette-image";
import { ICONES_PARTIES } from "../../src/lib/icones-parties";

const SITE = "https://les-gaulois.github.io";
const NBSP = String.fromCodePoint(0xa0);
const MARGIN = 36;
/** Une largeur approchée, pour tester la mise en page sans police : la chasse fixe fait 0,6 fois sa taille, Inter un peu plus de la moitié. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "mono" || font === "monoStrong" ? 0.6 : font === "strong" || font === "body" ? 0.52 : 0.62);
/** Des noms inventés, du plus court au plus long qu'accepte Discord, avec espaces, signes, chiffres et capitales larges. */
const NAMES = ["nx", "Brennos", "[GAL] Taranis", "lug_du_nord.6301", "Epona la Rapide", "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW", "Un nom très long pour bien voir", "sansespacemaisvraimenttreslong32"];

/** Des tracés factices : le dessin se teste sans police ni fichier. */
const fakeFonts = { width: measure, paths: (item: CardText) => `<g fill="${item.color}" data-text="${item.text.length}"/>` };
const noAssets = { warriorMask: null, avatar: null };
const fakeAssets = { warriorMask: "data:image/png;base64,AAAA", avatar: "data:image/png;base64,BBBB" };

/** Des tirages toujours les mêmes, pour des tenues d'exemple. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
/** Des Gaulois inventés : des pseudos d'exemple, la tenue de départ puis des tenues tirées au sort. */
const PSEUDOS = ["Luern", "Catumar", "Divico le Vif", "Segomar", "Adiatun", "Biturix", "Camulos"];
const crowd = (count: number, seed = 7): GeneralGaulois[] => PSEUDOS.slice(0, count).map((nom, i) => ({ nom, tenue: i === 0 ? TENUE_DE_DEPART : tenueAuHasard(seeded(seed + i * 977)) }));

const image = (name: string, more: Partial<GeneralImage> = {}): GeneralImage => ({ name, decor: "etendard", tips: GENERAL_TIPS, siteUrl: SITE, ...more });
const words = (text: string) => text.split(/\s+/).filter(Boolean);

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
/** La place d'un texte, selon son ancrage : du haut de ses capitales au bas de ses jambages. */
const boxOf = (t: CardText, width: Measure): Box => {
  const w = drawnWidth(t, width);
  const left = t.anchor === "middle" ? t.x - w / 2 : t.anchor === "end" ? t.x - w : t.x;
  return { left, right: left + w, top: t.y - t.size * 0.8, bottom: t.y + t.size * 0.25 };
};
const overlap = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const spriteBox = (p: GeneralLayout["gaulois"][number]): Box => {
  const r = gauloisRect(p);
  return { left: r.x, right: r.x + r.width, top: r.y, bottom: r.y + r.height };
};
/** La case où un texte est écrit, ou rien : l'en-tête et le pied. */
const tileOf = (layout: GeneralLayout, t: CardText) => layout.tiles.find((tile) => t.x >= tile.x && t.x <= tile.x + tile.width && t.y >= tile.y && t.y <= tile.y + tile.height);

describe("la taille de l'image", () => {
  it("est large : Discord la montre sur presque toute sa largeur", () => {
    expect(GENERAL_WIDTH).toBe(1200);
    expect(GENERAL_WIDTH / GENERAL_HEIGHT).toBeGreaterThanOrEqual(1.55);
    expect(GENERAL_WIDTH / GENERAL_HEIGHT).toBeLessThanOrEqual(2);
    expect(GENERAL_GAULOIS_MAX).toBeGreaterThanOrEqual(3);
    expect(GENERAL_GAULOIS_MAX).toBeLessThanOrEqual(6);
  });
});

describe("generalName", () => {
  it("écrit un nom court sur une ligne, à la plus grande taille", () => {
    expect(generalName("nx", 880, measure)).toEqual({ lines: ["nx"], size: GENERAL_NAME.max });
  });
  it("garde un nom à deux mots sur une ligne tant qu'il y tient", () => {
    const fit = generalName("Epona la Rapide", 880, measure);
    expect(fit.lines).toEqual(["Epona la Rapide"]);
    expect(fit.size).toBeGreaterThanOrEqual(GENERAL_NAME.oneLineMin);
  });
  it("passe sur deux lignes, entre deux mots, quand une ligne serait trop petite", () => {
    const fit = generalName("Un nom très long pour bien voir", 500, measure);
    expect(fit.lines).toEqual(["Un nom très long", "pour bien voir"]);
    expect(fit.size).toBe(GENERAL_NAME.twoLines);
  });
  it("ne coupe jamais un nom sans points de suspension", () => {
    for (const name of NAMES) {
      for (const width of [300, 500, 880]) {
        const fit = generalName(name, width, measure);
        expect(fit.lines.length, name).toBeLessThanOrEqual(2);
        for (const line of fit.lines) expect(measure(line, "name", fit.size), `${name} · ${width}`).toBeLessThanOrEqual(width);
        const whole = fit.lines.join("").replace(/\s/g, "") === name.replace(/\s/g, "");
        expect(whole || fit.lines.at(-1)?.endsWith("…"), `${name} · ${width}`).toBe(true);
      }
    }
  });
});

describe("l'en-tête et le pied", () => {
  it("écrit l'invite, le titre du modèle, le nom et l'adresse du site", () => {
    const layout = generalLayout(image("Brennos"), measure);
    const said = layout.texts.map((t) => t.text);
    expect(said.slice(0, 3).join("")).toBe("gal@clan:~$ ./bienvenue");
    expect(said.slice(3, 9)).toEqual(["Ho", "!", "Un", "nouveau", "membre", ":"]);
    expect(said.slice(3, 9).join("")).not.toContain(NBSP);
    expect(layout.name.map((t) => t.text)).toEqual(["Brennos"]);
    expect(said.at(-1)).toBe("les-gaulois.github.io");
    // Rien d'autre hors des conseils : l'invite, le titre, l'adresse.
    expect(layout.texts.filter((t) => !tileOf(layout, t))).toHaveLength(3 + 6 + 1);
  });
  it("laisse sa place au sceau du guerrier : le titre s'arrête avant lui", () => {
    const layout = generalLayout(image("Brennos"), measure, true);
    expect(layout.seal).toBe(true);
    for (const t of layout.texts.filter((item) => item.font === "cases")) expect(t.x + drawnWidth(t, measure)).toBeLessThanOrEqual(GENERAL_SEAL.x - 20);
    expect(generalLayout(image("Brennos"), measure).seal).toBe(false);
  });
  it("ne change pas avec la couleur de l'étendard", () => {
    const reference = generalLayout(image("Brennos", { gaulois: crowd(3) }), measure);
    for (const decor of DECORS) expect(generalLayout(image("Brennos", { decor: decor as Decor, gaulois: crowd(3) }), measure)).toEqual(reference);
  });
  it("se passe d'adresse quand le site n'en a pas, et de conseils quand il n'y en a pas", () => {
    const layout = generalLayout({ name: "Brennos", decor: "nuit", tips: [], siteUrl: "" }, measure);
    expect(layout.tiles).toEqual([]);
    expect(layout.texts).toHaveLength(3 + 6);
  });
});

describe("les conseils, sur le chemin de terre", () => {
  it("écrit tous les mots des quatre conseils, chacun à sa place, sans en couper un", () => {
    const layout = generalLayout(image("Brennos"), measure);
    expect(layout.tiles).toHaveLength(4);
    GENERAL_TIPS.forEach((tip, i) => {
      const tile = layout.tiles[i]!;
      const inside = layout.texts.filter((t) => tileOf(layout, t) === tile);
      expect(inside[0]?.text).toBe(tip.titre);
      expect(inside[0]?.font).toBe("strong");
      expect(inside.slice(1).flatMap((t) => words(t.text))).toEqual(words(tip.texte));
      expect(tile.icon.name).toBe(tip.icone);
    });
    expect(layout.texts.map((t) => t.text).join(" ")).not.toContain("…");
  });
  it("donne la même taille aux quatre titres, et la même aux quatre phrases", () => {
    const layout = generalLayout(image("Brennos"), measure);
    const inTiles = layout.texts.filter((t) => tileOf(layout, t));
    expect(new Set(inTiles.filter((t) => t.font === "strong").map((t) => t.size)).size).toBe(1);
    expect(new Set(inTiles.filter((t) => t.font === "body").map((t) => t.size)).size).toBe(1);
  });
  it("range les places des conseils dans leur zone, sans qu'elles se chevauchent", () => {
    const { tiles } = generalLayout(image("Brennos"), measure);
    for (const [i, a] of tiles.entries()) {
      expect(a.x).toBeGreaterThanOrEqual(GENERAL_ZONE.x);
      expect(a.x + a.width).toBeLessThanOrEqual(GENERAL_ZONE.x + GENERAL_ZONE.width + 0.5);
      expect(a.y).toBeGreaterThanOrEqual(GENERAL_ZONE.y);
      expect(a.y + a.height).toBeLessThanOrEqual(GENERAL_ZONE.y + GENERAL_ZONE.height + 0.5);
      for (const b of tiles.slice(i + 1)) expect(a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5).toBe(true);
    }
    // Quatre colonnes de même largeur, de gauche à droite dans l'ordre des conseils, sur toute la zone.
    expect(tiles.map((tile) => tile.y)).toEqual([GENERAL_ZONE.y, GENERAL_ZONE.y, GENERAL_ZONE.y, GENERAL_ZONE.y]);
    tiles.forEach((tile, i) => {
      expect(tile.width).toBeCloseTo(GENERAL_ZONE.width / 4, 5);
      expect(tile.x).toBeCloseTo(GENERAL_ZONE.x + (i * GENERAL_ZONE.width) / 4, 5);
      expect(tile.height).toBe(GENERAL_ZONE.height);
    });
  });
  it("pose chaque icône sur des pixels entiers, dans sa place", () => {
    const layout = generalLayout(image("Brennos"), measure);
    for (const tile of layout.tiles) {
      const { icon } = tile;
      const side = ICONES_PARTIES[icon.name].length * icon.cell;
      for (const value of [icon.x, icon.y, icon.cell]) expect(Number.isInteger(value)).toBe(true);
      expect(icon.cell).toBeGreaterThanOrEqual(3);
      expect(icon.x).toBeGreaterThanOrEqual(tile.x);
      expect(icon.x + side).toBeLessThanOrEqual(tile.x + tile.width);
      expect(icon.y).toBeGreaterThanOrEqual(tile.y);
      expect(icon.y + side).toBeLessThanOrEqual(tile.y + tile.height);
    }
  });
  it("pose chaque étape sur son bouclier, dans sa couleur, l'icône au milieu, le titre et la phrase centrés dessous", () => {
    const layout = generalLayout(image("Brennos"), measure);
    const centers = layout.tiles.map((tile) => tile.x + tile.width / 2);
    layout.tiles.forEach((tile, i) => {
      const side = ICONES_PARTIES[tile.icon.name].length * tile.icon.cell;
      expect(tile.scene).toBe(GENERAL_SCENES[i]);
      // L'icône : blanche, au milieu de sa colonne, à un demi-pixel près ; toutes à la même hauteur, celle du chemin.
      expect(tile.icon.full).toBe("#FFFFFF");
      expect(Math.abs(tile.icon.x + side / 2 - centers[i]!)).toBeLessThanOrEqual(0.5);
      expect(tile.icon.y).toBe(layout.tiles[0]!.icon.y);
      expect(tile.icon.cell).toBe(5);
      const inside = layout.texts.filter((t) => tileOf(layout, t) === tile);
      for (const t of inside) {
        expect(t.anchor).toBe("middle");
        expect(t.x).toBeCloseTo(centers[i]!, 5);
        expect(t.y - t.size * 0.8).toBeGreaterThan(tile.icon.y + side + 20);
      }
      // Les couleurs du bouclier sont dans le dessin.
      expect(layout.decor.defs).toContain(GENERAL_SCENES[i]!.color);
    });
    // Les quatre titres sur la même ligne.
    expect(new Set(layout.texts.filter((t) => tileOf(layout, t) && t.font === "strong").map((t) => t.y)).size).toBe(1);
    // Le chemin : un seul tracé, d'un bord de la zone à l'autre, sous les quatre boucliers.
    expect(layout.decor.body).toContain(`<path d="M${GENERAL_ZONE.x} `);
    expect(layout.decor.body.match(/<circle /g)).toHaveLength(4 * 3);
    expect(layout.extras).toEqual([]);
  });
});

describe("le village qui salue", () => {
  const all = (char: string) => !/\p{Extended_Pictographic}/u.test(char);

  it("ne garde d'un pseudo que ce que la police dessine, et rien s'il n'en reste ni lettre ni chiffre", () => {
    expect(pseudoOf("  Luern  le   Grand ", all)).toBe("Luern le Grand");
    expect(pseudoOf(`Luern${String.fromCodePoint(0x1f409)}`, all)).toBe("Luern");
    expect(pseudoOf(String.fromCodePoint(0x1f409, 0x1f525), all)).toBe("");
    expect(pseudoOf("--- !", all)).toBe("");
    expect(pseudoOf("", all)).toBe("");
  });
  it("sans Gaulois, ne pose ni pseudo ni bulle, et garde le village", () => {
    for (const gaulois of [undefined, []]) {
      const layout = generalLayout(image("Brennos", { gaulois }), measure);
      expect(layout.gaulois).toEqual([]);
      expect(layout.pseudos).toEqual([]);
      expect(layout.extras).toEqual([]);
      // La palissade, le chemin de terre, les huttes et le feu sont là quand même.
      expect(layout.decor.body.match(/scale\(7\)/g)).toHaveLength(4);
      expect(layout.decor.body).toContain("scale(5)");
    }
  });
  it("pose un Gaulois, puis autant qu'il en tient, chacun sous son pseudo, avec la bulle « Coucou ! »", () => {
    for (const count of [1, 3, GENERAL_GAULOIS_MAX, GENERAL_GAULOIS_MAX + 2]) {
      const layout = generalLayout(image("Brennos", { gaulois: crowd(count) }), measure);
      const shown = Math.min(count, GENERAL_GAULOIS_MAX);
      expect(layout.gaulois, `${count}`).toHaveLength(shown);
      expect(layout.pseudos.map((t) => t.text), `${count}`).toEqual(PSEUDOS.slice(0, shown));
      expect(layout.extras.map((t) => t.text)).toEqual([`Coucou${NBSP}!`]);
      // Les huttes : une de moins, la bulle a pris sa place.
      expect(layout.decor.body.match(/scale\(7\)/g)).toHaveLength(3);
      layout.gaulois.forEach((sprite, i) => {
        const box = spriteBox(sprite);
        const pseudo = layout.pseudos[i]!;
        // Debout sur le sol, dans sa tenue, à 2 pixels par case, le pseudo au milieu, au-dessus de sa tête.
        expect(box.bottom).toBe(GENERAL_VILLAGE.ground);
        expect(sprite.scale).toBe(GENERAL_VILLAGE.scale);
        expect(sprite.tenue).toEqual(crowd(count)[i]!.tenue);
        expect(pseudo.anchor).toBe("middle");
        expect(pseudo.x).toBeGreaterThan(box.left);
        expect(pseudo.x).toBeLessThan(box.right);
        expect(pseudo.y).toBeLessThan(box.top);
        expect(pseudo.font).toBe("body");
      });
    }
  });
  it("ne dit rien du temps réel", () => {
    const layout = generalLayout(image("Brennos", { gaulois: crowd(GENERAL_GAULOIS_MAX) }), measure);
    expect([...layout.texts, ...layout.extras].map((t) => t.text).join(" ")).not.toMatch(/en ligne|en ce moment|connecté/i);
  });
  it("coupe un pseudo trop long, avec ses points de suspension", () => {
    const long = "Un pseudo vraiment beaucoup trop long";
    const layout = generalLayout(image("Brennos", { gaulois: [{ nom: long, tenue: TENUE_DE_DEPART }, ...crowd(2)] }), measure);
    const pseudo = layout.pseudos[0]!;
    expect(pseudo.text.endsWith("…")).toBe(true);
    expect(long.startsWith(pseudo.text.slice(0, -1))).toBe(true);
    expect(measure(pseudo.text, pseudo.font, pseudo.size)).toBeLessThanOrEqual(GENERAL_VILLAGE.nameWidth);
  });
  it("ne pose pas un Gaulois dont le pseudo ne s'écrit pas, ni un Gaulois dont la tenue ne se lit pas", () => {
    const dragon = String.fromCodePoint(0x1f409);
    const gaulois: GeneralGaulois[] = [
      { nom: dragon, tenue: TENUE_DE_DEPART },
      { nom: "Luern", tenue: TENUE_DE_DEPART },
      { nom: "Sans tenue", tenue: {} },
      { nom: "Tenue cassée", tenue: null as unknown as GeneralGaulois["tenue"] },
      { nom: `Catumar${dragon}`, tenue: TENUE_DE_DEPART },
    ];
    const layout = generalLayout(image("Brennos", { gaulois }), measure, false, all);
    expect(layout.pseudos.map((t) => t.text)).toEqual(["Luern", "Catumar"]);
    expect(layout.gaulois).toHaveLength(2);
    // Si aucun ne peut paraître, pas de bulle non plus.
    expect(generalLayout(image("Brennos", { gaulois: [{ nom: dragon, tenue: TENUE_DE_DEPART }] }), measure, false, all).extras).toEqual([]);
  });
  it("garde les Gaulois, leurs pseudos et la bulle dans l'image, sans chevaucher ni un texte ni un autre Gaulois", () => {
    for (const seed of [7, 99, 2026]) {
      for (const count of [1, 2, GENERAL_GAULOIS_MAX]) {
        const layout = generalLayout(image("Un nom très long pour bien voir", { gaulois: crowd(count, seed) }), measure);
        const sprites = layout.gaulois.map(spriteBox);
        const written = [...layout.texts, ...layout.name, ...layout.extras, ...layout.pseudos].map((t) => boxOf(t, measure));
        const pseudos = layout.pseudos.map((t) => boxOf(t, measure));
        const where = `${seed} · ${count}`;
        for (const [i, box] of sprites.entries()) {
          expect(box.left, where).toBeGreaterThanOrEqual(0);
          expect(box.right, where).toBeLessThanOrEqual(GENERAL_WIDTH);
          // Sous les conseils, sur le sol.
          expect(box.top, where).toBeGreaterThan(GENERAL_ZONE.y + GENERAL_ZONE.height);
          expect(box.bottom, where).toBeLessThanOrEqual(GENERAL_HEIGHT);
          for (const text of written) expect(overlap(box, text), where).toBe(false);
          for (const other of sprites.slice(i + 1)) expect(overlap(box, other), where).toBe(false);
        }
        for (const [i, box] of pseudos.entries()) {
          expect(box.left, where).toBeGreaterThanOrEqual(MARGIN);
          expect(box.right, where).toBeLessThanOrEqual(GENERAL_WIDTH - MARGIN);
          expect(box.top, where).toBeGreaterThan(GENERAL_ZONE.y + GENERAL_ZONE.height);
          for (const other of pseudos.slice(i + 1)) expect(overlap(box, other), where).toBe(false);
        }
        for (const bubble of layout.extras.filter((t) => t.text.startsWith("Coucou")).map((t) => boxOf(t, measure))) {
          expect(bubble.left, where).toBeGreaterThanOrEqual(MARGIN);
          expect(bubble.top, where).toBeGreaterThan(GENERAL_VILLAGE.names);
          expect(bubble.bottom, where).toBeLessThan(GENERAL_VILLAGE.ground);
        }
      }
    }
  });
});

describe("generalSvg", () => {
  it("n'écrit ni NaN, ni undefined, ni Infinity, quels que soient le nom et les Gaulois", () => {
    for (const name of [...NAMES, ""]) {
      for (const [assets, gaulois] of [
        [noAssets, []],
        [fakeAssets, crowd(GENERAL_GAULOIS_MAX)],
      ] as const) {
        const svg = generalSvg(image(name, { gaulois }), fakeFonts, assets);
        expect(svg, `${name}`).not.toMatch(/NaN|undefined|Infinity/);
        expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${GENERAL_WIDTH}" height="${GENERAL_HEIGHT}"`)).toBe(true);
        expect(svg.endsWith("</svg>")).toBe(true);
      }
    }
  });
  it("montre la photo dans son carré, ou l'initiale du nom", () => {
    const withPhoto = generalSvg(image("brennos"), fakeFonts, fakeAssets);
    expect(withPhoto).toContain(`<image href="${fakeAssets.avatar}"`);
    const texts = (svg: string) => svg.match(/data-text/g)?.length ?? 0;
    // Sans photo : un texte de plus, l'initiale, et plus d'image dans le carré.
    const without = generalSvg(image("brennos"), fakeFonts, { ...fakeAssets, avatar: null });
    expect(without).not.toContain(fakeAssets.avatar);
    expect(texts(without)).toBe(texts(withPhoto) + 1);
    const drawn: CardText[] = [];
    generalSvg(image("brennos"), { width: measure, paths: (item) => (drawn.push(item), "") }, noAssets);
    expect(drawn.filter((t) => t.font === "name" && t.anchor === "middle").map((t) => t.text)).toEqual(["B"]);
  });
  it("dessine quand même si l'initiale ne s'écrit pas", () => {
    const paths = (item: CardText) => {
      if (item.font === "name" && item.anchor === "middle") throw new Error("glyphe inconnu");
      return "<g/>";
    };
    expect(generalSvg(image("Brennos"), { width: measure, paths }, noAssets)).toContain("</svg>");
  });
  it("pose le sceau du guerrier seulement avec le logo", () => {
    expect(generalSvg(image("Brennos"), fakeFonts, fakeAssets)).toContain(`<image href="${fakeAssets.warriorMask}"`);
    expect(generalSvg(image("Brennos"), fakeFonts, noAssets)).not.toContain("g-guerrier");
  });
  it("écrit les pseudos que la police dit savoir dessiner, et seulement eux", () => {
    const drawn: CardText[] = [];
    const fonts = { width: measure, paths: (item: CardText) => (drawn.push(item), ""), draws: (char: string) => char !== "x" };
    generalSvg(image("Brennos", { gaulois: [{ nom: "Luxern", tenue: TENUE_DE_DEPART }, { nom: "xxx", tenue: TENUE_DE_DEPART }] }), fonts, noAssets);
    expect(drawn.filter((t) => t.y === GENERAL_VILLAGE.names).map((t) => t.text)).toEqual(["Luern"]);
  });
  it("dessine les icônes en pixels nets, et aucun texte en police du système", () => {
    const svg = generalSvg(image("Brennos"), fakeFonts, fakeAssets);
    // Les quatre conseils, puis les quatre huttes et le feu du village.
    expect(svg.match(/scale\(\d+\)" shape-rendering="crispEdges"/g)).toHaveLength(4 + 5);
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("font-family");
  });
  it("ne reprend rien de l'étendard : ni son écharpe, ni son médaillon rond, ni le vert de terminal", () => {
    const svg = generalSvg(image("Brennos", { gaulois: crowd(2) }), fakeFonts, fakeAssets);
    for (const mark of ["av-halo", "av-clip", "nm-glow", "#4ADE80"]) expect(svg).not.toContain(mark);
  });
});

describe("le rendu, avec les vraies polices", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);
  const warrior = new WarriorAssets(root);
  const draws = (char: string) => fonts.draws(char, "name");
  const drawsBody = (char: string) => fonts.draws(char, "body");
  const width: Measure = (text, font, size) => fonts.width(text, font, size);

  it("garde chaque texte dans son cadre, sans en couper un, pour tous les noms", () => {
    for (const raw of NAMES) {
      const name = drawnName(raw, "gaulois", draws);
      for (const seal of [true, false]) {
        const layout = generalLayout(image(name, { gaulois: crowd(GENERAL_GAULOIS_MAX) }), width, seal, drawsBody);
        const where = `${name}`;
        for (const t of [...layout.texts, ...layout.name, ...layout.extras, ...layout.pseudos]) {
          const box = boxOf(t, width);
          const tile = tileOf(layout, t);
          expect(box.left, `${where} · « ${t.text} »`).toBeGreaterThanOrEqual((tile ? tile.x : MARGIN) - 0.5);
          expect(box.right, `${where} · « ${t.text} »`).toBeLessThanOrEqual((tile ? tile.x + tile.width - 8 : GENERAL_WIDTH - MARGIN) + 0.5);
          expect(box.top, `${where} · « ${t.text} »`).toBeGreaterThan(tile ? tile.y : 20);
          expect(box.bottom, `${where} · « ${t.text} »`).toBeLessThan(tile ? tile.y + tile.height : GENERAL_HEIGHT);
        }
        expect(layout.texts.map((t) => t.text).join(" "), where).not.toContain("…");
        // Le nom reste à droite de la photo, au-dessus des conseils.
        for (const t of layout.name) {
          expect(t.x).toBeGreaterThan(GENERAL_AVATAR.x + GENERAL_AVATAR.side + 24);
          expect(t.y + t.size * 0.25, where).toBeLessThanOrEqual(GENERAL_ZONE.y + 8);
        }
        if (name !== "W".repeat(32)) expect(layout.name.map((t) => t.text).join(" ").replace(/\s/g, ""), where).toBe(name.replace(/\s/g, ""));
      }
    }
  });
  it("écrit tous les mots des quatre conseils, en trois lignes au plus par phrase, sans qu'un texte en touche un autre ni son icône", () => {
    const layout = generalLayout(image("Brennos"), width, true);
    GENERAL_TIPS.forEach((tip, i) => {
      const tile = layout.tiles[i]!;
      const inside = layout.texts.filter((t) => tileOf(layout, t) === tile);
      expect(inside[0]?.text).toBe(tip.titre);
      expect(inside.slice(1).flatMap((t) => words(t.text))).toEqual(words(tip.texte));
      expect(inside.length - 1, `${tip.texte}`).toBeLessThanOrEqual(3);
      const side = ICONES_PARTIES[tile.icon.name].length * tile.icon.cell;
      const icon: Box = { left: tile.icon.x, right: tile.icon.x + side, top: tile.icon.y, bottom: tile.icon.y + side };
      const boxes = inside.map((t) => boxOf(t, width));
      for (const [k, box] of boxes.entries()) {
        expect(overlap(box, icon), inside[k]!.text).toBe(false);
        for (const other of boxes.slice(k + 1)) expect(overlap(box, other), inside[k]!.text).toBe(false);
      }
    });
    // Aucun texte de l'image n'en touche un autre.
    const said = [...layout.texts, ...layout.extras].map((t) => boxOf(t, width));
    for (const [k, box] of said.entries()) for (const other of said.slice(k + 1)) expect(overlap(box, other)).toBe(false);
  });
  it("n'écrit rien à lire sous 23 pixels, un titre de conseil jamais sous 26, sa phrase jamais sous 24, le nom jamais sous 44", () => {
    for (const raw of NAMES) {
      const layout = generalLayout(image(drawnName(raw, "gaulois", draws), { gaulois: crowd(GENERAL_GAULOIS_MAX) }), width, true, drawsBody);
      for (const t of [...layout.texts, ...layout.extras, ...layout.pseudos]) expect(t.size, `${t.text}`).toBeGreaterThanOrEqual(23);
      const inTiles = layout.texts.filter((t) => tileOf(layout, t));
      for (const t of inTiles.filter((item) => item.font === "strong")) expect(t.size, `${t.text}`).toBeGreaterThanOrEqual(26);
      for (const t of inTiles.filter((item) => item.font === "body")) expect(t.size, `${t.text}`).toBeGreaterThanOrEqual(24);
      for (const t of layout.name) expect(t.size, raw).toBeGreaterThanOrEqual(GENERAL_NAME.twoLines);
    }
    // Un nom courant tient sur une ligne, en grand.
    expect(generalLayout(image("Epona la Rapide"), width, true).name).toHaveLength(1);
    expect(generalLayout(image("Brennos"), width, true).name[0]?.size).toBe(GENERAL_NAME.max);
  });
  it("garde une espace fine devant « ! » et « : » dans le titre, plus étroite que l'espace entre deux mots", () => {
    for (const seal of [true, false]) {
      const title = generalLayout(image("Brennos"), width, seal).texts.filter((t) => t.font === "cases");
      expect(title.map((t) => t.text)).toEqual(["Ho", "!", "Un", "nouveau", "membre", ":"]);
      const gap = (i: number) => (title[i]!.x - (title[i - 1]!.x + drawnWidth(title[i - 1]!, width))) / title[i]!.size;
      // Devant « ! » et « : » : ni collé, ni un grand trou.
      for (const i of [1, 5]) {
        expect(gap(i), title[i]!.text).toBeCloseTo(GENERAL_TITLE.fine, 5);
        expect(gap(i)).toBeGreaterThanOrEqual(0.18);
        expect(gap(i)).toBeLessThanOrEqual(0.32);
      }
      for (const i of [2, 3, 4]) expect(gap(i), title[i]!.text).toBeCloseTo(GENERAL_TITLE.space, 5);
      expect(GENERAL_TITLE.fine).toBeLessThan(GENERAL_TITLE.space * 0.6);
    }
  });
  it("garde chaque texte lisible sur son fond, pseudos et bulle compris : 4,5:1 au moins", async () => {
    // Le contraste WCAG, contre le fond rendu sans texte sous chaque ligne : le plus clair des 5 % de pixels pour un texte
    // clair, le plus sombre pour un texte sombre (le parchemin, la bulle).
    const linear = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (r: number, g: number, b: number) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    const ofHex = (hex: string) => luminance(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
    const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const assets = { ...(await warrior.load()), avatar: null };
    const shown = image("Un nom très long pour bien voir", { gaulois: crowd(GENERAL_GAULOIS_MAX) });
    const layout = generalLayout(shown, width, assets.warriorMask !== null, drawsBody);
    const svg = generalSvg(shown, { width, paths: () => "", draws: (char, font) => fonts.draws(char, font) }, assets);
    const { data, info } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const t of [...layout.texts, ...layout.name, ...layout.extras, ...layout.pseudos].filter((line) => line.text.trim() !== "")) {
      const box = boxOf(t, width);
      const levels: number[] = [];
      for (let y = Math.round(t.y - t.size * 0.8); y <= Math.round(t.y + t.size * 0.1); y++) {
        for (let x = Math.round(box.left); x <= Math.round(box.right); x++) {
          const p = (y * info.width + x) * 3;
          levels.push(luminance(data[p]!, data[p + 1]!, data[p + 2]!));
        }
      }
      levels.sort((a, b) => a - b);
      const ink = ofHex(t.color);
      const worst = ink > 0.3 ? (levels[Math.floor(levels.length * 0.95)] ?? 1) : (levels[Math.floor(levels.length * 0.05)] ?? 0);
      expect(contrast(ink, worst), `« ${t.text} »`).toBeGreaterThanOrEqual(4.5);
    }
  }, 120_000);
  it("rend un PNG de 1 200 × 770 pour chaque couleur tirée, avec ou sans photo, avec 5 à 0 Gaulois", async () => {
    const photo = await sharp({ create: { width: 64, height: 48, channels: 4, background: { r: 200, g: 80, b: 40, alpha: 0.5 } } }).png().toBuffer();
    for (const [i, decor] of DECORS.entries()) {
      const name = drawnName(NAMES[i % NAMES.length]!, "gaulois", draws);
      const png = await renderGeneral(image(name, { decor, gaulois: crowd(GENERAL_GAULOIS_MAX - i) }), fonts, warrior, i % 2 === 0 ? photo : null);
      const meta = await sharp(png).metadata();
      expect([meta.format, meta.width, meta.height], decor).toEqual(["png", GENERAL_WIDTH, GENERAL_HEIGHT]);
      // Discord accepte dix mégaoctets : l'image en reste loin.
      expect(png.length, decor).toBeLessThan(1_500_000);
      expect(png.length, decor).toBeGreaterThan(20_000);
    }
  }, 120_000);
  it("montre la photo, et pose les Gaulois sur l'image", async () => {
    const photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 230, g: 160, b: 20 } } }).png().toBuffer();
    const pixels = async (png: Buffer) => sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = ({ data, info }: Awaited<ReturnType<typeof pixels>>, x: number, y: number) => {
      const p = (y * info.width + x) * 3;
      return [data[p], data[p + 1], data[p + 2]];
    };
    const bare = await pixels(await renderGeneral(image("Brennos"), fonts, warrior, null));
    const full = await pixels(await renderGeneral(image("Brennos", { gaulois: crowd(1) }), fonts, warrior, photo));
    expect(at(full, GENERAL_AVATAR.x + 20, GENERAL_AVATAR.y + 20)).toEqual([230, 160, 20]);
    expect(at(bare, GENERAL_AVATAR.x + 20, GENERAL_AVATAR.y + 20)).not.toEqual([230, 160, 20]);
    // Le Gaulois : là où il se tient, l'image n'est plus celle du village vide.
    const box = spriteBox(generalLayout(image("Brennos", { gaulois: crowd(1) }), width, true, drawsBody).gaulois[0]!);
    let changed = 0;
    for (let y = box.top; y < box.bottom; y++) for (let x = box.left; x < box.right; x++) if (at(full, x, y).join() !== at(bare, x, y).join()) changed++;
    expect(changed).toBeGreaterThan(1000);
  }, 120_000);
  it("dessine un nom et des pseudos que seule une partie des polices connaît", async () => {
    const odd = ["Иван Петров", "Ωmega::--!=", `[GAL]${String.fromCodePoint(0x300e)}Luern${String.fromCodePoint(0x1f409)}`, String.fromCodePoint(0x1f409, 0x5c71)];
    const gaulois = odd.map((nom) => ({ nom, tenue: TENUE_DE_DEPART }));
    // Le dernier pseudo, un émoji et un idéogramme, ne s'écrit pas : son Gaulois ne paraît pas.
    expect(generalLayout(image("Brennos", { gaulois }), width, true, drawsBody).pseudos.map((t) => t.text)).toEqual(["Иван Петров", "Ωmega::--!=", "[GAL]Luern"]);
    for (const raw of odd.slice(0, 3)) {
      const png = await renderGeneral(image(drawnName(raw, "gaulois", draws), { decor: "nuit", gaulois }), fonts, warrior, null);
      expect((await sharp(png).metadata()).width, raw).toBe(GENERAL_WIDTH);
    }
  }, 120_000);
  it("remplace une photo illisible par l'initiale, sans échouer", async () => {
    const broken = await renderGeneral(image("Brennos"), fonts, warrior, Buffer.from("ceci n'est pas une image"));
    const without = await renderGeneral(image("Brennos"), fonts, warrior, null);
    expect((await sharp(broken).metadata()).height).toBe(GENERAL_HEIGHT);
    expect(broken.equals(without)).toBe(true);
  }, 120_000);
});

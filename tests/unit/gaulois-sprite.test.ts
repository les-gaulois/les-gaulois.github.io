import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { accueilCard } from "../../src/lib/accueil-image";
import { activeCard } from "../../src/lib/actifs-image";
import { welcomeCard } from "../../src/lib/bienvenue-image";
import { ficheCard, type FicheFacts } from "../../src/lib/fiche-image";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, TENUE_DE_DEPART, casesDuGaulois, tenueAuHasard, type Tenue } from "../../src/lib/gaulois";
import { AUCUN_GAULOIS, type GauloisParJoueur } from "../../src/lib/gaulois-joueurs";
import { BUST_CUT, SPRITE_AXIS, placeSprite, spriteLayers, spritePixels, spriteRect, tenueOf, type SpritePlacement } from "../../src/lib/gaulois-sprite";
import type { GazetteEdition } from "../../src/lib/gazette";
import { CARD_COLORS, GazetteFonts, gazetteCard, podiumParts, renderGazetteCard, type CardText, type GazetteCard, type Measure } from "../../src/lib/gazette-image";
import { groupsCard } from "../../src/lib/groupes-image";
import { milestoneCard } from "../../src/lib/paliers-franchis-image";
import { CHIP_GAP, chipLayout, chipParts, chipsHeight, rowParts, rowsCard, type CardRow } from "../../src/lib/salon-image";
import type { Victory } from "../../src/lib/victoires";
import { victoryCard } from "../../src/lib/victoires-image";

/** Une largeur approchée, pour tester la mise en page sans police. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);
const SITE = "https://les-gaulois.github.io";

/** Un tirage toujours le même. */
function tirage(graine: number): () => number {
  let g = graine;
  return () => {
    g = (g * 1103515245 + 12345) % 2147483648;
    return g / 2147483648;
  };
}
const hasard = tirage(7);
const TENUES: Tenue[] = [TENUE_DE_DEPART, ...Array.from({ length: 12 }, () => tenueAuHasard(hasard))];
const gauloisOf = (ids: readonly string[]): GauloisParJoueur => new Map(ids.map((id, i) => [id, TENUES[i % TENUES.length]!]));

/** Le rectangle d'un texte, d'après la largeur approchée : de sa ligne de base à sa hauteur d'œil, largement comptée. */
function textBox(t: CardText) {
  const width = measure(t.text, t.font, t.size);
  const x = t.anchor === "end" ? t.x - width : t.anchor === "middle" ? t.x - width / 2 : t.x;
  return { x, y: t.y - t.size, width, height: t.size * 1.25 };
}
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Ce que toute image doit tenir : chaque Gaulois dans l'image, sur des pixels entiers, sans couvrir un texte ni un autre Gaulois. */
function expectClean(card: GazetteCard) {
  const sprites = card.gaulois ?? [];
  for (const sprite of sprites) {
    const r = spriteRect(sprite);
    expect(Number.isInteger(sprite.scale) && sprite.scale >= 1).toBe(true);
    expect([r.x, r.y].every(Number.isInteger)).toBe(true);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(card.width);
    expect(r.y + r.height).toBeLessThanOrEqual(card.height);
    for (const text of card.texts) expect(overlaps(r, textBox(text)), `le Gaulois couvre « ${text.text} »`).toBe(false);
  }
  sprites.forEach((a, i) => sprites.slice(i + 1).forEach((b) => expect(overlaps(spriteRect(a), spriteRect(b))).toBe(false)));
  // Avoir un Gaulois ne coupe aucun texte.
  expect(card.texts.filter((t) => t.text.endsWith("…"))).toEqual([]);
}

describe("le Gaulois d'un membre", () => {
  it("n'existe que pour un identifiant de la carte, avec une tenue que le village sait lire", () => {
    const gaulois: GauloisParJoueur = new Map<string, Tenue>([
      ["bon", TENUE_DE_DEPART],
      ["objet-inconnu", { ...TENUE_DE_DEPART, tete: "couronne-de-l-avenir" }],
      ["trou", { peau: "claire" }],
      ["faux", "pas une tenue" as unknown as Tenue],
      ["vide", null as unknown as Tenue],
    ]);
    expect(tenueOf(gaulois, "bon")).toEqual(TENUE_DE_DEPART);
    for (const id of ["objet-inconnu", "trou", "faux", "vide", "absent", "", null, undefined]) expect(tenueOf(gaulois, id)).toBeNull();
    expect(tenueOf(AUCUN_GAULOIS, "bon")).toBeNull();
  });
  it("une tenue illisible ne fait planter aucune image : le membre garde sa pastille, sans Gaulois", () => {
    const gaulois: GauloisParJoueur = new Map([["a", { ...TENUE_DE_DEPART, arme: "inconnue" } as Tenue]]);
    const items = [{ text: "Alpha", named: true, id: "a" }];
    expect(chipLayout(items, measure, 1128, gaulois)).toEqual(chipLayout(items, measure, 1128));
  });
});

describe("placeSprite", () => {
  it("pose un Gaulois entier, les pieds sur le sol, centré sur l'axe de son corps, rogné à son contour", () => {
    const p = placeSprite(TENUE_DE_DEPART, { axis: 600, bottom: 500, scale: 6 })!;
    const r = spriteRect(p);
    expect(r.y + r.height).toBe(500);
    expect(p.x + (SPRITE_AXIS - p.crop.left) * p.scale).toBe(600);
    expect(p.crop.top + p.crop.height).toBeLessThanOrEqual(GAULOIS_HAUTEUR);
    expect(p.crop.left + p.crop.width).toBeLessThanOrEqual(GAULOIS_LARGEUR);
    // Rogné au contour : la première et la dernière rangée, la première et la dernière colonne ont une case pleine.
    const cells = casesDuGaulois(TENUE_DE_DEPART);
    const at = (column: number, row: number) => cells[row * GAULOIS_LARGEUR + column] ?? null;
    const columns = Array.from({ length: p.crop.width }, (_, i) => p.crop.left + i);
    const rows = Array.from({ length: p.crop.height }, (_, i) => p.crop.top + i);
    expect(columns.some((c) => at(c, p.crop.top))).toBe(true);
    expect(columns.some((c) => at(c, p.crop.top + p.crop.height - 1))).toBe(true);
    expect(rows.some((row) => at(p.crop.left, row))).toBe(true);
    expect(rows.some((row) => at(p.crop.left + p.crop.width - 1, row))).toBe(true);
  });
  it("coupe un buste à sa rangée, et rogne le haut plutôt que de dépasser la place donnée", () => {
    const bust = placeSprite(TENUE_DE_DEPART, { axis: 100, bottom: 300, scale: 2, cut: BUST_CUT })!;
    expect(bust.crop.top + bust.crop.height).toBe(BUST_CUT);
    expect(spriteRect(bust).y + spriteRect(bust).height).toBe(300);
    const tight = placeSprite(TENUE_DE_DEPART, { axis: 100, bottom: 300, scale: 2, cut: BUST_CUT, room: 31 })!;
    expect(spriteRect(tight).height).toBe(30);
    expect(tight.crop.top + tight.crop.height).toBe(BUST_CUT);
    expect(placeSprite(TENUE_DE_DEPART, { axis: 100, bottom: 300, scale: 2, cut: BUST_CUT, room: 1 })).toBeNull();
  });
  it("garde un nombre entier de pixels par case, quelle que soit la taille demandée", () => {
    expect(placeSprite(TENUE_DE_DEPART, { axis: 10.4, bottom: 99.6, scale: 2.4 })).toMatchObject({ scale: 2 });
    expect(placeSprite(TENUE_DE_DEPART, { axis: 0, bottom: 0, scale: 0 })).toMatchObject({ scale: 1 });
  });
});

describe("le calque d'un Gaulois", () => {
  it("dessine chaque case en un carré plein de sa couleur, sans lissage : net à toutes les tailles", () => {
    const cells = casesDuGaulois(TENUE_DE_DEPART);
    for (const scale of [1, 2, 6]) {
      const p = placeSprite(TENUE_DE_DEPART, { axis: 0, bottom: 0, scale })!;
      const { data, width, height } = spritePixels(p);
      expect([width, height]).toEqual([p.crop.width * scale, p.crop.height * scale]);
      const colors = new Set<string>();
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = cells[(p.crop.top + Math.floor(y / scale)) * GAULOIS_LARGEUR + p.crop.left + Math.floor(x / scale)] ?? null;
          const i = (y * width + x) * 4;
          const hex = `#${[data[i], data[i + 1], data[i + 2]].map((v) => (v ?? 0).toString(16).padStart(2, "0")).join("")}`;
          // Opaque ou transparent, jamais entre les deux.
          expect(data[i + 3]).toBe(cell ? 255 : 0);
          if (cell) {
            expect(hex).toBe(cell.toLowerCase());
            colors.add(hex);
          }
        }
      }
      // Aucune couleur née d'un mélange : seulement celles du dessin.
      expect([...colors].every((c) => cells.some((cell) => cell?.toLowerCase() === c))).toBe(true);
    }
  });
  it("ne dessine pas un Gaulois qui sortirait de l'image", () => {
    const inside = placeSprite(TENUE_DE_DEPART, { axis: 200, bottom: 300, scale: 2 })!;
    const outside: SpritePlacement[] = [{ ...inside, x: -1 }, { ...inside, y: -5 }, { ...inside, x: 390 }, { ...inside, y: 290 }];
    expect(spriteLayers([inside, ...outside], 400, 300)).toHaveLength(1);
    expect(spriteLayers(undefined, 400, 300)).toEqual([]);
  });
  it("se pose sur l'image avec ses couleurs exactes", async () => {
    const root = process.cwd();
    const fonts = new GazetteFonts(root);
    const sprite = placeSprite(TENUE_DE_DEPART, { axis: 200, bottom: 190, scale: 3 })!;
    const card: GazetteCard = { width: 400, height: 200, rects: [], texts: [], logo: { x: 0, y: 0, size: 0 }, gaulois: [sprite] };
    const png = await renderGazetteCard(card, fonts, root);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const cells = casesDuGaulois(TENUE_DE_DEPART);
    let checked = 0;
    for (let row = 0; row < sprite.crop.height; row++) {
      for (let column = 0; column < sprite.crop.width; column++) {
        const cell = cells[(sprite.crop.top + row) * GAULOIS_LARGEUR + sprite.crop.left + column];
        if (!cell) continue;
        // Les quatre coins du carré de la case ont sa couleur.
        for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2]] as const) {
          const i = ((sprite.y + row * 3 + dy) * info.width + sprite.x + column * 3 + dx) * info.channels;
          expect(`#${[data[i], data[i + 1], data[i + 2]].map((v) => (v ?? 0).toString(16).padStart(2, "0")).join("")}`).toBe(cell.toLowerCase());
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(300);
  });
});

/* ---------- Les pastilles ---------- */

const NAMES = ["Brennos", "Epona la Rapide", "lug_du_nord", "Sucellos", "Taranis.0815", "Belisama", "Иван Петрович", "Capitaine Barbe GOAT.7362", "Cernunnos", "Rosmerta_22", "Ogmios", "Nantosuelta", "Lug"];
const chipItems = (count: number) => Array.from({ length: count }, (_, i) => ({ text: NAMES[i % NAMES.length]!, named: true, id: `m${i}` }));

describe("les pastilles avec des Gaulois", () => {
  it("sans Gaulois, la mise en page est exactement celle d'avant, identifiants ou non", () => {
    for (const count of [0, 1, 8, 24, 50]) {
      const plain = chipItems(count).map(({ text, named }) => ({ text, named }));
      const before = chipLayout(plain, measure, 1128);
      expect(chipLayout(chipItems(count), measure, 1128)).toEqual(before);
      expect(chipLayout(chipItems(count), measure, 1128, AUCUN_GAULOIS)).toEqual(before);
      expect(chipLayout(chipItems(count), measure, 1128, gauloisOf(["quelqu-un-d-autre"]))).toEqual(before);
      expect(before.lifts).toBeUndefined();
      expect(chipParts(chipLayout(chipItems(count), measure, 1128), 36, 500)).toEqual(chipParts(before, 36, 500));
    }
  });
  it("seule une ligne qui a un Gaulois prend de la hauteur, juste ce qu'il faut pour le plus grand", () => {
    const items = chipItems(24);
    const before = chipLayout(items, measure, 1128);
    expect(before.rows.length).toBeGreaterThanOrEqual(3);
    // Un seul Gaulois, sur la dernière ligne.
    const lastId = `m${items.length - 1}`;
    const layout = chipLayout(items, measure, 1128, gauloisOf([lastId]));
    expect(layout.rows.map((row) => row.map((chip) => chip.text))).toEqual(before.rows.map((row) => row.map((chip) => chip.text)));
    const lifts = layout.lifts!;
    expect(lifts.slice(0, -1).every((lift) => lift === 0)).toBe(true);
    const sprite = layout.rows.at(-1)!.find((chip) => chip.sprite)!.sprite!;
    expect(lifts.at(-1)).toBeGreaterThanOrEqual(spriteRect(sprite).height - CHIP_GAP);
    expect(lifts.at(-1)).toBeLessThanOrEqual(spriteRect(sprite).height);
    expect(chipsHeight(layout)).toBe(chipsHeight(before) + lifts.at(-1)!);
  });
  it("chaque Gaulois se tient au-dessus de sa pastille, sans en dépasser sur les côtés, et les pastilles suivent", () => {
    const items = chipItems(24);
    const layout = chipLayout(items, measure, 1128, gauloisOf(items.map((item) => item.id)));
    const parts = chipParts(layout, 36, 700);
    expect(parts.gaulois).toHaveLength(24);
    const boxes = parts.rects;
    for (const sprite of parts.gaulois!) {
      const r = spriteRect(sprite);
      const chip = boxes.find((box) => box.y === r.y + r.height && box.x <= r.x && r.x + r.width <= box.x + box.width);
      expect(chip, "un Gaulois sans pastille sous lui").toBeDefined();
    }
    // Aucune pastille ne sort de la largeur donnée, et le haut du premier Gaulois ne monte pas au-dessus du départ.
    for (const box of boxes) expect(box.x + box.width).toBeLessThanOrEqual(36 + 1128);
    expect(Math.min(...parts.gaulois!.map((s) => s.y))).toBeGreaterThanOrEqual(700 - CHIP_GAP);
    expect(Math.max(...boxes.map((box) => box.y + box.height))).toBe(700 + chipsHeight(layout));
  });
  it("une pastille au nom très court s'élargit pour porter son Gaulois, le nom au milieu", () => {
    const layout = chipLayout([{ text: "X", named: true, id: "m0" }], measure, 1128, gauloisOf(["m0"]));
    const chip = layout.rows[0]![0]!;
    const r = spriteRect(chip.sprite!);
    expect(chip.width).toBeGreaterThanOrEqual(2 * Math.max(-r.x, r.x + r.width));
    const text = measure(chip.text, "strong", chip.size);
    expect(Math.abs(chip.inset + text / 2 - chip.width / 2)).toBeLessThanOrEqual(1);
  });
  it("ni un clan en face, ni un compte, ni le mot « contre » ne porte de Gaulois", () => {
    const gaulois = gauloisOf(["m0"]);
    const layout = chipLayout(
      [
        { text: "contre", named: false, word: true, id: "m0" },
        { text: "[UN]", named: false, red: true, id: "m0" },
        { text: "2 Gaulois sans nom", named: false, id: "m0" },
      ],
      measure,
      1128,
      gaulois,
    );
    expect(layout.lifts).toBeUndefined();
    expect(layout.rows.flat().some((chip) => chip.sprite)).toBe(false);
  });
});

/* ---------- Les lignes ---------- */

const rows = (count: number): CardRow[] => Array.from({ length: count }, (_, i) => ({ badge: `${i + 1}`, strong: i === 0, name: NAMES[i % NAMES.length]!, detail: i % 2 === 0 ? "31 parties, 17 victoires" : null, ids: [`m${i}`] }));

describe("les lignes avec des Gaulois", () => {
  it("sans Gaulois, les lignes sont exactement celles d'avant", () => {
    for (const compact of [false, true]) {
      const before = rowParts(rows(5).map(({ badge, strong, name, detail }) => ({ badge, strong, name, detail })), 230, 120, compact, measure);
      expect(rowParts(rows(5), 230, 120, compact, measure)).toEqual(before);
      expect(rowParts(rows(5), 230, 120, compact, measure, "onciale", AUCUN_GAULOIS)).toEqual(before);
      expect(before.gaulois).toBeUndefined();
    }
  });
  it("le Gaulois se pose après le nom, sans changer la hauteur des lignes ni déplacer un texte", () => {
    for (const compact of [false, true]) {
      const before = rowParts(rows(5), 230, 120, compact, measure);
      const after = rowParts(rows(5), 230, 120, compact, measure, "onciale", gauloisOf(["m0", "m1", "m3"]));
      expect(after.bottom).toBe(before.bottom);
      expect(after.rects).toEqual(before.rects);
      expect(after.texts).toEqual(before.texts);
      expect(after.gaulois).toHaveLength(3);
      const lines = after.rects.filter((r) => r.width > 1000);
      for (const sprite of after.gaulois!) {
        const r = spriteRect(sprite);
        const line = lines.find((l) => r.y + r.height === l.y + l.height - 1)!;
        expect(line, "un Gaulois sans ligne").toBeDefined();
        // La tête ne monte pas jusqu'à la ligne du dessus.
        expect(r.y).toBeGreaterThan(line.y - (compact ? 8 : 10));
        for (const text of after.texts) expect(overlaps(r, textBox(text))).toBe(false);
      }
    }
  });
  it("un duo porte ses deux Gaulois, dans l'ordre des noms", () => {
    const duo: CardRow[] = [{ badge: "12 victoires", strong: true, name: "Brennos et Epona la Rapide", detail: "sur 15 parties", ids: ["m0", "m1"] }];
    const parts = rowParts(duo, 600, 230, true, measure, "onciale", gauloisOf(["m0", "m1"]));
    expect(parts.gaulois).toHaveLength(2);
    const [a, b] = parts.gaulois!.map(spriteRect);
    expect(a!.x + a!.width).toBeLessThan(b!.x);
    expect(parts.gaulois!.map((s) => s.tenue)).toEqual([TENUES[0], TENUES[1]]);
  });
  it("plutôt que de couper un nom, la ligne se passe de Gaulois", () => {
    const long: CardRow[] = [{ badge: "1er", strong: true, name: "W".repeat(52), detail: "31 parties, 17 victoires", ids: ["m0"] }];
    const before = rowParts(long, 230, 120, false, measure);
    expect(before.texts.some((t) => t.text === long[0]!.name)).toBe(true);
    expect(rowParts(long, 230, 120, false, measure, "onciale", gauloisOf(["m0"]))).toEqual(before);
  });
});

/* ---------- Les images entières ---------- */

const VICTORY: Victory = {
  id: "x",
  start: "2026-11-12T17:04:58.000Z",
  map: "Four Islands",
  seconds: 943,
  format: "4",
  gaulois: 9,
  players: 23,
  points: 1.81,
  crew: Array.from({ length: 8 }, (_, i) => ({ id: i === 7 ? null : `m${i}`, name: NAMES[i]! })),
  unnamed: 1,
  outsiders: 0,
  rivals: ["UN", "ITA"],
};
const SQUARE = { width: 256, height: 256, open: false };
const PERIOD = { since: "2026-11-11T13:54:00.000Z", until: "2026-11-12T13:53:00.000Z" };
const FACTS: FicheFacts = { id: "m0", username: "Capitaine Barbe GOAT.7362", rank: 3, ranked: 782, wins: 1906, losses: 1624, games: 3530, rate: 54, tier: 1000, nextTier: { wins: 2500, missing: 594 } };
const LISTED = "2026-11-13T08:53:00.000Z";
const players = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `m${i}`, username: NAMES[i % NAMES.length]!, tier: 100 }));
const duo = (a: number, b: number) => ({ a: { id: `m${a}`, name: NAMES[a]! }, b: { id: `m${b}`, name: NAMES[b]! }, wins: 9, games: 12 });
const WEEK = { monday: "2026-11-02", games: 412, groupGames: 251, points: 200, groupPoints: 194, perGame: { "1": 0.04, "2": 0.31, "3": 0.72, "4": 1.86 }, duos: [duo(0, 1), duo(0, 3), duo(1, 4)] };
const arrivals = (count: number) => ({ ...PERIOD, named: Array.from({ length: count }, (_, i) => ({ id: `m${i}`, username: NAMES[i % NAMES.length]!, joinedAt: "2026-11-11T14:03:00.000Z" })), anonymous: 2 });
const active = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, username: NAMES[i]!, games: 30 - i, wins: 17 - i, place: i + 1 }));
const podium = Array.from({ length: 3 }, (_, i) => ({ id: `m${i}`, username: NAMES[i]!, wins: 60 - i, place: i + 1 }));
const EDITION: GazetteEdition = {
  from: "2026-11-02",
  to: "2026-11-08",
  totals: { games: 540, wins: 293, winRate: 54.3 },
  previous: null,
  highlights: null,
  standing: null,
  territory: null,
  arrivals: null,
  players: podium,
  playersSince: "2026-11-02T00:10:00.000Z",
  active: null,
  milestones: null,
};
const ACCUEIL = { ranking: { rank: 2, listed: 100, score: 1234.5, at: LISTED }, podium: { period: "du 5 nov. au 8 nov.", week: "du 2 nov. au 8 nov. 2026", players: podium } };

/** Chaque image qui nomme des membres : dessinée avec la carte des Gaulois donnée. */
const IMAGES: Record<string, (gaulois?: GauloisParJoueur) => GazetteCard> = {
  "victoire avec vignette": (g) => victoryCard(VICTORY, "GAL", SITE, measure, SQUARE, undefined, g),
  "victoire sans vignette": (g) => victoryCard(VICTORY, "GAL", SITE, measure, null, undefined, g),
  "victoire à vingt-quatre": (g) => victoryCard({ ...VICTORY, crew: chipItems(24).map(({ text, id }) => ({ id, name: text })) }, "GAL", SITE, measure, SQUARE, undefined, g),
  fiche: (g) => ficheCard(FACTS, "GAL", SITE, LISTED, measure, g),
  "plus actifs": (g) => activeCard(active, PERIOD, "GAL", SITE, measure, g),
  "paliers en lignes": (g) => milestoneCard(players(4), { ...PERIOD, players: [] }, "GAL", SITE, measure, g),
  "paliers en lignes basses et pastilles": (g) => milestoneCard(players(17), { ...PERIOD, players: [] }, "GAL", SITE, measure, g),
  "bienvenue en lignes": (g) => welcomeCard(arrivals(3), "GAL", SITE, measure, g),
  "bienvenue en pastilles": (g) => welcomeCard(arrivals(9), "GAL", SITE, measure, g),
  "jouer ensemble": (g) => groupsCard(WEEK, "GAL", SITE, measure, g),
  gazette: (g) => gazetteCard(EDITION, "GAL", SITE, measure, g),
  accueil: (g) => accueilCard(ACCUEIL, "GAL", "Les Gaulois", "Clan OpenFront", SITE, measure, g),
};
const ALL = gauloisOf(Array.from({ length: 24 }, (_, i) => `m${i}`));
const SOME = gauloisOf(["m0", "m2", "m3", "m9", "m16"]);

describe("les images qui nomment des membres", () => {
  for (const [name, draw] of Object.entries(IMAGES)) {
    it(`${name} : sans Gaulois, exactement l'image d'avant`, () => {
      const before = draw();
      expect(before.gaulois).toBeUndefined();
      expect("gaulois" in before).toBe(false);
      expect(draw(AUCUN_GAULOIS)).toEqual(before);
      // Des Gaulois, mais d'autres membres ; et des tenues illisibles pour ceux de l'image.
      expect(draw(gauloisOf(["quelqu-un-d-autre"]))).toEqual(before);
      expect(draw(new Map(Array.from({ length: 24 }, (_, i) => [`m${i}`, { tete: "inconnu" } as Tenue])))).toEqual(before);
    });
    it(`${name} : avec des Gaulois, rien ne déborde, aucun texte n'est couvert ni coupé`, () => {
      for (const gaulois of [ALL, SOME]) {
        const card = draw(gaulois);
        expect((card.gaulois ?? []).length).toBeGreaterThan(0);
        expectClean(card);
        // Les mêmes mots qu'avant, dans le même ordre : un Gaulois n'ajoute ni ne retire rien de ce qui est écrit.
        expect(card.texts.map((t) => t.text)).toEqual(draw().texts.map((t) => t.text));
      }
    });
  }
  it("une victoire ne grandit que de ses lignes de pastilles qui ont un Gaulois", () => {
    const before = victoryCard(VICTORY, "GAL", SITE, measure, SQUARE);
    const one = victoryCard(VICTORY, "GAL", SITE, measure, SQUARE, undefined, gauloisOf(["m0"]));
    const sprite = one.gaulois![0]!;
    const grown = one.height - before.height;
    expect(grown).toBeGreaterThan(0);
    expect(grown).toBeLessThanOrEqual(spriteRect(sprite).height);
    // Le Gaulois est au-dessus de la pastille bleue de son membre, pas sur elle.
    const chip = one.rects.find((r) => r.color === CARD_COLORS.BLUE && r.y === sprite.y + spriteRect(sprite).height)!;
    expect(chip).toBeDefined();
    expect(one.texts.find((t) => t.text === "Brennos")!.y).toBeGreaterThan(chip.y);
    // Un membre sans fiche (identifiant absent) n'a jamais de Gaulois.
    expect(victoryCard({ ...VICTORY, crew: VICTORY.crew.map((p) => ({ ...p, id: null })) }, "GAL", SITE, measure, SQUARE, undefined, ALL)).toEqual(before);
  });
  it("la fiche garde son format : le Gaulois en entier à droite, la place et les chiffres serrés à gauche", () => {
    const before = ficheCard(FACTS, "GAL", SITE, LISTED, measure);
    const card = ficheCard(FACTS, "GAL", SITE, LISTED, measure, ALL);
    expect([card.width, card.height]).toEqual([before.width, before.height]);
    const [sprite] = card.gaulois!;
    const r = spriteRect(sprite!);
    expect(sprite!.crop.top + sprite!.crop.height).toBeGreaterThan(BUST_CUT + 10);
    for (const rect of card.rects.filter((rect) => rect.height > 60)) expect(rect.x + rect.width).toBeLessThanOrEqual(r.x);
    expect(card.texts.find((t) => t.text === FACTS.username)).toBeDefined();
    // Sans identifiant, la fiche d'avant.
    expect(ficheCard({ ...FACTS, id: null }, "GAL", SITE, LISTED, measure, ALL)).toEqual(before);
  });
  it("au podium, le buste ne monte jamais dans ce qui est écrit au-dessus, et la liste des égalités n'en porte pas", () => {
    const parts = podiumParts(podium, { x: 640, width: 524, base: 726, listTop: 462, ceiling: 424 }, measure, ALL);
    expect(parts.gaulois).toHaveLength(3);
    for (const sprite of parts.gaulois!) expect(sprite.y).toBeGreaterThanOrEqual(424);
    const tied = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, username: NAMES[i]!, wins: 9, place: 1 }));
    expect(podiumParts(tied, { x: 640, width: 524, base: 726, listTop: 462 }, measure, ALL)).toEqual(podiumParts(tied, { x: 640, width: 524, base: 726, listTop: 462 }, measure));
  });
  it("rowsCard accepte des pastilles en texte seul ou avec leur identifiant", () => {
    const base = { kicker: "k", title: "Titre", period: "p", rows: [], footnotes: [], address: "les-gaulois.github.io/liste", note: "", badgeWidth: 120 };
    const plain = rowsCard({ ...base, chips: ["Alpha", "Bravo"] }, measure);
    expect(rowsCard({ ...base, chips: [{ text: "Alpha", id: "m0" }, { text: "Bravo" }] }, measure)).toEqual(plain);
    const withOne = rowsCard({ ...base, chips: [{ text: "Alpha", id: "m0" }, { text: "Bravo" }] }, measure, ALL);
    expect(withOne.gaulois).toHaveLength(1);
    expect(withOne.height).toBeGreaterThan(plain.height);
    expectClean(withOne);
  });
});

describe("le rendu avec les vraies polices", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);
  it("chaque image se dessine avec ses Gaulois, sans texte couvert ni coupé, à la taille prévue", async () => {
    for (const [name, draw] of Object.entries({
      victoire: (g: GauloisParJoueur) => victoryCard(VICTORY, "GAL", SITE, fonts.width, SQUARE, undefined, g),
      fiche: (g: GauloisParJoueur) => ficheCard(FACTS, "GAL", SITE, LISTED, fonts.width, g),
      paliers: (g: GauloisParJoueur) => milestoneCard(players(17), { ...PERIOD, players: [] }, "GAL", SITE, fonts.width, g),
      duos: (g: GauloisParJoueur) => groupsCard(WEEK, "GAL", SITE, fonts.width, g),
    })) {
      const card = draw(ALL);
      const sprites = card.gaulois ?? [];
      expect(sprites.length, name).toBeGreaterThan(0);
      expect(card.texts.filter((t) => t.text.endsWith("…")), name).toEqual([]);
      for (const sprite of sprites) {
        const r = spriteRect(sprite);
        for (const text of card.texts) {
          const width = fonts.width(text.text, text.font, text.size);
          const x = text.anchor === "end" ? text.x - width : text.anchor === "middle" ? text.x - width / 2 : text.x;
          expect(overlaps(r, { x, y: text.y - text.size, width, height: text.size * 1.25 }), `${name} : le Gaulois couvre « ${text.text} »`).toBe(false);
        }
      }
      const png = await renderGazetteCard(card, fonts, root);
      const meta = await sharp(png).metadata();
      expect([meta.width, meta.height], name).toEqual([card.width, card.height]);
      // Sans Gaulois, le dessin est celui d'avant, au pixel près.
      const before = await renderGazetteCard(draw(AUCUN_GAULOIS), fonts, root);
      expect(before.equals(await renderGazetteCard(draw(new Map()), fonts, root)), name).toBe(true);
    }
  }, 60_000);
});

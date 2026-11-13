import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { accueilCard, accueilFacts, accueilRanking } from "../../src/lib/accueil-image";
import { alertCard } from "../../src/lib/alerts-image";
import { courseCard } from "../../src/lib/course-soir-image";
import { ficheCard } from "../../src/lib/fiche-image";
import { CARD_COLORS, cardSvg, drawnWidth, fittedDrawn, GazetteFonts, gazetteCard, HEAD_X, kpiParts, lettrineOf, LOGO, pageFoot, pageHead, pathOf, renderGazetteCard, tableSvg, type CardText, type GazetteCard, type Measure } from "../../src/lib/gazette-image";
import { groupsCard } from "../../src/lib/groupes-image";
import { GUICHET_COLUMNS, GUICHET_TILES, guichetCard } from "../../src/lib/guichet-image";
import { hierCard } from "../../src/lib/hier-image";
import { tileDescriptions, type IconRow } from "../../src/lib/lignes-icones-image";
import { newsCard } from "../../src/lib/nouveautes-image";
import { milestoneCard } from "../../src/lib/paliers-franchis-image";
import { POLICES_ONCIALE, policeOnciale } from "../../src/lib/police/fabrique";
import { LETTRINE_TITRE } from "../../src/lib/police/largeur";
import { glyphesOnciale } from "../../src/lib/police/onciale";
import { recordCard } from "../../src/lib/records-image";
import { PANEL_ROLES, ROLES_COLUMNS, rolesCard } from "../../src/lib/roles-discord";
import { BODY_TOP, headParts } from "../../src/lib/salon-image";
import { victoryCard } from "../../src/lib/victoires-image";

/** Une largeur approchée, pour tester la mise en page sans police. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);
const SITE = "https://les-gaulois.github.io";
const root = process.cwd();
const fonts = new GazetteFonts(root);

describe("l'en-tête des images, comme le haut d'une page du site", () => {
  it("écrit l'invite de la page où mène l'image, puis son curseur rouge", () => {
    const head = pageHead({ path: "/gazette", title: "La gazette de [GAL]" }, measure);
    expect(head.texts.slice(0, 3).map((t) => t.text)).toEqual(["gal@clan", ":~/actu$ ", "./gazette"]);
    expect(head.texts.slice(0, 3).map((t) => t.font)).toEqual(["monoStrong", "mono", "mono"]);
    expect(head.texts[0]?.color).toBe(CARD_COLORS.BLUE_TEXT);
    // Le curseur est un pavé rouge juste après la commande, comme sur le site.
    const command = head.texts[2]!;
    const cursor = head.rects.find((r) => r.color === CARD_COLORS.RED && r.y < command.y && r.y + r.height > command.y);
    expect(cursor?.x).toBeGreaterThan(command.x + measure(command.text, "mono", command.size));
  });
  it("une fiche de membre s'écrit « ./fiche » : l'identifiant du joueur n'y paraît jamais", () => {
    const texts = pageHead({ path: pathOf("les-gaulois.github.io/membres/AbC123xyz"), title: "Alpha", name: true }, measure).texts.map((t) => t.text);
    expect(texts).toContain("./fiche");
    expect(texts.join(" ")).not.toContain("AbC123xyz");
  });
  it("le titre est en onciale de cases, avec une lettrine rouge s'il commence par une lettre", () => {
    const title = (text: string) => pageHead({ path: "/", title: text }, measure).texts.find((t) => t.text === text)!;
    expect(title("Paliers franchis")).toMatchObject({ font: "cases", color: CARD_COLORS.WHITE, lettrine: CARD_COLORS.RED });
    expect(title("[GAL] monte à la 2e place").lettrine).toBeUndefined();
  });
  it("un pseudo en titre s'écrit en Inter, qui sait le cyrillique, et sans lettrine", () => {
    const title = pageHead({ path: "/membres/x", title: "Иван", name: true }, measure).texts.find((t) => t.text === "Иван")!;
    expect(title.font).toBe("strong");
    expect(title.lettrine).toBeUndefined();
  });
  it("ce que l'image compte et sa période passent sous le titre ; le contenu commence sous le badge du clan", () => {
    const head = pageHead({ path: "/liste", title: "Bienvenue", kicker: "Arrivées dans le clan [GAL]", period: "Entre deux relevés" }, measure);
    const at = (text: string) => head.texts.find((t) => t.text === text)!.y;
    expect(at("Bienvenue")).toBeLessThan(at("Arrivées dans le clan [GAL]"));
    expect(at("Arrivées dans le clan [GAL]")).toBeLessThan(at("Entre deux relevés"));
    expect(head.bottom).toBeGreaterThan(LOGO.y + LOGO.size);
    expect(head.texts.every((t) => t.x >= HEAD_X)).toBe(true);
  });
  it("garde la place demandée à droite du titre, pour un badge", () => {
    const long = "Paliers franchis aujourd'hui";
    const free = pageHead({ path: "/", title: long }, measure).texts.find((t) => t.font === "cases")!;
    const narrow = pageHead({ path: "/", title: long }, measure, 300).texts.find((t) => t.font === "cases")!;
    expect(HEAD_X + drawnWidth(narrow, measure)).toBeLessThanOrEqual(1200 - 36 - 300);
    expect(narrow.size).toBeLessThan(free.size);
    expect(narrow.text).toBe(long);
  });
});

describe("la lettrine et l'approche", () => {
  it("la lettrine est la première lettre, avec la ponctuation qui la touche ; rien devant un signe", () => {
    expect(lettrineOf("Paliers franchis")).toBe("P");
    expect(lettrineOf("L'encadrement")).toBe("L'");
    expect(lettrineOf("[GAL] bat un record")).toBe("");
    expect(lettrineOf("13 victoires")).toBe("");
  });
  it("une lettrine et une approche élargissent le texte, et `fittedDrawn` en tient compte", () => {
    const plain = drawnWidth({ text: "Paliers", font: "cases", size: 50 }, measure);
    expect(drawnWidth({ text: "Paliers", font: "cases", size: 50, lettrine: "#f00" }, measure)).toBeCloseTo(plain + measure("P", "cases", 50) * (LETTRINE_TITRE - 1));
    expect(drawnWidth({ text: "ABC", font: "monoStrong", size: 20, tracking: 0.06 }, measure)).toBeCloseTo(measure("ABC", "monoStrong", 20) + 2 * 0.06 * 20);
    const fit = fittedDrawn({ text: "Paliers franchis", font: "cases", lettrine: "#f00" }, 60, 20, 400, measure);
    expect(drawnWidth({ text: fit.text, font: "cases", size: fit.size, lettrine: "#f00" }, measure)).toBeLessThanOrEqual(400);
  });
});

describe("les chiffres clés, comme ceux du site", () => {
  it("un filet avec son repère blanc, le libellé en capitales de la machine, le chiffre en onciale de cases avec sa lueur", () => {
    const kpis = kpiParts([{ label: "Taux de victoire", value: "54,3 %", hint: { text: "+14,2 pts", strong: true } }, { label: "Parties", value: "540" }], { x: 36, y: 200, width: 1128 }, measure);
    const label = kpis.texts.find((t) => t.text === "TAUX DE VICTOIRE")!;
    expect(label).toMatchObject({ font: "monoStrong", tracking: 0.06 });
    expect(kpis.texts.find((t) => t.text === "54,3 %")).toMatchObject({ font: "cases", glow: true, color: CARD_COLORS.WHITE });
    expect(kpis.texts.find((t) => t.text === "+14,2 pts")?.font).toBe("strong");
    // Deux filets, chacun avec son repère blanc en haut.
    expect(kpis.rects.filter((r) => r.color === CARD_COLORS.WHITE && r.y === 200)).toHaveLength(2);
    expect(kpis.bottom).toBeGreaterThan(label.y);
  });
});

describe("le bas des images", () => {
  it("écrit l'adresse dans la voix de la machine, et réduit la note pour qu'elle tienne à côté", () => {
    const foot = pageFoot("les-gaulois.github.io/membres", "Une note bien trop longue ".repeat(6), 600, measure);
    expect(foot.texts[0]).toMatchObject({ text: "les-gaulois.github.io/membres", font: "monoStrong", color: CARD_COLORS.BLUE_TEXT });
    const note = foot.texts[1]!;
    expect(1200 - 36 - measure(note.text, note.font, note.size)).toBeGreaterThan(36 + measure("les-gaulois.github.io/membres", "monoStrong", 22));
  });
  it("le chemin d'une adresse donne l'invite", () => {
    expect(pathOf("les-gaulois.github.io/membres")).toBe("/membres");
    expect(pathOf("les-gaulois.github.io")).toBe("/");
  });
});

describe("la table des cartes", () => {
  it("est purement décorative : l'encre, une trame, des coins assombris, aucun texte", () => {
    const { defs, body } = tableSvg(1200, 600);
    expect(body).toContain(CARD_COLORS.NAVY);
    expect(defs).toContain('id="table-grille"');
    expect(`${defs}${body}`).not.toMatch(/<text|<path transform/);
  });
  it("passe sous toutes les images : aucune ne pose plus son propre fond uni", () => {
    const card = gazetteCard(
      { from: "2026-11-02", to: "2026-11-08", totals: { games: 671, wins: 269, winRate: 40.09 }, previous: null, highlights: null, standing: null, territory: null, arrivals: null, players: null, playersSince: null, active: null, milestones: null },
      "GAL",
      SITE,
      measure,
    );
    expect(card.rects.some((r) => r.width === card.width && r.height === card.height)).toBe(false);
    expect(cardSvg(card, { paths: () => "" })).toContain("table-grille");
    expect(cardSvg(card, { paths: () => "" }, { table: false })).not.toContain("table-grille");
  });
  it("se dessine sous la carte : les coins de l'image sont l'encre, assombrie", async () => {
    const card: GazetteCard = { width: 400, height: 300, rects: [], texts: [], logo: { x: 0, y: 0, size: 1 } };
    const png = await renderGazetteCard(card, fonts, root);
    const { data } = await sharp(png).extract({ left: 399, top: 299, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect((data[0] ?? 255) + (data[1] ?? 255) + (data[2] ?? 255)).toBeLessThan(90);
  });
});

describe("l'onciale du site, fabriquée par le robot", () => {
  it("les deux polices du site, avec les noms de famille que charge Base.astro", () => {
    const base = readFileSync("src/layouts/Base.astro", "utf8");
    for (const { fichier, famille } of POLICES_ONCIALE) {
      expect(base).toContain(`famille: "${famille}", url: \`\${base}/generated/polices/${fichier}\``);
    }
  });
  it("chaque dessin devient un glyphe, dans les deux formes", () => {
    for (const { famille, forme } of POLICES_ONCIALE) {
      const font = policeOnciale(famille, forme);
      for (const ch of glyphesOnciale().keys()) expect(font.charToGlyph(ch).name, `${famille} ${ch}`).not.toBe(".notdef");
    }
  });
  it("les images écrivent en onciale ce qu'elle sait, et en Outfit le reste, comme le site", () => {
    expect(fonts.width("La gazette", "cases", 52)).toBeGreaterThan(fonts.width("La gazette", "title", 52));
    expect(() => fonts.width("Tom & Jerry", "onciale", 30)).not.toThrow();
    expect(fonts.draws("Ж", "cases")).toBe(false);
  });
  it("en cases, chaque case est un tracé à part ; taillée, la lettre est d'un seul tenant", () => {
    const pieces = (font: "cases" | "onciale") => (fonts.paths({ text: "M", x: 0, y: 50, size: 50, font, color: "#fff" }).match(/[Mm]/g) ?? []).length;
    expect(pieces("cases")).toBeGreaterThan(10 * pieces("onciale"));
  });
  it("dessine la lettrine plus grande et de sa couleur, la lueur d'un chiffre dans le bleu du site", () => {
    const svg = fonts.paths({ text: "Paliers", x: 0, y: 60, size: 40, font: "cases", color: "#ffffff", lettrine: "#ff1a2e" });
    expect(svg).toContain('fill="#ff1a2e"');
    expect(svg).toContain('fill="#ffffff"');
    const card: GazetteCard = { width: 300, height: 120, rects: [], texts: [{ text: "54", x: 20, y: 90, size: 60, font: "cases", color: "#fff", glow: true }], logo: LOGO };
    expect(cardSvg(card, fonts)).toMatch(/<g filter="url\(#lueur\)"/);
  });
});

describe("toutes les images du robot, avec les vraies polices", () => {
  const readingRows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ rank: i + 1, tag: i === 1 ? "GAL" : ["UN", "GAL", "ITA", "AST", "EU"][i] ?? "XX", value: 10_000 - i * 2_000, color: null, gal: i === 1 }));
  const reading = { kind: "rank" as const, rank: 2, fetchedAt: "2026-11-12T19:31:00.000Z", computedAt: "2026-11-12T19:10:00.000Z", rows: readingRows(5), above: { tag: "UN", rank: 1, gap: 8648.97 }, below: { tag: "ITA", rank: 3, gap: 217.1 } };
  const cards: [string, GazetteCard][] = [
    ["alerte", alertCard({ kind: "rank", from: 3, reading }, "GAL", SITE, fonts.width)],
    [
      "course",
      courseCard(
        {
          reading,
          points: { since: "2026-11-11T19:00:00.000Z", until: "2026-11-12T19:00:00.000Z", total: { games: 66, points: 71.58 }, group: { games: 48, points: 69.41 }, solo: { games: 18, points: 2.17 } },
          changes: { score: 2.25, above: -25.1, below: 12.3 },
        },
        "GAL",
        SITE,
        fonts.width,
      ),
    ],
    ["paliers", milestoneCard([{ id: "a", username: "Brennos", tier: 2500 }], { since: "2026-11-11T21:53:00.000Z", until: "2026-11-12T19:53:00.000Z", players: [] }, "GAL", SITE, fonts.width)],
    [
      "records",
      recordCard(
        {
          beaten: [{ key: "streak", before: 12, after: 13 }, { key: "bestDay", before: 70, after: 78 }, { key: "biggestGroup", before: 13, after: 14 }, { key: "mostTeams", before: 62, after: 78 }],
          records: { streak: { wins: 13, endedAt: "2026-11-12T11:43:41.816Z" }, bestDay: { date: "2026-10-25", wins: 78, games: 196 }, biggestGroup: { players: 14, at: "2026-05-30T21:31:26.264Z" }, mostTeams: { teams: 78, players: 156, at: "2026-09-22T18:14:43.121Z" } },
        },
        "GAL",
        SITE,
        "2026-04-10",
        "2026-11-12T11:53:00.000Z",
        fonts.width,
      ),
    ],
    ["hier", hierCard({ day: "2026-11-11", games: 166, wins: 141, previous: { day: "2026-11-10", games: 58, wins: 30 }, streak: 18, best: { id: "x", at: "2026-11-11T20:14:00.000Z", won: true, format: "4", gaulois: 13, players: 85, map: "World", seconds: 1520, allies: [], rivals: [] } }, "GAL", SITE, fonts.width)],
    ["nouveautés", newsCard([{ date: "2026-11-12", kind: "ameliore", title: "Des titres en minuscules, avec une grande première lettre", body: "." }], SITE, fonts.width)],
    ["jouer ensemble", groupsCard({ monday: "2026-11-02", games: 12_345, groupGames: 9_999, points: 200, groupPoints: 194, perGame: { "1": 0.04, "2": 0.31, "3": 0.72, "4": 1.86 }, duos: [] }, "GAL", SITE, fonts.width)],
    [
      "victoire",
      victoryCard(
        { id: "x", start: "2026-11-12T17:04:58.000Z", map: "Gateway to the Atlantic", seconds: 10_253, format: "Trios", gaulois: 12, players: 123, points: 12.81, crew: [{ id: null, name: "Brennos" }], unnamed: 0, outsiders: 0 },
        "GAL",
        SITE,
        fonts.width,
        { width: 300, height: 200, open: false },
      ),
    ],
    ["fiche", ficheCard({ username: "Иван Петрович", rank: 123, ranked: 776, wins: 12_345, losses: 9_876, games: 22_221, rate: 55.5, tier: 10_000, nextTier: { wins: 25_000, missing: 12_655 } }, "GAL", SITE, "2026-11-12T19:53:00.000Z", fonts.width)],
    ["accueil", accueilCard(accueilFacts(accueilRanking({ end: "2026-11-12T19:10:00.000Z", clans: [{ clanTag: "GAL", games: 6121, wins: 2652, losses: 3469, playerSessions: 9999, weightedWins: 2346.69, weightedLosses: 10, weightedWLRatio: 1 }] }, "GAL"), null)!, "GAL", "Les Gaulois", "Le clan français [GAL] sur OpenFront.", SITE, fonts.width)],
    ["rôles", rolesCard(SITE, fonts.width)],
    ["guichet", guichetCard(SITE, fonts.width)],
  ];
  const plainText = (t: CardText) => t.text.replace(/[  ]/g, " ");

  it("aucun texte n'est coupé : ni titre, ni libellé, ni chiffre, ni écart, ni nom", () => {
    for (const [name, card] of cards) {
      for (const t of card.texts) expect(plainText(t).endsWith("…"), `${name} : ${t.text}`).toBe(false);
    }
  });
  it("aucun texte ne sort de l'image", () => {
    for (const [name, card] of cards) {
      for (const t of card.texts) {
        const width = drawnWidth(t, fonts.width);
        const left = t.anchor === "end" ? t.x - width : t.anchor === "middle" ? t.x - width / 2 : t.x;
        expect(left, `${name} : ${t.text}`).toBeGreaterThanOrEqual(0);
        expect(left + width, `${name} : ${t.text}`).toBeLessThanOrEqual(card.width + 0.5);
      }
    }
  });
  it("les phrases des grandes cases, rôles et guichet, tiennent sur deux lignes, comme sur les planches validées", () => {
    const grids: [string, readonly IconRow[], number][] = [
      ["rôles", PANEL_ROLES, ROLES_COLUMNS],
      ["guichet", GUICHET_TILES, GUICHET_COLUMNS],
    ];
    for (const [name, rows, columns] of grids) {
      tileDescriptions(rows, columns, fonts.width).forEach((lines, i) => {
        expect(lines.length, `${name} : ${rows[i]?.description}`).toBeGreaterThan(0);
        expect(lines.length, `${name} : ${rows[i]?.description}`).toBeLessThanOrEqual(2);
      });
    }
  });
});
describe("l'en-tête des images en lignes, pour les autres images du robot", () => {
  it("BODY_TOP est le haut du contenu sous un en-tête complet", () => {
    expect(headParts({ kicker: "Ce que l'image compte", title: "Un titre", period: "Sa période" }, measure, "les-gaulois.github.io/liste").bottom).toBe(BODY_TOP);
  });
  it("sans adresse, l'invite est celle de l'accueil ; avec, celle de la page où mène l'image", () => {
    const texts = (address?: string) => headParts({ kicker: "k", title: "Un titre", period: "p" }, measure, address).texts.map((t) => t.text);
    expect(texts()).toContain("./accueil");
    expect(texts("les-gaulois.github.io/records")).toContain("./records");
  });
});

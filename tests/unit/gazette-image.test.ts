import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { GazetteEdition } from "../../src/lib/gazette";
import { GazetteFonts, gazetteCard, gazetteImageAlt, renderGazetteCard, type CardText, type GazetteCard, type Measure } from "../../src/lib/gazette-image";
import type { WeekPlayer } from "../../src/lib/week-players";

/** Une largeur approchée, pour tester la mise en page sans police. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);

const player = (username: string, wins: number, place: number): WeekPlayer => ({ id: username, username, wins, place });
const snap = (date: string, rank: number | null) => ({ date, capturedAt: `${date}T10:00:00.000Z`, leaderboardEnd: `${date}T09:00:00.000Z`, clansListed: 100, rank, score: 100, games: 10, wins: 5, losses: 5, membersTotal: 700 });
const edition = (over: Partial<GazetteEdition> = {}): GazetteEdition => ({
  from: "2026-11-02",
  to: "2026-11-08",
  totals: { games: 671, wins: 269, winRate: 40.09 },
  previous: { games: 616, wins: 217, winRate: 35.2 },
  highlights: null,
  standing: null,
  territory: null,
  arrivals: null,
  players: null,
  // Un podium part par défaut du relevé du lundi 2 novembre, à 0 h 53 à Paris.
  playersSince: over.players ? "2026-11-01T23:53:00.000Z" : null,
  active: null,
  milestones: null,
  ...over,
});

const plain = (text: string) => text.replace(/[  ]/g, " ");
const words = (card: GazetteCard) => card.texts.map((t) => plain(t.text));
const SITE = "https://les-gaulois.github.io";

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

describe("gazetteCard", () => {
  it("écrit le titre, la semaine et les trois grands chiffres, avec leur écart à la semaine d'avant", () => {
    const text = words(gazetteCard(edition(), "GAL", SITE, measure));
    expect(text).toContain("LA GAZETTE DE [GAL]");
    expect(text).toContain("Semaine du 2 nov. au 8 nov. 2026");
    for (const expected of ["269", "victoires", "+52", "671", "parties", "+55", "40,1 %", "de victoires", "+4,9 pts", "Écarts par rapport à la semaine d'avant"]) expect(text).toContain(expected);
  });

  it("n'écrit aucun écart sans semaine d'avant comparable", () => {
    for (const previous of [null, { games: 0, wins: 0, winRate: null }]) {
      const text = words(gazetteCard(edition({ previous }), "GAL", SITE, measure));
      expect(text.some((t) => /^[+−]/.test(t))).toBe(false);
      expect(text).not.toContain("Écarts par rapport à la semaine d'avant");
    }
  });

  it("montre une baisse avec son signe, pas seulement sa couleur", () => {
    const text = words(gazetteCard(edition({ previous: { games: 700, wins: 300, winRate: 42.9 } }), "GAL", SITE, measure));
    for (const expected of ["−31", "−29", "−2,8 pts"]) expect(text).toContain(expected);
  });

  it("ne dessine ni classement, ni carte, ni arrivées, ni joueurs sans relevé : pas de données n'est pas zéro", () => {
    const text = words(gazetteCard(edition(), "GAL", SITE, measure));
    for (const absent of ["Carte des clans", "Arrivées", "Le plus de victoires de la semaine", "Le plus de victoires depuis le début", "Compte d'abord le temps de jeu, pas le niveau."]) expect(text).not.toContain(absent);
    expect(text.some((t) => t.startsWith("Classement"))).toBe(false);
  });

  it("donne la carte, le classement et les arrivées, datés", () => {
    const end = { date: "2026-11-08", pixels: 121976, rank: 4, final: true };
    const text = words(gazetteCard(edition({ standing: { start: null, end: snap("2026-11-08", 2) }, territory: { start: { ...end, date: "2026-11-01", pixels: 53077 }, end }, arrivals: { count: 92, named: ["Secret.1"], anonymous: 91 } }), "GAL", SITE, measure));
    for (const expected of ["Carte, le 8 nov.", "4e avec 121 976 pixels", "+68 899 depuis le 1 nov.", "Classement, le 8 nov.", "officiel, sur 90 jours", "2e", "Arrivées", "92", "encore dans le clan"]) expect(text).toContain(expected);
    expect(text.join(" ")).not.toContain("Secret.1");
  });

  it("ne calcule pas d'écart depuis un relevé fait dans la journée : le film suivant le démentirait", () => {
    const end = { date: "2026-11-08", pixels: 121976, rank: 4, final: true };
    const text = words(gazetteCard(edition({ territory: { start: { date: "2026-11-01", pixels: 53077, rank: 5 }, end } }), "GAL", SITE, measure));
    expect(text).toContain("4e avec 121 976 pixels");
    expect(text.join(" ")).not.toContain("depuis");
  });

  it("écrit « autant » si le taux n'a pas bougé, jamais +0,0", () => {
    const text = words(gazetteCard(edition({ previous: { games: 600, wins: 200, winRate: 40.1 } }), "GAL", SITE, measure));
    expect(text).toContain("autant");
    expect(text.join(" ")).not.toContain("0,0");
  });

  it("garde la date de la carte, et raccourcit le détail s'il manque de place", () => {
    const end = { date: "2026-03-20", pixels: 2345678, rank: 4, final: true };
    const card = gazetteCard(edition({ territory: { start: { ...end, date: "2026-03-13", pixels: 1111112 }, end } }), "GAL", SITE, (t, f, s) => [...t].length * s * 0.7);
    const text = words(card);
    expect(text).toContain("Carte, le 20 mars");
    expect(text.some((t) => t.startsWith("+1 234 566"))).toBe(true);
  });

  it("date la carte si le relevé n'est pas celui du dimanche", () => {
    const end = { date: "2026-11-07", pixels: 400, rank: null, final: true };
    const text = words(gazetteCard(edition({ territory: { start: null, end } }), "GAL", SITE, measure));
    expect(text).toContain("Carte, le 7 nov.");
    expect(text).toContain("400 pixels");
  });

  it("n'écrit pas un relevé fait dans la journée : un message ne se corrige pas", () => {
    const text = words(gazetteCard(edition({ territory: { start: null, end: { date: "2026-11-08", pixels: 103121, rank: 5 } } }), "GAL", SITE, measure));
    expect(text.join(" ")).not.toContain("Carte");
    expect(text.join(" ")).not.toContain("103");
  });

  it("met les joueurs de la semaine sur un podium, le premier au milieu et le plus haut, et dit ce que cela compte", () => {
    const card = gazetteCard(edition({ players: [player("Alpha", 33, 1), player("Beta", 29, 2), player("Gamma", 28, 3)] }), "GAL", SITE, measure);
    const text = words(card);
    expect(text).toContain("Le plus de victoires de la semaine");
    expect(text).toContain("33 victoires");
    expect(text).toContain("Compte d'abord le temps de jeu, pas le niveau.");
    const at = (name: string) => card.texts.find((t) => t.text === name)!;
    expect(at("Beta").x).toBeLessThan(at("Alpha").x);
    expect(at("Alpha").x).toBeLessThan(at("Gamma").x);
    expect(at("Alpha").y).toBeLessThan(at("Beta").y);
    expect(at("Beta").y).toBeLessThan(at("Gamma").y);
  });

  it("à égalité, deux joueurs ont la même place et la même hauteur", () => {
    const card = gazetteCard(edition({ players: [player("Alpha", 33, 1), player("Beta", 33, 1), player("Gamma", 2, 3)] }), "GAL", SITE, measure);
    const at = (name: string) => card.texts.find((t) => t.text === name)!;
    expect(at("Alpha").y).toBe(at("Beta").y);
    expect(words(card).filter((t) => t === "1er")).toHaveLength(2);
  });

  it("écrit les dates d'un podium parti plus tard que le lundi, car la période est plus courte", () => {
    const text = words(gazetteCard(edition({ players: [player("Alpha", 33, 1)], playersSince: "2026-11-05T10:39:31.574Z" }), "GAL", SITE, measure));
    expect(text).toContain("Le plus de victoires du 5 nov. au 8 nov.");
    expect(text).not.toContain("Le plus de victoires de la semaine");
  });

  it("sans podium pour cette semaine, rien ne le remplace", () => {
    const text = words(gazetteCard(edition(), "GAL", SITE, measure));
    expect(text.some((line) => line.startsWith("Le plus de victoires"))).toBe(false);
    expect(text).not.toContain("Compte d'abord le temps de jeu, pas le niveau.");
  });

  it("passe à une liste si des égalités font plus de trois lignes, sans écarter personne", () => {
    const players = [player("Alpha", 9, 1), player("Beta", 2, 2), player("Gamma", 1, 3), player("Delta", 1, 3), player("Epsilon", 1, 3)];
    const card = gazetteCard(edition({ players }), "GAL", SITE, measure);
    for (const p of players) expect(words(card)).toContain(p.username);
    expectClean(card);
  });

  it("coupe un long pseudo à son point, jamais au milieu d'un mot si c'est possible", () => {
    const card = gazetteCard(edition({ players: [player("Alpha", 9, 1), player("Beta", 8, 2), player("lesang2tmort.6392", 7, 3)] }), "GAL", SITE, measure);
    const text = words(card);
    expect(text).toContain("lesang2tmort");
    expect(text).toContain(".6392");
    expectClean(card);
  });

  it("ne déborde pas et ne chevauche rien, même avec le message le plus chargé et les plus grands nombres", () => {
    const end = { date: "2026-11-08", pixels: 1234567, rank: 12, final: true };
    const long = "unPseudoVraimentTresLong_123";
    const card = gazetteCard(
      edition({
        totals: { games: 12345, wins: 11111, winRate: 90.12 },
        previous: { games: 9999, wins: 8888, winRate: 88.8 },
        standing: { start: snap("2026-11-01", 111), end: snap("2026-11-08", 110) },
        territory: { start: { ...end, date: "2026-11-01", pixels: 2345678 }, end },
        arrivals: { count: 1234, named: [], anonymous: 1234 },
        players: [player(long, 123456, 1), player(`${long}.1`, 123455, 2), player(`${long}.2`, 123454, 3)],
      }),
      "GAL",
      SITE,
      measure,
    );
    expectClean(card);
    const rows = card.rects.filter((r) => r.height === 90);
    expect(rows).toHaveLength(3);
  });
});

describe("gazetteImageAlt", () => {
  const end = { date: "2026-11-08", pixels: 400, rank: 4, final: true };

  it("dit tout ce que l'image montre, sans point en double", () => {
    const alt = plain(gazetteImageAlt(edition({ territory: { start: { ...end, date: "2026-11-01", pixels: 300 }, end }, arrivals: { count: 92, named: [], anonymous: 92 }, players: [player("Alpha", 33, 1)] }), "GAL"));
    expect(alt).toContain("La gazette de [GAL], semaine du 2 nov. au 8 nov. 2026.");
    expect(alt).toContain("269 victoires sur 671 parties, soit 40,1 %.");
    expect(alt).toContain("55 parties de plus que la semaine d'avant. Taux de victoire : +4,9 points.");
    expect(alt).toContain("Carte, le 8 nov. : 4e avec 400 pixels, +100 depuis le 1 nov.");
    expect(alt).toContain("Cela compte d'abord le temps de jeu, pas le niveau.");
    expect(alt).toContain("Arrivées : 92, encore dans le clan.");
    expect(alt).toContain("Le plus de victoires de la semaine : Alpha, 33 victoires.");
    expect(alt).not.toContain("..");
  });

  it("garde ce que le texte du message ajoutait : ce que compte le podium, et d'où viennent les chiffres", () => {
    const withPodium = plain(gazetteImageAlt(edition({ players: [player("Alpha", 33, 1)] }), "GAL"));
    expect(withPodium.endsWith("Le plus de victoires de la semaine : Alpha, 33 victoires. Victoires en équipe sous le tag entre deux relevés, membres avec pseudo présents aux deux. Cela compte d'abord le temps de jeu, pas le niveau. Données publiques d'OpenFront.")).toBe(true);
    // Sans podium, rien à dire de ce qu'il compte.
    const bare = plain(gazetteImageAlt(edition(), "GAL"));
    expect(bare.endsWith("Données publiques d'OpenFront.")).toBe(true);
    expect(bare).not.toContain("entre deux relevés");
  });

  it("tient dans la limite de Discord", () => {
    const players = Array.from({ length: 5 }, (_, i) => player("x".repeat(300), 9, i + 1));
    expect(gazetteImageAlt(edition({ players }), "GAL").length).toBeLessThanOrEqual(1024);
  });
});

describe("renderGazetteCard", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);

  it("ne déborde pas et ne chevauche rien avec la vraie police, pseudos réels les plus longs compris", () => {
    const end = { date: "2026-11-08", pixels: 1234567, rank: 12, final: true };
    const full = {
      totals: { games: 12345, wins: 11111, winRate: 90.12 },
      previous: { games: 9999, wins: 8888, winRate: 88.8 },
      standing: { start: snap("2026-11-01", 111), end: snap("2026-11-08", 110) },
      territory: { start: { ...end, date: "2026-11-01", pixels: 2345678 }, end },
      arrivals: { count: 1234, named: [], anonymous: 1234 },
    };
    const names = ["ProfessorSployer", "Baldwin IV The GOAT.7362", "LOUISVUITTON KINGDOM.1234", "WWWWWWWWWWWWWWWW", "lesang2tmort.6392", "Nonex.5264", "Éloïse", "Иван Петрович"];
    for (let i = 0; i + 2 < names.length; i++) {
      const players = [player(names[i]!, 123456, 1), player(names[i + 1]!, 123, 2), player(names[i + 2]!, 12, 3)];
      expectClean(gazetteCard(edition({ ...full, players }), "GAL", SITE, fonts.width), fonts.width);
    }
    expectClean(gazetteCard(edition(), "GAL", SITE, fonts.width), fonts.width);
  });

  it("dessine une vraie image PNG à la bonne taille, avec les polices du site et le logo", async () => {
    const card = gazetteCard(edition({ players: [player("Judom FR", 1807, 1), player("Nonex.5264", 778, 2), player("Flooo", 738, 3)] }), "GAL", SITE, fonts.width);
    const png = await renderGazetteCard(card, fonts, root);
    const info = await sharp(png).metadata();
    expect(info).toMatchObject({ format: "png", width: 1200, height: 744 });
    expect(png.length).toBeGreaterThan(20_000);
    expect(png.length).toBeLessThan(2_000_000);
    // Le logo : sa zone porte d'autres couleurs que le fond uni de l'image.
    const { x, y, size } = card.logo;
    const logo = await sharp(png).extract({ left: x, top: y, width: size, height: size }).stats();
    expect(logo.channels.some((channel) => channel.stdev > 10)).toBe(true);
  });

  it("mesure et dessine les nombres français, malgré leurs espaces insécables", () => {
    expect(fonts.width("53 077", "title", 40)).toBeGreaterThan(fonts.width("53077", "title", 40));
    expect(fonts.paths({ text: "40,1 %", x: 0, y: 10, size: 20, font: "strong", color: "#fff" })).toContain("<path");
  });

  it("sait écrire un pseudo accentué ou en cyrillique", () => {
    for (const name of ["Éloïse", "Łukasz", "Иван"]) expect(fonts.width(name, "strong", 30)).toBeGreaterThan(0);
  });

  it("abandonne l'image si un caractère ne peut pas être dessiné, plutôt que d'écrire un carré vide", () => {
    expect(() => fonts.width("漢字", "strong", 30)).toThrow("ne peut pas être dessiné");
  });
});

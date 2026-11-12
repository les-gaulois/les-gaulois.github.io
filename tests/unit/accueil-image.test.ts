import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { accueilCard, accueilFacts, accueilImageAlt, accueilRanking, type AccueilFacts } from "../../src/lib/accueil-image";
import type { GazetteEdition } from "../../src/lib/gazette";
import { GazetteFonts, renderGazetteCard, type CardText, type GazetteCard, type Measure } from "../../src/lib/gazette-image";
import type { LeaderboardEntry } from "../../src/lib/schemas";
import type { WeekPlayer } from "../../src/lib/week-players";

/** Une largeur approchée, pour tester la mise en page sans police. */
const measure: Measure = (text, font, size) => [...text].length * size * (font === "body" ? 0.52 : 0.58);

const player = (username: string, wins: number, place: number): WeekPlayer => ({ id: username, username, wins, place });
const edition = (over: Partial<GazetteEdition> = {}): GazetteEdition => ({
  from: "2026-11-02",
  to: "2026-11-08",
  totals: { games: 540, wins: 293, winRate: 54.26 },
  previous: null,
  highlights: null,
  standing: null,
  territory: null,
  arrivals: null,
  players: null,
  // Le podium part du relevé du jeudi 5 novembre : sa période est plus courte que la semaine.
  playersSince: over.players ? "2026-11-05T10:39:31.574Z" : null,
  active: null,
  milestones: null,
  ...over,
});
const clanEntry = (clanTag: string, weightedWins: number): LeaderboardEntry => ({ clanTag, games: 100, wins: 50, losses: 50, playerSessions: 300, weightedWins, weightedLosses: 1, weightedWLRatio: 1 });
const leaderboard = { end: "2026-11-12T05:55:00.000Z", clans: [clanEntry("UN", 10928.1), clanEntry("GAL", 2321.71), clanEntry("ITA", 2128.78)] };
const podium = [player("Judom FR", 65, 1), player("Skyrex85", 49, 2), player("lesang2tmort.6392", 47, 3)];

// Les espaces insécables des nombres français deviennent des espaces ordinaires, pour comparer les textes.
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
const words = (card: GazetteCard) => card.texts.map((t) => plain(t.text));
const SITE = "https://les-gaulois.github.io";
const TAGLINE = "Le clan français [GAL] sur OpenFront.";
const card = (facts: AccueilFacts, width: Measure = measure) => accueilCard(facts, "GAL", "Les Gaulois", TAGLINE, SITE, width);

/** Rien ne sort de l'image, et deux textes de la même ligne ne se chevauchent pas. `width` : la mesure de contrôle. */
function expectClean(drawn: GazetteCard, width: Measure = measure): void {
  const leftOf = (t: CardText) => (t.anchor === "end" ? t.x - width(t.text, t.font, t.size) : t.anchor === "middle" ? t.x - width(t.text, t.font, t.size) / 2 : t.x);
  const rightOf = (t: CardText) => leftOf(t) + width(t.text, t.font, t.size);
  for (const t of drawn.texts) {
    expect(leftOf(t), t.text).toBeGreaterThanOrEqual(0);
    expect(rightOf(t), t.text).toBeLessThanOrEqual(drawn.width);
    expect(t.y, t.text).toBeLessThanOrEqual(drawn.height);
  }
  for (const a of drawn.texts) {
    for (const b of drawn.texts) {
      if (a === b || a.y !== b.y) continue;
      const apart = rightOf(a) <= leftOf(b) || rightOf(b) <= leftOf(a);
      expect(apart, `« ${a.text} » et « ${b.text} » se chevauchent`).toBe(true);
    }
  }
  for (const r of drawn.rects) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(drawn.width + 0.01);
    expect(r.y + r.height).toBeLessThanOrEqual(drawn.height);
  }
}

describe("accueilRanking", () => {
  it("prend le rang de la liste officielle, sans retrier, et le score pondéré", () => {
    expect(accueilRanking(leaderboard, "GAL")).toEqual({ rank: 2, listed: 3, score: 2321.71, at: "2026-11-12T05:55:00.000Z" });
  });
  it("dit qu'un clan absent de la liste est hors classement, sans score", () => {
    expect(accueilRanking(leaderboard, "XYZ")).toEqual({ rank: null, listed: 3, score: null, at: "2026-11-12T05:55:00.000Z" });
  });
  it("ne donne rien sans liste collectée", () => {
    expect(accueilRanking(null, "GAL")).toBeNull();
  });
});

describe("accueilFacts", () => {
  const ranking = accueilRanking(leaderboard, "GAL");
  it("garde le podium de la dernière gazette, avec sa période et sa semaine", () => {
    expect(accueilFacts(ranking, edition({ players: podium }))?.podium).toEqual({ period: "du 5 nov. au 8 nov.", week: "du 2 nov. au 8 nov. 2026", players: podium });
  });
  it("sans podium relevé, garde le classement seul", () => {
    expect(accueilFacts(ranking, edition())).toEqual({ ranking, podium: null });
    expect(accueilFacts(ranking, null)).toEqual({ ranking, podium: null });
  });
  it("ne dessine rien sans classement ni podium : pas de données n'est pas zéro", () => {
    expect(accueilFacts(null, edition())).toBeNull();
    expect(accueilFacts(null, null)).toBeNull();
  });
});

describe("accueilCard", () => {
  const full = accueilFacts(accueilRanking(leaderboard, "GAL"), edition({ players: podium }))!;

  it("écrit le clan, le rang sur la liste, le score, l'heure de la liste et le podium", () => {
    const text = words(card(full));
    expect(text).toContain("[GAL] Les Gaulois");
    expect(text).toContain(TAGLINE);
    expect(text).toContain("2e");
    expect(text).toContain("sur 3 clans");
    expect(text).toContain("Score 2 321,71");
    expect(text).toContain("Liste arrêtée au 12 nov. 2026");
    expect(text).toContain("Le plus de victoires du 5 nov. au 8 nov.");
    expect(text).toContain("Semaine du 2 nov. au 8 nov. 2026");
    expect(text).toContain("65 victoires");
    expect(text).toContain("Compte d'abord le temps de jeu, pas le niveau.");
    expect(text).toContain("les-gaulois.github.io");
  });

  it("met le premier au milieu et le plus haut, comme dans la gazette", () => {
    const drawn = card(full);
    const at = (name: string) => drawn.texts.find((t) => t.text === name)!;
    expect(at("Skyrex85").x).toBeLessThan(at("Judom FR").x);
    expect(at("Judom FR").x).toBeLessThan(at("lesang2tmort").x);
    expect(at("Judom FR").y).toBeLessThan(at("Skyrex85").y);
  });

  it("écrit « Hors classement » pour un clan absent de la liste, jamais un rang inventé", () => {
    const text = words(card(accueilFacts(accueilRanking(leaderboard, "XYZ"), null)!));
    expect(text).toContain("Hors classement");
    expect(text).toContain("3 clans listés");
    expect(text.some((t) => t.startsWith("Score"))).toBe(false);
  });

  it("sans podium, rien ne le remplace, ni sa réserve", () => {
    const text = words(card(accueilFacts(accueilRanking(leaderboard, "GAL"), null)!));
    expect(text.some((t) => t.startsWith("Le plus de victoires"))).toBe(false);
    expect(text).not.toContain("Compte d'abord le temps de jeu, pas le niveau.");
  });

  it("sans classement, le podium prend toute la largeur", () => {
    const drawn = card(accueilFacts(null, edition({ players: podium }))!);
    expect(words(drawn).some((t) => t.startsWith("Classement"))).toBe(false);
    expect(drawn.texts.find((t) => t.text.startsWith("Le plus de victoires"))!.x).toBe(36);
    expectClean(drawn);
  });

  it("ne déborde pas et ne chevauche rien, avec les plus grands nombres, une égalité en liste et de longs pseudos", () => {
    const long = "unPseudoVraimentTresLong_123";
    const crowded = [player(long, 123456, 1), player(`${long}.1`, 123455, 2), player(`${long}.2`, 123454, 3), player("Delta", 123454, 3), player("Epsilon", 123454, 3)];
    const big = { end: "2026-11-12T05:55:00.000Z", clans: [...Array.from({ length: 1233 }, (_, i) => clanEntry(`C${i}`, 99999)), clanEntry("GAL", 12345.67)] };
    expectClean(card(accueilFacts(accueilRanking(big, "GAL"), edition({ players: crowded }))!));
    expectClean(card(full));
    expectClean(card(accueilFacts(accueilRanking(leaderboard, "XYZ"), edition({ players: podium }))!));
  });
});

describe("accueilImageAlt", () => {
  it("dit tout ce que l'image montre, sans point en double", () => {
    const alt = plain(accueilImageAlt(accueilFacts(accueilRanking(leaderboard, "GAL"), edition({ players: podium }))!, "GAL", "Les Gaulois"));
    expect(alt).toContain("[GAL] Les Gaulois.");
    expect(alt).toContain("2e au classement officiel des clans, sur 3, score 2 321,71, liste arrêtée au 12 nov. 2026.");
    expect(alt).toContain("Le plus de victoires du 5 nov. au 8 nov. : Judom FR, 65 victoires ; Skyrex85, 49 victoires ; lesang2tmort.6392, 47 victoires.");
    expect(alt).toContain("Cela compte d'abord le temps de jeu, pas le niveau.");
    expect(alt).not.toContain("..");
  });
  it("date la semaine quand le podium la couvre entière, et dit un clan hors classement", () => {
    const week = edition({ players: podium, playersSince: "2026-11-01T23:53:00.000Z" });
    const alt = plain(accueilImageAlt(accueilFacts(accueilRanking(leaderboard, "XYZ"), week)!, "GAL", "Les Gaulois"));
    expect(alt).toContain("Le plus de victoires la semaine du 2 nov. au 8 nov. 2026 :");
    expect(alt).toContain("Hors du classement officiel des clans, liste arrêtée au 12 nov. 2026.");
  });
  it("tient dans la limite de Discord", () => {
    const players = Array.from({ length: 5 }, (_, i) => player("x".repeat(300), 9, i + 1));
    expect(accueilImageAlt(accueilFacts(null, edition({ players }))!, "GAL", "Les Gaulois").length).toBeLessThanOrEqual(1024);
  });
});

describe("le dessin de l'accueil", () => {
  const root = process.cwd();
  const fonts = new GazetteFonts(root);

  it("ne déborde pas et ne chevauche rien avec la vraie police, pseudos réels les plus longs compris", () => {
    const names = ["ProfessorSployer", "Baldwin IV The GOAT.7362", "LOUISVUITTON KINGDOM.1234", "WWWWWWWWWWWWWWWW", "lesang2tmort.6392", "Éloïse", "Иван Петрович"];
    for (let i = 0; i + 2 < names.length; i++) {
      const players = [player(names[i]!, 123456, 1), player(names[i + 1]!, 123, 2), player(names[i + 2]!, 12, 3)];
      expectClean(card(accueilFacts(accueilRanking(leaderboard, "GAL"), edition({ players }))!, fonts.width), fonts.width);
    }
  });

  it("dessine une vraie image PNG au format des aperçus de lien, avec le logo", async () => {
    const drawn = card(accueilFacts(accueilRanking(leaderboard, "GAL"), edition({ players: podium }))!, fonts.width);
    const png = await renderGazetteCard(drawn, fonts, root);
    expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 1200, height: 630 });
    const { x, y, size } = drawn.logo;
    const logo = await sharp(png).extract({ left: x, top: y, width: size, height: size }).stats();
    expect(logo.channels.some((channel) => channel.stdev > 10)).toBe(true);
  });
});

/**
 * L'image d'aperçu de l'accueil, pour un lien du site collé sur Discord : le rang du clan au classement officiel, son score,
 * et le podium des Gaulois de la semaine, comme sur la page. Même dessin que l'image de la gazette (`gazette-image.ts`),
 * redessinée à chaque construction du site, donc à chaque collecte.
 *
 * Tout vient des données collectées : la liste officielle des clans et la dernière gazette. Rien n'est recalculé ici.
 * Ce qui manque n'est pas dessiné, jamais remplacé par un zéro ; sans aucun des deux, pas d'image, et l'accueil garde celle du site.
 */
import { fmtCount, fmtDate, fmtInt, fmtRank, fmtScore } from "./format";
import { playersPeriod, weekLabel, type GazetteEdition } from "./gazette";
import { CARD_COLORS as C, fitted, PODIUM_NOTE, podiumParts, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";
import type { StoredLeaderboard } from "./schemas";
import { findClan, withOfficialRanks } from "./stats";
import type { WeekPlayer } from "./week-players";

/** L'image, dans `public/` et sous la base du site : dessinée par scripts/generate-accueil-image.ts, ignorée par Git. */
export const ACCUEIL_IMAGE = "generated/accueil.png";

/** Le format des aperçus de lien : Discord, comme les autres, attend 1200 × 630. */
const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 48;

export interface AccueilFacts {
  /** Le classement officiel : `rank` vaut `null` si le clan n'est pas dans la liste. `at` : l'heure où la liste a été arrêtée. */
  ranking: { rank: number | null; listed: number; score: number | null; at: string } | null;
  /** Le podium des victoires de la dernière gazette, avec sa période et sa semaine. */
  podium: { period: string; week: string; players: readonly WeekPlayer[] } | null;
}

/** Le clan dans la liste officielle, comme le bloc du classement de l'accueil : rang de l'API, score pondéré. `null` sans liste. */
export function accueilRanking(leaderboard: Pick<StoredLeaderboard, "end" | "clans"> | null, tag: string): AccueilFacts["ranking"] {
  if (!leaderboard) return null;
  const me = findClan(withOfficialRanks(leaderboard.clans), tag);
  return { rank: me?.rank ?? null, listed: leaderboard.clans.length, score: me?.weightedWins ?? null, at: leaderboard.end };
}

/** Ce que l'image dit. `null` : ni classement ni podium, donc pas d'image. */
export function accueilFacts(ranking: AccueilFacts["ranking"], edition: GazetteEdition | null): AccueilFacts | null {
  const players = edition?.players ?? [];
  const period = edition ? playersPeriod(edition) : null;
  const podium = edition && players.length > 0 && period !== null ? { period, week: weekLabel(edition), players } : null;
  return ranking || podium ? { ranking, podium } : null;
}

/** Quoi écrire et où, à partir des faits seuls : se teste sans police. */
export function accueilCard(facts: AccueilFacts, tag: string, name: string, tagline: string, siteUrl: string, measure: Measure): GazetteCard {
  const rects: CardRect[] = [{ x: 0, y: 0, width: WIDTH, height: HEIGHT, radius: 0, color: C.NAVY }];
  const texts: CardText[] = [];
  const third = WIDTH / 3;
  rects.push({ x: 0, y: 0, width: third, height: 8, radius: 0, color: C.BLUE }, { x: third, y: 0, width: third, height: 8, radius: 0, color: C.WHITE }, { x: 2 * third, y: 0, width: third, height: 8, radius: 0, color: C.RED });

  // L'en-tête : le clan, et sa phrase.
  const logo = { x: MARGIN, y: 36, size: 104 };
  const headerX = logo.x + logo.size + 24;
  const headerWidth = WIDTH - MARGIN - headerX;
  texts.push({ ...fitted(`[${tag}] ${name}`.toLocaleUpperCase("fr"), "title", 64, 40, headerWidth, measure), x: headerX, y: 94, font: "title", color: C.WHITE });
  texts.push({ ...fitted(tagline, "body", 30, 22, headerWidth, measure), x: headerX, y: 134, font: "body", color: C.MUTED });

  const { ranking, podium } = facts;
  const top = 184;
  const base = HEIGHT - 92;
  const rankingWidth = podium ? 496 : WIDTH - 2 * MARGIN;

  // Le classement officiel, à gauche : le rang en très grand, puis le score et l'heure de la liste.
  if (ranking) {
    rects.push({ x: MARGIN, y: top, width: rankingWidth, height: base - top, radius: 20, color: C.SURFACE });
    rects.push({ x: MARGIN + 14, y: top + 16, width: 6, height: base - top - 32, radius: 3, color: C.BLUE });
    const inner = MARGIN + 40;
    const room = rankingWidth - 64;
    texts.push({ ...fitted("Classement officiel des clans", "body", 26, 20, room, measure), x: inner, y: top + 52, font: "body", color: C.MUTED });
    if (ranking.rank === null) {
      texts.push({ ...fitted("Hors classement", "title", 64, 36, room, measure), x: inner, y: top + 150, font: "title", color: C.WHITE });
      texts.push({ ...fitted(`${fmtInt(ranking.listed)} clans listés`, "body", 28, 20, room, measure), x: inner, y: top + 196, font: "body", color: C.MUTED });
    } else {
      const rank = fitted(fmtRank(ranking.rank), "title", 128, 64, room / 2, measure);
      texts.push({ ...rank, x: inner, y: top + 168, font: "title", color: C.WHITE });
      const after = inner + measure(rank.text, "title", rank.size) + 20;
      texts.push({ ...fitted(`sur ${fmtInt(ranking.listed)} clans`, "body", 30, 20, inner + room - after, measure), x: after, y: top + 164, font: "body", color: C.MUTED });
      if (ranking.score !== null) texts.push({ ...fitted(`Score ${fmtScore(ranking.score)}`, "strong", 34, 24, room, measure), x: inner, y: top + 232, font: "strong", color: C.WHITE });
    }
    texts.push({ ...fitted(`Liste arrêtée au ${fmtDate(ranking.at)}`, "body", 24, 18, room, measure), x: inner, y: base - 24, font: "body", color: C.MUTED });
  }

  // Le podium de la semaine, à droite : le même que sur l'accueil et dans la gazette.
  if (podium) {
    const x = ranking ? MARGIN + rankingWidth + 32 : MARGIN;
    const width = WIDTH - MARGIN - x;
    texts.push({ ...fitted(`Le plus de victoires ${podium.period}`, "strong", 30, 22, width, measure), x, y: top + 24, font: "strong", color: C.WHITE });
    texts.push({ ...fitted(`Semaine ${podium.week}`, "body", 24, 18, width, measure), x, y: top + 58, font: "body", color: C.MUTED });
    const parts = podiumParts(podium.players, { x, width, base, listTop: top + 110 }, measure);
    rects.push(...parts.rects);
    texts.push(...parts.texts);
  }

  // Le pied : l'adresse du site, et la réserve du podium.
  const footer = HEIGHT - 40;
  const url = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  texts.push({ text: url, x: MARGIN, y: footer, size: 28, font: "strong", color: C.BLUE_TEXT });
  if (podium) {
    const room = WIDTH - 2 * MARGIN - measure(url, "strong", 28) - 32;
    texts.push({ ...fitted(PODIUM_NOTE, "body", 22, 18, room, measure), x: WIDTH - MARGIN, y: footer, font: "body", color: C.MUTED, anchor: "end" });
  }
  return { width: WIDTH, height: HEIGHT, rects, texts, logo };
}

/** Ce que l'image dit, pour un lecteur d'écran et pour la description du lien. Discord n'en garde que 1 024 caractères. */
export function accueilImageAlt(facts: AccueilFacts, tag: string, name: string): string {
  const parts = [`[${tag}] ${name}.`];
  const { ranking, podium } = facts;
  if (ranking) {
    const at = `liste arrêtée au ${fmtDate(ranking.at)}`;
    if (ranking.rank === null) parts.push(`Hors du classement officiel des clans, ${at}.`);
    else parts.push(`${fmtRank(ranking.rank)} au classement officiel des clans, sur ${fmtInt(ranking.listed)}${ranking.score === null ? "" : `, score ${fmtScore(ranking.score)}`}, ${at}.`);
  }
  if (podium) {
    const names = podium.players.map((p) => `${p.username}, ${fmtCount(p.wins, "victoire")}`).join(" ; ");
    const when = podium.period === "de la semaine" ? `la semaine ${podium.week}` : podium.period;
    parts.push(`Le plus de victoires ${when} : ${names}. Cela compte d'abord le temps de jeu, pas le niveau.`);
  }
  return parts.join(" ").slice(0, 1024);
}

/**
 * L'image d'aperçu de l'accueil, pour un lien du site collé sur Discord : le rang du clan au classement officiel, son score,
 * et le podium des Gaulois de la semaine, comme sur la page. Même dessin que l'image de la gazette (`gazette-image.ts`),
 * redessinée à chaque construction du site, donc à chaque collecte.
 *
 * Tout vient des données collectées : la liste officielle des clans et la dernière gazette. Rien n'est recalculé ici.
 * Ce qui manque n'est pas dessiné, jamais remplacé par un zéro ; sans aucun des deux, pas d'image, et l'accueil garde celle du site.
 */
import { fmtCount, fmtDate, fmtInt, fmtRank, fmtScore } from "./format";
import { AUCUN_GAULOIS, type GauloisParJoueur } from "./gaulois-joueurs";
import type { SpritePlacement } from "./gaulois-sprite";
import { playersPeriod, weekLabel, type GazetteEdition } from "./gazette";
import { CARD_COLORS as C, fitted, fittedDrawn, LOGO, MARGIN, pageFoot, pageHead, PODIUM_NOTE, podiumParts, STAGES, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";
import type { StoredLeaderboard } from "./schemas";
import { findClan, withOfficialRanks } from "./stats";
import type { WeekPlayer } from "./week-players";

/** L'image, dans `public/` et sous la base du site : dessinée par scripts/generate-accueil-image.ts, ignorée par Git. */
export const ACCUEIL_IMAGE = "generated/accueil.png";

/** Le format des aperçus de lien : Discord, comme les autres, attend 1200 × 630. */
const WIDTH = 1200;
const HEIGHT = 630;

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
export function accueilCard(facts: AccueilFacts, tag: string, name: string, tagline: string, siteUrl: string, measure: Measure, gaulois: GauloisParJoueur = AUCUN_GAULOIS): GazetteCard {
  // L'en-tête : l'invite de l'accueil, le clan, et sa phrase.
  const head = pageHead({ path: "/", title: `[${tag}] ${name}`, period: tagline }, measure);
  const rects: CardRect[] = [...head.rects];
  const texts: CardText[] = [...head.texts];
  const sprites: SpritePlacement[] = [];

  const { ranking, podium } = facts;
  const top = head.bottom;
  const base = HEIGHT - 80;
  const rankingWidth = podium ? 480 : WIDTH - 2 * MARGIN;

  // Le classement officiel, à gauche, dans la scène bleue de l'accueil du site : le rang en très grand, puis le score et l'heure de la liste.
  if (ranking) {
    rects.push({ x: MARGIN, y: top, width: rankingWidth, height: base - top, radius: 10, ...STAGES.blue, cut: 28 });
    const inner = MARGIN + 32;
    const room = rankingWidth - 64;
    const label = fittedDrawn({ text: "Classement officiel des clans".toLocaleUpperCase("fr"), font: "monoStrong", tracking: 0.06 }, 18, 13, room, measure);
    texts.push({ ...label, x: inner, y: top + 46, font: "monoStrong", color: C.STAGE_MUTED, tracking: 0.06 });
    if (ranking.rank === null) {
      texts.push({ ...fitted("Hors classement", "cases", 60, 34, room, measure), x: inner, y: top + 140, font: "cases", color: C.WHITE, glow: true });
      texts.push({ ...fitted(`${fmtInt(ranking.listed)} clans listés`, "body", 27, 20, room, measure), x: inner, y: top + 184, font: "body", color: C.STAGE_MUTED });
    } else {
      const rank = fitted(fmtRank(ranking.rank), "cases", 112, 60, room / 2, measure);
      texts.push({ ...rank, x: inner, y: top + 160, font: "cases", color: C.WHITE, glow: true });
      const after = inner + measure(rank.text, "cases", rank.size) + 22;
      texts.push({ ...fitted(`sur ${fmtInt(ranking.listed)} clans`, "body", 29, 20, inner + room - after, measure), x: after, y: top + 156, font: "body", color: C.STAGE_MUTED });
      if (ranking.score !== null) texts.push({ ...fitted(`Score ${fmtScore(ranking.score)}`, "strong", 33, 24, room, measure), x: inner, y: top + 220, font: "strong", color: C.WHITE });
    }
    texts.push({ ...fitted(`Liste arrêtée au ${fmtDate(ranking.at)}`, "body", 23, 17, room, measure), x: inner, y: base - 26, font: "body", color: C.STAGE_MUTED });
  }

  // Le podium de la semaine, à droite : le même que sur l'accueil et dans la gazette.
  if (podium) {
    const x = ranking ? MARGIN + rankingWidth + 32 : MARGIN;
    const width = WIDTH - MARGIN - x;
    texts.push({ ...fitted(`Le plus de victoires ${podium.period}`, "onciale", 26, 18, width, measure), x, y: top + 26, font: "onciale", color: C.WHITE });
    texts.push({ ...fitted(`Semaine ${podium.week}`, "body", 23, 17, width, measure), x, y: top + 58, font: "body", color: C.MUTED });
    // Le Gaulois du village d'un joueur du podium, derrière sa marche, sans monter dans la ligne de la semaine.
    const parts = podiumParts(podium.players, { x, width, base, listTop: top + 106, ceiling: top + 68 }, measure, gaulois);
    rects.push(...parts.rects);
    texts.push(...parts.texts);
    sprites.push(...(parts.gaulois ?? []));
  }

  // Le pied : l'adresse du site, et la réserve du podium.
  const url = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  texts.push(...pageFoot(url, podium ? PODIUM_NOTE : "", HEIGHT - 30, measure).texts);
  return { width: WIDTH, height: HEIGHT, rects, texts, logo: LOGO, ...(sprites.length > 0 ? { gaulois: sprites } : {}) };
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

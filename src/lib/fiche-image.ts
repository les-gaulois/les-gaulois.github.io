/**
 * L'image d'aperçu d'une fiche de membre, pour un lien collé sur Discord : le pseudo, sa place aux victoires sous le tag,
 * son palier et ses chiffres. Même dessin que l'image de la semaine (`gazette-image.ts`). Tout vient de la liste des
 * membres (`stats.team`) : rien n'est recalculé ici, et un membre sans stats n'a pas d'image.
 */
import { fmtDate, fmtInt, fmtPct, fmtRank } from "./format";
import { CARD_COLORS as C, fitted, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";
import { gamesOf, placeOf, rateOf } from "./members";
import { nextTier, tierOf } from "./paliers";
import type { StoredMember } from "./schemas";

/** Le format des aperçus de lien : Discord, comme les autres, attend 1200 × 630. */
const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 48;

export interface FicheFacts {
  username: string;
  rank: number;
  ranked: number;
  wins: number;
  losses: number;
  games: number;
  rate: number | null;
  tier: number | null;
  nextTier: { wins: number; missing: number } | null;
}

/** Ce que l'image dit d'un membre. `null` : pas de pseudo ou pas de stats, donc pas d'image. */
export function ficheFacts(members: readonly StoredMember[], member: StoredMember): FicheFacts | null {
  if (!member.username || !member.team) return null;
  const place = placeOf(members, member);
  if (!place) return null;
  const next = nextTier(place.wins);
  return {
    username: member.username,
    rank: place.rank,
    ranked: place.ranked,
    wins: place.wins,
    losses: member.team.losses,
    games: gamesOf(member) ?? 0,
    rate: rateOf(member),
    tier: tierOf(place.wins),
    nextTier: next ? { wins: next.wins, missing: next.missing } : null,
  };
}

/** Quoi écrire et où, à partir des faits seuls : se teste sans police. */
export function ficheCard(facts: FicheFacts, tag: string, siteUrl: string, listedAt: string, measure: Measure): GazetteCard {
  const rects: CardRect[] = [{ x: 0, y: 0, width: WIDTH, height: HEIGHT, radius: 0, color: C.NAVY }];
  const texts: CardText[] = [];
  const third = WIDTH / 3;
  rects.push({ x: 0, y: 0, width: third, height: 8, radius: 0, color: C.BLUE }, { x: third, y: 0, width: third, height: 8, radius: 0, color: C.WHITE }, { x: 2 * third, y: 0, width: third, height: 8, radius: 0, color: C.RED });

  const logo = { x: MARGIN, y: 44, size: 112 };
  const headerX = logo.x + logo.size + 28;
  const room = WIDTH - MARGIN - headerX;
  texts.push({ text: `Membre de [${tag}]`, x: headerX, y: 80, size: 28, font: "strong", color: C.BLUE_TEXT });
  // Le pseudo en Inter, comme dans la gazette : elle sait écrire le cyrillique et le grec, pas Outfit.
  texts.push({ ...fitted(facts.username, "strong", 66, 36, room, measure), x: headerX, y: 148, font: "strong", color: C.WHITE });

  // La place, en grand, et ce qu'elle mesure.
  const placeTop = 220;
  rects.push({ x: MARGIN, y: placeTop, width: WIDTH - 2 * MARGIN, height: 150, radius: 20, color: C.SURFACE_2 });
  rects.push({ x: MARGIN + 14, y: placeTop + 16, width: 6, height: 118, radius: 3, color: C.RED });
  const place = fitted(facts.games === 0 ? "Aucune partie sous le tag" : fmtRank(facts.rank), "title", 92, 44, WIDTH - 2 * MARGIN - 60, measure);
  texts.push({ ...place, x: MARGIN + 40, y: placeTop + 104, font: "title", color: C.WHITE });
  if (facts.games > 0) {
    const placeWidth = measure(place.text, "title", place.size) + 30;
    const detail = `sur ${fmtInt(facts.ranked)} membres, aux victoires sous le tag`;
    texts.push({ ...fitted(detail, "body", 28, 20, WIDTH - 2 * MARGIN - 60 - placeWidth, measure), x: MARGIN + 40 + placeWidth, y: placeTop + 100, font: "body", color: C.MUTED });
  }

  // Les chiffres, en quatre colonnes : les mêmes que sur la fiche.
  const tiles = [
    { label: "Victoires", value: fmtInt(facts.wins) },
    { label: "Défaites", value: fmtInt(facts.losses) },
    { label: "Taux de victoire", value: fmtPct(facts.rate) },
    { label: "Palier", value: facts.tier === null ? "Pas encore" : `${fmtInt(facts.tier)} victoires` },
  ];
  const columnWidth = (WIDTH - 2 * MARGIN) / tiles.length;
  tiles.forEach((tile, i) => {
    const x = MARGIN + i * columnWidth;
    texts.push({ text: tile.label, x, y: 428, size: 24, font: "body", color: C.MUTED });
    texts.push({ ...fitted(tile.value, "title", 44, 26, columnWidth - 24, measure), x, y: 482, font: "title", color: C.WHITE });
  });
  if (facts.nextTier && facts.games > 0) {
    const next = `Prochain palier : ${fmtInt(facts.nextTier.wins)} victoires, encore ${fmtInt(facts.nextTier.missing)}.`;
    texts.push({ ...fitted(next, "body", 24, 18, WIDTH - 2 * MARGIN, measure), x: MARGIN, y: 530, font: "body", color: C.MUTED });
  }

  const url = `${siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/membres`;
  texts.push({ text: url, x: MARGIN, y: HEIGHT - 28, size: 26, font: "strong", color: C.BLUE_TEXT });
  const note = fitted(`Liste officielle du ${fmtDate(listedAt)}. Parties publiques en équipe sous le tag.`, "body", 22, 18, WIDTH - 2 * MARGIN - measure(url, "strong", 26) - 24, measure);
  texts.push({ ...note, x: WIDTH - MARGIN, y: HEIGHT - 28, font: "body", color: C.MUTED, anchor: "end" });
  return { width: WIDTH, height: HEIGHT, rects, texts, logo };
}

/** Ce que l'image dit, pour un lecteur d'écran et pour la description du lien. */
export function ficheImageAlt(facts: FicheFacts, tag: string, listedAt: string): string {
  const listed = `Liste officielle du ${fmtDate(listedAt)}.`;
  if (facts.games === 0) return `${facts.username}, membre de [${tag}] : aucune partie sous le tag, pas encore de palier. ${listed}`;
  const tier = facts.tier === null ? "pas encore de palier" : `palier des ${fmtInt(facts.tier)} victoires`;
  return `${facts.username}, membre de [${tag}] : ${fmtRank(facts.rank)} sur ${fmtInt(facts.ranked)} membres aux victoires sous le tag. ${fmtInt(facts.wins)} victoires, ${fmtInt(facts.losses)} défaites, ${fmtPct(facts.rate)}, ${tier}. ${listed}`;
}

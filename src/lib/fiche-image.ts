/**
 * L'image d'aperçu d'une fiche de membre, pour un lien collé sur Discord : le pseudo, sa place aux victoires sous le tag,
 * son palier et ses chiffres. Même dessin que l'image de la semaine (`gazette-image.ts`). Tout vient de la liste des
 * membres (`stats.team`) : rien n'est recalculé ici, et un membre sans stats n'a pas d'image.
 */
import { fmtDate, fmtInt, fmtPct, fmtRank } from "./format";
import { AUCUN_GAULOIS, type GauloisParJoueur } from "./gaulois-joueurs";
import { placeSprite, spriteRect, tenueOf } from "./gaulois-sprite";
import { CARD_COLORS as C, fitted, kpiParts, LOGO, MARGIN, pageFoot, pageHead, STAGES, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";
import { gamesOf, placeOf, rateOf } from "./members";
import { nextTier, tierOf } from "./paliers";
import type { StoredMember } from "./schemas";

/** Le format des aperçus de lien : Discord, comme les autres, attend 1200 × 630. */
const WIDTH = 1200;
const HEIGHT = 630;
/** La scène de la place, sous l'en-tête. */
const PLACE_HEIGHT = 136;
/** Le Gaulois du membre, en entier, à droite de la fiche : la colonne qu'il prend, le côté d'une case, et le sol sous ses pieds. */
const SPRITE = { column: 280, scale: 6, ground: HEIGHT - 62 } as const;
/** Son ombre au sol, comme sur l'image de /gaulois : plus sombre que l'encre du fond. */
const SPRITE_SHADOW = "#02050F";

export interface FicheFacts {
  /** L'identifiant public (publicID) du membre, celui de sa fiche : pour retrouver son Gaulois du village. Jamais écrit sur l'image. */
  id?: string | null;
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
    id: member.publicId,
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

/**
 * Quoi écrire et où, à partir des faits seuls : se teste sans police. `gaulois` : si le membre a créé son Gaulois au village,
 * il se tient en entier à droite de la fiche, et la place et les chiffres se serrent à gauche ; sinon, la fiche d'avant.
 */
export function ficheCard(facts: FicheFacts, tag: string, siteUrl: string, listedAt: string, measure: Measure, gaulois: GauloisParJoueur = AUCUN_GAULOIS): GazetteCard {
  const tenue = tenueOf(gaulois, facts.id);
  const sprite = tenue && placeSprite(tenue, { axis: WIDTH - MARGIN - SPRITE.column / 2 + 10, bottom: SPRITE.ground, scale: SPRITE.scale, room: SPRITE.ground - LOGO.y });
  const column = sprite ? SPRITE.column : 0;
  // Le pseudo en Inter, comme dans la gazette : elle sait écrire le cyrillique et le grec, pas l'onciale. Pas de lettrine sur un nom.
  const head = pageHead({ path: "/membres/fiche", title: facts.username, name: true, kicker: `Membre de [${tag}]` }, measure, column);
  const rects: CardRect[] = [...head.rects];
  const texts: CardText[] = [...head.texts];
  const width = WIDTH - 2 * MARGIN - column;
  if (sprite) {
    // Son ombre au sol, sous ses pieds.
    const body = spriteRect(sprite);
    const shadow = { width: 36 * SPRITE.scale, height: 5 * SPRITE.scale };
    rects.push({ x: WIDTH - MARGIN - SPRITE.column / 2 + 10 - shadow.width / 2, y: body.y + body.height - Math.round(shadow.height * 0.6), ...shadow, radius: shadow.height / 2, color: SPRITE_SHADOW });
  }

  // La place, en grand, et ce qu'elle mesure : une scène bleue, comme le classement sur l'accueil du site.
  const placeTop = head.bottom;
  rects.push({ x: MARGIN, y: placeTop, width, height: PLACE_HEIGHT, radius: 10, ...STAGES.blue, cut: 26 });
  rects.push({ x: MARGIN + 16, y: placeTop + 18, width: 5, height: PLACE_HEIGHT - 36, radius: 0, color: C.RED });
  const place = fitted(facts.games === 0 ? "Aucune partie sous le tag" : fmtRank(facts.rank), "cases", 84, 40, width - 80, measure);
  texts.push({ ...place, x: MARGIN + 44, y: placeTop + 98, font: "cases", color: C.WHITE, glow: true });
  if (facts.games > 0) {
    const placeWidth = measure(place.text, "cases", place.size) + 30;
    const detail = `sur ${fmtInt(facts.ranked)} membres, aux victoires sous le tag`;
    texts.push({ ...fitted(detail, "body", 27, 20, width - 80 - placeWidth, measure), x: MARGIN + 44 + placeWidth, y: placeTop + 94, font: "body", color: C.STAGE_MUTED });
  }

  // Les chiffres, en quatre colonnes : les mêmes que sur la fiche.
  const kpis = kpiParts(
    [
      { label: "Victoires", value: fmtInt(facts.wins) },
      { label: "Défaites", value: fmtInt(facts.losses) },
      { label: "Taux de victoire", value: fmtPct(facts.rate) },
      { label: "Palier", value: facts.tier === null ? "Pas encore" : `${fmtInt(facts.tier)} victoires` },
    ],
    // À côté du Gaulois, les colonnes sont plus étroites : un palier s'écrit plus petit plutôt que coupé.
    { x: MARGIN, y: placeTop + PLACE_HEIGHT + 26, width, valueSize: 44, minValueSize: sprite ? 18 : 26 },
    measure,
  );
  rects.push(...kpis.rects);
  texts.push(...kpis.texts);
  if (facts.nextTier && facts.games > 0) {
    const next = `Prochain palier : ${fmtInt(facts.nextTier.wins)} victoires, encore ${fmtInt(facts.nextTier.missing)}.`;
    texts.push({ ...fitted(next, "body", 23, 18, width, measure), x: MARGIN, y: HEIGHT - 70, font: "body", color: C.MUTED });
  }

  const url = `${siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/membres`;
  texts.push(...pageFoot(url, `Liste officielle du ${fmtDate(listedAt)}. Parties publiques en équipe sous le tag.`, HEIGHT - 24, measure).texts);
  return { width: WIDTH, height: HEIGHT, rects, texts, logo: LOGO, ...(sprite ? { gaulois: [sprite] } : {}) };
}

/** Ce que l'image dit, pour un lecteur d'écran et pour la description du lien. */
export function ficheImageAlt(facts: FicheFacts, tag: string, listedAt: string): string {
  const listed = `Liste officielle du ${fmtDate(listedAt)}.`;
  if (facts.games === 0) return `${facts.username}, membre de [${tag}] : aucune partie sous le tag, pas encore de palier. ${listed}`;
  const tier = facts.tier === null ? "pas encore de palier" : `palier des ${fmtInt(facts.tier)} victoires`;
  return `${facts.username}, membre de [${tag}] : ${fmtRank(facts.rank)} sur ${fmtInt(facts.ranked)} membres aux victoires sous le tag. ${fmtInt(facts.wins)} victoires, ${fmtInt(facts.losses)} défaites, ${fmtPct(facts.rate)}, ${tier}. ${listed}`;
}

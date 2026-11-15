/**
 * L'image d'aperçu d'une fiche de membre, pour un lien collé sur Discord : le pseudo, sa place aux victoires sous le tag,
 * son palier et ses chiffres. Même dessin que l'image de la semaine (`gazette-image.ts`). Tout vient de la liste des
 * membres (`stats.team`) : rien n'est recalculé ici, et un membre sans stats n'a pas d'image.
 */
import { fmtDate, fmtInt, fmtPct, fmtRank } from "./format";
import { AUCUN_GAULOIS, type GauloisParJoueur } from "./gaulois-joueurs";
import { placeSprite, spriteRect, tenueOf } from "./gaulois-sprite";
import { FLAMME, FLAMME_DOREE } from "./flamme-serie";
import { CARD_COLORS as C, fitted, kpiParts, LOGO, MARGIN, pageFoot, pageHead, STAGES, type CardDessin, type CardEmbleme, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";
import { gamesOf, placeOf, rateOf } from "./members";
import { accountLabel } from "./niveau";
import { OPENFRONT_CREDIT } from "./victoires-discord";
import { nextTier, tierOf } from "./paliers";
import type { AccountLevel, StoredMember } from "./schemas";
import { datesDeLaSerie, flammeAllumee, serieEnMots, type RecordPersonnel, type SerieEnCours } from "./serie-en-cours";

/** Le format des aperçus de lien : Discord, comme les autres, attend 1200 × 630. */
const WIDTH = 1200;
const HEIGHT = 630;
/** La scène de la place, sous l'en-tête. */
const PLACE_HEIGHT = 136;
/** Le Gaulois du membre, en entier, à droite de la fiche : la colonne qu'il prend, le côté d'une case, et le sol sous ses pieds. */
const SPRITE = { column: 280, scale: 6, ground: HEIGHT - 62 } as const;
/** Son ombre au sol, comme sur l'image de /gaulois : plus sombre que l'encre du fond. */
const SPRITE_SHADOW = "#02050F";
/** L'axe du Gaulois, sur lequel se centre aussi l'emblème de niveau, avec ou sans Gaulois. */
const AXE = WIDTH - MARGIN - SPRITE.column / 2 + 10;
/**
 * L'emblème du niveau du compte, en haut à droite, au-dessus de la tête du Gaulois (conception de Claude Fable 5.2,
 * 15 novembre 2026) : un carré de 96 px, puis le niveau en mots, « tout le jeu », et la mention d'OpenFront, à qui les
 * couleurs des prestiges sont reprises (NOTICE.md). Avec lui, le Gaulois garde la hauteur sous ces lignes (`room`), et le
 * titre s'arrête avant sa colonne.
 */
const EMBLEME = { size: 96, top: 26, label: 144, jeu: 166, credit: 186, room: SPRITE.ground - 190 } as const;
/**
 * La flamme de série, au sol, à la gauche du Gaulois (ou contre la marge sans Gaulois) : une case vaut 6 px, comme une case
 * du Gaulois. Ses deux lignes finissent 16 px avant elle.
 */
const FLAMME_POSE = { echelle: 6, gauche: 858, avecGaulois: SPRITE.ground, sansGaulois: HEIGHT - 90, ligne1: 498, ligne2: 526, ecart: 16 } as const;

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
  /** Le niveau et le prestige de son compte OpenFront, tout le jeu (`niveau.ts`), à part des stats du clan. `null` : il ne le montre pas. */
  niveau?: AccountLevel | null;
  /** Sa série de victoires en cours (`serie-en-cours.ts`), seulement quand la flamme est allumée (5 d'affilée et plus). */
  serie?: SerieEnCours | null;
  /**
   * La série en cours bat son ancien record, qui avait eu sa flamme : la flamme est dorée (`RecordPersonnel.doree`).
   * `luesDepuis` : le jour de la première de ses parties lues, d'où se compte ce record.
   */
  record?: { luesDepuis: string } | null;
}

/**
 * Ce que l'image dit d'un membre. `null` : pas de pseudo ou pas de stats, donc pas d'image. `serie` : sa série en cours
 * (`loadSeriesEnCours`), gardée seulement si la flamme est allumée.
 */
export function ficheFacts(members: readonly StoredMember[], member: StoredMember, serie: SerieEnCours | null = null, record: RecordPersonnel | null = null): FicheFacts | null {
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
    niveau: member.account ?? null,
    serie: flammeAllumee(serie) ? serie : null,
    record: flammeAllumee(serie) && record?.doree ? { luesDepuis: record.luesDepuis } : null,
  };
}

/**
 * Quoi écrire et où, à partir des faits seuls : se teste sans police. `gaulois` : si le membre a créé son Gaulois au village,
 * il se tient en entier à droite de la fiche, et la place et les chiffres se serrent à gauche ; sinon, la fiche d'avant.
 */
export function ficheCard(facts: FicheFacts, tag: string, siteUrl: string, listedAt: string, measure: Measure, gaulois: GauloisParJoueur = AUCUN_GAULOIS): GazetteCard {
  const niveau = facts.niveau ?? null;
  const serie = flammeAllumee(facts.serie ?? null) ? facts.serie! : null;
  const tenue = tenueOf(gaulois, facts.id);
  const sprite = tenue && placeSprite(tenue, { axis: AXE, bottom: SPRITE.ground, scale: SPRITE.scale, room: niveau ? EMBLEME.room : SPRITE.ground - LOGO.y });
  const column = sprite ? SPRITE.column : 0;
  // Le pseudo en Inter, comme dans la gazette : elle sait écrire le cyrillique et le grec, pas l'onciale. Pas de lettrine sur un nom.
  // Il s'arrête avant la colonne du Gaulois, ou de l'emblème seul : un long pseudo ne passe jamais dessous.
  const head = pageHead({ path: "/membres/fiche", title: facts.username, name: true, kicker: `Membre de [${tag}]` }, measure, sprite || niveau ? SPRITE.column : 0);
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
  // L'emblème de niveau : tout le jeu, à part des chiffres du clan. Le chiffre est blanc, jamais dans la couleur du prestige.
  const emblemes: CardEmbleme[] = [];
  if (niveau) {
    emblemes.push({ account: niveau, x: AXE - EMBLEME.size / 2, y: EMBLEME.top, size: EMBLEME.size });
    const grand = niveau.level >= 100;
    texts.push({ text: String(niveau.level), x: AXE, y: EMBLEME.top + (grand ? 58 : 59), size: grand ? 27 : 31, font: "strong", color: C.WHITE, anchor: "middle" });
    texts.push({ ...fitted(accountLabel(niveau), "strong", 21, 16, SPRITE.column - 20, measure), x: AXE, y: EMBLEME.label, font: "strong", color: C.WHITE, anchor: "middle" });
    texts.push({ text: "tout le jeu", x: AXE, y: EMBLEME.jeu, size: 17, font: "body", color: C.MUTED, anchor: "middle" });
    texts.push({ text: OPENFRONT_CREDIT, x: AXE, y: EMBLEME.credit, size: 13, font: "body", color: C.MUTED, anchor: "middle" });
  }

  // La flamme de série : au sol à la gauche du Gaulois, ou contre la marge droite sans lui ; ses deux lignes avant elle.
  const dessins: CardDessin[] = [];
  let gaucheFlamme: number | null = null;
  if (serie) {
    const largeur = FLAMME.largeur * FLAMME_POSE.echelle;
    const hauteur = FLAMME.hauteur * FLAMME_POSE.echelle;
    gaucheFlamme = sprite ? Math.min(FLAMME_POSE.gauche, spriteRect(sprite).x - 12 - largeur) : WIDTH - MARGIN - largeur;
    const pied = sprite ? FLAMME_POSE.avecGaulois : FLAMME_POSE.sansGaulois;
    // La flamme d'or du record battu : même forme, même place ; « record » le dit en mots sur la deuxième ligne.
    dessins.push({ decor: facts.record ? FLAMME_DOREE : FLAMME, x: gaucheFlamme, y: pied - hauteur, echelle: FLAMME_POSE.echelle });
    const ancre = gaucheFlamme - FLAMME_POSE.ecart;
    texts.push({ ...fitted(serieEnMots(serie), "strong", 28, 20, 400, measure), x: ancre, y: FLAMME_POSE.ligne1, font: "strong", color: C.WHITE, anchor: "end" });
    // Ses dates, toujours : un membre qui ne joue plus garde sa série, qui ne doit pas se lire comme d'aujourd'hui. 480 px :
    // la plus longue, « record sous le tag, du 28 sept. au 14 nov. 2026 », tient sans être coupée, au-dessus du prochain palier.
    texts.push({ ...fitted(`${facts.record ? "record " : ""}sous le tag, ${datesDeLaSerie(serie)}`, "body", 20, 16, 480, measure), x: ancre, y: FLAMME_POSE.ligne2, font: "body", color: C.MUTED, anchor: "end" });
  }

  if (facts.nextTier && facts.games > 0) {
    const next = `Prochain palier : ${fmtInt(facts.nextTier.wins)} victoires, encore ${fmtInt(facts.nextTier.missing)}.`;
    // À côté d'une flamme posée au sol, la ligne s'arrête avant elle.
    const room = gaucheFlamme !== null && sprite ? Math.min(width, gaucheFlamme - MARGIN - FLAMME_POSE.ecart) : width;
    texts.push({ ...fitted(next, "body", 23, 18, room, measure), x: MARGIN, y: HEIGHT - 70, font: "body", color: C.MUTED });
  }

  const url = `${siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/membres`;
  texts.push(...pageFoot(url, `Liste officielle du ${fmtDate(listedAt)}. Parties publiques en équipe sous le tag.`, HEIGHT - 24, measure).texts);
  return {
    width: WIDTH,
    height: HEIGHT,
    rects,
    texts,
    logo: LOGO,
    ...(sprite ? { gaulois: [sprite] } : {}),
    ...(emblemes.length > 0 ? { emblemes } : {}),
    ...(dessins.length > 0 ? { dessins } : {}),
  };
}

/** Ce que l'image dit, pour un lecteur d'écran et pour la description du lien. */
export function ficheImageAlt(facts: FicheFacts, tag: string, listedAt: string): string {
  // La série, puis le compte : deux phrases à part, chacune seulement si l'image la dessine.
  const serie = flammeAllumee(facts.serie ?? null) ? `Série en cours : ${serieEnMots(facts.serie!)} sous le tag, ${datesDeLaSerie(facts.serie!)}, sans défaite depuis. ${facts.record ? `C'est son record, sur ses parties lues depuis le ${fmtDate(facts.record.luesDepuis)}. ` : ""}` : "";
  const niveau = facts.niveau ? `Compte OpenFront, tout le jeu : ${accountLabel(facts.niveau)}. ` : "";
  const listed = `${serie}${niveau}Liste officielle du ${fmtDate(listedAt)}.`;
  if (facts.games === 0) return `${facts.username}, membre de [${tag}] : aucune partie sous le tag, pas encore de palier. ${listed}`;
  const tier = facts.tier === null ? "pas encore de palier" : `palier des ${fmtInt(facts.tier)} victoires`;
  return `${facts.username}, membre de [${tag}] : ${fmtRank(facts.rank)} sur ${fmtInt(facts.ranked)} membres aux victoires sous le tag. ${fmtInt(facts.wins)} victoires, ${fmtInt(facts.losses)} défaites, ${fmtPct(facts.rate)}, ${tier}. ${listed}`;
}

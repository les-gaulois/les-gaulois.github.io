/**
 * L'image d'une victoire : l'en-tête des autres images du robot, la vignette de la carte sur la mer du jeu, et à sa droite
 * les chiffres de la partie, puis tous les Gaulois de la partie, sous leur nom en partie, en bleu, et les clans en face,
 * « contre » et leur tag en rouge (demandés par le pilote le 13 novembre 2026). Sans vignette, les chiffres passent en grand
 * sur toute la largeur, comme dans « Hier chez les Gaulois ». Ce qui manque n'est pas dessiné.
 *
 * Depuis le 17 novembre 2026, l'image est large et basse (demande du pilote : la même largeur que l'image du score d'utilité
 * qui la suit, et « j'aime bien quand c'est grand ») : Discord montre une image dans un cadre de 550 sur 350, où une image
 * haute paraît étroite. Les Gaulois sont donc à droite de la carte, plus dessous, et une image encore trop haute s'élargit
 * (`auCadreDeDiscord`).
 *
 * La vignette est `resources/maps/<carte>/thumbnail.webp` du dépôt d'OpenFront, lue au moment de l'envoi : CC BY-SA 4.0,
 * attribution « OpenFront », agrandie ou réduite, aux coins arrondis, posée sur la couleur de la mer du jeu là où son eau est
 * transparente. Le message n'a plus de texte depuis le 12 novembre 2026 : c'est l'image qui porte tout le crédit, avec la
 * mention « © OpenFront and Contributors », la licence, ce que le robot a changé, et les adresses de la source et de la
 * licence, écrites en toutes lettres. Jamais le CDN du jeu : voir NOTICE.md.
 *
 * Avec la monnaie du village (`STATERES_SUR_LES_VICTOIRES`), la pièce et le nombre de statères que reçoit chaque Gaulois
 * présent se posent sous les points rapportés au clan, d'où ils viennent (`stateresDeVictoire`, `stateres.ts`). Rien si la
 * partie ne rapporte pas de points.
 *
 * Depuis le 15 novembre 2026, la carte de fin remplace la vignette quand la partie a pu être rejouée (`carte-finale.ts`) : la
 * même place, le même cadre, mais les territoires de chacun au dernier contrôle de la partie, les Gaulois dans le bleu de leurs
 * pastilles. Le crédit le dit, et la description de l'image dit ce que montrent les couleurs.
 */
import sharp, { type OverlayOptions } from "sharp";
import { COULEUR_EQUIPE, COULEUR_GAULOIS, COULEUR_ROBOTS, couleursDesJoueurs, dessinerCarteFinale, MER_FINALE_CSS, ouverteSurLaMer, partsDesCouleurs, type EtatFinal, type Rgb } from "./carte-finale";
import { casesDuStatere, type TailleStatere } from "../../supabase/functions/code-discord/statere";
import { fmtCount, fmtEpochTime, fmtInt, fmtMinutes, fmtScore } from "./format";
import { AUCUN_GAULOIS, type GauloisParJoueur } from "./gaulois-joueurs";
import { CARD_COLORS as C, fitted, kpiHeight, kpiParts, LOGO, MARGIN, pageFoot, pageHead, renderGazetteCard, type CardRect, type CardText, type GazetteCard, type GazetteFonts, type Kpi, type Measure } from "./gazette-image";
import { dayTitle } from "./hier-discord";
import { mapKey, mapLabel } from "./map-names";
import { formatLabel } from "./results";
import { fittedAlt, shownAddress } from "./salon-discord";
import { chipLayout, chipParts, chipsHeight } from "./salon-image";
import { stateresDeVictoire } from "./stateres";
import { parisParts } from "./time";
import type { Victory } from "./victoires";
import { countedWords, countWords, crewList, gameLength, LICENSE_URL, mapSource, MAPS_SOURCE, OPENFRONT_CREDIT, pointsLabel, pointsWords, restWords, rivalsWords, rivalTag, victoryTitle } from "./victoires-discord";

const WIDTH = 1200;
/**
 * Avec la vignette : la carte à gauche, sur la moitié de la largeur ; à droite, les chiffres côte à côte, puis les Gaulois de
 * la partie et les clans en face. Tout tient ainsi dans une image large et basse : Discord montre une image dans un cadre de
 * 550 sur 350, et une image haute y paraît étroite (demande du pilote, 17 novembre 2026 : « j'aime bien quand c'est grand »).
 */
const MAP_BOX_SHARE = 0.5;
const BODY_HEIGHT = 420;
/** Les chiffres à côté de la carte : plus petits que seuls, ils sont trois dans une demi-largeur. */
const SIDE_VALUE_SIZE = 46;
const SIDE_KPI_GAP = 16;
/** Sous les chiffres, la ligne de la pièce et des statères, puis les pastilles. */
const STATER_LINE = 46;
const SIDE_CHIPS_LEAD = 22;

/** Le cadre où Discord montre une image jointe, et la plus grande largeur qu'une image prend pour le remplir. */
export const CADRE_DISCORD = { width: 550, height: 350 } as const;
export const LARGEUR_MAX = 1600;

/**
 * La mise en page à la largeur qui remplit le cadre de Discord : dessinée d'abord à 1 200 de large, puis, si elle est trop
 * haute pour sa largeur, redessinée plus large, dans la limite de `LARGEUR_MAX`. Deux images de suite ont ainsi la même
 * largeur dans le salon.
 */
export function auCadreDeDiscord<T extends { width: number; height: number }>(dessiner: (width: number) => T): T {
  const first = dessiner(WIDTH);
  const width = Math.min(LARGEUR_MAX, Math.ceil((first.height * CADRE_DISCORD.width) / CADRE_DISCORD.height));
  return width > WIDTH ? dessiner(width) : first;
}
const MAP_PADDING = 14;
/** La vignette ne grossit pas au-delà : elle deviendrait floue. */
const MAX_ZOOM = 2;
const GAP = 28;
/** Sans la vignette : les chiffres côte à côte, en grand. */
const ROW_VALUE_SIZE = 80;
/** Sous le contenu : l'adresse du site et le crédit de la carte, puis les adresses de sa source et de sa licence. */
const FOOTER_HEIGHT = 104;
/** Les adresses du crédit ne s'écrivent pas plus petit : au-delà, celle du dossier de toutes les cartes remplace celle de la carte. */
const CREDIT_MIN_SIZE = 14;

/**
 * La pièce et les statères de chaque Gaulois, sous les points de la victoire. Allumée le 14 novembre 2026, une fois les
 * statères vus arriver dans une bourse avec un vrai compte ; à `false`, l'image redevient celle d'avant la monnaie.
 */
export const STATERES_SUR_LES_VICTOIRES = true;
/** La pièce sous les points : ses 16 cases, de 2 pixels chacune, au milieu de la hauteur des capitales de sa ligne. */
const COIN_CELLS: TailleStatere = 16;
const COIN_CELL = 2;
const COIN_GAP = 10;
/** De la ligne de base d'un chiffre à celle de sa ligne d'explication : la mesure de `kpiParts`. */
const HINT_DROP = 42;
/** L'écart entre deux chiffres côte à côte, et ce qu'un chiffre laisse libre dans sa colonne : les mesures de `kpiParts`. */
const KPI_GAP = 24;
const KPI_INSET = 26;

/**
 * « 54 statères par villageois » : seuls les comptes validés qui ont créé leur Gaulois au village en reçoivent,
 * l'image ne promet donc rien à « chaque Gaulois », et le mot tient dans la colonne. `null` : la partie ne rapporte pas de points.
 */
export function staterWords(v: Victory): string | null {
  const each = stateresDeVictoire(v.points, v.gaulois);
  if (each < 1) return null;
  return `${fmtCount(each, "statère")} par villageois`;
}

/** La pièce, en rectangles : une suite de cases de même couleur sur une rangée n'en fait qu'un. */
export function coinRects(x: number, y: number, cells: TailleStatere = COIN_CELLS, cell = COIN_CELL): CardRect[] {
  const colors = casesDuStatere(cells);
  const rects: CardRect[] = [];
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; ) {
      const color = colors[row * cells + col];
      let end = col + 1;
      while (end < cells && colors[row * cells + end] === color) end++;
      if (color) rects.push({ x: x + col * cell, y: y + row * cell, width: (end - col) * cell, height: cell, radius: 0, color });
      col = end;
    }
  }
  return rects;
}

/** La pièce et les statères sur leur propre ligne, sous les chiffres posés à côté de la carte : `y`, le haut de la ligne. */
function staterLine(v: Victory, x: number, y: number, room: number, measure: Measure): { rects: CardRect[]; texts: CardText[] } {
  const words = staterWords(v);
  if (!words) return { rects: [], texts: [] };
  const coin = COIN_CELLS * COIN_CELL;
  return {
    rects: coinRects(x, y),
    texts: [{ ...fitted(words, "body", 26, 17, room - coin - COIN_GAP, measure), x: x + coin + COIN_GAP, y: y + coin / 2 + 9, font: "body", color: C.MUTED }],
  };
}

/**
 * La pièce et les statères, sous le chiffre des points : à la place de la ligne d'explication, que ce chiffre n'a pas.
 * `texts` : ceux des chiffres, où se retrouve celui des points ; `room` : la largeur libre de sa colonne.
 */
function staterParts(v: Victory, texts: readonly CardText[], room: number, measure: Measure): { rects: CardRect[]; texts: CardText[] } {
  const words = staterWords(v);
  const value = texts.find((t) => t.font === "cases" && t.text.startsWith("+"));
  if (!words || !value) return { rects: [], texts: [] };
  const coin = COIN_CELLS * COIN_CELL;
  const baseline = value.y + HINT_DROP;
  return {
    rects: coinRects(value.x, baseline - 9 - coin / 2),
    texts: [{ ...fitted(words, "body", 26, 17, room - coin - COIN_GAP, measure), x: value.x + coin + COIN_GAP, y: baseline, font: "body", color: C.MUTED }],
  };
}

/** La mer du jeu, là où l'eau de la vignette est transparente : l'océan du client d'OpenFront, #4785b5 assombri de 10 par canal. */
export const SEA = "#3D7BAB";

/** Le crédit de la carte, en bas de l'image : la mention que demande OpenFront, la licence, et ce que le robot a changé. */
export const MAP_NOTE = `Carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0, redimensionnée`;
export const NAME_NOTE = `Nom de la carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0`;
/** La carte de fin : le terrain du jeu, et la partie rejouée par son moteur (dit en entier dans la description de l'image). */
export const FINAL_NOTE = `Carte de fin rejouée : ${OPENFRONT_CREDIT}, CC BY-SA 4.0`;

const shownUrl = (url: string) => url.replace(/^https?:\/\//, "");

/**
 * Les adresses de la source et de la licence, sous le crédit : sans texte dans le message, l'image les écrit elle-même, comme
 * le demande la licence CC BY-SA. `fits` : l'adresse du dossier de la carte tient-elle sur la ligne ? Sinon, celle du dossier
 * de toutes les cartes, toujours assez courte.
 */
export function creditAddresses(map: string, fits: (line: string) => boolean): string {
  const line = (source: string) => `${shownUrl(source)} · ${shownUrl(LICENSE_URL)}`;
  const precise = line(mapSource(map));
  return fits(precise) ? precise : line(MAPS_SOURCE);
}

/** Où poser la vignette, à sa taille dans l'image. */
export interface MapPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export interface VictoryCard extends GazetteCard {
  /** `null` : pas de vignette, les chiffres sont côte à côte. */
  map: MapPlacement | null;
}

/** « 16 min », arrondi à la minute ; « 2 h 51 min » au-delà d'une heure, comme le texte de secours. */
export const tileLength = (seconds: number) => (seconds >= 3600 ? gameLength(seconds) : fmtMinutes(seconds));

/** Les chiffres de la partie, comme les chiffres clés du site : le libellé de la machine, le chiffre, puis ce qu'il compte. */
function victoryTiles(v: Victory): Kpi[] {
  const tiles: Kpi[] = [{ label: "Gaulois", value: fmtInt(v.gaulois), hint: { text: `sur ${fmtCount(v.players, "joueur")}` } }];
  if (v.points !== null) tiles.push({ label: pointsLabel(v.points), value: `+${fmtScore(v.points)}` });
  tiles.push({ label: "Durée", value: tileLength(v.seconds), hint: { text: "de partie" } });
  return tiles;
}

/** « Mardi 11 novembre à 18:04 », à l'heure de Paris. */
export const victoryWhen = (v: Pick<Victory, "start">) => `${dayTitle(parisParts(v.start).date)} à ${fmtEpochTime(Date.parse(v.start) / 1000)}`;

/** Ce que la mise en page sait de la vignette. `open` : son pourtour n'est que de l'eau, la mer peut remplir tout le cadre. */
export interface ThumbnailShape {
  width: number;
  height: number;
  open: boolean;
  /** La carte de fin, rejouée, au lieu de la vignette : le crédit change. */
  final?: boolean;
}

/**
 * Quoi écrire et où, à partir de la victoire et de la forme de la vignette : se teste sans police. `gaulois` : le Gaulois du
 * village de chaque membre de la partie qui a créé le sien, en buste derrière sa pastille bleue (`salon-image.ts`).
 */
export function victoryCard(
  v: Victory,
  tag: string,
  siteUrl: string,
  measure: Measure,
  thumbnail: ThumbnailShape | null,
  staters = STATERES_SUR_LES_VICTOIRES,
  gaulois: GauloisParJoueur = AUCUN_GAULOIS,
  /** La largeur de l'image : 1 200, ou plus pour remplir le cadre de Discord (`auCadreDeDiscord`). */
  cardWidth = WIDTH,
): VictoryCard {
  const tiles = victoryTiles(v);
  const contentWidth = cardWidth - 2 * MARGIN;

  // L'en-tête : la victoire et son format, le nom de la carte en titre, puis l'heure de la partie.
  const head = pageHead({ path: "/parties", title: mapLabel(v.map), kicker: `${victoryTitle(tag)}${v.format ? ` · ${formatLabel(v.format)}` : ""}`, period: `${victoryWhen(v)}, heure de Paris` }, measure);
  const top = head.bottom;
  const rects: CardRect[] = [...head.rects];
  const texts: CardText[] = [...head.texts];
  const sprites: NonNullable<GazetteCard["gaulois"]> = [];

  // Tous les Gaulois de la partie, en pastilles sous leur nom en partie, jamais « et autres » ; puis ceux qui sont seulement
  // comptés ; puis « contre » et les clans en face, en rouge.
  const rivals = v.rivals.length > 0 ? [{ text: "contre", named: false, word: true }, ...v.rivals.map((t) => ({ text: rivalTag(t), named: false, red: true }))] : [];
  const items = [...v.crew.map((p) => ({ text: p.name, named: true, id: p.id })), ...countedWords(v).map((text) => ({ text, named: false })), ...rivals];

  let map: MapPlacement | null = null;
  let contentBottom: number;
  if (thumbnail) {
    // À droite de la carte : les chiffres côte à côte, la pièce et les statères sur leur ligne, puis les pastilles.
    const boxWidth = Math.round(contentWidth * MAP_BOX_SHARE);
    const x = MARGIN + boxWidth + GAP;
    const sideWidth = cardWidth - MARGIN - x;
    const kpis = kpiParts(tiles, { x, y: top, width: sideWidth, gap: SIDE_KPI_GAP, valueSize: SIDE_VALUE_SIZE, minValueSize: 20 }, measure);
    rects.push(...kpis.rects);
    texts.push(...kpis.texts);
    let sideBottom = kpis.bottom;
    const coin = staters ? staterLine(v, x, sideBottom + 14, sideWidth, measure) : { rects: [], texts: [] };
    if (coin.texts.length > 0) {
      rects.push(...coin.rects);
      texts.push(...coin.texts);
      sideBottom += STATER_LINE;
    }
    const chips = chipLayout(items, measure, sideWidth, gaulois);
    if (chips.rows.length > 0) {
      const drawn = chipParts(chips, x, sideBottom + SIDE_CHIPS_LEAD);
      rects.push(...drawn.rects);
      texts.push(...drawn.texts);
      if (drawn.gaulois) sprites.push(...drawn.gaulois);
      sideBottom += SIDE_CHIPS_LEAD + chipsHeight(chips);
    }
    // Le cadre de la carte descend aussi bas que la colonne de droite : beaucoup de Gaulois agrandissent la carte.
    const boxHeight = Math.max(BODY_HEIGHT, sideBottom - top);
    contentBottom = top + boxHeight;
    // La vignette, aussi grande que possible dans son cadre, au centre, sur la mer du jeu. Une carte entourée d'eau baigne dans
    // la mer jusqu'au bord du cadre ; les autres s'arrêtent à leur bord, pour ne pas couper une terre net au milieu de l'eau.
    // La carte de fin a sa mer de nuit (`MER_FINALE_CSS`), la vignette la mer du jeu.
    const sea = thumbnail.final ? MER_FINALE_CSS : SEA;
    rects.push(thumbnail.open ? { x: MARGIN, y: top, width: boxWidth, height: boxHeight, radius: 8, color: sea } : { x: MARGIN, y: top, width: boxWidth, height: boxHeight, radius: 8, color: C.SURFACE, stroke: C.LINE });
    const zoom = Math.min((boxWidth - 2 * MAP_PADDING) / thumbnail.width, (boxHeight - 2 * MAP_PADDING) / thumbnail.height, MAX_ZOOM);
    const width = Math.max(1, Math.round(thumbnail.width * zoom));
    const mapHeight = Math.max(1, Math.round(thumbnail.height * zoom));
    map = { x: MARGIN + Math.round((boxWidth - width) / 2), y: top + Math.round((boxHeight - mapHeight) / 2), width, height: mapHeight, radius: 6 };
    if (!thumbnail.open) rects.push({ ...map, color: sea });
  } else {
    // Sans vignette : les chiffres côte à côte, en grand, puis les pastilles sur toute la largeur.
    const kpis = kpiParts(tiles, { x: MARGIN, y: top, width: contentWidth, valueSize: ROW_VALUE_SIZE }, measure);
    rects.push(...kpis.rects);
    texts.push(...kpis.texts);
    if (staters) {
      const coin = staterParts(v, kpis.texts, (contentWidth - (tiles.length - 1) * KPI_GAP) / tiles.length - KPI_INSET, measure);
      rects.push(...coin.rects);
      texts.push(...coin.texts);
    }
    const chips = chipLayout(items, measure, contentWidth, gaulois);
    const bodyBottom = top + kpiHeight(ROW_VALUE_SIZE);
    const drawn = chipParts(chips, MARGIN, bodyBottom + 28);
    rects.push(...drawn.rects);
    texts.push(...drawn.texts);
    if (drawn.gaulois) sprites.push(...drawn.gaulois);
    contentBottom = chips.rows.length > 0 ? bodyBottom + 28 + chipsHeight(chips) : bodyBottom;
  }
  const height = contentBottom + FOOTER_HEIGHT;

  // L'adresse du site et le crédit de la carte, puis, dessous, les adresses de la source et de la licence.
  texts.push(...pageFoot(shownAddress(siteUrl, "/parties"), thumbnail ? (thumbnail.final ? FINAL_NOTE : MAP_NOTE) : NAME_NOTE, height - 54, measure, cardWidth).texts);
  const addresses = creditAddresses(v.map, (line) => measure(line, "body", CREDIT_MIN_SIZE) <= contentWidth);
  texts.push({ ...fitted(addresses, "body", 20, CREDIT_MIN_SIZE, contentWidth, measure), x: cardWidth - MARGIN, y: height - 22, font: "body", color: C.MUTED, anchor: "end" });
  return { width: cardWidth, height, rects, texts, logo: LOGO, map, ...(sprites.length > 0 ? { gaulois: sprites } : {}) };
}

/**
 * Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. Elle dit aussi d'où viennent les
 * noms, que l'image n'écrit pas. Sans couper un nom : au-delà de ce que Discord accepte, les autres Gaulois sont comptés, et
 * le crédit de la carte reste entier.
 */
export function victoryImageAlt(v: Victory, tag: string, withMap: boolean, staters = STATERES_SUR_LES_VICTOIRES, finalWords: string | null = null): string {
  const head = `${victoryTitle(tag)} sur la carte ${mapLabel(v.map)}${v.format ? `, ${formatLabel(v.format)}` : ""}, ${victoryWhen(v).toLowerCase()}, heure de Paris.`;
  const figures = `${countWords(v)}${v.points === null ? "" : `, ${pointsWords(v.points)}`}, partie de ${tileLength(v.seconds)}.`;
  const each = staters ? stateresDeVictoire(v.points, v.gaulois) : 0;
  const coins = each > 0 ? [`Chaque Gaulois du village présent dans la partie reçoit ${fmtCount(each, "statère")}, pour les points rapportés au clan.`] : [];
  const credit =
    withMap && finalWords
      ? `${finalWords} Terrain et nom de la carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0.`
      : withMap
        ? `Image et nom de la carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0, image redimensionnée.`
        : `Nom de la carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0.`;
  return fittedAlt(v.crew, (shown, rest) => {
    const crew = crewList(
      shown.map((p) => p.name),
      [...(rest > 0 ? [restWords(rest, shown.length)] : []), ...countedWords(v)],
    );
    const rivals = rivalsWords(v.rivals);
    return [head, figures, ...coins, ...(crew ? [`Gaulois de la partie, sous leur nom en partie : ${crew}.`] : []), ...(rivals ? [`Victoire ${rivals}.`] : []), credit].join(" ");
  });
}

/* ---------- La vignette ---------- */

/** Le dépôt d'OpenFront, branche principale : une carte ajoutée au jeu y a déjà sa vignette. */
export const THUMBNAILS = "https://raw.githubusercontent.com/openfrontio/OpenFrontIO/main/resources/maps";
/** Une vignette pèse quelques kilo-octets : au-delà, la réponse n'en est pas une. */
const MAX_THUMBNAIL_BYTES = 2_000_000;

export interface Thumbnail extends ThumbnailShape {
  data: Buffer;
}

/** Le pourtour n'est-il que de l'eau, c'est-à-dire transparent ? `alpha` : une valeur de 0 à 255 par pixel, ligne après ligne. */
export function openAround(alpha: Uint8Array, width: number, height: number): boolean {
  const water = (x: number, y: number) => (alpha[y * width + x] ?? 255) < 16;
  for (let x = 0; x < width; x++) if (!water(x, 0) || !water(x, height - 1)) return false;
  for (let y = 0; y < height; y++) if (!water(0, y) || !water(width - 1, y)) return false;
  return true;
}

/** L'adresse de la vignette d'une carte. `null` : le nom ne donne pas de dossier possible. */
export function thumbnailUrl(map: string): string | null {
  const key = mapKey(map);
  return /^[a-z0-9]{2,60}$/.test(key) ? `${THUMBNAILS}/${key}/thumbnail.webp` : null;
}

/** Lit la vignette d'une carte. Lève une erreur si elle ne se lit pas : l'image se dessine alors sans elle. */
export async function readThumbnail(map: string, get: typeof fetch): Promise<Thumbnail> {
  const url = thumbnailUrl(map);
  if (!url) throw new Error("nom de carte inattendu");
  const response = await get(url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_THUMBNAIL_BYTES) throw new Error("fichier trop lourd");
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length === 0 || data.length > MAX_THUMBNAIL_BYTES) throw new Error("taille inattendue");
  const { width, height } = await sharp(data).metadata();
  if (!width || !height || width > 4096 || height > 4096) throw new Error("dimensions inattendues");
  const alpha = await sharp(data).ensureAlpha().extractChannel("alpha").raw().toBuffer();
  return { data, width, height, open: openAround(alpha, width, height) };
}

/* ---------- La carte de fin ---------- */

/** La forme de la carte de fin, pour la mise en page : la taille de la carte du jeu, et si la mer l'entoure. */
export function finalMapShape(etat: EtatFinal): ThumbnailShape {
  return { width: etat.largeur, height: etat.hauteur, open: ouverteSurLaMer(etat.terrain, etat.largeur, etat.hauteur), final: true };
}

/** Le dessin se fait au double de sa place, puis se réduit : les côtes et les bords s'adoucissent comme ceux de la vignette. */
const FINAL_SCALE = 2;

/**
 * La carte de fin, dessinée pour sa place dans l'image (`card.map`) : une vignette comme une autre pour `renderVictoryCard`.
 * Les territoires des Gaulois de la victoire (`v.clients`) en bleu, ceux de leur équipe (`v.team`) en bleu clair.
 */
export async function renderFinalMap(etat: EtatFinal, v: Victory, place: MapPlacement): Promise<Thumbnail> {
  const couleurs = couleursDesJoueurs(etat.joueurs, new Set(v.clients ?? []), v.team ?? null);
  const width = place.width * FINAL_SCALE;
  const height = place.height * FINAL_SCALE;
  const pixels = dessinerCarteFinale(etat, couleurs, width, height, FINAL_SCALE);
  const data = await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
  return { ...finalMapShape(etat), data };
}

/** Ce que montre la carte de fin, en mots, pour la description de l'image : seules les couleurs qui y sont. */
export function finalMapWords(etat: EtatFinal, v: Victory): string {
  const couleurs = couleursDesJoueurs(etat.joueurs, new Set(v.clients ?? []), v.team ?? null);
  const parts = partsDesCouleurs(etat, couleurs);
  const debut = "La carte montre la fin de la partie, rejouée par le moteur du jeu à partir de sa fiche publique";
  if (parts.size === 0) return `${debut}.`;
  const has = (c: Rgb) => (parts.get(c) ?? 0) > 0;
  const others = [...parts.keys()].some((c) => c !== COULEUR_GAULOIS && c !== COULEUR_EQUIPE && c !== COULEUR_ROBOTS);
  const said = [
    has(COULEUR_GAULOIS) ? "en bleu les territoires des Gaulois" : null,
    has(COULEUR_EQUIPE) ? "en bleu clair ceux de leur équipe" : null,
    others ? "dans d'autres couleurs ceux des adversaires" : null,
    has(COULEUR_ROBOTS) ? "en gris ceux des robots" : null,
  ].filter((s): s is string => s !== null);
  return `${debut} : ${said.join(", ")}.`;
}

/** Dessine l'image en PNG, avec la vignette à sa place, aux coins arrondis. Sans vignette, `card.map` doit être `null`. */
export async function renderVictoryCard(card: VictoryCard, fonts: GazetteFonts, root: string, thumbnail: Thumbnail | null): Promise<Buffer> {
  const layers: OverlayOptions[] = [];
  if (card.map && thumbnail) {
    const { width, height, radius } = card.map;
    const resized = sharp(thumbnail.data).resize(width, height, { fit: "fill" });
    // Une carte coupée à son bord a les coins arrondis de son fond de mer ; une carte entourée d'eau n'a pas de bord visible.
    if (!thumbnail.open) {
      const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}"/></svg>`);
      resized.composite([{ input: mask, blend: "dest-in" }]);
    }
    layers.push({ input: await resized.png().toBuffer(), left: card.map.x, top: card.map.y });
  }
  return renderGazetteCard(card, fonts, root, layers);
}

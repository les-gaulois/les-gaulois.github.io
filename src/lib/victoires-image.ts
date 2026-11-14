/**
 * L'image d'une victoire : l'en-tête des autres images du robot, la vignette de la carte sur la mer du jeu, les chiffres de la
 * partie à côté, puis tous les Gaulois de la partie, sous leur nom en partie, en bleu, et les clans en face, « contre » et leur
 * tag en rouge (demandés par le pilote le 13 novembre 2026). Sans vignette, les chiffres passent côte à côte, comme dans « Hier
 * chez les Gaulois ». Ce qui manque n'est pas dessiné.
 *
 * La vignette est `resources/maps/<carte>/thumbnail.webp` du dépôt d'OpenFront, lue au moment de l'envoi : CC BY-SA 4.0,
 * attribution « OpenFront », agrandie ou réduite, aux coins arrondis, posée sur la couleur de la mer du jeu là où son eau est
 * transparente. Le message n'a plus de texte depuis le 12 novembre 2026 : c'est l'image qui porte tout le crédit, avec la
 * mention « © OpenFront and Contributors », la licence, ce que le robot a changé, et les adresses de la source et de la
 * licence, écrites en toutes lettres. Jamais le CDN du jeu : voir NOTICE.md.
 */
import sharp, { type OverlayOptions } from "sharp";
import { fmtCount, fmtEpochTime, fmtInt, fmtMinutes, fmtScore } from "./format";
import { AUCUN_GAULOIS, type GauloisParJoueur } from "./gaulois-joueurs";
import { CARD_COLORS as C, fitted, kpiHeight, kpiParts, LOGO, MARGIN, pageFoot, pageHead, renderGazetteCard, type CardRect, type CardText, type GazetteCard, type GazetteFonts, type Kpi, type Measure } from "./gazette-image";
import { dayTitle } from "./hier-discord";
import { mapKey, mapLabel } from "./map-names";
import { formatLabel } from "./results";
import { fittedAlt, shownAddress } from "./salon-discord";
import { chipLayout, chipParts, chipsHeight } from "./salon-image";
import { parisParts } from "./time";
import type { Victory } from "./victoires";
import { countedWords, countWords, crewList, gameLength, LICENSE_URL, mapSource, MAPS_SOURCE, OPENFRONT_CREDIT, pointsLabel, pointsWords, restWords, rivalsWords, rivalTag, victoryTitle } from "./victoires-discord";

const WIDTH = 1200;
/** Avec la vignette : la carte à gauche, les chiffres empilés à droite. */
const MAP_BOX_WIDTH = 660;
const BODY_HEIGHT = 420;
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

/** La mer du jeu, là où l'eau de la vignette est transparente : l'océan du client d'OpenFront, #4785b5 assombri de 10 par canal. */
export const SEA = "#3D7BAB";

/** Le crédit de la carte, en bas de l'image : la mention que demande OpenFront, la licence, et ce que le robot a changé. */
export const MAP_NOTE = `Carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0, redimensionnée`;
export const NAME_NOTE = `Nom de la carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0`;

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
export const victoryWhen = (v: Victory) => `${dayTitle(parisParts(v.start).date)} à ${fmtEpochTime(Date.parse(v.start) / 1000)}`;

/** Ce que la mise en page sait de la vignette. `open` : son pourtour n'est que de l'eau, la mer peut remplir tout le cadre. */
export interface ThumbnailShape {
  width: number;
  height: number;
  open: boolean;
}

/**
 * Quoi écrire et où, à partir de la victoire et de la forme de la vignette : se teste sans police. `gaulois` : le Gaulois du
 * village de chaque membre de la partie qui a créé le sien, en buste derrière sa pastille bleue (`salon-image.ts`).
 */
export function victoryCard(v: Victory, tag: string, siteUrl: string, measure: Measure, thumbnail: ThumbnailShape | null, gaulois: GauloisParJoueur = AUCUN_GAULOIS): VictoryCard {
  const tiles = victoryTiles(v);
  const contentWidth = WIDTH - 2 * MARGIN;

  // L'en-tête : la victoire et son format, le nom de la carte en titre, puis l'heure de la partie.
  const head = pageHead({ path: "/parties", title: mapLabel(v.map), kicker: `${victoryTitle(tag)}${v.format ? ` · ${formatLabel(v.format)}` : ""}`, period: `${victoryWhen(v)}, heure de Paris` }, measure);
  const top = head.bottom;
  const rects: CardRect[] = [...head.rects];
  const texts: CardText[] = [...head.texts];

  // Tous les Gaulois de la partie, en pastilles sous leur nom en partie, jamais « et autres » ; puis ceux qui sont seulement
  // comptés ; puis « contre » et les clans en face, en rouge.
  const rivals = v.rivals.length > 0 ? [{ text: "contre", named: false, word: true }, ...v.rivals.map((t) => ({ text: rivalTag(t), named: false, red: true }))] : [];
  const chips = chipLayout([...v.crew.map((p) => ({ text: p.name, named: true, id: p.id })), ...countedWords(v).map((text) => ({ text, named: false })), ...rivals], measure, contentWidth, gaulois);
  const bodyBottom = top + (thumbnail ? BODY_HEIGHT : kpiHeight(ROW_VALUE_SIZE));
  const chipsTop = bodyBottom + 28;
  const contentBottom = chips.rows.length > 0 ? chipsTop + chipsHeight(chips) : bodyBottom;
  const height = contentBottom + FOOTER_HEIGHT;

  let map: MapPlacement | null = null;
  if (thumbnail) {
    // La vignette, aussi grande que possible dans son cadre, au centre, sur la mer du jeu. Une carte entourée d'eau baigne dans
    // la mer jusqu'au bord du cadre ; les autres s'arrêtent à leur bord, pour ne pas couper une terre net au milieu de l'eau.
    rects.push(thumbnail.open ? { x: MARGIN, y: top, width: MAP_BOX_WIDTH, height: BODY_HEIGHT, radius: 8, color: SEA } : { x: MARGIN, y: top, width: MAP_BOX_WIDTH, height: BODY_HEIGHT, radius: 8, color: C.SURFACE, stroke: C.LINE });
    const zoom = Math.min((MAP_BOX_WIDTH - 2 * MAP_PADDING) / thumbnail.width, (BODY_HEIGHT - 2 * MAP_PADDING) / thumbnail.height, MAX_ZOOM);
    const width = Math.max(1, Math.round(thumbnail.width * zoom));
    const mapHeight = Math.max(1, Math.round(thumbnail.height * zoom));
    map = { x: MARGIN + Math.round((MAP_BOX_WIDTH - width) / 2), y: top + Math.round((BODY_HEIGHT - mapHeight) / 2), width, height: mapHeight, radius: 6 };
    if (!thumbnail.open) rects.push({ ...map, color: SEA });
    // Les chiffres, empilés à droite, comme les chiffres clés du site.
    const x = MARGIN + MAP_BOX_WIDTH + GAP;
    const valueSize = 56;
    const step = (BODY_HEIGHT - kpiHeight(valueSize)) / Math.max(1, tiles.length - 1);
    tiles.forEach((tile, i) => {
      const kpi = kpiParts([tile], { x, y: Math.round(top + i * Math.min(step, kpiHeight(valueSize) + 24)), width: WIDTH - MARGIN - x, valueSize, minValueSize: 34 }, measure);
      rects.push(...kpi.rects);
      texts.push(...kpi.texts);
    });
  } else {
    // Les chiffres, côte à côte.
    const kpis = kpiParts(tiles, { x: MARGIN, y: top, width: contentWidth, valueSize: ROW_VALUE_SIZE }, measure);
    rects.push(...kpis.rects);
    texts.push(...kpis.texts);
  }

  // Les Gaulois de la partie, en pastilles, sous leur nom en partie, puis les clans en face.
  const drawn = chipParts(chips, MARGIN, chipsTop);
  rects.push(...drawn.rects);
  texts.push(...drawn.texts);

  // L'adresse du site et le crédit de la carte, puis, dessous, les adresses de la source et de la licence.
  texts.push(...pageFoot(shownAddress(siteUrl, "/parties"), thumbnail ? MAP_NOTE : NAME_NOTE, height - 54, measure).texts);
  const addresses = creditAddresses(v.map, (line) => measure(line, "body", CREDIT_MIN_SIZE) <= contentWidth);
  texts.push({ ...fitted(addresses, "body", 20, CREDIT_MIN_SIZE, contentWidth, measure), x: WIDTH - MARGIN, y: height - 22, font: "body", color: C.MUTED, anchor: "end" });
  return { width: WIDTH, height, rects, texts, logo: LOGO, map, ...(drawn.gaulois ? { gaulois: drawn.gaulois } : {}) };
}

/**
 * Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. Elle dit aussi d'où viennent les
 * noms, que l'image n'écrit pas. Sans couper un nom : au-delà de ce que Discord accepte, les autres Gaulois sont comptés, et
 * le crédit de la carte reste entier.
 */
export function victoryImageAlt(v: Victory, tag: string, withMap: boolean): string {
  const head = `${victoryTitle(tag)} sur la carte ${mapLabel(v.map)}${v.format ? `, ${formatLabel(v.format)}` : ""}, ${victoryWhen(v).toLowerCase()}, heure de Paris.`;
  const figures = `${countWords(v)}${v.points === null ? "" : `, ${pointsWords(v.points)}`}, partie de ${tileLength(v.seconds)}.`;
  const credit = withMap ? `Image et nom de la carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0, image redimensionnée.` : `Nom de la carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0.`;
  return fittedAlt(v.crew, (shown, rest) => {
    const crew = crewList(
      shown.map((p) => p.name),
      [...(rest > 0 ? [restWords(rest, shown.length)] : []), ...countedWords(v)],
    );
    const rivals = rivalsWords(v.rivals);
    return [head, figures, ...(crew ? [`Gaulois de la partie, sous leur nom en partie : ${crew}.`] : []), ...(rivals ? [`Victoire ${rivals}.`] : []), credit].join(" ");
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

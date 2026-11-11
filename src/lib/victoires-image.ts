/**
 * L'image d'une victoire : l'en-tête des autres images du robot, la vignette de la carte sur la mer du jeu, les chiffres de la
 * partie à côté, puis tous les Gaulois de la partie, sous leur nom en partie. Sans vignette, les chiffres passent côte à côte,
 * comme dans « Hier chez les Gaulois ». Ce qui manque n'est pas dessiné.
 *
 * La vignette est `resources/maps/<carte>/thumbnail.webp` du dépôt d'OpenFront, lue au moment de l'envoi : CC BY-SA 4.0,
 * attribution « OpenFront », agrandie ou réduite, aux coins arrondis, posée sur la couleur de la mer du jeu là où son eau est
 * transparente. L'image et le message le disent, avec la mention « © OpenFront and Contributors ». Jamais le CDN du jeu : voir
 * NOTICE.md.
 */
import sharp, { type OverlayOptions } from "sharp";
import { fmtCount, fmtEpochTime, fmtInt, fmtMinutes, fmtScore } from "./format";
import { CARD_COLORS as C, fitted, renderGazetteCard, type CardRect, type CardText, type GazetteCard, type GazetteFonts, type Measure } from "./gazette-image";
import { dayTitle } from "./hier-discord";
import { mapKey, mapLabel } from "./map-names";
import { formatLabel } from "./results";
import { shownAddress } from "./salon-discord";
import { parisParts } from "./time";
import type { Victory } from "./victoires";
import { countedWords, countWords, crewList, gameLength, OPENFRONT_CREDIT, pointsLabel, pointsWords, victoryTitle } from "./victoires-discord";

const WIDTH = 1200;
const MARGIN = 36;
const BODY_TOP = 196;
/** Avec la vignette : la carte à gauche, les chiffres empilés à droite. */
const MAP_BOX_WIDTH = 660;
const BODY_HEIGHT = 420;
const MAP_PADDING = 14;
/** La vignette ne grossit pas au-delà : elle deviendrait floue. */
const MAX_ZOOM = 2;
const GAP = 16;
/** Sans la vignette : les chiffres côte à côte. */
const ROW_TILE_HEIGHT = 200;
const CHIP_GAP = 12;

/** La mer du jeu, là où l'eau de la vignette est transparente : l'océan du client d'OpenFront, #4785b5 assombri de 10 par canal. */
export const SEA = "#3D7BAB";

/** Le crédit de la carte, en bas de l'image : la mention que demande OpenFront, la licence, et ce que le robot a changé. */
export const MAP_NOTE = `Carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0, redimensionnée`;
export const NAME_NOTE = `Nom de la carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0`;

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

interface Tile {
  value: string;
  label: string;
}

/** « 16 min », arrondi à la minute ; « 2 h 51 min » au-delà d'une heure, comme le texte du message. */
export const tileLength = (seconds: number) => (seconds >= 3600 ? gameLength(seconds) : fmtMinutes(seconds));

function victoryTiles(v: Victory): Tile[] {
  const tiles: Tile[] = [{ value: fmtInt(v.gaulois), label: `Gaulois sur ${fmtCount(v.players, "joueur")}` }];
  if (v.points !== null) tiles.push({ value: `+${fmtScore(v.points)}`, label: pointsLabel(v.points) });
  tiles.push({ value: tileLength(v.seconds), label: "de partie" });
  return tiles;
}

interface Chip {
  text: string;
  size: number;
  /** Un nom ; sinon, le compte de ceux qui ne sont pas nommés. */
  named: boolean;
  x: number;
  width: number;
}

/** Des pastilles grandes jusqu'à trois lignes, puis plus petites : tous les Gaulois de la partie y sont, jamais « et autres ». */
export const CHIP_STEPS = [
  { font: 28, height: 56, rows: 3 },
  { font: 24, height: 48, rows: 4 },
  { font: 20, height: 42, rows: Number.POSITIVE_INFINITY },
] as const;

interface ChipLayout {
  rows: Chip[][];
  font: number;
  height: number;
}

/** Les noms en pastilles, ligne après ligne, à la plus grande taille qui tient dans ses lignes. */
function chipLayout(v: Victory, measure: Measure, width: number): ChipLayout {
  const items = [...v.crew.map((p) => ({ text: p.name, named: true })), ...countedWords(v).map((text) => ({ text, named: false }))];
  const place = (font: number): Chip[][] => {
    const padding = Math.round(font * 0.8);
    const rows: Chip[][] = [[]];
    let x = 0;
    for (const item of items) {
      const text = fitted(item.text, "strong", font, font - 6, width - 2 * padding, measure);
      const chipWidth = Math.ceil(measure(text.text, "strong", text.size)) + 2 * padding;
      if (x > 0 && x + chipWidth > width) {
        rows.push([]);
        x = 0;
      }
      rows.at(-1)?.push({ ...text, named: item.named, x, width: chipWidth });
      x += chipWidth + CHIP_GAP;
    }
    return rows;
  };
  if (items.length === 0) return { rows: [], font: CHIP_STEPS[0].font, height: CHIP_STEPS[0].height };
  for (const step of CHIP_STEPS) {
    const rows = place(step.font);
    if (rows.length <= step.rows) return { rows, font: step.font, height: step.height };
  }
  const last = CHIP_STEPS[CHIP_STEPS.length - 1]!;
  return { rows: place(last.font), font: last.font, height: last.height };
}

/** « Mardi 11 novembre à 18:04 », à l'heure de Paris. */
export const victoryWhen = (v: Victory) => `${dayTitle(parisParts(v.start).date)} à ${fmtEpochTime(Date.parse(v.start) / 1000)}`;

/** Ce que la mise en page sait de la vignette. `open` : son pourtour n'est que de l'eau, la mer peut remplir tout le cadre. */
export interface ThumbnailShape {
  width: number;
  height: number;
  open: boolean;
}

/** Quoi écrire et où, à partir de la victoire et de la forme de la vignette : se teste sans police. */
export function victoryCard(v: Victory, tag: string, siteUrl: string, measure: Measure, thumbnail: ThumbnailShape | null): VictoryCard {
  const tiles = victoryTiles(v);
  const contentWidth = WIDTH - 2 * MARGIN;
  const chips = chipLayout(v, measure, contentWidth);
  const rows = chips.rows;
  const bodyBottom = BODY_TOP + (thumbnail ? BODY_HEIGHT : ROW_TILE_HEIGHT);
  const chipsTop = bodyBottom + 24;
  const contentBottom = rows.length > 0 ? chipsTop + rows.length * chips.height + (rows.length - 1) * CHIP_GAP : bodyBottom;
  const height = contentBottom + 76;
  const rects: CardRect[] = [{ x: 0, y: 0, width: WIDTH, height, radius: 0, color: C.NAVY }];
  const texts: CardText[] = [];
  const third = WIDTH / 3;
  rects.push({ x: 0, y: 0, width: third, height: 8, radius: 0, color: C.BLUE }, { x: third, y: 0, width: third, height: 8, radius: 0, color: C.WHITE }, { x: 2 * third, y: 0, width: third, height: 8, radius: 0, color: C.RED });

  // L'en-tête.
  const logo = { x: MARGIN, y: 34, size: 104 };
  const headerX = logo.x + logo.size + 24;
  const room = WIDTH - MARGIN - headerX;
  const kicker = `${victoryTitle(tag)}${v.format ? ` · ${formatLabel(v.format)}` : ""}`;
  texts.push({ ...fitted(kicker, "strong", 26, 20, room, measure), x: headerX, y: 64, font: "strong", color: C.BLUE_TEXT });
  texts.push({ ...fitted(mapLabel(v.map), "title", 56, 36, room, measure), x: headerX, y: 122, font: "title", color: C.WHITE });
  texts.push({ ...fitted(`${victoryWhen(v)}, heure de Paris`, "body", 28, 20, room, measure), x: headerX, y: 166, font: "body", color: C.MUTED });

  let map: MapPlacement | null = null;
  if (thumbnail) {
    // La vignette, aussi grande que possible dans son cadre, au centre, sur la mer du jeu. Une carte entourée d'eau baigne dans
    // la mer jusqu'au bord du cadre ; les autres s'arrêtent à leur bord, pour ne pas couper une terre net au milieu de l'eau.
    rects.push({ x: MARGIN, y: BODY_TOP, width: MAP_BOX_WIDTH, height: BODY_HEIGHT, radius: 20, color: thumbnail.open ? SEA : C.SURFACE });
    const zoom = Math.min((MAP_BOX_WIDTH - 2 * MAP_PADDING) / thumbnail.width, (BODY_HEIGHT - 2 * MAP_PADDING) / thumbnail.height, MAX_ZOOM);
    const width = Math.max(1, Math.round(thumbnail.width * zoom));
    const mapHeight = Math.max(1, Math.round(thumbnail.height * zoom));
    map = { x: MARGIN + Math.round((MAP_BOX_WIDTH - width) / 2), y: BODY_TOP + Math.round((BODY_HEIGHT - mapHeight) / 2), width, height: mapHeight, radius: 12 };
    if (!thumbnail.open) rects.push({ ...map, color: SEA });
    // Les chiffres, empilés à droite.
    const x = MARGIN + MAP_BOX_WIDTH + GAP;
    const tileWidth = WIDTH - MARGIN - x;
    const tileHeight = (BODY_HEIGHT - (tiles.length - 1) * 15) / tiles.length;
    tiles.forEach((tile, i) => {
      const y = BODY_TOP + i * (tileHeight + 15);
      const middle = Math.round(y + tileHeight / 2);
      rects.push({ x, y, width: tileWidth, height: tileHeight, radius: 20, color: C.SURFACE });
      texts.push({ ...fitted(tile.value, "title", 64, 40, tileWidth - 48, measure), x: x + 24, y: middle + 6, font: "title", color: C.WHITE });
      texts.push({ ...fitted(tile.label, "body", 26, 18, tileWidth - 48, measure), x: x + 24, y: middle + 46, font: "body", color: C.MUTED });
    });
  } else {
    // Les chiffres, côte à côte.
    const tileWidth = (contentWidth - (tiles.length - 1) * GAP) / tiles.length;
    tiles.forEach((tile, i) => {
      const x = MARGIN + i * (tileWidth + GAP);
      rects.push({ x, y: BODY_TOP, width: tileWidth, height: ROW_TILE_HEIGHT, radius: 20, color: C.SURFACE });
      texts.push({ ...fitted(tile.value, "title", 88, 56, tileWidth - 48, measure), x: x + 24, y: BODY_TOP + 96, font: "title", color: C.WHITE });
      texts.push({ ...fitted(tile.label, "body", 30, 20, tileWidth - 48, measure), x: x + 24, y: BODY_TOP + 150, font: "body", color: C.MUTED });
    });
  }

  // Les Gaulois de la partie, en pastilles, sous leur nom en partie.
  const padding = Math.round(chips.font * 0.8);
  rows.forEach((row, r) => {
    const y = chipsTop + r * (chips.height + CHIP_GAP);
    for (const chip of row) {
      rects.push({ x: MARGIN + chip.x, y, width: chip.width, height: chips.height, radius: 14, color: chip.named ? C.BLUE : C.SURFACE });
      texts.push({ text: chip.text, size: chip.size, x: MARGIN + chip.x + padding, y: Math.round(y + chips.height / 2 + chips.font * 0.36), font: "strong", color: chip.named ? C.WHITE : C.MUTED });
    }
  });

  const url = shownAddress(siteUrl, "/parties");
  texts.push({ text: url, x: MARGIN, y: height - 22, size: 26, font: "strong", color: C.BLUE_TEXT });
  const note = fitted(thumbnail ? MAP_NOTE : NAME_NOTE, "body", 22, 16, contentWidth - measure(url, "strong", 26) - 24, measure);
  texts.push({ ...note, x: WIDTH - MARGIN, y: height - 22, font: "body", color: C.MUTED, anchor: "end" });
  return { width: WIDTH, height, rects, texts, logo, map };
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export function victoryImageAlt(v: Victory, tag: string, withMap: boolean): string {
  const parts = [`${victoryTitle(tag)} sur la carte ${mapLabel(v.map)}${v.format ? `, ${formatLabel(v.format)}` : ""}, ${victoryWhen(v).toLowerCase()}, heure de Paris.`];
  parts.push(`${countWords(v)}${v.points === null ? "" : `, ${pointsWords(v.points)}`}, partie de ${tileLength(v.seconds)}.`);
  const crew = crewList(
    v.crew.map((p) => p.name),
    countedWords(v),
  );
  if (crew) parts.push(`Gaulois de la partie : ${crew}.`);
  parts.push(withMap ? `Image et nom de la carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0, image redimensionnée.` : `Nom de la carte : ${OPENFRONT_CREDIT}, CC BY-SA 4.0.`);
  return parts.join(" ").slice(0, 1024);
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

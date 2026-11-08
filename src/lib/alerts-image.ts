/**
 * L'image d'une alerte de place : la nouvelle place de GAL et les clans autour, chacun avec son chiffre écrit.
 * Même dessin que l'image de la semaine (`gazette-image.ts`). Tout vient du relevé, dans l'ordre officiel : rien n'est recalculé.
 */
import { clanRgb } from "./clanmap/codec";
import { fmtRank } from "./format";
import { alertHeadline, boardName, gapParts, gapSentences, isGain, placeChange, plainTag, readingNote, readingWhen, rowValue, shortHeadline, sourceLine, type PlaceAlert } from "./alerts";
import { CARD_COLORS as C, fitted, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";

const WIDTH = 1200;
const HEIGHT = 700;
const MARGIN = 36;
const ROW_TOP = 200;
const ROW_HEIGHT = 72;
const ROW_GAP = 10;
/** Les colonnes d'une ligne, depuis son bord gauche. */
const RANK_X = 36;
const TAG_X = 132;
const BAR_X = 330;
const VALUE_ROOM = 210;

const rgb = (color: number | null) => `rgb(${clanRgb(color).join(",")})`;
/** Le nom d'une ligne, comme sur la page de la carte. */
const rowTag = (tag: string | null) => (tag === null ? "Clan supprimé" : `[${tag}]`);

/** Quoi écrire et où, à partir de l'alerte seule : se teste sans police. */
export function alertCard(alert: PlaceAlert, tag: string, siteUrl: string, measure: Measure): GazetteCard {
  const { reading } = alert;
  const rects: CardRect[] = [{ x: 0, y: 0, width: WIDTH, height: HEIGHT, radius: 0, color: C.NAVY }];
  const texts: CardText[] = [];
  const third = WIDTH / 3;
  rects.push({ x: 0, y: 0, width: third, height: 8, radius: 0, color: C.BLUE }, { x: third, y: 0, width: third, height: 8, radius: 0, color: C.WHITE }, { x: 2 * third, y: 0, width: third, height: 8, radius: 0, color: C.RED });

  // L'en-tête : le classement, la nouvelle place, et le changement écrit avec son signe.
  const logo = { x: MARGIN, y: 34, size: 104 };
  const headerX = logo.x + logo.size + 24;
  const tone = isGain(alert) ? C.BLUE_TEXT : C.LOSS;
  const badge = { text: placeChange(alert), size: 32 };
  const badgeWidth = measure(badge.text, "strong", badge.size) + 48;
  rects.push({ x: WIDTH - MARGIN - badgeWidth, y: 58, width: badgeWidth, height: 64, radius: 16, color: C.SURFACE_2 });
  texts.push({ ...badge, x: WIDTH - MARGIN - badgeWidth / 2, y: 101, font: "strong", color: tone, anchor: "middle" });
  const room = WIDTH - MARGIN - badgeWidth - 24 - headerX;
  texts.push({ text: boardName(reading.kind), x: headerX, y: 64, size: 26, font: "strong", color: tone });
  texts.push({ ...fitted(shortHeadline(alert, tag), "title", 56, 36, room, measure), x: headerX, y: 122, font: "title", color: C.WHITE });
  texts.push({ ...fitted(readingWhen(reading), "body", 26, 20, WIDTH - MARGIN - headerX, measure), x: headerX, y: 164, font: "body", color: C.MUTED });

  // Les clans autour de GAL. La barre suit le chiffre écrit à droite : elle n'apporte rien de plus.
  const width = WIDTH - 2 * MARGIN;
  const barRoom = width - BAR_X - VALUE_ROOM;
  const largest = Math.max(1, ...reading.rows.map((row) => row.value));
  reading.rows.forEach((row, i) => {
    const y = ROW_TOP + i * (ROW_HEIGHT + ROW_GAP);
    const baseline = y + 47;
    rects.push({ x: MARGIN, y, width, height: ROW_HEIGHT, radius: 14, color: row.gal ? C.SURFACE_2 : C.SURFACE });
    if (row.gal) rects.push({ x: MARGIN + 12, y: y + 12, width: 6, height: ROW_HEIGHT - 24, radius: 3, color: C.RED });
    texts.push({ text: fmtRank(row.rank), x: MARGIN + RANK_X, y: baseline, size: 32, font: "title", color: row.gal ? C.WHITE : C.MUTED });
    texts.push({ ...fitted(rowTag(row.tag), "strong", 30, 20, BAR_X - TAG_X - 16, measure), x: MARGIN + TAG_X, y: baseline, font: "strong", color: C.WHITE });
    rects.push({ x: MARGIN + BAR_X, y: y + 25, width: Math.max(6, (barRoom * row.value) / largest), height: 22, radius: 11, color: reading.kind === "map" ? rgb(row.color) : C.WIN });
    texts.push({ ...fitted(rowValue(reading.kind, row.value), "strong", 30, 22, VALUE_ROOM - 40, measure), x: MARGIN + width - 28, y: baseline, font: "strong", color: row.gal ? C.WHITE : C.MUTED, anchor: "end" });
  });

  const gaps = gapParts(alert, plainTag).join(" · ");
  if (gaps) texts.push({ ...fitted(gaps, "body", 26, 20, width, measure), x: MARGIN, y: HEIGHT - 62, font: "body", color: C.MUTED });
  const page = reading.kind === "rank" ? "classement" : "carte";
  const url = `${siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/${page}`;
  texts.push({ text: url, x: MARGIN, y: HEIGHT - 18, size: 26, font: "strong", color: C.BLUE_TEXT });
  const note = fitted(readingNote(reading.kind), "body", 22, 18, width - measure(url, "strong", 26) - 24, measure);
  texts.push({ ...note, x: WIDTH - MARGIN, y: HEIGHT - 18, font: "body", color: C.MUTED, anchor: "end" });
  return { width: WIDTH, height: HEIGHT, rects, texts, logo };
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export function alertImageAlt(alert: PlaceAlert, tag: string): string {
  const { reading } = alert;
  const rows = reading.rows.map((row) => `${fmtRank(row.rank)} ${rowTag(row.tag)}, ${rowValue(reading.kind, row.value)}${reading.kind === "map" ? " pixels" : ""}`).join(" ; ");
  const gaps = gapSentences(gapParts(alert, plainTag));
  return [`${alertHeadline(alert, tag)} (${placeChange(alert)}).`, sourceLine(reading), `${rows}.`, ...(gaps ? [gaps] : [])].join(" ").slice(0, 1024);
}

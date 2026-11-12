/**
 * L'image d'une alerte de place : la nouvelle place de GAL et les clans autour, chacun avec son chiffre écrit.
 * Même dessin que l'image de la semaine (`gazette-image.ts`). Tout vient du relevé, dans l'ordre officiel : rien n'est recalculé.
 */
import { clanRgb } from "./clanmap/codec";
import { fmtRank } from "./format";
import { alertHeadline, boardName, gapParts, gapSentences, isGain, placeChange, plainTag, readingNote, readingWhen, rowValue, shortHeadline, sourceLine, type PlaceAlert, type PlaceReading } from "./alerts";
import { CARD_COLORS as C, fitted, LOGO, MARGIN, pageFoot, pageHead, type CardParts, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";

const WIDTH = 1200;
const ROW_HEIGHT = 72;
const ROW_GAP = 10;
/** Les colonnes d'une ligne, depuis son bord gauche. */
const RANK_X = 36;
const TAG_X = 132;
const BAR_X = 330;
const VALUE_ROOM = 210;
/** Le badge du changement de place, à droite du titre. */
const BADGE = { y: 84, height: 62, size: 30 } as const;

const rgb = (color: number | null) => `rgb(${clanRgb(color).join(",")})`;
/** Le nom d'une ligne, comme sur la page de la carte. */
const rowTag = (tag: string | null) => (tag === null ? "Clan supprimé" : `[${tag}]`);

/**
 * Les clans autour de GAL, à partir de `top`, dans l'ordre officiel : la place, le tag, une barre et le chiffre. La barre suit
 * le chiffre écrit à droite : elle n'apporte rien de plus. La ligne de GAL est plus claire, avec le filet rouge du site.
 * Sert aussi à la course du soir (`course-soir-image.ts`). `name` : le nom écrit de chaque ligne.
 */
export function standingRows(reading: PlaceReading, top: number, measure: Measure, name: (tag: string | null) => string = rowTag): CardParts & { bottom: number } {
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  const width = WIDTH - 2 * MARGIN;
  const barRoom = width - BAR_X - VALUE_ROOM;
  const largest = Math.max(1, ...reading.rows.map((row) => row.value));
  reading.rows.forEach((row, i) => {
    const y = top + i * (ROW_HEIGHT + ROW_GAP);
    const baseline = y + 47;
    rects.push(row.gal ? { x: MARGIN, y, width, height: ROW_HEIGHT, radius: 8, color: C.SURFACE_2, stroke: C.LINE_STRONG } : { x: MARGIN, y, width, height: ROW_HEIGHT, radius: 8, color: C.SURFACE, stroke: C.LINE });
    if (row.gal) rects.push({ x: MARGIN + 12, y: y + 12, width: 6, height: ROW_HEIGHT - 24, radius: 0, color: C.RED });
    texts.push({ text: fmtRank(row.rank), x: MARGIN + RANK_X, y: baseline, size: 30, font: "onciale", color: row.gal ? C.WHITE : C.MUTED });
    texts.push({ ...fitted(name(row.tag), "strong", 30, 20, BAR_X - TAG_X - 16, measure), x: MARGIN + TAG_X, y: baseline, font: "strong", color: C.WHITE });
    rects.push({ x: MARGIN + BAR_X, y: y + 27, width: Math.max(6, (barRoom * row.value) / largest), height: 18, radius: 2, color: reading.kind === "map" ? rgb(row.color) : C.WIN });
    texts.push({ ...fitted(rowValue(reading.kind, row.value), "strong", 30, 22, VALUE_ROOM - 40, measure), x: MARGIN + width - 28, y: baseline, font: "strong", color: row.gal ? C.WHITE : C.MUTED, anchor: "end" });
  });
  return { rects, texts, bottom: reading.rows.length > 0 ? top + reading.rows.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP : top };
}

/** Quoi écrire et où, à partir de l'alerte seule : se teste sans police. */
export function alertCard(alert: PlaceAlert, tag: string, siteUrl: string, measure: Measure): GazetteCard {
  const { reading } = alert;
  const page = reading.kind === "rank" ? "classement" : "carte";
  const tone = isGain(alert) ? C.BLUE_TEXT : C.LOSS;

  // L'en-tête : le classement, la nouvelle place, le changement écrit avec son signe dans un badge, et la date du calcul.
  const badge = { text: placeChange(alert), size: BADGE.size };
  const badgeWidth = measure(badge.text, "strong", badge.size) + 48;
  const head = pageHead({ path: `/${page}`, title: shortHeadline(alert, tag), kicker: boardName(reading.kind), kickerColor: tone, period: readingWhen(reading) }, measure, badgeWidth + 24);
  const rects: CardRect[] = [...head.rects, { x: WIDTH - MARGIN - badgeWidth, y: BADGE.y, width: badgeWidth, height: BADGE.height, radius: 6, color: C.SURFACE_2, stroke: C.LINE_STRONG }];
  const texts: CardText[] = [...head.texts, { ...badge, x: WIDTH - MARGIN - badgeWidth / 2, y: BADGE.y + 42, font: "strong", color: tone, anchor: "middle" }];

  const rows = standingRows(reading, head.bottom, measure);
  rects.push(...rows.rects);
  texts.push(...rows.texts);

  const width = WIDTH - 2 * MARGIN;
  const gaps = gapParts(alert, plainTag).join(" · ");
  let bottom = rows.bottom;
  if (gaps) {
    bottom += 44;
    texts.push({ ...fitted(gaps, "body", 25, 19, width, measure), x: MARGIN, y: bottom, font: "body", color: C.MUTED });
  }
  const height = bottom + 64;
  const url = `${siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/${page}`;
  texts.push(...pageFoot(url, readingNote(reading.kind), height - 22, measure).texts);
  return { width: WIDTH, height, rects, texts, logo: LOGO };
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export function alertImageAlt(alert: PlaceAlert, tag: string): string {
  const { reading } = alert;
  const rows = reading.rows.map((row) => `${fmtRank(row.rank)} ${rowTag(row.tag)}, ${rowValue(reading.kind, row.value)}${reading.kind === "map" ? " pixels" : ""}`).join(" ; ");
  const gaps = gapSentences(gapParts(alert, plainTag));
  return [`${alertHeadline(alert, tag)} (${placeChange(alert)}).`, sourceLine(reading), `${rows}.`, ...(gaps ? [gaps] : [])].join(" ").slice(0, 1024);
}

/**
 * L'image de la course du soir : la place de GAL et les clans autour, chacun avec son score, puis les points gagnés depuis la veille
 * à 20 h, à plusieurs ou seul sous le tag, et ce que le score a vraiment fait. Même dessin que l'image d'une alerte de place
 * (`alerts-image.ts`). Tout vient du classement officiel et des sessions du clan : rien n'est recalculé.
 */
import { boardName, plainTag, readingNote, readingWhen, rowValue } from "./alerts";
import { COURSE_TITLE, periodWords, placeLine, pointsWords, POINTS_NOTE, raceParts, scoreLine, wearWords, type EveningRace } from "./course-soir";
import { fmtRank, fmtScore } from "./format";
import { CARD_COLORS as C, fitted, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";

const WIDTH = 1200;
const HEIGHT = 946;
const MARGIN = 36;
const ROW_TOP = 200;
const ROW_HEIGHT = 72;
const ROW_GAP = 10;
/** Les colonnes d'une ligne du classement, depuis son bord gauche. */
const RANK_X = 36;
const TAG_X = 132;
const BAR_X = 330;
const VALUE_ROOM = 210;
/** Le cadre des points, sous les écarts. */
const POINTS_TOP = 696;
const POINTS_HEIGHT = 186;
const POINTS_SPLIT_X = 400;

const capitalized = (part: string) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`;

/** Quoi écrire et où, à partir de la course seule : se teste sans police. */
export function courseCard(race: EveningRace, tag: string, siteUrl: string, measure: Measure): GazetteCard {
  const { reading, points, changes } = race;
  const rects: CardRect[] = [{ x: 0, y: 0, width: WIDTH, height: HEIGHT, radius: 0, color: C.NAVY }];
  const texts: CardText[] = [];
  const third = WIDTH / 3;
  rects.push({ x: 0, y: 0, width: third, height: 8, radius: 0, color: C.BLUE }, { x: third, y: 0, width: third, height: 8, radius: 0, color: C.WHITE }, { x: 2 * third, y: 0, width: third, height: 8, radius: 0, color: C.RED });

  // L'en-tête : le classement, le titre, l'heure du calcul, et la place en grand dans un badge.
  const logo = { x: MARGIN, y: 34, size: 104 };
  const headerX = logo.x + logo.size + 24;
  const badge = { text: fmtRank(reading.rank), size: 56 };
  const badgeWidth = measure(badge.text, "title", badge.size) + 56;
  rects.push({ x: WIDTH - MARGIN - badgeWidth, y: 46, width: badgeWidth, height: 88, radius: 18, color: C.SURFACE_2 });
  texts.push({ ...badge, x: WIDTH - MARGIN - badgeWidth / 2, y: 110, font: "title", color: C.WHITE, anchor: "middle" });
  const room = WIDTH - MARGIN - badgeWidth - 24 - headerX;
  texts.push({ ...fitted(boardName("rank"), "strong", 26, 20, room, measure), x: headerX, y: 64, font: "strong", color: C.BLUE_TEXT });
  texts.push({ ...fitted(COURSE_TITLE, "title", 56, 36, room, measure), x: headerX, y: 122, font: "title", color: C.WHITE });
  texts.push({ ...fitted(readingWhen(reading), "body", 24, 18, WIDTH - MARGIN - headerX, measure), x: headerX, y: 164, font: "body", color: C.MUTED });

  // Les clans autour de GAL, dans l'ordre officiel. La barre suit le score écrit à droite : elle n'apporte rien de plus.
  const width = WIDTH - 2 * MARGIN;
  const barRoom = width - BAR_X - VALUE_ROOM;
  const largest = Math.max(1, ...reading.rows.map((row) => row.value));
  reading.rows.forEach((row, i) => {
    const y = ROW_TOP + i * (ROW_HEIGHT + ROW_GAP);
    const baseline = y + 47;
    rects.push({ x: MARGIN, y, width, height: ROW_HEIGHT, radius: 14, color: row.gal ? C.SURFACE_2 : C.SURFACE });
    if (row.gal) rects.push({ x: MARGIN + 12, y: y + 12, width: 6, height: ROW_HEIGHT - 24, radius: 3, color: C.RED });
    texts.push({ text: fmtRank(row.rank), x: MARGIN + RANK_X, y: baseline, size: 32, font: "title", color: row.gal ? C.WHITE : C.MUTED });
    texts.push({ ...fitted(plainTag(row.tag), "strong", 30, 20, BAR_X - TAG_X - 16, measure), x: MARGIN + TAG_X, y: baseline, font: "strong", color: C.WHITE });
    rects.push({ x: MARGIN + BAR_X, y: y + 25, width: Math.max(6, (barRoom * row.value) / largest), height: 22, radius: 11, color: C.WIN });
    texts.push({ ...fitted(rowValue("rank", row.value), "strong", 30, 22, VALUE_ROOM - 40, measure), x: MARGIN + width - 28, y: baseline, font: "strong", color: row.gal ? C.WHITE : C.MUTED, anchor: "end" });
  });

  // Les écarts, un par ligne, avec leur changement depuis la veille.
  const rowsBottom = ROW_TOP + reading.rows.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP;
  raceParts(race, plainTag).forEach((part, i) => {
    texts.push({ ...fitted(capitalized(part), "body", 26, 18, width, measure), x: MARGIN, y: rowsBottom + 38 + i * 34, font: "body", color: C.MUTED });
  });

  // Les points : le total en grand, à plusieurs et seul sous le tag, puis ce que le score a vraiment fait.
  rects.push({ x: MARGIN, y: POINTS_TOP, width, height: POINTS_HEIGHT, radius: 14, color: C.SURFACE });
  const inner = MARGIN + 24;
  const innerWidth = width - 48;
  texts.push({ ...fitted(`Points gagnés ${periodWords(points)}`, "body", 24, 18, innerWidth, measure), x: inner, y: POINTS_TOP + 38, font: "body", color: C.MUTED });
  texts.push({ ...fitted(`+${fmtScore(points.total.points)}`, "title", 64, 40, POINTS_SPLIT_X - 48, measure), x: inner, y: POINTS_TOP + 112, font: "title", color: C.WHITE });
  const splitX = MARGIN + POINTS_SPLIT_X;
  const splitRoom = width - POINTS_SPLIT_X - 24;
  texts.push({ ...fitted(`À plusieurs : ${pointsWords(points.group)}`, "strong", 28, 20, splitRoom, measure), x: splitX, y: POINTS_TOP + 80, font: "strong", color: C.WHITE });
  texts.push({ ...fitted(`Seul sous le tag : ${pointsWords(points.solo)}`, "strong", 28, 20, splitRoom, measure), x: splitX, y: POINTS_TOP + 118, font: "strong", color: C.MUTED });
  texts.push({ ...fitted(wearWords(changes.score), "body", 24, 18, innerWidth, measure), x: inner, y: POINTS_TOP + 164, font: "body", color: C.MUTED });

  const url = `${siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/classement`;
  texts.push({ text: url, x: MARGIN, y: HEIGHT - 22, size: 26, font: "strong", color: C.BLUE_TEXT });
  const note = fitted(readingNote("rank"), "body", 22, 16, width - measure(url, "strong", 26) - 24, measure);
  texts.push({ ...note, x: WIDTH - MARGIN, y: HEIGHT - 22, font: "body", color: C.MUTED, anchor: "end" });
  return { width: WIDTH, height: HEIGHT, rects, texts, logo };
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export function courseImageAlt(race: EveningRace, tag: string): string {
  const { reading, points, changes } = race;
  const rows = reading.rows.map((row) => `${fmtRank(row.rank)} ${plainTag(row.tag)}, ${rowValue("rank", row.value)}`).join(" ; ");
  return [
    `${COURSE_TITLE} : ${placeLine(reading, tag)}.`,
    `${readingWhen(reading)}. ${readingNote("rank")}.`,
    `${rows}.`,
    `${scoreLine(reading, changes.score)}.`,
    ...raceParts(race, plainTag).map((part) => `${capitalized(part)}.`),
    `Points gagnés ${periodWords(points)} : +${fmtScore(points.total.points)}. À plusieurs : ${pointsWords(points.group)}. Seul sous le tag : ${pointsWords(points.solo)}.`,
    POINTS_NOTE,
  ]
    .join(" ")
    .slice(0, 1024);
}

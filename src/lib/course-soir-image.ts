/**
 * L'image de la course du soir : la place de GAL et les clans autour, chacun avec son score, puis les points gagnés depuis la veille
 * à 20 h, à plusieurs ou seul sous le tag, et ce que le score a vraiment fait. Même dessin que l'image d'une alerte de place
 * (`alerts-image.ts`). Tout vient du classement officiel et des sessions du clan : rien n'est recalculé.
 */
import { boardName, plainTag, readingNote, readingWhen, rowValue } from "./alerts";
import { standingRows } from "./alerts-image";
import { COURSE_TITLE, periodWords, placeLine, pointsWords, POINTS_NOTE, raceParts, scoreLine, wearWords, type EveningRace } from "./course-soir";
import { fmtRank, fmtScore } from "./format";
import { CARD_COLORS as C, fitted, LOGO, MARGIN, pageFoot, pageHead, STAGES, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";

const WIDTH = 1200;
/** Le badge de la place, à droite du titre. */
const BADGE = { y: 70, height: 84, size: 56 } as const;
/** Le cadre des points, sous les écarts : une scène indigo, au coin coupé. */
const POINTS_HEIGHT = 190;
const POINTS_SPLIT_X = 400;

const capitalized = (part: string) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`;

/** Quoi écrire et où, à partir de la course seule : se teste sans police. */
export function courseCard(race: EveningRace, tag: string, siteUrl: string, measure: Measure): GazetteCard {
  const { reading, points, changes } = race;

  // L'en-tête : le classement, le titre, l'heure du calcul, et la place en grand dans un badge.
  const badge = { text: fmtRank(reading.rank), size: BADGE.size };
  const badgeWidth = measure(badge.text, "cases", badge.size) + 56;
  const head = pageHead({ path: "/classement", title: COURSE_TITLE, kicker: boardName("rank"), period: readingWhen(reading) }, measure, badgeWidth + 24);
  const rects: CardRect[] = [...head.rects, { x: WIDTH - MARGIN - badgeWidth, y: BADGE.y, width: badgeWidth, height: BADGE.height, radius: 6, color: C.SURFACE_2, stroke: C.LINE_STRONG }];
  const texts: CardText[] = [...head.texts, { ...badge, x: WIDTH - MARGIN - badgeWidth / 2, y: BADGE.y + 62, font: "cases", color: C.WHITE, anchor: "middle", glow: true }];

  // Les clans autour de GAL, dans l'ordre officiel.
  const rows = standingRows(reading, head.bottom, measure, plainTag);
  rects.push(...rows.rects);
  texts.push(...rows.texts);

  // Les écarts, un par ligne, avec leur changement depuis la veille.
  const width = WIDTH - 2 * MARGIN;
  const parts = raceParts(race, plainTag);
  parts.forEach((part, i) => {
    texts.push({ ...fitted(capitalized(part), "body", 25, 18, width, measure), x: MARGIN, y: rows.bottom + 40 + i * 34, font: "body", color: C.MUTED });
  });

  // Les points : le total en grand, à plusieurs et seul sous le tag, puis ce que le score a vraiment fait.
  const pointsTop = rows.bottom + 40 + parts.length * 34 + (parts.length > 0 ? 8 : -16);
  rects.push({ x: MARGIN, y: pointsTop, width, height: POINTS_HEIGHT, radius: 10, ...STAGES.indigo, cut: 26 });
  const inner = MARGIN + 26;
  const innerWidth = width - 52;
  texts.push({ ...fitted(`Points gagnés ${periodWords(points)}`, "body", 24, 18, innerWidth, measure), x: inner, y: pointsTop + 40, font: "body", color: C.STAGE_MUTED });
  texts.push({ ...fitted(`+${fmtScore(points.total.points)}`, "cases", 62, 40, POINTS_SPLIT_X - 52, measure), x: inner, y: pointsTop + 114, font: "cases", color: C.WHITE, glow: true });
  const splitX = MARGIN + POINTS_SPLIT_X;
  const splitRoom = width - POINTS_SPLIT_X - 26;
  texts.push({ ...fitted(`À plusieurs : ${pointsWords(points.group)}`, "strong", 28, 20, splitRoom, measure), x: splitX, y: pointsTop + 82, font: "strong", color: C.WHITE });
  texts.push({ ...fitted(`Seul sous le tag : ${pointsWords(points.solo)}`, "strong", 28, 20, splitRoom, measure), x: splitX, y: pointsTop + 120, font: "strong", color: C.STAGE_MUTED });
  texts.push({ ...fitted(wearWords(changes.score), "body", 24, 18, innerWidth, measure), x: inner, y: pointsTop + 166, font: "body", color: C.STAGE_MUTED });

  const height = pointsTop + POINTS_HEIGHT + 66;
  const url = `${siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/classement`;
  texts.push(...pageFoot(url, readingNote("rank"), height - 22, measure).texts);
  return { width: WIDTH, height, rects, texts, logo: LOGO };
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

/**
 * L'image de « Hier chez les Gaulois » : les trois grands chiffres de la veille avec leur écart au jour d'avant, puis la plus
 * longue série et la belle partie. Même dessin que l'image de la semaine (`gazette-image.ts`). Ce qui manque n'est pas dessiné.
 */
import { fmtInt, fmtMinutes, fmtPct, fmtPoints } from "./format";
import { CARD_COLORS as C, fitted, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";
import { bestWhen, bestWords, dayTitle, HIER_NOTE, HIER_TITLE, resultWords, streakWords, type DayCount, type DayReport } from "./hier-discord";
import { shownAddress } from "./salon-discord";
import { winRate } from "./stats";

const WIDTH = 1200;
const MARGIN = 36;
const STATS_TOP = 196;
const TILE_HEIGHT = 200;
const ROW_HEIGHT = 90;
const ROW_GAP = 10;

/** « +6 », « −4 », « autant ». */
const signedInt = (n: number) => (n === 0 ? "autant" : `${n > 0 ? "+" : "−"}${fmtInt(Math.abs(n))}`);
const deltaColor = (n: number) => (n < 0 ? C.LOSS : C.BLUE_TEXT);
/** Le taux tel qu'il s'affiche : l'écart se calcule sur lui, comme dans la gazette. */
const shownRate = (day: DayCount) => {
  const rate = winRate(day.wins, day.games);
  return rate === null ? null : Math.round(rate * 10) / 10;
};

interface Stat {
  value: string;
  label: string;
  delta: { text: string; color: string } | null;
}

function dayStats(report: DayReport): Stat[] {
  const before = report.previous;
  const rateNow = shownRate(report);
  const rateBefore = before ? shownRate(before) : null;
  const rateGap = rateNow !== null && rateBefore !== null ? Math.round((rateNow - rateBefore) * 10) / 10 : null;
  return [
    { value: fmtInt(report.wins), label: report.wins > 1 ? "victoires" : "victoire", delta: before && { text: signedInt(report.wins - before.wins), color: deltaColor(report.wins - before.wins) } },
    { value: fmtInt(report.games), label: report.games > 1 ? "parties" : "partie", delta: before && { text: signedInt(report.games - before.games), color: deltaColor(report.games - before.games) } },
    { value: fmtPct(winRate(report.wins, report.games)), label: "de victoires", delta: rateGap === null ? null : { text: rateGap === 0 ? "autant" : fmtPoints(rateGap).replace(/\s*points?$/, " pts"), color: deltaColor(rateGap) } },
  ];
}

interface InfoRow {
  label: string;
  value: string;
  detail: string | null;
}

function infoRows(report: DayReport): InfoRow[] {
  const rows: InfoRow[] = [];
  if (report.streak >= 2) rows.push({ label: "Plus longue série", value: streakWords(report.streak), detail: null });
  const best = report.best;
  if (best) {
    const when = bestWhen(best);
    rows.push({ label: "Belle partie", value: `${fmtInt(best.gaulois)} Gaulois ensemble, ${best.won ? "victoire" : "défaite"}`, detail: best.seconds === null ? when : `${when}, en ${fmtMinutes(best.seconds)}` });
  }
  return rows;
}

/** Quoi écrire et où, à partir du bilan seul : se teste sans police. */
export function hierCard(report: DayReport, tag: string, siteUrl: string, measure: Measure): GazetteCard {
  const stats = dayStats(report);
  const hasDelta = stats.some((stat) => stat.delta);
  const rows = infoRows(report);
  const rowsTop = STATS_TOP + TILE_HEIGHT + (hasDelta ? 56 : 24);
  const contentBottom = rows.length > 0 ? rowsTop + rows.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP : STATS_TOP + TILE_HEIGHT + (hasDelta ? 44 : 0);
  const height = contentBottom + 76;
  const rects: CardRect[] = [{ x: 0, y: 0, width: WIDTH, height, radius: 0, color: C.NAVY }];
  const texts: CardText[] = [];
  const third = WIDTH / 3;
  rects.push({ x: 0, y: 0, width: third, height: 8, radius: 0, color: C.BLUE }, { x: third, y: 0, width: third, height: 8, radius: 0, color: C.WHITE }, { x: 2 * third, y: 0, width: third, height: 8, radius: 0, color: C.RED });

  // L'en-tête.
  const logo = { x: MARGIN, y: 34, size: 104 };
  const headerX = logo.x + logo.size + 24;
  const room = WIDTH - MARGIN - headerX;
  texts.push({ ...fitted(`Parties du clan sous le tag [${tag}]`, "strong", 26, 20, room, measure), x: headerX, y: 64, font: "strong", color: C.BLUE_TEXT });
  texts.push({ ...fitted(HIER_TITLE, "title", 56, 36, room, measure), x: headerX, y: 122, font: "title", color: C.WHITE });
  texts.push({ ...fitted(dayTitle(report.day), "body", 28, 20, room, measure), x: headerX, y: 166, font: "body", color: C.MUTED });

  // Les trois grands chiffres.
  const gap = 16;
  const tileWidth = (WIDTH - 2 * MARGIN - 2 * gap) / 3;
  stats.forEach((stat, i) => {
    const x = MARGIN + i * (tileWidth + gap);
    rects.push({ x, y: STATS_TOP, width: tileWidth, height: TILE_HEIGHT, radius: 20, color: C.SURFACE });
    texts.push({ ...fitted(stat.value, "title", 88, 56, tileWidth - 48, measure), x: x + 24, y: STATS_TOP + 88, font: "title", color: C.WHITE });
    texts.push({ text: stat.label, x: x + 24, y: STATS_TOP + 134, size: 32, font: "body", color: C.MUTED });
    if (stat.delta) texts.push({ ...fitted(stat.delta.text, "strong", 30, 22, tileWidth - 48, measure), x: x + 24, y: STATS_TOP + 176, font: "strong", color: stat.delta.color });
  });
  if (hasDelta && report.previous) {
    const note = `Écarts par rapport à la veille, ${dayTitle(report.previous.day).toLowerCase()}`;
    texts.push({ ...fitted(note, "body", 24, 18, WIDTH - 2 * MARGIN, measure), x: MARGIN, y: STATS_TOP + TILE_HEIGHT + 34, font: "body", color: C.MUTED });
  }

  // La série et la belle partie.
  const width = WIDTH - 2 * MARGIN;
  rows.forEach((row, i) => {
    const y = rowsTop + i * (ROW_HEIGHT + ROW_GAP);
    rects.push({ x: MARGIN, y, width, height: ROW_HEIGHT, radius: 16, color: C.SURFACE });
    texts.push({ text: row.label, x: MARGIN + 24, y: y + 34, size: 26, font: "body", color: C.MUTED });
    if (row.detail) {
      const detailRoom = width - 48 - measure(row.label, "body", 26) - 24;
      texts.push({ ...fitted(row.detail, "strong", 26, 20, detailRoom, measure), x: MARGIN + width - 24, y: y + 34, font: "strong", color: C.BLUE_TEXT, anchor: "end" });
    }
    texts.push({ ...fitted(row.value, "title", 38, 28, width - 48, measure), x: MARGIN + 24, y: y + 74, font: "title", color: C.WHITE });
  });

  const url = shownAddress(siteUrl, "/parties");
  texts.push({ text: url, x: MARGIN, y: height - 22, size: 26, font: "strong", color: C.BLUE_TEXT });
  if (report.best) {
    const note = fitted(HIER_NOTE, "body", 22, 16, width - measure(url, "strong", 26) - 24, measure);
    texts.push({ ...note, x: WIDTH - MARGIN, y: height - 22, font: "body", color: C.MUTED, anchor: "end" });
  }
  return { width: WIDTH, height, rects, texts, logo };
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export function hierImageAlt(report: DayReport, tag: string): string {
  const parts = [`${HIER_TITLE}, ${dayTitle(report.day).toLowerCase()}, parties du clan sous le tag [${tag}].`, `${resultWords(report)}.`];
  if (report.previous) {
    parts.push(`La veille : ${resultWords(report.previous)}.`);
  }
  if (report.streak >= 2) parts.push(`Plus longue série : ${streakWords(report.streak)}.`);
  if (report.best) parts.push(`Belle partie ${bestWords(report.best)} ${HIER_NOTE}`);
  return parts.join(" ").slice(0, 1024);
}

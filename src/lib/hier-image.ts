/**
 * L'image de « Hier chez les Gaulois » : les trois grands chiffres de la veille avec leur écart au jour d'avant, puis la plus
 * longue série et la belle partie. Même dessin que l'image de la semaine (`gazette-image.ts`). Ce qui manque n'est pas dessiné.
 */
import { fmtInt, fmtMinutes, fmtPct, fmtPoints } from "./format";
import { CARD_COLORS as C, fitted, kpiParts, LOGO, MARGIN, pageFoot, pageHead, type CardRect, type CardText, type GazetteCard, type Kpi, type Measure } from "./gazette-image";
import { bestWhen, bestWords, dayTitle, HIER_NOTE, HIER_TITLE, resultWords, streakWords, type DayCount, type DayReport } from "./hier-discord";
import { shownAddress } from "./salon-discord";
import { winRate } from "./stats";

const WIDTH = 1200;
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

function dayStats(report: DayReport): Kpi[] {
  const before = report.previous;
  const rateNow = shownRate(report);
  const rateBefore = before ? shownRate(before) : null;
  const rateGap = rateNow !== null && rateBefore !== null ? Math.round((rateNow - rateBefore) * 10) / 10 : null;
  const delta = (n: number) => ({ text: signedInt(n), color: deltaColor(n), strong: true });
  return [
    { label: report.wins > 1 ? "Victoires" : "Victoire", value: fmtInt(report.wins), hint: before && delta(report.wins - before.wins) },
    { label: report.games > 1 ? "Parties" : "Partie", value: fmtInt(report.games), hint: before && delta(report.games - before.games) },
    {
      label: "Taux de victoire",
      value: fmtPct(winRate(report.wins, report.games)),
      hint: rateGap === null ? null : { text: rateGap === 0 ? "autant" : fmtPoints(rateGap).replace(/\s*points?$/, " pts"), color: deltaColor(rateGap), strong: true },
    },
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
  // Le message n'a plus de texte pour le dire : les jours et les heures de l'image sont ceux de Paris.
  const head = pageHead({ path: "/parties", title: HIER_TITLE, kicker: `Parties du clan sous le tag [${tag}]`, period: `${dayTitle(report.day)}, heure de Paris` }, measure);
  const rects: CardRect[] = [...head.rects];
  const texts: CardText[] = [...head.texts];

  // Les trois grands chiffres.
  const stats = dayStats(report);
  const kpis = kpiParts(stats, { x: MARGIN, y: head.bottom, width: WIDTH - 2 * MARGIN, valueSize: 80 }, measure);
  rects.push(...kpis.rects);
  texts.push(...kpis.texts);
  const hasDelta = stats.some((stat) => stat.hint);
  let bottom = kpis.bottom;
  if (hasDelta && report.previous) {
    const note = `Écarts par rapport à la veille, ${dayTitle(report.previous.day).toLowerCase()}`;
    bottom += 32;
    texts.push({ ...fitted(note, "body", 22, 17, WIDTH - 2 * MARGIN, measure), x: MARGIN, y: bottom, font: "body", color: C.MUTED });
  }

  // La série et la belle partie.
  const width = WIDTH - 2 * MARGIN;
  const rows = infoRows(report);
  const rowsTop = bottom + 22;
  rows.forEach((row, i) => {
    const y = rowsTop + i * (ROW_HEIGHT + ROW_GAP);
    rects.push({ x: MARGIN, y, width, height: ROW_HEIGHT, radius: 8, color: C.SURFACE, stroke: C.LINE });
    texts.push({ text: row.label, x: MARGIN + 22, y: y + 34, size: 26, font: "body", color: C.MUTED });
    if (row.detail) {
      const detailRoom = width - 44 - measure(row.label, "body", 26) - 24;
      texts.push({ ...fitted(row.detail, "strong", 26, 19, detailRoom, measure), x: MARGIN + width - 22, y: y + 34, font: "strong", color: C.BLUE_TEXT, anchor: "end" });
    }
    texts.push({ ...fitted(row.value, "onciale", 36, 24, width - 44, measure), x: MARGIN + 22, y: y + 75, font: "onciale", color: C.WHITE });
  });
  if (rows.length > 0) bottom = rowsTop + rows.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP;

  const height = bottom + 72;
  texts.push(...pageFoot(shownAddress(siteUrl, "/parties"), report.best ? HIER_NOTE : "", height - 22, measure).texts);
  return { width: WIDTH, height, rects, texts, logo: LOGO };
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export function hierImageAlt(report: DayReport, tag: string): string {
  const parts = [`${HIER_TITLE}, ${dayTitle(report.day).toLowerCase()}, heure de Paris, parties du clan sous le tag [${tag}].`, `${resultWords(report)}.`];
  if (report.previous) {
    parts.push(`La veille : ${resultWords(report.previous)}.`);
  }
  if (report.streak >= 2) parts.push(`Plus longue série : ${streakWords(report.streak)}.`);
  if (report.best) parts.push(`Belle partie ${bestWords(report.best)} ${HIER_NOTE}`);
  return parts.join(" ").slice(0, 1024);
}

/**
 * L'image des paliers franchis : chaque pseudo avec le palier qu'il vient de passer.
 * Même dessin que l'image de la semaine (`gazette-image.ts`). Au-delà de cinq joueurs, l'image compte les autres, que le message écrit.
 */
import { fmtDayAndTime, fmtInt } from "./format";
import { CARD_COLORS as C, fitted, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";
import { crossingWords, MILESTONE_NOTE, milestoneTitle, othersWords, periodWords, type MilestonePlayer, type PendingMilestones } from "./paliers-franchis";

const WIDTH = 1200;
const MARGIN = 36;
const ROW_TOP = 196;
const ROW_HEIGHT = 80;
const ROW_GAP = 12;
/** Au-delà, l'image ne montre que les premiers. */
export const MAX_ROWS = 5;
const BADGE_WIDTH = 290;

/**
 * Quoi écrire et où, à partir des joueurs seuls : se teste sans police.
 * `allNamed` : le texte du message écrit tous les pseudos. Sinon, l'image ne renvoie pas au message pour les autres.
 */
export function milestoneCard(players: readonly MilestonePlayer[], pending: PendingMilestones, tag: string, siteUrl: string, measure: Measure, allNamed: boolean): GazetteCard {
  const shown = players.slice(0, MAX_ROWS);
  const rest = players.length - shown.length;
  const rowsBottom = ROW_TOP + shown.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP;
  const height = rowsBottom + (rest > 0 ? 56 : 0) + 96;
  const rects: CardRect[] = [{ x: 0, y: 0, width: WIDTH, height, radius: 0, color: C.NAVY }];
  const texts: CardText[] = [];
  const third = WIDTH / 3;
  rects.push({ x: 0, y: 0, width: third, height: 8, radius: 0, color: C.BLUE }, { x: third, y: 0, width: third, height: 8, radius: 0, color: C.WHITE }, { x: 2 * third, y: 0, width: third, height: 8, radius: 0, color: C.RED });

  // L'en-tête.
  const logo = { x: MARGIN, y: 34, size: 104 };
  const headerX = logo.x + logo.size + 24;
  const room = WIDTH - MARGIN - headerX;
  texts.push({ ...fitted(`Victoires en équipe sous le tag [${tag}]`, "strong", 26, 20, room, measure), x: headerX, y: 64, font: "strong", color: C.BLUE_TEXT });
  texts.push({ ...fitted(milestoneTitle(players.length), "title", 56, 36, room, measure), x: headerX, y: 122, font: "title", color: C.WHITE });
  const period = `Entre les relevés de la liste du ${fmtDayAndTime(pending.since)} et du ${fmtDayAndTime(pending.until)}`;
  texts.push({ ...fitted(period, "body", 24, 18, room, measure), x: headerX, y: 164, font: "body", color: C.MUTED });

  // Une ligne par joueur : le palier en grand dans un badge, puis le pseudo.
  const width = WIDTH - 2 * MARGIN;
  shown.forEach((player, i) => {
    const y = ROW_TOP + i * (ROW_HEIGHT + ROW_GAP);
    rects.push({ x: MARGIN, y, width, height: ROW_HEIGHT, radius: 14, color: C.SURFACE });
    rects.push({ x: MARGIN + 12, y: y + 12, width: BADGE_WIDTH, height: ROW_HEIGHT - 24, radius: 12, color: C.BLUE });
    texts.push({ ...fitted(`${fmtInt(player.tier)} victoires`, "title", 30, 22, BADGE_WIDTH - 28, measure), x: MARGIN + 12 + BADGE_WIDTH / 2, y: y + 51, font: "title", color: C.WHITE, anchor: "middle" });
    const nameX = MARGIN + 12 + BADGE_WIDTH + 24;
    texts.push({ ...fitted(player.username, "strong", 32, 22, width - (nameX - MARGIN) - 24, measure), x: nameX, y: y + 51, font: "strong", color: C.WHITE });
  });
  if (rest > 0) texts.push({ text: `${othersWords(rest)}${allNamed ? " La liste complète est dans le message." : ""}`, x: MARGIN, y: rowsBottom + 40, size: 26, font: "body", color: C.MUTED });

  const url = `${siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/membres`;
  texts.push({ text: url, x: MARGIN, y: height - 22, size: 26, font: "strong", color: C.BLUE_TEXT });
  const note = fitted(MILESTONE_NOTE, "body", 22, 18, width - measure(url, "strong", 26) - 24, measure);
  texts.push({ ...note, x: WIDTH - MARGIN, y: height - 22, font: "body", color: C.MUTED, anchor: "end" });
  return { width: WIDTH, height, rects, texts, logo };
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export function milestoneImageAlt(players: readonly MilestonePlayer[], pending: PendingMilestones, tag: string): string {
  const names = players.map((p) => `${p.username} ${crossingWords(p.tier)}`).join(" ; ");
  return `${milestoneTitle(players.length)} chez [${tag}], ${periodWords(pending)}. ${names}. ${MILESTONE_NOTE}`.slice(0, 1024);
}

/**
 * Les images en lignes des messages du jour : les plus actifs et la bienvenue. Même dessin que celle des paliers franchis
 * (`paliers-franchis-image.ts`) : un en-tête, une ligne par joueur avec un badge, puis l'adresse du site et une note.
 * Au-delà de cinq lignes, l'image compte les autres, que le message écrit.
 */
import { CARD_COLORS as C, fitted, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";

const WIDTH = 1200;
const MARGIN = 36;
const ROW_TOP = 196;
const ROW_HEIGHT = 80;
const ROW_GAP = 12;
const FOOTNOTE_HEIGHT = 44;
/** Au-delà, l'image ne montre que les premières lignes. */
export const MAX_ROWS = 5;

export interface CardRow {
  /** Le texte du badge, à gauche de la ligne. */
  badge: string;
  /** Le badge en bleu ; sinon, plus discret. */
  strong: boolean;
  name: string;
  /** À droite de la ligne, ou rien. */
  detail: string | null;
}

export interface RowsCardText {
  kicker: string;
  title: string;
  period: string;
  rows: readonly CardRow[];
  /** Sous les lignes : ce que l'image ne montre pas, comme les autres joueurs ou les anonymes. */
  footnotes: readonly string[];
  /** L'adresse écrite en bas, sans « https:// ». */
  address: string;
  note: string;
  badgeWidth: number;
}

/** Quoi écrire et où : se teste sans police. Les lignes au-delà de `MAX_ROWS` sont à compter par l'appelant dans `footnotes`. */
export function rowsCard(card: RowsCardText, measure: Measure): GazetteCard {
  const shown = card.rows.slice(0, MAX_ROWS);
  const rowsBottom = ROW_TOP + shown.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP;
  const notesBottom = rowsBottom + card.footnotes.length * FOOTNOTE_HEIGHT;
  const height = notesBottom + (card.footnotes.length > 0 ? 12 : 0) + 96;
  const rects: CardRect[] = [{ x: 0, y: 0, width: WIDTH, height, radius: 0, color: C.NAVY }];
  const texts: CardText[] = [];
  const third = WIDTH / 3;
  rects.push({ x: 0, y: 0, width: third, height: 8, radius: 0, color: C.BLUE }, { x: third, y: 0, width: third, height: 8, radius: 0, color: C.WHITE }, { x: 2 * third, y: 0, width: third, height: 8, radius: 0, color: C.RED });

  // L'en-tête.
  const logo = { x: MARGIN, y: 34, size: 104 };
  const headerX = logo.x + logo.size + 24;
  const room = WIDTH - MARGIN - headerX;
  texts.push({ ...fitted(card.kicker, "strong", 26, 20, room, measure), x: headerX, y: 64, font: "strong", color: C.BLUE_TEXT });
  texts.push({ ...fitted(card.title, "title", 56, 36, room, measure), x: headerX, y: 122, font: "title", color: C.WHITE });
  texts.push({ ...fitted(card.period, "body", 24, 16, room, measure), x: headerX, y: 164, font: "body", color: C.MUTED });

  // Une ligne par joueur : le badge, le pseudo, et le détail à droite.
  const width = WIDTH - 2 * MARGIN;
  shown.forEach((row, i) => {
    const y = ROW_TOP + i * (ROW_HEIGHT + ROW_GAP);
    rects.push({ x: MARGIN, y, width, height: ROW_HEIGHT, radius: 14, color: C.SURFACE });
    rects.push({ x: MARGIN + 12, y: y + 12, width: card.badgeWidth, height: ROW_HEIGHT - 24, radius: 12, color: row.strong ? C.BLUE : C.SURFACE_2 });
    texts.push({ ...fitted(row.badge, "title", 30, 20, card.badgeWidth - 24, measure), x: MARGIN + 12 + card.badgeWidth / 2, y: y + 51, font: "title", color: C.WHITE, anchor: "middle" });
    const nameX = MARGIN + 12 + card.badgeWidth + 24;
    const right = MARGIN + width - 24;
    let nameRoom = right - nameX;
    if (row.detail) {
      const detail = fitted(row.detail, "body", 26, 18, Math.round(width * 0.4), measure);
      texts.push({ ...detail, x: right, y: y + 51, font: "body", color: C.MUTED, anchor: "end" });
      nameRoom -= measure(detail.text, "body", detail.size) + 24;
    }
    texts.push({ ...fitted(row.name, "strong", 32, 20, nameRoom, measure), x: nameX, y: y + 51, font: "strong", color: C.WHITE });
  });
  card.footnotes.forEach((line, i) => {
    texts.push({ ...fitted(line, "body", 26, 18, width, measure), x: MARGIN, y: rowsBottom + 40 + i * FOOTNOTE_HEIGHT, font: "body", color: C.MUTED });
  });

  texts.push({ text: card.address, x: MARGIN, y: height - 22, size: 26, font: "strong", color: C.BLUE_TEXT });
  const note = fitted(card.note, "body", 22, 16, width - measure(card.address, "strong", 26) - 24, measure);
  texts.push({ ...note, x: WIDTH - MARGIN, y: height - 22, font: "body", color: C.MUTED, anchor: "end" });
  return { width: WIDTH, height, rects, texts, logo };
}

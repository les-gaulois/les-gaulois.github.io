/**
 * Le dessin commun aux images des messages du robot : les paliers franchis, les plus actifs, la bienvenue, les records, les
 * nouveautés du site et « Jouer ensemble ». Un en-tête, des lignes ou des pastilles, puis l'adresse du site et une note.
 *
 * Depuis le 12 novembre 2026, un message est une image sans texte : l'image nomme donc tout le monde. Au-delà de ce qui tient
 * en lignes, les noms passent en pastilles, plus petites s'ils sont nombreux, comme les Gaulois d'une victoire.
 */
import { CARD_COLORS as C, fitted, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";

export const CARD_WIDTH = 1200;
export const CARD_MARGIN = 36;
/** Le haut du contenu, sous l'en-tête. */
export const BODY_TOP = 196;
const CONTENT_WIDTH = CARD_WIDTH - 2 * CARD_MARGIN;
const LOGO = { x: CARD_MARGIN, y: 34, size: 104 };
const FOOTNOTE_HEIGHT = 44;
/** Sous le contenu : l'adresse du site et la note. */
export const FOOTER_HEIGHT = 96;

/** Au-delà, les lignes deviennent plus basses, ou les noms passent en pastilles. */
export const MAX_ROWS = 5;
/** Le plus de lignes basses dans une image. */
export const MAX_COMPACT_ROWS = 10;
/** Le plus de pastilles dans une image : au-delà, les autres sont comptés. */
export const MAX_CHIPS = 50;

/** Les rectangles et les textes d'un morceau d'image. */
export interface CardParts {
  rects: CardRect[];
  texts: CardText[];
}

export interface CardHead {
  kicker: string;
  title: string;
  period: string;
}

/** L'en-tête : au-dessus du titre, ce que l'image compte ; dessous, sa période. Le logo se pose à gauche. */
export function headParts(head: CardHead, measure: Measure): CardParts {
  const x = LOGO.x + LOGO.size + 24;
  const room = CARD_WIDTH - CARD_MARGIN - x;
  return {
    rects: [],
    texts: [
      { ...fitted(head.kicker, "strong", 26, 20, room, measure), x, y: 64, font: "strong", color: C.BLUE_TEXT },
      { ...fitted(head.title, "title", 56, 36, room, measure), x, y: 122, font: "title", color: C.WHITE },
      { ...fitted(head.period, "body", 24, 16, room, measure), x, y: 164, font: "body", color: C.MUTED },
    ],
  };
}

/** Le bas de l'image : l'adresse du site à gauche, sans « https:// », et la note à droite, réduite pour tenir à côté. */
export function footParts(address: string, note: string, height: number, measure: Measure): CardParts {
  const texts: CardText[] = [{ text: address, x: CARD_MARGIN, y: height - 22, size: 26, font: "strong", color: C.BLUE_TEXT }];
  if (note) texts.push({ ...fitted(note, "body", 22, 16, CONTENT_WIDTH - measure(address, "strong", 26) - 24, measure), x: CARD_WIDTH - CARD_MARGIN, y: height - 22, font: "body", color: C.MUTED, anchor: "end" });
  return { rects: [], texts };
}

/** L'image entière : le fond, la bande tricolore du haut, puis les morceaux dans l'ordre. */
export function assembleCard(height: number, parts: readonly CardParts[]): GazetteCard {
  const third = CARD_WIDTH / 3;
  const rects: CardRect[] = [
    { x: 0, y: 0, width: CARD_WIDTH, height, radius: 0, color: C.NAVY },
    { x: 0, y: 0, width: third, height: 8, radius: 0, color: C.BLUE },
    { x: third, y: 0, width: third, height: 8, radius: 0, color: C.WHITE },
    { x: 2 * third, y: 0, width: third, height: 8, radius: 0, color: C.RED },
  ];
  return { width: CARD_WIDTH, height, rects: [...rects, ...parts.flatMap((p) => p.rects)], texts: parts.flatMap((p) => p.texts), logo: LOGO };
}

/* ---------- Les lignes ---------- */

export interface CardRow {
  /** Le texte du badge, à gauche de la ligne. */
  badge: string;
  /** Le badge en bleu ; sinon, plus discret. */
  strong: boolean;
  name: string;
  /** À droite de la ligne, ou rien. */
  detail: string | null;
}

/** Les mesures d'une ligne : hautes pour cinq lignes au plus, basses au-delà. */
const ROW = { height: 80, gap: 12, inset: 12, baseline: 51, badge: 30, name: 32, detail: 26 } as const;
const COMPACT_ROW = { height: 60, gap: 8, inset: 9, baseline: 39, badge: 23, name: 27, detail: 22 } as const;

/** Les lignes, à partir de `top` : le badge, le nom, et le détail à droite. `bottom` : le bas de la dernière, ou `top` sans ligne. */
export function rowParts(rows: readonly CardRow[], top: number, badgeWidth: number, compact: boolean, measure: Measure): CardParts & { bottom: number } {
  const m = compact ? COMPACT_ROW : ROW;
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  rows.forEach((row, i) => {
    const y = top + i * (m.height + m.gap);
    rects.push({ x: CARD_MARGIN, y, width: CONTENT_WIDTH, height: m.height, radius: 14, color: C.SURFACE });
    rects.push({ x: CARD_MARGIN + m.inset, y: y + m.inset, width: badgeWidth, height: m.height - 2 * m.inset, radius: 12, color: row.strong ? C.BLUE : C.SURFACE_2 });
    texts.push({ ...fitted(row.badge, "title", m.badge, m.badge - 10, badgeWidth - 24, measure), x: CARD_MARGIN + m.inset + badgeWidth / 2, y: y + m.baseline, font: "title", color: C.WHITE, anchor: "middle" });
    const nameX = CARD_MARGIN + m.inset + badgeWidth + 24;
    const right = CARD_MARGIN + CONTENT_WIDTH - 24;
    let nameRoom = right - nameX;
    if (row.detail) {
      const detail = fitted(row.detail, "body", m.detail, m.detail - 8, Math.round(CONTENT_WIDTH * 0.4), measure);
      texts.push({ ...detail, x: right, y: y + m.baseline, font: "body", color: C.MUTED, anchor: "end" });
      nameRoom -= measure(detail.text, "body", detail.size) + 24;
    }
    texts.push({ ...fitted(row.name, "strong", m.name, m.name - 12, nameRoom, measure), x: nameX, y: y + m.baseline, font: "strong", color: C.WHITE });
  });
  return { rects, texts, bottom: rows.length > 0 ? top + rows.length * (m.height + m.gap) - m.gap : top };
}

/* ---------- Les pastilles ---------- */

/** Des pastilles grandes jusqu'à trois lignes, puis plus petites : tous les noms y sont. */
export const CHIP_STEPS = [
  { font: 28, height: 56, rows: 3 },
  { font: 24, height: 48, rows: 4 },
  { font: 20, height: 42, rows: Number.POSITIVE_INFINITY },
] as const;
export const CHIP_GAP = 12;

export interface ChipItem {
  text: string;
  /** Un nom, en bleu ; sinon, le compte de ceux qui ne sont pas nommés, plus discret. */
  named: boolean;
}

interface Chip extends ChipItem {
  size: number;
  x: number;
  width: number;
}

export interface ChipLayout {
  rows: Chip[][];
  font: number;
  height: number;
}

/** Les pastilles, ligne après ligne dans `width`, à la plus grande taille qui tient dans ses lignes. */
export function chipLayout(items: readonly ChipItem[], measure: Measure, width: number): ChipLayout {
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

/** La hauteur que prennent les pastilles. 0 : aucune. */
export const chipsHeight = (layout: ChipLayout) => (layout.rows.length > 0 ? layout.rows.length * layout.height + (layout.rows.length - 1) * CHIP_GAP : 0);

/** Les pastilles dessinées à partir du coin (`left`, `top`). */
export function chipParts(layout: ChipLayout, left: number, top: number): CardParts {
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  const padding = Math.round(layout.font * 0.8);
  layout.rows.forEach((row, r) => {
    const y = top + r * (layout.height + CHIP_GAP);
    for (const chip of row) {
      rects.push({ x: left + chip.x, y, width: chip.width, height: layout.height, radius: 14, color: chip.named ? C.BLUE : C.SURFACE });
      texts.push({ text: chip.text, size: chip.size, x: left + chip.x + padding, y: Math.round(y + layout.height / 2 + layout.font * 0.36), font: "strong", color: chip.named ? C.WHITE : C.MUTED });
    }
  });
  return { rects, texts };
}

/* ---------- L'image en lignes ---------- */

export interface RowsCardText extends CardHead {
  /** Une ligne par joueur. Au plus `MAX_ROWS`, ou `MAX_COMPACT_ROWS` en lignes basses : l'appelant passe les autres en pastilles. */
  rows: readonly CardRow[];
  /** Des lignes plus basses, pour en montrer jusqu'à dix. */
  compact?: boolean;
  /** Des noms en pastilles, sous les lignes : ceux qui n'ont pas de ligne à eux. */
  chips?: readonly string[];
  /** Sous les lignes et les pastilles : ce que l'image ne nomme pas, comme les anonymes. */
  footnotes: readonly string[];
  /** L'adresse écrite en bas, sans « https:// ». */
  address: string;
  /** À droite de l'adresse. Vide : rien. */
  note: string;
  badgeWidth: number;
}

/** Quoi écrire et où : se teste sans police. */
export function rowsCard(card: RowsCardText, measure: Measure): GazetteCard {
  const compact = card.compact ?? false;
  const rows = rowParts(card.rows.slice(0, compact ? MAX_COMPACT_ROWS : MAX_ROWS), BODY_TOP, card.badgeWidth, compact, measure);
  const hasRows = card.rows.length > 0;
  const layout = chipLayout(
    (card.chips ?? []).slice(0, MAX_CHIPS).map((text) => ({ text, named: true })),
    measure,
    CONTENT_WIDTH,
  );
  const chipsTop = hasRows ? rows.bottom + 24 : BODY_TOP;
  // Sans ligne ni pastille, les notes remontent sous l'en-tête.
  const bottom = layout.rows.length > 0 ? chipsTop + chipsHeight(layout) : hasRows ? rows.bottom : BODY_TOP - ROW.gap;
  const notes: CardText[] = card.footnotes.map((line, i) => ({ ...fitted(line, "body", 26, 18, CONTENT_WIDTH, measure), x: CARD_MARGIN, y: bottom + 40 + i * FOOTNOTE_HEIGHT, font: "body", color: C.MUTED }));
  const height = bottom + card.footnotes.length * FOOTNOTE_HEIGHT + (card.footnotes.length > 0 ? 12 : 0) + FOOTER_HEIGHT;
  return assembleCard(height, [headParts(card, measure), rows, chipParts(layout, CARD_MARGIN, chipsTop), { rects: [], texts: notes }, footParts(card.address, card.note, height, measure)]);
}

/* ---------- L'image en faits ---------- */

export interface CardFact {
  /** Ce que dit la ligne, en petit. */
  label: string;
  /** Le fait, en grand. */
  value: string;
  /** À droite de l'étiquette, ou rien. */
  detail: string | null;
}

const FACT_HEIGHT = 90;
const FACT_GAP = 10;

/** Des faits, à partir de `top` : l'étiquette et le détail sur une ligne, le fait en grand dessous. */
export function factParts(facts: readonly CardFact[], top: number, measure: Measure): CardParts & { bottom: number } {
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  facts.forEach((fact, i) => {
    const y = top + i * (FACT_HEIGHT + FACT_GAP);
    rects.push({ x: CARD_MARGIN, y, width: CONTENT_WIDTH, height: FACT_HEIGHT, radius: 16, color: C.SURFACE });
    const inner = CONTENT_WIDTH - 48;
    // Le détail passe d'abord, à sa taille : c'est l'étiquette qui se réduit à côté de lui.
    const detailWidth = fact.detail ? measure(fact.detail, "strong", 26) + 24 : 0;
    if (fact.detail) texts.push({ text: fact.detail, size: 26, x: CARD_MARGIN + CONTENT_WIDTH - 24, y: y + 34, font: "strong", color: C.BLUE_TEXT, anchor: "end" });
    texts.push({ ...fitted(fact.label, "body", 26, 18, inner - detailWidth, measure), x: CARD_MARGIN + 24, y: y + 34, font: "body", color: C.MUTED });
    texts.push({ ...fitted(fact.value, "title", 38, 24, inner, measure), x: CARD_MARGIN + 24, y: y + 74, font: "title", color: C.WHITE });
  });
  return { rects, texts, bottom: facts.length > 0 ? top + facts.length * (FACT_HEIGHT + FACT_GAP) - FACT_GAP : top };
}

export interface FactsCardText extends CardHead {
  facts: readonly CardFact[];
  address: string;
  note: string;
}

/** Quoi écrire et où : se teste sans police. */
export function factsCard(card: FactsCardText, measure: Measure): GazetteCard {
  const facts = factParts(card.facts, BODY_TOP, measure);
  const height = facts.bottom + FOOTER_HEIGHT;
  return assembleCard(height, [headParts(card, measure), facts, footParts(card.address, card.note, height, measure)]);
}

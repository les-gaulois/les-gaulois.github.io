/**
 * Le dessin commun aux images des messages du robot : les paliers franchis, les plus actifs, la bienvenue, les records, les
 * nouveautés du site et « Jouer ensemble ». Un en-tête, des lignes ou des pastilles, puis l'adresse du site et une note.
 *
 * Depuis le 12 novembre 2026, un message est une image sans texte : l'image nomme donc tout le monde. Au-delà de ce qui tient
 * en lignes, les noms passent en pastilles, plus petites s'ils sont nombreux, comme les Gaulois d'une victoire.
 * Le même soir, les images ont pris l'allure du site, « le poste de commandement » : voir `gazette-image.ts`.
 */
import { CARD_COLORS as C, fitted, LOGO, MARGIN, pageFoot, pageHead, pathOf, type CardFont, type CardParts, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";

export type { CardParts } from "./gazette-image";

export const CARD_WIDTH = 1200;
export const CARD_MARGIN = MARGIN;
const CONTENT_WIDTH = CARD_WIDTH - 2 * CARD_MARGIN;
const FOOTNOTE_HEIGHT = 42;
/** Sous le contenu : l'adresse du site et la note. */
export const FOOTER_HEIGHT = 92;

/** Au-delà, les lignes deviennent plus basses, ou les noms passent en pastilles. */
export const MAX_ROWS = 5;
/** Le plus de lignes basses dans une image. */
export const MAX_COMPACT_ROWS = 10;
/** Le plus de pastilles dans une image : au-delà, les autres sont comptés. */
export const MAX_CHIPS = 50;

export interface CardHead {
  kicker: string;
  title: string;
  period: string;
}

/**
 * Le haut du contenu sous un en-tête complet, avec ce que l'image compte et sa période : `headParts(...).bottom`. Gardé pour
 * les images qui posent leur contenu à une hauteur fixe ; un test le garde égal à l'en-tête.
 */
export const BODY_TOP = 230;

/**
 * L'en-tête : l'invite de la page où mène l'image (`address`, l'adresse écrite en bas ; sans elle, celle de l'accueil), le
 * titre, puis ce que l'image compte et sa période. Le logo se pose à gauche. `bottom` : le haut du contenu.
 */
export function headParts(head: CardHead, measure: Measure, address = ""): CardParts & { bottom: number } {
  return pageHead({ path: address ? pathOf(address) : "/", title: head.title, kicker: head.kicker, period: head.period }, measure);
}

/** Le bas de l'image : l'adresse du site à gauche, sans « https:// », et la note à droite, réduite pour tenir à côté. */
export function footParts(address: string, note: string, height: number, measure: Measure): CardParts {
  return pageFoot(address, note, height - 24, measure);
}

/** L'image entière : les morceaux dans l'ordre, sur la table des cartes que dessine `renderGazetteCard`. */
export function assembleCard(height: number, parts: readonly CardParts[]): GazetteCard {
  return { width: CARD_WIDTH, height, rects: parts.flatMap((p) => p.rects), texts: parts.flatMap((p) => p.texts), logo: LOGO };
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
const ROW = { height: 78, gap: 10, inset: 11, baseline: 50, badge: 30, name: 31, detail: 25 } as const;
const COMPACT_ROW = { height: 58, gap: 8, inset: 8, baseline: 38, badge: 23, name: 26, detail: 21 } as const;

/**
 * Les lignes, à partir de `top` : le badge, le nom, et le détail à droite. `bottom` : le bas de la dernière, ou `top` sans
 * ligne. `badgeFont` : l'onciale taillée pour un rang ou un palier, la chasse fixe pour une heure ou une étiquette.
 */
export function rowParts(rows: readonly CardRow[], top: number, badgeWidth: number, compact: boolean, measure: Measure, badgeFont: CardFont = "onciale"): CardParts & { bottom: number } {
  const m = compact ? COMPACT_ROW : ROW;
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  // La chasse fixe est plus large que l'onciale : un cran plus petite, dans la même case.
  const badgeSize = badgeFont === "onciale" ? m.badge : m.badge - 2;
  rows.forEach((row, i) => {
    const y = top + i * (m.height + m.gap);
    rects.push({ x: CARD_MARGIN, y, width: CONTENT_WIDTH, height: m.height, radius: 8, color: C.SURFACE, stroke: C.LINE });
    rects.push(
      row.strong
        ? { x: CARD_MARGIN + m.inset, y: y + m.inset, width: badgeWidth, height: m.height - 2 * m.inset, radius: 6, color: C.BLUE }
        : { x: CARD_MARGIN + m.inset, y: y + m.inset, width: badgeWidth, height: m.height - 2 * m.inset, radius: 6, color: C.SURFACE_2, stroke: C.LINE_STRONG },
    );
    texts.push({ ...fitted(row.badge, badgeFont, badgeSize, badgeSize - 10, badgeWidth - 24, measure), x: CARD_MARGIN + m.inset + badgeWidth / 2, y: y + m.baseline, font: badgeFont, color: C.WHITE, anchor: "middle" });
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
  /** Un nom, en bleu ; sinon, le compte de ceux qui ne sont pas nommés, plus discret, sauf avec `red` ou `word`. */
  named: boolean;
  /** En rouge, à la place du bleu : un clan en face, dans une victoire. */
  red?: boolean;
  /** Un mot sans pastille, en gris (« contre ») : il ne finit jamais une ligne, il passe à la suivante avec la pastille qui le suit. */
  word?: boolean;
}

interface Chip extends ChipItem {
  size: number;
  x: number;
  width: number;
  /** Du bord gauche de la pastille au début du texte. */
  inset: number;
  font: CardFont;
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
    const sized = items.map((item) => {
      // Un mot n'a pas de fond : il garde seulement un peu d'air de chaque côté.
      const inset = item.word ? Math.round(padding / 4) : padding;
      const face: CardFont = item.word ? "body" : "strong";
      const text = fitted(item.text, face, font, font - 6, width - 2 * inset, measure);
      return { item, text, inset, face, width: Math.ceil(measure(text.text, face, text.size)) + 2 * inset };
    });
    const rows: Chip[][] = [[]];
    let x = 0;
    sized.forEach(({ item, text, inset, face, width: chipWidth }, i) => {
      // Un mot passe à la ligne avec la pastille qui le suit.
      const next = item.word ? sized[i + 1] : undefined;
      if (x > 0 && x + chipWidth + (next ? CHIP_GAP + next.width : 0) > width) {
        rows.push([]);
        x = 0;
      }
      rows.at(-1)?.push({ ...text, named: item.named, red: item.red, word: item.word, x, width: chipWidth, inset, font: face });
      x += chipWidth + CHIP_GAP;
    });
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

/**
 * Les pastilles dessinées à partir du coin (`left`, `top`) : les coins nets du site (6 pixels). Un nom en bleu, un clan en face
 * en rouge (le rouge plein du bouton de la Direction : texte blanc 5,3:1), un compte sur la surface bordée, un mot sans fond.
 */
export function chipParts(layout: ChipLayout, left: number, top: number): CardParts {
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  layout.rows.forEach((row, r) => {
    const y = top + r * (layout.height + CHIP_GAP);
    for (const chip of row) {
      const box = { x: left + chip.x, y, width: chip.width, height: layout.height, radius: 6 };
      if (chip.red) rects.push({ ...box, color: C.RED_FILL });
      else if (chip.named) rects.push({ ...box, color: C.BLUE });
      else if (!chip.word) rects.push({ ...box, color: C.SURFACE, stroke: C.LINE_STRONG });
      texts.push({ text: chip.text, size: chip.size, x: left + chip.x + chip.inset, y: Math.round(y + layout.height / 2 + layout.font * 0.36), font: chip.font, color: chip.named || chip.red ? C.WHITE : C.MUTED });
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
  /** L'adresse écrite en bas, sans « https:// ». Son chemin donne l'invite de l'en-tête. */
  address: string;
  /** À droite de l'adresse. Vide : rien. */
  note: string;
  badgeWidth: number;
  /** La police des badges : l'onciale taillée par défaut. */
  badgeFont?: CardFont;
}

/** Quoi écrire et où : se teste sans police. */
export function rowsCard(card: RowsCardText, measure: Measure): GazetteCard {
  const compact = card.compact ?? false;
  const head = headParts(card, measure, card.address);
  const rows = rowParts(card.rows.slice(0, compact ? MAX_COMPACT_ROWS : MAX_ROWS), head.bottom, card.badgeWidth, compact, measure, card.badgeFont);
  const hasRows = card.rows.length > 0;
  const layout = chipLayout(
    (card.chips ?? []).slice(0, MAX_CHIPS).map((text) => ({ text, named: true })),
    measure,
    CONTENT_WIDTH,
  );
  const chipsTop = hasRows ? rows.bottom + 24 : head.bottom;
  // Sans ligne ni pastille, les notes remontent sous l'en-tête.
  const bottom = layout.rows.length > 0 ? chipsTop + chipsHeight(layout) : hasRows ? rows.bottom : head.bottom - ROW.gap;
  const notes: CardText[] = card.footnotes.map((line, i) => ({ ...fitted(line, "body", 26, 18, CONTENT_WIDTH, measure), x: CARD_MARGIN, y: bottom + 40 + i * FOOTNOTE_HEIGHT, font: "body", color: C.MUTED }));
  const height = bottom + card.footnotes.length * FOOTNOTE_HEIGHT + (card.footnotes.length > 0 ? 12 : 0) + FOOTER_HEIGHT;
  return assembleCard(height, [head, rows, chipParts(layout, CARD_MARGIN, chipsTop), { rects: [], texts: notes }, footParts(card.address, card.note, height, measure)]);
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

/** Des faits, à partir de `top` : l'étiquette et le détail sur une ligne, le fait en grand dessous, en onciale taillée. */
export function factParts(facts: readonly CardFact[], top: number, measure: Measure): CardParts & { bottom: number } {
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  facts.forEach((fact, i) => {
    const y = top + i * (FACT_HEIGHT + FACT_GAP);
    rects.push({ x: CARD_MARGIN, y, width: CONTENT_WIDTH, height: FACT_HEIGHT, radius: 8, color: C.SURFACE, stroke: C.LINE });
    const inner = CONTENT_WIDTH - 44;
    // Le détail passe d'abord, à sa taille : c'est l'étiquette qui se réduit à côté de lui.
    const detailWidth = fact.detail ? measure(fact.detail, "strong", 26) + 24 : 0;
    if (fact.detail) texts.push({ text: fact.detail, size: 26, x: CARD_MARGIN + CONTENT_WIDTH - 22, y: y + 34, font: "strong", color: C.BLUE_TEXT, anchor: "end" });
    texts.push({ ...fitted(fact.label, "body", 26, 18, inner - detailWidth, measure), x: CARD_MARGIN + 22, y: y + 34, font: "body", color: C.MUTED });
    texts.push({ ...fitted(fact.value, "onciale", 36, 22, inner, measure), x: CARD_MARGIN + 22, y: y + 75, font: "onciale", color: C.WHITE });
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
  const head = headParts(card, measure, card.address);
  const facts = factParts(card.facts, head.bottom, measure);
  const height = facts.bottom + FOOTER_HEIGHT;
  return assembleCard(height, [head, facts, footParts(card.address, card.note, height, measure)]);
}

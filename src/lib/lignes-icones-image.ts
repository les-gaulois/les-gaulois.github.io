/**
 * Des lignes à icône en pixels, pour les images du robot posées au-dessus de boutons : le panneau des rôles
 * (`roles-discord.ts`) et le guichet des tickets (`guichet-image.ts`). Chaque ligne a la case de son icône, la même que
 * celle de son bouton sur Discord (`emojis-discord.ts`), son nom, et une phrase dessous. Ainsi l'image et la rangée de
 * boutons se lisent ensemble, dans le même ordre, avec les mêmes dessins.
 * Ce fichier dit quoi écrire et où ; il se teste sans police.
 */
import { CARD_COLORS as C, fitted, type CardRect, type CardText, type Measure } from "./gazette-image";
import { ICONES_PARTIES, ICONE_DEMI, ICONE_PLEIN, type IconePartieNom } from "./icones-parties";
import { CARD_MARGIN, CARD_WIDTH, type CardParts } from "./salon-image";

export interface IconRow {
  /** Le nom écrit sur la ligne, celui de son bouton. */
  label: string;
  /** La phrase sous le nom. */
  description: string;
  /** Son icône, dans la grille des icônes du site. */
  icone: IconePartieNom;
}

const CONTENT_WIDTH = CARD_WIDTH - 2 * CARD_MARGIN;
/** Une ligne : la case de l'icône à gauche, le nom, et la phrase dessous. Treize cases de six pixels dans une case de 88. */
export const ICON_ROW = { height: 116, gap: 14, inset: 14, tile: 88, cell: 6, name: 36, description: 27 } as const;

/**
 * Les cases d'une icône en rectangles : une suite de cases voisines de même teinte fait un seul rectangle. C'est le tracé de
 * `tracePixels` (`icones-parties.ts`), en rectangles, parce que le dessin des images du robot ne pose que des rectangles et
 * des textes.
 */
export function iconRects(lines: readonly string[], left: number, top: number, cell: number, full: string, half: string): CardRect[] {
  const rects: CardRect[] = [];
  lines.forEach((line, row) => {
    let x = 0;
    while (x < line.length) {
      const shade = line[x];
      if (shade !== ICONE_PLEIN && shade !== ICONE_DEMI) {
        x += 1;
        continue;
      }
      let end = x;
      while (end < line.length && line[end] === shade) end += 1;
      rects.push({ x: left + x * cell, y: top + row * cell, width: (end - x) * cell, height: cell, radius: 0, color: shade === ICONE_PLEIN ? full : half });
      x = end;
    }
  });
  return rects;
}

/** Des mots posés en lignes qui tiennent dans `width` : un mot ne se coupe jamais. */
export function wrapWords(text: string, font: CardText["font"], size: number, width: number, measure: Measure): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter((w) => w !== "")) {
    const next = line === "" ? word : `${line} ${word}`;
    if (line !== "" && measure(next, font, size) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== "") lines.push(line);
  return lines;
}

/**
 * Les grandes cases, comme l'écran de choix d'un jeu : en grille de `columns` colonnes, chacune avec sa grande icône en
 * pixels au milieu, son nom dessous, puis sa phrase, sur deux ou trois lignes. Toutes les cases ont la hauteur de la plus
 * haute. `bottom` : le bas de la dernière rangée.
 */
export const ICON_TILE = { gap: 24, pad: 30, cell: 12, name: 40, nameMin: 26, nameGap: 58, description: 27, line: 37, after: 30 } as const;

export function iconTileParts(rows: readonly IconRow[], top: number, columns: number, measure: Measure): CardParts & { bottom: number } {
  const m = ICON_TILE;
  const width = (CONTENT_WIDTH - (columns - 1) * m.gap) / columns;
  const inner = width - 2 * m.pad;
  const wrapped = rows.map((row) => wrapWords(row.description, "body", m.description, inner, measure));
  const iconSide = Math.max(...rows.map((row) => ICONES_PARTIES[row.icone].length), 0) * m.cell;
  const lines = Math.max(...wrapped.map((w) => w.length), 1);
  const height = m.pad + iconSide + m.nameGap + (lines - 1) * m.line + m.line + m.after;
  // Tous les noms à la même taille : celle du plus long qui tient dans sa case.
  let nameSize: number = m.name;
  while (nameSize > m.nameMin && rows.some((row) => measure(row.label, "strong", nameSize) > inner)) nameSize -= 1;
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  rows.forEach((row, i) => {
    const x = CARD_MARGIN + (i % columns) * (width + m.gap);
    const y = top + Math.floor(i / columns) * (height + m.gap);
    const center = x + width / 2;
    rects.push({ x, y, width, height, radius: 8, color: C.SURFACE, stroke: C.LINE });
    const icon = ICONES_PARTIES[row.icone];
    rects.push(...iconRects(icon, center - (icon.length * m.cell) / 2, y + m.pad, m.cell, C.BLUE_TEXT, C.BLUE));
    const nameY = y + m.pad + iconSide + m.nameGap;
    texts.push({ ...fitted(row.label, "strong", nameSize, m.nameMin, inner, measure), x: center, y: nameY, font: "strong", color: C.WHITE, anchor: "middle" });
    (wrapped[i] ?? []).forEach((text, n) => {
      texts.push({ ...fitted(text, "body", m.description, m.description - 6, inner, measure), x: center, y: nameY + m.line + 4 + n * m.line, font: "body", color: C.MUTED, anchor: "middle" });
    });
  });
  const tileRows = Math.ceil(rows.length / columns);
  return { rects, texts, bottom: rows.length > 0 ? top + tileRows * (height + m.gap) - m.gap : top };
}

/** Les lignes, à partir de `top`. `bottom` : le bas de la dernière, ou `top` sans ligne. */
export function iconRowParts(rows: readonly IconRow[], top: number, measure: Measure): CardParts & { bottom: number } {
  const m = ICON_ROW;
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  const textX = CARD_MARGIN + m.inset + m.tile + 28;
  const room = CARD_MARGIN + CONTENT_WIDTH - 24 - textX;
  rows.forEach((row, i) => {
    const y = top + i * (m.height + m.gap);
    rects.push({ x: CARD_MARGIN, y, width: CONTENT_WIDTH, height: m.height, radius: 8, color: C.SURFACE, stroke: C.LINE });
    rects.push({ x: CARD_MARGIN + m.inset, y: y + m.inset, width: m.tile, height: m.tile, radius: 6, color: C.SURFACE_2, stroke: C.LINE_STRONG });
    const lines = ICONES_PARTIES[row.icone];
    const offset = (m.tile - lines.length * m.cell) / 2;
    rects.push(...iconRects(lines, CARD_MARGIN + m.inset + offset, y + m.inset + offset, m.cell, C.BLUE_TEXT, C.BLUE));
    texts.push({ ...fitted(row.label, "strong", m.name, m.name - 8, room, measure), x: textX, y: y + 52, font: "strong", color: C.WHITE });
    texts.push({ ...fitted(row.description, "body", m.description, m.description - 7, room, measure), x: textX, y: y + 94, font: "body", color: C.MUTED });
  });
  return { rects, texts, bottom: rows.length > 0 ? top + rows.length * (m.height + m.gap) - m.gap : top };
}

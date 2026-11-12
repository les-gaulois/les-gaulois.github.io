/**
 * L'image du panneau des rôles sur Discord (docs/DIRECTION.md, « Les rôles sur Discord ») : demandé par le pilote le 12
 * novembre 2026, à la place d'un panneau d'un autre robot. La commande /roles de la fonction `code-discord` la poste avec un
 * bouton par rôle ; un clic donne le rôle, un second le retire. L'image se dessine à la construction du site, avec les
 * images des commandes (`commandes-discord.ts`), et la fonction la lit dans `/commandes.json`.
 *
 * Ici, seulement ce que l'image écrit : le nom de chaque rôle, celui de son bouton, et ce qu'il fait, repris du panneau
 * d'avant. Les numéros des rôles ne sont que dans la fonction, côté serveur : c'est elle qui décide quel rôle se donne. Un
 * test vérifie que les deux listes ont les mêmes rôles, dans le même ordre.
 * Ce fichier dit quoi écrire et où ; il se teste sans police.
 */
import { CARD_COLORS as C, fitted, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";
import { ICONES_PARTIES, ICONE_DEMI, ICONE_PLEIN, type IconePartieNom } from "./icones-parties";
import { shownAddress } from "./salon-discord";
import { assembleCard, CARD_MARGIN, CARD_WIDTH, FOOTER_HEIGHT, footParts, headParts } from "./salon-image";

export interface PanelRole {
  /** Le nom du rôle dans le numéro de son bouton (`PANEL_ROLES` de la fonction). */
  key: string;
  /** Le nom écrit sur le bouton et sur l'image. */
  label: string;
  /** Ce que le rôle fait, comme le disait le panneau d'avant. */
  description: string;
  /** Son icône, dans la grille des icônes du site. */
  icone: IconePartieNom;
}

export const PANEL_ROLES: readonly PanelRole[] = [
  { key: "rassemblement", label: "Rassemblement", description: "Être prévenu quand un Gaulois cherche des joueurs", icone: "cor" },
  { key: "giveaway", label: "Giveaway", description: "Être prévenu quand un giveaway commence", icone: "cadeau" },
  { key: "tournois", label: "Tournois", description: "Être prévenu quand un tournoi s'annonce", icone: "epees" },
  { key: "membre", label: "Membre GAL", description: "Être prévenu des annonces du clan", icone: "bouclier" },
];

export const ROLES_KICKER = "Serveur Discord du clan";
export const ROLES_TITLE = "Choisissez vos rôles";
export const ROLES_HOW = "Un clic sur un bouton donne le rôle, un second clic le retire";
export const ROLES_NOTE = "« Mes rôles » : ceux que vous avez";

const CONTENT_WIDTH = CARD_WIDTH - 2 * CARD_MARGIN;
/** Une ligne par rôle : la case de l'icône à gauche, le nom, et ce que fait le rôle dessous. */
const ROW = { height: 116, gap: 14, inset: 14, tile: 88, cell: 6, name: 36, description: 27 } as const;

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

/**
 * L'image du panneau, au style des autres images du robot (`salon-image.ts`) : l'en-tête, une ligne par rôle (la case de son
 * icône, son nom, ce qu'il fait), puis l'adresse du site et ce que montre « Mes rôles ».
 */
export function rolesCard(siteUrl: string, measure: Measure): GazetteCard {
  const address = shownAddress(siteUrl, "");
  const head = headParts({ kicker: ROLES_KICKER, title: ROLES_TITLE, period: ROLES_HOW }, measure, address);
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  const textX = CARD_MARGIN + ROW.inset + ROW.tile + 28;
  const room = CARD_MARGIN + CONTENT_WIDTH - 24 - textX;
  PANEL_ROLES.forEach((role, i) => {
    const y = head.bottom + i * (ROW.height + ROW.gap);
    rects.push({ x: CARD_MARGIN, y, width: CONTENT_WIDTH, height: ROW.height, radius: 8, color: C.SURFACE, stroke: C.LINE });
    rects.push({ x: CARD_MARGIN + ROW.inset, y: y + ROW.inset, width: ROW.tile, height: ROW.tile, radius: 6, color: C.SURFACE_2, stroke: C.LINE_STRONG });
    const lines = ICONES_PARTIES[role.icone];
    const offset = (ROW.tile - lines.length * ROW.cell) / 2;
    rects.push(...iconRects(lines, CARD_MARGIN + ROW.inset + offset, y + ROW.inset + offset, ROW.cell, C.BLUE_TEXT, C.BLUE));
    texts.push({ ...fitted(role.label, "strong", ROW.name, ROW.name - 8, room, measure), x: textX, y: y + 52, font: "strong", color: C.WHITE });
    texts.push({ ...fitted(role.description, "body", ROW.description, ROW.description - 7, room, measure), x: textX, y: y + 94, font: "body", color: C.MUTED });
  });
  const bottom = head.bottom + PANEL_ROLES.length * (ROW.height + ROW.gap) - ROW.gap;
  const height = bottom + FOOTER_HEIGHT;
  return assembleCard(height, [head, { rects, texts }, footParts(address, ROLES_NOTE, height, measure)]);
}

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** La description de l'image, que Discord lit aux lecteurs d'écran : tout ce qu'elle écrit, l'adresse du site comprise. */
export function rolesImageAlt(siteUrl: string): string {
  return [
    `${ROLES_TITLE}, sur le serveur Discord du clan.`,
    `${ROLES_HOW}.`,
    ...PANEL_ROLES.map((role) => `${role.label} : ${lowerFirst(role.description)}.`),
    "Le bouton « Mes rôles » montre ceux que vous avez.",
    `Le site du clan : ${shownAddress(siteUrl, "")}.`,
  ].join(" ");
}

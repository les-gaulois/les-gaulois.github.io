/**
 * L'image de « Jouer ensemble » : la part des parties jouées à plusieurs et la part des points qu'elles ont rapportés, en
 * grand ; les points par partie selon le nombre de Gaulois ; puis les duos qui ont le plus gagné ensemble, une ligne chacun.
 * Même dessin que les autres images du robot (`salon-image.ts`). Tout vient du bilan de la semaine : rien n'est recalculé, et
 * ce qui manque n'est pas dessiné.
 * Chargée seulement au moment d'envoyer : si elle ne se dessine pas, le message part en texte.
 */
import { fmtCount } from "./format";
import { CARD_COLORS as C, fitted, kpiParts, type CardText, type GazetteCard, type Measure } from "./gazette-image";
import { DUOS_HEADING, DUOS_NOTE, duoWords, GROUPS_TITLE, perGameParts, share, weekSpan, type WeekGroups } from "./groupes-discord";
import { shownAddress } from "./salon-discord";
import { assembleCard, CARD_MARGIN, CARD_WIDTH, footParts, headParts, rowParts, type CardParts } from "./salon-image";

const CONTENT_WIDTH = CARD_WIDTH - 2 * CARD_MARGIN;
/** De la fin d'un bloc à la ligne de base du titre du suivant, puis au haut de ce bloc. */
const HEADING_DROP = 50;
const HEADING_TO_BLOCK = 24;
const FOOTER_HEIGHT = 92;
const BADGE_WIDTH = 230;

export const PER_GAME_HEADING = "Points par partie, selon le nombre de Gaulois";

/** Les deux grands chiffres : chacun se lit comme une phrase avec ce qui est écrit dessous. */
export function shareTiles(week: WeekGroups): { label: string; value: string; text: string }[] {
  return [
    { label: "Parties", value: share(week.groupGames, week.games), text: `des ${fmtCount(week.games, "partie")} se sont jouées à plusieurs` },
    { label: "Points", value: share(week.groupPoints, week.points), text: "des points gagnés viennent de ces parties" },
  ];
}

/** Quoi écrire et où, à partir du bilan seul : se teste sans police. */
export function groupsCard(week: WeekGroups, tag: string, siteUrl: string, measure: Measure): GazetteCard {
  const address = shownAddress(siteUrl, "/liste");
  const head = headParts({ kicker: `Parties du clan sous le tag [${tag}]`, title: GROUPS_TITLE, period: `Semaine ${weekSpan(week)}` }, measure, address);
  const blocks: CardParts[] = [head];
  const heading = (text: string, y: number): CardParts => ({ rects: [], texts: [{ ...fitted(text, "onciale", 26, 18, CONTENT_WIDTH, measure), x: CARD_MARGIN, y, font: "onciale", color: C.WHITE } satisfies CardText] });

  // Les deux parts, côte à côte.
  const shares = kpiParts(
    shareTiles(week).map((tile) => ({ label: tile.label, value: tile.value, hint: { text: tile.text } })),
    { x: CARD_MARGIN, y: head.bottom, width: CONTENT_WIDTH, valueSize: 76 },
    measure,
  );
  blocks.push(shares);
  let bottom = shares.bottom;

  // Les points par partie, un chiffre par taille de groupe qui a des parties.
  const perGame = perGameParts(week);
  if (perGame.length > 0) {
    blocks.push(heading(PER_GAME_HEADING, bottom + HEADING_DROP));
    const sizes = kpiParts(
      perGame.map((part) => ({ label: part.words, value: part.points })),
      { x: CARD_MARGIN, y: bottom + HEADING_DROP + HEADING_TO_BLOCK, width: CONTENT_WIDTH, valueSize: 46, minValueSize: 30 },
      measure,
    );
    blocks.push(sizes);
    bottom = sizes.bottom;
  }

  // Les duos : leurs victoires ensemble dans le badge, le premier rang en bleu, leurs parties à droite.
  if (week.duos.length > 0) {
    blocks.push(heading(DUOS_HEADING, bottom + HEADING_DROP));
    const most = Math.max(...week.duos.map((d) => d.wins));
    const rows = rowParts(
      week.duos.map((d) => ({ badge: fmtCount(d.wins, "victoire"), strong: d.wins === most, name: `${d.a.name} et ${d.b.name}`, detail: `sur ${fmtCount(d.games, "partie")}` })),
      bottom + HEADING_DROP + HEADING_TO_BLOCK,
      BADGE_WIDTH,
      true,
      measure,
    );
    blocks.push(rows);
    bottom = rows.bottom;
  }

  const height = bottom + FOOTER_HEIGHT;
  return assembleCard(height, [...blocks, footParts(address, week.duos.length > 0 ? DUOS_NOTE : "", height, measure)]);
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export function groupsImageAlt(week: WeekGroups, tag: string): string {
  const parts = [`${GROUPS_TITLE}, semaine ${weekSpan(week)}, parties du clan sous le tag [${tag}].`, ...shareTiles(week).map((tile) => `${tile.value} ${tile.text}.`)];
  const perGame = perGameParts(week);
  if (perGame.length > 0) parts.push(`${PER_GAME_HEADING} : ${perGame.map((p) => `${p.words}, ${p.points}`).join(" ; ")}.`);
  if (week.duos.length > 0) parts.push(`${DUOS_HEADING} : ${week.duos.map((d) => `${d.a.name} et ${d.b.name}, ${duoWords(d)}`).join(" ; ")}. ${DUOS_NOTE}`);
  return parts.join(" ").slice(0, 1024);
}

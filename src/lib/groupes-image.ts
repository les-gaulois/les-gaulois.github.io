/**
 * L'image de « Jouer ensemble » : la part des parties jouées à plusieurs et la part des points qu'elles ont rapportés, en
 * grand ; les points par partie selon le nombre de Gaulois ; puis les duos qui ont le plus gagné ensemble, une ligne chacun.
 * Même dessin que les autres images du robot (`salon-image.ts`). Tout vient du bilan de la semaine : rien n'est recalculé, et
 * ce qui manque n'est pas dessiné.
 * Chargée seulement au moment d'envoyer : si elle ne se dessine pas, le message part en texte.
 */
import { fmtCount } from "./format";
import { CARD_COLORS as C, fitted, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";
import { DUOS_HEADING, DUOS_NOTE, duoWords, GROUPS_TITLE, perGameParts, share, weekSpan, type WeekGroups } from "./groupes-discord";
import { shownAddress } from "./salon-discord";
import { assembleCard, BODY_TOP, CARD_MARGIN, CARD_WIDTH, footParts, headParts, rowParts, type CardParts } from "./salon-image";

const CONTENT_WIDTH = CARD_WIDTH - 2 * CARD_MARGIN;
const GAP = 16;
const SHARE_HEIGHT = 164;
const PER_GAME_HEIGHT = 108;
/** De la fin d'un bloc à la ligne de base du titre du suivant, puis au haut de ce bloc. */
const HEADING_DROP = 46;
const HEADING_TO_BLOCK = 18;
const FOOTER_HEIGHT = 96;
const BADGE_WIDTH = 230;

export const PER_GAME_HEADING = "Points par partie, selon le nombre de Gaulois";

/** Les deux grands chiffres : chacun se lit comme une phrase avec ce qui est écrit dessous. */
export function shareTiles(week: WeekGroups): { value: string; label: string }[] {
  return [
    { value: share(week.groupGames, week.games), label: `des ${fmtCount(week.games, "partie")} se sont jouées à plusieurs` },
    { value: share(week.groupPoints, week.points), label: "des points gagnés viennent de ces parties" },
  ];
}

/** Quoi écrire et où, à partir du bilan seul : se teste sans police. */
export function groupsCard(week: WeekGroups, tag: string, siteUrl: string, measure: Measure): GazetteCard {
  const rects: CardRect[] = [];
  const texts: CardText[] = [];

  // Les deux parts, côte à côte.
  const shares = shareTiles(week);
  const shareWidth = (CONTENT_WIDTH - GAP) / 2;
  shares.forEach((tile, i) => {
    const x = CARD_MARGIN + i * (shareWidth + GAP);
    rects.push({ x, y: BODY_TOP, width: shareWidth, height: SHARE_HEIGHT, radius: 20, color: C.SURFACE });
    texts.push({ ...fitted(tile.value, "title", 80, 56, shareWidth - 48, measure), x: x + 24, y: BODY_TOP + 86, font: "title", color: C.WHITE });
    texts.push({ ...fitted(tile.label, "body", 26, 16, shareWidth - 48, measure), x: x + 24, y: BODY_TOP + 132, font: "body", color: C.MUTED });
  });
  let bottom = BODY_TOP + SHARE_HEIGHT;

  // Les points par partie, une case par taille de groupe qui a des parties.
  const perGame = perGameParts(week);
  if (perGame.length > 0) {
    texts.push({ ...fitted(PER_GAME_HEADING, "strong", 26, 18, CONTENT_WIDTH, measure), x: CARD_MARGIN, y: bottom + HEADING_DROP, font: "strong", color: C.WHITE });
    const top = bottom + HEADING_DROP + HEADING_TO_BLOCK;
    const width = (CONTENT_WIDTH - (perGame.length - 1) * GAP) / perGame.length;
    perGame.forEach((part, i) => {
      const x = CARD_MARGIN + i * (width + GAP);
      rects.push({ x, y: top, width, height: PER_GAME_HEIGHT, radius: 16, color: C.SURFACE });
      texts.push({ ...fitted(part.points, "title", 44, 28, width - 48, measure), x: x + 24, y: top + 54, font: "title", color: C.WHITE });
      texts.push({ ...fitted(part.words, "body", 24, 16, width - 48, measure), x: x + 24, y: top + 90, font: "body", color: C.MUTED });
    });
    bottom = top + PER_GAME_HEIGHT;
  }

  // Les duos : leurs victoires ensemble dans le badge, le premier rang en bleu, leurs parties à droite.
  let duos: CardParts = { rects: [], texts: [] };
  if (week.duos.length > 0) {
    texts.push({ ...fitted(DUOS_HEADING, "strong", 26, 18, CONTENT_WIDTH, measure), x: CARD_MARGIN, y: bottom + HEADING_DROP, font: "strong", color: C.WHITE });
    const most = Math.max(...week.duos.map((d) => d.wins));
    const rows = rowParts(
      week.duos.map((d) => ({ badge: fmtCount(d.wins, "victoire"), strong: d.wins === most, name: `${d.a.name} et ${d.b.name}`, detail: `sur ${fmtCount(d.games, "partie")}` })),
      bottom + HEADING_DROP + HEADING_TO_BLOCK,
      BADGE_WIDTH,
      true,
      measure,
    );
    duos = rows;
    bottom = rows.bottom;
  }

  const height = bottom + FOOTER_HEIGHT;
  const head = headParts({ kicker: `Parties du clan sous le tag [${tag}]`, title: GROUPS_TITLE, period: `Semaine ${weekSpan(week)}` }, measure);
  return assembleCard(height, [head, { rects, texts }, duos, footParts(shownAddress(siteUrl, "/liste"), week.duos.length > 0 ? DUOS_NOTE : "", height, measure)]);
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export function groupsImageAlt(week: WeekGroups, tag: string): string {
  const parts = [`${GROUPS_TITLE}, semaine ${weekSpan(week)}, parties du clan sous le tag [${tag}].`, ...shareTiles(week).map((tile) => `${tile.value} ${tile.label}.`)];
  const perGame = perGameParts(week);
  if (perGame.length > 0) parts.push(`${PER_GAME_HEADING} : ${perGame.map((p) => `${p.words}, ${p.points}`).join(" ; ")}.`);
  if (week.duos.length > 0) parts.push(`${DUOS_HEADING} : ${week.duos.map((d) => `${d.a.name} et ${d.b.name}, ${duoWords(d)}`).join(" ; ")}. ${DUOS_NOTE}`);
  return parts.join(" ").slice(0, 1024);
}

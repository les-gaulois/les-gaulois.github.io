/**
 * L'image des paliers franchis : chaque pseudo avec le palier qu'il vient de passer. Même dessin que les autres images en
 * lignes du robot (`salon-image.ts`).
 *
 * Le message n'a pas de texte : l'image nomme tout le monde. Jusqu'à cinq joueurs, une ligne chacun ; jusqu'à dix, des lignes
 * plus basses ; au-delà, les dix plus hauts paliers en lignes et les autres en pastilles, avec leur palier.
 */
import { fmtDayAndTime, fmtInt } from "./format";
import { AUCUN_GAULOIS, type GauloisParJoueur } from "./gaulois-joueurs";
import type { GazetteCard, Measure } from "./gazette-image";
import { crossingWords, MILESTONE_NOTE, milestoneTitle, othersWords, periodWords, type MilestonePlayer, type PendingMilestones } from "./paliers-franchis";
import { fittedAlt, NAMED_ONLY, NAMED_ONLY_SHORT, shownAddress } from "./salon-discord";
import { MAX_CHIPS, MAX_COMPACT_ROWS, MAX_ROWS, rowsCard } from "./salon-image";

const BADGE_WIDTH = 290;
const COMPACT_BADGE_WIDTH = 230;

/**
 * Quoi écrire et où, à partir des joueurs seuls, du plus haut palier au plus bas : se teste sans police. `gaulois` : le
 * Gaulois du village de ceux qui ont créé le leur, après leur nom ou derrière leur pastille.
 */
export function milestoneCard(players: readonly MilestonePlayer[], pending: PendingMilestones, tag: string, siteUrl: string, measure: Measure, gaulois: GauloisParJoueur = AUCUN_GAULOIS): GazetteCard {
  const compact = players.length > MAX_ROWS;
  const inRows = players.slice(0, compact ? MAX_COMPACT_ROWS : MAX_ROWS);
  const inChips = players.slice(inRows.length, inRows.length + MAX_CHIPS);
  const rest = players.length - inRows.length - inChips.length;
  return rowsCard(
    {
      // L'en-tête dit aussi qui peut être cité : sans texte dans le message, rien d'autre ne le dirait.
      kicker: `Victoires en équipe sous le tag [${tag}], ${NAMED_ONLY_SHORT}`,
      title: milestoneTitle(players.length),
      period: `Entre les relevés de la liste du ${fmtDayAndTime(pending.since)} et du ${fmtDayAndTime(pending.until)}`,
      rows: inRows.map((p) => ({ badge: `${fmtInt(p.tier)} victoires`, strong: true, name: p.username, detail: null, ids: [p.id] })),
      compact,
      chips: inChips.map((p) => ({ text: `${p.username} · ${fmtInt(p.tier)} victoires`, id: p.id })),
      footnotes: rest > 0 ? [othersWords(rest)] : [],
      address: shownAddress(siteUrl, "/membres"),
      note: MILESTONE_NOTE,
      badgeWidth: compact ? COMPACT_BADGE_WIDTH : BADGE_WIDTH,
    },
    measure,
    gaulois,
  );
}

/**
 * Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. Sans couper un pseudo : au-delà
 * de ce que Discord accepte, les autres sont comptés, et les réserves de la fin restent entières.
 */
export function milestoneImageAlt(players: readonly MilestonePlayer[], pending: PendingMilestones, tag: string): string {
  const head = `${milestoneTitle(players.length)} chez [${tag}] : victoires en équipe sous le tag, ${periodWords(pending)}.`;
  return fittedAlt(players, (shown, rest) => {
    const names = shown.map((p) => `${p.username} ${crossingWords(p.tier)}`).join(" ; ");
    return [head, ...(names ? [`${names}.`] : []), ...(rest > 0 ? [othersWords(rest)] : []), NAMED_ONLY, MILESTONE_NOTE].join(" ");
  });
}

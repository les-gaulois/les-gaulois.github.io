/**
 * L'image des plus actifs : une ligne par joueur, sa place dans le badge, ses parties et ses victoires à droite.
 * Chargée seulement au moment d'envoyer, comme les autres images du robot : si elle ne se dessine pas, le message part en texte.
 */
import { ACTIVE_NOTE, ACTIVE_TITLE, activityWords, type ActivePlayer } from "./actifs";
import type { ActivePeriod } from "./actifs-discord";
import { fmtDayAndTime, fmtRank } from "./format";
import { AUCUN_GAULOIS, type GauloisParJoueur } from "./gaulois-joueurs";
import type { GazetteCard, Measure } from "./gazette-image";
import { periodWords } from "./paliers-franchis";
import { ALT_MAX, NAMED_ONLY, NAMED_ONLY_SHORT, shownAddress } from "./salon-discord";
import { rowsCard } from "./salon-image";

/**
 * Quoi écrire et où : se teste sans police. Cinq joueurs au plus, comme le podium de la semaine.
 * L'en-tête dit qui est compté : sans texte dans le message, « 1er » se lirait comme le plus actif de tout le clan.
 * `gaulois` : le Gaulois du village de ceux qui ont créé le leur, posé après leur nom.
 */
export function activeCard(players: readonly ActivePlayer[], period: ActivePeriod, tag: string, siteUrl: string, measure: Measure, gaulois: GauloisParJoueur = AUCUN_GAULOIS): GazetteCard {
  return rowsCard(
    {
      kicker: `Parties en équipe sous le tag [${tag}], ${NAMED_ONLY_SHORT}`,
      title: ACTIVE_TITLE,
      period: `Entre les relevés de la liste du ${fmtDayAndTime(period.since)} et du ${fmtDayAndTime(period.until)}`,
      rows: players.map((p) => ({ badge: fmtRank(p.place), strong: p.place === 1, name: p.username, detail: activityWords(p), ids: [p.id] })),
      footnotes: [],
      address: shownAddress(siteUrl, "/liste"),
      note: ACTIVE_NOTE,
      badgeWidth: 120,
    },
    measure,
    gaulois,
  );
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export function activeImageAlt(players: readonly ActivePlayer[], period: ActivePeriod, tag: string): string {
  const names = players.map((p) => `${fmtRank(p.place)}, ${p.username} : ${activityWords(p)}`).join(" ; ");
  return `${ACTIVE_TITLE} chez [${tag}], parties en équipe sous le tag, ${periodWords(period)}. ${names}. ${NAMED_ONLY} ${ACTIVE_NOTE}`.slice(0, ALT_MAX);
}

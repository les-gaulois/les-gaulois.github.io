/**
 * La belle partie d'hier : la partie de la veille où le plus de Gaulois jouaient ensemble.
 * À égalité, une victoire d'abord, puis la plus récente. Rien n'est choisi à la main.
 */
import { fmtDayAndTime, fmtInt, fmtMinutes } from "./format";
import type { JournalRow } from "./journal";
import { mapLabel } from "./map-names";
import { addDays, parisParts } from "./time";

/** En dessous, un joueur seul avec le tag : ce n'est pas une partie « ensemble ». */
export const MIN_TOGETHER = 2;

/** Le jour de Paris qui précède la dernière collecte. */
export const yesterdayOf = (coveredUntil: string) => addDays(parisParts(coveredUntil).date, -1);

const better = (row: JournalRow, best: JournalRow) =>
  row.gaulois > best.gaulois || (row.gaulois === best.gaulois && ((row.won && !best.won) || (row.won === best.won && row.at > best.at)));

/** `null` : aucune partie à plusieurs ce jour-là. */
export function bestGameOf(rows: readonly JournalRow[], date: string): JournalRow | null {
  let best: JournalRow | null = null;
  for (const row of rows) {
    if (row.gaulois < MIN_TOGETHER || parisParts(row.at).date !== date) continue;
    if (!best || better(row, best)) best = row;
  }
  return best;
}

/** « 7 nov., 21:49 sur MOAN : 5 Gaulois ensemble, victoire en 23 min. » Sans détail lu : ni carte ni durée. */
export function bestGameSentence(row: JournalRow): string {
  const where = row.map === null ? "" : ` sur ${mapLabel(row.map)}`;
  const result = row.won ? "victoire" : "défaite";
  const length = row.seconds === null ? "" : ` en ${fmtMinutes(row.seconds)}`;
  return `${fmtDayAndTime(row.at)}${where} : ${fmtInt(row.gaulois)} Gaulois ensemble, ${result}${length}.`;
}

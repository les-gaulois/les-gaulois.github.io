/**
 * Les records récents : ceux que le clan vient d'établir. Rien n'est jugé, on compare des dates.
 */
import type { ClanRecords } from "./results";
import { addDays, parisParts } from "./time";

export type RecordKey = keyof ClanRecords;
export const RECORD_KEYS: readonly RecordKey[] = ["streak", "bestDay", "biggestGroup", "mostTeams"];

/** Le jour de Paris où un record a été établi. */
export function recordDate(records: ClanRecords, key: RecordKey): string {
  switch (key) {
    case "streak":
      return parisParts(records.streak.endedAt).date;
    case "bestDay":
      return records.bestDay.date;
    case "biggestGroup":
      return parisParts(records.biggestGroup.at).date;
    case "mostTeams":
      return parisParts(records.mostTeams.at).date;
  }
}

/** Les records établis dans les `days` derniers jours couverts par la collecte, ce jour compris. */
export function recentRecordKeys(records: ClanRecords | null, coveredUntil: string | null, days = 7): Set<RecordKey> {
  const keys = new Set<RecordKey>();
  if (!records || !coveredUntil) return keys;
  const since = addDays(parisParts(coveredUntil).date, -(days - 1));
  for (const key of RECORD_KEYS) if (recordDate(records, key) >= since) keys.add(key);
  return keys;
}

/** Les records d'une semaine qui sont aussi ceux de tout l'historique : même valeur, même moment. Égaler un ancien record n'en est pas un. */
export function weekRecordKeys(week: ClanRecords | null, allTime: ClanRecords | null): Set<RecordKey> {
  const keys = new Set<RecordKey>();
  if (!week || !allTime) return keys;
  if (week.streak.wins === allTime.streak.wins && week.streak.endedAt === allTime.streak.endedAt) keys.add("streak");
  if (week.bestDay.wins === allTime.bestDay.wins && week.bestDay.date === allTime.bestDay.date) keys.add("bestDay");
  if (week.biggestGroup.players === allTime.biggestGroup.players && week.biggestGroup.at === allTime.biggestGroup.at) keys.add("biggestGroup");
  if (week.mostTeams.teams === allTime.mostTeams.teams && week.mostTeams.at === allTime.mostTeams.at) keys.add("mostTeams");
  return keys;
}

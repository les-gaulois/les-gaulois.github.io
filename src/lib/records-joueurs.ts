/**
 * Les records des joueurs, sur la page Records : jusqu'ici, elle donnait les records du clan sans citer personne.
 *
 * - La meilleure semaine : le plus de victoires en une semaine de la gazette, lu dans les podiums gardés
 *   (`data/member-weeks.json`, `tops`), depuis le premier relevé du lundi. Seuls les membres encore dans le clan, avec
 *   leur pseudo du moment, y sont, comme dans la gazette (`namedWeekPlayers`) : la collecte retire les anciens membres
 *   (`forgetFormerMembers`), et un pseudo retiré efface l'identifiant de la liste publique. Une semaine relevée en cours
 *   de route compte moins de jours : sa période est donnée telle quelle.
 * - La semaine la plus active : le plus de parties, victoires et défaites, en une semaine, pour les semaines qui les ont
 *   relevées.
 * - Le plus de victoires sous le tag : `stats.team` de la liste officielle, au total. Ce total peut compter des parties
 *   jouées sous le tag avant l'arrivée du joueur dans la liste (docs/API_AUDIT.md) : il n'est pas daté.
 *
 * Une limite : seuls les podiums d'une semaine sont gardés. Si tout le podium d'une semaine a quitté le clan, cette semaine
 * ne compte plus, et un 4e de cette semaine resté au clan, que le site n'a pas gardé, a pu faire mieux que le record affiché.
 *
 * Victoires et parties en équipe sous le tag : cela compte d'abord le temps de jeu, ce n'est pas un classement de niveau.
 * À égalité dans une semaine, tous les joueurs sont cités ; d'une semaine à l'autre, la première à atteindre le chiffre garde
 * le record, comme un record égalé n'est pas battu. Rien n'est choisi à la main.
 */
import type { StoredMembers, StoredMemberWeeks } from "./schemas";
import { addDays, parisParts } from "./time";

/** Un détenteur : son pseudo du moment, ou `null` pour un membre sans pseudo public, jamais nommé. Son identifiant ne s'affiche jamais. */
export interface RecordHolder {
  id: string;
  username: string | null;
}

export interface WeekRecord {
  value: number;
  /** Toujours nommés : un joueur qu'on ne peut plus nommer n'est pas compté, comme dans la gazette. */
  holders: { id: string; username: string }[];
  /** Le lundi de la semaine du record. */
  week: string;
  /** Le premier jour compté : ce lundi, ou le jour du relevé de départ si la semaine a été relevée en cours de route. */
  from: string;
  /** Le dimanche de cette semaine. */
  to: string;
}

export interface PlayerRecords {
  bestWeek: WeekRecord | null;
  busiestWeek: WeekRecord | null;
  mostWins: { value: number; holders: RecordHolder[] } | null;
  /** Le premier jour compté par les semaines gardées : avant, rien n'est connu. `null` : aucune semaine gardée. */
  firstDay: string | null;
  /** Le premier jour compté par la première semaine qui a relevé les parties. `null` : aucune encore. */
  gamesFirstDay: string | null;
}

type Tops = StoredMemberWeeks["tops"];

const firstDayOf = (week: string, since: string) => {
  const start = parisParts(since).date;
  return start > week ? start : week;
};

/** Le plus haut chiffre d'une liste de semaines, parmi les joueurs qu'on peut nommer ; à égalité entre semaines, la plus ancienne. */
function bestOf(tops: Tops, rowsOf: (top: Tops[string]) => readonly { id: string; value: number }[] | undefined, names: ReadonlyMap<string, string>): WeekRecord | null {
  let best: WeekRecord | null = null;
  for (const week of Object.keys(tops).sort()) {
    const top = tops[week]!;
    const rows = (rowsOf(top) ?? []).flatMap((row) => {
      const username = names.get(row.id);
      return username ? [{ ...row, username }] : [];
    });
    if (rows.length === 0) continue;
    const value = Math.max(...rows.map((row) => row.value));
    if (best && value <= best.value) continue;
    best = {
      value,
      holders: rows.filter((row) => row.value === value).map((row) => ({ id: row.id, username: row.username })),
      week,
      from: firstDayOf(week, top.since),
      to: addDays(week, 6),
    };
  }
  return best;
}

export function playerRecords(weeks: StoredMemberWeeks, members: StoredMembers | null): PlayerRecords {
  const names = new Map((members?.members ?? []).flatMap((m) => (m.username && m.publicId ? [[m.publicId, m.username] as const] : [])));
  const kept = Object.keys(weeks.tops).sort();
  const first = kept[0];
  const firstWithGames = kept.find((week) => weeks.tops[week]!.active !== undefined);

  const bestWeek = bestOf(weeks.tops, (top) => top.players.map((row) => ({ id: row.id, value: row.wins })), names);
  const busiestWeek = bestOf(weeks.tops, (top) => top.active?.map((row) => ({ id: row.id, value: row.games })), names);

  // Au total : tous les membres de la liste comptent, avec ou sans pseudo. Un anonyme n'est jamais nommé.
  let mostWins: PlayerRecords["mostWins"] = null;
  for (const m of members?.members ?? []) {
    const wins = m.team?.wins;
    if (wins === undefined || wins <= 0) continue;
    const holder = { id: m.publicId ?? "", username: m.username && m.publicId ? m.username : null };
    if (!mostWins || wins > mostWins.value) mostWins = { value: wins, holders: [holder] };
    else if (wins === mostWins.value) mostWins.holders.push(holder);
  }

  return {
    bestWeek,
    busiestWeek,
    mostWins,
    firstDay: first === undefined ? null : firstDayOf(first, weeks.tops[first]!.since),
    gamesFirstDay: firstWithGames === undefined ? null : firstDayOf(firstWithGames, weeks.tops[firstWithGames]!.since),
  };
}

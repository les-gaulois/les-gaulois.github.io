import { fmtCount, fmtInt, fmtPct } from "./format";
import { faceOffs, type GameCoverage } from "./games";
import type { StoredGame, StoredSession } from "./schemas";
import { winRate } from "./stats";
import { addDays, parisParts } from "./time";

/** Le journal couvre ces derniers jours de Paris : un mois, environ 2 500 parties. Au-delà, le fichier pèserait plus qu'il ne servirait. */
export const JOURNAL_DAYS = 30;
/** Les premières lignes sont écrites dans la page : elles se lisent sans JavaScript et avant le chargement du reste. */
export const JOURNAL_FIRST_ROWS = 25;

export type JournalClan = [tag: string, players: number];

export interface JournalRow {
  id: string;
  at: string;
  won: boolean;
  format: string | null;
  /** Joueurs du clan et joueurs de la partie, avec des stats, selon la session. */
  gaulois: number;
  players: number;
  /** `null` : le détail de la partie n'est pas encore lu. */
  map: string | null;
  seconds: number | null;
  /** Les clans de la liste officielle, d'au moins 2 joueurs, dans l'équipe du clan ou dans une autre. Vide si leurs équipes n'ont pas pu être établies : voir `digestGame`. */
  allies: JournalClan[];
  rivals: JournalClan[];
}

export interface JournalSources {
  sessions: readonly StoredSession[];
  games: readonly StoredGame[];
  coveredUntil: string | null;
  tag: string;
  /** Les seuls clans cités. Un tag se choisit librement : hors de cette liste, il peut être une injure, un code haineux ou le prénom d'un joueur. */
  officialTags: readonly string[];
}

export interface Journal {
  rows: JournalRow[];
  /** Faux : le calcul des équipes ne concorde plus avec les résultats récents. Comme les face-à-face, le journal ne dit alors plus qui jouait contre qui. */
  sides: boolean;
  coverage: GameCoverage;
}

/** Une ligne par partie du clan sur les `JOURNAL_DAYS` derniers jours couverts, de la plus récente à la plus ancienne. */
export function clanJournal({ sessions, games, coveredUntil, tag, officialTags }: JournalSources): Journal {
  if (!coveredUntil) return { rows: [], sides: false, coverage: { total: 0, read: 0 } };
  const from = addDays(parisParts(coveredUntil).date, -(JOURNAL_DAYS - 1));
  const details = new Map(games.map((g) => [g.id, g]));
  const official = new Set(officialTags);
  const sides = faceOffs(sessions, games, tag, officialTags, coveredUntil)?.reliable ?? false;
  const rows = sessions
    .filter((s) => parisParts(s.gameStart).date >= from)
    .sort((a, b) => b.gameStart.localeCompare(a.gameStart) || a.gameId.localeCompare(b.gameId))
    .map((s): JournalRow => {
      const game = details.get(s.gameId) ?? null;
      const mine = sides ? game?.clans.find(([clan]) => clan === tag) : undefined;
      const others = mine && game ? game.clans.filter(([clan]) => clan !== tag && official.has(clan)) : [];
      const side = (same: boolean) => others.filter(([, , team]) => (team === mine?.[2]) === same).map(([clan, players]): JournalClan => [clan, players]);
      return {
        id: s.gameId,
        at: s.gameStart,
        won: s.hasWon,
        format: s.playerTeams,
        gaulois: s.clanPlayerCount,
        players: s.totalPlayerCount,
        map: game?.map ?? null,
        seconds: game?.seconds ?? null,
        allies: side(true),
        rivals: side(false),
      };
    });
  return { rows, sides, coverage: { total: rows.length, read: rows.filter((r) => r.map !== null).length } };
}

export interface JournalFilter {
  result: "all" | "won" | "lost";
  /** Chaîne vide : tous. */
  format: string;
  map: string;
  rival: string;
}

export const NO_FILTER: JournalFilter = { result: "all", format: "", map: "", rival: "" };

export const isFiltered = (filter: JournalFilter) => filter.result !== "all" || filter.format !== "" || filter.map !== "" || filter.rival !== "";

export function filterJournal(rows: readonly JournalRow[], filter: JournalFilter): JournalRow[] {
  return rows.filter(
    (r) =>
      (filter.result === "all" || r.won === (filter.result === "won")) &&
      (filter.format === "" || r.format === filter.format) &&
      (filter.map === "" || r.map === filter.map) &&
      (filter.rival === "" || r.rivals.some(([clan]) => clan === filter.rival)),
  );
}

export interface JournalChoices {
  /** Les formats à nombre d'équipes dans l'ordre des nombres, puis les autres par ordre alphabétique. */
  formats: string[];
  /** Les cartes vues : leur nom d'affichage se choisit dans la page. */
  maps: string[];
  /** Les clans rencontrés, par ordre alphabétique. */
  rivals: string[];
}

export function journalChoices(rows: readonly JournalRow[]): JournalChoices {
  const formats = new Set<string>();
  const maps = new Set<string>();
  const rivals = new Set<string>();
  for (const row of rows) {
    if (row.format !== null) formats.add(row.format);
    if (row.map !== null) maps.add(row.map);
    for (const [clan] of row.rivals) rivals.add(clan);
  }
  const numeric = (key: string) => (/^\d+$/.test(key) ? Number(key) : Number.MAX_SAFE_INTEGER);
  return {
    formats: [...formats].sort((a, b) => numeric(a) - numeric(b) || a.localeCompare(b)),
    maps: [...maps],
    rivals: [...rivals].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Le décompte de la liste affichée. Le taux n'est écrit que sans filtre : sur un filtre, il se lirait comme un jugement alors qu'il dit surtout autre chose.
 * « Contre [UN] » dépend du nombre de Gaulois, le taux d'une carte du format et du salon, et celui d'un format se lit avec le hasard. Mesures : docs/API_AUDIT.md.
 */
export function journalCount(rows: readonly JournalRow[], filter: JournalFilter): string {
  const games = fmtCount(rows.length, "partie");
  const wins = rows.filter((r) => r.won).length;
  if (filter.result !== "all") return `${games}.`;
  const rate = isFiltered(filter) ? "" : `, soit ${fmtPct(winRate(wins, rows.length))}`;
  return `${games}, ${fmtCount(wins, "victoire")}${rate}.`;
}

/** Ce que les filtres Carte et Contre le clan ne voient pas. `null` : rien à signaler. */
export function journalUnread({ total, read }: GameCoverage, filter: JournalFilter): string | null {
  if (read >= total || (filter.map === "" && filter.rival === "")) return null;
  return `Ce filtre ne voit que les parties dont le détail est lu : ${fmtInt(read)} sur ${fmtInt(total)}.`;
}

/** La page de la partie sur OpenFront. Essayée le 7 novembre 2026 : seules les parties de la version actuelle du jeu s'y rejouaient. Voir docs/API_AUDIT.md. */
export const replayUrl = (gameId: string) => `https://openfront.io/game/${encodeURIComponent(gameId)}`;

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { dayRows, territoryReadings, type TerritoryReading } from "./clanmap/days";
import { GazetteSendState } from "./gazette-discord";
import { EMPTY_MEMBER_WEEKS } from "./week-players";
import {
  Announcements,
  ClanMapJournal,
  Events,
  HistorySnapshot,
  Meta,
  Nouveautes,
  RivalsSnapshot,
  StoredClanMapFilm,
  StoredGameFile,
  StoredLeaderboard,
  StoredMemberGames,
  StoredMemberResults,
  StoredMemberWeeks,
  StoredMembers,
  StoredRanked,
  StoredSessionFile,
  emptyMeta,
  type StoredGame,
  type StoredSession,
} from "./schemas";

const root = process.cwd();

/** Lit et valide un fichier. Absent ou invalide : `null`, jamais de valeur inventée. */
function read<S extends z.ZodType>(path: string, schema: S): z.output<S> | null {
  const full = join(root, path);
  if (!existsSync(full)) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(readFileSync(full, "utf8")));
    if (parsed.success) return parsed.data;
    console.warn(`Fichier invalide ignoré : ${path}`);
  } catch {
    console.warn(`Fichier illisible ignoré : ${path}`);
  }
  return null;
}

function listJson(dir: string): string[] {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

export const loadMeta = (): Meta => read("data/meta.json", Meta) ?? emptyMeta();
/** Le dernier envoi de la gazette sur Discord, noté par le robot. `null` : aucun envoi, ou fichier illisible. */
export const loadGazetteSendState = () => read("data/gazette-envoi.json", GazetteSendState);
export const loadLeaderboard = () => read("data/leaderboard.json", StoredLeaderboard);
export const loadMembers = () => read("data/members.json", StoredMembers);
export const loadRanked = () => read("data/ranked.json", StoredRanked);
/** Hors de `data/` et de Git : les lignes de chaque joueur ne doivent pas rester pour toujours dans l'historique public. */
export const MEMBER_GAMES_FILE = ".cache/member-games/players.json";
export const loadMemberGames = () => read(MEMBER_GAMES_FILE, StoredMemberGames) ?? {};
/** Les parties de chaque membre pour ses podiums, dans le même cache : voir `src/lib/podiums.ts`. */
export const MEMBER_RESULTS_FILE = ".cache/member-games/results.json";
export const loadMemberResults = () => read(MEMBER_RESULTS_FILE, StoredMemberResults) ?? {};
/** Les relevés du lundi : voir `src/lib/week-players.ts`. */
export const loadMemberWeeks = () => read("data/member-weeks.json", StoredMemberWeeks) ?? EMPTY_MEMBER_WEEKS;
export const loadClanMapFilm = () => read("data/clanmap/film.json", StoredClanMapFilm);
export const loadClanMapJournal = () => read("data/clanmap/journal.json", ClanMapJournal) ?? [];
/** Le territoire de GAL jour après jour, pour la gazette : voir `territoryReadings`. */
export function loadTerritoryReadings(): TerritoryReading[] {
  const film = loadClanMapFilm();
  return territoryReadings(film ? dayRows(film.days ?? [], film.frames, film.fetchedAt) : [], loadClanMapJournal());
}

export function loadSessions(): StoredSession[] {
  return listJson("data/sessions").flatMap((f) => read(`data/sessions/${f}`, StoredSessionFile)?.sessions ?? []);
}

// Les fiches des membres lisent toutes les mêmes sessions et les mêmes listes : une seule lecture par build.
let sessionIndex: Map<string, StoredSession> | null = null;
let memberResults: StoredMemberResults | null = null;
/** Les sessions du clan par partie, lues une fois. */
export const loadSessionIndex = (): Map<string, StoredSession> => (sessionIndex ??= new Map(loadSessions().map((s) => [s.gameId, s])));
/** Les listes de parties des membres, lues une fois. */
export const loadMemberResultsOnce = (): StoredMemberResults => (memberResults ??= loadMemberResults());

/** Les mois de sessions illisibles. Une page les ignore et se corrige au build suivant ; un message posté ne se corrige pas. */
export function unreadableSessionFiles(): string[] {
  return listJson("data/sessions").filter((f) => !read(`data/sessions/${f}`, StoredSessionFile));
}

export function loadGames(): StoredGame[] {
  return listJson("data/games").flatMap((f) => read(`data/games/${f}`, StoredGameFile)?.games ?? []);
}

export function loadHistory(): HistorySnapshot[] {
  return listJson("data/history").flatMap((f) => {
    const snap = read(`data/history/${f}`, HistorySnapshot);
    return snap ? [snap] : [];
  });
}

export function loadRivals(): RivalsSnapshot[] {
  return listJson("data/rivals").flatMap((f) => {
    const snap = read(`data/rivals/${f}`, RivalsSnapshot);
    return snap ? [snap] : [];
  });
}

export const loadAnnouncements = () => read("content/announcements.json", Announcements) ?? [];
export const loadEvents = () => read("content/events.json", Events) ?? [];
export const loadNouveautes = () => read("content/nouveautes.json", Nouveautes) ?? [];

/**
 * L'état du site, pour l'encadrement (espace Direction) : la collecte arrive-t-elle en ligne, l'API d'OpenFront répond-elle,
 * la liste officielle est-elle relue, et quand la gazette est-elle partie ?
 *
 * Tout vient de `data/meta.json`, de `data/gazette-envoi.json` et du serveur de connexion : rien n'est estimé.
 * Le site est statique : si le robot s'arrête, la page n'est plus reconstruite. L'âge se calcule donc
 * dans le navigateur du lecteur, avec `now`, et une page restée en l'état vieillit à l'écran.
 */
import { fmtCount, fmtDateTime, fmtDay } from "./format";
import { MAX_AGE_HOURS, freshness } from "./freshness";
import type { GazetteSendState } from "./gazette-discord";
import type { DatasetState, Meta } from "./schemas";

const HOUR_MS = 3_600_000;

/** Le robot passe au moins une fois par heure : au-delà de ce délai, celui du classement, l'état signale un retard. */
export const RUN_MAX_AGE_HOURS = MAX_AGE_HOURS.leaderboard;
/** La liste officielle se relit à partir de la liste des membres : même délai que celle-ci. */
export const ROSTER_MAX_AGE_HOURS = MAX_AGE_HOURS.members;

type SourceKey = keyof typeof MAX_AGE_HOURS;

/** Les sources lues dans l'API d'OpenFront, avec leur nom sur la page. */
export const SOURCES: readonly { key: SourceKey; label: string }[] = [
  { key: "leaderboard", label: "Classement des clans" },
  { key: "sessions", label: "Parties du clan" },
  { key: "games", label: "Détail des parties" },
  { key: "members", label: "Liste des membres" },
  { key: "memberGames", label: "Fiches des membres" },
  { key: "ranked", label: "Classé" },
  { key: "clanmap", label: "Carte des clans" },
];

/** Un âge en toutes lettres : « il y a 24 min », « il y a 5 h », « il y a 3 jours ». */
export function ago(ms: number): string {
  if (ms < 60_000) return "à l'instant";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(ms / HOUR_MS);
  if (hours < 48) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} jours`;
}

const since = (iso: string, now: Date) => `${ago(now.getTime() - Date.parse(iso))} (${fmtDateTime(iso)})`;

/** `warn` : à surveiller. `info` : un fait, sans jugement, comme le dernier envoi de la gazette. */
export type HealthLevel = "ok" | "warn" | "info";

export interface HealthLine {
  label: string;
  level: HealthLevel;
  text: string;
}

export interface SourceHealth extends HealthLine {
  key: SourceKey;
}

/** Une source de l'API : en échec si sa dernière lecture a échoué, sinon à jour ou en retard selon son délai. */
export function sourceHealth(state: DatasetState, maxAgeHours: number, now: Date): Omit<HealthLine, "label"> {
  if (state.lastError) {
    const when = state.lastErrorAt ? ` depuis le ${fmtDateTime(state.lastErrorAt)}` : "";
    const last = state.lastSuccessAt ? `dernière lecture réussie ${since(state.lastSuccessAt, now)}` : "jamais lue";
    return { level: "warn", text: `en échec${when} (${state.lastError}) ; ${last}` };
  }
  const fresh = freshness(state.lastSuccessAt, maxAgeHours, now);
  if (fresh === "missing" || !state.lastSuccessAt) return { level: "warn", text: "jamais lue" };
  return fresh === "stale"
    ? { level: "warn", text: `en retard : dernière lecture ${since(state.lastSuccessAt, now)}` }
    : { level: "ok", text: `à jour, ${since(state.lastSuccessAt, now)}` };
}

export interface SiteHealthInput {
  meta: Meta;
  gazette: GazetteSendState | null;
  /** La dernière relecture de la liste officielle par le serveur de connexion. `null` : jamais relue. */
  roster: { total: number; read_at: string } | null;
}

export interface SiteHealth {
  /** `warn` dès qu'une ligne est à surveiller. */
  level: "ok" | "warn";
  lines: HealthLine[];
  sources: SourceHealth[];
}

export function siteHealth({ meta, gazette, roster }: SiteHealthInput, now: Date): SiteHealth {
  const sources: SourceHealth[] = SOURCES.map(({ key, label }) => ({ key, label, ...sourceHealth(meta[key], MAX_AGE_HOURS[key], now) }));
  const failing = sources.filter((s) => s.level === "warn");

  // La page ne connaît que la collecte qu'elle publie : un retard vient du robot ou de la mise en ligne (onglet Actions).
  const run: HealthLine = meta.lastRunAt
    ? now.getTime() - Date.parse(meta.lastRunAt) > RUN_MAX_AGE_HOURS * HOUR_MS
      ? { label: "Collecte des données", level: "warn", text: `en retard : dernière collecte publiée ${since(meta.lastRunAt, now)}` }
      : { label: "Collecte des données", level: "ok", text: `dernière collecte publiée ${since(meta.lastRunAt, now)}` }
    : { label: "Collecte des données", level: "warn", text: "aucune collecte publiée" };

  const api: HealthLine =
    failing.length === 0
      ? { label: "API d'OpenFront", level: "ok", text: `les ${sources.length} sources sont à jour` }
      : { label: "API d'OpenFront", level: "warn", text: `${failing.length === 1 ? "1 source à surveiller" : `${failing.length} sources à surveiller`} : ${failing.map((s) => s.label).join(", ")}` };

  const rosterLine: HealthLine = roster
    ? now.getTime() - Date.parse(roster.read_at) > ROSTER_MAX_AGE_HOURS * HOUR_MS
      ? { label: "Liste officielle", level: "warn", text: `en retard : relue ${since(roster.read_at, now)}` }
      : { label: "Liste officielle", level: "ok", text: `relue ${since(roster.read_at, now)}, ${fmtCount(roster.total, "membre")}` }
    : { label: "Liste officielle", level: "warn", text: "jamais relue : aucune demande n'est comparée à la liste" };

  // Pas de jugement : l'heure d'envoi dépend du jour, et un salon d'essai peut l'avoir reçue.
  // `null` : fichier absent ou illisible. La page dit seulement qu'aucun envoi n'est noté, pas qu'il n'y en a jamais eu.
  const gazetteLine: HealthLine = gazette
    ? { label: "Gazette sur Discord", level: "info", text: `semaine du ${fmtDay(gazette.lastSent)}, envoyée ${since(gazette.sentAt, now)}` }
    : { label: "Gazette sur Discord", level: "info", text: "aucun envoi noté" };

  const lines = [run, api, rosterLine, gazetteLine];
  return { level: lines.some((l) => l.level === "warn") ? "warn" : "ok", lines, sources };
}

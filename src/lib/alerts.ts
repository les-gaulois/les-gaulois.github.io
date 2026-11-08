/**
 * Les alertes de place : un message sur Discord quand GAL gagne ou perd une place, au classement officiel des clans ou sur la carte des clans.
 *
 * Peu de messages, et seulement du vrai :
 * - Classement : OpenFront le recalcule environ une fois par heure, et `end` date chaque calcul. Un changement de place ne compte
 *   que s'il tient sur deux calculs, à au moins 50 minutes d'écart, du même côté de la place annoncée : une place qui fait le yo-yo
 *   d'un calcul à l'autre n'envoie rien. L'alerte donne la place du dernier calcul.
 * - Carte : relevée environ une fois par jour. Chaque relevé est comparé à la dernière place annoncée. L'alerte attend le passage
 *   suivant, quand le site montre ce relevé.
 * - Rien la nuit, de 23 h à 8 h à Paris : l'alerte attend le matin, et ne part plus si la place est revenue entre-temps.
 * - Au plus deux alertes par jour à Paris, une seule par passage du robot, et toujours sur un relevé récent.
 * - Au premier passage, les places du moment servent de départ : rien n'est envoyé.
 */
import { z } from "zod";
import { fmtDayAndTime, fmtInt, fmtRank, fmtScore } from "./format";
import type { StoredClanMapFilm, StoredLeaderboard } from "./schemas";
import { findClan, neighbours, withOfficialRanks } from "./stats";
import { parisParts } from "./time";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** Deux calculs d'OpenFront, et non deux lectures du même calcul. */
export const CONFIRM_MS = 50 * MINUTE_MS;
/** La nuit, à Paris : de 23 h à 8 h. */
export const QUIET_FROM_HOUR = 23;
export const QUIET_UNTIL_HOUR = 8;
export const MAX_ALERTS_PER_DAY = 2;
/** Au-delà, le relevé ne part pas : le robot relit le classement à chaque passage, la carte environ une fois par jour. */
export const MAX_READING_AGE_MS = { rank: 2 * HOUR_MS, map: 24 * HOUR_MS } as const;
/**
 * Le site se reconstruit quelques minutes après chaque passage du robot. Une alerte de la carte attend ce temps après le relevé du
 * film, pour que son bouton montre la nouvelle carte : en pratique, elle part au passage suivant.
 * Le classement n'attend pas. Sa nouvelle place a déjà été lue à un calcul précédent, et le site la montre. Seule exception, une place
 * qui a encore bougé au dernier calcul, comme 3e puis 4e : le site peut alors montrer la précédente quelques minutes.
 * Attendre le passage suivant ne marcherait pas : le robot ne lit en général chaque calcul qu'une fois, et une chute continue ne partirait jamais.
 */
export const MAP_SITE_DELAY_MS = 15 * MINUTE_MS;
/**
 * Le lancement : les alertes attendent que la gazette de cette semaine-là soit partie, pour qu'elle soit le premier message du salon.
 * C'est l'édition du 2 au 8 novembre 2026, envoyée le lundi 9 novembre vers 9 h 53.
 */
export const ALERTS_AFTER_EDITION = "2026-11-02";
/** Les envois gardés, pour compter ceux du jour. */
const SENT_KEPT_MS = 48 * HOUR_MS;
/** Les clans montrés autour de GAL. */
const WINDOW = 5;

const place = z.number().int().positive();

export const AlertState = z.object({
  rank: z
    .object({
      /** La dernière place annoncée, ou celle du premier passage. */
      announced: place,
      /**
       * Une autre place, pas encore annoncée. `rank` : celle du dernier calcul. `since` : l'heure du premier calcul qui s'est écarté
       * de la place annoncée, de ce côté-là.
       */
      pending: z.object({ rank: place, since: z.iso.datetime() }).nullable(),
    })
    .nullable(),
  map: z.object({ announced: place }).nullable(),
  /** Les envois des deux derniers jours. */
  sent: z.array(z.iso.datetime()),
});
export type AlertState = z.infer<typeof AlertState>;

export const EMPTY_ALERT_STATE: AlertState = { rank: null, map: null, sent: [] };

/**
 * Lit l'état noté par le robot. Un fichier illisible ne bloque pas les alertes pour toujours : les places du moment servent
 * de nouveau départ, comme au premier passage, qui n'envoie rien. Seule une alerte en attente peut s'y perdre.
 */
export function parseAlertState(raw: string | null): { state: AlertState | null; warning: string | null } {
  if (raw === null) return { state: null, warning: null };
  try {
    const parsed = AlertState.safeParse(JSON.parse(raw));
    if (parsed.success) return { state: parsed.data, warning: null };
  } catch {
    // Même suite qu'un fichier au mauvais format.
  }
  return { state: null, warning: "l'état noté est illisible : les places du moment servent de nouveau départ" };
}

/** Les alertes ont-elles commencé ? `gazetteLastSent` : la dernière édition de la gazette envoyée, quel que soit son format. */
export const alertsStarted = (gazetteLastSent: string | null) => gazetteLastSent !== null && gazetteLastSent >= ALERTS_AFTER_EDITION;

export type PlaceKind = "rank" | "map";

export interface PlaceRow {
  rank: number;
  /** `null` : clan supprimé depuis, sur la carte. */
  tag: string | null;
  /** Le score officiel, ou les pixels sur la carte. */
  value: number;
  /** La couleur du clan dans le jeu, sur la carte seulement. */
  color: number | null;
  gal: boolean;
}

export interface PlaceGap {
  tag: string | null;
  rank: number;
  /** Positif, ou nul à égalité : l'avance sur le clan juste derrière, le retard sur celui juste devant. */
  gap: number;
}

export interface PlaceReading {
  kind: PlaceKind;
  rank: number;
  /** L'heure du relevé du robot. */
  fetchedAt: string;
  /** Classement : l'heure du calcul d'OpenFront (`end`). Carte : celle du relevé. */
  computedAt: string;
  /** Les clans autour de GAL, dans l'ordre officiel. */
  rows: PlaceRow[];
  above: PlaceGap | null;
  below: PlaceGap | null;
}

/** Les lignes autour d'une place, la place au milieu sauf en haut ou en bas de la liste. */
function windowStart(index: number, length: number): number {
  return Math.max(0, Math.min(index - Math.floor(WINDOW / 2), length - WINDOW));
}

/** La place de GAL au classement officiel, dans l'ordre de la liste d'OpenFront, sans aucun recalcul. `null` : GAL n'y est pas. */
export function rankReading(leaderboard: StoredLeaderboard | null, tag: string): PlaceReading | null {
  if (!leaderboard) return null;
  const ranked = withOfficialRanks(leaderboard.clans);
  const me = findClan(ranked, tag);
  const near = neighbours(ranked, tag);
  if (!me || !near) return null;
  const start = windowStart(me.rank - 1, ranked.length);
  return {
    kind: "rank",
    rank: me.rank,
    fetchedAt: leaderboard.fetchedAt,
    computedAt: leaderboard.end,
    rows: ranked.slice(start, start + WINDOW).map((c) => ({ rank: c.rank, tag: c.clanTag, value: c.weightedWins, color: null, gal: c === me })),
    above: near.above && { tag: near.above.clan.clanTag, rank: near.above.clan.rank, gap: near.above.gap },
    below: near.below && { tag: near.below.clan.clanTag, rank: near.below.clan.rank, gap: near.below.gap },
  };
}

/** La place de GAL sur la carte des clans, d'après le dernier film : territoire en pixels, ce n'est pas le classement. `null` : GAL n'a pas de pixel. */
export function mapReading(film: StoredClanMapFilm | null, tag: string): PlaceReading | null {
  const rank = film?.galSummary?.rank;
  if (!film || !rank) return null;
  const me = film.standings[rank - 1];
  // Le rang et l'ordre des clans viennent du même rejeu : s'ils ne s'accordent pas, le film n'est pas fiable.
  if (me?.tag?.toUpperCase() !== tag.toUpperCase()) return null;
  const above = film.standings[rank - 2];
  const below = film.standings[rank];
  const start = windowStart(rank - 1, film.standings.length);
  return {
    kind: "map",
    rank,
    fetchedAt: film.fetchedAt,
    computedAt: film.fetchedAt,
    rows: film.standings.slice(start, start + WINDOW).map((c, i) => ({ rank: start + i + 1, tag: c.tag, value: c.pixels, color: c.color, gal: start + i === rank - 1 })),
    above: above ? { tag: above.tag, rank: rank - 1, gap: above.pixels - me.pixels } : null,
    below: below ? { tag: below.tag, rank: rank + 1, gap: me.pixels - below.pixels } : null,
  };
}

export interface PlaceAlert {
  kind: PlaceKind;
  /** La place annoncée avant celle-ci. */
  from: number;
  reading: PlaceReading;
}

export interface AlertPlan {
  /** L'état à garder, que l'alerte parte ou non : le premier passage et les places en attente y sont notés. */
  state: AlertState;
  alert: PlaceAlert | null;
  /** Pourquoi rien ne part, pour le journal de l'Action. */
  reason: string;
}

/**
 * Note le relevé du classement. Une place revenue à celle annoncée efface l'attente. Une autre place du même côté garde l'heure
 * du premier calcul qui s'est écarté : GAL qui passe 3e puis 4e a bien perdu sa 2e place, même si aucune des deux n'a tenu deux calculs.
 * Une place de l'autre côté repart de son propre calcul : annoncé 3e, GAL lu 4e puis 2e n'a encore rien prouvé.
 */
function observeRank(state: AlertState, reading: PlaceReading | null): AlertState {
  if (!reading) return state;
  const current = state.rank;
  if (!current) return { ...state, rank: { announced: reading.rank, pending: null } };
  if (reading.rank === current.announced) return current.pending ? { ...state, rank: { ...current, pending: null } } : state;
  const pending = current.pending;
  if (pending?.rank === reading.rank) return state;
  const sameSide = pending !== null && Math.sign(pending.rank - current.announced) === Math.sign(reading.rank - current.announced);
  return { ...state, rank: { ...current, pending: { rank: reading.rank, since: sameSide ? pending.since : reading.computedAt } } };
}

/** Le site montre-t-il la place annoncée ? Seule la carte peut ne pas être encore en ligne : voir `MAP_SITE_DELAY_MS`. */
const shownOnSite = (alert: PlaceAlert, now: Date) => alert.kind === "rank" || now.getTime() - Date.parse(alert.reading.fetchedAt) >= MAP_SITE_DELAY_MS;
const fresh = (alert: PlaceAlert, now: Date) => now.getTime() - Date.parse(alert.reading.fetchedAt) <= MAX_READING_AGE_MS[alert.kind];

/**
 * Décide s'il faut envoyer une alerte maintenant. L'alerte du classement passe avant celle de la carte : l'autre attend le passage suivant.
 * Ne change jamais la place annoncée : `markSent` s'en charge, une fois le message accepté par Discord.
 */
export function planAlert(stored: AlertState | null, readings: { rank: PlaceReading | null; map: PlaceReading | null }, now: Date): AlertPlan {
  let state = observeRank(stored ?? EMPTY_ALERT_STATE, readings.rank);
  if (readings.map && !state.map) state = { ...state, map: { announced: readings.map.rank } };
  if (!stored) return { state, alert: null, reason: "premier passage : les places du moment servent de départ" };

  const due: PlaceAlert[] = [];
  const rank = readings.rank;
  const pending = state.rank?.pending;
  if (rank && state.rank && pending && rank.rank !== state.rank.announced && Date.parse(rank.computedAt) - Date.parse(pending.since) >= CONFIRM_MS) {
    due.push({ kind: "rank", from: state.rank.announced, reading: rank });
  }
  const map = readings.map;
  if (map && state.map && map.rank !== state.map.announced) due.push({ kind: "map", from: state.map.announced, reading: map });
  if (due.length === 0) {
    if (!rank && !map) return { state, alert: null, reason: "aucun relevé lisible" };
    return { state, alert: null, reason: pending ? `classement : ${fmtRank(pending.rank)} en attente d'un second calcul` : "aucune place n'a changé" };
  }

  const { date, hour } = parisParts(now);
  if (hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR) return { state, alert: null, reason: `la nuit : l'alerte attend ${QUIET_UNTIL_HOUR} h` };
  const today = state.sent.filter((at) => parisParts(at).date === date).length;
  if (today >= MAX_ALERTS_PER_DAY) return { state, alert: null, reason: `déjà ${today} alertes aujourd'hui : la suivante attend demain` };
  const alert = due.find((a) => fresh(a, now) && shownOnSite(a, now));
  if (alert) return { state, alert, reason: "" };
  const waiting = due.some((a) => fresh(a, now) && !shownOnSite(a, now));
  return { state, alert: null, reason: waiting ? "carte : l'alerte attend que le site montre le nouveau relevé" : "relevé trop ancien : l'alerte attend le prochain" };
}

/** Après un envoi accepté : la nouvelle place devient celle annoncée, et l'envoi compte pour la journée. */
export function markSent(state: AlertState, alert: PlaceAlert, now: Date): AlertState {
  const sent = [...state.sent.filter((at) => now.getTime() - Date.parse(at) < SENT_KEPT_MS), now.toISOString()];
  if (alert.kind === "rank") return { ...state, rank: { announced: alert.reading.rank, pending: null }, sent };
  return { ...state, map: { announced: alert.reading.rank }, sent };
}

/* ---------- Les mots de l'alerte, pour le message et pour l'image ---------- */

/** « la 1re place », « la 2e place » : la place est féminine. */
export const placeWords = (rank: number) => `la ${rank === 1 ? "1re" : `${rank}e`} place`;

export const isGain = (alert: PlaceAlert) => alert.reading.rank < alert.from;

/** « +1 place », « −2 places » : le signe dit le sens, pas seulement la couleur. */
export function placeChange(alert: PlaceAlert): string {
  const n = Math.abs(alert.from - alert.reading.rank);
  return `${isGain(alert) ? "+" : "−"}${n} ${n > 1 ? "places" : "place"}`;
}

/** « [GAL] monte à la 2e place », sans le nom du classement : l'image l'écrit au-dessus. */
export function shortHeadline(alert: PlaceAlert, tag: string): string {
  return `[${tag}] ${isGain(alert) ? "monte" : "recule"} à ${placeWords(alert.reading.rank)}`;
}

export function alertHeadline(alert: PlaceAlert, tag: string): string {
  return `${shortHeadline(alert, tag)} ${alert.kind === "rank" ? "du classement des clans" : "sur la carte des clans"}`;
}

export const boardName = (kind: PlaceKind) => (kind === "rank" ? "Classement des clans" : "Carte des clans");

/** Le chiffre d'une ligne : le score officiel tel qu'OpenFront le donne, ou les pixels. */
export const rowValue = (kind: PlaceKind, value: number) => (kind === "rank" ? fmtScore(value) : fmtInt(value));

function gapValue(kind: PlaceKind, gap: number): string {
  return kind === "rank" ? fmtScore(gap) : `${fmtInt(gap)} ${gap > 1 ? "pixels" : "pixel"}`;
}

/**
 * Les écarts avec les clans juste devant et juste derrière, comme sur la page d'accueil. `name` écrit un tag : échappé pour Discord, tel quel ailleurs.
 * Après une montée, l'avance passe d'abord ; après une baisse, le retard.
 */
export function gapParts(alert: PlaceAlert, name: (tag: string | null) => string): string[] {
  const { kind, above, below } = alert.reading;
  const line = (side: PlaceGap, words: string) => (side.gap === 0 ? `à égalité avec ${name(side.tag)}, ${fmtRank(side.rank)}` : `${gapValue(kind, side.gap)} ${words} ${name(side.tag)}, ${fmtRank(side.rank)}`);
  const lead = below && line(below, "d'avance sur");
  const behind = above && line(above, "de retard sur");
  const parts = isGain(alert) ? [lead, behind] : [behind, lead];
  return parts.filter((part): part is string => part !== null);
}

export const plainTag = (tag: string | null) => (tag === null ? "un clan supprimé" : `[${tag}]`);

/** D'où vient le chiffre, et à quelle heure : l'heure du calcul d'OpenFront pour le classement, comme sur la page. */
export function readingWhen(reading: PlaceReading): string {
  return reading.kind === "rank" ? `Liste officielle d'OpenFront, arrêtée au ${fmtDayAndTime(reading.computedAt)}` : `Carte au relevé du ${fmtDayAndTime(reading.fetchedAt)}`;
}

/** Ce que mesure le chiffre. */
export const readingNote = (kind: PlaceKind) => (kind === "rank" ? "Score : victoires pondérées, demi-vie de 30 jours" : "Territoire en pixels, ce n'est pas le classement des clans");

export const sourceLine = (reading: PlaceReading) => `${readingWhen(reading)}. ${readingNote(reading.kind)}.`;

/** Une phrase par écart, avec sa majuscule et son point : la virgule décimale ne s'y mêle pas aux séparateurs. */
export const gapSentences = (parts: readonly string[]) => parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}.`).join(" ");

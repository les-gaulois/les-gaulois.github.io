/**
 * Les annonces et les événements publiés depuis l'espace Direction, réunis avec ceux du dépôt : la face publique.
 * Un simple fetch : la page d'accueil ne charge pas toute la bibliothèque de Supabase pour cela.
 * Seul un membre connecté la charge, pour répondre « Je viens » (`fetchMyParticipation`).
 * Les sondages sont au QG (`qg.ts`), pour les membres validés : le serveur ne les donne plus ici.
 */
import { fmtDate, fmtInt } from "../format";
import { SUPABASE_KEY, SUPABASE_URL, call } from "./api";

export interface StaticAnnouncement {
  date: string;
  title: string;
  body: string;
  url?: string | undefined;
}
export interface StaticEvent {
  start: string;
  title: string;
  description?: string | undefined;
  url?: string | undefined;
}
export interface LiveAnnouncement {
  id: number;
  title: string;
  body: string;
  url: string | null;
  created_at: string;
}
/** Une série d'événements : rendez-vous encore à venir, et date du dernier. */
export interface EventSeries {
  left: number;
  until: string;
}
export interface LiveEvent {
  id: number;
  title: string;
  description: string | null;
  url: string | null;
  starts_at: string;
  /** Membres qui ont répondu « Je viens ». Absent d'un serveur plus ancien. */
  going?: number;
  series?: EventSeries | null;
}
export interface LiveNews {
  announcements: LiveAnnouncement[];
  events: LiveEvent[];
}
export interface NewsItem {
  key: string;
  at: string;
  title: string;
  body: string | null;
  url: string | null;
  /** Un événement publié depuis la Direction : on peut y répondre. */
  eventId?: number;
  going?: number;
  series?: EventSeries | null;
}
/** Ce que le membre connecté a répondu : les événements où il vient. */
export interface Participation {
  events: Set<number>;
}

/** « 1 membre vient », « 3 membres viennent ». `null` : personne, rien à écrire. */
export function goingLabel(going: number | undefined): string | null {
  if (!going || going < 1) return null;
  return going === 1 ? "1 membre vient" : `${fmtInt(going)} membres viennent`;
}

/**
 * « Encore 4 rendez-vous, jusqu'au 4 déc. 2026 » : une série qui en a encore plus d'un. Le nombre et la date restent
 * justes même si l'encadrement déplace ou supprime un rendez-vous de la série, ce que « chaque semaine » ne serait plus.
 */
export function seriesNote(series: EventSeries | null | undefined): string | null {
  if (!series || series.left < 2) return null;
  return `Encore ${fmtInt(series.left)} rendez-vous, jusqu'au ${fmtDate(series.until)}`;
}

/** Le serveur filtre déjà les liens : on revérifie, car celui-ci finit dans un href. */
export const safeUrl = (url: string | null | undefined): string | null => (url && /^https:\/\/[^\s<>"'`]+$/.test(url) ? url : null);

/** Les plus récentes d'abord. Les annonces du dépôt n'ont qu'une date : elles comptent pour midi. */
export function mergeAnnouncements(fixed: readonly StaticAnnouncement[], live: readonly LiveAnnouncement[]): NewsItem[] {
  return [
    ...live.map((a) => ({ key: `live-${a.id}`, at: a.created_at, title: a.title, body: a.body, url: safeUrl(a.url) })),
    ...fixed.map((a, i) => ({ key: `depot-${i}`, at: `${a.date}T12:00:00Z`, title: a.title, body: a.body, url: a.url ?? null })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Les plus proches d'abord, sans ceux déjà passés à l'instant de la lecture. */
export function mergeEvents(fixed: readonly StaticEvent[], live: readonly LiveEvent[], now: number): NewsItem[] {
  return [
    ...live.map((e) => ({ key: `live-${e.id}`, at: e.starts_at, title: e.title, body: e.description, url: safeUrl(e.url), eventId: e.id, going: e.going, series: e.series ?? null })),
    ...fixed.map((e, i) => ({ key: `depot-${i}`, at: e.start, title: e.title, body: e.description ?? null, url: e.url ?? null })),
  ]
    .filter((e) => Date.parse(e.at) >= now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** `null` si le serveur ne répond pas : la page garde alors ce que le dépôt contient. */
export async function fetchLiveNews(fetcher: typeof fetch = fetch): Promise<LiveNews | null> {
  try {
    const res = await fetcher(`${SUPABASE_URL}/rest/v1/rpc/get_site_news`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: "{}",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<LiveNews> & { ok?: boolean };
    return data.ok && Array.isArray(data.announcements) && Array.isArray(data.events) ? { announcements: data.announcements, events: data.events } : null;
  } catch {
    return null;
  }
}

/**
 * Ce que le membre connecté a répondu. `null` : pas de session, compte pas encore validé ou serveur muet ;
 * la page ne propose alors pas « Je viens ».
 */
export async function fetchMyParticipation(): Promise<Participation | null> {
  try {
    const data = await call<{ events: number[] }>("get_my_participation");
    return { events: new Set(data.events) };
  } catch {
    return null;
  }
}

/** Une date ISO, écrite comme l'attend un champ datetime-local : à l'heure du visiteur. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

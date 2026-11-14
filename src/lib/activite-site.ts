/**
 * L'activité du site, pour l'onglet « Activité » de la Direction (demande du pilote, 13 novembre 2026) : ce que le
 * navigateur d'un visiteur envoie au serveur à chaque page, et la lecture des totaux que le serveur rend à l'encadrement.
 *
 * Le site compte ses visites lui-même, sans service extérieur, sans cookie et sans adresse IP. Le navigateur ne garde
 * qu'une marque (`VISIT_COUNT_KEY`) : la date de sa dernière visite comptée, et celle où la marque a été posée, pour
 * qu'elle ne vive pas plus de 13 mois. Il n'envoie que des réponses par oui ou non qu'il en tire : première page du jour, de la semaine, du mois, première visite tout court. À la première page du jour
 * s'ajoutent une famille de provenance (jamais l'adresse d'où il arrive), l'écran tactile ou non, et une session du site
 * gardée ou non. Le serveur n'en fait que des totaux par jour (migration `20261113001500_activite_du_site.sql`).
 * Le script qui envoie : `src/scripts/visite.ts`. L'écran : `src/components/compte/DirectionActivite.tsx`.
 */
import { SECTIONS } from "./nav";

/**
 * La marque de ce navigateur : `AAAA-MM-JJ AAAA-MM-JJ`, la date de sa dernière visite comptée puis celle de la pose de la
 * marque, heure de Paris. Rien d'autre.
 */
export const VISIT_COUNT_KEY = "gal-visite-comptee";
/** La valeur de `VISIT_COUNT_KEY` quand le visiteur a choisi, sur la page Confidentialité, de ne plus être compté. */
export const VISIT_COUNT_REFUSED = "refus";

/**
 * Les traces qu'un visiteur d'avant le compteur a pu laisser dans son navigateur : si l'une d'elles est là, il est déjà
 * venu. Elles ne sont que lues, pour une réponse par oui ou non ; rien de leur contenu ne part.
 */
export const EARLIER_VISIT_KEYS = ["gal-visite", "gal-nouveautes", "gal-fx", "gal-moi", "gal-moi-visite", "gal-conquete-session"] as const;

const PARIS_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** Le jour de Paris d'un instant, `AAAA-MM-JJ` : le serveur range les visites dans le même jour. */
export function parisDay(date: Date): string {
  return PARIS_DAY.format(date);
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La vie d'une marque : 13 mois au plus depuis sa pose, sans être prolongée par les visites suivantes (la règle de la CNIL
 * pour une mesure d'audience sans consentement). Passé ce délai, elle est oubliée et une nouvelle est posée.
 */
export const VISIT_MARK_MAX_DAYS = 390;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export interface VisitMark {
  /** La dernière visite comptée. */
  last: string;
  /** La pose de la marque. */
  since: string;
}

/** La marque gardée, ou `null` : absente, illisible, à venir, ou posée il y a plus de 13 mois. */
export function readVisitMark(raw: string | null, today: string): VisitMark | null {
  if (raw === null) return null;
  const [last = "", since = last] = raw.split(" ");
  if (!DAY_RE.test(last) || !DAY_RE.test(since) || last > today || since > last) return null;
  if (daysBetween(since, today) > VISIT_MARK_MAX_DAYS) return null;
  return { last, since };
}

/** La marque à garder après une visite comptée aujourd'hui : la date de pose ne bouge pas. */
export function writeVisitMark(previous: VisitMark | null, today: string): string {
  return `${today} ${previous?.since ?? today}`;
}

/** Le lundi de la semaine d'un jour `AAAA-MM-JJ`. */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

export interface VisitFlags {
  /** Première page de ce navigateur aujourd'hui : un visiteur de plus pour le jour. */
  newDay: boolean;
  newWeek: boolean;
  newMonth: boolean;
  /** Aucune trace d'une visite d'avant dans ce navigateur. */
  first: boolean;
}

/**
 * Ce que le navigateur répond, à partir de sa marque (`readVisitMark`). Sans marque, tout est nouveau ; `earlier` dit si
 * une trace du site existe pourtant (une marque périmée, ou une autre), auquel cas ce n'est pas une première visite.
 */
export function visitFlags(mark: VisitMark | null, today: string, earlier: boolean): VisitFlags {
  const known = mark?.last ?? null;
  if (known === null) return { newDay: true, newWeek: true, newMonth: true, first: !earlier };
  if (known === today) return { newDay: false, newWeek: false, newMonth: false, first: false };
  return { newDay: true, newWeek: mondayOf(known) !== mondayOf(today), newMonth: known.slice(0, 7) !== today.slice(0, 7), first: false };
}

export const VISIT_SOURCES = ["direct", "discord", "google", "moteur", "openfront", "reseaux", "autre"] as const;
export type VisitSource = (typeof VISIT_SOURCES)[number];

export const SOURCE_LABELS: Record<VisitSource, string> = {
  direct: "Sans provenance",
  discord: "Discord",
  google: "Google",
  moteur: "Autres moteurs de recherche",
  openfront: "OpenFront",
  reseaux: "Réseaux et vidéos",
  autre: "Autres sites",
};

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
const SEARCH = ["bing.com", "duckduckgo.com", "qwant.com", "ecosia.org", "yahoo.com", "yandex.com", "yandex.ru", "search.brave.com", "startpage.com", "lilo.org"];
const SOCIAL = ["youtube.com", "youtu.be", "tiktok.com", "reddit.com", "x.com", "t.co", "twitter.com", "facebook.com", "instagram.com", "twitch.tv"];

/**
 * La famille d'où arrive un visiteur, lue dans l'adresse de la page précédente (`document.referrer`), dont seul le nom
 * du site compte. Vide, ou le site lui-même : « direct ». Une application (Discord sur téléphone ou sur ordinateur) ne
 * donne pas d'adresse : ses visiteurs comptent aussi « sans provenance ».
 */
export function sourceOf(referrer: string, siteHost: string): VisitSource {
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "direct";
  }
  if (host === "" || host === siteHost.toLowerCase()) return "direct";
  if (hostIs(host, "discord.com") || hostIs(host, "discordapp.com") || hostIs(host, "discord.gg")) return "discord";
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return "google";
  if (SEARCH.some((d) => hostIs(host, d))) return "moteur";
  if (hostIs(host, "openfront.io")) return "openfront";
  if (SOCIAL.some((d) => hostIs(host, d))) return "reseaux";
  return "autre";
}

/**
 * Un robot qui se déclare dans son nom de navigateur : moteurs de recherche, aperçus de liens, mesures de vitesse. Ceux
 * qui se font passer pour un navigateur ordinaire comptent, comme partout.
 */
export function isDeclaredBot(userAgent: string): boolean {
  return /bot\b|bot\/|crawl|spider|slurp|headlesschrome|lighthouse|pagespeed/i.test(userAgent);
}

/** Le modèle d'adresse d'une page, tel qu'Astro le donne (`/membres/[id]`), ramené à ce que le serveur accepte. */
export function pageKey(route: string): string {
  const clean = route.toLowerCase().replace(/\/+$/, "") || "/";
  return /^\/[\]a-z0-9/_.[-]{0,62}$/.test(clean) ? clean : "/autre";
}

/** Les pages qui ne sont pas dans le plan du site, nommées pour l'encadrement. */
const OTHER_PAGES: Record<string, string> = {
  "/": "Accueil",
  "/membres/[id]": "Fiches des membres",
  "/compte": "Mon compte",
  "/direction": "Direction",
  "/admin": "Ancienne administration",
  "/confidentialite": "Confidentialité",
  "/mentions-legales": "Mentions légales",
  "/autre": "Autres pages",
};

const OTHERS = "Autres pages";

/** Le nom d'une page pour l'encadrement : celui du plan du site ou d'une page connue, sinon « Autres pages ». */
export function pageLabel(page: string): string {
  if (OTHER_PAGES[page]) return OTHER_PAGES[page];
  for (const section of SECTIONS) for (const p of section.pages) if (p.href === page) return p.label;
  return OTHERS;
}

/**
 * Les pages vues, sous leur nom. Une adresse que le site n'a pas, envoyée par un appel trafiqué, n'est jamais écrite telle
 * quelle : elle rejoint « Autres pages », toujours en dernier.
 */
export function namedPages(pages: { page: string; views: number }[]): { label: string; value: number }[] {
  const totals = new Map<string, number>();
  for (const p of pages) {
    const label = pageLabel(p.page);
    totals.set(label, (totals.get(label) ?? 0) + p.views);
  }
  return [...totals]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => Number(a.label === OTHERS) - Number(b.label === OTHERS) || b.value - a.value || a.label.localeCompare(b.label, "fr"));
}

/** Ce que rend `get_site_activity`. */
export interface SiteActivity {
  read_at: string;
  today: string;
  since: string | null;
  days: { day: string; views: number; visitors: number; newcomers: number; touch: number; signed_in: number }[];
  week: { visitors: number; views: number };
  month: { visitors: number; views: number };
  pages: { page: string; views: number }[];
  hours: { hour: number; views: number }[];
  sources: { source: string; visitors: number }[];
  total: { visitors: number; views: number };
}

export interface DayBar {
  day: string;
  /** `null` : le compteur ne tournait pas encore ce jour-là. Pas de données, pas zéro. */
  visitors: number | null;
  views: number | null;
}

/**
 * Les `n` derniers jours jusqu'à `today`, du plus ancien au plus récent. Un jour sans ligne après le début du compteur
 * est un vrai zéro ; avant, il n'a pas de données.
 */
export function lastDays(activity: Pick<SiteActivity, "days" | "today" | "since">, n = 30): DayBar[] {
  const byDay = new Map(activity.days.map((d) => [d.day, d]));
  const out: DayBar[] = [];
  const end = new Date(`${activity.today}T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    const row = byDay.get(day);
    const counted = activity.since !== null && day >= activity.since;
    out.push({ day, visitors: row ? row.visitors : counted ? 0 : null, views: row ? row.views : counted ? 0 : null });
  }
  return out;
}

/** Le jour d'avant `day`. */
export function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Une part en pour cent arrondie, ou `null` sans base. La multiplication avant la division : `23 / 40 * 100` vaut
 * 57,4999… en nombres à virgule et s'arrondissait à 57 au lieu de 58.
 */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part * 100) / whole) : null;
}

/** Les 24 heures de la journée, de 0 h à 23 h, avec un vrai zéro pour une heure sans page vue. */
export function allHours(hours: SiteActivity["hours"]): { hour: number; views: number }[] {
  const byHour = new Map(hours.map((h) => [h.hour, h.views]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, views: byHour.get(hour) ?? 0 }));
}

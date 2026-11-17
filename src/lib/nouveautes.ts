/**
 * Les nouveautés du site : chaque mise à jour, expliquée simplement (`content/nouveautes.json`).
 * Le bouton de l'en-tête en montre les dernières, la page `/nouveautes` les montre par jour, triées pour les joueurs
 * d'après le rang de chaque entrée (`rank`) : ce qui est à retenir d'abord, les nouveautés ordinaires ensuite, les retouches
 * repliées. Ce qui ne concerne que l'équipe gauloise (« staff ») reste dans le fichier et ne paraît ni sur le site ni sur Discord.
 * Le point qui signale une mise à jour parue depuis le dernier coup d'œil se calcule dans le navigateur du visiteur :
 * il n'y garde qu'une marque, et rien ne quitte l'appareil.
 */
import type { Nouveaute } from "./schemas";

export const NOUVEAUTES_KEY = "gal-nouveautes";
/** Le panneau de l'en-tête : les dernières mises à jour, la page donne les autres. */
export const NOUVEAUTES_IN_PANEL = 3;
/** La page montre des journées entières jusqu'à ce nombre d'entrées à lire au moins, et replie les plus anciennes. */
export const NOUVEAUTES_FIRST = 20;

export const KIND_LABELS: Record<Nouveaute["kind"], string> = {
  nouveau: "Nouveau",
  ameliore: "Amélioré",
  corrige: "Corrigé",
  retire: "Retiré",
};

/** Une entrée que lisent les joueurs : tout sauf ce qui ne concerne que l'équipe gauloise. */
export const isForPlayers = (entry: Nouveaute): boolean => entry.rank !== "staff";
/** Une entrée à lire : à retenir ou ordinaire. Ni une retouche, ni une entrée de l'équipe. */
export const isHeadline = (entry: Nouveaute): boolean => entry.rank === undefined || entry.rank === "top";

export interface NewsDay {
  /** « AAAA-MM-JJ », le jour de la mise en ligne à Paris. */
  date: string;
  /** Tout ce que la page montre ce jour-là, dans l'ordre de la page : à retenir, ordinaires, puis retouches. */
  entries: Nouveaute[];
  /** À retenir par les joueurs. */
  top: Nouveaute[];
  /** Les nouveautés ordinaires. */
  usual: Nouveaute[];
  /** Les retouches et corrections, repliées. */
  minor: Nouveaute[];
}

/**
 * Range les entrées des joueurs par jour, du plus récent au plus ancien. Dans une journée, ce qui est à retenir vient d'abord,
 * puis les nouveautés ordinaires, puis les retouches ; dans chaque groupe, l'ordre du fichier est gardé.
 * Les entrées de l'équipe gauloise sont écartées, et un jour qui n'avait qu'elles ne paraît pas.
 */
export function newsDays(entries: Nouveaute[]): NewsDay[] {
  const days: NewsDay[] = [];
  for (const entry of entries.filter(isForPlayers).sort((a, b) => b.date.localeCompare(a.date))) {
    let day = days.at(-1);
    if (day?.date !== entry.date) {
      day = { date: entry.date, entries: [], top: [], usual: [], minor: [] };
      days.push(day);
    }
    (entry.rank === "top" ? day.top : entry.rank === "minor" ? day.minor : day.usual).push(entry);
  }
  for (const day of days) day.entries = [...day.top, ...day.usual, ...day.minor];
  return days;
}

/** Le nombre d'entrées à lire d'une journée, sans ses retouches. */
export const headlineCount = (day: NewsDay): number => day.top.length + day.usual.length;

/** Les journées montrées d'abord, jusqu'à `first` entrées à lire au moins, et les plus anciennes, à replier. Une journée n'est jamais coupée. */
export function splitDays(days: NewsDay[], first = NOUVEAUTES_FIRST): { shown: NewsDay[]; folded: NewsDay[] } {
  let count = 0;
  let cut = 0;
  while (cut < days.length && count < first) {
    const day = days[cut];
    count += day ? headlineCount(day) : 0;
    cut++;
  }
  return { shown: days.slice(0, cut), folded: days.slice(cut) };
}

/** Les dernières entrées à lire, du jour le plus récent au plus ancien, celles à retenir d'abord : ni retouche, ni entrée de l'équipe. */
export const latestNews = (entries: Nouveaute[], count = NOUVEAUTES_IN_PANEL): Nouveaute[] =>
  newsDays(entries)
    .flatMap((d) => [...d.top, ...d.usual])
    .slice(0, count);

/**
 * La marque de la dernière mise à jour : le jour de la dernière entrée à lire et le nombre d'entrées à lire de ce jour.
 * Elle change dès qu'une telle entrée paraît en tête, pas quand on corrige un texte, ni pour une retouche ou une entrée
 * de l'équipe gauloise : le point ne s'allume que pour ce qui compte. Retirer une entrée du dernier jour la change aussi :
 * le point se rallume alors chez tout le monde, une fois. `null` : aucune entrée à lire.
 */
export function newsMarker(entries: Nouveaute[]): string | null {
  const headlines = entries.filter(isHeadline);
  const date = headlines.reduce<string | null>((latest, e) => (latest === null || e.date > latest ? e.date : latest), null);
  return date === null ? null : `${date}/${headlines.filter((e) => e.date === date).length}`;
}

/** « 1 retouche », « 12 retouches et corrections » : le libellé du pli d'une journée. */
export function minorWords(minor: Nouveaute[]): string {
  const fixes = minor.some((e) => e.kind === "corrige");
  const others = minor.some((e) => e.kind !== "corrige");
  const n = minor.length;
  if (fixes && !others) return n > 1 ? `${n} corrections` : "1 correction";
  if (!fixes) return n > 1 ? `${n} retouches` : "1 retouche";
  return `${n} retouches et corrections`;
}

/**
 * Le point de l'en-tête, d'après la marque gardée dans le navigateur.
 * À la première visite, rien n'est nouveau pour le visiteur : la marque est retenue, sans point.
 * Ensuite, le point s'allume quand une mise à jour est parue depuis, et s'éteint quand il ouvre les nouveautés.
 */
export function newsDot(stored: string | null, marker: string | null): { dot: boolean; remember: boolean } {
  if (marker === null) return { dot: false, remember: false };
  if (stored === null) return { dot: false, remember: true };
  return { dot: stored !== marker, remember: false };
}

const NBSP = String.fromCharCode(0xa0);

/**
 * La typographie française d'un texte écrit avec des espaces ordinaires : une espace insécable
 * entre les milliers, à l'intérieur des guillemets et devant « : ; ! ? ». Le texte ne se coupe plus là en fin de ligne.
 * L'espace insécable existe dans nos polices, voir `src/lib/nombre.ts`.
 */
export function typo(text: string): string {
  return text
    .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NBSP}`)
    .replace(/« /g, `«${NBSP}`)
    .replace(/ (?=[»:;!?])/g, NBSP);
}

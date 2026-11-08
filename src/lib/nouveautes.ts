/**
 * Les nouveautés du site : chaque mise à jour, expliquée simplement (`content/nouveautes.json`).
 * Le bouton de l'en-tête en montre les dernières, la page `/nouveautes` les montre toutes, par jour.
 * Le point qui signale une mise à jour parue depuis le dernier coup d'œil se calcule dans le navigateur du visiteur :
 * il n'y garde qu'une marque, et rien ne quitte l'appareil.
 */
import type { Nouveaute } from "./schemas";

export const NOUVEAUTES_KEY = "gal-nouveautes";
/** Le panneau de l'en-tête : les dernières mises à jour, la page donne les autres. */
export const NOUVEAUTES_IN_PANEL = 3;
/** La page montre des journées entières jusqu'à ce nombre d'entrées au moins, et replie les plus anciennes. */
export const NOUVEAUTES_FIRST = 8;

export const KIND_LABELS: Record<Nouveaute["kind"], string> = {
  nouveau: "Nouveau",
  ameliore: "Amélioré",
  corrige: "Corrigé",
  retire: "Retiré",
};

export interface NewsDay {
  /** « AAAA-MM-JJ », le jour de la mise en ligne à Paris. */
  date: string;
  entries: Nouveaute[];
}

/** Range les entrées par jour, du plus récent au plus ancien. Dans une journée, l'ordre du fichier est gardé. */
export function newsDays(entries: Nouveaute[]): NewsDay[] {
  const days: NewsDay[] = [];
  for (const entry of [...entries].sort((a, b) => b.date.localeCompare(a.date))) {
    const last = days.at(-1);
    if (last?.date === entry.date) last.entries.push(entry);
    else days.push({ date: entry.date, entries: [entry] });
  }
  return days;
}

/** Les journées montrées d'abord, jusqu'à `first` entrées au moins, et les plus anciennes, à replier. Une journée n'est jamais coupée. */
export function splitDays(days: NewsDay[], first = NOUVEAUTES_FIRST): { shown: NewsDay[]; folded: NewsDay[] } {
  let count = 0;
  let cut = 0;
  while (cut < days.length && count < first) {
    count += days[cut]?.entries.length ?? 0;
    cut++;
  }
  return { shown: days.slice(0, cut), folded: days.slice(cut) };
}

/** Les dernières mises à jour, de la plus récente à la plus ancienne. */
export const latestNews = (entries: Nouveaute[], count = NOUVEAUTES_IN_PANEL): Nouveaute[] => newsDays(entries).flatMap((d) => d.entries).slice(0, count);

/**
 * La marque de la dernière mise à jour : son jour et le nombre d'entrées de ce jour.
 * Elle change dès qu'une entrée paraît en tête, pas quand on corrige le texte d'une entrée. Retirer une entrée du dernier jour
 * la change aussi : le point se rallume alors chez tout le monde, une fois. `null` : aucune entrée.
 */
export function newsMarker(entries: Nouveaute[]): string | null {
  const top = newsDays(entries)[0];
  return top ? `${top.date}/${top.entries.length}` : null;
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

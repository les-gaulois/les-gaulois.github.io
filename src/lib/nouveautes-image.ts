/**
 * L'image des nouveautés du site : une ligne par entrée de `content/nouveautes.json`, sa sorte dans le badge (« Nouveau »,
 * « Amélioré »…) et son titre. Dix au plus, les autres sont comptées. La phrase de chacune reste sur la page Nouveautés, où
 * mène le bouton : dix phrases feraient une image illisible. Même dessin que les autres images du robot (`salon-image.ts`).
 * Chargée seulement au moment d'envoyer : si elle ne se dessine pas, le message part en texte.
 */
import { fmtLongDay } from "./format";
import type { GazetteCard, Measure } from "./gazette-image";
import { KIND_LABELS } from "./nouveautes";
import { MAX_ENTRIES, NEWS_TITLE, otherNewsWords } from "./nouveautes-discord";
import { shownAddress } from "./salon-discord";
import { MAX_ROWS, rowsCard } from "./salon-image";
import type { Nouveaute } from "./schemas";

export const NEWS_KICKER = "Mises à jour du site";

/** « Le 12 novembre 2026 », ou « Du 11 au 12 novembre 2026 » : les jours des entrées, écrits dans le fichier. */
export function newsPeriod(entries: readonly Nouveaute[]): string {
  const days = entries.map((entry) => entry.date).sort();
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return "";
  if (first === last) return `Le ${fmtLongDay(last)}`;
  // Dans le même mois, le premier jour s'écrit seul : « Du 11 au 12 novembre 2026 ».
  const from = first.slice(0, 7) === last.slice(0, 7) ? fmtLongDay(first).replace(/ .*$/, "") : first.slice(0, 4) === last.slice(0, 4) ? fmtLongDay(first).replace(/ \d{4}$/, "") : fmtLongDay(first);
  return `Du ${from} au ${fmtLongDay(last)}`;
}

/** Quoi écrire et où, à partir des entrées seules : se teste sans police. */
export function newsCard(entries: readonly Nouveaute[], siteUrl: string, measure: Measure): GazetteCard {
  const shown = entries.slice(0, MAX_ENTRIES);
  const rest = entries.length - shown.length;
  return rowsCard(
    {
      kicker: NEWS_KICKER,
      title: NEWS_TITLE,
      period: newsPeriod(entries),
      rows: shown.map((entry) => ({ badge: KIND_LABELS[entry.kind], strong: entry.kind === "nouveau", name: entry.title, detail: null })),
      compact: shown.length > MAX_ROWS,
      footnotes: rest > 0 ? [otherNewsWords(rest)] : [],
      address: shownAddress(siteUrl, "/nouveautes"),
      note: "",
      badgeWidth: 170,
    },
    measure,
  );
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. Les phrases y sont, tant qu'elles tiennent. */
export function newsImageAlt(entries: readonly Nouveaute[]): string {
  const head = `${NEWS_TITLE}. ${newsPeriod(entries)}.`;
  const full = entries.map((entry) => `${KIND_LABELS[entry.kind]} : ${entry.title}. ${entry.body}`).join(" ");
  if (`${head} ${full}`.length <= 1024) return `${head} ${full}`;
  return `${head} ${entries.map((entry) => `${KIND_LABELS[entry.kind]} : ${entry.title}.`).join(" ")}`.slice(0, 1024);
}

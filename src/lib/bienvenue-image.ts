/**
 * L'image de la bienvenue : une ligne par nouveau membre avec pseudo, l'heure de son arrivée dans le badge.
 * Au-delà de cinq, l'image compte les autres, que le message écrit. Les anonymes sont seulement comptés.
 * Chargée seulement au moment d'envoyer, comme les autres images du robot : si elle ne se dessine pas, le message part en texte.
 */
import { anonymousWords, otherNewcomersWords, WELCOME_TITLE, type Arrivals } from "./bienvenue-discord";
import { fmtDayAndTime } from "./format";
import type { GazetteCard, Measure } from "./gazette-image";
import { periodWords } from "./paliers-franchis";
import { shownAddress } from "./salon-discord";
import { MAX_ROWS, rowsCard } from "./salon-image";

const WELCOME_NOTE = "Seuls les pseudos publics sont écrits.";

/**
 * Quoi écrire et où : se teste sans police.
 * `allNamed` : le texte du message écrit tous les pseudos. Sinon, l'image ne renvoie pas au message pour les autres.
 */
export function welcomeCard(arrivals: Arrivals, tag: string, siteUrl: string, measure: Measure, allNamed: boolean): GazetteCard {
  const rest = arrivals.named.length - Math.min(arrivals.named.length, MAX_ROWS);
  const footnotes: string[] = [];
  if (rest > 0) footnotes.push(`${otherNewcomersWords(rest)}${allNamed ? " La liste complète est dans le message." : ""}`);
  if (arrivals.anonymous > 0) footnotes.push(anonymousWords(arrivals.anonymous, arrivals.named.length > 0));
  return rowsCard(
    {
      kicker: `Arrivées dans le clan [${tag}]`,
      title: WELCOME_TITLE,
      period: `Entre les relevés de la liste du ${fmtDayAndTime(arrivals.since)} et du ${fmtDayAndTime(arrivals.until)}`,
      rows: arrivals.named.map((p) => ({ badge: fmtDayAndTime(p.joinedAt), strong: true, name: p.username, detail: null })),
      footnotes,
      address: shownAddress(siteUrl, "/membres"),
      note: WELCOME_NOTE,
      badgeWidth: 280,
    },
    measure,
  );
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export function welcomeImageAlt(arrivals: Arrivals, tag: string): string {
  const parts = [`${WELCOME_TITLE} : arrivées dans le clan [${tag}] ${periodWords(arrivals)}.`];
  if (arrivals.named.length > 0) parts.push(`${arrivals.named.map((p) => `${p.username} (arrivée : ${fmtDayAndTime(p.joinedAt)})`).join(" ; ")}.`);
  if (arrivals.anonymous > 0) parts.push(anonymousWords(arrivals.anonymous, arrivals.named.length > 0));
  return parts.join(" ").slice(0, 1024);
}

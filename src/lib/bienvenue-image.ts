/**
 * L'image de la bienvenue : une ligne par nouveau membre avec pseudo, l'heure de son arrivée dans le badge. Les anonymes sont
 * seulement comptés.
 * Le message n'a pas de texte : l'image nomme tout le monde. Au-delà de cinq arrivées, tous les pseudos passent en pastilles,
 * sans l'heure de chacun : la période de l'en-tête la borne.
 * Chargée seulement au moment d'envoyer, comme les autres images du robot : si elle ne se dessine pas, le message part en texte.
 */
import { anonymousWords, otherNewcomersWords, STILL_HERE, STILL_HERE_SHORT, WELCOME_TITLE, type Arrivals } from "./bienvenue-discord";
import { fmtDayAndTime } from "./format";
import type { GazetteCard, Measure } from "./gazette-image";
import { periodWords } from "./paliers-franchis";
import { fittedAlt, shownAddress } from "./salon-discord";
import { MAX_CHIPS, MAX_ROWS, rowsCard } from "./salon-image";

const WELCOME_NOTE = "Seuls les pseudos publics sont écrits.";

/** Quoi écrire et où : se teste sans police. */
export function welcomeCard(arrivals: Arrivals, tag: string, siteUrl: string, measure: Measure): GazetteCard {
  const { named } = arrivals;
  const many = named.length > MAX_ROWS;
  const rest = many ? Math.max(0, named.length - MAX_CHIPS) : 0;
  const footnotes: string[] = [];
  if (rest > 0) footnotes.push(otherNewcomersWords(rest));
  if (arrivals.anonymous > 0) footnotes.push(anonymousWords(arrivals.anonymous, named.length > 0));
  return rowsCard(
    {
      // L'en-tête dit aussi qui est compté : sans texte dans le message, rien d'autre ne le dirait.
      kicker: `Arrivées dans le clan [${tag}], ${STILL_HERE_SHORT}`,
      title: WELCOME_TITLE,
      period: `Entre les relevés de la liste du ${fmtDayAndTime(arrivals.since)} et du ${fmtDayAndTime(arrivals.until)}`,
      rows: many ? [] : named.map((p) => ({ badge: fmtDayAndTime(p.joinedAt), strong: true, name: p.username, detail: null })),
      chips: many ? named.slice(0, MAX_CHIPS).map((p) => p.username) : [],
      footnotes,
      address: shownAddress(siteUrl, "/membres"),
      note: WELCOME_NOTE,
      badgeWidth: 280,
    },
    measure,
  );
}

/**
 * Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. Sans couper un pseudo : au-delà
 * de ce que Discord accepte, les autres sont comptés, et le compte des anonymes reste entier.
 */
export function welcomeImageAlt(arrivals: Arrivals, tag: string): string {
  const head = `${WELCOME_TITLE} : arrivées dans le clan [${tag}] ${periodWords(arrivals)}, ${STILL_HERE}.`;
  return fittedAlt(arrivals.named, (shown, rest) => {
    const names = shown.map((p) => `${p.username} (arrivée : ${fmtDayAndTime(p.joinedAt)})`).join(" ; ");
    return [head, ...(names ? [`${names}.`] : []), ...(rest > 0 ? [otherNewcomersWords(rest)] : []), ...(arrivals.anonymous > 0 ? [anonymousWords(arrivals.anonymous, arrivals.named.length > 0)] : [])].join(" ");
  });
}

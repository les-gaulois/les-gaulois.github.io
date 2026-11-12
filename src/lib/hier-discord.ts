/**
 * « Hier chez les Gaulois » : chaque matin, sur le salon de la gazette, le bilan de la veille.
 *
 * - Les parties et les victoires du jour de Paris, comptées comme les barres des jours de la page Progression (`dailySeries`) : chaque partie
 *   du clan relevée, au jour de son début. L'écart est donné avec le jour d'avant, s'il a des parties relevées.
 * - La plus longue série de victoires d'affilée dans la journée, dans l'ordre des débuts de partie, comme le record du clan
 *   (`clanRecords`) : une partie jouée seul contre des robots n'y compte pas. Une série en cours à minuit repart de zéro.
 * - La belle partie de la veille, la même que sur l'accueil (`bestGameOf`) : celle où le plus de Gaulois jouaient ensemble.
 *   Sans le nom de la carte : sa traduction française est sous licence CC BY-SA et demanderait un crédit dans le message.
 * - Le message attend que la collecte ait fini la journée (`completeThrough`) : un message posté ne se corrige pas.
 * - À partir de 9 h, jamais la nuit, une fois par jour. Une journée sans partie n'envoie rien : il n'y aurait rien à raconter.
 *   Un jour manqué n'est pas rattrapé.
 * - Le message est une image et un bouton, sans texte : le texte ne part que si l'image ne se dessine pas.
 */
import { z } from "zod";
import { alertsStarted } from "./alerts";
import { bestGameOf } from "./belle-partie";
import { imageMessage, postWithImage, textMessage } from "./discord-post";
import { fmtCount, fmtInt, fmtLongDay, fmtMinutes, fmtPct } from "./format";
import type { RenderedImage } from "./gazette-discord";
import type { JournalRow } from "./journal";
import { ParisDay, SEND_FROM_HOUR, sendWindow, siteLink } from "./salon-discord";
import type { StoredSession } from "./schemas";
import { winRate } from "./stats";
import { addDays, parisParts, WEEKDAYS_FR } from "./time";

export const HierState = z.object({
  /** Le dernier jour de Paris dont le bilan est parti, ou a été écarté faute de partie. */
  lastDay: ParisDay.nullable(),
});
export type HierState = z.infer<typeof HierState>;

export interface DayCount {
  day: string;
  games: number;
  wins: number;
}

export interface DayReport extends DayCount {
  /** Le jour d'avant. `null` : aucune partie relevée ce jour-là, donc pas d'écart. */
  previous: DayCount | null;
  /** La plus longue série de victoires d'affilée de la journée. 0 : aucune victoire. */
  streak: number;
  /** La belle partie du jour, comme sur l'accueil. `null` : aucune partie à plusieurs Gaulois. */
  best: JournalRow | null;
}

/** Les parties et les victoires d'un jour de Paris, comme `dailySeries`. */
export function dayCount(sessions: readonly StoredSession[], day: string): DayCount {
  let games = 0;
  let wins = 0;
  for (const s of sessions) {
    if (parisParts(s.gameStart).date !== day) continue;
    games++;
    if (s.hasWon) wins++;
  }
  return { day, games, wins };
}

/** La plus longue série de victoires d'affilée dans la journée, avec la règle des records du clan. */
export function longestStreak(sessions: readonly StoredSession[], day: string): number {
  const played = sessions.filter((s) => s.totalPlayerCount >= 2 && parisParts(s.gameStart).date === day).sort((a, b) => a.gameStart.localeCompare(b.gameStart));
  let current = 0;
  let best = 0;
  for (const s of played) {
    current = s.hasWon ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

/** Le bilan d'un jour. `rows` : le journal du clan, pour la belle partie. */
export function dayReport(sessions: readonly StoredSession[], rows: readonly JournalRow[], day: string): DayReport {
  const before = dayCount(sessions, addDays(day, -1));
  return { ...dayCount(sessions, day), previous: before.games > 0 ? before : null, streak: longestStreak(sessions, day), best: bestGameOf(rows, day) };
}

/** Le jour dont le bilan doit partir maintenant, ou pourquoi aucun. */
export function hierTarget(state: HierState | null, completeThrough: string | null, now: Date): { day: string | null; reason: string } {
  const day = addDays(parisParts(now).date, -1);
  if (state?.lastDay && state.lastDay >= day) return { day: null, reason: "le bilan d'hier est déjà parti" };
  const window = sendWindow(now, SEND_FROM_HOUR.hier, null);
  if (!window.open) return { day: null, reason: window.reason };
  if (!completeThrough || completeThrough < day) return { day: null, reason: "la collecte n'a pas encore fini la journée d'hier" };
  return { day, reason: "" };
}

/* ---------- Les mots du message, pour le texte et pour l'image ---------- */

const timeParis = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

export const HIER_TITLE = "Hier chez les Gaulois";

/** « Mardi 10 novembre ». */
export function dayTitle(day: string): string {
  const weekday = WEEKDAYS_FR[parisParts(`${day}T12:00:00.000Z`).weekday] ?? "";
  return `${weekday} ${fmtLongDay(day).replace(/ \d{4}$/, "")}`.trim();
}

/** « 41 victoires sur 66 parties, soit 62,1 % ». */
export const resultWords = ({ games, wins }: DayCount) => `${fmtCount(wins, "victoire")} sur ${fmtCount(games, "partie")}, soit ${fmtPct(winRate(wins, games))}`;

/** « 8 victoires d'affilée ». */
export const streakWords = (streak: number) => `${fmtInt(streak)} victoires d'affilée`;

/** « à 22:39 », à l'heure de Paris. */
export const bestWhen = (row: JournalRow) => `à ${timeParis.format(new Date(row.at))}`;

/** « à 22:39 : 13 Gaulois ensemble, victoire en 41 min. » Sans détail lu, pas de durée. */
export function bestWords(row: JournalRow): string {
  const length = row.seconds === null ? "" : ` en ${fmtMinutes(row.seconds)}`;
  return `${bestWhen(row)} : ${fmtInt(row.gaulois)} Gaulois ensemble, ${row.won ? "victoire" : "défaite"}${length}.`;
}

export const HIER_NOTE = "Belle partie : celle où le plus de Gaulois jouaient ensemble.";

/** Le texte de secours. */
export function hierContent(report: DayReport, tag: string, siteUrl: string): string {
  const lines = [`**${HIER_TITLE}** · ${dayTitle(report.day)}`, `🎯 ${resultWords(report)}.`];
  if (report.streak >= 2) lines.push(`🔥 Plus longue série : ${streakWords(report.streak)}.`);
  if (report.best) lines.push(`⭐ Belle partie ${bestWords(report.best)}`);
  lines.push(`[Voir les dernières parties](<${siteLink(siteUrl, "/parties")}>)`, `-# Parties du clan sous le tag [${tag}], heure de Paris.${report.best ? ` ${HIER_NOTE}` : ""}`);
  return lines.join("\n");
}

/** Le message. `image` : le fichier joint et sa description, avec un bouton, sans texte. Sans elle, le secours en texte, sans bouton. */
export function hierPayload(report: DayReport, tag: string, siteUrl: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  if (!image) return textMessage(siteUrl, hierContent(report, tag, siteUrl));
  return imageMessage(siteUrl, image, [{ label: "Voir les dernières parties", url: siteLink(siteUrl, "/parties") }]);
}

export interface HierSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  report: DayReport;
  /** Dessine l'image. Si elle échoue, le message part en texte. */
  renderImage: (report: DayReport) => Promise<RenderedImage>;
  tag: string;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie le message en image, ou en texte si elle ne se dessine pas : voir `postWithImage`. Un échec se retente au passage suivant. */
export function sendHier({ link, report, renderImage, tag, siteUrl, fetch, log }: HierSendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Hier",
    text: hierPayload(report, tag, siteUrl, null),
    image: async () => {
      const { png, alt } = await renderImage(report);
      const filename = "hier-chez-les-gaulois.png";
      return { payload: hierPayload(report, tag, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

export interface HierPassDeps {
  /** L'état noté au passage précédent. `null` : premier passage. */
  stored: HierState | null;
  /** Les sessions du clan. `null` : un mois illisible, le bilan serait faux. */
  sessions: readonly StoredSession[] | null;
  /** Le journal du clan, pour la belle partie. */
  rows: readonly JournalRow[];
  /** Le dernier jour que la collecte a fini (`meta.sessions.completeThrough`). */
  completeThrough: string | null;
  /** La dernière édition de la gazette envoyée : rien ne part avant la première du vrai salon. */
  gazetteLastSent: string | null;
  now: Date;
  send: (report: DayReport) => Promise<boolean>;
  log: (line: string) => void;
}

/** Un passage du robot. `state` : l'état à écrire, `null` s'il n'a pas changé. Après un échec, le passage suivant réessaie. */
export async function hierPass({ stored, sessions, rows, completeThrough, gazetteLastSent, now, send, log }: HierPassDeps): Promise<{ state: HierState | null; failed: boolean }> {
  if (!alertsStarted(gazetteLastSent)) {
    log("Hier : les messages du jour commencent après la gazette du lundi 9 novembre, premier message du salon.");
    return { state: null, failed: false };
  }
  const { day, reason } = hierTarget(stored, completeThrough, now);
  if (!day) {
    log(`Hier : rien à envoyer (${reason}).`);
    return { state: null, failed: false };
  }
  if (!sessions) {
    log("::warning::Hier : un mois de sessions est illisible, le bilan serait faux. Rien n'est envoyé.");
    return { state: null, failed: false };
  }
  const report = dayReport(sessions, rows, day);
  if (report.games === 0) {
    log("Hier : aucune partie relevée hier, rien n'est envoyé.");
    return { state: { lastDay: day }, failed: false };
  }
  if (!(await send(report))) return { state: null, failed: true };
  log(`Hier : bilan du ${day} envoyé.`);
  return { state: { lastDay: day }, failed: false };
}

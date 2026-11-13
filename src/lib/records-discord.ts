/**
 * Les alertes de record : un message sur Discord quand le clan bat un de ses records, sur le même salon que la gazette.
 *
 * Peu de messages, et seulement du vrai :
 * - Un record est battu quand sa valeur dépasse strictement celle annoncée. L'égaler n'envoie rien.
 * - Les records battus au même passage partent dans un seul message, au plus un par jour à Paris, jour et nuit.
 *   Un autre record battu plus tard le même jour attend le lendemain.
 * - Au premier passage, les records du moment servent de départ : rien n'est envoyé. Sans record calculable, rien n'est noté.
 * - Un record annoncé le reste même si l'envoi suivant échoue : le passage suivant réessaie sans rien oublier.
 * - Après un envoi, seuls les records battus deviennent les records annoncés : une valeur lue trop basse un jour ne fait jamais
 *   redescendre un record annoncé, donc ne peut pas le faire « battre » de nouveau.
 * Les records eux-mêmes viennent de `clanRecords` (`results.ts`) : ce module compare, il ne recalcule rien.
 * Le message est une image (`records-image.ts`) et un bouton, sans texte : le texte ne part que si elle ne se dessine pas.
 */
import { z } from "zod";
import { alertsStarted } from "./alerts";
import { imageMessage, postWithImage, textMessage } from "./discord-post";
import { fmtCount, fmtDate, fmtDateTime, fmtInt } from "./format";
import { escapeDiscord, type RenderedImage } from "./gazette-discord";
import { RECORD_KEYS, type RecordKey } from "./records-battus";
import type { ClanRecords } from "./results";
import { parisParts } from "./time";

/** Un seul message de record par jour à Paris. */
export const MAX_RECORD_ALERTS_PER_DAY = 1;
const SENT_KEPT_MS = 48 * 3_600_000;

const count = z.number().int().nonnegative();
const iso = z.iso.datetime();
const RecordsShape = z.object({
  streak: z.object({ wins: count, endedAt: iso }),
  bestDay: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), wins: count, games: count }),
  biggestGroup: z.object({ players: count, at: iso }),
  mostTeams: z.object({ teams: count, players: count, at: iso }),
});

export const RecordAlertState = z.object({
  /** Les records annoncés, ou ceux du premier passage. */
  announced: RecordsShape,
  /** Les envois gardés, pour compter ceux du jour. */
  sent: z.array(iso),
});
export type RecordAlertState = z.infer<typeof RecordAlertState>;

/** Un état illisible n'est pas une raison de se taire pour toujours : il est signalé, et on repart des records du moment. */
export function parseRecordAlertState(raw: string | null): { state: RecordAlertState | null; warning: string | null } {
  if (raw === null) return { state: null, warning: null };
  try {
    const parsed = RecordAlertState.safeParse(JSON.parse(raw));
    return parsed.success ? { state: parsed.data, warning: null } : { state: null, warning: "l'état des alertes de record est illisible, on repart des records du moment" };
  } catch {
    return { state: null, warning: "l'état des alertes de record est illisible, on repart des records du moment" };
  }
}

/** La valeur qui fait le record : c'est elle qu'il faut dépasser. */
export function recordValue(records: ClanRecords, key: RecordKey): number {
  switch (key) {
    case "streak":
      return records.streak.wins;
    case "bestDay":
      return records.bestDay.wins;
    case "biggestGroup":
      return records.biggestGroup.players;
    case "mostTeams":
      return records.mostTeams.teams;
  }
}

export interface BeatenRecord {
  key: RecordKey;
  before: number;
  after: number;
}

export interface RecordAlert {
  beaten: BeatenRecord[];
  records: ClanRecords;
}

export interface RecordAlertPlan {
  /** L'état à garder. `null` : il n'y a toujours rien à noter. */
  state: RecordAlertState | null;
  alert: RecordAlert | null;
  reason: string;
}

/** Décide s'il faut envoyer maintenant. Les records annoncés ne changent qu'après un envoi accepté (`markRecordsSent`). */
export function planRecordAlert(stored: RecordAlertState | null, records: ClanRecords | null, now: Date): RecordAlertPlan {
  // Sans record calculable, rien ne bouge : un zéro de remplacement serait « battu » au passage suivant par les vrais records.
  if (!records) return { state: stored, alert: null, reason: "aucun record calculable" };
  if (!stored) return { state: { announced: records, sent: [] }, alert: null, reason: "premier passage : les records du moment servent de départ" };
  const beaten = RECORD_KEYS.flatMap((key): BeatenRecord[] => {
    const before = recordValue(stored.announced, key);
    const after = recordValue(records, key);
    return after > before ? [{ key, before, after }] : [];
  });
  if (beaten.length === 0) return { state: stored, alert: null, reason: "aucun record battu" };
  const { date } = parisParts(now);
  const today = stored.sent.filter((at) => parisParts(at).date === date).length;
  if (today >= MAX_RECORD_ALERTS_PER_DAY) return { state: stored, alert: null, reason: "déjà une alerte de record aujourd'hui : la suivante attend demain" };
  return { state: stored, alert: { beaten, records }, reason: "" };
}

/** Après un envoi accepté : les records battus deviennent ceux annoncés, les autres ne bougent pas, et l'envoi compte pour la journée. */
export function markRecordsSent(state: RecordAlertState, alert: RecordAlert, now: Date): RecordAlertState {
  const beaten = new Set(alert.beaten.map((b) => b.key));
  const pick = <K extends RecordKey>(key: K): ClanRecords[K] => (beaten.has(key) ? alert.records[key] : state.announced[key]);
  return {
    announced: { streak: pick("streak"), bestDay: pick("bestDay"), biggestGroup: pick("biggestGroup"), mostTeams: pick("mostTeams") },
    sent: [...state.sent.filter((at) => now.getTime() - Date.parse(at) < SENT_KEPT_MS), now.toISOString()],
  };
}

/* ---------- Les mots du message, pour l'image et pour le texte ---------- */

export const RECORD_LABELS: Record<RecordKey, string> = {
  streak: "Plus longue série de victoires",
  bestDay: "Meilleure journée",
  biggestGroup: "Le plus de Gaulois dans une partie gagnée",
  mostTeams: "Victoire avec le plus d'équipes en jeu",
};

/** La nouvelle marque et sa date : « 13 victoires d'affilée, la dernière le 12 nov. 2026 ». */
export function recordMark(key: RecordKey, records: ClanRecords): string {
  switch (key) {
    case "streak":
      return `${fmtCount(records.streak.wins, "victoire")} d'affilée, la dernière le ${fmtDate(records.streak.endedAt)}`;
    case "bestDay":
      return `${fmtCount(records.bestDay.wins, "victoire")} sur ${fmtCount(records.bestDay.games, "partie")}, le ${fmtDate(`${records.bestDay.date}T12:00:00Z`)}`;
    case "biggestGroup":
      return `${fmtCount(records.biggestGroup.players, "joueur")}, le ${fmtDate(records.biggestGroup.at)}`;
    case "mostTeams":
      return `${fmtCount(records.mostTeams.teams, "équipe")}, ${fmtCount(records.mostTeams.players, "joueur")} dans la partie, le ${fmtDate(records.mostTeams.at)}`;
  }
}

/** L'ancienne marque : « Avant : 12 ». */
export const recordBefore = (before: number) => `Avant : ${fmtInt(before)}`;

/** Une ligne par record battu : la nouvelle marque, sa date, et l'ancienne marque. */
export const recordLine = ({ key, before }: BeatenRecord, records: ClanRecords) => `${RECORD_LABELS[key]} : ${recordMark(key, records)}. ${recordBefore(before)}.`;

export const recordHeadline = (alert: RecordAlert, tag: string) => `[${tag}] bat ${alert.beaten.length > 1 ? `${fmtInt(alert.beaten.length)} records` : "un record"} du clan`;

/** Ce que comptent les records. */
export const RECORD_KICKER = "Parties publiques en équipe sous le tag";
/** « Depuis le 10 avr. 2026, tous joueurs du clan confondus ». */
export const recordScope = (archiveStart: string) => `Depuis le ${fmtDate(`${archiveStart}T12:00:00Z`)}, tous joueurs du clan confondus`;
/** « Collecte du 12 nov. 2026, 12:53 ». */
export const recordCollected = (coveredUntil: string) => `Collecte du ${fmtDateTime(coveredUntil)}`;

/**
 * Le message. `image` : le fichier joint et sa description, avec un bouton vers la page, sans texte. Sans elle, le secours en
 * texte : une ligne par record, un lien vers la page, et la source en petit. Personne n'est mentionné.
 */
export function recordPayload(alert: RecordAlert, tag: string, siteUrl: string, archiveStart: string, coveredUntil: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  if (image) return imageMessage(site, image, [{ label: "Voir les records", url: `${site}/records` }]);
  const content = [
    `**${recordHeadline(alert, escapeDiscord(tag))}**`,
    ...alert.beaten.map((b) => `• ${recordLine(b, alert.records)}`),
    `[Les records sur le site](<${site}/records>)`,
    `-# Depuis le ${fmtDate(`${archiveStart}T12:00:00Z`)}, parties publiques en équipe sous le tag, tous joueurs du clan confondus. ${recordCollected(coveredUntil)}.`,
  ].join("\n");
  return textMessage(site, content);
}

export interface RecordSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  alert: RecordAlert;
  /** Dessine l'image. Si elle échoue, le message part en texte. */
  renderImage: (alert: RecordAlert) => Promise<RenderedImage>;
  tag: string;
  siteUrl: string;
  /** Le jour où commencent les archives du clan, AAAA-MM-JJ. */
  archiveStart: string;
  /** L'heure de la collecte qui a donné ces records. */
  coveredUntil: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/**
 * Envoie le message en image, ou en texte si elle ne se dessine pas : voir `postWithImage`. `true` : Discord l'a accepté ; une
 * panne se retente au passage suivant. Le lien vaut un mot de passe pour ce salon : il n'est écrit dans aucun message.
 */
export function sendRecords({ link, alert, renderImage, tag, siteUrl, archiveStart, coveredUntil, fetch, log }: RecordSendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Records",
    text: recordPayload(alert, tag, siteUrl, archiveStart, coveredUntil, null),
    image: async () => {
      const { png, alt } = await renderImage(alert);
      const filename = "record-du-clan.png";
      return { payload: recordPayload(alert, tag, siteUrl, archiveStart, coveredUntil, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

export interface RecordPassDeps {
  stored: RecordAlertState | null;
  records: ClanRecords | null;
  /** Les fichiers de sessions illisibles à ce passage : des records calculés sans eux seraient faux. */
  unreadable: readonly string[];
  /** La dernière édition de la gazette envoyée : comme les alertes de place, celles-ci attendent la première du vrai salon. */
  gazetteLastSent: string | null;
  now: Date;
  /** Envoie le message. `true` : Discord l'a accepté. */
  send: (alert: RecordAlert) => Promise<boolean>;
  log: (line: string) => void;
}

export interface RecordPassResult {
  /** L'état à écrire. `null` : rien n'a changé. */
  state: RecordAlertState | null;
  failed: boolean;
}

/** Un passage du robot : décide, envoie au besoin, et rend l'état à noter. */
export async function recordAlertPass({ stored, records, unreadable, gazetteLastSent, now, send, log }: RecordPassDeps): Promise<RecordPassResult> {
  if (!alertsStarted(gazetteLastSent)) {
    log("Records : les alertes commencent après la gazette du lundi 9 novembre, premier message du salon.");
    return { state: null, failed: false };
  }
  if (unreadable.length > 0) {
    log(`::warning::Records : ${unreadable.join(", ")} illisible, rien n'est comparé ni noté : les records seraient faux.`);
    return { state: null, failed: false };
  }
  const plan = planRecordAlert(stored, records, now);
  if (!plan.alert) {
    log(`Records : rien à envoyer (${plan.reason}).`);
    return { state: plan.state === stored ? null : plan.state, failed: false };
  }
  if (!plan.state) return { state: null, failed: false };
  if (!(await send(plan.alert))) return { state: null, failed: true };
  log(`Records : ${plan.alert.beaten.map((b) => `${b.key} ${b.before} puis ${b.after}`).join(", ")}, envoyé.`);
  return { state: markRecordsSent(plan.state, plan.alert, now), failed: false };
}

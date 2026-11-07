/**
 * L'envoi de la gazette sur un salon Discord, par un lien d'envoi automatique (webhook) que le clan crée lui-même.
 * Sans ce lien, rien ne part. Le message reprend les phrases de la page, sans aucun pseudo, et ne peut mentionner personne.
 */
import { z } from "zod";
import { fmtInt } from "./format";
import { editionLead, type GazetteEdition, territoryDetails, weekLabel } from "./gazette";
import { addDays, parisParts } from "./time";

/** Une édition paraît le lundi après 6 h UTC, soit 7 ou 8 h à Paris : le message attend ce moment de la matinée, heure de Paris. */
export const SEND_FROM_HOUR = 9;
/**
 * La liste des membres et le film de la carte se relisent toutes les 20 h au moins, donc à une heure qui glisse.
 * Le lundi, le message les attend jusqu'à cette heure. Après, il part sans ce qui manque, et il ne repart jamais ensuite.
 */
export const WAIT_UNTIL_HOUR = 21;

export const GazetteSendState = z.object({
  /** Le lundi de la dernière édition envoyée. */
  lastSent: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sentAt: z.iso.datetime(),
});
export type GazetteSendState = z.infer<typeof GazetteSendState>;

/**
 * Seul un lien de Discord est accepté : une valeur erronée ne doit envoyer la gazette nulle part ailleurs.
 * Les versions d'essai de l'application (ptb, canary) copient le même lien sous leur propre adresse.
 */
export const isWebhookUrl = (url: string) => /^https:\/\/(?:(?:ptb|canary)\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url);

/** Le texte du message : les mêmes chiffres que la page, datés, sans commentaire. */
export function gazetteMessage(edition: GazetteEdition, tag: string, siteUrl: string): string {
  const lines = [`**La gazette de [${tag}] : semaine ${weekLabel(edition)}**`, editionLead(edition, tag)];
  // Un relevé fait dans la journée serait bientôt démenti par la page, et un message ne se corrige pas : seule la fin d'une journée part.
  if (edition.territory?.end.final) {
    const [now, change] = territoryDetails(edition.territory);
    lines.push(`Carte des clans : ${fmtInt(edition.territory.end.pixels)} ${now}${change ? ` ${change}` : ""}`);
  }
  if (edition.arrivals) lines.push(`Arrivées encore dans le clan : ${fmtInt(edition.arrivals.count)}.`);
  lines.push(`${siteUrl.replace(/\/$/, "")}/gazette`);
  return lines.join("\n");
}

export type SendDecision = { send: false; reason: string } | { send: true; edition: GazetteEdition };

/** La dernière édition seulement, une seule fois : le premier envoi ne rattrape pas les semaines passées. */
export function editionToSend(editions: readonly GazetteEdition[], lastSent: string | null, now: Date): SendDecision {
  const latest = editions[0];
  if (!latest) return { send: false, reason: "aucune édition" };
  if (lastSent !== null && latest.from <= lastSent) return { send: false, reason: `édition du ${latest.from} déjà envoyée` };
  // Ce clan joue des centaines de parties par semaine : une semaine vide trahit un fichier manquant bien avant une vraie semaine sans partie.
  if (latest.totals.games === 0) return { send: false, reason: "aucune partie dans cette édition" };
  const { date, hour } = parisParts(now);
  if (date === addDays(latest.to, 1)) {
    if (hour < SEND_FROM_HOUR) return { send: false, reason: `avant ${SEND_FROM_HOUR} h` };
    if (hour < WAIT_UNTIL_HOUR) {
      if (!latest.arrivals) return { send: false, reason: "en attente de la liste des membres" };
      if (!latest.territory?.end.final || latest.territory.end.date !== latest.to) return { send: false, reason: "en attente du film de la carte" };
    }
  }
  return { send: true, edition: latest };
}

export interface SendDeps {
  webhook: string | undefined;
  editions: readonly GazetteEdition[];
  /** Les mois de sessions illisibles : avec eux, les totaux seraient faux. */
  unreadable: readonly string[];
  lastSent: string | null;
  tag: string;
  siteUrl: string;
  now: Date;
  fetch: typeof fetch;
  log: (line: string) => void;
}

export type SendResult = { status: "off" | "invalid" | "nothing" | "failed" } | { status: "sent"; state: GazetteSendState };

/**
 * Envoie la dernière édition si elle ne l'a pas encore été. Un échec se retente au passage suivant.
 * Le lien vaut un mot de passe pour ce salon : il n'est écrit dans aucun message, même d'erreur.
 */
export async function sendLatestGazette({ webhook, editions, unreadable, lastSent, tag, siteUrl, now, fetch: post, log }: SendDeps): Promise<SendResult> {
  // Un copier-coller peut laisser une espace ou un retour à la ligne autour du lien.
  const link = webhook?.trim();
  if (!link) {
    log("Pas de lien Discord pour la gazette : rien à envoyer.");
    return { status: "off" };
  }
  if (!isWebhookUrl(link)) {
    log("::warning::Gazette : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
    return { status: "invalid" };
  }
  if (unreadable.length > 0) {
    log(`::warning::Gazette : ${unreadable.join(", ")} illisible, rien n'est envoyé : les totaux seraient faux.`);
    return { status: "invalid" };
  }
  const decision = editionToSend(editions, lastSent, now);
  if (!decision.send) {
    log(`Gazette : rien à envoyer (${decision.reason}).`);
    return { status: "nothing" };
  }
  const body = JSON.stringify({ content: gazetteMessage(decision.edition, tag, siteUrl), allowed_mentions: { parse: [] } });
  try {
    // Une redirection changerait l'envoi en simple lecture, qui répondrait « OK » sans poster de message.
    const response = await post(link, { method: "POST", headers: { "Content-Type": "application/json" }, body, redirect: "error" });
    if (!response.ok) {
      log(`::warning::Gazette : Discord a répondu ${response.status}. Nouvel essai au prochain passage.`);
      return { status: "failed" };
    }
  } catch {
    log("::warning::Gazette : Discord n'a pas répondu. Nouvel essai au prochain passage.");
    return { status: "failed" };
  }
  log(`Gazette : édition du ${decision.edition.from} envoyée.`);
  return { status: "sent", state: { lastSent: decision.edition.from, sentAt: now.toISOString() } };
}

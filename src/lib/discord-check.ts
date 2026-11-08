/**
 * La vérification du lien Discord, sans rien envoyer : le robot demande à Discord si le webhook existe.
 * Une seule fois par nouveau lien. Le journal de l'Action dit alors le nom du webhook et sa date de création :
 * de quoi reconnaître celui que l'on vient de créer. Rien ne part dans le salon.
 * Le lien vaut un mot de passe pour ce salon : il n'est écrit dans aucun message, et la réponse de Discord, qui le contient, non plus.
 */
import { z } from "zod";
import { fmtDayAndTime } from "./format";

/** Le début des identifiants de Discord : le 1er janvier 2015, en millisecondes. */
const DISCORD_EPOCH = 1_420_070_400_000n;
/** Les réponses d'un lien faux ou d'un webhook supprimé. */
const UNKNOWN_LINK = [400, 401, 404];

export const LinkCheckState = z.object({
  /** La création du webhook vérifié, lue dans son identifiant. Un autre lien a une autre date : il est vérifié à son tour. */
  webhookCreatedAt: z.iso.datetime(),
  checkedAt: z.iso.datetime(),
});
export type LinkCheckState = z.infer<typeof LinkCheckState>;

/** La date de création d'un webhook, écrite dans son identifiant. `null` : lien sans identifiant lisible. */
export function webhookCreatedAt(link: string): Date | null {
  const id = link.match(/\/api\/webhooks\/(\d{1,20})\//)?.[1];
  if (!id) return null;
  return new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH));
}

/** Le nom du webhook, réduit aux lettres, chiffres et ponctuation simple : il ne peut rien glisser dans le journal de l'Action. */
const safeName = (name: unknown) =>
  typeof name === "string" ? name.replace(/[^\p{L}\p{N} '’.-]/gu, "").trim().slice(0, 40) : "";

export interface LinkCheckDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  stored: LinkCheckState | null;
  now: Date;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/**
 * Vérifie le lien s'il est nouveau. Rend l'état à noter, `null` s'il n'y a rien à noter.
 * `ok: false` : Discord ne reconnaît pas le lien, ou ne répond pas ; le passage suivant réessaie.
 */
export async function checkWebhookLink({ link, stored, now, fetch: get, log }: LinkCheckDeps): Promise<{ state: LinkCheckState | null; ok: boolean }> {
  const created = webhookCreatedAt(link);
  if (!created) {
    log("::warning::Lien Discord : son identifiant est illisible, rien n'est vérifié.");
    return { state: null, ok: false };
  }
  if (stored?.webhookCreatedAt === created.toISOString()) {
    log(`Lien Discord déjà vérifié : webhook créé le ${fmtDayAndTime(stored.webhookCreatedAt)}.`);
    return { state: null, ok: true };
  }
  try {
    // Une simple lecture : Discord ne poste rien. Une redirection n'est pas suivie.
    const response = await get(link, { method: "GET", redirect: "error" });
    if (!response.ok) {
      // Un lien faux ou supprimé répond 400, 401 ou 404. Une limite (429) ou une panne de Discord ne dit rien du lien.
      log(
        UNKNOWN_LINK.includes(response.status)
          ? `::warning::Lien Discord : Discord ne reconnaît pas ce lien (HTTP ${response.status}). Vérifiez le secret DISCORD_WEBHOOK_GAZETTE.`
          : `::warning::Lien Discord : Discord a répondu ${response.status}. Nouvel essai au prochain passage.`,
      );
      return { state: null, ok: false };
    }
    const name = safeName(((await response.json()) as { name?: unknown }).name);
    log(`::notice::Lien Discord vérifié sans rien envoyer : webhook « ${name || "sans nom"} », créé le ${fmtDayAndTime(created.toISOString())}, heure de Paris.`);
    return { state: { webhookCreatedAt: created.toISOString(), checkedAt: now.toISOString() }, ok: true };
  } catch {
    log("::warning::Lien Discord : Discord n'a pas répondu. Nouvel essai au prochain passage.");
    return { state: null, ok: false };
  }
}

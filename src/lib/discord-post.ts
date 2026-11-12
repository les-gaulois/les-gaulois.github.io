/**
 * L'envoi d'un message du robot sur un de ses salons : celui de la gazette, pour les alertes, les paliers franchis, les records
 * et les messages du jour, et celui des victoires.
 * Un message est une image et ses boutons, sans texte : demande du pilote le 12 novembre 2026 (« je veux que des images »).
 * Ce que le message dit est donc dessiné sur l'image, avec ce qui change la lecture d'un chiffre ou d'un rang : la date du
 * relevé, ce qui est compté, qui peut être cité. Sa description, que Discord lit aux lecteurs d'écran, le redit, et garde les
 * précisions que l'image n'a pas la place d'écrire. Un message posté ne se corrige pas : rien de cela ne doit se perdre.
 * Le texte ne sert plus que de secours, si l'image ne se dessine pas ou si Discord refuse ce format. La gazette garde son
 * propre envoi.
 * Le lien vaut un mot de passe pour ce salon : il n'est écrit dans aucun message, même d'erreur.
 */
import { REFUSED_FORMAT } from "./gazette-discord";
import { siteLink } from "./salon-discord";

export interface ImageMessage {
  payload: Record<string, unknown>;
  png: Uint8Array;
  filename: string;
}

/** Un bouton qui ouvre une page : le seul que Discord accepte d'un webhook. */
export interface LinkButton {
  label: string;
  url: string;
}

/** La limite de Discord pour le texte d'un bouton. */
export const BUTTON_LABEL_MAX = 80;

const avatar = (siteUrl: string) => siteLink(siteUrl, "/generated/icon-192.png");

/** Le message avec l'image : le fichier joint, sa description pour les lecteurs d'écran, et ses boutons. Aucun texte. */
export function imageMessage(siteUrl: string, image: { alt: string; filename: string }, buttons: readonly LinkButton[]): Record<string, unknown> {
  return {
    avatar_url: avatar(siteUrl),
    allowed_mentions: { parse: [] },
    attachments: [{ id: 0, filename: image.filename, description: image.alt }],
    components: [{ type: 1, components: buttons.map(({ label, url }) => ({ type: 2, style: 5, label: label.slice(0, BUTTON_LABEL_MAX), url })) }],
  };
}

/** Le message de secours, en texte seul et sans bouton. Il ne peut mentionner personne. */
export const textMessage = (siteUrl: string, content: string): Record<string, unknown> => ({ content, avatar_url: avatar(siteUrl), allowed_mentions: { parse: [] } });

export interface PostDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  /** Le message de secours, en texte seul, sans bouton. */
  text: Record<string, unknown>;
  /** Prépare le message avec l'image et ses boutons. S'il échoue, le texte part seul. */
  image: () => Promise<ImageMessage>;
  /** Le début des lignes du journal de l'Action, comme « Alertes ». */
  label: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** `true` : Discord a accepté le message. Un échec se retente au passage suivant. */
export async function postWithImage({ link, text, image, label, fetch: post, log }: PostDeps): Promise<boolean> {
  const requests: { url: string; init: RequestInit }[] = [{ url: link, init: { headers: { "Content-Type": "application/json" }, body: JSON.stringify(text) } }];
  try {
    const { payload, png, filename } = await image();
    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload));
    form.append("files[0]", new Blob([Buffer.from(png)], { type: "image/png" }), filename);
    // Sans ce réglage, Discord ignore les boutons.
    requests.unshift({ url: `${link}?with_components=true`, init: { body: form } });
  } catch (e) {
    log(`::warning::${label} : image impossible à dessiner (${e instanceof Error ? e.message : "erreur inconnue"}), le message part en texte.`);
  }
  try {
    for (const [i, request] of requests.entries()) {
      // Une redirection changerait l'envoi en simple lecture, qui répondrait « OK » sans poster de message.
      const response = await post(request.url, { method: "POST", redirect: "error", ...request.init });
      if (response.ok) return true;
      if (REFUSED_FORMAT.includes(response.status) && i < requests.length - 1) {
        log(`::warning::${label} : Discord a refusé le message avec image (${response.status}), il part en texte.`);
        continue;
      }
      log(`::warning::${label} : Discord a répondu ${response.status}. Nouvel essai au prochain passage.`);
      return false;
    }
  } catch {
    log(`::warning::${label} : Discord n'a pas répondu. Nouvel essai au prochain passage.`);
  }
  return false;
}

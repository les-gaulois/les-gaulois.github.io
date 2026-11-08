/**
 * L'envoi d'un message du robot sur le salon de la gazette, pour les alertes de place et les paliers franchis.
 * Avec l'image d'abord, en texte si elle ne se dessine pas ou si Discord refuse ce format. La gazette garde son propre envoi.
 * Le lien vaut un mot de passe pour ce salon : il n'est écrit dans aucun message, même d'erreur.
 */
import { REFUSED_FORMAT } from "./gazette-discord";

export interface ImageMessage {
  payload: Record<string, unknown>;
  png: Uint8Array;
  filename: string;
}

export interface PostDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  /** Le message en texte seul, sans bouton. */
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

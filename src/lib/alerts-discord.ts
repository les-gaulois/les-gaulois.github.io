/**
 * L'envoi d'une alerte de place, sur le même salon que la gazette : l'image et un bouton vers la page, sans texte.
 * Le message de secours, en texte, ne peut mentionner personne, et le tag d'un autre clan ne peut rien y mettre en forme.
 * L'envoi est celui de `discord-post.ts`, partagé avec les paliers franchis. La gazette garde le sien : le message du lundi n'en dépend pas.
 */
import { alertHeadline, alertsStarted, gapParts, gapSentences, markSent, planAlert, sourceLine, type AlertState, type PlaceAlert, type PlaceReading } from "./alerts";
import { imageMessage, postWithImage, textMessage } from "./discord-post";
import { fmtRank } from "./format";
import { escapeDiscord, type RenderedImage } from "./gazette-discord";

const discordTag = (tag: string | null) => (tag === null ? "un clan supprimé" : `[${escapeDiscord(tag)}]`);

const pageOf = (alert: PlaceAlert, site: string) =>
  alert.kind === "rank" ? { url: `${site}/classement`, label: "Voir le classement" } : { url: `${site}/carte`, label: "Voir la carte" };

/** Le message. `image` : le fichier joint et sa description, avec un bouton, sans texte. Sans elle, le secours en texte, avec un lien à la place du bouton. */
export function alertPayload(alert: PlaceAlert, tag: string, siteUrl: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  const page = pageOf(alert, site);
  if (image) return imageMessage(site, image, [page]);
  const gaps = gapSentences(gapParts(alert, discordTag));
  return textMessage(site, [`**${alertHeadline(alert, escapeDiscord(tag))}**`, ...(gaps ? [gaps] : []), `[${page.label} sur le site](<${page.url}>)`, `-# ${sourceLine(alert.reading)}`].join("\n"));
}

export interface AlertSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  alert: PlaceAlert;
  /** Dessine l'image. Si elle échoue, le message part en texte. */
  renderImage: (alert: PlaceAlert) => Promise<RenderedImage>;
  tag: string;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie l'alerte en image, ou en texte si elle ne se dessine pas : voir `postWithImage`. Un échec se retente au passage suivant. */
export function sendPlaceAlert({ link, alert, renderImage, tag, siteUrl, fetch, log }: AlertSendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Alertes",
    text: alertPayload(alert, tag, siteUrl, null),
    image: async () => {
      const { png, alt } = await renderImage(alert);
      const filename = `alerte-${alert.kind === "rank" ? "classement" : "carte"}.png`;
      return { payload: alertPayload(alert, tag, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

export interface AlertPassDeps {
  /** L'état noté au passage précédent. `null` : premier passage. */
  stored: AlertState | null;
  readings: { rank: PlaceReading | null; map: PlaceReading | null };
  /** La dernière édition de la gazette envoyée : les alertes attendent la première du vrai salon (`alertsStarted`). */
  gazetteLastSent: string | null;
  now: Date;
  /** Envoie l'alerte. `true` : Discord l'a acceptée. */
  send: (alert: PlaceAlert) => Promise<boolean>;
  log: (line: string) => void;
}

export interface AlertPassResult {
  /** L'état à écrire. `null` : rien n'a changé, rien à écrire. */
  state: AlertState | null;
  /** Une alerte devait partir et Discord ne l'a pas acceptée. */
  failed: boolean;
}

/**
 * Un passage du robot : décide, envoie au besoin, et rend l'état à noter.
 * La place annoncée ne change qu'après un envoi accepté. Après un échec, la place en attente reste notée : le passage suivant réessaie.
 */
export async function alertPass({ stored, readings, gazetteLastSent, now, send, log }: AlertPassDeps): Promise<AlertPassResult> {
  if (!alertsStarted(gazetteLastSent)) {
    log("Alertes : elles commencent après la gazette du lundi 9 novembre, premier message du salon.");
    return { state: null, failed: false };
  }
  const plan = planAlert(stored, readings, now);
  if (!plan.alert) {
    log(`Alertes : rien à envoyer (${plan.reason}).`);
    return { state: plan.state === stored ? null : plan.state, failed: false };
  }
  const { alert } = plan;
  if (!(await send(alert))) return { state: plan.state, failed: true };
  log(`Alertes : ${alert.kind === "rank" ? "classement" : "carte"}, ${fmtRank(alert.from)} puis ${fmtRank(alert.reading.rank)}, envoyée.`);
  return { state: markSent(plan.state, alert, now), failed: false };
}

/**
 * Les nouveautés du site : un message par jour sur le salon de la gazette, qui reprend les entrées ajoutées à la page Nouveautés
 * (`content/nouveautes.json`) depuis le précédent.
 *
 * - Une entrée se reconnaît à son jour et à son titre. Une entrée dont le titre est corrigé repart, si elle a moins de trois
 *   jours. Plus ancienne, ce n'est plus une nouvelle : elle est notée sans être envoyée.
 * - À partir de 19 h et jusqu'à minuit, une fois par jour. Le message est une image (`nouveautes-image.ts`), avec le titre de
 *   chaque nouveauté, et un bouton vers la page, sans texte. La phrase de chacune se lit sur le site. Le texte, avec la phrase
 *   et le lien de chaque page, ne part que si l'image ne se dessine pas.
 * - Au premier passage, les entrées du moment servent de départ : rien n'est envoyé.
 */
import { z } from "zod";
import { alertsStarted } from "./alerts";
import { imageMessage, postWithImage, textMessage } from "./discord-post";
import { fmtCount } from "./format";
import { escapeDiscord, type RenderedImage } from "./gazette-discord";
import { MAX_CONTENT } from "./paliers-franchis-discord";
import { ParisDay, SEND_FROM_HOUR, sendWindow, siteLink } from "./salon-discord";
import type { Nouveaute } from "./schemas";
import { addDays, parisParts } from "./time";

export const NewsState = z.object({
  /** Les entrées déjà passées, « jour titre » : envoyées, trop anciennes, ou là au premier passage. */
  seen: z.array(z.string()),
  /** Le jour, à Paris, du dernier message envoyé. */
  lastSentOn: ParisDay.nullable(),
});
export type NewsState = z.infer<typeof NewsState>;

/** Une entrée plus ancienne n'est plus une nouvelle. */
export const FRESH_DAYS = 3;
/** Au plus tant d'entrées écrites ; les autres sont comptées. */
export const MAX_ENTRIES = 10;

export const newsKey = (entry: Pick<Nouveaute, "date" | "title">) => `${entry.date} ${entry.title}`;

/** Les entrées pas encore passées : celles à envoyer, et celles trop anciennes pour l'être. */
export function unseenNews(entries: readonly Nouveaute[], state: NewsState, today: string): { fresh: Nouveaute[]; stale: Nouveaute[] } {
  const seen = new Set(state.seen);
  const unseen = entries.filter((entry) => !seen.has(newsKey(entry)));
  const oldest = addDays(today, -(FRESH_DAYS - 1));
  return { fresh: unseen.filter((entry) => entry.date >= oldest), stale: unseen.filter((entry) => entry.date < oldest) };
}

export const NEWS_TITLE = "Nouveau sur le site du clan";

/** « Et 2 autres nouveautés. » */
export const otherNewsWords = (count: number) => (count > 1 ? `Et ${count} autres nouveautés.` : "Et 1 autre nouveauté.");

/**
 * Le texte de secours : chaque titre, sa phrase et le lien de sa page. S'il est trop long pour Discord, les titres seuls,
 * puis moins d'entrées, et les autres sont comptées. Les textes sont échappés : ils ne peuvent ni mettre en forme ni mentionner.
 */
export function newsContent(entries: readonly Nouveaute[], siteUrl: string): string {
  const site = siteUrl.replace(/\/$/, "");
  const line = (entry: Nouveaute, withBody: boolean) => {
    const link = entry.link ? ` [${escapeDiscord(entry.link.label)}](<${siteLink(site, entry.link.href)}>)` : "";
    return `🆕 **${escapeDiscord(entry.title)}**${withBody ? ` : ${escapeDiscord(entry.body)}` : ""}${link}`;
  };
  const build = (written: number, withBody: boolean) => {
    const lines = [`**${NEWS_TITLE}**`, ...entries.slice(0, written).map((entry) => line(entry, withBody))];
    if (entries.length > written) lines.push(otherNewsWords(entries.length - written));
    lines.push(`[Toutes les nouveautés](<${siteLink(site, "/nouveautes")}>)`);
    return lines.join("\n");
  };
  let written = Math.min(entries.length, MAX_ENTRIES);
  const full = build(written, true);
  if (full.length <= MAX_CONTENT) return full;
  // La longueur en unités UTF-16 n'est jamais plus courte que celle que compte Discord.
  while (written > 1 && build(written, false).length > MAX_CONTENT) written--;
  return build(written, false);
}

/** Le message. `image` : le fichier joint et sa description, avec un bouton vers la page, sans texte. Sans elle, le secours en texte. */
export function newsPayload(entries: readonly Nouveaute[], siteUrl: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  if (!image) return textMessage(siteUrl, newsContent(entries, siteUrl));
  return imageMessage(siteUrl, image, [{ label: "Toutes les nouveautés", url: siteLink(siteUrl, "/nouveautes") }]);
}

export interface NewsPassDeps {
  /** L'état noté au passage précédent. `null` : premier passage. */
  stored: NewsState | null;
  /** Les entrées de la page Nouveautés, de la plus récente à la plus ancienne. */
  entries: readonly Nouveaute[];
  /** La dernière édition de la gazette envoyée : rien ne part avant la première du vrai salon. */
  gazetteLastSent: string | null;
  now: Date;
  send: (entries: readonly Nouveaute[]) => Promise<boolean>;
  log: (line: string) => void;
}

/** Un passage du robot. `state` : l'état à écrire, `null` s'il n'a pas changé. Après un échec, le passage suivant réessaie. */
export async function newsPass({ stored, entries, gazetteLastSent, now, send, log }: NewsPassDeps): Promise<{ state: NewsState | null; failed: boolean }> {
  if (!alertsStarted(gazetteLastSent)) {
    log("Nouveautés : les messages du jour commencent après la gazette du lundi 9 novembre, premier message du salon.");
    return { state: null, failed: false };
  }
  const keys = entries.map(newsKey);
  if (!stored) {
    log("Nouveautés : premier passage, les entrées du moment servent de départ.");
    return { state: { seen: keys, lastSentOn: null }, failed: false };
  }
  const today = parisParts(now).date;
  const { fresh, stale } = unseenNews(entries, stored, today);
  // Une entrée trop ancienne est notée tout de suite : elle ne partira jamais. Les entrées retirées du fichier sont oubliées.
  const absorbed = stale.length > 0 ? { ...stored, seen: [...new Set([...stored.seen.filter((key) => keys.includes(key)), ...stale.map(newsKey)])] } : null;
  if (fresh.length === 0) {
    log("Nouveautés : rien de neuf sur le site depuis le dernier message.");
    return { state: absorbed, failed: false };
  }
  const window = sendWindow(now, SEND_FROM_HOUR.nouveautes, stored.lastSentOn);
  if (!window.open) {
    log(`Nouveautés : rien à envoyer (${window.reason}).`);
    return { state: absorbed, failed: false };
  }
  if (!(await send(fresh))) return { state: absorbed, failed: true };
  log(`Nouveautés : ${fmtCount(fresh.length, "nouveauté")} envoyée${fresh.length > 1 ? "s" : ""}.`);
  return { state: { seen: keys, lastSentOn: today }, failed: false };
}

export interface NewsSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  entries: readonly Nouveaute[];
  /** Dessine l'image. Si elle échoue, le message part en texte. */
  renderImage: (entries: readonly Nouveaute[]) => Promise<RenderedImage>;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie le message en image, ou en texte si elle ne se dessine pas : voir `postWithImage`. Un échec se retente au passage suivant. */
export function sendNews({ link, entries, renderImage, siteUrl, fetch, log }: NewsSendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Nouveautés",
    text: newsPayload(entries, siteUrl, null),
    image: async () => {
      const { png, alt } = await renderImage(entries);
      const filename = "nouveautes-du-site.png";
      return { payload: newsPayload(entries, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

/**
 * La bienvenue : un message par jour sur le salon de la gazette pour les joueurs qui ont rejoint le clan depuis le précédent.
 *
 * - Les arrivées se lisent dans la liste des membres, relue environ une fois par jour : la date d'arrivée de chacun (`joinedAt`).
 *   Un message couvre les arrivées entre le relevé de la liste du message précédent et le dernier, de ceux qui sont encore dans
 *   le clan au dernier relevé. Si la liste donne une nouvelle date d'arrivée à un joueur parti puis revenu, il est de nouveau accueilli.
 * - Un membre avec pseudo est cité, relié à sa fiche. Un anonyme est seulement compté : ni nom ni identifiant publiés.
 * - À partir de 12 h, jamais la nuit, une fois par jour, et pas avant que le site montre les fiches des nouveaux.
 * - Au premier passage, le relevé du moment sert de départ : rien n'est envoyé.
 */
import { z } from "zod";
import { alertsStarted, MAP_SITE_DELAY_MS } from "./alerts";
import { postWithImage } from "./discord-post";
import { escapeDiscord, type RenderedImage } from "./gazette-discord";
import { periodWords } from "./paliers-franchis";
import { MAX_CONTENT, MAX_NAMES, profileUrl } from "./paliers-franchis-discord";
import { ParisDay, SEND_FROM_HOUR, sendWindow, siteLink } from "./salon-discord";
import type { StoredMembers } from "./schemas";
import { parisParts } from "./time";

export const WelcomeState = z.object({
  /** Le relevé de la liste jusqu'auquel les arrivées sont passées : accueillies, ou avant le premier passage. */
  until: z.iso.datetime(),
  /** Le jour, à Paris, du dernier message envoyé. */
  lastSentOn: ParisDay.nullable(),
});
export type WelcomeState = z.infer<typeof WelcomeState>;

export interface Newcomer {
  id: string;
  username: string;
  joinedAt: string;
}

export interface Arrivals {
  /** Le relevé de départ et celui du moment. */
  since: string;
  until: string;
  /** Les arrivées avec pseudo, de la plus ancienne à la plus récente. */
  named: Newcomer[];
  /** Les arrivées sans pseudo public : seulement comptées. */
  anonymous: number;
}

/** Les arrivées entre `since` et le relevé de la liste, de ceux qui sont encore dans le clan. */
export function arrivalsSince(members: StoredMembers, since: string): Arrivals {
  const from = Date.parse(since);
  const to = Date.parse(members.fetchedAt);
  const fresh = members.members.filter((m) => {
    const at = Date.parse(m.joinedAt);
    return at > from && at <= to;
  });
  const named = fresh
    .flatMap((m) => (m.username && m.publicId ? [{ id: m.publicId, username: m.username, joinedAt: m.joinedAt }] : []))
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.username.localeCompare(b.username, "fr"));
  return { since, until: members.fetchedAt, named, anonymous: fresh.length - named.length };
}

/** Faut-il envoyer maintenant ? Il faut un relevé plus récent que le dernier message, et que le site montre les nouvelles fiches. */
export function welcomeDue(state: WelcomeState, members: StoredMembers, now: Date): { due: boolean; reason: string } {
  if (Date.parse(members.fetchedAt) <= Date.parse(state.until)) return { due: false, reason: "pas de nouveau relevé de la liste depuis le dernier message" };
  const window = sendWindow(now, SEND_FROM_HOUR.bienvenue, state.lastSentOn);
  if (!window.open) return { due: false, reason: window.reason };
  if (now.getTime() - Date.parse(members.fetchedAt) < MAP_SITE_DELAY_MS) return { due: false, reason: "le message attend que le site montre les fiches des nouveaux" };
  return { due: true, reason: "" };
}

/* ---------- Les mots du message, pour le texte et pour l'image ---------- */

export const WELCOME_TITLE = "Bienvenue chez les Gaulois";

/** « Et 2 joueurs sans pseudo public. », ou la phrase entière quand personne n'a de pseudo. */
export function anonymousWords(count: number, afterNames: boolean): string {
  if (afterNames) return count > 1 ? `Et ${count} joueurs sans pseudo public.` : "Et 1 joueur sans pseudo public.";
  return count > 1 ? `${count} joueurs sans pseudo public ont rejoint le clan.` : "1 joueur sans pseudo public a rejoint le clan.";
}

/** « Et 3 autres membres avec pseudo. » */
export const otherNewcomersWords = (count: number) => (count > 1 ? `Et ${count} autres membres avec pseudo.` : "Et 1 autre membre avec pseudo.");

/**
 * Le texte du message, et le nombre de pseudos qu'il écrit : quinze au plus, moins si de longs pseudos le rendaient trop long.
 * Les autres sont comptés. L'image a besoin de ce nombre pour ne pas renvoyer au message des pseudos qu'il n'écrit pas.
 */
export function welcomeContent(arrivals: Arrivals, tag: string, siteUrl: string): { content: string; written: number } {
  const site = siteUrl.replace(/\/$/, "");
  const build = (written: number) => {
    const lines = [`**${WELCOME_TITLE} !**`, ...arrivals.named.slice(0, written).map((p) => `👋 [**${escapeDiscord(p.username)}**](<${profileUrl(site, p.id)}>)`)];
    if (arrivals.named.length > written) lines.push(otherNewcomersWords(arrivals.named.length - written));
    if (arrivals.anonymous > 0) lines.push(anonymousWords(arrivals.anonymous, arrivals.named.length > 0));
    lines.push(`[Voir les membres du clan](<${siteLink(site, "/membres/")}>)`, `-# Arrivées dans le clan [${escapeDiscord(tag)}] ${periodWords(arrivals)}, de ceux qui sont encore là au dernier relevé.`);
    return lines.join("\n");
  };
  let written = Math.min(arrivals.named.length, MAX_NAMES);
  // La longueur en unités UTF-16 n'est jamais plus courte que celle que compte Discord.
  while (written > 0 && build(written).length > MAX_CONTENT) written--;
  return { content: build(written), written };
}

/** Le message. `image` : le fichier joint et sa description ; sans lui, le message part en texte, sans bouton. */
export function welcomePayload(arrivals: Arrivals, tag: string, siteUrl: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  const base = { content: welcomeContent(arrivals, tag, site).content, avatar_url: siteLink(site, "/generated/icon-192.png"), allowed_mentions: { parse: [] } };
  if (!image) return base;
  return {
    ...base,
    attachments: [{ id: 0, filename: image.filename, description: image.alt }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir les membres du clan", url: siteLink(site, "/membres/") }] }],
  };
}

export interface WelcomeSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  arrivals: Arrivals;
  /** Dessine l'image. `allNamed` : le texte écrit tous les pseudos. Si elle échoue, le message part en texte. */
  renderImage: (arrivals: Arrivals, allNamed: boolean) => Promise<RenderedImage>;
  tag: string;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie le message, avec l'image d'abord : voir `postWithImage`. Un échec se retente au passage suivant. */
export function sendWelcome({ link, arrivals, renderImage, tag, siteUrl, fetch, log }: WelcomeSendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Bienvenue",
    text: welcomePayload(arrivals, tag, siteUrl, null),
    image: async () => {
      const { written } = welcomeContent(arrivals, tag, siteUrl);
      const { png, alt } = await renderImage(arrivals, written === arrivals.named.length);
      const filename = "bienvenue.png";
      return { payload: welcomePayload(arrivals, tag, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

export interface WelcomePassDeps {
  /** L'état noté au passage précédent. `null` : premier passage. */
  stored: WelcomeState | null;
  /** La liste des membres. `null` : absente ou illisible. */
  members: StoredMembers | null;
  /** La dernière édition de la gazette envoyée : rien ne part avant la première du vrai salon. */
  gazetteLastSent: string | null;
  now: Date;
  send: (arrivals: Arrivals) => Promise<boolean>;
  log: (line: string) => void;
}

/** Un passage du robot. `state` : l'état à écrire, `null` s'il n'a pas changé. Après un échec, le passage suivant réessaie. */
export async function welcomePass({ stored, members, gazetteLastSent, now, send, log }: WelcomePassDeps): Promise<{ state: WelcomeState | null; failed: boolean }> {
  if (!alertsStarted(gazetteLastSent)) {
    log("Bienvenue : les messages du jour commencent après la gazette du lundi 9 novembre, premier message du salon.");
    return { state: null, failed: false };
  }
  if (!members) {
    log("Bienvenue : pas de liste des membres lisible, rien à faire.");
    return { state: null, failed: false };
  }
  if (!stored) {
    log("Bienvenue : premier passage, le relevé du moment sert de départ.");
    return { state: { until: members.fetchedAt, lastSentOn: null }, failed: false };
  }
  const { due, reason } = welcomeDue(stored, members, now);
  if (!due) {
    log(`Bienvenue : rien à envoyer (${reason}).`);
    return { state: null, failed: false };
  }
  const arrivals = arrivalsSince(members, stored.until);
  if (arrivals.named.length === 0 && arrivals.anonymous === 0) {
    log("Bienvenue : personne n'a rejoint le clan entre les deux relevés, rien n'est envoyé.");
    return { state: { ...stored, until: members.fetchedAt }, failed: false };
  }
  if (!(await send(arrivals))) return { state: null, failed: true };
  const total = arrivals.named.length + arrivals.anonymous;
  log(`Bienvenue : ${total > 1 ? `${total} arrivées annoncées` : "1 arrivée annoncée"}.`);
  return { state: { until: members.fetchedAt, lastSentOn: parisParts(now).date }, failed: false };
}

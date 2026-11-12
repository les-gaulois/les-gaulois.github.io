/**
 * Le message des plus actifs, sur le salon de la gazette : l'image, qui écrit chaque pseudo, et un bouton, sans texte.
 * Le message de secours, en texte, relie chaque pseudo à sa fiche : il ne peut mentionner personne, et un pseudo ne peut ni le
 * mettre en forme ni y glisser un lien. Règles : `actifs.ts`.
 */
import {
  ACTIVE_NOTE,
  ACTIVE_TITLE,
  activeDue,
  activePlayers,
  activeReading,
  activityWords,
  forgetActiveMembers,
  markActiveSent,
  namedIds,
  type ActivePlayer,
  type ActiveState,
} from "./actifs";
import { alertsStarted } from "./alerts";
import { imageMessage, postWithImage, textMessage } from "./discord-post";
import { escapeDiscord, type RenderedImage } from "./gazette-discord";
import { periodWords } from "./paliers-franchis";
import { profileUrl } from "./paliers-franchis-discord";
import { NAMED_ONLY, siteLink } from "./salon-discord";
import type { StoredMembers } from "./schemas";

/** La période du message : du relevé de départ au relevé du moment. */
export interface ActivePeriod {
  since: string;
  until: string;
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** Le texte de secours. Cinq joueurs au plus : il reste loin de la limite de Discord. */
export function activeContent(players: readonly ActivePlayer[], period: ActivePeriod, tag: string, siteUrl: string): string {
  const site = siteUrl.replace(/\/$/, "");
  return [
    `**${ACTIVE_TITLE} chez [${escapeDiscord(tag)}]**`,
    ...players.map((p) => `${MEDALS[p.place - 1] ?? "🏅"} [**${escapeDiscord(p.username)}**](<${profileUrl(site, p.id)}>) : ${activityWords(p)}`),
    `[Voir les membres du clan](<${siteLink(site, "/membres/")}>)`,
    `-# Parties en équipe sous le tag, ${periodWords(period)}. ${NAMED_ONLY} ${ACTIVE_NOTE}`,
  ].join("\n");
}

/** Le message. `image` : le fichier joint et sa description, avec un bouton, sans texte. Sans elle, le secours en texte, sans bouton. */
export function activePayload(players: readonly ActivePlayer[], period: ActivePeriod, tag: string, siteUrl: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  if (!image) return textMessage(site, activeContent(players, period, tag, site));
  const only = players.length === 1 ? players[0] : undefined;
  return imageMessage(site, image, [only ? { label: `Voir la fiche de ${only.username}`, url: profileUrl(site, only.id) } : { label: "Voir les membres du clan", url: siteLink(site, "/membres/") }]);
}

export interface ActiveSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  players: readonly ActivePlayer[];
  period: ActivePeriod;
  /** Dessine l'image. Si elle échoue, le message part en texte. */
  renderImage: (players: readonly ActivePlayer[], period: ActivePeriod) => Promise<RenderedImage>;
  tag: string;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie le message en image, ou en texte si elle ne se dessine pas : voir `postWithImage`. Un échec se retente au passage suivant. */
export function sendActive({ link, players, period, renderImage, tag, siteUrl, fetch, log }: ActiveSendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Plus actifs",
    text: activePayload(players, period, tag, siteUrl, null),
    image: async () => {
      const { png, alt } = await renderImage(players, period);
      const filename = "plus-actifs.png";
      return { payload: activePayload(players, period, tag, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

export interface ActivePassDeps {
  /** L'état noté au passage précédent. `null` : premier passage. */
  stored: ActiveState | null;
  /** La liste des membres. `null` : absente ou illisible. */
  members: StoredMembers | null;
  /** La dernière édition de la gazette envoyée : rien ne part avant la première du vrai salon. */
  gazetteLastSent: string | null;
  now: Date;
  send: (players: readonly ActivePlayer[], period: ActivePeriod) => Promise<boolean>;
  log: (line: string) => void;
}

/** Un passage du robot. `state` : l'état à écrire, `null` s'il n'a pas changé. Après un échec, le passage suivant réessaie. */
export async function activePass({ stored, members, gazetteLastSent, now, send, log }: ActivePassDeps): Promise<{ state: ActiveState | null; failed: boolean }> {
  if (!alertsStarted(gazetteLastSent)) {
    log("Plus actifs : les messages du jour commencent après la gazette du lundi 9 novembre, premier message du salon.");
    return { state: null, failed: false };
  }
  if (!members) {
    log("Plus actifs : pas de liste des membres lisible, rien à faire.");
    return { state: null, failed: false };
  }
  if (!stored) {
    log("Plus actifs : premier passage, le relevé du moment sert de départ.");
    return { state: { base: activeReading(members), lastSentOn: null }, failed: false };
  }
  const state = forgetActiveMembers(stored, namedIds(members));
  const changed = state === stored ? null : state;
  const { due, reason, restart } = activeDue(state, members, now);
  if (restart) {
    log(`Plus actifs : ${reason}.`);
    return { state: { base: activeReading(members), lastSentOn: state.lastSentOn }, failed: false };
  }
  if (!due) {
    log(`Plus actifs : rien à envoyer (${reason}).`);
    return { state: changed, failed: false };
  }
  const players = activePlayers(state.base, members);
  if (players.length === 0) {
    log("Plus actifs : aucun membre avec pseudo n'a joué entre les deux relevés, rien n'est envoyé.");
    return { state: { base: activeReading(members), lastSentOn: state.lastSentOn }, failed: false };
  }
  if (!(await send(players, { since: state.base.at, until: members.fetchedAt }))) return { state: changed, failed: true };
  log(`Plus actifs : ${players.length > 1 ? `${players.length} joueurs cités` : "1 joueur cité"}.`);
  return { state: markActiveSent(members, now), failed: false };
}

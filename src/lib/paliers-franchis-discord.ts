/**
 * Le message des paliers franchis, sur le salon de la gazette : les pseudos, chacun relié à sa fiche, l'image et un bouton.
 * Le message ne peut mentionner personne, et un pseudo ne peut ni le mettre en forme ni y glisser un lien.
 */
import { alertsStarted } from "./alerts";
import { postWithImage } from "./discord-post";
import { escapeDiscord, type RenderedImage } from "./gazette-discord";
import {
  crossingWords,
  markMilestonesSent,
  MILESTONE_NOTE,
  milestonePlayers,
  milestonesDue,
  milestoneTitle,
  observeMembers,
  othersWords,
  periodWords,
  type MilestonePlayer,
  type MilestoneState,
  type PendingMilestones,
} from "./paliers-franchis";
import type { StoredMembers } from "./schemas";

/** Au plus tant de pseudos écrits ; les autres sont comptés. */
export const MAX_NAMES = 15;
/** Discord refuse un texte de plus de 2 000 caractères : le message garde de la marge, et retire des pseudos s'il le faut. */
export const MAX_CONTENT = 1900;
/** La limite de Discord pour le texte d'un bouton. */
const BUTTON_LABEL_MAX = 80;

export const profileUrl = (site: string, id: string) => `${site}/membres/${encodeURIComponent(id)}/`;
export const tiersUrl = (site: string) => `${site}/membres/#paliers`;

/**
 * Le texte du message, et le nombre de pseudos qu'il écrit : quinze au plus, moins si de longs pseudos le rendaient trop long.
 * Les autres sont comptés. L'image a besoin de ce nombre pour ne pas renvoyer au message des pseudos qu'il n'écrit pas.
 */
export function milestoneContent(players: readonly MilestonePlayer[], pending: PendingMilestones, tag: string, siteUrl: string): { content: string; written: number } {
  const site = siteUrl.replace(/\/$/, "");
  const build = (written: number) => {
    const lines = players.slice(0, written).map((p) => `🏅 [**${escapeDiscord(p.username)}**](<${profileUrl(site, p.id)}>) ${crossingWords(p.tier)}`);
    if (players.length > written) lines.push(othersWords(players.length - written));
    return [
      `**${milestoneTitle(players.length)} chez [${escapeDiscord(tag)}]**`,
      ...lines,
      `[Voir les paliers du clan sur le site](<${tiersUrl(site)}>)`,
      `-# Victoires en équipe sous le tag, ${periodWords(pending)}. Membres avec pseudo public seulement. ${MILESTONE_NOTE}`,
    ].join("\n");
  };
  let written = Math.min(players.length, MAX_NAMES);
  // La longueur en unités UTF-16 n'est jamais plus courte que celle que compte Discord.
  while (written > 0 && build(written).length > MAX_CONTENT) written--;
  return { content: build(written), written };
}

/** Le message. `image` : le fichier joint et sa description ; sans lui, le message part en texte, sans bouton. */
export function milestonePayload(players: readonly MilestonePlayer[], pending: PendingMilestones, tag: string, siteUrl: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  const { content } = milestoneContent(players, pending, tag, site);
  const base = { content, avatar_url: `${site}/generated/icon-192.png`, allowed_mentions: { parse: [] } };
  if (!image) return base;
  const only = players.length === 1 ? players[0] : undefined;
  const button = only
    ? { label: `Voir la fiche de ${only.username}`.slice(0, BUTTON_LABEL_MAX), url: profileUrl(site, only.id) }
    : { label: "Voir les paliers du clan", url: tiersUrl(site) };
  return {
    ...base,
    attachments: [{ id: 0, filename: image.filename, description: image.alt }],
    components: [{ type: 1, components: [{ type: 2, style: 5, ...button }] }],
  };
}

export interface MilestoneSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  players: readonly MilestonePlayer[];
  pending: PendingMilestones;
  /** Dessine l'image. `allNamed` : le texte écrit tous les pseudos. Si elle échoue, le message part en texte. */
  renderImage: (players: readonly MilestonePlayer[], pending: PendingMilestones, allNamed: boolean) => Promise<RenderedImage>;
  tag: string;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie le message, avec l'image d'abord : voir `postWithImage`. Un échec se retente au passage suivant. */
export function sendMilestones({ link, players, pending, renderImage, tag, siteUrl, fetch, log }: MilestoneSendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Paliers",
    text: milestonePayload(players, pending, tag, siteUrl, null),
    image: async () => {
      const { written } = milestoneContent(players, pending, tag, siteUrl);
      const { png, alt } = await renderImage(players, pending, written === players.length);
      const filename = "paliers-franchis.png";
      return { payload: milestonePayload(players, pending, tag, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

export interface MilestonePassDeps {
  /** L'état noté au passage précédent. `null` : premier passage. */
  stored: MilestoneState | null;
  /** La liste des membres. `null` : absente ou illisible. */
  members: StoredMembers | null;
  /** La dernière édition de la gazette envoyée : les paliers attendent la première du vrai salon, comme les alertes. */
  gazetteLastSent: string | null;
  now: Date;
  /** Envoie le message. `true` : Discord l'a accepté. */
  send: (players: readonly MilestonePlayer[], pending: PendingMilestones) => Promise<boolean>;
  log: (line: string) => void;
}

export interface MilestonePassResult {
  /** L'état à écrire. `null` : rien n'a changé, rien à écrire. */
  state: MilestoneState | null;
  /** Un message devait partir et Discord ne l'a pas accepté. */
  failed: boolean;
}

/**
 * Un passage du robot : tient compte de la liste, envoie au besoin, et rend l'état à noter.
 * Les paliers en attente ne s'effacent qu'après un envoi accepté : après un échec, le passage suivant réessaie.
 */
export async function milestonePass({ stored, members, gazetteLastSent, now, send, log }: MilestonePassDeps): Promise<MilestonePassResult> {
  if (!alertsStarted(gazetteLastSent)) {
    log("Paliers : ils commencent après la gazette du lundi 9 novembre, premier message du salon.");
    return { state: null, failed: false };
  }
  if (!members) {
    log("Paliers : pas de liste des membres lisible, rien à faire.");
    return { state: null, failed: false };
  }
  const state = observeMembers(stored, members);
  const changed = state === stored ? null : state;
  if (!stored) {
    log("Paliers : premier passage, les paliers du moment servent de départ.");
    return { state, failed: false };
  }
  const { due, reason } = milestonesDue(state, now);
  if (!due || !state.pending) {
    log(`Paliers : rien à envoyer (${reason}).`);
    return { state: changed, failed: false };
  }
  const players = milestonePlayers(state.pending, members);
  if (players.length === 0) {
    log("Paliers : plus personne à citer, rien n'est envoyé.");
    return { state: { ...state, pending: null }, failed: false };
  }
  if (!(await send(players, state.pending))) return { state: changed, failed: true };
  log(`Paliers : ${players.length > 1 ? `${players.length} paliers envoyés` : "1 palier envoyé"}.`);
  return { state: markMilestonesSent(state, now), failed: false };
}

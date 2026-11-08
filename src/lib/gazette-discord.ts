/**
 * L'envoi de la gazette sur un salon Discord, par un lien d'envoi automatique (webhook) que le clan crée lui-même.
 * Sans ce lien, rien ne part. Le message est une image, ou des blocs de texte si elle échoue. Il reprend les chiffres de la page et ne peut mentionner personne.
 */
import { z } from "zod";
import { fmtCount, fmtDay, fmtInt, fmtPct, fmtRank } from "./format";
import { comparisonSentence, endingOn, type GazetteEdition, playersPeriod, rankWords, weekLabel } from "./gazette";
import { addDays, parisParts } from "./time";
import type { WeekPlayer } from "./week-players";

/** Une édition paraît le lundi après 6 h UTC, soit 7 ou 8 h à Paris : le message attend ce moment de la matinée, heure de Paris. */
export const SEND_FROM_HOUR = 9;
/**
 * Le premier passage du lundi relit la liste des membres et le film de la carte. Si l'une de ces lectures échoue,
 * le message l'attend jusqu'à cette heure. Après, il part sans ce qui manque, et il ne repart jamais ensuite.
 */
export const WAIT_UNTIL_HOUR = 21;

/**
 * Le format du message. Le changer renvoie une fois la dernière édition au salon du secret, pour voir le résultat :
 * le code ne peut pas savoir si c'est un salon d'essai. À ne faire que si c'en est un : voir le README.
 */
export const MESSAGE_FORMAT = 3;

export const GazetteSendState = z.object({
  /** Le lundi de la dernière édition envoyée. */
  lastSent: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sentAt: z.iso.datetime(),
  /** Absent : le tout premier format. */
  format: z.number().int().default(1),
});
export type GazetteSendState = z.infer<typeof GazetteSendState>;

/** La dernière édition envoyée dans le format actuel. */
export const lastSentEdition = (state: GazetteSendState | null) => (state?.format === MESSAGE_FORMAT ? state.lastSent : null);

/**
 * Seul un lien de Discord est accepté : une valeur erronée ne doit envoyer la gazette nulle part ailleurs.
 * Les versions d'essai de l'application (ptb, canary) copient le même lien sous leur propre adresse.
 */
export const isWebhookUrl = (url: string) => /^https:\/\/(?:(?:ptb|canary)\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url);

/** Un pseudo est libre : il ne doit ni mettre le message en forme, ni y glisser un lien ou une mention. */
export const escapeDiscord = (text: string) => text.replace(/\s+/g, " ").trim().replace(/[\\*_~`|>#\-[\]():/<@]/g, "\\$&");

const MEDALS = ["🥇", "🥈", "🥉"];
/** Requête refusée, droits du salon sur les fichiers, fichier trop lourd. Un lien mort (401, 404) ou une limite (429) n'en font pas partie. */
const REFUSED_FORMAT = [400, 403, 413];
const COLOR = 0x0b5fff;

function playerLines(players: readonly WeekPlayer[]): string {
  const lines = players.map((p) => `${MEDALS[p.place - 1] ?? "🏅"} **${escapeDiscord(p.username)}** : ${fmtCount(p.wins, "victoire")}`);
  // Sur deux relevés réels, le trio aux victoires est le trio aux parties : la médaille ne doit pas se lire comme un niveau.
  return [...lines, "*Cela compte d'abord le temps de jeu, pas le niveau.*"].join("\n");
}

/** Le rang à la fin de la semaine, puis celui d'avant : le rang porte sur 90 jours glissants, pas sur cette seule semaine. */
function standingValue({ start, end }: NonNullable<GazetteEdition["standing"]>): string {
  const before = start ? ` (${rankWords(start.rank)} le ${fmtDay(start.date)})` : "";
  return `**${rankWords(end.rank)}** le ${fmtDay(end.date)}${before}, sur 90 jours glissants.`;
}

function territoryValue({ start, end }: NonNullable<GazetteEdition["territory"]>): string {
  const place = end.rank === null ? `**${fmtInt(end.pixels)}** pixels` : `**${fmtRank(end.rank)}** avec ${fmtInt(end.pixels)} pixels`;
  // Un écart depuis un relevé fait dans la journée serait démenti par le film suivant, et un message ne se corrige pas.
  if (!start?.final) return `${place} le ${endingOn(end.date)}`;
  const change = end.pixels - start.pixels;
  return `${place} le ${fmtDay(end.date)}, ${change < 0 ? "−" : "+"}${fmtInt(Math.abs(change))} depuis le ${fmtDay(start.date)}`;
}

export interface GazettePayload {
  avatar_url: string;
  allowed_mentions: { parse: never[] };
  embeds: {
    title: string;
    url: string;
    description: string;
    color: number;
    fields: { name: string; value: string; inline?: boolean }[];
    footer: { text: string };
  }[];
}

/**
 * Le message : les chiffres en blocs, chacun avec son titre, plutôt qu'une phrase à déchiffrer.
 */
export function gazettePayload(edition: GazetteEdition, tag: string, siteUrl: string): GazettePayload {
  const site = siteUrl.replace(/\/$/, "");
  const { games, wins, winRate } = edition.totals;
  const fields: GazettePayload["embeds"][number]["fields"] = [
    { name: "Victoires", value: `**${fmtInt(wins)}**`, inline: true },
    { name: "Parties", value: `**${fmtInt(games)}**`, inline: true },
    { name: "Taux de victoire", value: `**${fmtPct(winRate)}**`, inline: true },
  ];
  const comparison = comparisonSentence(edition);
  if (comparison) fields.push({ name: "Évolution", value: comparison });
  if (edition.standing) fields.push({ name: "Classement officiel", value: standingValue(edition.standing) });
  // Un relevé fait dans la journée serait bientôt démenti par la page, et un message ne se corrige pas : seule la fin d'une journée part.
  if (edition.territory?.end.final) fields.push({ name: "Carte des clans", value: territoryValue(edition.territory) });
  if (edition.arrivals) fields.push({ name: "Arrivées", value: `**${fmtInt(edition.arrivals.count)}** encore dans le clan` });
  const period = playersPeriod(edition);
  if (edition.players && period) fields.push({ name: `Le plus de victoires ${period}`, value: playerLines(edition.players) });
  const whoCounts = edition.players ? "Victoires en équipe sous le tag entre deux relevés, membres avec pseudo présents aux deux. " : "";
  return {
    avatar_url: `${site}/generated/icon-192.png`,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `La gazette de [${tag}]`,
        url: `${site}/gazette`,
        description: `Semaine ${weekLabel(edition)}`,
        color: COLOR,
        fields,
        footer: { text: `${whoCounts}Données publiques d'OpenFront.` },
      },
    ],
  };
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

/** Le message avec l'image de la semaine : du texte court, l'image et un bouton vers la page. */
export function imagePayload(edition: GazetteEdition, tag: string, siteUrl: string, alt: string, filename: string): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  // Lisible sur un téléphone, où le texte de l'image est petit.
  const podium = edition.players ? "Podium : victoires en équipe sous le tag entre deux relevés, membres avec pseudo présents aux deux. Cela compte d'abord le temps de jeu, pas le niveau. " : "";
  return {
    content: [
      `**La gazette de [${tag}]** : semaine ${weekLabel(edition)}`,
      `[Voir les stats sur le site](<${site}/gazette>)`,
      `-# ${podium}Données publiques d'OpenFront.`,
    ].join("\n"),
    avatar_url: `${site}/generated/icon-192.png`,
    allowed_mentions: { parse: [] },
    attachments: [{ id: 0, filename, description: alt }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir toute la semaine", url: `${site}/gazette` }] }],
  };
}

/** L'image de la semaine et sa description, pour un lecteur d'écran. */
export interface RenderedImage {
  png: Uint8Array;
  alt: string;
}

export interface SendDeps {
  webhook: string | undefined;
  editions: readonly GazetteEdition[];
  /** Les mois de sessions illisibles : avec eux, les totaux seraient faux. */
  unreadable: readonly string[];
  /** Dessine l'image. Si elle échoue, le message part en texte. */
  renderImage: (edition: GazetteEdition) => Promise<RenderedImage>;
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
export async function sendLatestGazette({ webhook, editions, unreadable, renderImage, lastSent, tag, siteUrl, now, fetch: post, log }: SendDeps): Promise<SendResult> {
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
  const textRequest = { url: link, init: { headers: { "Content-Type": "application/json" }, body: JSON.stringify(gazettePayload(decision.edition, tag, siteUrl)) } };
  const requests: { url: string; init: RequestInit }[] = [textRequest];
  try {
    const { png, alt } = await renderImage(decision.edition);
    const filename = `gazette-${decision.edition.from}.png`;
    const form = new FormData();
    form.append("payload_json", JSON.stringify(imagePayload(decision.edition, tag, siteUrl, alt, filename)));
    form.append("files[0]", new Blob([Buffer.from(png)], { type: "image/png" }), filename);
    // Sans ce réglage, Discord ignore le bouton.
    requests.unshift({ url: `${link}?with_components=true`, init: { body: form } });
  } catch (e) {
    log(`::warning::Gazette : image impossible à dessiner (${e instanceof Error ? e.message : "erreur inconnue"}), le message part en texte.`);
  }
  try {
    for (const [i, request] of requests.entries()) {
      // Une redirection changerait l'envoi en simple lecture, qui répondrait « OK » sans poster de message.
      const response = await post(request.url, { method: "POST", redirect: "error", ...request.init });
      if (response.ok) break;
      // Un refus de ce format ne s'arrangera pas au passage suivant : le message part aussitôt en texte. Une panne, elle, se réessaie.
      if (REFUSED_FORMAT.includes(response.status) && i < requests.length - 1) {
        log(`::warning::Gazette : Discord a refusé le message avec image (${response.status}), il part en texte.`);
        continue;
      }
      log(`::warning::Gazette : Discord a répondu ${response.status}. Nouvel essai au prochain passage.`);
      return { status: "failed" };
    }
  } catch {
    log("::warning::Gazette : Discord n'a pas répondu. Nouvel essai au prochain passage.");
    return { status: "failed" };
  }
  log(`Gazette : édition du ${decision.edition.from} envoyée.`);
  return { status: "sent", state: { lastSent: decision.edition.from, sentAt: now.toISOString(), format: MESSAGE_FORMAT } };
}

/**
 * Le message d'une victoire, dans le salon des victoires : comme les autres messages du robot, l'image et des boutons, sans
 * texte, ou le texte seul si l'image ne se dessine pas. Le texte de secours ne peut mentionner personne, et un nom ne peut ni
 * le mettre en forme ni y glisser un lien. Ce qui part, et quand : `victoires.ts`.
 *
 * Le nom français de la carte et sa vignette viennent d'OpenFront, sous licence CC BY-SA 4.0 : l'image les crédite elle-même,
 * avec la mention « © OpenFront and Contributors », l'adresse de la source et celle de la licence (`victoires-image.ts`), et le
 * texte de secours aussi (voir NOTICE.md).
 */
import { imageMessage, postWithImage, textMessage } from "./discord-post";
import { fmtCount, fmtInt, fmtScore } from "./format";
import { escapeDiscord, type RenderedImage } from "./gazette-discord";
import { replayUrl } from "./journal";
import { mapKey, mapLabel } from "./map-names";
import { MAX_CONTENT, profileUrl } from "./paliers-franchis-discord";
import { formatLabel } from "./results";
import { siteLink } from "./salon-discord";
import type { Victory } from "./victoires";

export const LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/deed.fr";
/** Les cartes du jeu, d'où viennent les vignettes : le dossier `resources/maps` du dépôt d'OpenFront. */
export const MAPS_SOURCE = "https://github.com/openfrontio/OpenFrontIO/tree/main/resources/maps";
/** La mention que demande la licence d'OpenFront pour toute reprise de ses fichiers : voir NOTICE.md. */
export const OPENFRONT_CREDIT = "© OpenFront and Contributors";

/** Le dossier de la carte dans le dépôt du jeu, ou celui de toutes les cartes si son nom n'en donne pas. */
export const mapSource = (map: string) => (/^[a-z0-9]{2,60}$/.test(mapKey(map)) ? `${MAPS_SOURCE}/${mapKey(map)}` : MAPS_SOURCE);

/** « Victoire de [GAL] ». */
export const victoryTitle = (tag: string) => `Victoire de [${tag}]`;

/** « 15 min 43 s », « 7 min », « 1 h 04 min ». */
export function gameLength(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** « 6 Gaulois sur 23 joueurs ». */
export const countWords = (v: Victory) => `${fmtInt(v.gaulois)} Gaulois sur ${fmtCount(v.players, "joueur")}`;

/** « point gagné » jusqu'à 2, puis « points gagnés ». */
export const pointsLabel = (points: number) => (points >= 2 ? "points gagnés" : "point gagné");

/** « +1,81 point gagné ». */
export const pointsWords = (points: number) => `+${fmtScore(points)} ${pointsLabel(points)}`;

/** « A, B et C ». */
export function frenchList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
}

/** « 1 Gaulois sans nom », pour ceux dont le nom ne se lit pas dans la partie. */
export const unnamedWords = (count: number) => (count > 1 ? `${fmtInt(count)} Gaulois sans nom` : "1 Gaulois sans nom");

/** « 1 joueur sous le tag, hors du clan » : le jeu lui a laissé le tag, sa fiche ne le donne pas membre. Jamais nommé. */
export const outsidersWords = (count: number) => (count > 1 ? `${fmtInt(count)} joueurs sous le tag, hors du clan` : "1 joueur sous le tag, hors du clan");

/** « 3 autres Gaulois », pour ceux qu'un message trop long ne peut plus nommer ; « 3 Gaulois » s'il n'en nomme aucun. */
export const restWords = (rest: number, named: number) => (named > 0 ? `${fmtInt(rest)} ${rest > 1 ? "autres Gaulois" : "autre Gaulois"}` : `${fmtInt(rest)} Gaulois`);

/** Ceux qui sont seulement comptés : sans nom lisible, puis hors du clan. */
export const countedWords = (v: Pick<Victory, "unnamed" | "outsiders">) => [...(v.unnamed > 0 ? [unnamedWords(v.unnamed)] : []), ...(v.outsiders > 0 ? [outsidersWords(v.outsiders)] : [])];

/** Les Gaulois de la partie : leurs noms, puis ceux qui sont seulement comptés, en une liste. Rien s'il n'y a personne. */
export function crewList(names: readonly string[], counted: readonly string[]): string | null {
  const all = [...names, ...counted];
  return all.length > 0 ? frenchList(all) : null;
}

/** Le pied du texte de secours : d'où viennent les noms, et le crédit du nom de la carte. Sans image, pas de vignette à créditer. */
export function victoryNote(v: Victory): string {
  return `-# Noms portés dans la partie. Carte : [${OPENFRONT_CREDIT}](<${mapSource(v.map)}>), [CC BY-SA 4.0](<${LICENSE_URL}>).`;
}

/**
 * Le texte de secours, et le nombre de noms qu'il écrit : tous. Chacun est relié à sa fiche s'il en a une ; si les liens
 * rendaient le message trop long pour Discord, les noms partent sans lien. La liste n'est coupée que si les noms seuls
 * dépassaient la limite.
 */
export function victoryContent(v: Victory, tag: string, siteUrl: string): { content: string; written: number } {
  const site = siteUrl.replace(/\/$/, "");
  const start = Math.floor(Date.parse(v.start) / 1000);
  const build = (written: number, links: boolean) => {
    const names = v.crew.slice(0, written).map((p) => (links && p.id ? `[**${escapeDiscord(p.name)}**](<${profileUrl(site, p.id)}>)` : `**${escapeDiscord(p.name)}**`));
    // Couper n'arrive que si les noms seuls dépassaient la limite de Discord : plus de 50 Gaulois aux noms les plus longs.
    const rest = v.crew.length - written;
    const cut = rest > 0 ? [restWords(rest, written)] : [];
    const crew = crewList(names, [...cut, ...countedWords(v)]);
    const lines = [
      `**${victoryTitle(escapeDiscord(tag))}** · ${escapeDiscord(mapLabel(v.map))}`,
      `⚔️ ${v.format ? `${formatLabel(v.format)} · ` : ""}${countWords(v)}`,
      ...(crew ? [`👥 ${crew}`] : []),
      `⏱️ ${gameLength(v.seconds)}, commencée à <t:${start}:t>${v.points === null ? "" : ` · ${pointsWords(v.points)}`}`,
      `[Revoir la partie](<${replayUrl(v.id)}>) · [Dernières parties](<${siteLink(site, "/parties")}>)`,
      victoryNote(v),
    ];
    return lines.join("\n");
  };
  // La longueur en unités UTF-16 n'est jamais plus courte que celle que compte Discord.
  const linked = build(v.crew.length, true);
  if (linked.length <= MAX_CONTENT) return { content: linked, written: v.crew.length };
  let written = v.crew.length;
  while (written > 0 && build(written, false).length > MAX_CONTENT) written--;
  return { content: build(written, false), written };
}

/**
 * Le message. `image` : le fichier joint et sa description, avec deux boutons, sans texte : l'image porte elle-même le crédit
 * de la carte. Sans elle, le secours en texte, sans bouton ni vignette.
 */
export function victoryPayload(v: Victory, tag: string, siteUrl: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  if (!image) return textMessage(site, victoryContent(v, tag, site).content);
  return imageMessage(site, image, [
    { label: "Revoir la partie", url: replayUrl(v.id) },
    { label: "Dernières parties", url: siteLink(site, "/parties") },
  ]);
}

export interface VictorySendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  victory: Victory;
  /** Dessine l'image, avec ou sans la vignette de la carte. Si elle échoue, le message part en texte. */
  renderImage: (victory: Victory) => Promise<RenderedImage>;
  tag: string;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie le message en image, ou en texte si elle ne se dessine pas : voir `postWithImage`. Un échec se retente au passage suivant. */
export function sendVictory({ link, victory, renderImage, tag, siteUrl, fetch, log }: VictorySendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Victoires",
    text: victoryPayload(victory, tag, siteUrl, null),
    image: async () => {
      const { png, alt } = await renderImage(victory);
      const filename = `victoire-${victory.id.replace(/[^A-Za-z0-9]/g, "")}.png`;
      return { payload: victoryPayload(victory, tag, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

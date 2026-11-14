/**
 * Le salut du salon général : quand le robot des arrivées accueille un nouveau venu dans « nouveaux », il le salue aussi dans
 * le salon général du serveur Discord du clan, en le mentionnant, avec une image et quatre conseils pour commencer. Demandé
 * par le pilote le 14 novembre 2026, sur le modèle du message d'un autre robot (« Ho ! Un nouveau membre ! », les tickets
 * pour rejoindre le clan, le vocal, le Staff et les membres certifiés, « ramener d'autres compagnons »).
 *
 * Ici, ce qui se calcule sans réseau ni dessin : retrouver le salon général et celui des tickets à leur nom, les droits qu'il
 * y faut, les conseils, et le message. Les appels sont dans `arrivees-discord.ts`, l'image dans `arrivees-general-image.ts`.
 *
 * Le robot ne garde rien ici non plus : le salut part juste après l'image de « nouveaux », une fois, et seulement si elle est
 * partie. Une image déjà postée, au passage suivant, ne refait donc jamais de salut.
 */
import type { IconePartieNom } from "./icones-parties";
import { stableHash, type Phrase } from "./arrivees";

/** L'espace insécable devant « : », « ? » et « ! » : la phrase ne se coupe jamais là. */
const NBSP = String.fromCharCode(0xa0);

/* ---------- Les salons, retrouvés à leur nom ---------- */

/**
 * Le nom d'un salon, réduit à ses lettres et chiffres simples, sans accent : « ・「💬」général » devient « general ». Le serveur
 * décore ses noms (émoji, crochets, points) : seul le mot compte.
 */
export function channelKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Le salon général : son nom, décorations retirées. */
export const GENERAL_KEYS: readonly string[] = ["general"];
/** Le salon des tickets, où le robot « Le Gaulois » pose son guichet : son nom, décorations retirées. */
export const TICKET_KEYS: readonly string[] = ["ticket", "tickets"];

/** Un salon écrit du serveur, le seul type où le robot poste. */
export const TEXT_CHANNEL = 0;

export interface GuildChannel {
  id: string;
  type: number;
  name: string;
  permission_overwrites: { id: string; type: number; allow: string; deny: string }[];
}

export type ChannelSearch = { found: GuildChannel } | { found: null; count: number };

/**
 * Le salon écrit dont le nom, décorations retirées, est l'un de `keys`. Un seul doit répondre : s'il y en a deux, le robot ne
 * choisit pas à la place du serveur (`count` le dit), et s'il n'y en a aucun, `count` vaut zéro.
 */
export function findChannel(channels: readonly GuildChannel[], keys: readonly string[]): ChannelSearch {
  const matches = channels.filter((c) => c.type === TEXT_CHANNEL && keys.includes(channelKey(c.name)));
  return matches.length === 1 && matches[0] ? { found: matches[0] } : { found: null, count: matches.length };
}

const VIEW_CHANNEL = 1n << 10n;

/**
 * Le salon est-il ouvert à tous les membres du serveur ? Non si ses réglages retirent « Voir le salon » à tout le monde
 * (`@everyone`, dont le numéro est celui du serveur). Les tickets que le robot « Le Gaulois » ouvre pour chaque joueur sont
 * ainsi fermés, et l'un d'eux peut garder le nom « ticket » si son renommage échoue : le bouton ne doit jamais y mener.
 */
export function openToEveryone(channel: GuildChannel, guildId: string): boolean {
  const everyone = channel.permission_overwrites.find((o) => o.id === guildId);
  if (!everyone) return true;
  try {
    return (BigInt(/^[0-9]+$/.test(everyone.deny) ? everyone.deny : "0") & VIEW_CHANNEL) === 0n;
  } catch {
    return false;
  }
}

/** Les salons du serveur tels que Discord les donne : seulement ce dont le robot a besoin, le reste est ignoré. */
export function readChannels(body: unknown): GuildChannel[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((raw) => {
    if (raw === null || typeof raw !== "object") return [];
    const c = raw as Record<string, unknown>;
    if (typeof c["id"] !== "string" || !/^[0-9]{17,20}$/.test(c["id"]) || typeof c["type"] !== "number" || typeof c["name"] !== "string") return [];
    const overwrites = (Array.isArray(c["permission_overwrites"]) ? c["permission_overwrites"] : []).flatMap((o: unknown) => {
      if (o === null || typeof o !== "object") return [];
      const entry = o as Record<string, unknown>;
      return typeof entry["id"] === "string" && typeof entry["type"] === "number" ? [{ id: entry["id"], type: entry["type"], allow: String(entry["allow"] ?? "0"), deny: String(entry["deny"] ?? "0") }] : [];
    });
    return [{ id: c["id"], type: c["type"], name: c["name"], permission_overwrites: overwrites }];
  });
}

/**
 * Ce qu'il faut au robot dans le salon général : le voir, y écrire, y joindre l'image. Rien de plus : il n'y lit rien et n'y
 * retire rien. Un salon ouvert à tous les membres les donne déjà.
 */
export const GENERAL_PERMISSIONS: readonly { bit: bigint; label: string }[] = [
  { bit: 1n << 10n, label: "Voir le salon" },
  { bit: 1n << 11n, label: "Envoyer des messages" },
  { bit: 1n << 15n, label: "Joindre des fichiers" },
];

/** Les droits du salon général qui manquent, par leur nom dans Discord. */
export const missingGeneralPermissions = (granted: bigint): string[] => GENERAL_PERMISSIONS.filter((p) => (granted & p.bit) === 0n).map((p) => p.label);

/* ---------- Ce que dit l'image ---------- */

/** La phrase autour du nom, comme le titre du modèle du pilote : « Ho ! Un nouveau membre ! », puis le nom. */
export const GENERAL_PHRASE: Phrase = { texte: `Ho${NBSP}! Un nouveau membre${NBSP}: {nom}` };
/** L'invite au-dessus, comme celle de l'image de « nouveaux » (`./accueillir`). */
export const GENERAL_COMMAND = "./bienvenue";

export interface GeneralTip {
  icone: IconePartieNom;
  titre: string;
  texte: string;
}

/**
 * Les quatre conseils, repris du message que le pilote a montré le 14 novembre 2026, en plus court. Ils ne promettent rien de
 * plus que lui : le ticket pour rejoindre le clan (le formulaire « Rejoindre le clan » du guichet demande le pseudo OpenFront),
 * le vocal, le Staff et les membres certifiés pour les questions. Le salon du tutoriel des rangs, que ce message citait, n'existe
 * plus pour Discord (« #inconnu ») : il n'est pas repris.
 */
export const GENERAL_TIPS: readonly GeneralTip[] = [
  { icone: "porte", titre: "Rejoindre le clan", texte: "Ouvre un ticket avec ton pseudo OpenFront" },
  { icone: "feu", titre: "Viens en vocal", texte: "Pour jouer avec les autres joueurs du clan" },
  { icone: "corbeau", titre: `Une question${NBSP}?`, texte: "Demande au Staff ou à un membre certifié" },
  { icone: "cor", titre: "Amuse-toi bien", texte: `Et ramène d'autres compagnons${NBSP}!` },
];

/**
 * Ce que l'image dit, pour un lecteur d'écran. `fullName` : le nom entier du joueur. `gaulois` : combien de Gaulois du village
 * ont été proposés au dessin ; sans eux, la bande du village n'a ni Gaulois ni bulle, et la description n'en parle pas.
 */
export function generalAlt(fullName: string, tag: string, gaulois = 0): string {
  const lower = (text: string) => text.charAt(0).toLocaleLowerCase("fr") + text.slice(1);
  const tips = GENERAL_TIPS.map((tip) => `${tip.titre.replace(/[\s?!]+$/u, "")} : ${lower(tip.texte.replace(/[\s!]+$/u, ""))}.`).join(" ");
  const village = gaulois > 0 ? " En bas, devant la palissade du village, des Gaulois du clan lui disent coucou." : " En bas, la palissade du village.";
  return `Image de bienvenue du clan [${tag}]. Ho ! Un nouveau membre : ${fullName}. ${tips}${village}`.slice(0, 1024);
}

/* ---------- Les Gaulois du village qui saluent ---------- */

/** Un membre du clan au pseudo public, tel que la liste des membres le donne : seul un tel membre peut paraître avec son nom. */
export interface VillageMember {
  /** Son identifiant public dans OpenFront : la clé de sa tenue. Jamais écrit sur l'image ni dans le journal. */
  id: string;
  /** Son pseudo public, écrit au-dessus de son Gaulois. */
  nom: string;
}

/**
 * Les Gaulois du village qui saluent le nouveau venu (demande du pilote, 14 novembre 2026 : « les Gaulois déjà enregistrés
 * qu'ils lui disent coucou, avec leurs personnages », « et leur pseudo légèrement écrit au-dessus »). Parmi les membres au
 * pseudo public dont le serveur a rendu la tenue, `max` au plus, tirés du numéro du message d'arrivée (`seed`) : toujours les
 * mêmes pour une arrivée, d'autres pour la suivante, et chacun a sa chance. Un pseudo en double ne paraît qu'une fois. Ce
 * n'est pas du temps réel : personne n'est dit « en ligne ».
 */
export function greeters<T>(members: readonly VillageMember[], tenues: ReadonlyMap<string, T>, seed: string, max: number): { nom: string; tenue: T }[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const candidates: { nom: string; tenue: T; rang: number }[] = [];
  for (const member of members) {
    const tenue = tenues.get(member.id);
    const nom = member.nom.trim();
    if (tenue === undefined || nom === "" || seenIds.has(member.id) || seenNames.has(nom.toLocaleLowerCase("fr"))) continue;
    seenIds.add(member.id);
    seenNames.add(nom.toLocaleLowerCase("fr"));
    candidates.push({ nom, tenue, rang: stableHash(`salut:${seed}:${member.id}`) });
  }
  return candidates
    .sort((a, b) => a.rang - b.rang)
    .slice(0, Math.max(0, max))
    .map(({ nom, tenue }) => ({ nom, tenue }));
}

/* ---------- Le message ---------- */

/** Le nom du fichier de l'image du salon général. Rien ne le relit : le salut ne part qu'une fois, juste après l'image de « nouveaux ». */
export const GENERAL_FILENAME = "bienvenue-gaulois.png";

export interface LinkButton {
  label: string;
  url: string;
}

/** L'adresse d'un salon du serveur : un clic l'ouvre dans Discord. */
export const channelUrl = (guildId: string, channelId: string): string => `https://discord.com/channels/${guildId}/${channelId}`;

/**
 * Les boutons sous l'image : le salon des tickets, s'il a été trouvé, et le site du clan. Des liens seulement : un clic ne fait
 * rien d'autre qu'ouvrir.
 */
export function generalButtons(guildId: string, ticketChannelId: string | null, siteUrl: string): LinkButton[] {
  const buttons: LinkButton[] = [];
  if (ticketChannelId) buttons.push({ label: "Salon des tickets", url: channelUrl(guildId, ticketChannelId) });
  if (siteUrl) buttons.push({ label: "Le site du clan", url: siteUrl });
  return buttons;
}

/**
 * Le message du salon général : la mention du nouveau venu, seule en texte, pour qu'il reçoive la notification, comme dans le
 * modèle du pilote ; puis l'image et ses boutons. Personne d'autre ne peut être mentionné, même si un nom ressemblait à
 * « @everyone ». Pas de message discret : le salut doit se voir.
 */
export function generalPayload(userId: string, alt: string, buttons: readonly LinkButton[]): Record<string, unknown> {
  if (!/^[0-9]{17,20}$/.test(userId)) throw new Error("numéro de joueur inattendu");
  return {
    content: `<@${userId}>`,
    allowed_mentions: { parse: [], users: [userId] },
    attachments: [{ id: 0, filename: GENERAL_FILENAME, description: alt }],
    ...(buttons.length > 0 ? { components: [{ type: 1, components: buttons.map(({ label, url }) => ({ type: 2, style: 5, label, url })) }] } : {}),
  };
}

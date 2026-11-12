/**
 * Les arrivées sur le serveur Discord du clan : le robot remplace le message d'arrivée de Discord (« Un … sauvage apparaît. »)
 * par une image de bienvenue au nom du nouveau venu, dans le même salon. Demandé par le pilote le 12 novembre 2026.
 *
 * Ici, ce qui se calcule sans réseau ni dessin : les phrases, le choix de la phrase et du décor d'un message, le nom à écrire,
 * et les messages à remplacer. L'image est dans `arrivees-image.ts`, les appels à Discord dans `arrivees-discord.ts`.
 *
 * Rien n'est gardé : ni dans `data/`, ni ailleurs. Le salon lui-même dit ce qui reste à faire. Un message d'arrivée encore là
 * est à remplacer ; l'image qui le remplace porte son numéro dans le nom de son fichier, pour ne jamais partir deux fois.
 */
import { z } from "zod";

/* ---------- Les décors et les phrases ---------- */

/** Les décors de l'image : voir `arrivees-decors.ts`. */
export const DECORS = ["etendard", "matrice", "bouclier", "foret", "carte", "terminal"] as const;
export type Decor = (typeof DECORS)[number];

export interface Phrase {
  /** La phrase entière, où `{nom}` marque la place du nom. */
  texte: string;
  /** Les décors qui vont avec elle. */
  decors: readonly Decor[];
}

export const NAME_SLOT = "{nom}";
/** L'espace insécable devant « : » et « ! » : la phrase ne se coupe jamais là. */
const NBSP = String.fromCharCode(0xa0);

/**
 * Les phrases de bienvenue, à la manière de celles de Discord, dans le thème du clan : le village et la machine du site.
 * Aucune ne dit rien du joueur : elles n'accordent ni le genre ni le nombre avec son nom. Aucune n'affirme non plus un fait qui
 * pourrait être faux : rejoindre le serveur Discord n'est pas entrer dans le clan, personne n'a tapé de mot de passe, et
 * l'image peut partir alors que le joueur n'est plus en ligne. Le serveur est « le village » ; le clan n'y est pas nommé.
 */
export const PHRASES: readonly Phrase[] = [
  { texte: "Un {nom} sauvage surgit de la forêt.", decors: ["foret"] },
  { texte: "{nom} vient de franchir la palissade.", decors: ["foret", "bouclier"] },
  { texte: "{nom} pousse la porte du village.", decors: ["foret", "etendard"] },
  { texte: `Une place près du feu pour {nom}${NBSP}!`, decors: ["foret"] },
  { texte: `Sonnez le carnyx${NBSP}: {nom} est là${NBSP}!`, decors: ["etendard", "bouclier"] },
  { texte: "{nom} rejoint le village.", decors: ["etendard", "bouclier"] },
  { texte: "Les guetteurs annoncent {nom}.", decors: ["etendard", "carte", "foret"] },
  { texte: `Un bouclier de plus au village${NBSP}: {nom}.`, decors: ["bouclier"] },
  { texte: "{nom} vient de se glisser derrière nos boucliers.", decors: ["bouclier"] },
  { texte: "{nom} a trouvé le chemin de l'oppidum.", decors: ["carte"] },
  { texte: `Nouveau point sur la carte${NBSP}: {nom}.`, decors: ["carte"] },
  { texte: `Transmission reçue${NBSP}: {nom} arrive au village.`, decors: ["terminal", "matrice"] },
  { texte: "Liaison établie avec {nom}.", decors: ["matrice", "terminal"] },
  { texte: `Signal capté${NBSP}: {nom} est parmi nous.`, decors: ["matrice", "carte"] },
  { texte: `Nouvelle entrée au journal du village${NBSP}: {nom}.`, decors: ["terminal"] },
  { texte: `Nouvelle arrivée détectée${NBSP}: {nom}.`, decors: ["matrice", "terminal", "carte"] },
];

/** Ce qui s'écrit avant et après le nom sur l'image. Une fin qui n'est qu'un point ou un « ! » ne s'y écrit pas. */
export function phraseParts(phrase: Phrase): { avant: string; apres: string } {
  const [avant = "", apres = ""] = phrase.texte.split(NAME_SLOT);
  const end = apres.trim();
  return { avant: avant.trim(), apres: /[\p{L}\p{N}]/u.test(end) ? end : "" };
}

/**
 * La phrase entière, avec le nom : pour la description de l'image, que lisent les lecteurs d'écran. Le nom est posé tel quel :
 * un « $ » dans un nom n'est pas lu comme un modèle de remplacement.
 */
export const sentence = (phrase: Phrase, name: string): string => phrase.texte.replace(NAME_SLOT, () => name);

/**
 * Un tirage stable, sur 32 bits : le même message donne toujours la même phrase et le même décor. FNV-1a, puis le brassage
 * final de MurmurHash3 : sans lui, les bits de poids faible de deux tirages du même numéro se suivent (le dernier n'est que la
 * parité des caractères), et certaines phrases ne sortiraient jamais avec certains décors.
 */
export function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export interface ArrivalStyle {
  /** Le rang de la phrase dans `PHRASES`. */
  phrase: number;
  decor: Decor;
}

/** Combien des dernières phrases, et des derniers décors, ne reviennent pas. */
export const NO_REPEAT = 8;
export const NO_REPEAT_DECORS = 2;

/**
 * Le décor et la phrase d'un message d'arrivée, tirés de son numéro : le décor d'abord, pour que les six sortent aussi
 * souvent les uns que les autres, puis une des phrases qui vont avec lui. `recent` : les dernières images du robot dans le
 * salon, de la plus récente à la plus ancienne. Aucun des deux derniers décors ne revient, ni aucune des huit dernières
 * phrases : les arrivées qui se suivent ne se ressemblent pas. Avec seize phrases et six décors, c'est toujours possible.
 */
export function arrivalStyle(messageId: string, recent: readonly ArrivalStyle[] = []): ArrivalStyle {
  const turn = stableHash(`decor:${messageId}`) % DECORS.length;
  const pick = stableHash(`phrase:${messageId}`);
  const lastDecors = recent.slice(0, NO_REPEAT_DECORS).map((r) => r.decor);
  const lastPhrases = recent.slice(0, NO_REPEAT).map((r) => r.phrase);
  // Si les règles ne laissaient rien (des phrases retirées un jour), elles se relâchent une à une : les phrases d'abord.
  for (const avoidDecors of [lastDecors, lastDecors.slice(0, 1), []]) {
    for (const avoidPhrases of [lastPhrases, lastPhrases.slice(0, 1), []]) {
      for (let k = 0; k < DECORS.length; k++) {
        const decor = DECORS[(turn + k) % DECORS.length]!;
        if (avoidDecors.includes(decor)) continue;
        const options = PHRASES.flatMap((phrase, index) => (phrase.decors.includes(decor) && !avoidPhrases.includes(index) ? [index] : []));
        if (options.length > 0) return { phrase: options[pick % options.length]!, decor };
      }
    }
  }
  return { phrase: 0, decor: PHRASES[0]?.decors[0] ?? "etendard" };
}

/* ---------- Le fichier de l'image, qui dit quel message elle remplace ---------- */

const MARKER = /^arrivee-([0-9]{17,20})-([0-9]{17,20})-([0-9]{1,3})-([a-z]{3,20})\.png$/;

/**
 * Le nom du fichier de l'image : le numéro du message qu'elle remplace, celui du joueur accueilli, sa phrase et son décor.
 * Le message du robot n'a pas de texte : c'est ce nom qui dit au passage suivant ce qui est déjà fait, et pour qui. Le numéro
 * d'un joueur n'est pas un secret : tout membre du serveur peut le copier.
 */
export const markerName = (messageId: string, userId: string, style: ArrivalStyle): string => `arrivee-${messageId}-${userId}-${style.phrase}-${style.decor}.png`;

/** Ce que dit le nom d'un fichier joint, ou `null` si ce n'est pas une image de bienvenue. */
export function readMarker(filename: string): { messageId: string; userId: string; style: ArrivalStyle } | null {
  const found = MARKER.exec(filename);
  if (!found) return null;
  const phrase = Number(found[3]);
  const decor = DECORS.find((d) => d === found[4]);
  if (!decor || phrase >= PHRASES.length) return null;
  return { messageId: found[1] ?? "", userId: found[2] ?? "", style: { phrase, decor } };
}

/* ---------- Ce que Discord donne ---------- */

const Snowflake = z.string().regex(/^[0-9]{17,20}$/);

export const DiscordUser = z.object({
  id: Snowflake,
  username: z.string(),
  /** Le nom affiché du compte, s'il en a un. */
  global_name: z.string().nullish(),
  avatar: z.string().nullish(),
  bot: z.boolean().optional(),
  /** Pour un robot : le compte qui le possède a-t-il la double authentification ? */
  mfa_enabled: z.boolean().optional(),
});
export type DiscordUser = z.infer<typeof DiscordUser>;

/** Un message du salon : seulement ce dont le robot a besoin. Le texte d'aucun message n'est lu, pas même celui du robot. */
export const ChannelMessage = z.object({
  id: Snowflake,
  type: z.number().int(),
  author: DiscordUser,
  /** Les fichiers joints : le passage ne garde que ceux des images du robot, pour leur nom. */
  attachments: z.array(z.object({ filename: z.string() })).optional(),
});
export type ChannelMessage = z.infer<typeof ChannelMessage>;

/** Le type du message « … a rejoint le serveur » de Discord. */
export const JOIN_MESSAGE_TYPE = 7;
/** Au-delà, le message de Discord reste : une image de bienvenue deux heures après n'a plus de sens. */
export const MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** Les images d'un passage : au-delà, la suite attend le passage suivant, cinq minutes après. */
export const MAX_IMAGES_PER_PASS = 5;
/** Un joueur qui sort et revient n'a pas de nouvelle image avant un jour : sortir et rentrer ne fait pas pleuvoir les images. */
export const REWELCOME_AFTER_MS = 24 * 60 * 60 * 1000;

const DISCORD_EPOCH = 1_420_070_400_000n;

/** L'heure d'un message, écrite dans son numéro. */
export const snowflakeTime = (id: string): number => Number((BigInt(id) >> 22n) + DISCORD_EPOCH);

const older = (a: string, b: string): number => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);

export interface ArrivalTask {
  message: ChannelMessage;
  /** L'image est déjà dans le salon : il ne reste qu'à retirer le message de Discord. */
  posted: boolean;
}

export interface ArrivalPlan {
  /** À traiter, de la plus ancienne arrivée à la plus récente. */
  tasks: ArrivalTask[];
  /** Les styles des dernières images du robot, de la plus récente à la plus ancienne. */
  recent: ArrivalStyle[];
  /** Les messages d'arrivée laissés tels quels, et pourquoi. Aucun nom n'y est écrit. */
  left: { id: string; reason: string }[];
  /** Les arrivées remises au passage suivant : plus de cinq images d'un coup. */
  later: number;
}

/**
 * Ce qu'il y a à faire dans le salon, d'après ses derniers messages.
 *
 * - Un message d'arrivée de moins de deux heures est remplacé, sauf celui d'un robot.
 * - Un message dont l'image est déjà dans le salon est à retirer, quel que soit son âge : il ne reste jamais à côté d'elle.
 * - Un joueur accueilli par une image depuis moins d'un jour ne l'est pas deux fois : s'il sort et revient, le message de
 *   Discord reste. Sortir et rentrer ne fait donc pas pleuvoir les images. Au-delà d'un jour, il est de nouveau accueilli.
 * - Cinq images au plus par passage : les suivantes attendent le passage d'après.
 */
export function arrivalPlan(messages: readonly ChannelMessage[], botId: string, now: number): ArrivalPlan {
  const ours = messages.filter((m) => m.author.id === botId).sort((a, b) => older(b.id, a.id));
  const replaced = new Set<string>();
  const welcomed = new Set<string>();
  const recent: ArrivalStyle[] = [];
  for (const message of ours) {
    for (const file of message.attachments ?? []) {
      const marker = readMarker(file.filename);
      if (!marker) continue;
      replaced.add(marker.messageId);
      recent.push(marker.style);
      if (now - snowflakeTime(message.id) < REWELCOME_AFTER_MS) welcomed.add(marker.userId);
    }
  }

  const tasks: ArrivalTask[] = [];
  const left: ArrivalPlan["left"] = [];
  let images = 0;
  let later = 0;
  const joins = messages.filter((m) => m.type === JOIN_MESSAGE_TYPE).sort((a, b) => older(a.id, b.id));
  for (const message of joins) {
    if (replaced.has(message.id)) {
      tasks.push({ message, posted: true });
      continue;
    }
    if (now - snowflakeTime(message.id) > MAX_AGE_MS) continue;
    if (message.author.bot) {
      left.push({ id: message.id, reason: "c'est un robot" });
      continue;
    }
    if (welcomed.has(message.author.id)) {
      left.push({ id: message.id, reason: "ce joueur a déjà son image" });
      continue;
    }
    if (images >= MAX_IMAGES_PER_PASS) {
      later++;
      continue;
    }
    images++;
    welcomed.add(message.author.id);
    tasks.push({ message, posted: false });
  }
  return { tasks, recent, left, later };
}

/* ---------- Le nom à écrire ---------- */

/** Un nom Discord fait 32 signes au plus. */
export const MAX_NAME = 32;
/** Si rien du nom ne se dessine : ni son nom affiché, ni son nom d'utilisateur. */
export const FALLBACK_NAME = "Nouveau Gaulois";

/** Un signe qui ne se voit pas : contrôle, espace de largeur nulle, sens d'écriture forcé, variante d'émoji. */
function invisible(cp: number): boolean {
  return (
    cp <= 0x1f ||
    (cp >= 0x7f && cp <= 0x9f) ||
    cp === 0xad ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp === 0xfeff ||
    (cp >= 0xe0000 && cp <= 0xe0fff)
  );
}

/**
 * Un nom libre, remis d'aplomb : les lettres de fantaisie reviennent à leurs lettres ordinaires (forme NFKC), les signes
 * invisibles partent, les espaces se réduisent à un seul.
 */
export function tidyName(raw: string): string {
  let out = "";
  for (const char of raw.normalize("NFKC")) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d || /\p{Zs}/u.test(char)) out += " ";
    else if (!invisible(cp)) out += char;
  }
  return out.replace(/ +/g, " ").trim();
}

/**
 * Le nom écrit sur l'image : le nom affiché sans ce que les polices du site ne savent pas dessiner (émoji, idéogrammes).
 * S'il n'en reste ni lettre ni chiffre, le nom d'utilisateur, que Discord limite aux lettres simples. Le message, lui, garde
 * la mention du joueur : son vrai nom s'y lit en entier.
 */
export function drawnName(display: string, username: string, draws: (char: string) => boolean): string {
  for (const candidate of [display, username]) {
    const kept = [...tidyName(candidate)]
      .filter((char) => char === " " || draws(char))
      .join("")
      .replace(/ +/g, " ")
      .trim();
    if (/[\p{L}\p{N}]/u.test(kept)) return [...kept].slice(0, MAX_NAME).join("").trim();
  }
  return FALLBACK_NAME;
}

/** L'initiale qui remplace la photo quand le joueur n'en a pas : jamais le logo de Discord. */
export function initialOf(name: string): string {
  const first = [...name].find((char) => /[\p{L}\p{N}]/u.test(char));
  return (first ?? "G").toLocaleUpperCase("fr");
}

/**
 * Le nom ressemble-t-il à une adresse ou à une invitation ? C'est alors une publicité, que l'image écrirait en très grand aux
 * couleurs du clan : ce joueur n'a pas d'image, et le message de Discord reste, que la modération traite comme d'habitude.
 * Reconnus : « http », « www. », une invitation Discord, une adresse suivie d'un chemin (« exemple.io/cadeau »), même écrits
 * avec des espaces ; et une extension qui n'est presque jamais un nom (« .com », « .xyz »…). Un « .fr », un « .gg » ou un
 * « .tv » seuls ne le sont pas : beaucoup de joueurs s'appellent ainsi.
 */
export function looksLikeLink(name: string): boolean {
  const packed = name.replace(/\s+/g, "");
  return /https?:|www\.|discord\.gg|discord(?:app)?\.com|\.[a-z]{2,6}\/./i.test(packed) || /\.(?:com|net|org|xyz|shop|store|top|club|site|online|link|ru)(?![\p{L}\p{N}])/iu.test(name);
}

/* ---------- La photo de profil ---------- */

const AVATAR_HASH = /^(?:a_)?[0-9a-f]{32}$/;
/** Le côté demandé à Discord : une puissance de deux, assez pour le médaillon de l'image. */
export const AVATAR_SIZE = 256;
/** Une photo de profil fait quelques dizaines de kilo-octets : au-delà, la réponse n'en est pas une. */
export const MAX_AVATAR_BYTES = 4_000_000;

/**
 * L'adresse de la photo de profil : celle du serveur si le joueur en a une, sinon celle de son compte. `null` sans photo, ou
 * si l'empreinte n'a pas la forme attendue. Une photo animée est demandée en image fixe.
 */
export function avatarUrl(guildId: string, userId: string, memberAvatar: string | null | undefined, userAvatar: string | null | undefined): string | null {
  if (memberAvatar && AVATAR_HASH.test(memberAvatar)) return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${memberAvatar}.png?size=${AVATAR_SIZE}`;
  if (userAvatar && AVATAR_HASH.test(userAvatar)) return `https://cdn.discordapp.com/avatars/${userId}/${userAvatar}.png?size=${AVATAR_SIZE}`;
  return null;
}

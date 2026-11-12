/**
 * Les tickets d'assistance du serveur Discord du clan (docs/DIRECTION.md, « Les tickets d'assistance ») : demandés par le
 * pilote le 12 novembre 2026, pour refaire en mieux ceux de DraftBot, avec le robot « Le Gaulois ».
 *
 * - `/tickets`, tapée par qui peut gérer le serveur, pose le guichet dans le salon où elle est tapée : l'image que le site
 *   dessine (`guichet` dans `/commandes.json`) et trois boutons, « Rejoindre le clan », « Poser une question » et
 *   « Signaler un tricheur ». Avant de rien poser, la fonction vérifie les droits du robot, que la catégorie des tickets et
 *   le journal sont privés, et que le rôle de l'encadrement voit la catégorie ; elle dit qui voit les tickets.
 * - Un bouton ouvre un court formulaire, propre à chaque demande. À l'envoi, le robot ouvre un salon dans la catégorie, que
 *   seuls voient le joueur et ceux qui voient déjà la catégorie, y écrit ses réponses, prévient le rôle de l'encadrement et
 *   le note au journal. Un joueur n'a qu'un ticket ouvert à la fois.
 * - Dans le salon, « Je m'en occupe » montre qui a pris la demande et prévient le joueur ; « Fermer le ticket » demande une
 *   raison, la note au journal, puis supprime le salon dix secondes plus tard.
 *
 * Rien n'est gardé hors de Discord : la catégorie, le journal et le rôle sont écrits dans les boutons du guichet, le joueur
 * d'un ticket dans les boutons et les droits de son salon. Le robot ne lit jamais ce que les membres écrivent (« Message
 * Content Intent » reste coupé) : seulement les réponses aux formulaires, que Discord lui envoie, et ses propres messages.
 *
 * N'importe d'`index.ts` que des types : `index.ts` importe ce fichier.
 */
import type { CommandEntry, Deps } from "./index.ts";

/** Le début du `custom_id` de chaque bouton et formulaire des tickets : `index.ts` leur envoie ceux-là seulement. */
export const TICKET_PREFIX = "ticket:";
/** La commande qui pose le guichet, et ses options. `src/lib/discord-commande.ts` les crée : un test le vérifie. */
export const TICKETS_COMMAND_NAME = "tickets";
export const TICKETS_OPTIONS = { category: "categorie", journal: "journal", staff: "encadrement" } as const;
/** Le site, comme dans `index.ts` (un test vérifie qu'ils sont égaux). */
export const TICKETS_SITE_URL = "https://les-gaulois.github.io";
/** La page du site où sont les étapes pour rejoindre le clan. */
export const JOIN_URL = `${TICKETS_SITE_URL}/rejoindre`;
/** Le temps laissé pour lire le message de fermeture, avant que le salon disparaisse. */
export const CLOSE_DELAY_MS = 10_000;
/** Discord ne met pas plus de 50 salons dans une catégorie. */
export const CATEGORY_LIMIT = 50;
/** Au-delà, en 24 heures, un joueur attend : ouvrir et fermer en boucle préviendrait l'encadrement à chaque fois. */
export const TICKETS_PER_DAY = 3;

const EPHEMERAL = 64;
const COMPONENTS_V2 = 32768;
/** Discord attend la réponse à un bouton en trois secondes : la recherche d'un ticket déjà ouvert n'en prend pas plus d'une. */
const PRECHECK_TIMEOUT_MS = 900;
const SNOWFLAKE = /^[0-9]{17,20}$/;

/* ---------- Les droits ---------- */

/** Les droits de Discord dont les tickets ont besoin, avec leur nom dans Discord en français. */
export const PERMISSIONS = {
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  MANAGE_ROLES: 1n << 28n,
} as const;
const P = PERMISSIONS;

interface Need {
  bit: bigint;
  label: string;
}

/**
 * Dans la catégorie : ouvrir un salon, y donner l'accès au joueur, y écrire. Le robot ne peut donner au joueur que des droits
 * qu'il a lui-même dans la catégorie : voir, écrire, joindre une capture, voir les anciens messages.
 */
export const CATEGORY_NEEDS: readonly Need[] = [
  { bit: P.VIEW_CHANNEL, label: "Voir les salons" },
  { bit: P.MANAGE_CHANNELS, label: "Gérer les salons" },
  { bit: P.MANAGE_ROLES, label: "Gérer les permissions" },
  { bit: P.SEND_MESSAGES, label: "Envoyer des messages" },
  { bit: P.EMBED_LINKS, label: "Intégrer des liens" },
  { bit: P.ATTACH_FILES, label: "Joindre des fichiers" },
  { bit: P.READ_MESSAGE_HISTORY, label: "Voir les anciens messages" },
];
/** Dans le journal : écrire, et répondre à l'entrée d'ouverture quand le ticket se ferme. */
export const JOURNAL_NEEDS: readonly Need[] = [
  { bit: P.VIEW_CHANNEL, label: "Voir le salon" },
  { bit: P.SEND_MESSAGES, label: "Envoyer des messages" },
  { bit: P.READ_MESSAGE_HISTORY, label: "Voir les anciens messages" },
];
/** Dans le salon du guichet : poster l'image et les boutons. */
export const PANEL_NEEDS: readonly Need[] = [
  { bit: P.VIEW_CHANNEL, label: "Voir le salon" },
  { bit: P.SEND_MESSAGES, label: "Envoyer des messages" },
  { bit: P.EMBED_LINKS, label: "Intégrer des liens" },
];
/** Ce que reçoit le joueur dans son salon : le voir, y écrire, y joindre une capture, en relire le début. */
export const OPENER_ALLOW = P.VIEW_CHANNEL | P.SEND_MESSAGES | P.EMBED_LINKS | P.ATTACH_FILES | P.READ_MESSAGE_HISTORY;

export const bits = (value: unknown): bigint => {
  try {
    return typeof value === "string" && /^[0-9]{1,30}$/.test(value) ? BigInt(value) : typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : 0n;
  } catch {
    return 0n;
  }
};

export interface Overwrite {
  id: string;
  /** 0 : un rôle ; 1 : un membre. */
  type: number;
  allow: bigint;
  deny: bigint;
}

export interface Role {
  id: string;
  name: string;
  permissions: bigint;
  managed: boolean;
  mentionable: boolean;
}

export interface GuildChannel {
  id: string;
  type: number;
  name: string;
  parentId: string | null;
  overwrites: Overwrite[];
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function parseOverwrites(value: unknown): Overwrite[] {
  return list(value).flatMap((item) => {
    const o = record(item);
    const id = text(o?.["id"]);
    // Discord écrit 0 ou 1 ; d'anciennes versions écrivaient « role » ou « member ».
    const kind = o?.["type"] === 1 || o?.["type"] === "member" ? 1 : o?.["type"] === 0 || o?.["type"] === "role" ? 0 : -1;
    return SNOWFLAKE.test(id) && kind >= 0 ? [{ id, type: kind, allow: bits(o?.["allow"]), deny: bits(o?.["deny"]) }] : [];
  });
}

/** Un salon tel que l'API le donne, relu sans lui faire confiance : `null` s'il n'a pas la forme attendue. */
export function parseChannel(value: unknown): GuildChannel | null {
  const c = record(value);
  const id = text(c?.["id"]);
  const type = c?.["type"];
  if (!SNOWFLAKE.test(id) || typeof type !== "number") return null;
  const parent = text(c?.["parent_id"]);
  return { id, type, name: text(c?.["name"]).slice(0, 100), parentId: SNOWFLAKE.test(parent) ? parent : null, overwrites: parseOverwrites(c?.["permission_overwrites"]) };
}

export function parseRoles(value: unknown): Role[] {
  return list(value).flatMap((item) => {
    const r = record(item);
    const id = text(r?.["id"]);
    return SNOWFLAKE.test(id) ? [{ id, name: text(r?.["name"]).slice(0, 100), permissions: bits(r?.["permissions"]), managed: r?.["managed"] === true, mentionable: r?.["mentionable"] === true }] : [];
  });
}

/**
 * Les droits d'un membre dans un salon, calculés comme Discord le fait (le même calcul que `src/lib/arrivees-discord.ts`) :
 * ceux de ses rôles, puis les réglages du salon pour tout le monde, pour ses rôles, puis pour lui. Un administrateur a tout.
 */
export function channelPermissions(guildId: string, roles: readonly Role[], memberRoles: readonly string[], memberId: string, overwrites: readonly Overwrite[]): bigint {
  const mine = new Set([guildId, ...memberRoles]);
  let base = 0n;
  for (const role of roles) if (mine.has(role.id)) base |= role.permissions;
  if (base & P.ADMINISTRATOR) return ~0n;
  const everyone = overwrites.find((o) => o.type === 0 && o.id === guildId);
  if (everyone) base = (base & ~everyone.deny) | everyone.allow;
  let allow = 0n;
  let deny = 0n;
  for (const o of overwrites) {
    if (o.type === 0 && o.id !== guildId && mine.has(o.id)) {
      allow |= o.allow;
      deny |= o.deny;
    }
  }
  base = (base & ~deny) | allow;
  const own = overwrites.find((o) => o.type === 1 && o.id === memberId);
  if (own) base = (base & ~own.deny) | own.allow;
  return base;
}

/** Un membre sans aucun rôle, qui vient d'arriver, voit-il ce salon ? */
export const everyoneCanView = (guildId: string, roles: readonly Role[], channel: GuildChannel): boolean =>
  (channelPermissions(guildId, roles, [], "", channel.overwrites) & P.VIEW_CHANNEL) !== 0n;

/**
 * Les rôles qui voient ce salon : chacun essayé seul, avec @everyone. Les rôles d'administrateur n'y sont pas : ils voient
 * tout, et la réponse le dit à part.
 */
export function rolesThatView(guildId: string, roles: readonly Role[], channel: GuildChannel): Role[] {
  return roles.filter((role) => role.id !== guildId && (role.permissions & P.ADMINISTRATOR) === 0n && (channelPermissions(guildId, roles, [role.id], "", channel.overwrites) & P.VIEW_CHANNEL) !== 0n);
}

/** Les droits qui manquent, par leur nom dans Discord, entre guillemets. */
export const missing = (granted: bigint, needs: readonly Need[]): string[] => needs.filter((n) => (granted & n.bit) === 0n).map((n) => `« ${n.label} »`);

/* ---------- Les trois demandes ---------- */

export type TicketKind = "recrutement" | "question" | "signalement";
export const TICKET_KINDS: readonly TicketKind[] = ["recrutement", "question", "signalement"];

export interface TicketField {
  /** Son `custom_id` dans le formulaire. */
  id: string;
  /** La question du formulaire : 45 signes au plus. */
  label: string;
  /** Son nom dans le salon et au journal. */
  short: string;
  /** 1 : une ligne ; 2 : un paragraphe. */
  style: 1 | 2;
  required: boolean;
  max: number;
  placeholder: string;
  /** Une adresse d'OpenFront s'écrit en lien ; tout le reste, en texte. */
  link?: boolean;
}

export interface KindSpec {
  /** Le texte du bouton du guichet et le titre du formulaire. */
  button: string;
  /** 1 : bleu ; 2 : gris ; 4 : rouge. */
  style: 1 | 2 | 4;
  /** Le titre du message dans le salon. */
  heading: string;
  /** Le début du nom du salon. */
  prefix: string;
  /** La couleur du bord du message, celles du site : bleu, filet appuyé (`line-strong`), rouge. */
  color: number;
  fields: readonly TicketField[];
  /** Une ligne d'aide sous les réponses, ou rien. */
  help: string | null;
}

/** Les couleurs du site (`docs/DESIGN.md`) : le bleu, le filet appuyé (`line-strong`) et le rouge. */
const COLORS = { blue: 0x0b5fff, muted: 0x5469ae, red: 0xff1a2e } as const;

/**
 * Les trois demandes du guichet de DraftBot (« Recrutement ? Une question ? Un joueur Cheat ? »), chacune avec son
 * formulaire. L'aide du recrutement reprend les étapes de la page Rejoindre du site (le clan est sur invitation).
 */
export const KINDS: Record<TicketKind, KindSpec> = {
  recrutement: {
    button: "Rejoindre le clan",
    style: 1,
    heading: "Rejoindre le clan",
    prefix: "recrutement",
    color: COLORS.blue,
    fields: [
      { id: "pseudo", label: "Votre pseudo dans OpenFront", short: "Pseudo dans OpenFront", style: 1, required: true, max: 40, placeholder: "Celui qui s'affiche en partie" },
      { id: "profil", label: "Le lien de votre profil OpenFront", short: "Profil OpenFront", style: 1, required: false, max: 120, placeholder: "https://openfront.io/player/…", link: true },
      { id: "mot", label: "Un mot pour l'encadrement", short: "Un mot pour l'encadrement", style: 2, required: false, max: 500, placeholder: "Facultatif" },
    ],
    help: `Dans le jeu : section Clans, onglet Rechercher, [GAL], puis « Demander une invitation ». Un officier vous répond. Les étapes : <${JOIN_URL}>`,
  },
  question: {
    button: "Poser une question",
    style: 2,
    heading: "Une question",
    prefix: "question",
    color: COLORS.muted,
    fields: [{ id: "question", label: "Votre question", short: "Question", style: 2, required: true, max: 1500, placeholder: "Sur le jeu, le clan, le site…" }],
    help: null,
  },
  signalement: {
    button: "Signaler un tricheur",
    style: 4,
    heading: "Signalement d'un tricheur",
    prefix: "signalement",
    color: COLORS.red,
    fields: [
      { id: "joueur", label: "Le pseudo du joueur", short: "Joueur signalé", style: 1, required: true, max: 40, placeholder: "Tel qu'il s'affiche en partie" },
      { id: "partie", label: "Le lien ou le numéro de la partie", short: "Partie", style: 1, required: false, max: 120, placeholder: "Facultatif", link: true },
      { id: "faits", label: "Ce qui s'est passé", short: "Ce qui s'est passé", style: 2, required: true, max: 1500, placeholder: "Quand, et ce que vous avez vu" },
    ],
    help: "Envoyez ici vos captures ou votre vidéo de la partie.",
  },
};

const isKind = (value: string): value is TicketKind => (TICKET_KINDS as readonly string[]).includes(value);

/* ---------- Les identifiants des boutons et des formulaires ---------- */

/**
 * Ce que porte chaque bouton ou formulaire, dans son `custom_id` (100 signes au plus) : le guichet porte la catégorie, le
 * journal et le rôle de l'encadrement ; un ticket, le rôle, le journal, son entrée au journal (« 0 » sans elle) et le joueur.
 */
export interface DeskConfig {
  category: string;
  journal: string;
  staff: string;
}
interface TicketRef {
  staff: string;
  journal: string;
  logMessage: string | null;
  opener: string;
}
export type TicketAction =
  | ({ action: "ouvrir"; kind: TicketKind } & DeskConfig)
  | ({ action: "form"; kind: TicketKind } & DeskConfig)
  | { action: "prendre"; staff: string; opener: string }
  | ({ action: "fermer" } & TicketRef)
  | ({ action: "clore" } & TicketRef);

/** Les réglages du guichet, sans rien d'autre de l'objet d'où ils viennent. */
const deskOf = (c: DeskConfig): DeskConfig => ({ category: c.category, journal: c.journal, staff: c.staff });

export function ticketCustomId(a: TicketAction): string {
  switch (a.action) {
    case "ouvrir":
    case "form":
      return `${TICKET_PREFIX}${a.action}:${a.kind}:${a.category}:${a.journal}:${a.staff}`;
    case "prendre":
      return `${TICKET_PREFIX}prendre:${a.staff}:${a.opener}`;
    case "fermer":
    case "clore":
      return `${TICKET_PREFIX}${a.action}:${a.staff}:${a.journal}:${a.logMessage ?? "0"}:${a.opener}`;
  }
}

/** Un `custom_id` des tickets, relu : `null` s'il n'a pas la forme attendue. */
export function parseTicketId(customId: string): TicketAction | null {
  if (customId.length > 100 || !customId.startsWith(TICKET_PREFIX)) return null;
  const [action = "", ...rest] = customId.slice(TICKET_PREFIX.length).split(":");
  const ids = (values: string[]) => values.every((v) => SNOWFLAKE.test(v));
  if ((action === "ouvrir" || action === "form") && rest.length === 4) {
    const [kind = "", category = "", journal = "", staff = ""] = rest;
    if (!isKind(kind) || !ids([category, journal, staff])) return null;
    return action === "ouvrir" ? { action, kind, category, journal, staff } : { action, kind, category, journal, staff };
  }
  if (action === "prendre" && rest.length === 2) {
    const [staff = "", opener = ""] = rest;
    return ids([staff, opener]) ? { action, staff, opener } : null;
  }
  if ((action === "fermer" || action === "clore") && rest.length === 4) {
    const [staff = "", journal = "", logMessage = "", opener = ""] = rest;
    if (!ids([staff, journal, opener]) || (logMessage !== "0" && !SNOWFLAKE.test(logMessage))) return null;
    const ref: TicketRef = { staff, journal, logMessage: logMessage === "0" ? null : logMessage, opener };
    return action === "fermer" ? { action, ...ref } : { action, ...ref };
  }
  return null;
}

/** Tous les `custom_id` d'un message, à toute profondeur (Components V2 : conteneurs, rangées, sections). */
export function customIdsOf(components: unknown): string[] {
  const found: string[] = [];
  const walk = (value: unknown, depth: number): void => {
    if (depth > 6) return;
    for (const item of list(value)) {
      const c = record(item);
      if (!c) continue;
      const id = c["custom_id"];
      if (typeof id === "string") found.push(id);
      walk(c["components"], depth + 1);
      if (c["accessory"]) walk([c["accessory"]], depth + 1);
      if (c["component"]) walk([c["component"]], depth + 1);
    }
  };
  walk(components, 0);
  return found;
}

/** Les réponses d'un formulaire envoyé : chaque champ par son `custom_id`, dans des rangées ou des étiquettes. */
export function modalValues(data: Record<string, unknown>): Map<string, string> {
  const values = new Map<string, string>();
  const walk = (value: unknown, depth: number): void => {
    if (depth > 4) return;
    for (const item of list(value)) {
      const c = record(item);
      if (!c) continue;
      const id = c["custom_id"];
      const v = c["value"];
      if (typeof id === "string" && typeof v === "string") values.set(id, v);
      walk(c["components"], depth + 1);
      if (c["component"]) walk([c["component"]], depth + 1);
    }
  };
  walk(data["components"], 0);
  return values;
}

/* ---------- Les textes ---------- */

/**
 * Une réponse tapée par un joueur, redite dans un message : lignes gardées (douze au plus), mais ni mise en forme, ni
 * mention, ni lien, ni émoji du serveur (« :nom: ») possibles ; les émojis ordinaires restent. Rien n'est coupé en
 * silence : au-delà de `max` caractères, « … ».
 */
export function quoteAnswer(input: string, max: number): string {
  const clean = input
    .replace(/\r\n?/g, "\n")
    // Les signes de contrôle, sauf le retour à la ligne.
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .trim();
  // Par caractères entiers : un émoji coupé en deux deviendrait un signe illisible.
  const chars = Array.from(clean);
  const cut = chars.length > max ? `${chars.slice(0, max).join("").trimEnd()}…` : clean;
  const lines = cut.split("\n").map((line) => line.trimEnd());
  const kept = lines.length > 12 ? [...lines.slice(0, 11), lines.slice(11).join(" ")] : lines;
  return kept
    .map((line) => line.replace(/[\\*_~`|>#\-[\]():/<@]/g, "\\$&"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Une adresse d'OpenFront, écrite en lien sans carte d'aperçu ; `null` si ce n'en est pas une. */
export function openfrontLink(input: string): string | null {
  const value = input.trim();
  return value.length <= 200 && /^https:\/\/(?:www\.)?openfront\.io\/[A-Za-z0-9/#?=&%._~+-]*$/.test(value) ? `<${value}>` : null;
}

export interface Answer {
  label: string;
  /** Déjà mise en forme : un lien, ou le texte échappé. */
  value: string;
}

/** Les réponses d'un formulaire, dans l'ordre de ses champs ; une réponse vide n'est pas écrite. */
export function answersOf(kind: TicketKind, values: Map<string, string>): Answer[] {
  return KINDS[kind].fields.flatMap((field) => {
    const raw = (values.get(field.id) ?? "").trim();
    if (raw === "") return [];
    const link = field.link ? openfrontLink(raw) : null;
    return [{ label: field.short, value: link ?? quoteAnswer(raw, field.max) }];
  });
}

/** Les champs obligatoires laissés vides (Discord les refuse déjà ; la fonction ne lui fait pas confiance). */
export const missingAnswers = (kind: TicketKind, values: Map<string, string>): string[] => KINDS[kind].fields.filter((f) => f.required && (values.get(f.id) ?? "").trim() === "").map((f) => f.short);

const answersText = (answers: readonly Answer[]): string => answers.map((a) => `**${a.label}**\n${a.value}`).join("\n");

/** Le nom du salon : la demande, puis le nom d'utilisateur Discord du joueur, en minuscules, sans accents ni espaces. */
export function ticketChannelName(kind: TicketKind, username: string): string {
  const name = username
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return `${KINDS[kind].prefix}-${name || "joueur"}`;
}

/** L'heure d'un numéro de Discord, en secondes : les 42 premiers bits comptent les millisecondes depuis 2015. */
export const snowflakeSeconds = (id: string): number => (SNOWFLAKE.test(id) ? Number(((BigInt(id) >> 22n) + 1_420_070_400_000n) / 1000n) : 0);

export const TICKET_MESSAGES = {
  wrongPlace: "Les tickets ne servent que dans le serveur Discord du clan.",
  notReady: "Le guichet n'est pas encore branché : le robot n'a pas son jeton. Prévenez l'encadrement.",
  wrongToken: "Le jeton gardé par la fonction est celui d'un autre robot : collez celui de « Le Gaulois » dans son secret LE_GAULOIS_BOT_TOKEN (Supabase).",
  stale: "Ce bouton ne sert plus. Utilisez le guichet le plus récent, ou prévenez l'encadrement.",
  down: "Discord ne répond pas pour l'instant. Réessayez dans un moment.",
  already: (channel: string): string => `Vous avez déjà un ticket ouvert : <#${channel}>. Écrivez-y : l'encadrement le fermera quand ce sera réglé.`,
  opened: (channel: string): string => `Votre ticket est ouvert : <#${channel}>. L'encadrement vous répond là-bas.`,
  emptyAnswer: (labels: readonly string[]): string => `Il manque une réponse : ${labels.join(", ")}. Rien n'est ouvert.`,
  full: `La catégorie des tickets est pleine (${CATEGORY_LIMIT} salons) : réessayez plus tard, ou écrivez à un membre de l'encadrement.`,
  categoryGone: "La catégorie des tickets n'existe plus : prévenez l'encadrement, qui reposera le guichet avec /tickets.",
  categoryPublic: "La catégorie des tickets est visible par tout le serveur : par prudence, rien n'est ouvert. Prévenez l'encadrement.",
  notPrivate: "Le salon ouvert n'a pas pris les droits de la catégorie des tickets : par prudence, il est retiré. Prévenez l'encadrement.",
  notPrivateLeft: "Le salon ouvert n'a pas pris les droits de la catégorie des tickets, et le robot n'a pas pu le retirer : l'encadrement en est prévenu dans son journal.",
  barred: "L'encadrement vous a retiré l'accès aux tickets. Pour en parler, écrivez à l'un de ses membres.",
  tooMany: `Vous avez déjà ouvert ${TICKETS_PER_DAY} tickets ces dernières 24 heures : écrivez dans le dernier, ou à un membre de l'encadrement.`,
  leftover: (channel: string): string => `Un salon de ticket n'a pas pu être retiré après un échec : <#${channel}>. À supprimer à la main.`,
  cannotCreate: "Le robot n'a pas pu ouvrir votre salon : prévenez l'encadrement, qui vérifiera ses droits avec /tickets.",
  staffOnly: "Seul l'encadrement prend un ticket en charge.",
  closeRefused: "Seuls l'auteur du ticket et l'encadrement peuvent le fermer.",
  claimed: (opener: string, staff: string): string => `<@${opener}>, <@${staff}> s'occupe de votre demande.`,
  closing: (closer: string): string => `Ticket fermé par <@${closer}>, et noté au journal. Ce salon disparaît dans dix secondes.`,
  logFailed: (journal: string): string => `Le ticket reste ouvert : le robot n'a pas pu écrire dans le journal <#${journal}>. L'encadrement peut vérifier ses droits avec /tickets.`,
  deleteFailed: "Ticket fermé et noté au journal, mais le robot n'a pas pu supprimer ce salon : un membre de l'encadrement peut le supprimer à la main.",
  setupForbidden: "Seul qui peut gérer le serveur pose le guichet.",
  setupBadOptions: "Choisissez une catégorie, un salon écrit pour le journal et le rôle de l'encadrement.",
  setupRoleManaged: "Ce rôle appartient à une application : choisissez le rôle de l'encadrement.",
  setupFailed: "Le guichet n'a pas pu être posé : Discord a refusé le message. Réessayez dans un moment.",
};

/* ---------- Les messages ---------- */

const button = (label: string, style: number, customId: string) => ({ type: 2, style, label, custom_id: customId });

/** Le guichet : l'image du site en grand, puis les trois boutons. Sans image, un titre et une phrase. */
export function panelMessage(config: DeskConfig, image: CommandEntry | null): Record<string, unknown> {
  const buttons = TICKET_KINDS.map((kind) => button(KINDS[kind].button, KINDS[kind].style, ticketCustomId({ action: "ouvrir", kind, ...deskOf(config) })));
  const top = image
    ? { type: 12, items: [{ media: { url: `${TICKETS_SITE_URL}${image.image}` }, description: image.alt }] }
    : { type: 10, content: "## Besoin d'aide ?\nChoisissez un bouton : un salon privé s'ouvre, rien qu'avec vous et l'encadrement." };
  return { flags: COMPONENTS_V2, components: [top, { type: 1, components: buttons }], allowed_mentions: { parse: [] } };
}

/** Le formulaire d'une demande, ouvert par son bouton du guichet. */
export function formModal(kind: TicketKind, config: DeskConfig): Record<string, unknown> {
  const spec = KINDS[kind];
  return {
    type: 9,
    data: {
      custom_id: ticketCustomId({ action: "form", kind, ...deskOf(config) }),
      title: spec.button,
      components: spec.fields.map((f) => ({
        type: 1,
        components: [{ type: 4, custom_id: f.id, label: f.label, style: f.style, required: f.required, max_length: f.max, placeholder: f.placeholder }],
      })),
    },
  };
}

export interface TicketInfo {
  kind: TicketKind;
  opener: string;
  staff: string;
  journal: string;
  logMessage: string | null;
  answers: readonly Answer[];
  openedAt: number;
}

/**
 * Le premier message du salon : la demande, les réponses, l'aide, puis « Je m'en occupe » ; sous un filet, à part, le
 * bouton rouge qui ferme le ticket. Le joueur et le rôle de l'encadrement sont prévenus, personne d'autre.
 */
export function welcomeMessage(t: TicketInfo): Record<string, unknown> {
  const spec = KINDS[t.kind];
  const lines: unknown[] = [
    { type: 10, content: `### ${spec.heading}\n<@${t.opener}>, votre ticket est ouvert. L'encadrement (<@&${t.staff}>) vous répond ici.` },
    { type: 14, divider: true, spacing: 1 },
  ];
  if (t.answers.length > 0) lines.push({ type: 10, content: answersText(t.answers) });
  const foot = [spec.help, `Ouvert <t:${t.openedAt}:f>. Le salon disparaît quand le ticket est fermé.`].filter((line): line is string => line !== null);
  lines.push({ type: 10, content: foot.map((line) => `-# ${line}`).join("\n") });
  lines.push({ type: 1, components: [button("Je m'en occupe", 1, ticketCustomId({ action: "prendre", staff: t.staff, opener: t.opener }))] });
  lines.push({ type: 14, divider: true, spacing: 2 });
  lines.push({ type: 1, components: [button("Fermer le ticket", 4, ticketCustomId({ action: "fermer", staff: t.staff, journal: t.journal, logMessage: t.logMessage, opener: t.opener }))] });
  return {
    flags: COMPONENTS_V2,
    components: [{ type: 17, accent_color: spec.color, components: lines }],
    allowed_mentions: { users: [t.opener], roles: [t.staff] },
  };
}

/**
 * Le message d'accueil une fois le ticket pris : le bouton « Je m'en occupe » remplacé par le nom de qui s'en occupe. Le
 * reste ne bouge pas. `null` si le message n'a pas la forme attendue.
 */
export function claimedComponents(components: unknown, claimer: string, now: number): unknown[] | null {
  const top = list(components);
  const container = record(top[0]);
  if (top.length !== 1 || container?.["type"] !== 17) return null;
  const inner = list(container["components"]);
  const at = inner.findIndex((c) => customIdsOf([c]).some((id) => id.startsWith(`${TICKET_PREFIX}prendre:`)));
  if (at < 0) return null;
  const line = { type: 10, content: `**Pris en charge par <@${claimer}>**, <t:${now}:R>.` };
  return [{ ...container, components: [...inner.slice(0, at), line, ...inner.slice(at + 1)] }];
}

/** Le formulaire de fermeture : il confirme, et demande une raison, facultative, notée au journal. */
export function closeModal(a: Extract<TicketAction, { action: "fermer" }>): Record<string, unknown> {
  return {
    type: 9,
    data: {
      custom_id: ticketCustomId({ ...a, action: "clore" }),
      title: "Fermer et supprimer ce salon ?",
      components: [
        {
          type: 1,
          components: [{ type: 4, custom_id: "raison", label: "Pourquoi ? (facultatif, noté au journal)", style: 2, required: false, max_length: 300, placeholder: "Accepté dans le clan, question réglée…" }],
        },
      ],
    },
  };
}

const quietly = { parse: [] as string[] };

/** L'entrée du journal à l'ouverture : la demande, le salon, le joueur, l'heure et ses réponses. Personne n'est prévenu. */
export function openLogMessage(t: TicketInfo & { channel: string; channelName: string; username: string }): Record<string, unknown> {
  const spec = KINDS[t.kind];
  const head = `**Ticket ouvert** : ${spec.heading}, <#${t.channel}> (\`${t.channelName}\`)\nPar <@${t.opener}> (\`${t.username}\`), <t:${t.openedAt}:f>`;
  const lines: unknown[] = [{ type: 10, content: head }];
  if (t.answers.length > 0) lines.push({ type: 14, divider: true, spacing: 1 }, { type: 10, content: answersText(t.answers) });
  return { flags: COMPONENTS_V2, components: [{ type: 17, accent_color: spec.color, components: lines }], allowed_mentions: quietly };
}

/** L'entrée du journal à la fermeture, en réponse à celle de l'ouverture si elle existe encore. */
export function closeLogMessage(c: { channelName: string; opener: string; closer: string; openedAt: number; closedAt: number; reason: string; logMessage: string | null; journal: string }): Record<string, unknown> {
  const reason = c.reason.trim() === "" ? "Sans raison donnée." : `Raison : ${quoteAnswer(c.reason, 300)}`;
  const content = [`**Ticket fermé** : \`${c.channelName}\`, par <@${c.closer}>, <t:${c.closedAt}:f>`, `Ouvert <t:${c.openedAt}:R> par <@${c.opener}>.`, reason].join("\n");
  const message: Record<string, unknown> = { flags: COMPONENTS_V2, components: [{ type: 17, accent_color: COLORS.muted, components: [{ type: 10, content }] }], allowed_mentions: quietly };
  if (c.logMessage) message["message_reference"] = { message_id: c.logMessage, channel_id: c.journal, fail_if_not_exists: false };
  return message;
}

/* ---------- Les réponses à Discord ---------- */

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
const ephemeral = (content: string): Response => json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: quietly } });
/** « Le Gaulois réfléchit… » : la réponse viendra par le webhook de l'interaction. */
const deferred = (hidden: boolean): Response => json({ type: 5, data: hidden ? { flags: EPHEMERAL } : {} });

interface Member {
  id: string;
  username: string;
  roles: string[];
  /** Ses droits dans le salon de l'interaction, calculés par Discord. */
  permissions: bigint;
}

function memberOf(interaction: Record<string, unknown>): Member | null {
  const member = record(interaction["member"]);
  const user = record(member?.["user"]);
  const id = text(user?.["id"]);
  const username = text(user?.["username"]);
  if (!member || !user || user["bot"] === true || !SNOWFLAKE.test(id) || username === "") return null;
  return { id, username, roles: list(member["roles"]).filter((r): r is string => typeof r === "string"), permissions: bits(member["permissions"]) };
}

/** L'encadrement : le rôle choisi au guichet, ou qui peut gérer les salons ici. */
const isStaff = (member: Member, staff: string): boolean => member.roles.includes(staff) || (member.permissions & (P.ADMINISTRATOR | P.MANAGE_CHANNELS)) !== 0n;

/** Le webhook de cette interaction, pour en modifier la réponse : `null` sans application ni jeton. */
function original(interaction: Record<string, unknown>): string | null {
  const app = text(interaction["application_id"]);
  const token = text(interaction["token"]);
  return SNOWFLAKE.test(app) && /^[A-Za-z0-9._-]{1,500}$/.test(token) ? `/webhooks/${app}/${token}` : null;
}

/**
 * Écrit la réponse différée : un texte que seuls voient ceux à qui elle était destinée. Si Discord ne répond pas, ne connaît
 * pas encore la réponse d'attente (404) ou tombe (5xx), elle repart une fois, une seconde plus tard.
 */
async function answer(deps: Deps, hook: string, content: string, mentions: Record<string, unknown> = quietly): Promise<void> {
  const call = { body: { content, allowed_mentions: mentions } };
  const first = await deps.webhook("PATCH", `${hook}/messages/@original`, call);
  if (first !== null && first.status !== 404 && first.status < 500) return;
  await deps.sleep(1000);
  await deps.webhook("PATCH", `${hook}/messages/@original`, call);
}

const ok = (reply: { status: number } | null): boolean => reply !== null && reply.status >= 200 && reply.status < 300;

async function readChannels(deps: Deps, timeoutMs?: number): Promise<GuildChannel[] | null> {
  const reply = await deps.discord("GET", `/guilds/${deps.guildId}/channels`, timeoutMs === undefined ? {} : { timeoutMs });
  if (!ok(reply) || !Array.isArray(reply?.body)) return null;
  return reply.body.flatMap((c) => {
    const parsed = parseChannel(c);
    return parsed ? [parsed] : [];
  });
}

async function readRoles(deps: Deps): Promise<Role[] | null> {
  const reply = await deps.discord("GET", `/guilds/${deps.guildId}/roles`);
  return ok(reply) && Array.isArray(reply?.body) ? parseRoles(reply.body) : null;
}

/** L'encadrement a-t-il retiré à ce joueur « Voir les salons » dans la catégorie ? Alors il n'ouvre pas de ticket. */
export const barred = (category: GuildChannel, user: string): boolean => category.overwrites.some((o) => o.type === 1 && o.id === user && (o.deny & P.VIEW_CHANNEL) !== 0n);

/**
 * Le ticket déjà ouvert de ce joueur dans la catégorie : un salon où il a ses propres droits, autres que ceux que la catégorie
 * lui donne déjà (un membre de l'encadrement ajouté par son nom à la catégorie les retrouve dans chaque ticket). Ceux de
 * DraftBot comptent aussi.
 */
export function openTicketOf(channels: readonly GuildChannel[], category: string, user: string): string | null {
  const own = (c: GuildChannel | undefined) => c?.overwrites.find((o) => o.type === 1 && o.id === user);
  const inherited = own(channels.find((c) => c.id === category));
  const found = channels.find((c) => {
    const mine = own(c);
    if (c.parentId !== category || !mine || (mine.allow & P.VIEW_CHANNEL) === 0n) return false;
    return !(inherited && inherited.allow === mine.allow && inherited.deny === mine.deny);
  });
  return found ? found.id : null;
}

/** Le message vient-il du robot, et porte-t-il ce bouton ? Discord le vérifie déjà ; la fonction ne lui fait pas confiance. */
function fromOurMessage(interaction: Record<string, unknown>, deps: Deps, expected: string): boolean {
  const message = record(interaction["message"]);
  const author = text(record(message?.["author"])?.["id"]);
  if (author === "" || (author !== deps.botId && author !== text(interaction["application_id"]))) return false;
  return customIdsOf(message?.["components"]).includes(expected);
}

/* ---------- /tickets : poser le guichet ---------- */

/** Le lien qui ajoute le robot au serveur du clan, sans aucun droit sur le serveur : ses droits se donnent salon par salon. */
export const botInviteUrl = (applicationId: string, guildId: string): string =>
  `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=bot%20applications.commands&permissions=0&guild_id=${guildId}&disable_guild_select=true`;

function optionId(data: Record<string, unknown>, name: string): string {
  for (const option of list(data["options"])) {
    const o = record(option);
    if (o?.["name"] === name && typeof o["value"] === "string") return o["value"];
  }
  return "";
}

/** /tickets : la réponse vient en différé, après la vérification de tout ce qu'il faut. */
export function ticketsCommand(interaction: Record<string, unknown>, deps: Deps): Response {
  if (deps.guildId === "" || interaction["guild_id"] !== deps.guildId) return ephemeral(TICKET_MESSAGES.wrongPlace);
  const member = memberOf(interaction);
  if (!member) return ephemeral(TICKET_MESSAGES.wrongPlace);
  if ((member.permissions & (P.ADMINISTRATOR | P.MANAGE_GUILD)) === 0n) return ephemeral(TICKET_MESSAGES.setupForbidden);
  if (deps.botId === "") return ephemeral(TICKET_MESSAGES.notReady);
  // Le guichet posé par un autre robot enverrait ses clics à une autre application : rien ne marcherait.
  const applicationId = text(interaction["application_id"]);
  if (SNOWFLAKE.test(applicationId) && applicationId !== deps.botId) return ephemeral(TICKET_MESSAGES.wrongToken);
  const data = record(interaction["data"]) ?? {};
  const resolved = record(data["resolved"]);
  const config = { category: optionId(data, TICKETS_OPTIONS.category), journal: optionId(data, TICKETS_OPTIONS.journal), staff: optionId(data, TICKETS_OPTIONS.staff) };
  const panelChannel = text(interaction["channel_id"]);
  if (![config.category, config.journal, config.staff, panelChannel].every((id) => SNOWFLAKE.test(id)) || config.staff === deps.guildId) return ephemeral(TICKET_MESSAGES.setupBadOptions);
  if (record(record(resolved?.["roles"])?.[config.staff])?.["managed"] === true) return ephemeral(TICKET_MESSAGES.setupRoleManaged);
  const hook = original(interaction);
  if (!hook) return ephemeral(TICKET_MESSAGES.down);
  deps.background(setUp(deps, hook, config, panelChannel, bits(interaction["app_permissions"]), text(interaction["application_id"])));
  return deferred(true);
}

const roleList = (roles: readonly Role[]): string => {
  const shown = roles.slice(0, 10).map((r) => `<@&${r.id}>`);
  return roles.length > 10 ? `${shown.join(", ")} et ${roles.length - 10} autres rôles` : shown.join(", ");
};

/** Ce que vérifie /tickets avant de poser le guichet : les problèmes, qui l'empêchent, et les remarques, qui ne l'empêchent pas. */
export function setupReport(c: {
  guildId: string;
  botId: string;
  botRoles: readonly string[];
  roles: readonly Role[];
  category: GuildChannel | null;
  journal: GuildChannel | null;
  staff: string;
  panelPermissions: bigint;
}): { problems: string[]; notes: string[]; viewers: Role[]; journalViewers: Role[] } {
  const problems: string[] = [];
  const notes: string[] = [];
  const { category, journal } = c;
  const staffRole = c.roles.find((r) => r.id === c.staff) ?? null;
  if (!category || category.type !== 4) problems.push("La catégorie choisie n'existe pas, ou n'est pas une catégorie.");
  if (!journal || journal.type !== 0) problems.push("Le journal doit être un salon écrit.");
  if (!staffRole) problems.push("Le rôle de l'encadrement n'existe pas.");
  const viewers = category ? rolesThatView(c.guildId, c.roles, category) : [];
  const journalViewers = journal ? rolesThatView(c.guildId, c.roles, journal) : [];
  if (category && category.type === 4) {
    const lacking = missing(channelPermissions(c.guildId, c.roles, c.botRoles, c.botId, category.overwrites), CATEGORY_NEEDS);
    if (lacking.length > 0) problems.push(`Dans la catégorie « ${category.name} », il manque au robot : ${lacking.join(", ")}.`);
    if (everyoneCanView(c.guildId, c.roles, category)) problems.push(`La catégorie « ${category.name} » est visible par tout le serveur : dans ses permissions, retirez « Voir les salons » à @everyone.`);
    if (staffRole && (staffRole.permissions & P.ADMINISTRATOR) === 0n && !viewers.some((r) => r.id === staffRole.id)) {
      problems.push(`Le rôle <@&${staffRole.id}> ne voit pas la catégorie « ${category.name} » : il serait prévenu sans pouvoir lire les tickets.`);
    }
    const canPing = staffRole?.mentionable === true || (channelPermissions(c.guildId, c.roles, c.botRoles, c.botId, category.overwrites) & P.MENTION_EVERYONE) !== 0n;
    if (staffRole && !canPing) notes.push(`Le rôle <@&${staffRole.id}> sera nommé sans être prévenu : pour le prévenir, cochez « Mentionner @everyone, @here et tous les rôles » pour le robot dans la catégorie, ou rendez le rôle mentionnable.`);
  }
  if (journal && journal.type === 0) {
    const lacking = missing(channelPermissions(c.guildId, c.roles, c.botRoles, c.botId, journal.overwrites), JOURNAL_NEEDS);
    if (lacking.length > 0) problems.push(`Dans le journal <#${journal.id}>, il manque au robot : ${lacking.join(", ")}.`);
    if (everyoneCanView(c.guildId, c.roles, journal)) problems.push(`Le journal <#${journal.id}> est visible par tout le serveur, et les réponses des joueurs y sont notées : choisissez un salon privé.`);
  }
  if (c.roles.some((r) => c.botRoles.includes(r.id) && (r.permissions & P.ADMINISTRATOR) !== 0n)) {
    notes.push("Le robot est administrateur du serveur : bien plus qu'il ne lui faut, avec un jeton qui reste valable. Retirez-lui ce rôle (étape 1 de « Les rôles sur Discord ») ; les droits de la catégorie, du journal et de ce salon suffisent aux tickets.");
  }
  const panelLacking = missing(c.panelPermissions, PANEL_NEEDS);
  if (panelLacking.length > 0) problems.push(`Dans ce salon, il manque au robot : ${panelLacking.join(", ")}.`);
  return { problems, notes, viewers, journalViewers };
}

async function setUp(deps: Deps, hook: string, config: DeskConfig, panelChannel: string, panelPermissions: bigint, applicationId: string): Promise<void> {
  const [channels, roles, me] = await Promise.all([readChannels(deps), readRoles(deps), deps.discord("GET", `/guilds/${deps.guildId}/members/${deps.botId}`)]);
  const botRoles = list(record(me?.body)?.["roles"]).filter((r): r is string => typeof r === "string");
  if (me?.status === 404) {
    await answer(deps, hook, `Le robot n'est pas membre du serveur, seulement ses commandes. Ajoutez-le par ce lien, sans aucun droit sur le serveur, puis retapez /tickets : <${botInviteUrl(SNOWFLAKE.test(applicationId) ? applicationId : deps.botId, deps.guildId)}>`);
    return;
  }
  if (!channels || !roles || !ok(me)) {
    await answer(deps, hook, TICKET_MESSAGES.down);
    return;
  }
  const report = setupReport({
    guildId: deps.guildId,
    botId: deps.botId,
    botRoles,
    roles,
    category: channels.find((c) => c.id === config.category) ?? null,
    journal: channels.find((c) => c.id === config.journal) ?? null,
    staff: config.staff,
    panelPermissions,
  });
  if (report.problems.length > 0) {
    await answer(deps, hook, ["Rien n'est posé :", ...report.problems.map((p) => `- ${p}`), "Corrigez, puis retapez /tickets."].join("\n").slice(0, 2000));
    return;
  }
  const image = (await deps.commandes())?.guichet ?? null;
  const posted = await deps.discord("POST", `/channels/${panelChannel}/messages`, { body: panelMessage(config, image) });
  const postedId = text(record(posted?.body)?.["id"]);
  if (!ok(posted) || !SNOWFLAKE.test(postedId)) {
    await answer(deps, hook, TICKET_MESSAGES.setupFailed);
    return;
  }
  // L'ancien guichet du robot dans ce salon, s'il y en a un : retiré, pour qu'il n'en reste qu'un.
  let removed = 0;
  if ((panelPermissions & P.READ_MESSAGE_HISTORY) !== 0n) {
    const recent = await deps.discord("GET", `/channels/${panelChannel}/messages?limit=50`);
    for (const item of list(recent?.body).slice(0, 50)) {
      const m = record(item);
      const id = text(m?.["id"]);
      if (id === postedId || !SNOWFLAKE.test(id) || text(record(m?.["author"])?.["id"]) !== deps.botId) continue;
      if (!customIdsOf(m?.["components"]).some((cid) => cid.startsWith(`${TICKET_PREFIX}ouvrir:`))) continue;
      if (ok(await deps.discord("DELETE", `/channels/${panelChannel}/messages/${id}`, { reason: "Ancien guichet des tickets, remplacé" }))) removed++;
      if (removed >= 5) break;
    }
  }
  const category = channels.find((c) => c.id === config.category);
  const seenBy = (roles: readonly Role[]) => (roles.length > 0 ? `${roleList(roles)}, et les administrateurs du serveur` : "les administrateurs du serveur");
  const lines = [
    "Le guichet est posé dans ce salon.",
    `- Les tickets s'ouvrent dans « ${category?.name ?? "?"} ». Les voient : ${seenBy(report.viewers)}, plus le joueur de chaque ticket.`,
    `- Le journal : <#${config.journal}>. Le voient : ${seenBy(report.journalViewers)}.`,
    `- Prévenu à chaque ticket : <@&${config.staff}>.`,
    ...report.notes.map((n) => `- ${n}`),
    removed > 0 ? "L'ancien guichet du robot dans ce salon est retiré." : "",
    "Essayez un bouton pour vérifier.",
  ].filter((line) => line !== "");
  await answer(deps, hook, lines.join("\n").slice(0, 2000));
}

/* ---------- Les boutons et les formulaires ---------- */

/** Un bouton ou un formulaire des tickets (interactions de type 3 et 5), aiguillé par `index.ts`. */
export async function ticketInteraction(interaction: Record<string, unknown>, deps: Deps): Promise<Response> {
  if (deps.guildId === "" || interaction["guild_id"] !== deps.guildId) return ephemeral(TICKET_MESSAGES.wrongPlace);
  const member = memberOf(interaction);
  const data = record(interaction["data"]) ?? {};
  const customId = text(data["custom_id"]);
  const parsed = parseTicketId(customId);
  if (!member || !parsed) return ephemeral(TICKET_MESSAGES.stale);
  const button = interaction["type"] === 3;
  // Le bouton est-il bien sur un message du robot ? Pour un formulaire, le bouton qui l'a ouvert.
  const expected = button ? customId : parsed.action === "form" ? ticketCustomId({ ...parsed, action: "ouvrir" }) : parsed.action === "clore" ? ticketCustomId({ ...parsed, action: "fermer" }) : "";
  if (expected === "" || !fromOurMessage(interaction, deps, expected)) return ephemeral(TICKET_MESSAGES.stale);
  if (deps.botId === "") return ephemeral(TICKET_MESSAGES.notReady);

  if (button && parsed.action === "ouvrir") {
    // Un ticket déjà ouvert, ou trois en 24 heures, se disent avant le formulaire, si Discord répond assez vite ; sinon, à l'envoi.
    const [channels, journal] = await Promise.all([readChannels(deps, PRECHECK_TIMEOUT_MS), deps.discord("GET", `/channels/${parsed.journal}/messages?limit=50`, { timeoutMs: PRECHECK_TIMEOUT_MS })]);
    const category = channels?.find((c) => c.id === parsed.category);
    if (category && barred(category, member.id)) return ephemeral(TICKET_MESSAGES.barred);
    const already = channels ? openTicketOf(channels, parsed.category, member.id) : null;
    if (already) return ephemeral(TICKET_MESSAGES.already(already));
    if (ok(journal) && recentTicketsOf(journal?.body, deps.botId, member.id, deps.nowSeconds()) >= TICKETS_PER_DAY) return ephemeral(TICKET_MESSAGES.tooMany);
    return json(formModal(parsed.kind, parsed));
  }
  // Dans un ticket, le bouton doit être dans ce salon même : c'est lui que ferme « Fermer le ticket ».
  if ((parsed.action === "prendre" || parsed.action === "fermer" || parsed.action === "clore") && text(record(interaction["message"])?.["channel_id"]) !== text(interaction["channel_id"])) {
    return ephemeral(TICKET_MESSAGES.stale);
  }
  if (!button && parsed.action === "form") {
    const hook = original(interaction);
    if (!hook) return ephemeral(TICKET_MESSAGES.down);
    const values = modalValues(data);
    const empty = missingAnswers(parsed.kind, values);
    if (empty.length > 0) return ephemeral(TICKET_MESSAGES.emptyAnswer(empty));
    deps.background(openTicket(deps, hook, parsed, member, answersOf(parsed.kind, values)));
    return deferred(true);
  }
  if (button && parsed.action === "prendre") {
    if (!isStaff(member, parsed.staff) || member.id === parsed.opener) return ephemeral(TICKET_MESSAGES.staffOnly);
    const now = deps.nowSeconds();
    const components = claimedComponents(record(interaction["message"])?.["components"], member.id, now);
    if (!components) return ephemeral(TICKET_MESSAGES.stale);
    const hook = original(interaction);
    if (hook) deps.background(tellOpener(deps, hook, TICKET_MESSAGES.claimed(parsed.opener, member.id), parsed.opener));
    return json({ type: 7, data: { flags: COMPONENTS_V2, components, allowed_mentions: quietly } });
  }
  if (button && parsed.action === "fermer") {
    if (!isStaff(member, parsed.staff) && member.id !== parsed.opener) return ephemeral(TICKET_MESSAGES.closeRefused);
    return json(closeModal(parsed));
  }
  if (!button && parsed.action === "clore") {
    if (!isStaff(member, parsed.staff) && member.id !== parsed.opener) return ephemeral(TICKET_MESSAGES.closeRefused);
    const hook = original(interaction);
    const channel = text(interaction["channel_id"]);
    if (!hook || !SNOWFLAKE.test(channel)) return ephemeral(TICKET_MESSAGES.down);
    const channelName = text(record(interaction["channel"])?.["name"]).slice(0, 100) || `salon ${channel}`;
    deps.background(closeTicket(deps, hook, parsed, { channel, channelName, closer: member.id, reason: modalValues(data).get("raison") ?? "" }));
    return deferred(false);
  }
  return ephemeral(TICKET_MESSAGES.stale);
}

/**
 * Prévient le joueur qu'on s'occupe de lui, par une suite à la réponse : une seconde après, pour que Discord ait reçu la
 * réponse elle-même, et une seconde fois deux secondes plus tard s'il refuse.
 */
async function tellOpener(deps: Deps, hook: string, content: string, opener: string): Promise<void> {
  const body = { content, allowed_mentions: { users: [opener] } };
  await deps.sleep(1000);
  if (ok(await deps.webhook("POST", hook, { body }))) return;
  await deps.sleep(2000);
  await deps.webhook("POST", hook, { body });
}

/** Les salons d'une catégorie ont-ils exactement ses réglages de droits ? C'est ce que Discord fait d'un salon créé sans réglage. */
export function sameOverwrites(a: readonly Overwrite[], b: readonly Overwrite[]): boolean {
  const key = (o: Overwrite) => `${o.type}:${o.id}:${o.allow}:${o.deny}`;
  const left = new Set(a.map(key));
  return a.length === b.length && left.size === a.length && b.every((o) => left.has(key(o)));
}

/**
 * Les tickets que ce joueur a ouverts dans les dernières 24 heures, lus dans le journal : les entrées d'ouverture du robot qui
 * le nomment. Le robot relit ses propres messages, jamais ceux des autres.
 */
export function recentTicketsOf(messages: unknown, botId: string, user: string, now: number): number {
  return list(messages).filter((item) => {
    const m = record(item);
    const id = text(m?.["id"]);
    if (text(record(m?.["author"])?.["id"]) !== botId || !SNOWFLAKE.test(id) || now - snowflakeSeconds(id) > 86_400) return false;
    const texts: string[] = [];
    const walk = (value: unknown, depth: number): void => {
      if (depth > 4) return;
      for (const c of list(value)) {
        const r = record(c);
        const content = r?.["content"];
        if (typeof content === "string") texts.push(content);
        walk(r?.["components"], depth + 1);
      }
    };
    walk(m?.["components"], 0);
    return texts.some((t) => t.startsWith("**Ticket ouvert**") && t.includes(`Par <@${user}>`));
  }).length;
}

/** Retire un salon qui n'a pas pu devenir un ticket ; s'il reste, le journal le dit à l'encadrement. `true` : il n'est plus là. */
async function abandon(deps: Deps, channel: string, journal: string): Promise<boolean> {
  const removed = await deps.discord("DELETE", `/channels/${channel}`, { reason: "Ticket annulé : il n'a pas pu être ouvert en entier" });
  if (ok(removed) || removed?.status === 404) return true;
  await deps.discord("POST", `/channels/${journal}/messages`, { body: { content: TICKET_MESSAGES.leftover(channel), allowed_mentions: quietly } });
  return false;
}

async function openTicket(deps: Deps, hook: string, config: Extract<TicketAction, { action: "form" }>, member: Member, answers: readonly Answer[]): Promise<void> {
  const [channels, roles, journal] = await Promise.all([readChannels(deps), readRoles(deps), deps.discord("GET", `/channels/${config.journal}/messages?limit=50`)]);
  if (!channels || !roles) return answer(deps, hook, TICKET_MESSAGES.down);
  const category = channels.find((c) => c.id === config.category && c.type === 4);
  if (!category) return answer(deps, hook, TICKET_MESSAGES.categoryGone);
  if (everyoneCanView(deps.guildId, roles, category)) return answer(deps, hook, TICKET_MESSAGES.categoryPublic);
  if (barred(category, member.id)) return answer(deps, hook, TICKET_MESSAGES.barred);
  const already = openTicketOf(channels, category.id, member.id);
  if (already) return answer(deps, hook, TICKET_MESSAGES.already(already));
  if (channels.filter((c) => c.parentId === category.id).length >= CATEGORY_LIMIT) return answer(deps, hook, TICKET_MESSAGES.full);
  const openedAt = deps.nowSeconds();
  // Un journal illisible ne bloque personne : il ne sert ici qu'à freiner les ouvertures en boucle.
  if (ok(journal) && recentTicketsOf(journal?.body, deps.botId, member.id, openedAt) >= TICKETS_PER_DAY) return answer(deps, hook, TICKET_MESSAGES.tooMany);

  const spec = KINDS[config.kind];
  const name = ticketChannelName(config.kind, member.username);
  const reason = `Ticket « ${spec.button} » ouvert par ${member.username}`;
  // Sans réglages de droits, le salon prend ceux de la catégorie, privée. Et un nom neutre, sans sujet, tant que rien n'est
  // vérifié : un salon qui resterait visible ne dirait ni qui, ni pourquoi.
  const created = await deps.discord("POST", `/guilds/${deps.guildId}/channels`, { body: { name: "ticket", type: 0, parent_id: category.id }, reason });
  const channel = ok(created) ? parseChannel(created?.body) : null;
  if (!channel) return answer(deps, hook, TICKET_MESSAGES.cannotCreate);
  // Par prudence : un salon qui n'a pas exactement les droits de la catégorie disparaît aussitôt.
  if (channel.parentId !== category.id || !sameOverwrites(channel.overwrites, category.overwrites)) {
    return answer(deps, hook, (await abandon(deps, channel.id, config.journal)) ? TICKET_MESSAGES.notPrivate : TICKET_MESSAGES.notPrivateLeft);
  }
  const granted = await deps.discord("PUT", `/channels/${channel.id}/permissions/${member.id}`, { body: { type: 1, allow: OPENER_ALLOW.toString(), deny: "0" }, reason });
  if (!ok(granted)) {
    await abandon(deps, channel.id, config.journal);
    return answer(deps, hook, TICKET_MESSAGES.cannotCreate);
  }
  // Son vrai nom et son sujet. Un refus (Discord limite les renommages) laisse le nom neutre : le ticket marche quand même.
  const named = await deps.discord("PATCH", `/channels/${channel.id}`, { body: { name, topic: `Ticket de <@${member.id}> : ${spec.heading}. Ouvert le <t:${openedAt}:f>.` }, reason });
  const channelName = ok(named) ? name : channel.name || "ticket";
  const info: TicketInfo = { kind: config.kind, opener: member.id, staff: config.staff, journal: config.journal, logMessage: null, answers, openedAt };
  // Le journal d'abord : le bouton de fermeture porte son entrée, pour y répondre. Sans journal, le ticket s'ouvre quand même.
  const logged = await deps.discord("POST", `/channels/${config.journal}/messages`, { body: openLogMessage({ ...info, channel: channel.id, channelName, username: member.username }) });
  const logId = text(record(logged?.body)?.["id"]);
  const logMessage = ok(logged) && SNOWFLAKE.test(logId) ? logId : null;
  const welcome = await deps.discord("POST", `/channels/${channel.id}/messages`, { body: welcomeMessage({ ...info, logMessage }) });
  if (!ok(welcome)) {
    await abandon(deps, channel.id, config.journal);
    // Le journal ne garde pas un ticket ouvert qui n'existe pas.
    if (logMessage) {
      const note = { content: "Ticket annulé aussitôt : son message d'accueil n'a pas pu être posté.", allowed_mentions: quietly, message_reference: { message_id: logMessage, channel_id: config.journal, fail_if_not_exists: false } };
      await deps.discord("POST", `/channels/${config.journal}/messages`, { body: note });
    }
    return answer(deps, hook, TICKET_MESSAGES.cannotCreate);
  }
  return answer(deps, hook, TICKET_MESSAGES.opened(channel.id));
}

async function closeTicket(deps: Deps, hook: string, a: Extract<TicketAction, { action: "clore" }>, c: { channel: string; channelName: string; closer: string; reason: string }): Promise<void> {
  const closedAt = deps.nowSeconds();
  const logged = await deps.discord("POST", `/channels/${a.journal}/messages`, {
    body: closeLogMessage({ channelName: c.channelName, opener: a.opener, closer: c.closer, openedAt: snowflakeSeconds(c.channel), closedAt, reason: c.reason, logMessage: a.logMessage, journal: a.journal }),
  });
  if (!ok(logged)) return answer(deps, hook, TICKET_MESSAGES.logFailed(a.journal));
  await answer(deps, hook, TICKET_MESSAGES.closing(c.closer));
  await deps.sleep(CLOSE_DELAY_MS);
  const removed = await deps.discord("DELETE", `/channels/${c.channel}`, { reason: `Ticket fermé par ${c.closer}` });
  if (!ok(removed) && removed?.status !== 404) await answer(deps, hook, TICKET_MESSAGES.deleteFailed);
}

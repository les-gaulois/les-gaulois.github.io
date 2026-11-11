/**
 * Les messages Discord de l'encadrement, écrits dans l'espace Direction (migration `20261111000600_messages_discord.sql`) :
 * un texte, jusqu'à dix embeds, et pour ce message le nom et la photo du robot. Ici, le brouillon du formulaire, les
 * contrôles faits avant l'envoi avec les limites de Discord (le serveur refait chacun d'eux et refait le message), le
 * message envoyé au serveur, et la relecture de sa réponse sans rien inventer. La page ne voit jamais un lien de webhook.
 */
import { frNumber } from "../nombre";
import { ROBOT_SALON_TEXTS } from "./discord-salons";

/** Les limites de Discord, que le serveur applique aussi : un test les compare à la migration. */
export const LIMITS = {
  content: 2000,
  username: 80,
  embeds: 10,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  author: 256,
  total: 6000,
  thread: 100,
  link: 2000,
  salonName: 60,
  salons: 20,
} as const;

/** Les images que l'espace du serveur accepte, et leur extension dans le nom tiré au sort. */
export const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as const;
export type ImageType = keyof typeof IMAGE_TYPES;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export const isImageType = (type: string): type is ImageType => Object.hasOwn(IMAGE_TYPES, type);

/** Pourquoi un fichier ne peut pas servir d'image, ou `null` s'il convient. */
export function imageFileProblem(file: { type: string; size: number }): string | null {
  if (!isImageType(file.type)) return "Choisissez une image PNG, JPEG, GIF ou WebP.";
  if (file.size > IMAGE_MAX_BYTES) return "Cette image dépasse 8 Mo : réduisez-la avant de l'envoyer.";
  return null;
}

/** Qui le message notifie : personne (une mention s'affiche sans sonner), les rôles et membres mentionnés, ou tout le monde. */
export type Notify = "none" | "mentions" | "everyone";
export const NOTIFY_LABELS: Record<Notify, string> = {
  none: "Personne : les mentions s'affichent sans notifier",
  mentions: "Les rôles et les membres mentionnés",
  everyone: "Tout le monde, avec @everyone ou @here",
};

/** L'heure d'un embed : aucune, celle de l'envoi, ou une date choisie. */
export type TimeMode = "none" | "now" | "date";

/** Une image : rien, une adresse collée, ou un fichier choisi, que la page garde et dépose à l'envoi. */
export type ImageSlot = { kind: "none" } | { kind: "link"; url: string } | { kind: "file"; id: string; name: string; size: number; type: ImageType };
export const NO_IMAGE: ImageSlot = { kind: "none" };

export interface FieldDraft {
  key: number;
  name: string;
  value: string;
  inline: boolean;
}

export interface EmbedDraft {
  key: number;
  /** `#rrggbb`, ou `null` : la couleur par défaut de Discord. */
  color: string | null;
  title: string;
  url: string;
  description: string;
  fields: FieldDraft[];
  image: ImageSlot;
  thumbnail: ImageSlot;
  authorName: string;
  authorUrl: string;
  authorIcon: ImageSlot;
  footerText: string;
  footerIcon: ImageSlot;
  time: TimeMode;
  /** La date choisie, telle que l'écrit un champ `datetime-local` (heure du navigateur). */
  date: string;
}

export interface MessageDraft {
  /** La clé du salon : `robot:<salon>`, `appels` ou `message:<numéro>`. */
  salon: string;
  content: string;
  username: string;
  avatar: ImageSlot;
  notify: Notify;
  silent: boolean;
  thread: string;
  embeds: EmbedDraft[];
}

/** Le bleu du drapeau, couleur par défaut d'un nouvel embed. */
export const DEFAULT_COLOR = "#0b5fff";
/** Des couleurs toutes prêtes : celles du site, puis quelques classiques. */
export const COLOR_PRESETS: readonly { hex: string; label: string }[] = [
  { hex: "#0b5fff", label: "Bleu du drapeau" },
  { hex: "#ffffff", label: "Blanc" },
  { hex: "#ff1a2e", label: "Rouge du drapeau" },
  { hex: "#ffc857", label: "Or" },
  { hex: "#a6e3b4", label: "Vert" },
  { hex: "#9b59b6", label: "Violet" },
  { hex: "#2c3a6b", label: "Bleu nuit" },
];

let lastKey = 0;
/** Un numéro pour suivre un embed ou un champ dans la liste, même déplacé. */
export const nextKey = (): number => ++lastKey;

export const newField = (): FieldDraft => ({ key: nextKey(), name: "", value: "", inline: false });

export const newEmbed = (): EmbedDraft => ({
  key: nextKey(),
  color: DEFAULT_COLOR,
  title: "",
  url: "",
  description: "",
  fields: [],
  image: NO_IMAGE,
  thumbnail: NO_IMAGE,
  authorName: "",
  authorUrl: "",
  authorIcon: NO_IMAGE,
  footerText: "",
  footerIcon: NO_IMAGE,
  time: "none",
  date: "",
});

export const emptyDraft = (salon = ""): MessageDraft => ({ salon, content: "", username: "", avatar: NO_IMAGE, notify: "none", silent: false, thread: "", embeds: [newEmbed()] });

/* ---------- Le texte, compté comme Discord ---------- */

const CONTROL = /[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/** Le texte tel que le serveur le garde : retours chariot ramenés, caractères de contrôle retirés, blancs des bords ôtés. */
export const cleanText = (text: string): string => text.replace(/\r\n?/g, "\n").replace(CONTROL, "").trim();

/** Le nombre de caractères que Discord compte : un emoji compte pour un. */
export const textLength = (text: string): number => Array.from(cleanText(text)).length;

/** Les caractères des embeds, comptés pour la limite commune de 6 000 : titres, descriptions, champs, pieds de page, auteurs. */
export function embedLength(embed: EmbedDraft): number {
  return textLength(embed.title) + textLength(embed.description) + textLength(embed.authorName) + textLength(embed.footerText) + embed.fields.reduce((sum, f) => sum + textLength(f.name) + textLength(f.value), 0);
}
export const embedsLength = (draft: MessageDraft): number => draft.embeds.reduce((sum, e) => sum + embedLength(e), 0);

/* ---------- Les couleurs ---------- */

export const colorNumber = (hex: string): number | null => (/^#[0-9a-f]{6}$/i.test(hex) ? Number.parseInt(hex.slice(1), 16) : null);
export const colorHex = (value: number): string => `#${Math.max(0, Math.min(0xffffff, Math.trunc(value))).toString(16).padStart(6, "0")}`;

/* ---------- Les liens ---------- */

/** Une adresse que le serveur accepte : https, sans espace, chevron ni guillemet, 2 000 caractères au plus. */
export const isHttpsLink = (text: string): boolean => {
  const value = cleanText(text);
  return /^https:\/\/[^\s<>"]+$/.test(value) && Array.from(value).length <= LIMITS.link;
};

const slotUrl = (slot: ImageSlot): string | null => (slot.kind === "link" ? cleanText(slot.url) || null : null);

/* ---------- Les contrôles avant l'envoi ---------- */

/** Un problème du brouillon : l'identifiant du champ à corriger dans la page, et la phrase qui le dit. */
export interface DraftProblem {
  at: string;
  message: string;
}

/** Les identifiants des champs du formulaire, partagés avec la page pour y mener le curseur. */
export const fieldId = {
  salon: "dm-salon",
  content: "dm-content",
  username: "dm-username",
  avatar: "dm-avatar",
  thread: "dm-thread",
  title: (e: number) => `dm-e${e}-title`,
  url: (e: number) => `dm-e${e}-url`,
  description: (e: number) => `dm-e${e}-description`,
  image: (e: number) => `dm-e${e}-image`,
  thumbnail: (e: number) => `dm-e${e}-thumbnail`,
  authorName: (e: number) => `dm-e${e}-author`,
  authorUrl: (e: number) => `dm-e${e}-author-url`,
  authorIcon: (e: number) => `dm-e${e}-author-icon`,
  footerText: (e: number) => `dm-e${e}-footer`,
  footerIcon: (e: number) => `dm-e${e}-footer-icon`,
  date: (e: number) => `dm-e${e}-date`,
  fieldName: (e: number, f: number) => `dm-e${e}-f${f}-name`,
  fieldValue: (e: number, f: number) => `dm-e${e}-f${f}-value`,
};

const over = (text: string, max: number) => textLength(text) > max;

/** Ce qui empêche l'envoi, dans l'ordre du formulaire. Vide : le brouillon peut partir. */
export function draftProblems(draft: MessageDraft, salons: readonly string[]): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const add = (at: string, message: string) => problems.push({ at, message });
  if (!salons.includes(draft.salon)) add(fieldId.salon, "Choisissez le salon où envoyer le message.");
  if (over(draft.content, LIMITS.content)) add(fieldId.content, `Le texte du message dépasse ${fmt(LIMITS.content)} caractères.`);
  const username = cleanText(draft.username);
  if (over(username, LIMITS.username)) add(fieldId.username, `Le nom du robot dépasse ${LIMITS.username} caractères.`);
  else if (/discord|clyde/i.test(username) || ["everyone", "here"].includes(username.toLowerCase())) add(fieldId.username, "Discord refuse un nom de robot qui contient « discord » ou « clyde », ou qui est « everyone » ou « here ».");
  if (draft.avatar.kind === "link" && slotUrl(draft.avatar) !== null && !isHttpsLink(draft.avatar.url)) add(fieldId.avatar, "La photo du robot : collez une adresse qui commence par https://.");
  if (over(draft.thread, LIMITS.thread)) add(fieldId.thread, `Le nom du fil dépasse ${LIMITS.thread} caractères.`);
  if (draft.embeds.length > LIMITS.embeds) add(fieldId.content, `${LIMITS.embeds} embeds au plus par message.`);

  draft.embeds.forEach((embed, i) => {
    const n = i + 1;
    const where = draft.embeds.length > 1 ? `Embed ${n} : ` : "Embed : ";
    const link = (at: string, text: string, what: string) => {
      if (cleanText(text) !== "" && !isHttpsLink(text)) add(at, `${where}${what} doit commencer par https:// et ne contenir aucune espace.`);
    };
    const image = (at: string, slot: ImageSlot, what: string) => {
      if (slot.kind === "link") link(at, slot.url, what);
    };
    if (over(embed.title, LIMITS.title)) add(fieldId.title(i), `${where}le titre dépasse ${LIMITS.title} caractères.`);
    link(fieldId.url(i), embed.url, "le lien du titre");
    if (over(embed.description, LIMITS.description)) add(fieldId.description(i), `${where}la description dépasse ${fmt(LIMITS.description)} caractères.`);
    if (embed.fields.length > LIMITS.fields) add(fieldId.description(i), `${where}${LIMITS.fields} champs au plus.`);
    embed.fields.forEach((field, j) => {
      const name = textLength(field.name);
      const value = textLength(field.value);
      if (name === 0 || value === 0) add(name === 0 ? fieldId.fieldName(i, j) : fieldId.fieldValue(i, j), `${where}le champ ${j + 1} a besoin d'un nom et d'une valeur.`);
      if (name > LIMITS.fieldName) add(fieldId.fieldName(i, j), `${where}le nom du champ ${j + 1} dépasse ${LIMITS.fieldName} caractères.`);
      if (value > LIMITS.fieldValue) add(fieldId.fieldValue(i, j), `${where}la valeur du champ ${j + 1} dépasse ${fmt(LIMITS.fieldValue)} caractères.`);
    });
    image(fieldId.image(i), embed.image, "l'adresse de l'image");
    image(fieldId.thumbnail(i), embed.thumbnail, "l'adresse de la miniature");
    if (over(embed.authorName, LIMITS.author)) add(fieldId.authorName(i), `${where}le nom de l'auteur dépasse ${LIMITS.author} caractères.`);
    link(fieldId.authorUrl(i), embed.authorUrl, "le lien de l'auteur");
    image(fieldId.authorIcon(i), embed.authorIcon, "l'adresse de l'icône de l'auteur");
    if (textLength(embed.authorName) === 0 && (cleanText(embed.authorUrl) !== "" || embed.authorIcon.kind !== "none")) add(fieldId.authorName(i), `${where}donnez un nom à l'auteur, ou retirez son lien et son icône.`);
    if (over(embed.footerText, LIMITS.footer)) add(fieldId.footerText(i), `${where}le pied de page dépasse ${fmt(LIMITS.footer)} caractères.`);
    image(fieldId.footerIcon(i), embed.footerIcon, "l'adresse de l'icône du pied de page");
    if (textLength(embed.footerText) === 0 && embed.footerIcon.kind !== "none") add(fieldId.footerText(i), `${where}une icône de pied de page a besoin d'un texte.`);
    if (embed.time === "date" && dateIso(embed.date) === null) add(fieldId.date(i), `${where}choisissez la date à afficher.`);
    if (!embedShows(embed)) add(fieldId.title(i), `${where}il est vide. Donnez-lui un titre, une description, un champ, une image, un auteur ou un pied de page, ou retirez-le.`);
  });
  if (embedsLength(draft) > LIMITS.total) add(fieldId.description(0), `L'ensemble des embeds dépasse ${fmt(LIMITS.total)} caractères (${fmt(embedsLength(draft))}).`);
  if (textLength(draft.content) === 0 && draft.embeds.length === 0) add(fieldId.content, "Écrivez un texte ou ajoutez un embed.");
  return problems;
}

/** Un embed montre-t-il quelque chose ? Une couleur ou une date seules ne suffisent pas à Discord. */
export function embedShows(embed: EmbedDraft): boolean {
  return textLength(embed.title) > 0 || textLength(embed.description) > 0 || embed.fields.length > 0 || embed.image.kind !== "none" || embed.thumbnail.kind !== "none" || textLength(embed.authorName) > 0 || textLength(embed.footerText) > 0;
}

const numbers = frNumber();
const fmt = (n: number) => numbers.format(n);

/** La date d'un champ `datetime-local`, en ISO, ou `null` si elle est vide ou illisible. */
export function dateIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;
  const time = new Date(local).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/* ---------- Le message envoyé au serveur ---------- */

/** Le message de `send_discord_message`, au format de Discord : seulement ce qui est rempli. */
export interface MessageBody {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: Record<string, unknown>[];
  notify: Notify;
  silent?: boolean;
  thread_name?: string;
}

/**
 * Le brouillon devenu message. `fileUrl` donne l'adresse publique d'un fichier déjà déposé ; un fichier sans adresse
 * est laissé de côté (la page les dépose tous avant d'appeler cette fonction).
 */
export function messageBody(draft: MessageDraft, fileUrl: (id: string) => string | null): MessageBody {
  const text = (value: string) => cleanText(value) || undefined;
  const image = (slot: ImageSlot) => (slot.kind === "link" ? text(slot.url) : slot.kind === "file" ? (fileUrl(slot.id) ?? undefined) : undefined);
  const body: MessageBody = { notify: draft.notify };
  const content = text(draft.content);
  if (content) body.content = content;
  const username = text(draft.username);
  if (username) body.username = username;
  const avatar = image(draft.avatar);
  if (avatar) body.avatar_url = avatar;
  if (draft.silent) body.silent = true;
  const thread = text(draft.thread);
  if (thread) body.thread_name = thread;
  const embeds = draft.embeds.map((embed) => {
    const out: Record<string, unknown> = {};
    const put = (key: string, value: unknown) => {
      if (value !== undefined) out[key] = value;
    };
    put("title", text(embed.title));
    put("url", text(embed.url));
    put("description", text(embed.description));
    const color = embed.color === null ? null : colorNumber(embed.color);
    if (color !== null) out["color"] = color;
    if (embed.time === "now") out["timestamp"] = "now";
    else if (embed.time === "date") put("timestamp", dateIso(embed.date) ?? undefined);
    const authorName = text(embed.authorName);
    if (authorName) {
      const author: Record<string, string> = { name: authorName };
      const url = text(embed.authorUrl);
      const icon = image(embed.authorIcon);
      if (url) author["url"] = url;
      if (icon) author["icon_url"] = icon;
      out["author"] = author;
    }
    const footerText = text(embed.footerText);
    if (footerText) {
      const footer: Record<string, string> = { text: footerText };
      const icon = image(embed.footerIcon);
      if (icon) footer["icon_url"] = icon;
      out["footer"] = footer;
    }
    const big = image(embed.image);
    if (big) out["image"] = { url: big };
    const small = image(embed.thumbnail);
    if (small) out["thumbnail"] = { url: small };
    const fields = embed.fields.map((f) => ({ name: cleanText(f.name), value: cleanText(f.value), inline: f.inline }));
    if (fields.length > 0) out["fields"] = fields;
    return out;
  });
  if (embeds.length > 0) body.embeds = embeds;
  return body;
}

/** Les fichiers à déposer avant l'envoi, dans l'ordre du formulaire, chacun une fois. */
export function draftFiles(draft: MessageDraft): Extract<ImageSlot, { kind: "file" }>[] {
  const slots: ImageSlot[] = [draft.avatar, ...draft.embeds.flatMap((e) => [e.authorIcon, e.image, e.thumbnail, e.footerIcon])];
  const seen = new Set<string>();
  const files: Extract<ImageSlot, { kind: "file" }>[] = [];
  for (const slot of slots) {
    if (slot.kind === "file" && !seen.has(slot.id)) {
      seen.add(slot.id);
      files.push(slot);
    }
  }
  return files;
}

/** Le brouillon a-t-il quelque chose d'écrit ou d'ajouté ? Sert à ne pas l'écraser sans prévenir. */
export function draftHasContent(draft: MessageDraft): boolean {
  return textLength(draft.content) > 0 || textLength(draft.username) > 0 || draft.avatar.kind !== "none" || textLength(draft.thread) > 0 || draft.embeds.some((e) => embedShows(e) || cleanText(e.url) !== "");
}

/* ---------- Relire un message envoyé ---------- */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const linkSlot = (value: unknown): ImageSlot => (typeof value === "string" && value !== "" ? { kind: "link", url: value } : NO_IMAGE);

/** Une date ISO devenue la valeur d'un champ `datetime-local`, à l'heure du navigateur. */
export function localInput(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Un message envoyé, tel que le serveur l'a gardé, remis dans le formulaire (« Reprendre »). Les images y sont des adresses. */
export function draftOfMessage(raw: unknown, salon: string): MessageDraft {
  const message = isRecord(raw) ? raw : {};
  const notify = message["notify"] === "mentions" || message["notify"] === "everyone" ? message["notify"] : "none";
  const embeds = (Array.isArray(message["embeds"]) ? message["embeds"] : []).filter(isRecord).slice(0, LIMITS.embeds).map((e): EmbedDraft => {
    const author = isRecord(e["author"]) ? e["author"] : {};
    const footer = isRecord(e["footer"]) ? e["footer"] : {};
    const image = isRecord(e["image"]) ? e["image"] : {};
    const thumbnail = isRecord(e["thumbnail"]) ? e["thumbnail"] : {};
    const timestamp = e["timestamp"];
    const color = e["color"];
    return {
      ...newEmbed(),
      color: typeof color === "number" && Number.isInteger(color) && color >= 0 && color <= 0xffffff ? colorHex(color) : null,
      title: str(e["title"]),
      url: str(e["url"]),
      description: str(e["description"]),
      fields: (Array.isArray(e["fields"]) ? e["fields"] : []).filter(isRecord).slice(0, LIMITS.fields).map((f) => ({ ...newField(), name: str(f["name"]), value: str(f["value"]), inline: f["inline"] === true })),
      image: linkSlot(image["url"]),
      thumbnail: linkSlot(thumbnail["url"]),
      authorName: str(author["name"]),
      authorUrl: str(author["url"]),
      authorIcon: linkSlot(author["icon_url"]),
      footerText: str(footer["text"]),
      footerIcon: linkSlot(footer["icon_url"]),
      time: timestamp === "now" ? "now" : typeof timestamp === "string" && localInput(timestamp) !== "" ? "date" : "none",
      date: typeof timestamp === "string" && timestamp !== "now" ? localInput(timestamp) : "",
    };
  });
  return {
    salon,
    content: str(message["content"]),
    username: str(message["username"]),
    avatar: linkSlot(message["avatar_url"]),
    notify,
    silent: message["silent"] === true,
    thread: str(message["thread_name"]),
    embeds,
  };
}

/* ---------- La réponse du serveur ---------- */

export type SalonKind = "robot" | "appels" | "message";

export interface MessageSalon {
  key: string;
  kind: SalonKind;
  /** Le salon du robot (`nouvelles`…), ou le numéro d'un salon ajouté. */
  robot: string | null;
  id: number | null;
  /** Le nom donné à un salon ajouté. */
  name: string | null;
  /** Le nom du webhook, que Discord affiche quand le message n'en donne pas d'autre. */
  webhookName: string | null;
  /** La réponse de Discord à la lecture du webhook d'un salon ajouté (0 : pas de réponse). */
  checkStatus: number | null;
  checking: boolean;
  createdAt: string | null;
  createdBy: string | null;
}

/** Où en est un message envoyé, d'après la réponse que le serveur a recopiée. */
export type SentOutcome =
  | { state: "accepted" }
  | { state: "refused"; status: number; detail: string | null }
  | { state: "timeout" }
  | { state: "unreached"; detail: string | null }
  | { state: "unsent"; detail: string | null }
  | { state: "waiting" }
  | { state: "silent" }
  | { state: "forgotten" };

export type RemoveOutcome = { state: "none" } | { state: "waiting" } | { state: "done" } | { state: "refused"; status: number } | { state: "silent" };

export interface SentMessage {
  id: number;
  salon: string;
  salonName: string | null;
  at: string;
  by: string | null;
  message: unknown;
  outcome: SentOutcome;
  removable: boolean;
  /** Pourquoi le message ne se retire plus d'ici : le salon n'est plus branché, ou il a changé de webhook depuis l'envoi. */
  blocked: "salon" | "webhook" | null;
  removedAt: string | null;
  removedBy: string | null;
  remove: RemoveOutcome;
}

export interface MessagesState {
  now: number;
  salons: MessageSalon[];
  messages: SentMessage[];
}

const timeOf = (value: unknown): number | null => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);
const textOf = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
const intOf = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) ? value : null);

/** La réponse de pg_net est effacée au bout de six heures, et pg_net envoie en moins d'une seconde d'ordinaire. */
const RESPONSE_KEPT_MS = 6 * 3_600_000;
const ANSWER_EXPECTED_MS = 60_000;
const SALON_KEY = /^(robot:[a-z]{1,20}|appels|message:[0-9]{1,18})$/;

function salonOf(raw: unknown): MessageSalon | null {
  if (!isRecord(raw)) return null;
  const key = raw["key"];
  const kind = raw["kind"];
  if (typeof key !== "string" || !SALON_KEY.test(key)) return null;
  if (kind !== "robot" && kind !== "appels" && kind !== "message") return null;
  if (!key.startsWith(kind === "message" ? "message:" : kind === "robot" ? "robot:" : "appels")) return null;
  const id = intOf(raw["id"]);
  const name = textOf(raw["name"]);
  if (kind === "message" && (id === null || name === null)) return null;
  const status = intOf(raw["check_status"]);
  return {
    key,
    kind,
    robot: kind === "robot" ? key.slice("robot:".length) : null,
    id: kind === "message" ? id : null,
    name: kind === "message" ? name : null,
    webhookName: textOf(raw["webhook_name"]),
    checkStatus: status !== null && status >= 0 && status <= 599 ? status : null,
    checking: raw["checking"] === true,
    createdAt: timeOf(raw["created_at"]) === null ? null : (raw["created_at"] as string),
    createdBy: textOf(raw["created_by"]),
  };
}

function sentOf(raw: Record<string, unknown>, at: number, now: number): SentOutcome {
  const sendError = textOf(raw["send_error"]);
  if (raw["sent"] !== true) return { state: "unsent", detail: sendError };
  const status = intOf(raw["status"]);
  if (status !== null) {
    if (status >= 200 && status < 300) return { state: "accepted" };
    if (status === 0) return raw["timed_out"] === true ? { state: "timeout" } : { state: "unreached", detail: textOf(raw["discord_error"]) };
    return { state: "refused", status, detail: textOf(raw["discord_error"]) };
  }
  const age = now - at;
  if (age < ANSWER_EXPECTED_MS) return { state: "waiting" };
  return age < RESPONSE_KEPT_MS ? { state: "silent" } : { state: "forgotten" };
}

function removeOf(raw: Record<string, unknown>, now: number): RemoveOutcome {
  const removedAt = timeOf(raw["removed_at"]);
  if (removedAt === null) return { state: "none" };
  const status = intOf(raw["remove_status"]);
  // 0 : pg_net n'a pas eu de réponse. Ce n'est pas un refus de Discord.
  if (status === null) return now - removedAt < ANSWER_EXPECTED_MS ? { state: "waiting" } : { state: "silent" };
  if (status === 0) return { state: "silent" };
  return status >= 200 && status < 300 ? { state: "done" } : { state: "refused", status };
}

/** La réponse de `get_discord_messages`, relue ; l'âge d'un envoi se compte à l'heure du serveur. `null` : illisible. */
export function parseMessages(raw: unknown): MessagesState | null {
  if (!isRecord(raw)) return null;
  const now = timeOf(raw["now"]);
  if (now === null || !Array.isArray(raw["salons"]) || !Array.isArray(raw["messages"])) return null;
  const salons = raw["salons"].map(salonOf).filter((s): s is MessageSalon => s !== null);
  const messages: SentMessage[] = [];
  for (const item of raw["messages"]) {
    if (!isRecord(item)) continue;
    const id = intOf(item["id"]);
    const at = timeOf(item["at"]);
    const salon = item["salon"];
    if (id === null || at === null || typeof salon !== "string" || !SALON_KEY.test(salon)) continue;
    const remove = removeOf(item, now);
    messages.push({
      id,
      salon,
      salonName: textOf(item["salon_name"]),
      at: item["at"] as string,
      by: textOf(item["by"]),
      message: item["message"],
      outcome: sentOf(item, at, now),
      removable: item["removable"] === true && remove.state !== "done" && remove.state !== "waiting",
      blocked: item["salon_gone"] === true ? "salon" : item["webhook_changed"] === true ? "webhook" : null,
      removedAt: timeOf(item["removed_at"]) === null ? null : (item["removed_at"] as string),
      removedBy: textOf(item["removed_by"]),
      remove,
    });
  }
  return { now, salons, messages };
}

/** Une réponse de Discord se fait encore attendre : la page relit dans un instant. */
export const isMessageWaiting = (state: MessagesState | null): boolean =>
  state?.messages.some((m) => m.outcome.state === "waiting" || m.remove.state === "waiting") === true || state?.salons.some((s) => s.checking) === true;

/* ---------- Les mots de la page ---------- */

/** Le nom d'un salon, tel que la page l'écrit. Un salon du robot inconnu de cette page garde son nom de code. */
export function salonLabel(key: string, salons: readonly MessageSalon[], savedName: string | null = null): string {
  if (key === "appels") return "Le salon des appels";
  if (key.startsWith("robot:")) {
    const robot = key.slice("robot:".length);
    return ROBOT_SALON_TEXTS.find((t) => t.id === robot)?.title ?? `Le salon « ${robot} » du robot`;
  }
  return salons.find((s) => s.key === key)?.name ?? savedName ?? "Un salon retiré";
}

/** Le nom sous lequel le message paraîtra : celui donné pour ce message, sinon celui du webhook s'il est connu. */
export function botName(draft: MessageDraft, salons: readonly MessageSalon[]): string {
  return cleanText(draft.username) || salons.find((s) => s.key === draft.salon)?.webhookName || "Robot du salon";
}

/** Ce que Discord a répondu à la lecture du webhook d'un salon ajouté. */
export function checkSentence(salon: MessageSalon): string | null {
  if (salon.kind !== "message") return null;
  if (salon.checking) return "Vérification du lien auprès de Discord…";
  const status = salon.checkStatus;
  if (status === null) return null;
  if (status >= 200 && status < 300) return salon.webhookName ? `Lien vérifié : le webhook « ${salon.webhookName} » répond.` : "Lien vérifié : le webhook répond.";
  if (status === 404 || status === 401 || status === 403) return `Discord ne connaît pas ce lien (erreur ${status}) : le webhook a sans doute été supprimé. Retirez ce salon et ajoutez-le avec un nouveau lien.`;
  if (status === 0) return "Discord n'a pas répondu à la vérification du lien.";
  return `Discord a répondu par une erreur ${status} à la vérification du lien.`;
}

/** Les parties d'un message, comme les nomme le formulaire, pour traduire le chemin d'une erreur de Discord. */
const PARTS: Record<string, string> = {
  content: "le texte du message",
  username: "le nom du robot",
  avatar_url: "la photo du robot",
  thread_name: "le nom du fil",
  title: "le titre",
  description: "la description",
  url: "le lien du titre",
  color: "la couleur",
  timestamp: "la date",
  "author.name": "le nom de l'auteur",
  "author.url": "le lien de l'auteur",
  "author.icon_url": "l'icône de l'auteur",
  "footer.text": "le pied de page",
  "footer.icon_url": "l'icône du pied de page",
  "image.url": "l'image",
  "thumbnail.url": "la miniature",
};

/** Un chemin d'erreur de Discord (`embeds.0.image.url`) dit avec les mots du formulaire. */
export function partName(path: string): string {
  const embed = /^embeds\.(\d+)(?:\.(.+))?$/.exec(path);
  if (!embed) return PARTS[path] ?? path;
  const n = Number(embed[1]) + 1;
  const rest = embed[2];
  if (rest === undefined) return `l'embed ${n}`;
  const field = /^fields\.(\d+)(?:\.(name|value))?$/.exec(rest);
  if (field) return `l'embed ${n}, champ ${Number(field[1]) + 1}${field[2] === "name" ? " (nom)" : field[2] === "value" ? " (valeur)" : ""}`;
  return `l'embed ${n}, ${PARTS[rest] ?? rest}`;
}

/**
 * Ce que Discord reproche à un message refusé, lu dans sa réponse (`{"errors": {...}, "message": ...}`) : chaque champ
 * refusé avec le message de Discord, en anglais, tel quel. `null` : rien de lisible.
 */
export function discordErrorText(raw: string | null): string | null {
  if (raw === null) return null;
  let answer: unknown;
  try {
    answer = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(answer)) return null;
  const found: string[] = [];
  const walk = (node: unknown, path: string[]) => {
    if (!isRecord(node) || found.length >= 3) return;
    const errors = node["_errors"];
    if (Array.isArray(errors)) {
      const message = errors.map((e) => (isRecord(e) ? textOf(e["message"]) : null)).find((m) => m !== null);
      if (message) found.push(`${partName(path.join("."))} : « ${message} »`);
      return;
    }
    for (const [key, child] of Object.entries(node)) walk(child, [...path, key]);
  };
  walk(answer["errors"], []);
  if (found.length > 0) return found.join(" ; ");
  const message = textOf(answer["message"]);
  return message ? `« ${message} »` : null;
}

/** Ce qu'est devenu un message envoyé, en une phrase. `null` : la réponse n'est plus gardée, rien à dire. */
export function outcomeSentence(outcome: SentOutcome): string | null {
  switch (outcome.state) {
    case "accepted":
      return "Discord l'a accepté : il est dans le salon.";
    case "refused": {
      if (outcome.status === 404 || outcome.status === 401 || outcome.status === 403) return `Discord refuse le lien du salon (erreur ${outcome.status}) : le webhook a sans doute été supprimé. Branchez le salon de nouveau avec un nouveau lien.`;
      if (outcome.status === 429) return "Discord a reçu trop de messages et demande d'attendre (erreur 429). Renvoyez-le dans une minute.";
      if (outcome.status >= 500) return `Discord ne répond pas correctement pour l'instant (erreur ${outcome.status}).`;
      const detail = discordErrorText(outcome.detail);
      return `Discord l'a refusé (erreur ${outcome.status})${detail ? ` : ${detail}` : "."}`;
    }
    case "timeout":
      return "Discord n'a pas répondu à temps : regardez dans le salon s'il y est.";
    case "unreached":
      return "Le serveur n'a pas pu joindre Discord.";
    case "unsent":
      return `Le message n'a pas pu partir du serveur${outcome.detail ? ` : ${outcome.detail}` : "."}`;
    case "waiting":
      return "En attente de la réponse de Discord…";
    case "silent":
      return "Discord n'a pas répondu.";
    case "forgotten":
      return null;
  }
}

/** Où en est le retrait d'un message, en une phrase. `when` écrit la date. */
export function removeSentence(message: SentMessage, when: (iso: string) => string): string | null {
  const by = message.removedBy ? ` par ${message.removedBy}` : "";
  const at = message.removedAt ? ` le ${when(message.removedAt)}` : "";
  switch (message.remove.state) {
    case "none":
      return null;
    case "waiting":
      return "Retrait demandé à Discord…";
    case "done":
      return `Retiré du salon${at}${by}.`;
    case "refused":
      return message.remove.status === 404
        ? "Discord ne trouve plus ce message (erreur 404) : il a sans doute déjà été effacé dans le salon."
        : `Discord a refusé le retrait (erreur ${message.remove.status}).`;
    case "silent":
      return "Discord n'a pas répondu à la demande de retrait.";
  }
}

/** Pourquoi un message posté n'a plus de bouton « Retirer du salon ». `null` : rien à dire. */
export function blockedSentence(message: SentMessage): string | null {
  if (message.outcome.state !== "accepted" || message.remove.state === "done" || message.removable) return null;
  if (message.blocked === "salon") return "Ce salon n'est plus branché ici : ce message ne se retire plus que dans Discord.";
  if (message.blocked === "webhook") return "Ce salon a changé de webhook depuis l'envoi : ce message ne se retire plus que dans Discord.";
  return null;
}

/** Le résumé d'un message envoyé, pour la liste : son premier titre, son auteur, son texte ou sa description. */
export function messageSummary(raw: unknown): string {
  const message = isRecord(raw) ? raw : {};
  const embeds = Array.isArray(message["embeds"]) ? message["embeds"].filter(isRecord) : [];
  const first = embeds[0] ?? {};
  const author = isRecord(first["author"]) ? first["author"] : {};
  const candidates = [first["title"], message["content"], author["name"], first["description"]];
  const text = candidates.map((c) => (typeof c === "string" ? c.replace(/\s+/g, " ").trim() : "")).find((c) => c !== "");
  if (!text) return embeds.length > 0 ? "Embed sans texte" : "Message sans texte";
  const chars = Array.from(text);
  return chars.length > 90 ? `${chars.slice(0, 89).join("")}…` : text;
}

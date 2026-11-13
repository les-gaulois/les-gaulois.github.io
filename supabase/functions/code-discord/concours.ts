/**
 * Les concours du clan sur Discord (docs/DIRECTION.md, « Les concours sur Discord »), demandés par le pilote le 12 novembre
 * 2026 : le concours (giveaway) de DraftBot, refait « en mieux » par le robot « Le Gaulois ».
 *
 * - `/concours lancer`, réservée à l'encadrement par Discord : le lot, la fin (une durée ou une date, lue pendant la saisie),
 *   le nombre de gagnants, le rôle qu'il faut pour participer, celui à prévenir, une image de l'inventaire de la Direction ;
 *   puis un formulaire pour le titre et le texte. Le robot poste le message du concours dans le salon.
 * - « Participer », d'un clic : la réponse n'est vue que du joueur, avec « Me retirer ». Le rôle demandé est vérifié sur ce
 *   que Discord signe avec le clic. Le nombre de participants se met à jour sur le message, et la fin s'y lit en direct.
 * - À la fin, le serveur tire au sort l'ordre de tous les participants (migration 20261112000800). Le robot y prend les
 *   gagnants, en passant ceux qui ont quitté le serveur ou perdu le rôle depuis, et le message le dit. Il répond au message
 *   du concours pour féliciter les gagnants, qui confirment d'un clic.
 * - `/concours terminer`, `annuler` et `remplacer` (un nouveau tirage, au suivant dans le même ordre).
 * - Depuis le 13 novembre 2026, une tombola (maquette C choisie par le pilote) : « Prendre un billet » donne à chacun un
 *   billet numéroté (migration 20261113000100), montré en image ; l'annonce montre le billet gagnant. Le site publie la
 *   bannière et les fonds des billets (/tombola/), la fonction y pose le numéro quand Discord demande l'image
 *   (`concoursImage`, billets.ts). Le tirage ne change pas : le numéro dit seulement qui a gagné.
 *
 * Le robot écrit avec son jeton (`deps.discord`, secret LE_GAULOIS_BOT_TOKEN). Le serveur décide de tout : qui participe,
 * le tirage, les gagnants. La base réveille la fonction chaque minute quand un concours a besoin d'elle (`concoursTic`).
 * Les journaux ne portent ni identifiant de joueur ni jeton : seulement le numéro du concours et la réponse de Discord.
 *
 * Importé par index.ts, dont il n'importe que des types : sinon, une boucle d'import au démarrage.
 */
import { BILLET_MAX, billetPng, lirePng, numeroBillet, type Image } from "./billets.ts";
import type { Deps, DiscordReply } from "./index.ts";

/** Ce dont le concours a besoin de la fonction. */
export type ConcoursDeps = Pick<Deps, "guildId" | "nowSeconds" | "rpc" | "discord" | "webhook" | "background" | "log" | "botId" | "botAccepted" | "projectUrl" | "siteImage">;

type Json = Record<string, unknown>;

/* ---------- Les noms, ceux que `src/lib/discord-commande.ts` donne à Discord (un test le vérifie) ---------- */

export const CONCOURS_COMMAND_NAME = "concours";
/** Le début du `custom_id` des boutons et du formulaire des concours ; les autres parties du robot ont le leur. */
export const CONCOURS_PREFIX = "concours:";
export const CONCOURS_SUB = { lancer: "lancer", terminer: "terminer", annuler: "annuler", remplacer: "remplacer" } as const;
export const CONCOURS_OPT = {
  lot: "lot",
  fin: "fin",
  gagnants: "gagnants",
  participants: "participants",
  notifier: "notifier",
  image: "image",
  concours: "concours",
  gagnant: "gagnant",
} as const;
/** Les champs du formulaire. */
export const CHAMP_TITRE = "titre";
export const CHAMP_TEXTE = "texte";

/** Le site (le même que `SITE_URL` d'index.ts, qui ne s'importe pas d'ici : un test les compare). */
export const CONCOURS_SITE_URL = "https://les-gaulois.github.io";
/** La bannière de la tombola, en haut du message du concours (src/lib/tombola-image.ts). */
export const BANNIERE_URL = `${CONCOURS_SITE_URL}/tombola/banniere.png`;
export const BANNIERE_ALT = "Tombola des Gaulois : un billet numéroté pour chaque participant, le numéro tiré au sort gagne.";
/** Les fonds des billets, sur le site : la fonction y pose le numéro (`concoursImage`). */
export const FONDS = { billet: "/tombola/billet.png", gagnant: "/tombola/gagnant.png" } as const;
export type SorteBillet = keyof typeof FONDS;
/** Où la base réveille la fonction, sous l'adresse du projet Supabase. */
export const REVEIL_PATH = "/functions/v1/code-discord/concours/tic";
/**
 * Où Discord lit l'image d'un billet, sous l'adresse du projet : `…/concours/billet/17.png`. `v` change si le dessin
 * change, pour que Discord ne garde pas l'ancien.
 */
export const BILLETS_PATH = "/functions/v1/code-discord/concours/";
export const BILLET_VERSION = "1";
/** Le billet du bouton « Prendre un billet » (l'émoji « ticket d'entrée »), écrit par ses numéros : un éditeur ne l'abîme pas. */
export const BILLET_EMOJI = String.fromCodePoint(0x1f39f, 0xfe0f);
/** Les images de l'inventaire de la Direction, publiques, sous l'adresse du projet. */
export const IMAGES_PATH = "/storage/v1/object/public/discord-images/";

const COMPONENTS_V2 = 1 << 15;
const EPHEMERAL = 1 << 6;
/** Les couleurs du site (src/styles/global.css) : bleu ouvert, or pour le résultat, gris-bleu pour l'annulation. */
export const COULEURS = { ouvert: 0x0b5fff, termine: 0xffc857, annule: 0x5469ae } as const;
/** La fin d'un concours : une minute au moins, 31 jours au plus. */
export const FIN_MIN_MS = 60_000;
export const FIN_MAX_MS = 31 * 86_400_000;
/** La place de la liste privée des participants : Discord refuse un message de plus de 4 000 signes. */
export const LISTE_SIGNES = 3900;
/** Les membres vérifiés au plus à chaque prise d'un concours, pour choisir des gagnants : la suite attend la prise suivante. */
const VERIFS_MAX = 10;
/** Les concours que le robot mène à chaque réveil, au plus, un à la fois. */
const CONCOURS_PAR_REVEIL = 5;

const SNOWFLAKE = /^[0-9]{17,20}$/;
const isId = (value: unknown): value is string => typeof value === "string" && SNOWFLAKE.test(value);
const record = (value: unknown): Json | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;

/* ---------- Les heures, à Paris ---------- */

const PARIS = "Europe/Paris";
const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: PARIS,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, weekday: "long", day: "numeric", month: "long" });

/** L'heure de Paris à cet instant : année, mois, jour, heure, minute. */
export function parisParts(ms: number): { y: number; mo: number; d: number; h: number; mi: number } {
  const p: Record<string, string> = {};
  for (const part of partsFormat.formatToParts(new Date(ms))) p[part.type] = part.value;
  return { y: Number(p["year"]), mo: Number(p["month"]), d: Number(p["day"]), h: Number(p["hour"]), mi: Number(p["minute"]) };
}

/**
 * L'instant d'une heure de Paris. Paris a une heure (l'hiver) ou deux (l'été) d'avance sur le temps universel : l'instant
 * retenu est celui qui, relu à Paris, redonne la même date et la même heure. `null` : une date qui n'existe pas (31/02),
 * ou une heure sautée au passage à l'heure d'été.
 */
export function parisToUtc(y: number, mo: number, d: number, h: number, mi: number): number | null {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  for (const offsetHours of [1, 2]) {
    const at = wall - offsetHours * 3_600_000;
    const p = parisParts(at);
    if (p.y === y && p.mo === mo && p.d === d && p.h === h && p.mi === mi) return at;
  }
  return null;
}

/** « samedi 14 novembre à 20 h 30 », à Paris. */
export function formatParis(ms: number): string {
  const p = parisParts(ms);
  return `${dayFormat.format(new Date(ms))} à ${p.h} h${p.mi === 0 ? "" : ` ${String(p.mi).padStart(2, "0")}`}`;
}

/** « a, b et c ». */
export function listeFr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/* ---------- La fin d'un concours, telle que l'encadrement l'écrit ---------- */

const UNITES: readonly [RegExp, number][] = [
  [/^(?:semaines?|sem|w)$/, 7 * 1440],
  [/^(?:jours?|j|d)$/, 1440],
  [/^(?:heures?|h)$/, 60],
  [/^(?:minutes?|mins?|mn|m)$/, 1],
];

/** Une durée écrite en mots ou en abrégé : « 3 jours », « 12 h », « 1 j 6 h », « 2h30 », « dans 45 min ». En minutes, ou `null`. */
export function parseDuree(text: string): number | null {
  let t = text.replace(/^dans /, "").replace(/ et |,/g, " ");
  // « 2h30 », « 2 h 30 » : les minutes après l'heure, sans leur unité.
  t = t.replace(/(\d+) ?h ?(\d{1,2})$/, "$1 h $2 min");
  t = t.replace(/(\d)([a-z])/g, "$1 $2").replace(/([a-z])(\d)/g, "$1 $2").replace(/\s+/g, " ").trim();
  const tokens = t.split(" ");
  if (tokens.length < 2 || tokens.length % 2 === 1) return null;
  let total = 0;
  const seen = new Set<number>();
  for (let i = 0; i < tokens.length; i += 2) {
    const n = tokens[i] ?? "";
    const unit = tokens[i + 1] ?? "";
    if (!/^\d{1,4}$/.test(n)) return null;
    const found = UNITES.find(([re]) => re.test(unit));
    if (!found || seen.has(found[1])) return null;
    seen.add(found[1]);
    total += Number(n) * found[1];
  }
  return total > 0 ? total : null;
}

export type FinLue = { ok: true; at: number } | { ok: false; error: "format" | "trop_proche" | "trop_loin" };

/**
 * La fin du concours : une durée (« 3 jours », « 1 j 6 h », « 2h30 ») ou une date à l'heure de Paris (« 14/11 20:30 »,
 * « 14/11/2026 à 20 h »). Une date sans année est celle qui vient. Entre une minute et 31 jours.
 */
export function parseFin(input: string, nowMs: number): FinLue {
  const text = input.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  let at: number | null;
  const date = /^(?:le )?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?: a)? (\d{1,2}) ?(?:h|:) ?(\d{2})?$/.exec(text);
  if (date) {
    const [, dd = "", mm = "", yy, hh = "", mi] = date;
    const year = yy === undefined ? parisParts(nowMs).y : yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    at = parisToUtc(year, Number(mm), Number(dd), Number(hh), Number(mi ?? "0"));
    // Sans année, une date passée de plus d'un jour est celle de l'an prochain : « 05/01 » écrit en décembre.
    if (at !== null && yy === undefined && at < nowMs - 86_400_000) at = parisToUtc(year + 1, Number(mm), Number(dd), Number(hh), Number(mi ?? "0"));
  } else {
    const minutes = parseDuree(text);
    at = minutes === null ? null : nowMs + minutes * 60_000;
  }
  if (at === null) return { ok: false, error: "format" };
  if (at - nowMs < FIN_MIN_MS) return { ok: false, error: "trop_proche" };
  if (at - nowMs > FIN_MAX_MS) return { ok: false, error: "trop_loin" };
  return { ok: true, at };
}

/** Les durées proposées pendant la saisie. */
export const FIN_PROPOSEES = ["1 heure", "6 heures", "12 heures", "1 jour", "2 jours", "3 jours", "1 semaine", "2 semaines"] as const;

const choix100 = (text: string): string => (text.length > 100 ? `${text.slice(0, 99)}…` : text);

/** Pendant la saisie de la fin : ce que Discord comprend de ce qui est tapé, avec la date, puis des durées toutes prêtes. */
export function finChoices(typed: string, nowMs: number): { name: string; value: string }[] {
  const choices: { name: string; value: string }[] = [];
  const value = typed.trim().slice(0, 40);
  if (value !== "") {
    const lue = parseFin(value, nowMs);
    if (lue.ok) choices.push({ name: choix100(`${value} : fin le ${formatParis(lue.at)}`), value });
  }
  for (const proposee of FIN_PROPOSEES) {
    const lue = parseFin(proposee, nowMs);
    if (lue.ok && proposee !== value) choices.push({ name: choix100(`${proposee} : fin le ${formatParis(lue.at)}`), value: proposee });
  }
  return choices.slice(0, 25);
}

/* ---------- Un concours, tel que le serveur le rend ---------- */

export type Statut = "brouillon" | "ouvert" | "termine" | "annule";
export type Issue = "gagnant" | "remplace" | "parti" | "sans_role";

export interface Tire {
  discord_id: string;
  rang: number;
  tirage: number;
  issue: Issue;
  confirme_at: string | null;
  annonce_id: string | null;
  /** Son billet ; `null` si le serveur ne le dit pas (migration 20261113000100 pas encore installée). */
  billet: number | null;
}

export interface Vue {
  id: number;
  guild_id: string;
  salon_id: string;
  message_id: string | null;
  createur_id: string;
  titre: string;
  lot: string;
  texte: string | null;
  gagnants: number;
  role_id: string | null;
  notifier_id: string | null;
  image_url: string | null;
  image_alt: string | null;
  fin: string;
  statut: Statut;
  tire_at: string | null;
  /** L'heure du dernier tirage : le premier, ou un nouveau tirage. */
  tirage_at: string | null;
  annule_par: string | null;
  annule_at: string | null;
  a_tirer: number;
  tirage: number;
  epuise: boolean;
  /** Les tirés au sort passés, et les gagnants remplacés : leurs nombres, gardés après l'effacement de leurs lignes. */
  nb_passes: number;
  nb_remplaces: number;
  compte: number;
  /** Le nombre de participants au tirage, ou à l'annulation. */
  compte_tirage: number | null;
  compte_affiche: number;
  /** Le numéro de ce que le message doit montrer : un changement arrivé pendant une modification la fera refaire. */
  rendu: number;
  final_affiche: boolean;
  message_perdu: boolean;
  salon_perdu: boolean;
  essais: number;
  /** La prise du robot sur ce concours, à rendre avec son compte rendu ; `null` hors d'un réveil. */
  jeton: string | null;
  ordre: string[] | null;
  tires: Tire[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATUTS: readonly string[] = ["brouillon", "ouvert", "termine", "annule"];
const ISSUES: readonly string[] = ["gagnant", "remplace", "parti", "sans_role"];
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const idOrNull = (value: unknown): string | null => (isId(value) ? value : null);
const date = (value: unknown): string | null => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null);
const entier = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);
/** Un numéro de billet : un entier d'au moins 1. */
const billetOuNull = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null);

/** Le concours rendu par le serveur, relu sans lui faire confiance : `null` s'il n'a pas la forme attendue. */
export function parseVue(value: unknown): Vue | null {
  const v = record(value);
  if (!v) return null;
  const id = entier(v["id"]);
  const titre = str(v["titre"]);
  const lot = str(v["lot"]);
  const fin = date(v["fin"]);
  const statut = str(v["statut"]);
  const gagnants = entier(v["gagnants"]);
  if (id === null || !isId(v["guild_id"]) || !isId(v["salon_id"]) || !isId(v["createur_id"]) || titre === null || lot === null || fin === null) return null;
  if (statut === null || !STATUTS.includes(statut) || gagnants === null) return null;
  const tires: Tire[] = [];
  for (const item of Array.isArray(v["tires"]) ? v["tires"] : []) {
    const t = record(item);
    const issue = str(t?.["issue"]);
    const rang = entier(t?.["rang"]);
    const tirage = entier(t?.["tirage"]);
    if (!t || !isId(t["discord_id"]) || issue === null || !ISSUES.includes(issue) || rang === null || tirage === null) return null;
    tires.push({ discord_id: t["discord_id"], rang, tirage, issue: issue as Issue, confirme_at: date(t["confirme_at"]), annonce_id: idOrNull(t["annonce_id"]), billet: billetOuNull(t["billet"]) });
  }
  const ordre = Array.isArray(v["ordre"]) ? v["ordre"].filter(isId) : null;
  const image = str(v["image_url"]);
  return {
    id,
    guild_id: v["guild_id"],
    salon_id: v["salon_id"],
    message_id: idOrNull(v["message_id"]),
    createur_id: v["createur_id"],
    titre,
    lot,
    texte: str(v["texte"]),
    gagnants,
    role_id: idOrNull(v["role_id"]),
    notifier_id: idOrNull(v["notifier_id"]),
    image_url: image !== null && image.startsWith("https://") ? image : null,
    image_alt: str(v["image_alt"]),
    fin,
    statut: statut as Statut,
    tire_at: date(v["tire_at"]),
    tirage_at: date(v["tirage_at"]),
    annule_par: idOrNull(v["annule_par"]),
    annule_at: date(v["annule_at"]),
    a_tirer: entier(v["a_tirer"]) ?? 0,
    tirage: entier(v["tirage"]) ?? 0,
    epuise: v["epuise"] === true,
    nb_passes: entier(v["nb_passes"]) ?? 0,
    nb_remplaces: entier(v["nb_remplaces"]) ?? 0,
    compte: entier(v["compte"]) ?? 0,
    compte_tirage: entier(v["compte_tirage"]),
    compte_affiche: entier(v["compte_affiche"]) ?? 0,
    rendu: entier(v["rendu"]) ?? 0,
    final_affiche: v["final_affiche"] === true,
    message_perdu: v["message_perdu"] === true,
    salon_perdu: v["salon_perdu"] === true,
    essais: entier(v["essais"]) ?? 0,
    jeton: typeof v["jeton"] === "string" && UUID.test(v["jeton"]) ? v["jeton"] : null,
    ordre,
    tires,
  };
}

/* ---------- Les messages ---------- */

const seconds = (iso: string | null): number => Math.floor(Date.parse(iso ?? "") / 1000);
/** Une heure que Discord écrit dans la langue et le fuseau de chacun : « F », la date entière ; « R », « dans 3 jours ». */
const quand = (iso: string | null, style: "F" | "R" | "f"): string => (Number.isFinite(seconds(iso)) ? `<t:${seconds(iso)}:${style}>` : "");
const membre = (id: string): string => `<@${id}>`;
/** Un rôle : le rôle « @everyone » a le numéro du serveur, et s'écrit tel quel. */
const role = (id: string, guildId: string): string => (id === guildId ? "@everyone" : `<@&${id}>`);
const pluriel = (n: number, un: string, plusieurs: string): string => (n > 1 ? plusieurs : un);
export const billetsLabel = (n: number): string => `${n} billet${n > 1 ? "s" : ""}`;
/** « n° 017 ». */
const noBillet = (n: number): string => `n° ${numeroBillet(n)}`;
/** Un tiré au sort tel que les messages l'écrivent : « n° 017, @Brennos », ou la mention seule sans billet connu. */
const avecBillet = (id: string, n: number | null): string => (n === null ? membre(id) : `${noBillet(n)}, ${membre(id)}`);
/**
 * L'adresse de l'image d'un billet, que la fonction dessine quand Discord la demande (`concoursImage`). `null` sans
 * l'adresse du projet, ou pour un numéro qui ne se dessine pas : le message garde alors le numéro en texte.
 */
export function billetUrl(projectUrl: string | undefined, sorte: SorteBillet, n: number | null): string | null {
  if (!projectUrl || n === null || !Number.isInteger(n) || n < 1 || n > BILLET_MAX) return null;
  return `${projectUrl.replace(/\/+$/, "")}${BILLETS_PATH}${sorte}/${n}.png?v=${BILLET_VERSION}`;
}
interface Illustration {
  url: string;
  description: string;
}
/** Des images en grand, avec ce qu'elles montrent pour qui ne les voit pas. */
const galerie = (items: readonly Illustration[]): Json => ({ type: 12, items: items.map((i) => ({ media: { url: i.url }, description: i.description.slice(0, 1024) })) });
const texte = (content: string): Json => ({ type: 10, content });
const bouton = (customId: string, label: string, style: 1 | 2 | 3 | 4, options: { emoji?: string; disabled?: boolean } = {}): Json => ({
  type: 2,
  style,
  custom_id: customId,
  label: label.slice(0, 80),
  ...(options.emoji ? { emoji: { name: options.emoji } } : {}),
  ...(options.disabled ? { disabled: true } : {}),
});
const rangee = (...boutons: Json[]): Json => ({ type: 1, components: boutons });
export const customId = (action: "participer" | "quitter" | "liste" | "confirmer" | "texte", id: number): string => `${CONCOURS_PREFIX}${action}:${id}`;

/** Les gagnants actuels, dans l'ordre du tirage. */
const gagnantsDe = (c: Vue): Tire[] => c.tires.filter((t) => t.issue === "gagnant").sort((a, b) => a.tirage - b.tirage || a.rang - b.rang);

/**
 * Le message du concours : une carte aux couleurs du site, la bannière de la tombola, le titre, le texte de l'encadrement,
 * ce qui est à gagner, qui peut participer, le nombre de gagnants et la fin (que Discord écrit en direct, « dans 3 jours ») ;
 * une fois tiré, les billets gagnants et le nombre de billets. Deux boutons : « Prendre un billet » et le nombre de billets,
 * qui en montre la liste. `ping` : au lancement seulement, le rôle à prévenir est mentionné pour de bon ; ensuite, la
 * mention reste écrite sans prévenir personne. Aucun autre nom ne prévient qui que ce soit.
 */
export function concoursMessage(c: Vue, ping = false): Json {
  const termine = c.statut === "termine";
  const annule = c.statut === "annule";
  const entete = annule ? "Concours annulé" : termine ? "Concours terminé" : "Concours du clan";
  const faits: string[] = [];
  const notes: string[] = [];
  if (termine) {
    const gagnants = gagnantsDe(c);
    const n = c.compte_tirage ?? c.compte;
    if (gagnants.length > 0) {
      // « n° 017, @Brennos » : plusieurs gagnants se séparent par un point-virgule, la virgule étant déjà prise.
      const noms = gagnants.map((t) => `${avecBillet(t.discord_id, t.billet)}${t.confirme_at ? " (a confirmé)" : ""}`);
      // Sans numéro connu (un concours tiré avant la migration des billets), le gagnant est nommé seul.
      const libelle = gagnants.every((t) => t.billet !== null) ? pluriel(gagnants.length, "Billet gagnant", "Billets gagnants") : pluriel(gagnants.length, "Gagnant", "Gagnants");
      faits.push(`**${libelle} :** ${noms.join(" ; ")}`);
    } else if (c.a_tirer > 0) {
      faits.push("**Billet gagnant :** tirage en cours");
    } else if (n > 0) {
      faits.push("**Billet gagnant :** aucun, plus personne à tirer au sort");
    }
    faits.push(`**À gagner :** ${c.lot}`);
    faits.push(n === 0 ? `**Tirage :** ${quand(c.tire_at, "F")}, personne n'a pris de billet` : `**Tirage :** ${quand(c.tire_at, "F")}, au hasard parmi ${billetsLabel(n)}`);
    // Les nombres que garde le serveur : les lignes des passés et des remplacés s'effacent 30 jours après le tirage.
    const passes = c.nb_passes;
    if (passes > 0) {
      notes.push(`${passes} ${pluriel(passes, "participant tiré au sort avait", "participants tirés au sort avaient")} quitté le serveur ou perdu le rôle : ${pluriel(passes, "passé", "passés")}.`);
    }
    const remplaces = c.nb_remplaces;
    if (remplaces > 0) notes.push(`${remplaces} ${pluriel(remplaces, "gagnant remplacé", "gagnants remplacés")} par un nouveau tirage.`);
    if (c.epuise && gagnants.length > 0 && gagnants.length < c.gagnants) notes.push("Plus personne à tirer au sort pour les autres places.");
  } else if (annule) {
    faits.push(`**À gagner :** ${c.lot}`);
    faits.push(`**Annulé :** ${quand(c.annule_at, "F")}${c.annule_par ? `, par ${membre(c.annule_par)}` : ""}`);
  } else {
    faits.push(`**À gagner :** ${c.lot}`);
    faits.push(`**Pour participer :** ${c.role_id ? `avoir le rôle ${role(c.role_id, c.guild_id)}` : "être sur le serveur"}`);
    faits.push(`**${pluriel(c.gagnants, "Gagnant", "Gagnants")} :** ${c.gagnants} ${pluriel(c.gagnants, "billet tiré", "billets tirés")} au sort à la fin`);
    faits.push(`**Fin :** ${quand(c.fin, "F")}, ${quand(c.fin, "R")}`);
  }
  notes.push(`Lancé par ${membre(c.createur_id)}`);

  const carte: Json[] = [galerie([{ url: BANNIERE_URL, description: BANNIERE_ALT }]), texte(`-# ${entete}`), texte(`## ${c.titre}`)];
  if (c.texte) carte.push(texte(c.texte));
  carte.push({ type: 14, divider: true, spacing: 1 });
  carte.push(texte(faits.join("\n")));
  if (c.image_url) carte.push({ type: 12, items: [{ media: { url: c.image_url }, description: (c.image_alt ?? `L'image du concours « ${c.titre} »`).slice(0, 1024) }] });
  carte.push(texte(notes.map((note) => `-# ${note}`).join("\n")));

  // Tiré au sort ou annulé, les billets comptés à ce moment-là : la liste s'efface ensuite, le nombre reste. Sans ce
  // nombre, le bouton ne dit pas « 0 » : il dit seulement « Billets ».
  const compte = termine || annule ? c.compte_tirage : c.compte;
  const components: Json[] = [];
  if (c.notifier_id) components.push(texte(role(c.notifier_id, c.guild_id)));
  components.push({ type: 17, accent_color: annule ? COULEURS.annule : termine ? COULEURS.termine : COULEURS.ouvert, components: carte });
  components.push(
    rangee(
      bouton(customId("participer", c.id), termine ? "Terminé" : annule ? "Annulé" : "Prendre un billet", 1, { emoji: BILLET_EMOJI, disabled: termine || annule }),
      bouton(customId("liste", c.id), compte === null ? "Billets" : billetsLabel(compte), 2, { disabled: annule }),
    ),
  );
  const allowed = ping && c.notifier_id ? (c.notifier_id === c.guild_id ? { parse: ["everyone"] } : { parse: [], roles: [c.notifier_id] }) : { parse: [] };
  return { flags: COMPONENTS_V2, components, allowed_mentions: allowed };
}

/**
 * L'annonce des gagnants, en réponse au message du concours : le billet gagnant de chacun en image (dix au plus, la limite
 * de Discord), « Félicitations », le lot, puis, pour chacun, s'il a confirmé. Un gagnant remplacé garde sa ligne, plus son
 * billet. `ping` : à l'envoi, les gagnants nommés sont prévenus, et eux seuls ; une mise à jour ne prévient personne.
 * `projectUrl` : l'adresse du projet, où Discord lit l'image des billets ; sans elle, les numéros restent en texte.
 */
export function annonceMessage(c: Vue, elus: Tire[], ping: boolean, projectUrl?: string): Json {
  const premier = elus.every((t) => t.tirage === 1);
  const noms = listeFr(elus.map((t) => membre(t.discord_id)));
  const lignes = elus.map((t) => {
    const qui = avecBillet(t.discord_id, t.billet);
    return t.issue === "remplace" ? `${qui} : remplacé par un nouveau tirage` : t.confirme_at ? `${qui} a confirmé ${quand(t.confirme_at, "R")}` : `${qui} : à confirmer`;
  });
  const numeros = elus.flatMap((t) => (t.billet === null ? [] : [noBillet(t.billet)]));
  const gain =
    numeros.length !== elus.length || elus.length === 0
      ? `${pluriel(elus.length, "Vous gagnez", "Vous gagnez chacun")} **${c.lot}** au concours « ${c.titre} ».`
      : elus.length === 1
        ? `Le billet ${numeros[0]} gagne **${c.lot}** au concours « ${c.titre} ».`
        : `Les billets ${listeFr(numeros)} gagnent chacun **${c.lot}** au concours « ${c.titre} ».`;
  const images = elus
    .filter((t) => t.issue === "gagnant")
    .flatMap((t): Illustration[] => {
      const url = billetUrl(projectUrl, "gagnant", t.billet);
      return url && t.billet !== null ? [{ url, description: `Le billet gagnant ${noBillet(t.billet)} de la tombola des Gaulois` }] : [];
    })
    .slice(0, 10);
  const attendus = elus.filter((t) => t.issue === "gagnant" && t.confirme_at === null).length;
  const carte: Json[] = [
    ...(images.length > 0 ? [galerie(images)] : []),
    texte(`-# ${premier ? "Concours terminé" : "Nouveau tirage"}`),
    texte(`## Félicitations ${noms} !`),
    texte(gain),
    { type: 14, divider: true, spacing: 1 },
    texte(lignes.join("\n")),
  ];
  if (attendus > 0) carte.push(texte("-# Cliquez sur « Je confirme » : l'encadrement saura que vous êtes là, et vous remettra votre lot."));
  const message: Json = {
    flags: COMPONENTS_V2,
    components: [
      { type: 17, accent_color: COULEURS.termine, components: carte },
      rangee(bouton(customId("confirmer", c.id), "Je confirme", 3, { emoji: "✅", disabled: attendus === 0 })),
    ],
    allowed_mentions: ping ? { parse: [], users: elus.map((t) => t.discord_id).slice(0, 100), replied_user: false } : { parse: [] },
  };
  return message;
}

/* ---------- Les réponses à Discord ---------- */

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
/**
 * Une réponse que seul le joueur voit : une image s'il y en a une (son billet), un texte et, s'il le faut, des boutons.
 * `remplace` : à la place du message privé où le joueur vient de cliquer.
 */
const priveIllustre = (content: string, image: Illustration | null, boutons: Json[], remplace: boolean): Response =>
  json({
    type: remplace ? 7 : 4,
    data: {
      flags: remplace ? COMPONENTS_V2 : EPHEMERAL | COMPONENTS_V2,
      components: [...(image ? [galerie([image])] : []), texte(content), ...(boutons.length ? [rangee(...boutons)] : [])],
      allowed_mentions: { parse: [] },
    },
  });
/** Une réponse que seul le joueur voit : un texte et, s'il le faut, des boutons. */
const prive = (content: string, boutons: Json[] = []): Response => priveIllustre(content, null, boutons, false);
/** La même, à la place du message privé où le joueur vient de cliquer. */
const remplacePrive = (content: string, boutons: Json[] = []): Response => priveIllustre(content, null, boutons, true);
/** Le bouton « Prendre un billet » d'une réponse privée. */
const boutonBillet = (id: number): Json => bouton(customId("participer", id), "Prendre un billet", 1, { emoji: BILLET_EMOJI });
/** Une réponse privée en texte simple (la commande et ses refus). */
const priveTexte = (content: string): Response => json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });
const choixReponse = (choices: { name: string; value: string }[]): Response => json({ type: 8, data: { choices } });

export const CONCOURS_MESSAGES = {
  wrongPlace: "Tapez cette commande dans le serveur Discord du clan.",
  down: "Le robot ne répond pas pour l'instant. Réessayez dans un moment.",
  pasInstalle: "Les concours ne sont pas encore installés : le robot n'a pas son jeton. Prévenez le fondateur.",
  autreJeton: "Le jeton gardé pour le robot n'est pas celui de « Le Gaulois » : ses boutons ne marcheraient pas. Prévenez le fondateur.",
  finFormat: "Je ne comprends pas cette fin. Écrivez une durée, comme « 3 jours », « 12 h » ou « 1 j 6 h », ou une date à l'heure de Paris, comme « 14/11 20:30 ».",
  finTropProche: "La fin doit être dans une minute au moins.",
  finTropLoin: "La fin doit être dans 31 jours au plus.",
  imageInconnue: "Cette image n'est pas dans l'inventaire de la Direction : choisissez-la dans la liste qui s'ouvre pendant que vous tapez.",
  tropDeConcours: "Il y a déjà 20 concours ouverts sur le serveur : attendez la fin de l'un d'eux.",
  tropDeBrouillons: "Vous avez commencé 20 concours dans l'heure : attendez un peu.",
  brouillonPerdu: "Ce formulaire a expiré : relancez /concours lancer.",
  finPassee: "La fin est passée pendant que vous écriviez : relancez /concours lancer avec une fin plus lointaine.",
  inconnu: "Ce concours n'existe plus.",
  annule: "Ce concours est annulé.",
  termine: "Ce concours est fini : le tirage au sort est fait, ou se fait dans la minute.",
  sansRole: (roleId: string, guildId: string): string => `Ce concours est réservé au rôle ${role(roleId, guildId)}.`,
  inscrit: (titre: string, fin: string): string => `🎉 Vous participez au concours « ${titre} ». Tirage au sort ${quand(fin, "R")}.`,
  deja: (titre: string, fin: string): string => `Vous participez déjà au concours « ${titre} ». Tirage au sort ${quand(fin, "R")}.`,
  retire: (titre: string): string => `Vous ne participez plus au concours « ${titre} ».`,
  billetPris: (titre: string, fin: string, n: number): string => `${BILLET_EMOJI} Votre billet : **${noBillet(n)}**, pour le concours « ${titre} ». Tirage au sort ${quand(fin, "R")}.`,
  billetDeja: (titre: string, fin: string, n: number): string => `Vous avez déjà votre billet : **${noBillet(n)}**, pour le concours « ${titre} ». Tirage au sort ${quand(fin, "R")}.`,
  billetRendu: (titre: string, n: number): string => `Votre billet ${noBillet(n)} est rendu : vous ne participez plus au concours « ${titre} ».`,
  pasGagnant: "Ce bouton est pour les gagnants nommés dans ce message.",
  remplace: "Un nouveau tirage vous a remplacé : parlez-en à l'encadrement si c'est une erreur.",
  confirmeSansRole: (roleId: string, guildId: string): string =>
    `Vous n'avez plus le rôle ${role(roleId, guildId)}, qu'il fallait pour ce concours : parlez-en à l'encadrement.`,
  actions: {
    inconnu: "Ce concours n'existe pas, ou plus : choisissez-le dans la liste qui s'ouvre pendant que vous tapez.",
    annule: "Ce concours est annulé.",
    deja_termine: "Ce concours est déjà tiré au sort. Pour changer un gagnant : /concours remplacer.",
    pas_termine: "Le tirage au sort n'est pas encore fait. Pour le faire tout de suite : /concours terminer.",
    tirage_en_cours: "Un tirage au sort est en cours : son résultat arrive dans la minute.",
    trop_ancien: "Ce concours a été tiré au sort il y a plus de 30 jours : la liste de ses billets est effacée.",
    pas_gagnant: "Ce membre n'est pas un gagnant de ce concours.",
    tous_confirmes: "Tous les gagnants ont confirmé. Pour en remplacer un quand même, choisissez-le dans « gagnant ».",
    aucun_gagnant: "Ce concours n'a plus de gagnant à remplacer.",
  } as Record<string, string>,
  terminerOk: "Tirage au sort lancé : le résultat arrive dans le salon du concours dans la minute.",
  annulerOk: "Concours annulé : son message le dira dans la minute.",
  remplacerOk: (n: number): string => `Nouveau tirage lancé pour ${n} ${pluriel(n, "place", "places")} : le résultat arrive dans le salon dans la minute.`,
};

/** Les droits du robot (`app_permissions`) qu'il lui faut dans le salon, et leur nom dans Discord en français. */
const DROITS = {
  administrateur: 1n << 3n,
  voir: 1n << 10n,
  envoyer: 1n << 11n,
  liens: 1n << 14n,
  historique: 1n << 16n,
  mentionnerTout: 1n << 17n,
  envoyerFils: 1n << 38n,
};

/**
 * Ce qui manque au robot dans le salon pour poster le concours et répondre aux gagnants. `null` si Discord n'a pas dit
 * ses droits : il tranchera à l'envoi.
 */
export function droitsManquants(appPermissions: unknown, fil: boolean, mentionnerTout: boolean): string[] | null {
  let bits: bigint;
  try {
    bits = BigInt(typeof appPermissions === "string" && /^[0-9]{1,30}$/.test(appPermissions) ? appPermissions : "x");
  } catch {
    return null;
  }
  if ((bits & DROITS.administrateur) !== 0n) return [];
  const voulus: [bigint, string][] = [
    [DROITS.voir, "Voir le salon"],
    fil ? [DROITS.envoyerFils, "Envoyer des messages dans les fils"] : [DROITS.envoyer, "Envoyer des messages"],
    [DROITS.liens, "Intégrer des liens"],
    [DROITS.historique, "Voir les anciens messages"],
  ];
  if (mentionnerTout) voulus.push([DROITS.mentionnerTout, "Mentionner @everyone, @here et tous les rôles"]);
  return voulus.filter(([bit]) => (bits & bit) === 0n).map(([, nom]) => nom);
}

/* ---------- Les commandes : /concours ---------- */

interface Joueur {
  id: string;
  roles: string[];
}

/** Qui clique ou tape la commande, d'après ce que Discord a signé : jamais un robot. */
function joueurDe(interaction: Json): Joueur | null {
  const member = record(interaction["member"]);
  const user = record(member?.["user"]);
  const id = user?.["id"];
  if (!member || !user || user["bot"] === true || !isId(id)) return null;
  return { id, roles: Array.isArray(member["roles"]) ? member["roles"].filter(isId) : [] };
}

interface SousCommande {
  name: string;
  options: Json[];
}

function sousCommande(data: Json): SousCommande | null {
  const options = data["options"];
  const sub = Array.isArray(options) ? record(options[0]) : null;
  const name = sub?.["name"];
  if (!sub || sub["type"] !== 1 || typeof name !== "string") return null;
  const subOptions = sub["options"];
  return { name, options: Array.isArray(subOptions) ? subOptions.map(record).filter((o): o is Json => o !== null) : [] };
}

const option = (options: Json[], name: string): Json | undefined => options.find((o) => o["name"] === name);
const optionTexte = (options: Json[], name: string): string | null => {
  const value = option(options, name)?.["value"];
  return typeof value === "string" ? value : null;
};

/** L'adresse publique d'une image de l'inventaire. */
const imageUrl = (projectUrl: string, path: string): string => `${projectUrl.replace(/\/+$/, "")}${IMAGES_PATH}${encodeURIComponent(path)}`;
const IMAGE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/;

async function imagesInventaire(deps: ConcoursDeps, filtre: string | null, path: string | null): Promise<{ name: string; path: string }[] | null> {
  const res = await deps.rpc("concours_images", { p_filtre: filtre, p_path: path });
  if (!res || res["ok"] !== true || !Array.isArray(res["images"])) return null;
  return res["images"].flatMap((item) => {
    const image = record(item);
    const name = image?.["name"];
    const p = image?.["path"];
    return typeof name === "string" && typeof p === "string" && IMAGE_PATH.test(p) ? [{ name, path: p }] : [];
  });
}

/** L'état d'un concours dans la liste de la saisie : « fin le … », « tiré le … » ou « annulé ». */
function etatCourt(item: Json): string {
  const statut = item["statut"];
  const fin = Date.parse(String(item["fin"]));
  const tire = Date.parse(String(item["tire_at"]));
  if (statut === "ouvert") return Number.isFinite(fin) ? `fin le ${formatParis(fin)}` : "ouvert";
  if (statut === "termine") return Number.isFinite(tire) ? `tiré le ${formatParis(tire)}` : "tiré au sort";
  return "annulé";
}

/** Les concours proposés pendant la saisie : les ouverts pour terminer ou annuler, les tirés pour remplacer un gagnant. */
async function concoursChoices(deps: ConcoursDeps, sub: string, typed: string): Promise<{ name: string; value: string }[]> {
  const res = await deps.rpc("concours_liste", { p_guild: deps.guildId, p_filtre: typed.trim().slice(0, 100) || null });
  if (!res || res["ok"] !== true || !Array.isArray(res["concours"])) return [];
  const voulu = sub === CONCOURS_SUB.remplacer ? "termine" : "ouvert";
  return res["concours"]
    .map(record)
    .filter((item): item is Json => item !== null && item["statut"] === voulu && typeof item["titre"] === "string" && typeof item["id"] === "number")
    .slice(0, 25)
    .map((item) => {
      // Un concours que le robot n'arrive plus à mener : l'encadrement le voit ici, avec la raison.
      const panne = typeof item["erreur"] === "string" && item["erreur"] !== "" ? ` — en panne : ${item["erreur"]}` : "";
      return { name: choix100(`${String(item["titre"])} — ${etatCourt(item)}${panne}`), value: String(item["id"]) };
    });
}

/** /concours pendant la saisie (type 4) : la fin lue, les images de l'inventaire, les concours. */
async function concoursSaisie(deps: ConcoursDeps, sub: SousCommande): Promise<Response> {
  const focused = sub.options.find((o) => o["focused"] === true);
  const typed = typeof focused?.["value"] === "string" ? focused["value"] : "";
  const name = focused?.["name"];
  if (sub.name === CONCOURS_SUB.lancer && name === CONCOURS_OPT.fin) return choixReponse(finChoices(typed, deps.nowSeconds() * 1000));
  if (sub.name === CONCOURS_SUB.lancer && name === CONCOURS_OPT.image) {
    const images = await imagesInventaire(deps, typed.trim().slice(0, 60) || null, null);
    return choixReponse((images ?? []).map((image) => ({ name: choix100(image.name), value: image.path })));
  }
  if (name === CONCOURS_OPT.concours) return choixReponse(await concoursChoices(deps, sub.name, typed));
  return choixReponse([]);
}

/** Le formulaire du titre et du texte, ouvert par /concours lancer. */
function formulaire(id: number, lot: string): Response {
  return json({
    type: 9,
    data: {
      custom_id: customId("texte", id),
      title: "Lancer un concours",
      components: [
        {
          type: 18,
          label: "Titre",
          description: "En grand, en tête du message",
          component: { type: 4, custom_id: CHAMP_TITRE, style: 1, min_length: 1, max_length: 100, required: true, value: lot.slice(0, 100) },
        },
        {
          type: 18,
          label: "Texte",
          description: "Facultatif : un merci, les règles… Une ligne par point.",
          component: { type: 4, custom_id: CHAMP_TEXTE, style: 2, max_length: 1500, required: false, placeholder: "Par exemple : un merci, les règles du concours" },
        },
      ],
    },
  });
}

/** /concours lancer : tout ce qui se vérifie avant le formulaire, puis le brouillon et le formulaire. */
async function lancer(interaction: Json, data: Json, sub: SousCommande, joueur: Joueur, deps: ConcoursDeps): Promise<Response> {
  if (deps.botId === "") return priveTexte(CONCOURS_MESSAGES.pasInstalle);
  // Les boutons d'un message vont à l'application qui l'a posté : un jeton d'un autre robot les enverrait ailleurs.
  if (deps.botId !== interaction["application_id"]) return priveTexte(CONCOURS_MESSAGES.autreJeton);
  const salon = interaction["channel_id"];
  if (!isId(salon)) return priveTexte(CONCOURS_MESSAGES.wrongPlace);
  const lot = (optionTexte(sub.options, CONCOURS_OPT.lot) ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (lot === "") return priveTexte("Écrivez ce qui est à gagner.");
  const fin = parseFin(optionTexte(sub.options, CONCOURS_OPT.fin) ?? "", deps.nowSeconds() * 1000);
  if (!fin.ok) return priveTexte(fin.error === "trop_proche" ? CONCOURS_MESSAGES.finTropProche : fin.error === "trop_loin" ? CONCOURS_MESSAGES.finTropLoin : CONCOURS_MESSAGES.finFormat);
  const gagnantsOpt = option(sub.options, CONCOURS_OPT.gagnants)?.["value"];
  const gagnants = typeof gagnantsOpt === "number" && Number.isInteger(gagnantsOpt) && gagnantsOpt >= 1 && gagnantsOpt <= 20 ? gagnantsOpt : 1;
  // Le rôle « @everyone » porte le numéro du serveur et n'est dans la liste de personne : le demander, c'est ouvrir à tous.
  const roleOpt = optionTexte(sub.options, CONCOURS_OPT.participants);
  const roleId = isId(roleOpt) && roleOpt !== deps.guildId ? roleOpt : null;
  const notifierOpt = optionTexte(sub.options, CONCOURS_OPT.notifier);
  const notifierId = isId(notifierOpt) ? notifierOpt : null;

  // Prévenir un rôle que personne ne peut mentionner, ou tout le serveur, demande un droit de plus au robot.
  const resolved = record(record(data["resolved"])?.["roles"]);
  const notifie = notifierId ? record(resolved?.[notifierId]) : null;
  const mentionnerTout = notifierId !== null && (notifierId === deps.guildId || notifie?.["mentionable"] !== true);
  const channelType = record(interaction["channel"])?.["type"];
  const fil = channelType === 10 || channelType === 11 || channelType === 12;
  const manquent = droitsManquants(interaction["app_permissions"], fil, mentionnerTout);
  if (manquent && manquent.length > 0) {
    return priveTexte(
      `Il manque au robot « Le Gaulois », dans ce salon : ${listeFr(manquent.map((nom) => `« ${nom} »`))}. ` +
        "Paramètres du salon, Permissions, ajoutez « Le Gaulois », cochez ces droits, puis relancez la commande." +
        (mentionnerTout && manquent.includes("Mentionner @everyone, @here et tous les rôles") ? " Ou rendez le rôle à prévenir mentionnable par tous." : ""),
    );
  }

  let image: { url: string; alt: string } | null = null;
  const imageOpt = (optionTexte(sub.options, CONCOURS_OPT.image) ?? "").trim();
  if (imageOpt !== "") {
    if (!deps.projectUrl) return priveTexte(CONCOURS_MESSAGES.imageInconnue);
    const trouvees = IMAGE_PATH.test(imageOpt) ? await imagesInventaire(deps, null, imageOpt) : await imagesInventaire(deps, imageOpt.slice(0, 60), null);
    if (trouvees === null) return priveTexte(CONCOURS_MESSAGES.down);
    const exacte = trouvees.filter((i) => i.path === imageOpt || i.name.toLowerCase() === imageOpt.toLowerCase());
    const [trouvee, autre] = exacte;
    if (!trouvee || autre) return priveTexte(CONCOURS_MESSAGES.imageInconnue);
    image = { url: imageUrl(deps.projectUrl, trouvee.path), alt: trouvee.name };
  }

  const res = await deps.rpc("concours_brouillon", {
    p_guild: deps.guildId,
    p_salon: salon,
    p_createur: joueur.id,
    p_lot: lot,
    p_fin: new Date(fin.at).toISOString(),
    p_gagnants: gagnants,
    p_role: roleId,
    p_notifier: notifierId,
    p_image_url: image?.url ?? null,
    p_image_alt: image?.alt ?? null,
    p_reveil: deps.projectUrl ? `${deps.projectUrl.replace(/\/+$/, "")}${REVEIL_PATH}` : null,
  });
  if (!res) return priveTexte(CONCOURS_MESSAGES.down);
  const id = res["id"];
  if (res["ok"] !== true || typeof id !== "number") {
    const error = res["error"];
    deps.log(`concours refusé : ${String(error)}`);
    if (error === "fin_trop_proche") return priveTexte(CONCOURS_MESSAGES.finTropProche);
    if (error === "fin_trop_loin") return priveTexte(CONCOURS_MESSAGES.finTropLoin);
    if (error === "trop_de_concours") return priveTexte(CONCOURS_MESSAGES.tropDeConcours);
    if (error === "trop_de_brouillons") return priveTexte(CONCOURS_MESSAGES.tropDeBrouillons);
    return priveTexte(CONCOURS_MESSAGES.down);
  }
  return formulaire(id, lot);
}

/** /concours terminer, annuler ou remplacer : le serveur décide, le robot fait aussitôt le travail en tâche de fond. */
async function agir(sub: SousCommande, joueur: Joueur, deps: ConcoursDeps): Promise<Response> {
  const id = Number(optionTexte(sub.options, CONCOURS_OPT.concours));
  if (!Number.isSafeInteger(id) || id <= 0) return priveTexte(CONCOURS_MESSAGES.actions["inconnu"] ?? "");
  const gagnant = optionTexte(sub.options, CONCOURS_OPT.gagnant);
  const res = await deps.rpc("concours_action", {
    p_guild: deps.guildId,
    p_id: id,
    p_action: sub.name,
    p_par: joueur.id,
    p_gagnant: sub.name === CONCOURS_SUB.remplacer && isId(gagnant) ? gagnant : null,
  });
  if (!res) return priveTexte(CONCOURS_MESSAGES.down);
  if (res["ok"] !== true) return priveTexte(CONCOURS_MESSAGES.actions[String(res["error"])] ?? CONCOURS_MESSAGES.down);
  deps.background(travailler(deps, id));
  if (sub.name === CONCOURS_SUB.terminer) return priveTexte(CONCOURS_MESSAGES.terminerOk);
  if (sub.name === CONCOURS_SUB.annuler) return priveTexte(CONCOURS_MESSAGES.annulerOk);
  return priveTexte(CONCOURS_MESSAGES.remplacerOk(typeof res["nombre"] === "number" ? res["nombre"] : 1));
}

/** /concours : la saisie (type 4) et la commande envoyée (type 2). Discord ne la propose qu'à l'encadrement. */
export async function concoursCommand(interaction: Json, deps: ConcoursDeps): Promise<Response> {
  const data = record(interaction["data"]) ?? {};
  const saisie = interaction["type"] === 4;
  const sub = sousCommande(data);
  if (deps.guildId === "" || interaction["guild_id"] !== deps.guildId || !sub) return saisie ? choixReponse([]) : priveTexte(CONCOURS_MESSAGES.wrongPlace);
  if (saisie) return concoursSaisie(deps, sub);
  const joueur = joueurDe(interaction);
  if (!joueur) return priveTexte(CONCOURS_MESSAGES.wrongPlace);
  if (sub.name === CONCOURS_SUB.lancer) return lancer(interaction, data, sub, joueur, deps);
  if (sub.name === CONCOURS_SUB.terminer || sub.name === CONCOURS_SUB.annuler || sub.name === CONCOURS_SUB.remplacer) return agir(sub, joueur, deps);
  return priveTexte(CONCOURS_MESSAGES.wrongPlace);
}

/* ---------- Les boutons et le formulaire ---------- */

/** Les valeurs du formulaire, quelle que soit leur enveloppe (Label, ou l'ancienne rangée). */
export function valeursFormulaire(data: Json): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (value: unknown, depth: number): void => {
    if (depth > 4) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const item = record(value);
    if (!item) return;
    const id = item["custom_id"];
    const v = item["value"];
    if (typeof id === "string" && typeof v === "string") out.set(id, v);
    walk(item["components"], depth + 1);
    walk(item["component"], depth + 1);
  };
  walk(data["components"], 0);
  return out;
}

/** Le lien d'un message, pour l'encadrement. */
export const lienMessage = (guildId: string, salonId: string, messageId: string): string => `https://discord.com/channels/${guildId}/${salonId}/${messageId}`;

/**
 * Un message que Discord ne poste qu'une fois : avec le même `nonce` (25 signes au plus), exigé, un second envoi dans les
 * minutes qui suivent rend le message déjà posté, sans en poster un autre.
 */
export const nonce = (cle: string): Json => (cle.length <= 25 ? { nonce: cle, enforce_nonce: true } : {});

/** Une réponse de Discord, en quelques mots pour le journal et pour l'encadrement : ni jeton, ni identifiant de joueur. */
export function expliquer(reply: DiscordReply | null): string {
  if (!reply) return "Discord ne répond pas";
  const code = record(reply.body)?.["code"];
  return `Discord ${reply.status}${typeof code === "number" ? ` (code ${code})` : ""}`;
}

/** Ce que l'encadrement lit quand le message du concours n'a pas pu partir. */
function refusLancement(reply: DiscordReply | null): string {
  const code = record(reply?.body)?.["code"];
  if (!reply) return "Discord ne répond pas pour l'instant : le concours n'est pas parti. Relancez /concours lancer dans un moment.";
  if (reply.status === 401) return "Discord refuse le jeton du robot : le concours n'est pas parti. Prévenez le fondateur.";
  if (reply.status === 403 || code === 50001 || code === 50013) {
    return "Le robot « Le Gaulois » n'a pas le droit d'écrire ici : le concours n'est pas parti. Il lui faut, dans ce salon, « Voir le salon », « Envoyer des messages », « Intégrer des liens » et « Voir les anciens messages ».";
  }
  return `Discord a refusé le message (${expliquer(reply)}) : le concours n'est pas parti. Prévenez le fondateur.`;
}

/**
 * Le formulaire envoyé : le serveur garde le titre et le texte, le robot poste le message du concours, puis le concours
 * s'ouvre. Fait en tâche de fond : Discord a déjà reçu « réfléchit… », que le robot remplace par le résultat.
 */
async function publier(interaction: Json, id: number, joueur: Joueur, valeurs: Map<string, string>, deps: ConcoursDeps): Promise<void> {
  const appId = interaction["application_id"];
  const token = interaction["token"];
  const repondre = async (content: string): Promise<void> => {
    if (!isId(appId) || typeof token !== "string" || !/^[A-Za-z0-9._-]{20,500}$/.test(token)) return;
    await deps.webhook("PATCH", `/webhooks/${appId}/${token}/messages/@original`, { body: { content, allowed_mentions: { parse: [] } } });
  };
  const res = await deps.rpc("concours_texte", {
    p_id: id,
    p_createur: joueur.id,
    p_titre: valeurs.get(CHAMP_TITRE) ?? "",
    p_texte: valeurs.get(CHAMP_TEXTE) ?? null,
  });
  if (!res) return repondre(CONCOURS_MESSAGES.down);
  const vue = parseVue(res["concours"]);
  if (res["ok"] !== true || !vue) {
    const error = res["error"];
    return repondre(error === "fin_passee" ? CONCOURS_MESSAGES.finPassee : error === "brouillon_perdu" ? CONCOURS_MESSAGES.brouillonPerdu : "Le titre ou le texte n'a pas la forme attendue : relancez /concours lancer.");
  }
  // Le même `nonce`, exigé : si la réponse de Discord se perd et que l'envoi repart, Discord rend le message déjà posté au
  // lieu d'en poster un second, avec un second ping.
  const message = { ...concoursMessage(vue, true), ...nonce(`l${vue.id}`) };
  let posted = await deps.discord("POST", `/channels/${vue.salon_id}/messages`, { body: message });
  if (!posted) posted = await deps.discord("POST", `/channels/${vue.salon_id}/messages`, { body: message });
  const messageId = record(posted?.body)?.["id"];
  if (!posted || posted.status !== 200 || !isId(messageId)) {
    deps.log(`concours ${id} : message non posté, ${expliquer(posted)}`);
    return repondre(refusLancement(posted));
  }
  const ouvert = await deps.rpc("concours_lance", { p_id: id, p_message_id: messageId });
  if (ouvert?.["ok"] !== true) {
    // Le message est parti mais le serveur ne l'a pas noté : il ne prendrait aucun participant. Il est retiré.
    await deps.discord("DELETE", `/channels/${vue.salon_id}/messages/${messageId}`);
    deps.log(`concours ${id} : non ouvert après l'envoi, message retiré`);
    return repondre("Le serveur n'a pas pu ouvrir le concours : son message est retiré. Relancez /concours lancer dans un moment.");
  }
  await repondre(`Concours lancé : ${lienMessage(vue.guild_id, vue.salon_id, messageId)}. Tirage au sort ${quand(vue.fin, "F")}, ${quand(vue.fin, "R")}.`);
}

/** Après un clic qui change le nombre de participants : le message du concours le montre aussitôt. */
async function majCompte(deps: ConcoursDeps, vue: Vue): Promise<void> {
  if (!vue.message_id) return;
  const reply = await deps.discord("PATCH", `/channels/${vue.salon_id}/messages/${vue.message_id}`, { body: concoursMessage(vue) });
  const perdu = reply?.status === 404;
  if (reply?.status === 200 || perdu) await deps.rpc("concours_affiche", { p_id: vue.id, p_compte: vue.compte, p_perdu: perdu });
}

/**
 * « Prendre un billet » : sur le message du concours, une réponse privée ; dans une réponse privée, à sa place. Le joueur y
 * voit son billet, en image, avec son numéro ; s'il en avait déjà un, le même. Sans numéro (migration 20261113000100 pas
 * encore installée), la réponse d'avant.
 */
async function participer(id: number, joueur: Joueur, depuisPrive: boolean, deps: ConcoursDeps): Promise<Response> {
  const dire = depuisPrive ? remplacePrive : prive;
  const res = await deps.rpc("concours_participer", { p_id: id, p_discord_id: joueur.id, p_roles: joueur.roles });
  if (!res) return dire(CONCOURS_MESSAGES.down);
  if (res["ok"] !== true) return dire(refusParticipation(res, deps.guildId));
  const vue = res["maj"] === true ? parseVue(res["concours"]) : null;
  if (vue) deps.background(majCompte(deps, vue));
  const titre = String(res["titre"] ?? "");
  const fin = String(res["fin"] ?? "");
  const inscrit = res["etat"] === "inscrit";
  const billet = billetOuNull(res["billet"]);
  const retirer = [bouton(customId("quitter", id), "Me retirer", 2)];
  if (billet === null) return dire(inscrit ? CONCOURS_MESSAGES.inscrit(titre, fin) : CONCOURS_MESSAGES.deja(titre, fin), retirer);
  const url = billetUrl(deps.projectUrl, "billet", billet);
  const image = url ? { url, description: `Votre billet ${noBillet(billet)} de la tombola des Gaulois` } : null;
  return priveIllustre(inscrit ? CONCOURS_MESSAGES.billetPris(titre, fin, billet) : CONCOURS_MESSAGES.billetDeja(titre, fin, billet), image, retirer, depuisPrive);
}

function refusParticipation(res: Json, guildId: string): string {
  const error = res["error"];
  const roleId = res["role_id"];
  if (error === "sans_role" && isId(roleId)) return CONCOURS_MESSAGES.sansRole(roleId, guildId);
  if (error === "annule") return CONCOURS_MESSAGES.annule;
  if (error === "termine") return CONCOURS_MESSAGES.termine;
  return CONCOURS_MESSAGES.inconnu;
}

/** « Me retirer », dans la réponse privée : elle devient « Votre billet est rendu », avec « Prendre un billet ». */
async function quitter(id: number, joueur: Joueur, deps: ConcoursDeps): Promise<Response> {
  const res = await deps.rpc("concours_quitter", { p_id: id, p_discord_id: joueur.id });
  if (!res) return remplacePrive(CONCOURS_MESSAGES.down);
  if (res["ok"] !== true) return remplacePrive(refusParticipation(res, deps.guildId));
  const vue = res["maj"] === true ? parseVue(res["concours"]) : null;
  if (vue) deps.background(majCompte(deps, vue));
  const titre = String(res["titre"] ?? "");
  const billet = res["etat"] === "retire" ? billetOuNull(res["billet"]) : null;
  return remplacePrive(billet === null ? CONCOURS_MESSAGES.retire(titre) : CONCOURS_MESSAGES.billetRendu(titre, billet), [boutonBillet(id)]);
}

/** Un billet de la liste : son numéro et son participant, ou le participant seul si le serveur ne donne pas les numéros. */
interface Entree {
  id: string;
  billet: number | null;
}
const entrees = (value: unknown): Entree[] | null =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const e = record(item);
        return e && isId(e["id"]) ? [{ id: e["id"], billet: billetOuNull(e["billet"]) }] : [];
      })
    : null;

/** Le nombre de billets : leur liste, dans l'ordre des numéros, que seul le joueur voit, et son billet s'il en a un. */
async function liste(id: number, joueur: Joueur, deps: ConcoursDeps): Promise<Response> {
  const res = await deps.rpc("concours_participants", { p_id: id, p_discord_id: joueur.id });
  if (!res) return prive(CONCOURS_MESSAGES.down);
  if (res["ok"] !== true) return prive(refusParticipation(res, deps.guildId));
  // Avant la migration 20261113000100, le serveur ne donne que les participants : la liste se fait sans numéros.
  const billets = entrees(res["billets"]) ?? (Array.isArray(res["ids"]) ? res["ids"].filter(isId).map((i) => ({ id: i, billet: null })) : []);
  const gagnes = entrees(res["gagnes"]) ?? (Array.isArray(res["gagnants"]) ? res["gagnants"].filter(isId).map((i) => ({ id: i, billet: null })) : []);
  const monBillet = billetOuNull(res["billet"]);
  const compte = typeof res["compte"] === "number" ? res["compte"] : billets.length;
  const ouvert = res["ouvert"] === true;
  const titre = String(res["titre"] ?? "");
  const fige = typeof res["compte_tirage"] === "number" ? res["compte_tirage"] : null;
  const tirage = res["statut"] === "termine" ? fige : null;
  const debut = [
    res["statut"] === "annule"
      ? `### Concours « ${titre} » annulé${fige === null ? "" : `, avec ${billetsLabel(fige)}`}`
      : tirage === null
        ? `### ${billetsLabel(compte)} au concours « ${titre} »`
        : `### Tirage au sort du concours « ${titre} », parmi ${billetsLabel(tirage)}`,
  ];
  if (gagnes.length > 0) {
    const libelle = gagnes.every((g) => g.billet !== null) ? pluriel(gagnes.length, "Billet gagnant", "Billets gagnants") : pluriel(gagnes.length, "Gagnant", "Gagnants");
    debut.push(`**${libelle} :** ${gagnes.map((g) => avecBillet(g.id, g.billet)).join(" ; ")}`);
  }
  const fin: string[] = [];
  if (billets.length === 0 && tirage !== null && tirage > 0) fin.push("-# La liste des billets est effacée 30 jours après le tirage.");
  if (ouvert) fin.push(monBillet !== null ? `Votre billet : ${noBillet(monBillet)}.` : res["inscrit"] === true ? "Vous participez." : "Vous n'avez pas de billet.");
  // Discord refuse un message de plus de 4 000 signes : autant de billets que la place le permet, puis le nombre des autres.
  const place = LISTE_SIGNES - [...debut, ...fin].join("\n").length - 40;
  const noms: string[] = [];
  let longueur = 0;
  for (const e of billets) {
    const nom = e.billet === null ? membre(e.id) : `${noBillet(e.billet)} ${membre(e.id)}`;
    if (longueur + nom.length + 2 > place) break;
    noms.push(nom);
    longueur += nom.length + 2;
  }
  const lignes = [...debut];
  const autres = compte - noms.length;
  if (noms.length > 0) lignes.push(noms.join(", ") + (autres > 0 ? ` et ${autres} ${pluriel(autres, "autre", "autres")}` : ""));
  lignes.push(...fin);
  const boutons = ouvert ? [res["inscrit"] === true ? bouton(customId("quitter", id), "Me retirer", 2) : boutonBillet(id)] : [];
  return prive(lignes.join("\n"), boutons);
}

/** « Je confirme », sous l'annonce : seul un gagnant qu'elle nomme ; l'annonce se met à jour pour tous. */
async function confirmer(id: number, interaction: Json, joueur: Joueur, deps: ConcoursDeps): Promise<Response> {
  const annonceId = record(interaction["message"])?.["id"];
  if (!isId(annonceId)) return prive(CONCOURS_MESSAGES.pasGagnant);
  const res = await deps.rpc("concours_confirmer", { p_id: id, p_annonce_id: annonceId, p_discord_id: joueur.id, p_roles: joueur.roles });
  if (!res) return prive(CONCOURS_MESSAGES.down);
  const vue = parseVue(res["concours"]);
  if (res["ok"] !== true || !vue) {
    const error = res["error"];
    const roleId = res["role_id"];
    if (error === "sans_role" && isId(roleId)) return prive(CONCOURS_MESSAGES.confirmeSansRole(roleId, deps.guildId));
    if (error === "remplace") return prive(CONCOURS_MESSAGES.remplace);
    if (error === "pas_gagnant") return prive(CONCOURS_MESSAGES.pasGagnant);
    return prive(CONCOURS_MESSAGES.inconnu);
  }
  // Le message principal dit aussi qui a confirmé : il se met à jour aussitôt, et le réveil suivant le refait si besoin.
  const elus = vue.tires.filter((t) => t.annonce_id === annonceId).sort((a, b) => a.rang - b.rang);
  deps.background(majFinale(deps, vue));
  return json({ type: 7, data: annonceMessage(vue, elus, false, deps.projectUrl) });
}

/** Le message du concours, remis à jour après une confirmation (« a confirmé » à côté du gagnant). */
async function majFinale(deps: ConcoursDeps, vue: Vue): Promise<void> {
  if (!vue.message_id || vue.message_perdu || vue.statut !== "termine") return;
  await deps.discord("PATCH", `/channels/${vue.salon_id}/messages/${vue.message_id}`, { body: concoursMessage(vue) });
}

/** Un clic sur un bouton des concours (type 3), ou le formulaire envoyé (type 5). */
export async function concoursInteraction(interaction: Json, deps: ConcoursDeps): Promise<Response> {
  const data = record(interaction["data"]) ?? {};
  const custom = typeof data["custom_id"] === "string" ? data["custom_id"] : "";
  const match = /^concours:(participer|quitter|liste|confirmer|texte):([0-9]{1,15})$/.exec(custom);
  if (deps.guildId === "" || interaction["guild_id"] !== deps.guildId) return prive(CONCOURS_MESSAGES.wrongPlace);
  const joueur = joueurDe(interaction);
  if (!match || !joueur) return prive(CONCOURS_MESSAGES.inconnu);
  const action = match[1];
  const id = Number(match[2]);
  if (interaction["type"] === 5) {
    if (action !== "texte") return prive(CONCOURS_MESSAGES.inconnu);
    deps.background(publier(interaction, id, joueur, valeursFormulaire(data), deps));
    return json({ type: 5, data: { flags: EPHEMERAL } });
  }
  if (interaction["type"] !== 3) return prive(CONCOURS_MESSAGES.inconnu);
  const flags = record(interaction["message"])?.["flags"];
  const depuisPrive = typeof flags === "number" && (flags & EPHEMERAL) !== 0;
  switch (action) {
    case "participer":
      return participer(id, joueur, depuisPrive, deps);
    case "quitter":
      return quitter(id, joueur, deps);
    case "liste":
      return liste(id, joueur, deps);
    case "confirmer":
      return confirmer(id, interaction, joueur, deps);
    default:
      return prive(CONCOURS_MESSAGES.inconnu);
  }
}

/* ---------- Le travail du robot, à chaque réveil ---------- */

interface Fait {
  compte?: number | null;
  final?: boolean;
  annonceId?: string | null;
  annonces?: string[] | null;
  perdu?: boolean;
  salonPerdu?: boolean;
  erreur?: string | null;
}

/**
 * Le compte rendu du robot au serveur, sous sa prise (`jeton`) et pour le rendu qu'il a montré : si la prise a expiré et
 * qu'un autre réveil l'a reprise, ou si le concours a changé pendant la modification, le serveur n'en tient pas compte.
 */
const fait = (deps: ConcoursDeps, c: Vue, f: Fait): Promise<Record<string, unknown> | null> =>
  deps.rpc("concours_fait", {
    p_id: c.id,
    p_jeton: c.jeton,
    p_rendu: c.rendu,
    p_compte: f.compte ?? null,
    p_final: f.final ?? false,
    p_annonce_id: f.annonceId ?? null,
    p_annonces: f.annonces ?? null,
    p_perdu: f.perdu ?? false,
    p_salon_perdu: f.salonPerdu ?? false,
    p_erreur: f.erreur ?? null,
  });

/** Discord dit-il que le salon n'existe plus (« Unknown Channel ») ? */
const salonDisparu = (reply: DiscordReply | null): boolean => reply?.status === 404 && record(reply.body)?.["code"] === 10003;
/** Une panne passagère de Discord : pas de réponse, une erreur de son côté, ou « trop de demandes ». */
const passagere = (reply: DiscordReply | null): boolean => !reply || reply.status >= 500 || reply.status === 429;

type Edition = "ok" | "perdu" | "salon" | { erreur: string };

/** Le message du concours, remis à l'état du serveur. « perdu » : il a été retiré de Discord ; « salon » : le salon aussi. */
async function editer(deps: ConcoursDeps, c: Vue): Promise<Edition> {
  if (!c.message_id || c.message_perdu) return "perdu";
  const reply = await deps.discord("PATCH", `/channels/${c.salon_id}/messages/${c.message_id}`, { body: concoursMessage(c) });
  if (reply?.status === 200) return "ok";
  if (salonDisparu(reply)) return "salon";
  if (reply?.status === 404) return "perdu";
  return { erreur: `modification du message : ${expliquer(reply)}` };
}

interface Choix {
  elus: string[];
  passes: { id: string; raison: "parti" | "sans_role" }[];
  epuise: boolean;
  /** La vérification s'est arrêtée là : ce qui précède est choisi, la suite attend le réveil suivant. */
  erreur: string | null;
}

/**
 * Les gagnants, pris dans l'ordre du tirage, sans sauter personne : chacun est revu sur Discord, et passé s'il a quitté le
 * serveur (« Unknown Member ») ou perdu le rôle demandé. Au premier doute, le choix s'arrête là, et ce qui a déjà été vu
 * est gardé. Une panne passagère de Discord qui dure (dix essais ratés, et le tirage fait depuis plus d'une heure) laisse
 * suffire le rôle vérifié à l'inscription ; un refus de Discord (jeton, droits), jamais. Dix vérifications par prise au plus.
 */
async function choisir(deps: ConcoursDeps, c: Vue): Promise<Choix> {
  const deja = new Set(c.tires.map((t) => t.discord_id));
  const choix: Choix = { elus: [], passes: [], epuise: false, erreur: null };
  const patience = c.essais >= 10 && deps.nowSeconds() * 1000 - Date.parse(c.tirage_at ?? c.tire_at ?? "") > 3_600_000;
  let verifs = 0;
  for (const id of c.ordre ?? []) {
    if (choix.elus.length >= c.a_tirer) return choix;
    if (deja.has(id)) continue;
    if (verifs >= VERIFS_MAX) return choix;
    verifs++;
    const reply = await deps.discord("GET", `/guilds/${c.guild_id}/members/${id}`, { timeoutMs: 3000 });
    const roles = record(reply?.body)?.["roles"];
    if (reply?.status === 200) {
      if (c.role_id && !(Array.isArray(roles) && roles.includes(c.role_id))) choix.passes.push({ id, raison: "sans_role" });
      else choix.elus.push(id);
    } else if (reply?.status === 404 && record(reply.body)?.["code"] === 10007) {
      // « Unknown Member » : il a quitté le serveur. Un autre 404 (le robot hors du serveur) n'est pas une réponse.
      choix.passes.push({ id, raison: "parti" });
    } else if (passagere(reply) && patience) {
      choix.elus.push(id);
    } else {
      choix.erreur = `vérification d'un participant : ${expliquer(reply)}`;
      return choix;
    }
  }
  choix.epuise = choix.elus.length < c.a_tirer;
  return choix;
}

/** Les annonces d'un gagnant remplacé : elles le disent, et leur bouton s'éteint quand plus personne n'y attend. */
async function majAnnonces(deps: ConcoursDeps, c: Vue): Promise<void> {
  const anciennes = new Set(c.tires.filter((t) => t.issue === "remplace" && t.annonce_id).map((t) => t.annonce_id as string));
  for (const annonceId of anciennes) {
    const elus = c.tires.filter((t) => t.annonce_id === annonceId).sort((a, b) => a.rang - b.rang);
    await deps.discord("PATCH", `/channels/${c.salon_id}/messages/${annonceId}`, { body: annonceMessage(c, elus, false, deps.projectUrl) });
  }
}

/** Un concours qui a besoin du robot : le nombre de participants, le choix des gagnants, l'annonce, l'état final. */
async function traiter(deps: ConcoursDeps, c: Vue): Promise<void> {
  if (c.statut === "ouvert") {
    const edition = await editer(deps, c);
    if (edition === "ok") await fait(deps, c, { compte: c.compte });
    else if (edition === "perdu" || edition === "salon") await fait(deps, c, { perdu: true, salonPerdu: edition === "salon" });
    else await fait(deps, c, { erreur: edition.erreur });
    return;
  }
  if (c.statut === "annule") {
    const edition = await editer(deps, c);
    if (typeof edition === "object") await fait(deps, c, { erreur: edition.erreur });
    else await fait(deps, c, { final: true, perdu: edition !== "ok", salonPerdu: edition === "salon" });
    return;
  }
  if (c.statut !== "termine") return;
  let vue = c;
  if (vue.a_tirer > 0) {
    const choix = await choisir(deps, vue);
    if (choix.elus.length > 0 || choix.passes.length > 0 || choix.epuise) {
      const res = await deps.rpc("concours_choix", {
        p_id: vue.id,
        p_jeton: vue.jeton,
        p_tirage: vue.tirage,
        p_elus: choix.elus,
        p_passes: choix.passes,
        p_epuise: choix.epuise,
      });
      const apres = parseVue(res?.["concours"]);
      if (!res || res["ok"] !== true || !apres) {
        await fait(deps, vue, { erreur: `choix des gagnants refusé : ${String(res?.["error"] ?? "base injoignable")}` });
        return;
      }
      vue = apres;
    }
    if (choix.erreur !== null) {
      await fait(deps, vue, { erreur: choix.erreur });
      return;
    }
    // Il reste des gagnants à choisir (plus de dix vérifications) : la suite à la prise suivante, avant toute annonce.
    if (vue.a_tirer > 0) {
      await fait(deps, vue, {});
      return;
    }
  }
  let final = vue.final_affiche;
  let perdu = false;
  if (!final) {
    const edition = await editer(deps, vue);
    if (edition === "salon") {
      await fait(deps, vue, { final: true, perdu: true, salonPerdu: true });
      return;
    }
    if (typeof edition === "object") {
      await fait(deps, vue, { erreur: edition.erreur });
      return;
    }
    final = true;
    perdu = edition === "perdu";
    if (vue.nb_remplaces > 0) await majAnnonces(deps, vue);
  }
  const nouveaux = vue.tires.filter((t) => t.issue === "gagnant" && t.annonce_id === null).sort((a, b) => a.rang - b.rang);
  if (nouveaux.length === 0) {
    await fait(deps, vue, { final, perdu });
    return;
  }
  // Le même `nonce` pour une même annonce : si elle repart (réponse perdue, prise reprise par un autre réveil), Discord
  // rend celle qui est déjà postée, sans prévenir les gagnants une seconde fois.
  const annonce = { ...annonceMessage(vue, nouveaux, true, deps.projectUrl), ...nonce(`a${vue.id}t${vue.tirage}`) };
  const reponseA = vue.message_id && !vue.message_perdu && !perdu ? { message_reference: { message_id: vue.message_id, fail_if_not_exists: false } } : {};
  let posted = await deps.discord("POST", `/channels/${vue.salon_id}/messages`, { body: { ...annonce, ...reponseA } });
  // Sans « Voir les anciens messages », Discord refuse une réponse : l'annonce part alors sans être une réponse.
  if (posted && posted.status >= 400 && posted.status < 500 && posted.status !== 429 && "message_reference" in reponseA && !salonDisparu(posted)) {
    posted = await deps.discord("POST", `/channels/${vue.salon_id}/messages`, { body: annonce });
  }
  const annonceId = record(posted?.body)?.["id"];
  if (posted?.status === 200 && isId(annonceId)) {
    await fait(deps, vue, { final, perdu, annonceId, annonces: nouveaux.map((t) => t.discord_id) });
  } else if (salonDisparu(posted)) {
    await fait(deps, vue, { final: true, perdu: true, salonPerdu: true });
  } else {
    await fait(deps, vue, { final, perdu, erreur: `annonce des gagnants : ${expliquer(posted)}` });
  }
}

/**
 * Le travail du robot : le serveur fait les tirages dus et donne un concours qui a besoin de lui, pris pour cinq minutes
 * sous un jeton ; le robot le traite, rend compte, puis en demande un autre, cinq au plus. `id` : un seul concours, juste
 * après une commande de l'encadrement.
 */
export async function travailler(deps: ConcoursDeps, id: number | null = null): Promise<number> {
  let traites = 0;
  for (let tour = 0; tour < (id === null ? CONCOURS_PAR_REVEIL : 1); tour++) {
    const res = await deps.rpc("concours_travail", { p_limite: 1, p_id: id });
    const c = res?.["ok"] === true && Array.isArray(res["taches"]) ? parseVue(res["taches"][0]) : null;
    if (!c || c.jeton === null) return traites;
    try {
      await traiter(deps, c);
    } catch (e) {
      deps.log(`concours ${c.id} : ${e instanceof Error ? e.message : "erreur inattendue"}`);
      await fait(deps, c, { erreur: "erreur inattendue du robot" });
    }
    traites++;
  }
  return traites;
}

/**
 * La porte que la base appelle chaque minute quand un concours a besoin du robot. Sans secret : elle ne fait que ce que le
 * serveur a décidé, à son rythme.
 */
export async function concoursTic(deps: ConcoursDeps): Promise<Response> {
  if (deps.botId === "") return json({ ok: false, error: "pas de jeton" });
  // Le jeton d'un autre robot posterait des annonces dont les boutons iraient à une autre application.
  if (!(await deps.botAccepted())) return json({ ok: false, error: "jeton refusé" });
  // La base n'attend la réponse que trente secondes : elle l'a tout de suite, et le travail se fait en tâche de fond.
  deps.background(travailler(deps));
  return json({ ok: true });
}

/* ---------- L'image d'un billet, demandée par Discord ---------- */

/** `…/concours/billet/17.png` ou `…/concours/gagnant/17.png` : de 1 à 9 999, sans zéro devant. */
const ROUTE_BILLET = /\/concours\/(billet|gagnant)\/([1-9][0-9]{0,3})\.png$/;
/** Un fond lu sur le site est gardé une heure ; après un échec, il est redemandé au bout d'une minute. */
const FOND_FRAIS_MS = 3_600_000;
const FOND_REESSAI_MS = 60_000;
/** Les billets déjà dessinés que garde un fond : Discord redemande souvent les mêmes. */
const BILLETS_GARDES = 32;

interface FondLu {
  image: Image | null;
  at: number;
  /** Les billets dessinés sur ce fond, par numéro. */
  dessines: Map<number, Uint8Array<ArrayBuffer>>;
}
interface Fonds {
  lus: Map<SorteBillet, FondLu>;
  /** Une lecture en cours, partagée : les dix billets d'une annonce ne lisent le fond qu'une fois. */
  enCours: Map<SorteBillet, Promise<FondLu | null>>;
}
/**
 * Par moyen de lecture du site, puis par sorte de billet. En ligne, `liveDeps` donne la même fonction `siteImage` à chaque
 * requête (une par `fetch`, index.ts) : ce qui est gardé sert d'une requête à l'autre. Chaque test a la sienne.
 */
const fondsLus = new WeakMap<ConcoursDeps["siteImage"], Fonds>();

async function lireFond(deps: Pick<ConcoursDeps, "siteImage" | "log">, sorte: SorteBillet, lus: Map<SorteBillet, FondLu>, garde: FondLu | undefined): Promise<FondLu | null> {
  const now = Date.now();
  const octets = await deps.siteImage(FONDS[sorte]);
  const image = octets ? await lirePng(octets) : null;
  if (image) {
    const lu = { image, at: now, dessines: new Map<number, Uint8Array<ArrayBuffer>>() };
    lus.set(sorte, lu);
    return lu;
  }
  if (octets) deps.log(`fond du billet ${sorte} : PNG illisible`);
  // Le dernier fond lu sert encore une minute, puis le site est redemandé.
  if (garde?.image) {
    garde.at = now - FOND_FRAIS_MS + FOND_REESSAI_MS;
    return garde;
  }
  lus.set(sorte, { image: null, at: now, dessines: new Map() });
  return null;
}

async function fondDe(deps: Pick<ConcoursDeps, "siteImage" | "log">, sorte: SorteBillet): Promise<FondLu | null> {
  let fonds = fondsLus.get(deps.siteImage);
  if (!fonds) {
    fonds = { lus: new Map(), enCours: new Map() };
    fondsLus.set(deps.siteImage, fonds);
  }
  const garde = fonds.lus.get(sorte);
  if (garde && Date.now() - garde.at < (garde.image ? FOND_FRAIS_MS : FOND_REESSAI_MS)) return garde.image ? garde : null;
  const deja = fonds.enCours.get(sorte);
  if (deja) return deja;
  const { lus, enCours } = fonds;
  const lecture = lireFond(deps, sorte, lus, garde).finally(() => enCours.delete(sorte));
  enCours.set(sorte, lecture);
  return lecture;
}

/**
 * L'image d'un billet, que Discord demande par son adresse (`billetUrl`) : le fond publié par le site, et le numéro posé
 * dessus. Sans secret et sans donnée : un numéro ne dit pas à qui il est. `null` si l'adresse n'est pas celle d'un billet ;
 * 503 si le fond manque, et rien n'est gardé en route. `tete` : une demande HEAD, sans le corps.
 */
export async function concoursImage(path: string, tete: boolean, deps: Pick<ConcoursDeps, "siteImage" | "log">): Promise<Response | null> {
  const route = ROUTE_BILLET.exec(path);
  if (!route) return null;
  const sorte = route[1] === "gagnant" ? "gagnant" : "billet";
  const n = Number(route[2]);
  const fond = await fondDe(deps, sorte);
  let png = fond?.dessines.get(n) ?? null;
  if (fond?.image && !png) {
    png = await billetPng(fond.image, n);
    if (png) {
      if (fond.dessines.size >= BILLETS_GARDES) fond.dessines.delete(fond.dessines.keys().next().value ?? 0);
      fond.dessines.set(n, png);
    } else {
      deps.log(`billet ${sorte} : le fond n'a pas la taille d'un billet`);
    }
  }
  if (!png) return new Response(tete ? null : "Billet indisponible pour l'instant.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  return new Response(tete ? null : png, { status: 200, headers: { "content-type": "image/png", "content-length": String(png.length), "cache-control": "public, max-age=86400" } });
}

/**
 * La vie du village des Gaulois, côté robot (docs/DIRECTION.md, « Le village des Gaulois ») : ce que fait un passage de
 * `scripts/animer-village.ts`, lancé toutes les 5 minutes par le workflow des victoires, après les statères et à part d'eux.
 * Demande du pilote, 13 novembre 2026 : que l'activité du joueur sur Discord et OpenFront décide de ce que fait son Gaulois,
 * et des bulles écrites par Claude à partir de faits vrais seulement.
 *
 * Un passage :
 * 1. demande au serveur la liste de travail (`vie_du_village_travail`, clé de service) : pour chaque compte validé qui a un
 *    Gaulois, un numéro opaque, son identifiant Discord, les faits d'une bulle et s'il lui en faut une nouvelle. C'est le
 *    serveur qui décide : plus aucune bulle demandée quand l'encadrement les a coupées ou que la dépense du mois atteint le
 *    plafond, une demande toutes les 6 heures au plus par Gaulois, et seulement quand ses faits ont changé depuis la
 *    précédente.
 * 2. Avec le jeton du robot des arrivées (secret DISCORD_BOT_TOKEN) : les droits du rôle @everyone et les salons du
 *    serveur, une fois (seul un salon vocal que @everyone peut voir et rejoindre compte « en vocal »), puis l'état vocal de
 *    chaque Gaulois dont le serveur donne l'identifiant Discord (tout compte validé qui a un Gaulois et un compte Discord
 *    lié : décision du pilote du 14 novembre 2026, tous paraissent au village), un appel par
 *    membre (`GET /guilds/{serveur}/voice-states/{membre}`), une pause entre deux, au plus `MAX_VOCAL` appels et
 *    `MAX_VOCAL_MS` par passage, les plus anciens relevés d'abord. Arrêt net au premier 401 ou 403 ; un 429 attend ce que
 *    Discord demande, une fois. Puis `noter_vie_du_village` reçoit les états.
 * 3. Avec la clé ANTHROPIC_API_KEY : un seul appel à Claude, par le SDK officiel (`@anthropic-ai/sdk`), pour au plus 20
 *    Gaulois qui ont besoin d'une bulle. Claude ne reçoit que des faits sans identité (`faitsDuGaulois`), jamais l'état vocal.
 *    Chaque phrase est contrôlée (`controlerReplique`), puis le serveur reçoit d'abord les jetons dépensés, toujours, puis les
 *    phrases acceptées, qu'il contrôle encore, avec les numéros des Gaulois demandés sans bulle (phrase écartée, refus) :
 *    leur demande compte aussi pour les 6 heures.
 *
 * Chaque partie marche sans l'autre. Aucun identifiant n'est écrit au journal de l'Action, qui est public : seulement des
 * nombres.
 *
 * Le coût attendu (prix de la skill claude-api, 13 novembre 2026, Claude Haiku 5.5, le plus petit modèle en vigueur :
 * 0,10 $ par million de jetons d'entrée, 0,50 $ par million de jetons de sortie, pour une demande de moins de 100 000 jetons) :
 * - un appel : la consigne et les faits de 20 Gaulois, environ 2 000 jetons d'entrée (0,000 2 $) ; 20 phrases et la réflexion
 *   du modèle à l'effort « low », environ 1 500 jetons de sortie (0,000 75 $) : environ 0,001 $ l'appel ; jamais plus de
 *   `MAX_TOKENS` en sortie (0,002 $), soit 0,002 5 $ l'appel au plus ;
 * - en vrai, une demande par Gaulois toutes les 6 heures au plus, et aucune pour qui dort : trois à quatre par jour. Avec
 *   50 Gaulois, 200 bulles par jour au plus, une dizaine d'appels de 20, plus des appels pour une nouvelle partie, disons
 *   30 appels : 0,03 $ par jour, environ 1 $ par mois (2 $ avec 100 Gaulois) ;
 * - au pire du pire, un appel complet à chaque passage, 288 par jour : 288 × 0,002 5 $ = 0,72 $ par jour, 22 $ par mois ;
 *   le plafond du serveur coupe avant.
 * Le plafond de départ du serveur est de 10 $ par mois, réglable dans la Direction.
 */
import Anthropic from "@anthropic-ai/sdk";
import { DISCORD_API } from "../arrivees-discord";
import type { RpcResult } from "../compte/roster";
import { isSnowflake } from "../discord-commande";
import { EMPLACEMENTS_OBJETS, OBJETS, lireTenue, type Tenue } from "../gaulois";
import { CONSIGNE, LIEUX_ECRITS, MAJUSCULES_PERMISES, MAX_REPLIQUES_PAR_PASSAGE, MAX_SIGNES, MOMENTS_ECRITS, MOTS_INTERDITS, SCHEMA_REPONSE, type LieuDUneBulle } from "./consigne-repliques";
import { instantDeParis } from "./lumiere";
import { LIEUX, heureDeParis, ilFaitNuit, lieuDuGaulois } from "./vie";

/* ---------- Le moment de la journée ---------- */

/**
 * Les moments de la journée, à Paris : la nuit de l'écran (`ilFaitNuit` de `vie.ts`, de 23 h à 7 h), le matin jusqu'à
 * midi, l'après-midi jusqu'à 18 h, le soir. Un fait des bulles, et une part de leur clé : le serveur l'écrit une seconde
 * fois, à l'identique (`internal.village_vie_moment`, migration 20261113002300), pour décider quand un Gaulois a besoin
 * d'une nouvelle bulle ; l'essai de la migration compare les deux, quart d'heure par quart d'heure, en hiver et en été.
 */
export const MOMENTS = ["nuit", "matin", "apres-midi", "soir"] as const;
export type Moment = (typeof MOMENTS)[number];
export const MIDI = 12;
export const SOIR = 18;

export function momentDeLaJournee(date: Date): Moment {
  if (ilFaitNuit(date)) return "nuit";
  const { heure } = instantDeParis(date);
  if (heure < MIDI) return "matin";
  if (heure < SOIR) return "apres-midi";
  return "soir";
}

/* ---------- La liste de travail du serveur ---------- */

/** Un Gaulois de la liste de travail (`vie_du_village_travail`). `n` : son numéro opaque, qui ne part jamais chez Claude. */
export interface GauloisAuTravail {
  n: string;
  /** Son identifiant Discord, pour le relevé vocal ; `null` : pas de compte Discord lié. */
  discord: string | null;
  /** L'état vocal du dernier relevé de moins de 15 minutes ; `null` : pas de relevé récent. */
  vocal: boolean | null;
  /** Le début de sa dernière partie qui a rapporté des points au clan, de moins de 24 heures. */
  partie_le: string | null;
  points: number | null;
  tenue: Tenue | null;
  /** Le serveur demande une nouvelle bulle. */
  besoin: boolean;
  /** L'heure de la dernière demande d'une bulle pour lui, qu'elle en ait donné une ou pas ; `null` : aucune. */
  tente_le: string | null;
}

export interface Travail {
  maintenant: Date;
  /** Les bulles sont permises et le plafond du mois n'est pas atteint. */
  bulles: boolean;
  /** Le modèle de Claude dont le serveur connaît le prix ; `null` : illisible. */
  modele: string | null;
  gaulois: GauloisAuTravail[];
}

const NUMERO = /^[0-9a-f]{16}$/;
const MODELE = /^claude-[a-z0-9-]{1,60}$/;

const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** La réponse de `vie_du_village_travail`, relue ; `null` si elle n'a pas la forme attendue. Une ligne illisible est sautée. */
export function lireTravail(reponse: unknown): Travail | null {
  if (!estObjet(reponse) || reponse["ok"] !== true || !Array.isArray(reponse["gaulois"]) || typeof reponse["maintenant"] !== "string") return null;
  const maintenant = new Date(reponse["maintenant"]);
  if (!Number.isFinite(maintenant.getTime())) return null;
  const gaulois: GauloisAuTravail[] = [];
  for (const ligne of reponse["gaulois"] as unknown[]) {
    if (!estObjet(ligne) || typeof ligne["n"] !== "string" || !NUMERO.test(ligne["n"])) continue;
    const discord = typeof ligne["discord"] === "string" && isSnowflake(ligne["discord"]) ? ligne["discord"] : null;
    const partie = typeof ligne["partie_le"] === "string" && Number.isFinite(Date.parse(ligne["partie_le"])) ? ligne["partie_le"] : null;
    const points = typeof ligne["points"] === "number" && Number.isFinite(ligne["points"]) && ligne["points"] > 0 ? ligne["points"] : null;
    gaulois.push({
      n: ligne["n"],
      discord,
      vocal: typeof ligne["vocal"] === "boolean" ? ligne["vocal"] : null,
      partie_le: partie,
      points: partie === null ? null : points,
      tenue: lireTenue(ligne["tenue"]),
      besoin: ligne["besoin"] === true,
      tente_le: typeof ligne["tente_le"] === "string" ? ligne["tente_le"] : null,
    });
  }
  const modele = typeof reponse["modele"] === "string" && MODELE.test(reponse["modele"]) ? reponse["modele"] : null;
  return { maintenant, bulles: reponse["bulles"] === true, modele, gaulois };
}

/* ---------- Le relevé vocal sur Discord ---------- */

/** Appels à Discord au plus par passage : les plus anciens relevés d'abord, la suite au passage suivant. */
export const MAX_VOCAL = 80;
/** La pause entre deux appels. */
export const PAUSE_VOCAL_MS = 250;
/** Le temps de relevé d'un passage : aucun appel n'est lancé après. */
export const MAX_VOCAL_MS = 40_000;
/** Le délai d'un appel. */
export const DELAI_DISCORD_MS = 10_000;
/** Discord demande d'attendre : au-delà de tant, le passage s'arrête plutôt que d'attendre. */
export const ATTENTE_MAX_MS = 5_000;
/** Discord demande à chaque robot de se présenter ainsi. Rien du clan n'y est écrit. */
export const USER_AGENT_VIE = "DiscordBot (vie-du-village, 1.0)";

/** Ce que le serveur reçoit : vrai en vocal, faux sinon, `null` : illisible pour ce membre (Discord a refusé). */
export interface ReleveVocal {
  n: string;
  vocal: boolean | null;
}

/**
 * Pourquoi un relevé s'est arrêté avant la fin. `salons` : les salons du serveur ou les droits du rôle @everyone ne se
 * lisent pas, aucun relevé à ce passage.
 */
export type ArretVocal = "jeton" | "droits" | "serveur" | "limite" | "discord" | "reseau" | "temps" | "nombre" | "salons";

/** Les permissions de Discord qui font un salon public : le voir et s'y connecter. ADMINISTRATOR les donne toutes. */
export const VOIR_LE_SALON = 1n << 10n;
export const SE_CONNECTER = 1n << 20n;
export const ADMINISTRATEUR = 1n << 3n;
/** Les salons vocaux de Discord : vocal (2) et scène (13) ; une catégorie est de type 4. */
export const TYPES_VOCAUX: readonly number[] = [2, 13];
export const TYPE_CATEGORIE = 4;

/** Un champ de permissions de Discord : un entier écrit en chiffres, dans une chaîne. `null` pour toute autre chose. */
function bitsLus(v: unknown): bigint | null {
  return typeof v === "string" && /^[0-9]{1,20}$/.test(v) ? BigInt(v) : null;
}

/**
 * Les permissions du rôle @everyone au niveau du serveur, d'après `GET /guilds/{serveur}/roles/{serveur}` (« Get Guild
 * Role » : le rôle @everyone porte l'identifiant du serveur). `null` : la réponse n'est pas ce rôle, ou ses permissions ne
 * se lisent pas.
 */
export function permissionsDeTous(role: unknown, guildId: string): bigint | null {
  if (!estObjet(role) || role["id"] !== guildId) return null;
  return bitsLus(role["permissions"]);
}

/**
 * Les permissions de @everyone dans un salon ou une catégorie, dans l'ordre que donne la documentation de Discord
 * (« Permissions », 14 novembre 2026) : celles du rôle au niveau du serveur ; ADMINISTRATOR passe outre tout réglage ;
 * sinon le refus, puis l'accord, que le salon pose pour @everyone (son réglage qui porte l'identifiant du serveur). Les
 * réglages des autres rôles et des membres ne touchent pas @everyone. `null` : un réglage illisible ou en double.
 */
export function permissionsDeTousDansLeSalon(base: bigint, salon: Record<string, unknown>, guildId: string): bigint | null {
  if ((base & ADMINISTRATEUR) === ADMINISTRATEUR) return base | VOIR_LE_SALON | SE_CONNECTER;
  const reglages = salon["permission_overwrites"] ?? [];
  if (!Array.isArray(reglages)) return null;
  const pourTous = reglages.filter((r) => !estObjet(r) || r["id"] === guildId);
  if (pourTous.length === 0) return base;
  const reglage = pourTous[0];
  if (pourTous.length > 1 || !estObjet(reglage)) return null;
  const refus = reglage["deny"] === undefined ? 0n : bitsLus(reglage["deny"]);
  const accord = reglage["allow"] === undefined ? 0n : bitsLus(reglage["allow"]);
  if (refus === null || accord === null) return null;
  return (base & ~refus) | accord;
}

/** @everyone voit-il le salon et peut-il s'y connecter ? */
const ouvertATous = (p: bigint | null): boolean => p !== null && (p & VOIR_LE_SALON) !== 0n && (p & SE_CONNECTER) !== 0n;

/**
 * Les salons vocaux publics du serveur, d'après `GET /guilds/{serveur}/channels` et les permissions du rôle @everyone au
 * niveau du serveur (`permissionsDeTous`) : un salon vocal ou une scène que @everyone peut voir et rejoindre, permissions du
 * serveur puis réglages du salon compris (`permissionsDeTousDansLeSalon`). Discord ne fait pas hériter un salon de sa
 * catégorie (il copie ses réglages tant qu'ils sont « synchronisés ») ; par prudence, un salon rangé dans une catégorie
 * que @everyone ne peut ni voir ni rejoindre, ou dans une catégorie absente de la liste, ne compte pas non plus. Un membre
 * dans un autre salon (privé, de l'encadrement) n'est pas montré « en vocal » sur la place. `null` : la réponse n'est pas
 * une liste de salons, ou les permissions de @everyone manquent. Un salon aux permissions illisibles ne compte pas.
 */
export function salonsVocauxPublics(salons: unknown, guildId: string, base: bigint | null): Set<string> | null {
  if (!Array.isArray(salons) || base === null) return null;
  const parId = new Map<string, Record<string, unknown>>();
  for (const salon of salons) if (estObjet(salon) && typeof salon["id"] === "string") parId.set(salon["id"], salon);
  const publics = new Set<string>();
  for (const [id, salon] of parId) {
    if (!TYPES_VOCAUX.includes(salon["type"] as number) || !ouvertATous(permissionsDeTousDansLeSalon(base, salon, guildId))) continue;
    const parent = salon["parent_id"];
    if (parent !== undefined && parent !== null) {
      const categorie = typeof parent === "string" ? parId.get(parent) : undefined;
      if (!categorie || categorie["type"] !== TYPE_CATEGORIE || !ouvertATous(permissionsDeTousDansLeSalon(base, categorie, guildId))) continue;
    }
    publics.add(id);
  }
  return publics;
}

export interface VocauxDeps {
  token: string;
  guildId: string;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  horloge: () => number;
}

export interface Limites {
  max: number;
  pauseMs: number;
  dureeMs: number;
}

export const LIMITES_VOCAL: Limites = { max: MAX_VOCAL, pauseMs: PAUSE_VOCAL_MS, dureeMs: MAX_VOCAL_MS };

interface Reponse {
  status: number;
  corps: unknown;
  reste: string | null;
  remise: string | null;
}

async function appelDiscord(url: string, token: string, send: typeof fetch): Promise<Reponse | null> {
  let reponse: Response;
  try {
    reponse = await send(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(DELAI_DISCORD_MS), headers: { authorization: `Bot ${token}`, "user-agent": USER_AGENT_VIE } });
  } catch {
    return null;
  }
  let corps: unknown = null;
  try {
    const texte = await reponse.text();
    corps = texte === "" ? null : JSON.parse(texte);
  } catch {
    corps = null;
  }
  return { status: reponse.status, corps, reste: reponse.headers.get("x-ratelimit-remaining"), remise: reponse.headers.get("x-ratelimit-reset-after") };
}

/**
 * D'abord, une fois, les permissions du rôle @everyone au niveau du serveur (`GET /guilds/{serveur}/roles/{serveur}`,
 * l'appel le plus léger qui les donne) et la liste des salons du serveur (`salonsVocauxPublics`) : sans l'une ou l'autre,
 * aucun relevé. Puis l'état vocal des Gaulois qui ont un compte Discord, dans l'ordre de la liste (le serveur met les plus
 * anciens relevés d'abord). Réponses de Discord (documentation « Get User Voice State », 13 novembre 2026) :
 * - 200 : l'état vocal ; `channel_id` donne le salon, vide s'il n'est dans aucun ;
 * - 404 « Unknown voice state » (10065), comme un membre inconnu (10007, 10013) : il n'est dans aucun salon vocal ;
 *   « Unknown guild » (10004) : le robot n'est pas sur le serveur, arrêt ;
 * - 401 : jeton refusé, arrêt net, rien de noté ;
 * - 403 : le membre est dans un salon où le robot n'a pas le droit de se connecter (ou le robot n'a pas accès au serveur) :
 *   ce membre est noté illisible, puis arrêt net. Noté, il passe en fin de liste au passage suivant ;
 * - 429 : attendre `retry_after` secondes, une fois, si c'est court ; sinon arrêt ;
 * - autre chose : Discord ne répond pas bien, arrêt.
 */
export async function releverLesVocaux(gaulois: readonly GauloisAuTravail[], deps: VocauxDeps, limites: Limites = LIMITES_VOCAL): Promise<{ releves: ReleveVocal[]; arret: ArretVocal | null }> {
  const releves: ReleveVocal[] = [];
  const debut = deps.horloge();
  let appels = 0;
  if (!gaulois.some((g) => g.discord !== null)) return { releves, arret: null };
  // D'abord, une fois par passage, les droits de @everyone et les salons du serveur : seul un salon vocal que tout le monde
  // peut voir et rejoindre compte « en vocal ». Sans eux, aucun relevé : un membre dans un salon privé ne doit jamais être
  // montré en vocal.
  const lus: Reponse[] = [];
  for (const chemin of [`roles/${deps.guildId}`, "channels"]) {
    const lu = await appelDiscord(`${DISCORD_API}/guilds/${deps.guildId}/${chemin}`, deps.token, deps.fetch);
    if (lu === null) return { releves, arret: "reseau" };
    if (lu.status === 401) return { releves, arret: "jeton" };
    if (lu.status === 404 && estObjet(lu.corps) && lu.corps["code"] === 10004) return { releves, arret: "serveur" };
    if (lu.status === 429) return { releves, arret: "limite" };
    if (lu.status !== 200) return { releves, arret: "salons" };
    lus.push(lu);
  }
  const [role, liste] = lus as [Reponse, Reponse];
  const publics = salonsVocauxPublics(liste.corps, deps.guildId, permissionsDeTous(role.corps, deps.guildId));
  if (publics === null) return { releves, arret: "salons" };
  for (const g of gaulois) {
    if (g.discord === null) continue;
    if (appels >= limites.max) return { releves, arret: "nombre" };
    if (deps.horloge() - debut >= limites.dureeMs) return { releves, arret: "temps" };
    if (appels > 0) await deps.sleep(limites.pauseMs);
    const url = `${DISCORD_API}/guilds/${deps.guildId}/voice-states/${g.discord}`;
    let reponse: Reponse | null = null;
    for (let essai = 0; essai < 2; essai++) {
      appels++;
      reponse = await appelDiscord(url, deps.token, deps.fetch);
      if (reponse?.status !== 429 || essai === 1) break;
      const corps = estObjet(reponse.corps) ? reponse.corps : {};
      const secondes = Number(corps["retry_after"]);
      if (corps["global"] === true || !Number.isFinite(secondes) || secondes * 1000 > ATTENTE_MAX_MS) break;
      await deps.sleep(Math.ceil(secondes * 1000) + 100);
    }
    if (reponse === null) return { releves, arret: "reseau" };
    const code = estObjet(reponse.corps) ? reponse.corps["code"] : undefined;
    if (reponse.status === 200) {
      const salon = estObjet(reponse.corps) ? reponse.corps["channel_id"] : undefined;
      releves.push({ n: g.n, vocal: typeof salon === "string" && publics.has(salon) });
    } else if (reponse.status === 404) {
      if (code === 10004) return { releves, arret: "serveur" };
      releves.push({ n: g.n, vocal: false });
    } else if (reponse.status === 401) {
      return { releves, arret: "jeton" };
    } else if (reponse.status === 403) {
      releves.push({ n: g.n, vocal: null });
      return { releves, arret: "droits" };
    } else if (reponse.status === 429) {
      return { releves, arret: "limite" };
    } else {
      return { releves, arret: "discord" };
    }
    // Le seau de Discord est vide : attendre qu'il se remplisse, si c'est court.
    if (reponse.reste === "0") {
      const secondes = Number(reponse.remise);
      if (Number.isFinite(secondes) && secondes > 0) {
        if (secondes * 1000 > ATTENTE_MAX_MS) return { releves, arret: "limite" };
        await deps.sleep(Math.ceil(secondes * 1000));
      }
    }
  }
  return { releves, arret: null };
}

/** Ce que le journal de l'Action dit d'un arrêt, sans nommer personne. */
export const ARRETS_VOCAL: Readonly<Record<ArretVocal, string>> = {
  jeton: "::warning::Vie du village : Discord refuse le jeton du robot (401). Aucun état vocal relevé : vérifiez le secret DISCORD_BOT_TOKEN.",
  droits:
    "::warning::Vie du village : Discord refuse de lire l'état vocal d'un membre (403). Le robot « Bienvenue Gaulois » doit avoir le droit « Se connecter » sur tous les salons vocaux du serveur. Relevé arrêté pour ce passage.",
  serveur: "::warning::Vie du village : Discord ne connaît pas le serveur du clan pour ce robot (10004). Le robot est-il toujours sur le serveur ?",
  limite: "Vie du village : Discord demande de ralentir. La suite du relevé au prochain passage.",
  discord: "Vie du village : Discord ne répond pas comme prévu. La suite du relevé au prochain passage.",
  reseau: "Vie du village : Discord ne répond pas. La suite du relevé au prochain passage.",
  temps: "Vie du village : temps du relevé écoulé, la suite au prochain passage.",
  nombre: "Vie du village : nombre d'appels du passage atteint, la suite au prochain passage.",
  salons:
    "::warning::Vie du village : les salons du serveur ou les droits du rôle @everyone ne se lisent pas : aucun état vocal relevé à ce passage (un salon privé ne doit jamais compter « en vocal »).",
};

/* ---------- Les faits d'une bulle ---------- */

/** Les faits dont une bulle est tirée, gardés avec elle par le serveur. Rien n'y désigne le joueur, rien n'y dit le vocal. */
export interface FaitsDuGaulois {
  /** L'heure de Paris, comme l'écrit l'écran : « 21 h 05 », « 7 h 40 ». */
  heure: string;
  moment: Moment;
  lieu: LieuDUneBulle;
  /** Les points que sa dernière partie de moins de 12 heures a rapportés au clan, « 1,65 » ; `null` : aucune. */
  points: string | null;
  /** Les noms du catalogue des objets qu'il porte. */
  objets: string[];
}

/** Les lieux d'une bulle, dans l'ordre de l'écran : tous sauf la salle de réunion. Le serveur n'en accepte pas d'autre. */
export const LIEUX_DES_BULLES: readonly LieuDUneBulle[] = LIEUX.filter((lieu): lieu is LieuDUneBulle => lieu !== "reunion");

/**
 * Les points d'une partie ne sont donnés à Claude que si elle a commencé il y a moins de tant : une bulle se montre 12
 * heures, et la place ne montre une partie que pendant ses 24 premières heures. Le serveur ne donne pas les points d'une
 * partie plus ancienne, et ignore une bulle qui en parlerait.
 */
export const POINTS_DANS_LES_BULLES_MS = 12 * 3_600_000;

/** Les points écrits à la française, deux décimales au plus : 1,65 ; 2 ; 1,5. `null` pour rien ou moins. */
export function pointsEcrits(points: number | null): string | null {
  if (points === null || !Number.isFinite(points) || points <= 0 || points >= 1000) return null;
  const arrondi = Math.round(points * 100) / 100;
  if (arrondi <= 0) return null;
  return String(arrondi).replace(".", ",");
}

/** Les noms des objets portés, emplacement par emplacement : les cases « rien » ne comptent pas. */
export function objetsPortes(tenue: Tenue): string[] {
  const noms: string[] = [];
  for (const emplacement of EMPLACEMENTS_OBJETS) {
    const objet = OBJETS[emplacement][tenue[emplacement] ?? ""];
    if (objet && objet.dessin !== null) noms.push(objet.nom);
  }
  return noms;
}

/**
 * Le lieu d'une bulle : celui que l'écran montrerait si l'état vocal n'était pas relevé (`lieuDuGaulois` de `vie.ts`, une
 * seule règle, avec `vocal` à `null`). Une bulle reste 12 heures à l'écran, l'état vocal 15 minutes (page Confidentialité) :
 * une phrase écrite « en salle de réunion » le dirait bien après. Jamais la salle de réunion, donc.
 */
export function lieuDUneBulle(g: Pick<GauloisAuTravail, "partie_le">, maintenant: Date): LieuDUneBulle {
  const { lieu } = lieuDuGaulois({ partie_le: g.partie_le, vocal: null }, maintenant);
  if (lieu !== "reunion") return lieu;
  // Sans vocal, la règle ne mène jamais à la salle de réunion ; si elle changeait, le lieu serait celui de l'heure.
  return ilFaitNuit(maintenant) ? "maisons" : "place";
}

/**
 * Les faits d'un Gaulois à `maintenant` (l'heure du serveur) ; `null` si sa tenue ne se lit pas. Ni l'état vocal, ni son
 * effet sur le lieu (`lieuDUneBulle`). Les points, seulement d'une partie de moins de 12 heures (`POINTS_DANS_LES_BULLES_MS`).
 */
export function faitsDuGaulois(g: GauloisAuTravail, maintenant: Date): FaitsDuGaulois | null {
  if (!g.tenue) return null;
  const debut = g.partie_le === null ? Number.NaN : Date.parse(g.partie_le);
  const recente = maintenant.getTime() - debut < POINTS_DANS_LES_BULLES_MS && debut <= maintenant.getTime();
  return {
    heure: heureDeParis(maintenant),
    moment: momentDeLaJournee(maintenant),
    lieu: lieuDUneBulle(g, maintenant),
    points: recente ? pointsEcrits(g.points) : null,
    objets: objetsPortes(g.tenue),
  };
}

/** Un Gaulois de l'appel à Claude : son étiquette dans l'appel (« g1 »), son numéro pour le serveur, ses faits. */
export interface GauloisDuLot {
  g: string;
  n: string;
  faits: FaitsDuGaulois;
}

/**
 * Les Gaulois de l'appel : ceux pour qui le serveur demande une bulle, ceux qui n'ont jamais eu de demande d'abord, puis les
 * plus anciennes demandes, `MAX_REPLIQUES_PAR_PASSAGE` au plus. Leur étiquette ne dit rien d'eux : g1, g2…
 * Un Gaulois qui dort dans les maisons n'en reçoit pas : l'écran ne montre jamais la bulle de qui dort, ce serait une
 * dépense pour rien. Il en aura une au matin, ses faits ayant changé.
 */
export function choisirLeLot(gaulois: readonly GauloisAuTravail[], maintenant: Date, max = MAX_REPLIQUES_PAR_PASSAGE): GauloisDuLot[] {
  const quand = (g: GauloisAuTravail) => (g.tente_le === null ? 0 : Date.parse(g.tente_le) || 1);
  const candidats = gaulois.filter((g) => g.besoin && g.tenue !== null).sort((a, b) => quand(a) - quand(b));
  const lot: GauloisDuLot[] = [];
  for (const g of candidats) {
    if (lot.length >= max) break;
    const faits = faitsDuGaulois(g, maintenant);
    if (faits && faits.lieu !== "maisons") lot.push({ g: `g${lot.length + 1}`, n: g.n, faits });
  }
  return lot;
}

/* ---------- L'appel à Claude ---------- */

/**
 * L'adresse de l'API de Claude, écrite ici et donnée au SDK : une variable ANTHROPIC_BASE_URL dans l'environnement
 * n'enverrait jamais la clé ailleurs. Le SDK (`@anthropic-ai/sdk`) y ajoute `/v1/messages` et l'en-tête de version.
 */
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
/** La sortie la plus longue d'un appel, réflexion du modèle comprise : 20 phrases en prennent environ 1 000. */
export const MAX_TOKENS = 4000;
/** L'effort le plus bas : des phrases courtes, à moindre coût. */
export const EFFORT = "low";
/**
 * Le délai d'un appel à Claude, en millisecondes (l'unité du SDK), sans aucune reprise (`maxRetries: 0`). Avec le relevé
 * vocal (40 s, plus 10 s pour le dernier appel), le passage tient dans les 2 minutes de l'étape du workflow ; une reprise
 * faite en silence par le SDK ferait aussi payer un calcul que le compte des jetons ne verrait pas. Après un refus pour trop
 * de demandes ou une panne de l'API, le passage suivant réessaie.
 */
export const DELAI_CLAUDE_MS = 45_000;
export const REPRISES_CLAUDE = 0;

/** Les faits d'un Gaulois, tels que Claude les lit : des mots, sans code ni identifiant. */
export function faitsEcrits(gaulois: GauloisDuLot): Record<string, unknown> {
  const { faits } = gaulois;
  return {
    g: gaulois.g,
    heure: faits.heure,
    moment: MOMENTS_ECRITS[faits.moment],
    ou: LIEUX_ECRITS[faits.lieu],
    ...(faits.points === null ? {} : { points_rapportes_au_clan_par_sa_derniere_partie: faits.points }),
    porte: faits.objets,
  };
}

/**
 * Le corps de la demande à l'API Messages : la consigne, les faits, la forme imposée de la réponse (sortie structurée,
 * `output_config.format`), l'effort le plus bas. Ni `temperature` (refusée par cette version de l'API), ni `thinking` (le
 * modèle choisit), ni `fallbacks` (le plus petit modèle n'en a pas), ni flux : la réponse est courte.
 */
export function corpsDeLaDemande(modele: string, lot: readonly GauloisDuLot[]): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: modele,
    max_tokens: MAX_TOKENS,
    system: CONSIGNE,
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA_REPONSE } },
    messages: [{ role: "user", content: `Les faits de chaque Gaulois, en JSON :\n${JSON.stringify(lot.map(faitsEcrits))}` }],
  };
}

/** Les jetons d'un appel, lus dans la réponse de l'API. */
export interface Jetons {
  entree: number;
  sortie: number;
}

const entier = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);

/** Les jetons comptés par l'API (`usage`) ; `null` s'il n'y en a pas. L'entrée compte aussi le cache, s'il y en avait. */
export function jetonsDeLaReponse(reponse: unknown): Jetons | null {
  if (!estObjet(reponse) || !estObjet(reponse["usage"])) return null;
  const u = reponse["usage"];
  if (typeof u["input_tokens"] !== "number" || typeof u["output_tokens"] !== "number") return null;
  return { entree: entier(u["input_tokens"]) + entier(u["cache_creation_input_tokens"]) + entier(u["cache_read_input_tokens"]), sortie: entier(u["output_tokens"]) };
}

/**
 * Les phrases de la réponse de Claude, par étiquette ; une étiquette inconnue ou répétée est sautée. `raison` : pourquoi il
 * n'y en a aucune (refus du modèle, réponse coupée, JSON illisible). La raison de l'arrêt (`stop_reason`) se lit avant le
 * contenu : un refus ou une réponse coupée ne donnent aucune phrase, quoi que contienne le texte.
 */
export function phrasesDeLaReponse(reponse: unknown, etiquettes: ReadonlySet<string>): { phrases: Map<string, unknown>; raison: string | null } {
  const phrases = new Map<string, unknown>();
  if (!estObjet(reponse)) return { phrases, raison: "réponse illisible" };
  const arret = reponse["stop_reason"];
  if (arret === "refusal") return { phrases, raison: "le modèle a refusé la demande" };
  if (arret === "max_tokens" || arret === "model_context_window_exceeded") return { phrases, raison: "réponse coupée" };
  if (arret !== "end_turn") return { phrases, raison: "réponse arrêtée autrement que prévu" };
  const blocs = Array.isArray(reponse["content"]) ? (reponse["content"] as unknown[]) : [];
  const texte = blocs
    .filter((b): b is Record<string, unknown> => estObjet(b) && b["type"] === "text" && typeof b["text"] === "string")
    .map((b) => b["text"] as string)
    .join("");
  let lu: unknown;
  try {
    lu = JSON.parse(texte);
  } catch {
    return { phrases, raison: "JSON illisible" };
  }
  if (!estObjet(lu) || !Array.isArray(lu["repliques"])) return { phrases, raison: "JSON hors de la forme demandée" };
  for (const r of lu["repliques"] as unknown[]) {
    if (!estObjet(r) || typeof r["g"] !== "string" || !etiquettes.has(r["g"]) || phrases.has(r["g"])) continue;
    phrases.set(r["g"], r["texte"]);
  }
  return { phrases, raison: null };
}

export interface AppelClaude {
  /** Les jetons à compter ; `null` : rien n'a été facturé (refus de l'API avant tout calcul, réseau). */
  jetons: Jetons | null;
  phrases: Map<string, unknown>;
  /** Pourquoi l'appel n'a rien donné ; `avertir` : à signaler dans le journal de l'Action. */
  raison: string | null;
  avertir: boolean;
}

/** Ce que le journal dit d'une erreur de l'API : son type et le début de son message (l'API n'y met jamais la clé). */
function detailDeLErreur(e: InstanceType<typeof Anthropic.APIError>): string {
  const message = typeof e.apiMessage === "string" ? e.apiMessage.slice(0, 200) : "";
  return `${e.type ?? "inconnue"}${message ? ` : ${message}` : ""}`;
}

/**
 * Un appel à l'API Messages par le SDK officiel (`@anthropic-ai/sdk`, skill claude-api), avec le `fetch` donné : les essais
 * simulent les réponses sans réseau. La clé n'est donnée qu'au client du SDK, qui l'envoie à `ANTHROPIC_BASE_URL` ; elle
 * n'est jamais écrite au journal. Les erreurs, par les classes du SDK, de la plus précise à la plus large :
 * - 401 (`AuthenticationError`) et 403 (`PermissionDeniedError`) : la clé ; rien n'est compté, avertissement ;
 * - 429 (`RateLimitError`) et 5xx (`InternalServerError`, surcharge comprise) : rien n'est compté, le passage suivant
 *   réessaie, sans avertissement ;
 * - réseau ou délai dépassé (`APIConnectionError`) : l'API a pu calculer quand même, le compte le plus haut possible est
 *   noté, pour que le plafond tienne ;
 * - toute autre réponse de l'API (`APIError`, 400 par exemple) : rien n'est compté, avertissement.
 * Une réponse lue : ses jetons (`usage`, réflexion du modèle comprise), même quand elle est refusée ou coupée.
 */
export async function demanderLesBulles(modele: string, lot: readonly GauloisDuLot[], cle: string, send: typeof fetch): Promise<AppelClaude> {
  const corps = corpsDeLaDemande(modele, lot);
  // Le compte le plus haut possible, quand l'API a pu calculer sans dire combien : le plafond tient toujours.
  const auPlusHaut: Jetons = { entree: JSON.stringify(corps).length, sortie: MAX_TOKENS };
  const client = new Anthropic({ apiKey: cle, baseURL: ANTHROPIC_BASE_URL, fetch: send, maxRetries: REPRISES_CLAUDE, timeout: DELAI_CLAUDE_MS });
  let reponse: Anthropic.Message;
  try {
    reponse = await client.messages.create(corps);
  } catch (e) {
    const rien = new Map<string, unknown>();
    if (e instanceof Anthropic.AuthenticationError) return { jetons: null, phrases: rien, raison: "la clé ANTHROPIC_API_KEY est refusée (401)", avertir: true };
    if (e instanceof Anthropic.PermissionDeniedError) return { jetons: null, phrases: rien, raison: "la clé ANTHROPIC_API_KEY n'a pas le droit d'appeler ce modèle (403)", avertir: true };
    if (e instanceof Anthropic.RateLimitError) {
      return { jetons: null, phrases: rien, raison: "trop de demandes, ou la limite de dépense fixée chez Anthropic est atteinte (429) : nouvel essai au prochain passage", avertir: false };
    }
    if (e instanceof Anthropic.InternalServerError) return { jetons: null, phrases: rien, raison: `l'API ne répond pas bien (${e.status}, ${detailDeLErreur(e)}) : nouvel essai au prochain passage`, avertir: false };
    if (e instanceof Anthropic.APIConnectionError) return { jetons: auPlusHaut, phrases: rien, raison: "Claude ne répond pas", avertir: false };
    if (e instanceof Anthropic.APIError) return { jetons: null, phrases: rien, raison: `réponse ${e.status ?? "inconnue"} de l'API (${detailDeLErreur(e)})`, avertir: true };
    // Une erreur hors de l'API : l'appel a pu partir, le compte le plus haut possible.
    return { jetons: auPlusHaut, phrases: rien, raison: "appel à Claude interrompu", avertir: true };
  }
  // Une réponse sans compte de jetons : le compte le plus haut possible, pour que le plafond tienne.
  const jetons = jetonsDeLaReponse(reponse) ?? auPlusHaut;
  const { phrases, raison } = phrasesDeLaReponse(reponse, new Set(lot.map((g) => g.g)));
  return { jetons, phrases, raison, avertir: false };
}

/* ---------- Le contrôle d'une phrase ---------- */

/** Les signes permis dans une bulle : lettres du français, chiffres, espace et ponctuation simple. Le même que le serveur. */
export const SIGNES_PERMIS = /^[A-Za-zÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇàâäéèêëîïôöùûüÿçŒœÆæ0-9 .,!?'’:;…«»()-]+$/;
const ACCENTS = "ÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇàâäéèêëîïôöùûüÿç";
const SANS_ACCENTS = "aaaeeeeiioouuuycaaaeeeeiioouuuyc";
const NOMBRE = /[0-9]+(?:[.,][0-9]+)?/g;

/** Le texte ramené aux mots : minuscules sans accents, une espace entre deux mots, une au début et à la fin. */
export function normaliserPourLesMots(texte: string): string {
  let t = texte.replace(/[Œœ]/g, "oe").replace(/[Ææ]/g, "ae");
  t = [...t].map((c) => {
    const i = ACCENTS.indexOf(c);
    return i >= 0 ? SANS_ACCENTS[i] : c;
  }).join("");
  t = t.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  return ` ${t} `;
}

/**
 * Un nombre écrit, sous une forme décimale exacte : sans zéro inutile à gauche ni à droite, le point pour virgule. Deux
 * nombres sont égaux exactement quand leurs formes le sont, comme le compare le serveur (type `numeric`) : « 21,0 » vaut
 * « 21 », mais « 21.0000000000000001 » ne vaut pas « 21 », alors qu'un nombre à virgule flottante les confondrait.
 */
export function nombreExact(ecrit: string): string {
  const [entier = "", decimales = ""] = ecrit.replace(",", ".").split(".");
  const e = entier.replace(/^0+(?=\d)/, "");
  const d = decimales.replace(/0+$/, "");
  return d === "" ? e : `${e}.${d}`;
}

const nombresDe = (texte: string): string[] => (texte.match(NOMBRE) ?? []).map(nombreExact);

/** Les lettres du français, pour borner un mot (les mêmes que dans les signes permis). */
const LETTRES = "A-Za-zÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇàâäéèêëîïôöùûüÿçŒœÆæ";
const MAJUSCULE = "A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ";

/**
 * Une majuscule hors de sa place : ni au début de la bulle, ni au début d'une phrase (après « . », « ! », « ? » ou « … » et
 * une espace), un guillemet « ouvrant permis devant, ni dans un mot permis (`MAJUSCULES_PERMISES`). Le même calcul que le
 * serveur (`internal.village_vie_replique_valide`) : les mots permis, puis les débuts de phrase, sont retirés ; il ne doit
 * plus rester de majuscule.
 */
export function majusculeHorsPlace(texte: string): boolean {
  let reste = texte;
  for (const mot of MAJUSCULES_PERMISES) reste = reste.replace(new RegExp(`(?<![${LETTRES}])${mot}(?![${LETTRES}])`, "g"), "_");
  reste = reste.replace(new RegExp(`^((?:« )?)[${MAJUSCULE}]`), "$1_").replace(new RegExp(`([.!?…] (?:« )?)[${MAJUSCULE}]`, "g"), "$1_");
  return new RegExp(`[${MAJUSCULE}]`).test(reste);
}

/** La phrase, sans espace en trop ni guillemets droits autour : la forme qu'elle a sur la place. */
export function nettoyerPhrase(texte: string): string {
  return texte.replace(/[   ]/g, " ").replace(/\s+/g, " ").trim().replace(/^"+|"+$/g, "").trim();
}

export type Controle = { ok: true; texte: string } | { ok: false; raison: string };

/**
 * Le contrôle d'une phrase de Claude avant de l'envoyer au serveur, qui refait le même (`internal.village_vie_replique_valide`) :
 * 1 à 90 signes ; seulement les signes permis (donc ni « @ », ni « # », ni balise, ni lien, ni émoji) ; pas deux majuscules
 * d'affilée ; pas de point collé entre deux mots (une adresse) ; aucun nombre absent des faits (l'heure, les points) ; aucun
 * mot interdit.
 */
export function controlerReplique(brut: unknown, faits: FaitsDuGaulois): Controle {
  if (typeof brut !== "string") return { ok: false, raison: "pas une phrase" };
  const texte = nettoyerPhrase(brut);
  const signes = [...texte].length;
  if (signes < 1) return { ok: false, raison: "vide" };
  if (signes > MAX_SIGNES) return { ok: false, raison: "trop longue" };
  if (!SIGNES_PERMIS.test(texte)) return { ok: false, raison: "signe refusé" };
  if (/[A-Z]{2}/.test(texte)) return { ok: false, raison: "majuscules" };
  if (/[A-Za-z0-9]\.[A-Za-z]/.test(texte)) return { ok: false, raison: "adresse" };
  const permis = nombresDe(`${faits.heure} ${faits.points ?? ""}`);
  if (nombresDe(texte).some((n) => !permis.includes(n))) return { ok: false, raison: "chiffre absent des faits" };
  const mots = normaliserPourLesMots(texte);
  if (MOTS_INTERDITS.some((m) => mots.includes(m))) return { ok: false, raison: "mot interdit" };
  if (majusculeHorsPlace(texte)) return { ok: false, raison: "majuscule hors d'un début de phrase" };
  return { ok: true, texte };
}

/* ---------- Un passage ---------- */

export interface VieDeps {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** Le jeton du robot et le serveur du clan ; `null` : pas de relevé vocal. */
  discord: { token: string; guildId: string } | null;
  /** La clé de l'API Claude ; `null` : pas de bulles. */
  cleClaude: string | null;
  log: (ligne: string) => void;
  horloge?: () => number;
  limites?: Limites;
}

export interface BilanDeLaVie {
  vocaux: number;
  enVocal: number;
  appels: number;
  envoyees: number;
  ecartees: number;
  /** Les refus du serveur ou les pannes à signaler : le script sort alors en erreur, sans rien bloquer. */
  erreurs: number;
}

/**
 * Un passage. Lève une erreur si la liste de travail ne se lit pas (migration pas collée, clé refusée) : rien d'autre n'est
 * alors fait. Ensuite, chaque partie continue sans l'autre : un refus du serveur pour les états vocaux n'empêche pas les
 * bulles.
 */
export async function vieDuVillage(deps: VieDeps): Promise<BilanDeLaVie> {
  const bilan: BilanDeLaVie = { vocaux: 0, enVocal: 0, appels: 0, envoyees: 0, ecartees: 0, erreurs: 0 };
  const call = async (fn: string, args: Record<string, unknown>) => {
    const result = await deps.rpc(fn, args);
    if (result.ok !== true) throw new Error(`${fn} : ${typeof result.error === "string" ? result.error : "réponse inattendue"}`);
    return result;
  };
  const noter = async (releve: Record<string, unknown>, quoi: string): Promise<boolean> => {
    try {
      await call("noter_vie_du_village", { p_releve: releve });
      return true;
    } catch (e) {
      bilan.erreurs++;
      deps.log(`::warning::Vie du village : ${quoi} refusé(s) par le serveur (${e instanceof Error ? e.message : String(e)}).`);
      return false;
    }
  };
  const travail = lireTravail(await call("vie_du_village_travail", {}));
  if (!travail) throw new Error("vie_du_village_travail : réponse inattendue");

  // 1. Le relevé vocal.
  let releves: ReleveVocal[] = [];
  if (!deps.discord) {
    deps.log("Vie du village : pas de jeton du robot (secret DISCORD_BOT_TOKEN), aucun état vocal relevé.");
  } else {
    const resultat = await releverLesVocaux(travail.gaulois, { ...deps.discord, fetch: deps.fetch, sleep: deps.sleep, horloge: deps.horloge ?? Date.now }, deps.limites);
    releves = resultat.releves;
    if (resultat.arret) {
      deps.log(ARRETS_VOCAL[resultat.arret]);
      if (resultat.arret === "jeton" || resultat.arret === "droits" || resultat.arret === "serveur" || resultat.arret === "salons") bilan.erreurs++;
    }
    if (releves.length > 0 && (await noter({ vocaux: releves }, "les états vocaux"))) {
      bilan.vocaux = releves.length;
      bilan.enVocal = releves.filter((r) => r.vocal === true).length;
    }
  }

  // 2. Les bulles.
  if (!deps.cleClaude) {
    deps.log("Vie du village : pas de clé ANTHROPIC_API_KEY, aucune bulle écrite.");
  } else {
    // La liste lue avant le relevé vocal : l'état vocal ne change pas les faits d'une bulle, qui ne le disent jamais.
    const lot = travail.bulles && travail.modele ? choisirLeLot(travail.gaulois, travail.maintenant) : [];
    if (!travail.bulles) deps.log("Vie du village : bulles coupées par l'encadrement, ou plafond du mois atteint : aucune bulle écrite.");
    else if (!travail.modele) {
      bilan.erreurs++;
      deps.log("::warning::Vie du village : le serveur ne donne pas de modèle de Claude lisible, aucune bulle écrite.");
    } else if (lot.length === 0) deps.log("Vie du village : aucun Gaulois n'a besoin d'une nouvelle bulle.");
    else {
      const appel = await demanderLesBulles(travail.modele, lot, deps.cleClaude, deps.fetch);
      bilan.appels = 1;
      const acceptees: { n: string; texte: string; faits: FaitsDuGaulois }[] = [];
      for (const g of lot) {
        if (!appel.phrases.has(g.g)) continue;
        const controle = controlerReplique(appel.phrases.get(g.g), g.faits);
        if (controle.ok) acceptees.push({ n: g.n, texte: controle.texte, faits: g.faits });
        else bilan.ecartees++;
      }
      if (appel.raison) {
        if (appel.avertir) bilan.erreurs++;
        deps.log(`${appel.avertir ? "::warning::" : ""}Vie du village : ${appel.raison}.`);
      }
      // La dépense d'abord, toujours : un refus des phrases ne doit jamais la perdre. Puis les bulles, avec les Gaulois
      // demandés sans en tirer une : un appel compté vaut une demande pour chacun. Sans compte (l'API a refusé avant tout
      // calcul), rien n'est noté et ils seront redemandés au passage suivant.
      if (appel.jetons) {
        await noter({ depense: { appels: 1, entree: appel.jetons.entree, sortie: appel.jetons.sortie, ecartees: bilan.ecartees } }, "les jetons dépensés");
        const servis = new Set(acceptees.map((a) => a.n));
        const sansBulle = lot.filter((g) => !servis.has(g.n)).map((g) => g.n);
        if (await noter({ repliques: acceptees, sans_bulle: sansBulle }, "les bulles")) bilan.envoyees = acceptees.length;
        // Refusé en entier (une phrase que le serveur juge autrement) : tout le lot est noté comme demandé sans bulle, pour
        // que Claude ne soit pas redemandé à chaque passage pour les mêmes Gaulois.
        else if (acceptees.length > 0) await noter({ sans_bulle: lot.map((g) => g.n) }, "les demandes sans bulle");
      }
      deps.log(
        `Vie du village : ${lot.length} bulle(s) demandée(s), ${bilan.envoyees} envoyée(s), ${bilan.ecartees} écartée(s) au contrôle` +
          (appel.jetons ? `, ${appel.jetons.entree} jetons d'entrée et ${appel.jetons.sortie} de sortie.` : "."),
      );
    }
  }
  deps.log(`Vie du village : ${bilan.vocaux} état(s) vocal(aux) relevé(s), dont ${bilan.enVocal} en vocal.`);
  return bilan;
}

/* ---------- La lecture de l'encadrement ---------- */

/**
 * La réponse de `get_vie_du_village()` (migration 20261113002300), pour l'onglet « Village » de la Direction : les bulles,
 * le plafond du mois et ce qui a été dépensé chez Claude. Les sommes sont en dollars, la monnaie de la facture d'Anthropic,
 * calculées par le serveur au prix du modèle qu'il garde. Rien n'y désigne un joueur. Des fonctions pures, sans rien de
 * Node : l'écran peut les importer.
 */
export interface VieDuVillage {
  ok: true;
  /** Les bulles sont-elles permises par l'encadrement ? */
  bulles: boolean;
  /** Le plafond du mois, en dollars. */
  plafond: number;
  /** La dépense du mois a atteint le plafond : plus aucune nouvelle bulle jusqu'au 1er du mois suivant. */
  plafond_atteint: boolean;
  modele: string;
  /** Le prix du modèle, en dollars par million de jetons. */
  prix: { entree: number; sortie: number };
  /** Le 1er du mois en cours, à Paris (« 2026-11-01 »). */
  mois: string;
  depense: DepenseDuMois;
  /** Les douze mois d'avant, du plus récent au plus ancien, quand il y a eu une dépense. */
  historique: DepenseDuMois[];
  /** Les bulles montrées sur la place en ce moment (moins de 12 heures). */
  bulles_affichees: number;
  /** L'heure du dernier relevé vocal sur Discord et de la dernière bulle écrite ; `null` : jamais. */
  dernier_vocal: string | null;
  derniere_bulle: string | null;
}

export interface DepenseDuMois {
  mois: string;
  /** En dollars. */
  cout: number;
  appels: number;
  entree: number;
  sortie: number;
  /** Les bulles écrites et montrées. */
  repliques: number;
  /** Les phrases de Claude écartées par le contrôle du robot avant l'envoi. */
  ecartees: number;
}

const nombreLu = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function lireDepense(v: unknown): DepenseDuMois | null {
  if (!estObjet(v) || typeof v["mois"] !== "string") return null;
  const lus = (["cout", "appels", "entree", "sortie", "repliques", "ecartees"] as const).map((c) => nombreLu(v[c]));
  if (lus.some((n) => n === null || n < 0)) return null;
  const [cout, appels, entree, sortie, repliques, ecartees] = lus as number[];
  return { mois: v["mois"], cout: cout!, appels: appels!, entree: entree!, sortie: sortie!, repliques: repliques!, ecartees: ecartees! };
}

/** La réponse de `get_vie_du_village`, relue ; `null` si elle n'a pas la forme attendue. */
export function lireVieDuVillage(reponse: unknown): VieDuVillage | null {
  if (!estObjet(reponse) || reponse["ok"] !== true) return null;
  const plafond = nombreLu(reponse["plafond"]);
  const prix = estObjet(reponse["prix"]) ? { entree: nombreLu(reponse["prix"]["entree"]), sortie: nombreLu(reponse["prix"]["sortie"]) } : null;
  const depense = lireDepense(reponse["depense"]);
  const affichees = nombreLu(reponse["bulles_affichees"]);
  if (typeof reponse["bulles"] !== "boolean" || plafond === null || typeof reponse["plafond_atteint"] !== "boolean" || typeof reponse["modele"] !== "string") return null;
  if (!prix || prix.entree === null || prix.sortie === null || typeof reponse["mois"] !== "string" || !depense || affichees === null) return null;
  if (!Array.isArray(reponse["historique"])) return null;
  const historique = reponse["historique"].map(lireDepense);
  if (historique.some((d) => d === null)) return null;
  const texte = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    ok: true,
    bulles: reponse["bulles"],
    plafond,
    plafond_atteint: reponse["plafond_atteint"],
    modele: reponse["modele"],
    prix: { entree: prix.entree, sortie: prix.sortie },
    mois: reponse["mois"],
    depense,
    historique: historique as DepenseDuMois[],
    bulles_affichees: affichees,
    dernier_vocal: texte(reponse["dernier_vocal"]),
    derniere_bulle: texte(reponse["derniere_bulle"]),
  };
}

/** Le plafond le plus haut que l'encadrement peut régler, en dollars (le pilote : « +50 € par mois » au plus). */
export const PLAFOND_MAX = 100;

/** Un plafond saisi, tel que le serveur l'accepte : de 0 à `PLAFOND_MAX` dollars, au centime. `null` sinon. */
export function lirePlafond(saisie: string): number | null {
  const propre = saisie.trim().replace(",", ".");
  if (!/^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(propre)) return null;
  const valeur = Number(propre);
  return valeur >= 0 && valeur <= PLAFOND_MAX ? valeur : null;
}

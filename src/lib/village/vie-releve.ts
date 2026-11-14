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
 * 3. Avec la clé ANTHROPIC_API_KEY : un appel à Claude, par le SDK officiel (`@anthropic-ai/sdk`), pour au plus
 *    `GAULOIS_PAR_APPEL` Gaulois qui ont besoin d'une bulle. Claude ne reçoit que des faits sans identité (`faitsEcrits`),
 *    jamais l'état vocal ni l'heure, et écrit trois phrases par Gaulois. Chaque phrase est nettoyée de ce qui n'est que
 *    typographie (`nettoyage`), puis contrôlée (`controlerReplique`) : la première qui passe devient la bulle. Si toutes les
 *    phrases d'un Gaulois sont écartées, une reprise dans le même passage, une seule, redemande trois phrases pour ces
 *    Gaulois-là, avec la raison de chaque écart (`ESSAIS_PAR_PASSAGE`). Le serveur reçoit d'abord les jetons dépensés de
 *    chaque appel, toujours, puis les bulles acceptées, qu'il contrôle encore, avec les numéros des Gaulois demandés sans
 *    bulle : leur demande compte aussi pour les 6 heures.
 *
 * Chaque partie marche sans l'autre. Aucun identifiant n'est écrit au journal de l'Action, qui est public : des nombres, et,
 * pour chaque phrase écartée, la règle en cause et le fragment qui l'a fait écarter (un signe, un mot à majuscule, un
 * nombre), jamais la phrase entière ni un mot de la liste interdite (`ecartEcrit`).
 *
 * Le coût attendu (prix de la skill claude-api, 13 novembre 2026, Claude Haiku 5.5, le plus petit modèle en vigueur :
 * 0,10 $ par million de jetons d'entrée, 0,50 $ par million de jetons de sortie, pour une demande de moins de 100 000 jetons) :
 * - un appel : la consigne et les faits de 12 Gaulois, environ 2 000 jetons d'entrée (0,000 2 $) ; 36 phrases de 30 à 40
 *   jetons, le JSON et la réflexion du modèle à l'effort « low », environ 1 800 jetons de sortie (0,000 9 $) : environ
 *   0,001 $ l'appel ; jamais plus de `MAX_TOKENS` en sortie (0,002 $), soit 0,002 2 $ l'appel au plus. Les trois phrases
 *   triplent la part des phrases dans la sortie, pas le reste ;
 * - en vrai, une demande par Gaulois toutes les 6 heures au plus, et aucune pour qui dort : trois à quatre par jour. Avec
 *   50 Gaulois, 200 bulles par jour au plus, dix-sept appels de 12, quelques reprises et des appels pour une nouvelle
 *   partie, disons 30 appels : 0,03 $ par jour, environ 1 $ par mois (2 $ avec 100 Gaulois) ;
 * - au pire du pire, un appel complet et sa reprise complète à chaque passage, 576 par jour : 576 × 0,002 2 $ = 1,27 $ par
 *   jour ; le plafond du serveur coupe avant (il est relu à chaque passage : au plus deux appels de trop, moins d'un
 *   centime).
 * Le plafond de départ du serveur est de 10 $ par mois, réglable dans la Direction.
 */
import Anthropic from "@anthropic-ai/sdk";
import { DISCORD_API } from "../arrivees-discord";
import type { RpcResult } from "../compte/roster";
import { isSnowflake } from "../discord-commande";
import { EMPLACEMENTS_OBJETS, OBJETS, lireTenue, type Tenue } from "../gaulois";
import {
  CHAMPS_DES_PHRASES,
  CONSIGNE,
  CONSIGNE_DE_REPRISE,
  LIEUX_ECRITS,
  MAJUSCULES_PERMISES,
  MAX_REPLIQUES_PAR_PASSAGE,
  MAX_SIGNES,
  MOMENTS_ECRITS,
  MOTS_INTERDITS,
  PHRASES_PAR_GAULOIS,
  SCHEMA_REPONSE,
  type LieuDUneBulle,
} from "./consigne-repliques";
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
  /**
   * L'heure de Paris, comme l'écrit l'écran : « 21 h 05 », « 7 h 40 ». Gardée avec la bulle, comme le serveur l'exige
   * (`internal.village_vie_faits_valides`), mais plus donnée à Claude depuis le 14 novembre 2026 (`faitsEcrits`).
   */
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
 * Les Gaulois d'un appel à Claude, au plus : avec trois phrases chacun, la réponse tient dans `MAX_TOKENS` avec de la marge
 * pour la réflexion du modèle (12 × 3 phrases d'au plus 90 signes, environ 1 500 jetons). Une réponse coupée ne donnerait
 * aucune bulle à tout le lot. Les suivants passent au passage d'après, 5 minutes plus tard. Jamais plus que ce que le
 * serveur accepte dans un envoi (`MAX_REPLIQUES_PAR_PASSAGE`).
 */
export const GAULOIS_PAR_APPEL = 12;

/**
 * Les Gaulois de l'appel : ceux pour qui le serveur demande une bulle, ceux qui n'ont jamais eu de demande d'abord, puis les
 * plus anciennes demandes, `GAULOIS_PAR_APPEL` au plus. Leur étiquette ne dit rien d'eux : g1, g2…
 * Un Gaulois qui dort dans les maisons n'en reçoit pas : l'écran ne montre jamais la bulle de qui dort, ce serait une
 * dépense pour rien. Il en aura une au matin, ses faits ayant changé.
 */
export function choisirLeLot(gaulois: readonly GauloisAuTravail[], maintenant: Date, max = Math.min(GAULOIS_PAR_APPEL, MAX_REPLIQUES_PAR_PASSAGE)): GauloisDuLot[] {
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
/**
 * La sortie la plus longue d'un appel, réflexion du modèle comprise : 12 Gaulois à trois phrases en prennent environ 1 500,
 * le JSON compris (une phrase de 90 signes fait 30 à 40 jetons).
 */
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

/**
 * Les appels à Claude d'un passage, au plus : le premier, puis une reprise pour les Gaulois dont toutes les phrases ont été
 * écartées par le contrôle, avec la raison de chaque écart. Une phrase écartée ne coûte plus six heures sans bulle. Rien
 * n'est gardé d'un passage à l'autre : après la reprise, un Gaulois resté sans bulle est noté demandé sans bulle, et le
 * serveur ne le redemande pas avant 6 heures.
 */
export const ESSAIS_PAR_PASSAGE = 2;
/**
 * La reprise ne part que si elle peut finir avant tant, depuis le début du passage, avec au moins `DELAI_REPRISE_MIN_MS`
 * de délai : l'étape du workflow a 2 minutes en tout, démarrage de `tsx` et derniers envois au serveur compris.
 */
export const FIN_DES_APPELS_MS = 95_000;
export const DELAI_REPRISE_MIN_MS = 15_000;

/** Un nom du catalogue tel que Claude le lit : sans sa majuscule, qu'il recopiait au milieu d'une phrase. */
export const enMinuscules = (nom: string): string => nom.charAt(0).toLocaleLowerCase("fr-FR") + nom.slice(1);

/**
 * Les faits d'un Gaulois, tels que Claude les lit : des mots, sans code ni identifiant, sans l'heure (une bulle reste à
 * l'écran des heures après), les objets sans majuscule. `ecarts` : à une reprise, pourquoi ses phrases ont été écartées.
 */
export function faitsEcrits(gaulois: GauloisDuLot, ecarts?: readonly string[]): Record<string, unknown> {
  const { faits } = gaulois;
  return {
    g: gaulois.g,
    moment: MOMENTS_ECRITS[faits.moment],
    ou: LIEUX_ECRITS[faits.lieu],
    ...(faits.points === null ? {} : { points_rapportes_au_clan_par_sa_derniere_partie: faits.points }),
    porte: faits.objets.map(enMinuscules),
    ...(ecarts && ecarts.length > 0 ? { phrases_ecartees_parce_que: ecarts } : {}),
  };
}

/**
 * Le corps de la demande à l'API Messages : la consigne, les faits, la forme imposée de la réponse (sortie structurée,
 * `output_config.format`), l'effort le plus bas. Ni `temperature` (refusée par cette version de l'API), ni `thinking` (le
 * modèle choisit), ni `fallbacks` (le plus petit modèle n'en a pas), ni flux : la réponse est courte. `ecarts` : pour une
 * reprise, les raisons des phrases écartées de chaque Gaulois, par étiquette.
 */
export function corpsDeLaDemande(modele: string, lot: readonly GauloisDuLot[], ecarts?: ReadonlyMap<string, readonly string[]>): Anthropic.MessageCreateParamsNonStreaming {
  const faits = JSON.stringify(lot.map((g) => faitsEcrits(g, ecarts?.get(g.g))));
  return {
    model: modele,
    max_tokens: MAX_TOKENS,
    system: CONSIGNE,
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA_REPONSE } },
    messages: [{ role: "user", content: `${ecarts ? `${CONSIGNE_DE_REPRISE}\n\n` : ""}Les faits de chaque Gaulois, en JSON :\n${faits}` }],
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
 * Les phrases de la réponse de Claude, par étiquette : ses trois phrases, dans l'ordre (`CHAMPS_DES_PHRASES`), telles
 * qu'elles sont lues (une phrase manquante reste `undefined`, que le contrôle écarte). Une étiquette inconnue ou répétée est
 * sautée. `raison` : pourquoi il n'y en a aucune (refus du modèle, réponse coupée, JSON illisible). La raison de l'arrêt
 * (`stop_reason`) se lit avant le contenu : un refus ou une réponse coupée ne donnent aucune phrase, quoi que contienne le
 * texte.
 */
export function phrasesDeLaReponse(reponse: unknown, etiquettes: ReadonlySet<string>): { phrases: Map<string, unknown[]>; raison: string | null } {
  const phrases = new Map<string, unknown[]>();
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
    phrases.set(r["g"], CHAMPS_DES_PHRASES.slice(0, PHRASES_PAR_GAULOIS).map((champ) => r[champ]));
  }
  return { phrases, raison: null };
}

export interface AppelClaude {
  /** Les jetons à compter ; `null` : rien n'a été facturé (refus de l'API avant tout calcul, réseau). */
  jetons: Jetons | null;
  /** Les phrases de chaque Gaulois, par étiquette (`phrasesDeLaReponse`). */
  phrases: Map<string, unknown[]>;
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
 * `ecarts` : pour une reprise, les raisons des phrases écartées de chaque Gaulois (`corpsDeLaDemande`) ; `delaiMs` : un délai
 * plus court que `DELAI_CLAUDE_MS`, pour qu'une reprise tienne dans le temps du passage.
 */
export async function demanderLesBulles(
  modele: string,
  lot: readonly GauloisDuLot[],
  cle: string,
  send: typeof fetch,
  options: { ecarts?: ReadonlyMap<string, readonly string[]>; delaiMs?: number } = {},
): Promise<AppelClaude> {
  const corps = corpsDeLaDemande(modele, lot, options.ecarts);
  // Le compte le plus haut possible, quand l'API a pu calculer sans dire combien : le plafond tient toujours.
  const auPlusHaut: Jetons = { entree: JSON.stringify(corps).length, sortie: MAX_TOKENS };
  const delai = Math.min(DELAI_CLAUDE_MS, options.delaiMs ?? DELAI_CLAUDE_MS);
  const client = new Anthropic({ apiKey: cle, baseURL: ANTHROPIC_BASE_URL, fetch: send, maxRetries: REPRISES_CLAUDE, timeout: delai });
  let reponse: Anthropic.Message;
  try {
    reponse = await client.messages.create(corps);
  } catch (e) {
    const rien = new Map<string, unknown[]>();
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

const MINUSCULE = "a-zàâäéèêëîïôöùûüÿçœæ";

/**
 * Le texte où les majuscules permises sont retirées, comme le fait le serveur (`internal.village_vie_replique_valide`) : les
 * mots permis (`MAJUSCULES_PERMISES`), entiers, puis la première lettre de la bulle et de chaque phrase (après « . », « ! »,
 * « ? » ou « … » et une espace), un guillemet « ouvrant permis devant, deviennent « _ ».
 */
function resteDesMajuscules(texte: string): string {
  let reste = texte;
  for (const mot of MAJUSCULES_PERMISES) reste = reste.replace(new RegExp(`(?<![${LETTRES}])${mot}(?![${LETTRES}])`, "g"), "_");
  return reste.replace(new RegExp(`^((?:« )?)[${MAJUSCULE}]`), "$1_").replace(new RegExp(`([.!?…] (?:« )?)[${MAJUSCULE}]`, "g"), "$1_");
}

/**
 * Une majuscule hors de sa place : ni au début de la bulle, ni au début d'une phrase, ni dans un mot permis. Le même calcul
 * que le serveur : une fois les majuscules permises retirées (`resteDesMajuscules`), il ne doit plus en rester.
 */
export function majusculeHorsPlace(texte: string): boolean {
  return new RegExp(`[${MAJUSCULE}]`).test(resteDesMajuscules(texte));
}

/** Les mots qui portent une majuscule hors de sa place, pour le journal. */
const motsHorsPlace = (texte: string): string[] => resteDesMajuscules(texte).match(new RegExp(`[${LETTRES}]*[${MAJUSCULE}][${LETTRES}]*`, "g")) ?? [];

/* ---------- Le nettoyage d'une phrase ---------- */

// Les signes à retoucher, écrits par leur code : tapés, la plupart ne se verraient pas à la relecture.
const signes = (...codes: number[]): string => String.fromCodePoint(...codes);
/** Des signes écrits pour une classe d'expression régulière. */
const classe = (s: string): string => `[${s.replace(/[\\\]^-]/g, "\\$&")}]`;
/** Le tiret long et ses cousins : une incise, jamais un trait d'union. */
const TIRETS_LONGS = signes(0x2014, 0x2015, 0x2e3a, 0x2e3b, 0xfe58);
/** Le tiret moyen et ses cousins : un trait d'union entre deux mots collés (« rendez–vous »), une incise sinon. */
const TIRETS_MOYENS = signes(0x2012, 0x2013, 0xfe63, 0xff0d);
const TIRETS = TIRETS_LONGS + TIRETS_MOYENS;
/** Les traits d'union qui ne sont pas le signe « - » : trait d'union de Unicode, insécable, signe moins. */
const TRAITS_D_UNION = signes(0x2010, 0x2011, 0x2212);
/** Les guillemets doubles hors des guillemets français : droits, anglais, allemands, secondes, pleine chasse. */
const GUILLEMETS_DOUBLES = signes(0x22, 0x201c, 0x201d, 0x201e, 0x201f, 0x2033, 0xff02);
/** Les apostrophes qui ne sont ni « ' » ni « ’ » : guillemets simples, prime, accents grave et aigu seuls, lettres modificatives. */
const APOSTROPHES = signes(0x2018, 0x201a, 0x201b, 0x2032, 0x60, 0xb4, 0x2bb, 0x2bc);
const SANS_LARGEUR = signes(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff);
/** Les espaces insécables, fines et autres larges : une espace simple (le serveur n'accepte qu'elle). */
const ESPACES = signes(0xa0, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000);
/**
 * Les émojis : tout pictogramme (`Extended_Pictographic` de Unicode), et ce qui les accompagne (sélecteurs de variante,
 * touche, teintes de peau, drapeaux, étiquettes).
 */
const EMOJIS = new RegExp(
  `[\\p{Extended_Pictographic}${signes(0xfe0e, 0xfe0f, 0x20e3)}${signes(0x1f3fb)}-${signes(0x1f3ff)}${signes(0x1f1e6)}-${signes(0x1f1ff)}${signes(0xe0020)}-${signes(0xe007f)}]`,
  "gu",
);
const MOT = new RegExp(`[${LETTRES}]+`, "g");
const MOT_A_MAJUSCULE = new RegExp(`(?<![${LETTRES}])[${MAJUSCULE}][${MINUSCULE}]*(?![${LETTRES}])`, "g");

/** Ce que le nettoyage a retouché, pour le journal de l'Action. */
export type Retouche =
  | "accents"
  | "espace sans largeur"
  | "émoji"
  | "espace insécable"
  | "guillemets"
  | "apostrophe"
  | "trait d'union"
  | "tiret long"
  | "points de suspension"
  | "espace avant la ponctuation"
  | "majuscule d'un mot des faits";

/** Les mots que Claude lit sur les points d'une partie (`faitsEcrits`), en plus de ceux de l'endroit et des objets. */
const MOTS_DES_POINTS = ["clan", "point", "points", "partie"];

/**
 * Les mots que Claude a lus dans les faits d'un Gaulois : ceux des objets qu'il porte, de l'endroit et du moment de la
 * journée (`faitsEcrits`), en minuscules. Des mots du catalogue et du site, jamais un nom de personne : en retirer la
 * majuscule ne laisse passer aucun nom propre que Claude inventerait.
 */
function motsDesFaits(faits: FaitsDuGaulois): Set<string> {
  const mots = new Set<string>(MOTS_DES_POINTS);
  const ajouter = (texte: string, min: number) => {
    for (const mot of texte.toLocaleLowerCase("fr-FR").match(MOT) ?? []) if ([...mot].length >= min) mots.add(mot);
  };
  for (const nom of faits.objets) ajouter(nom, 2);
  ajouter(LIEUX_ECRITS[faits.lieu], 4);
  ajouter(MOMENTS_ECRITS[faits.moment], 4);
  return mots;
}

/**
 * Le nettoyage d'une phrase de Claude avant son contrôle : tout ce qui n'est que typographie, et rien d'autre. Le texte
 * nettoyé est celui que la place montre et que le serveur contrôle encore. Dans l'ordre :
 * - les accents décomposés recomposés (forme NFC), les espaces sans largeur et les émojis retirés ;
 * - les espaces insécables, fines ou larges changées en espaces simples, une seule entre deux mots ;
 * - les guillemets doubles qui entourent la phrase retirés ; ceux du dedans changés en « » s'ils vont par paires, retirés
 *   sinon ; une espace après « et avant » ;
 * - les apostrophes changées en « ’ », les traits d'union de Unicode en « - » ;
 * - un tiret moyen entre deux mots collés en « - » ; un tiret au début ou à la fin retiré ; tout autre tiret long ou moyen
 *   changé en virgule ;
 * - trois points ou plus en « … », pas d'espace avant « , », « . » et « … » ;
 * - avec les faits : la majuscule d'un mot que Claude a lu dans les faits (« Tunique », « Place ») retirée au milieu d'une
 *   phrase. Une majuscule en début de phrase reste, et aucune autre n'est touchée : un nom propre reste écarté.
 * Ni un mot, ni un nombre, ni un autre signe ne change : un signe hors de la liste reste, et la phrase est écartée.
 */
export function nettoyage(brut: string, faits?: FaitsDuGaulois): { texte: string; retouches: Retouche[] } {
  const retouches: Retouche[] = [];
  const retoucher = (avant: string, apres: string, quoi: Retouche): string => {
    if (apres !== avant && !retouches.includes(quoi)) retouches.push(quoi);
    return apres;
  };
  let t = retoucher(brut, brut.normalize("NFC"), "accents");
  t = retoucher(t, t.replace(new RegExp(classe(SANS_LARGEUR), "g"), ""), "espace sans largeur");
  t = retoucher(t, t.replace(EMOJIS, " "), "émoji");
  t = retoucher(t, t.replace(new RegExp(classe(ESPACES), "g"), " "), "espace insécable");
  t = t.replace(/\s+/g, " ").trim();
  // Les guillemets doubles : autour de la phrase, retirés ; dedans, en guillemets français s'ils vont par paires.
  const guillemets = new RegExp(classe(GUILLEMETS_DOUBLES), "g");
  t = retoucher(t, t.replace(new RegExp(`^${classe(GUILLEMETS_DOUBLES)}+|${classe(GUILLEMETS_DOUBLES)}+$`, "g"), "").trim(), "guillemets");
  const dedans = (t.match(guillemets) ?? []).length;
  if (dedans > 0) {
    let ouvert = false;
    t = retoucher(t, dedans % 2 === 0 ? t.replace(guillemets, () => ((ouvert = !ouvert) ? "« " : " »")) : t.replace(guillemets, " "), "guillemets");
  }
  t = retoucher(t, t.replace(new RegExp(signes(0x2039), "g"), "«").replace(new RegExp(signes(0x203a), "g"), "»"), "guillemets");
  t = retoucher(t, t.replace(new RegExp(classe(APOSTROPHES), "g"), signes(0x2019)), "apostrophe");
  t = retoucher(t, t.replace(new RegExp(classe(TRAITS_D_UNION), "g"), "-"), "trait d'union");
  // Les tirets : un tiret moyen entre deux mots collés est un trait d'union ; tout autre tiret, une incise : une virgule.
  const avantTirets = t;
  t = t.replace(new RegExp(`(?<=[\\p{L}\\p{N}])${classe(TIRETS_MOYENS)}(?=[\\p{L}\\p{N}])`, "gu"), "-");
  t = t.replace(new RegExp(`^\\s*${classe(TIRETS)}+\\s*`, "u"), "").replace(new RegExp(`\\s*${classe(TIRETS)}+\\s*$`, "u"), "");
  t = t.replace(new RegExp(`\\s*${classe(TIRETS)}+\\s*`, "gu"), ", ");
  if (t !== avantTirets) {
    retouches.push("tiret long");
    // Une virgule ainsi posée contre une autre ponctuation : une seule ponctuation reste.
    t = t.replace(/,(?:\s*,)+/g, ",").replace(/([.!?…;:]) ?, /g, "$1 ").replace(/, (?=[!?;:»)])/g, " ").replace(/, ?(?=[.…])/g, "");
    t = t.replace(/« ?, /g, "« ").replace(/\( ?, /g, "(");
  }
  t = retoucher(t, t.replace(/(?:\. ){2,}\./g, "…").replace(/\.{3,}/g, "…"), "points de suspension");
  t = retoucher(t, t.replace(/ +(?=[,.…])/g, ""), "espace avant la ponctuation");
  t = t.replace(/\s+/g, " ").trim();
  t = retoucher(t, t.replace(/«(?! )/g, "« ").replace(/(?<! )»/g, " »"), "guillemets").trim();
  if (faits) {
    const connus = motsDesFaits(faits);
    t = retoucher(
      t,
      t.replace(MOT_A_MAJUSCULE, (mot: string, index: number, tout: string) => {
        const avant = tout.slice(0, index);
        // Un début de bulle ou de phrase garde sa majuscule, comme le serveur la permet.
        if (/^(?:« )?$/.test(avant) || /[.!?…] (?:« )?$/.test(avant)) return mot;
        const bas = mot.toLocaleLowerCase("fr-FR");
        return connus.has(bas) ? bas : mot;
      }),
      "majuscule d'un mot des faits",
    );
  }
  return { texte: t, retouches };
}

/** La phrase nettoyée (`nettoyage`) : la forme qu'elle a sur la place. */
export function nettoyerPhrase(texte: string, faits?: FaitsDuGaulois): string {
  return nettoyage(texte, faits).texte;
}

/* ---------- Le contrôle ---------- */

/** Les règles du contrôle, dans l'ordre où le journal les dit. */
export type RegleEcartee =
  | "pas une phrase"
  | "vide"
  | "trop longue"
  | "signe refusé"
  | "mot interdit"
  | "majuscules"
  | "adresse"
  | "chiffre absent des faits"
  | "majuscule hors d'un début de phrase";

/**
 * Une règle que la phrase ne respecte pas, et le fragment en cause : les signes refusés, le nombre absent des faits, le mot à
 * majuscule. `null` : rien à montrer (un mot interdit ne se répète jamais, même au journal).
 */
export interface Ecart {
  raison: RegleEcartee;
  detail: string | null;
}

/** Les fragments d'une phrase se disent au journal, qui est public, à ces conditions : courts, et sans mot interdit. */
const FRAGMENT_MAX = 24;
const FRAGMENTS_MAX = 4;
const sansMotInterdit = (fragment: string): boolean => !MOTS_INTERDITS.some((m) => normaliserPourLesMots(fragment).includes(m));

/** Des fragments, chacun entre guillemets, sans doublon ; `null` s'il n'en reste aucun à montrer. */
function fragments(liste: readonly string[]): string | null {
  const montres = [...new Set(liste)].filter(sansMotInterdit).slice(0, FRAGMENTS_MAX).map((f) => `« ${[...f].slice(0, FRAGMENT_MAX).join("")} »`);
  return montres.length > 0 ? montres.join(", ") : null;
}

/** Un signe refusé, par son code (U+2014), et lui-même s'il se voit : un signe de contrôle ne s'écrit jamais au journal. */
function signeEcrit(signe: string): string {
  const code = `U+${signe.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
  return /[\p{C}\p{Z}\p{M}]/u.test(signe) ? code : `« ${signe} » (${code})`;
}

/** Un signe de la liste permise, un à la fois. */
const UN_SIGNE_PERMIS = new RegExp(`^${SIGNES_PERMIS.source.slice(1, -2)}$`);

/**
 * Toutes les règles qu'une phrase nettoyée ne respecte pas, avec le fragment en cause : 1 à 90 signes ; seulement les signes
 * permis (donc ni « @ », ni « # », ni balise, ni lien, ni émoji) ; aucun mot interdit ; pas deux majuscules d'affilée ; pas
 * de point collé entre deux mots (une adresse) ; aucun nombre absent des faits ; aucune majuscule hors d'un début de phrase.
 * Les mêmes règles que le serveur (`internal.village_vie_replique_valide`), avec une différence : le robot ne permet que les
 * nombres des points, le serveur aussi ceux de l'heure, que Claude ne reçoit plus (`faitsEcrits`). Un nombre de l'heure
 * serait donc inventé ; le robot, plus strict, l'écarte. Une phrase qu'il accepte, le serveur l'accepte.
 */
export function ecartsDeLaPhrase(texte: string, faits: FaitsDuGaulois): Ecart[] {
  const longueur = [...texte].length;
  if (longueur < 1) return [{ raison: "vide", detail: null }];
  const ecarts: Ecart[] = [];
  if (longueur > MAX_SIGNES) ecarts.push({ raison: "trop longue", detail: `${longueur} signes sur ${MAX_SIGNES}` });
  if (!SIGNES_PERMIS.test(texte)) {
    const refuses = [...new Set([...texte].filter((s) => !UN_SIGNE_PERMIS.test(s)))];
    ecarts.push({ raison: "signe refusé", detail: refuses.slice(0, FRAGMENTS_MAX).map(signeEcrit).join(", ") });
  }
  if (MOTS_INTERDITS.some((m) => normaliserPourLesMots(texte).includes(m))) ecarts.push({ raison: "mot interdit", detail: null });
  const capitales = texte.match(/[A-Z]{2,}/g);
  if (capitales) ecarts.push({ raison: "majuscules", detail: fragments(capitales) });
  const adresses = texte.match(/[A-Za-z0-9]\.[A-Za-z]/g);
  if (adresses) ecarts.push({ raison: "adresse", detail: fragments(adresses) });
  const permis = nombresDe(faits.points ?? "");
  const inventes = (texte.match(NOMBRE) ?? []).filter((n) => !permis.includes(nombreExact(n)));
  if (inventes.length > 0) ecarts.push({ raison: "chiffre absent des faits", detail: fragments(inventes) });
  if (majusculeHorsPlace(texte)) ecarts.push({ raison: "majuscule hors d'un début de phrase", detail: fragments(motsHorsPlace(texte)) });
  return ecarts;
}

export type Controle =
  | { ok: true; texte: string; retouches: Retouche[] }
  | { ok: false; raison: RegleEcartee; ecarts: Ecart[]; retouches: Retouche[] };

/**
 * Le contrôle d'une phrase de Claude avant de l'envoyer au serveur, qui refait le sien : la phrase nettoyée (`nettoyage`),
 * puis toutes les règles (`ecartsDeLaPhrase`). `raison` : la première règle en cause ; `ecarts` : toutes, pour le journal.
 * Le texte d'une phrase acceptée est le texte nettoyé : c'est lui que le serveur reçoit.
 */
export function controlerReplique(brut: unknown, faits: FaitsDuGaulois): Controle {
  if (typeof brut !== "string") return { ok: false, raison: "pas une phrase", ecarts: [{ raison: "pas une phrase", detail: null }], retouches: [] };
  const { texte, retouches } = nettoyage(brut, faits);
  const ecarts = ecartsDeLaPhrase(texte, faits);
  return ecarts.length > 0 ? { ok: false, raison: ecarts[0]!.raison, ecarts, retouches } : { ok: true, texte, retouches };
}

/** Ce qu'un écart devient, au journal et dans la reprise : la règle, puis le fragment en cause. */
export const ecartEcrit = (e: Ecart): string => (e.detail === null ? e.raison : `${e.raison} : ${e.detail}`);

/** Le choix parmi les phrases d'un Gaulois : la première qui passe, et pourquoi les précédentes ont été écartées. */
export interface ChoixDUnePhrase {
  texte: string | null;
  /** Les phrases écartées avant elle, par leur rang (1 à 3). */
  ecartees: { rang: number; ecarts: Ecart[] }[];
  retouches: Retouche[];
}

/** La première des phrases d'un Gaulois qui passe le contrôle ; les suivantes ne sont pas lues. */
export function choisirPhrase(phrases: readonly unknown[], faits: FaitsDuGaulois): ChoixDUnePhrase {
  const ecartees: ChoixDUnePhrase["ecartees"] = [];
  const retouches: Retouche[] = [];
  for (const [i, phrase] of phrases.entries()) {
    const controle = controlerReplique(phrase, faits);
    retouches.push(...controle.retouches);
    if (controle.ok) return { texte: controle.texte, ecartees, retouches };
    ecartees.push({ rang: i + 1, ecarts: controle.ecarts });
  }
  return { texte: null, ecartees, retouches };
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
  /** Les appels à Claude du passage : le premier, et sa reprise s'il y en a eu une. */
  appels: number;
  envoyees: number;
  /**
   * Les Gaulois du lot restés sans bulle parce que toutes leurs phrases ont été écartées par le contrôle, reprise comprise :
   * ce que le serveur reçoit sous `ecartees` et que la Direction montre (« phrases écartées »). Pas les phrases une à une.
   */
  ecartees: number;
  /** Les phrases écartées une à une, sur les trois de chaque Gaulois et celles de la reprise : pour le journal. */
  phrasesEcartees: number;
  /** Les refus du serveur ou les pannes à signaler : le script sort alors en erreur, sans rien bloquer. */
  erreurs: number;
}

/**
 * Un passage. Lève une erreur si la liste de travail ne se lit pas (migration pas collée, clé refusée) : rien d'autre n'est
 * alors fait. Ensuite, chaque partie continue sans l'autre : un refus du serveur pour les états vocaux n'empêche pas les
 * bulles.
 */
export async function vieDuVillage(deps: VieDeps): Promise<BilanDeLaVie> {
  const horloge = deps.horloge ?? Date.now;
  const debut = horloge();
  const bilan: BilanDeLaVie = { vocaux: 0, enVocal: 0, appels: 0, envoyees: 0, ecartees: 0, phrasesEcartees: 0, erreurs: 0 };
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
    const resultat = await releverLesVocaux(travail.gaulois, { ...deps.discord, fetch: deps.fetch, sleep: deps.sleep, horloge }, deps.limites);
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
      const acceptees: { n: string; texte: string; faits: FaitsDuGaulois }[] = [];
      const servis = new Set<string>();
      /** Les Gaulois dont toutes les phrases d'un appel ont été écartées par le contrôle. */
      const auControle = new Set<string>();
      /** Pour la reprise : pourquoi les phrases de chaque Gaulois ont été écartées, par étiquette. */
      const ecarts = new Map<string, string[]>();
      const retouches = new Map<Retouche, number>();
      const depense: Jetons = { entree: 0, sortie: 0 };
      let compte = false;
      let restants: readonly GauloisDuLot[] = lot;
      let options: Parameters<typeof demanderLesBulles>[4] = {};
      for (let essai = 1; essai <= ESSAIS_PAR_PASSAGE; essai++) {
        const appel = await demanderLesBulles(travail.modele, restants, deps.cleClaude, deps.fetch, options);
        bilan.appels++;
        if (appel.raison) {
          if (appel.avertir) bilan.erreurs++;
          deps.log(`${appel.avertir ? "::warning::" : ""}Vie du village : ${appel.raison}${essai > 1 ? " (reprise)" : ""}.`);
        }
        // Chaque Gaulois : la première de ses phrases qui passe le contrôle ; pour chaque phrase écartée, une ligne au
        // journal, la règle et le fragment en cause, jamais la phrase entière.
        const sansPhrase: GauloisDuLot[] = [];
        for (const g of restants) {
          const phrases = appel.phrases.get(g.g);
          if (!phrases) {
            sansPhrase.push(g);
            continue;
          }
          const choix = choisirPhrase(phrases, g.faits);
          for (const r of choix.retouches) retouches.set(r, (retouches.get(r) ?? 0) + 1);
          for (const e of choix.ecartees) {
            bilan.phrasesEcartees++;
            deps.log(`Vie du village : ${g.g}, phrase ${e.rang} sur ${phrases.length} écartée${essai > 1 ? " à la reprise" : ""} : ${e.ecarts.map(ecartEcrit).join(" ; ")}.`);
          }
          if (choix.texte !== null) {
            acceptees.push({ n: g.n, texte: choix.texte, faits: g.faits });
            servis.add(g.n);
          } else {
            auControle.add(g.n);
            ecarts.set(g.g, [...new Set(choix.ecartees.flatMap((e) => e.ecarts.map(ecartEcrit)))]);
            sansPhrase.push(g);
          }
        }
        if (appel.jetons) {
          compte = true;
          depense.entree += appel.jetons.entree;
          depense.sortie += appel.jetons.sortie;
        }
        // Une reprise, une seule, pour les Gaulois restés sans bulle d'un appel qui a répondu comme prévu, si elle tient dans
        // le temps du passage. Pas après un refus du modèle, une réponse coupée ou un JSON illisible : la même demande
        // donnerait la même chose.
        const delai = Math.min(DELAI_CLAUDE_MS, FIN_DES_APPELS_MS - (horloge() - debut));
        const aReprendre = appel.jetons !== null && appel.raison === null ? sansPhrase : [];
        const reprise = essai < ESSAIS_PAR_PASSAGE && aReprendre.length > 0 && delai >= DELAI_REPRISE_MIN_MS;
        if (essai < ESSAIS_PAR_PASSAGE && aReprendre.length > 0 && !reprise) deps.log("Vie du village : plus le temps d'une reprise dans ce passage.");
        // La dépense d'abord, toujours : un refus des phrases ne doit jamais la perdre. Les Gaulois restés sans bulle au
        // contrôle sont comptés avec la dépense du dernier appel ; si ce dernier appel n'a rien coûté (l'API a refusé la
        // reprise avant tout calcul), ils le sont seuls.
        const ecartees = reprise ? 0 : [...auControle].filter((n) => !servis.has(n)).length;
        if (appel.jetons) await noter({ depense: { appels: 1, entree: appel.jetons.entree, sortie: appel.jetons.sortie, ecartees } }, "les jetons dépensés");
        else if (ecartees > 0) await noter({ depense: { appels: 0, entree: 0, sortie: 0, ecartees } }, "les phrases écartées");
        bilan.ecartees = ecartees;
        if (!reprise) break;
        restants = aReprendre;
        options = { ecarts, delaiMs: delai };
      }
      if (retouches.size > 0) deps.log(`Vie du village : retouches avant le contrôle : ${[...retouches].map(([r, n]) => `${r} ×${n}`).join(", ")}.`);
      // Puis les bulles, avec les Gaulois demandés sans en tirer une : un appel compté vaut une demande pour chacun, et le
      // serveur ne les redemande pas avant 6 heures. Sans aucun appel compté (l'API a refusé avant tout calcul), rien n'est
      // noté et ils seront redemandés au passage suivant.
      if (compte) {
        const sansBulle = lot.filter((g) => !servis.has(g.n)).map((g) => g.n);
        if (await noter({ repliques: acceptees, sans_bulle: sansBulle }, "les bulles")) bilan.envoyees = acceptees.length;
        // Refusé en entier (une phrase que le serveur juge autrement) : tout le lot est noté comme demandé sans bulle, pour
        // que Claude ne soit pas redemandé à chaque passage pour les mêmes Gaulois.
        else if (acceptees.length > 0) await noter({ sans_bulle: lot.map((g) => g.n) }, "les demandes sans bulle");
      }
      deps.log(
        `Vie du village : ${lot.length} bulle(s) demandée(s), ${bilan.envoyees} envoyée(s), ${bilan.ecartees} Gaulois sans bulle après le contrôle` +
          ` (${bilan.phrasesEcartees} phrase(s) écartée(s)), ${bilan.appels} appel(s) à Claude` +
          (compte ? `, ${depense.entree} jetons d'entrée et ${depense.sortie} de sortie.` : "."),
      );
    }
  }
  deps.log(`Vie du village : ${bilan.vocaux} état(s) vocal(aux) relevé(s), dont ${bilan.enVocal} en vocal.`);
  return bilan;
}

/* ---------- La lecture de l'encadrement ---------- */

// Dans `vie-encadrement.ts`, sans le SDK d'Anthropic : l'écran de la Direction l'importe de là. Redonnée ici pour les essais
// du robot qui lisent tout au même endroit.
export { PLAFOND_MAX, lirePlafond, lireVieDuVillage, type DepenseDuMois, type VieDuVillage } from "./vie-encadrement";

/**
 * Les Gaulois du village sur les images du robot (demande du pilote, 14 novembre 2026) : un petit Gaulois au-dessus du nom
 * de chaque membre qui a créé le sien, sur les images que le robot poste sur Discord et sur les fiches.
 *
 * Contrat commun entre le dessin (les fichiers `src/lib/*-image.ts`) et la lecture au serveur (ce fichier) :
 * - une image reçoit un `GauloisParJoueur`, rangé par identifiant public (`publicID`) ; le dessin ne lit jamais le serveur ;
 * - n'y figurent que les membres au pseudo public de la liste du clan, validés, qui ont enregistré leur Gaulois : c'est le
 *   serveur qui en décide (migration `20261114000400_gaulois_sur_les_images.sql`), jamais le dessin ;
 * - la carte n'est gardée qu'en mémoire, le temps d'un envoi ou d'une construction : jamais écrite dans `data/`, `dist/`
 *   ni dans le dépôt ;
 * - sans réglage, sans réponse du serveur ou sans la migration, la carte est vide et les images se dessinent comme avant.
 *
 * La lecture : le robot n'envoie que l'empreinte (SHA-256) de chaque identifiant, comme la liste du clan gardée par le
 * serveur (`internal.hash_public_id`), jamais l'identifiant lui-même, et chaque tenue reçue passe par `lireTenue` : une
 * tenue que le dessin ne connaît pas est ignorée, sans erreur. Aucun message ne contient d'identifiant, d'empreinte ni de clé.
 *
 * Les fiches se dessinent à la construction du site, qui n'a pas la clé de service : une étape d'avant, dans la GitHub
 * Action, lit les Gaulois (`scripts/lire-gaulois-fiches.ts`) et les range dans `.cache/gaulois-fiches.json`, hors de Git
 * et de `dist/`, par empreinte et non par identifiant ; la construction les relit par `gauloisDuCache`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { lireTenue, type Tenue } from "./gaulois";

/** Les tenues à dessiner, par identifiant public d'un membre au pseudo public. */
export type GauloisParJoueur = ReadonlyMap<string, Tenue>;

/** Aucun Gaulois : l'image se dessine comme avant. */
export const AUCUN_GAULOIS: GauloisParJoueur = new Map();

/** L'empreinte d'un identifiant public : SHA-256 en hexadécimal minuscule, comme `internal.hash_public_id` du serveur. */
export const empreinte = (publicId: string): string => createHash("sha256").update(publicId, "utf8").digest("hex");

/** Au-delà, le serveur est tenu pour absent et les images partent sans Gaulois : le même délai que les liens des salons (`DIRECTION_TIMEOUT_MS`). */
export const GAULOIS_TIMEOUT_MS = 10_000;

/** Empreintes par appel : la limite de `gaulois_des_joueurs` au serveur. Une liste plus longue part en plusieurs appels. */
export const GAULOIS_LOT = 500;

/** Appelle `gaulois_des_joueurs` avec la clé de service et rend sa réponse. Lève une erreur si le serveur refuse ou ne répond pas. */
export type GauloisCall = (url: string, key: string, empreintes: readonly string[]) => Promise<unknown>;

/**
 * Ce que la lecture a donné :
 * - `lu` : le serveur a répondu ;
 * - `sans-reglage` : pas de `SUPABASE_URL` ou de clé de service, rien n'a été demandé (une construction sur un poste) ;
 * - `fonction-absente` : la migration n'est pas encore collée dans Supabase ;
 * - `panne` : refus, délai dépassé ou réponse illisible.
 */
export type EtatDeLecture = "lu" | "sans-reglage" | "fonction-absente" | "panne";

export interface LectureDesGaulois {
  gaulois: GauloisParJoueur;
  /** Pourquoi la carte est vide ou incomplète, en clair, sans identifiant ni clé. `null` : rien à dire. */
  warning: string | null;
  etat: EtatDeLecture;
}

/** Les codes d'une fonction que le serveur ne connaît pas : celui de PostgREST, puis celui de Postgres. */
const FONCTION_INCONNUE = new Set(["PGRST202", "42883"]);

/** La migration n'est pas encore collée : l'erreur porte le code d'une fonction inconnue, ou le dit en toutes lettres. */
function fonctionAbsente(e: unknown): boolean {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  if (typeof code === "string" && FONCTION_INCONNUE.has(code)) return true;
  return e instanceof Error && /could not find the function|function [\w.]*gaulois_des_joueurs\b.* does not exist/i.test(e.message);
}

/**
 * L'appel du robot : supabase-js, chargé seulement ici, comme dans les autres scripts qui parlent à Supabase. La requête est
 * coupée à temps. L'erreur levée garde le code du serveur (`PGRST202` : fonction inconnue).
 */
const callSupabase: GauloisCall = async (url, key, empreintes) => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("gaulois_des_joueurs", { p_empreintes: [...empreintes] }).abortSignal(AbortSignal.timeout(GAULOIS_TIMEOUT_MS));
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
};

/** La promesse, ou une erreur si elle dépasse `ms`. Le minuteur est toujours arrêté : il ne retient pas le script. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`pas de réponse en ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** Les identifiants à demander : sans doublon ni vide. */
const identifiants = (publicIds: Iterable<string | null | undefined>): string[] => [...new Set([...publicIds].filter((id): id is string => typeof id === "string" && id !== ""))];

/**
 * Un message d'erreur qui ne peut contenir ni lien, ni clé, ni identifiant, ni empreinte : tout ce qui y ressemble est
 * remplacé par « … », puis le message est coupé.
 */
function messageSur(e: unknown, secrets: readonly string[]): string {
  let texte = (e instanceof Error ? e.message : String(e)).replace(/https?:\/\/\S+/g, "…");
  for (const secret of secrets) if (secret.length >= 4) texte = texte.split(secret).join("…");
  return texte
    .replace(/\b[0-9a-fA-F]{32,}\b/g, "…")
    .replace(/\b(?:sb_secret_|sb_publishable_|eyJ)[\w.-]+/g, "…")
    .slice(0, 160);
}

const objet = (valeur: unknown): Record<string, unknown> | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : null);

const sans = (warning: string, etat: EtatDeLecture): LectureDesGaulois => ({ gaulois: AUCUN_GAULOIS, warning, etat });

/** Une réponse du serveur, rendue sous chaque identifiant demandé. `null` : réponse illisible. `illisibles` : tenues que le dessin ne sait pas lire. */
function lireReponse(data: unknown, lot: readonly string[], carte: Map<string, Tenue>): { refus: string | null; illisibles: number } | null {
  const reponse = objet(data);
  if (!reponse) return null;
  if (reponse["ok"] !== true) {
    const code = reponse["error"];
    return { refus: typeof code === "string" && /^[a-z_]{1,40}$/.test(code) ? code : "refus", illisibles: 0 };
  }
  const gaulois = objet(reponse["gaulois"]);
  if (!gaulois) return null;
  let illisibles = 0;
  for (const id of lot) {
    const cle = empreinte(id);
    if (!Object.hasOwn(gaulois, cle)) continue;
    const tenue = lireTenue(gaulois[cle]);
    if (tenue) carte.set(id, tenue);
    else illisibles++;
  }
  return { refus: null, illisibles };
}

/**
 * Les Gaulois des joueurs d'une image, lus au serveur avec la clé de service. Rend `AUCUN_GAULOIS` et un avertissement sans
 * secret si rien n'est réglé, si la migration n'est pas encore collée, en cas de panne ou de réponse mal formée : l'image se
 * dessine alors comme avant. Une tenue que le dessin ne sait pas lire est ignorée.
 */
export async function lireGauloisDesJoueurs(
  publicIds: Iterable<string | null | undefined>,
  url: string | undefined,
  key: string | undefined,
  call: GauloisCall = callSupabase,
): Promise<LectureDesGaulois> {
  const ids = identifiants(publicIds);
  if (!url || !key) return sans("pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY, images sans Gaulois", "sans-reglage");
  if (ids.length === 0) return { gaulois: AUCUN_GAULOIS, warning: null, etat: "lu" };
  const carte = new Map<string, Tenue>();
  let illisibles = 0;
  for (let i = 0; i < ids.length; i += GAULOIS_LOT) {
    const lot = ids.slice(i, i + GAULOIS_LOT);
    let data: unknown;
    try {
      data = await withTimeout(call(url, key, lot.map(empreinte)), GAULOIS_TIMEOUT_MS);
    } catch (e) {
      if (fonctionAbsente(e)) {
        return sans("le serveur ne connaît pas encore gaulois_des_joueurs (migration 20261114000400 à coller dans Supabase), images sans Gaulois", "fonction-absente");
      }
      return sans(`lecture impossible (${messageSur(e, [key, url, ...ids])}), images sans Gaulois`, "panne");
    }
    const lu = lireReponse(data, lot, carte);
    if (!lu) return sans("réponse illisible du serveur, images sans Gaulois", "panne");
    if (lu.refus) return sans(`le serveur a refusé la lecture (${lu.refus}), images sans Gaulois`, "panne");
    illisibles += lu.illisibles;
  }
  const warning = illisibles > 0 ? `${illisibles} tenue${illisibles > 1 ? "s" : ""} que le dessin ne sait pas lire, ignorée${illisibles > 1 ? "s" : ""}` : null;
  return { gaulois: carte.size > 0 ? carte : AUCUN_GAULOIS, warning, etat: "lu" };
}

/**
 * La ligne du journal de l'Action, ou `null` s'il n'y a rien à dire. Une simple note (`::notice::`) quand rien n'est réglé,
 * quand la migration n'est pas encore collée ou qu'une tenue est ignorée ; un avertissement (`::warning::`) en cas de panne.
 */
export function journalDesGaulois(lecture: LectureDesGaulois): string | null {
  if (!lecture.warning) return null;
  return `${lecture.etat === "panne" ? "::warning::" : "::notice::"}Gaulois des images : ${lecture.warning}.`;
}

/**
 * Pour un script d'envoi du robot : les Gaulois des joueurs de l'image, avec `SUPABASE_URL` et `SUPABASE_SECRET_KEY` de
 * l'environnement de l'Action, et la ligne du journal s'il y a quelque chose à dire. Ne lève jamais d'erreur.
 */
export async function gauloisPourLeRobot(
  publicIds: Iterable<string | null | undefined>,
  env: Record<string, string | undefined> = process.env,
  log: (line: string) => void = console.log,
  call: GauloisCall = callSupabase,
): Promise<GauloisParJoueur> {
  const lecture = await lireGauloisDesJoueurs(publicIds, env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"], call);
  const ligne = journalDesGaulois(lecture);
  if (ligne) log(ligne);
  return lecture.gaulois;
}

/* ---------- Les fiches : la lecture gardée pour la construction du site ---------- */

/** Écrit par `scripts/lire-gaulois-fiches.ts` avant la construction, relu par `gauloisDuCache`. Dossier ignoré par Git. */
export const GAULOIS_FICHES_FILE = ".cache/gaulois-fiches.json";

/** Le contenu de ce fichier : les tenues par empreinte, jamais par identifiant, et l'heure de la lecture. */
export interface CacheDesGaulois {
  version: 1;
  luLe: string;
  gaulois: Record<string, Tenue>;
}

/** La lecture, rangée par empreinte pour le fichier. */
export function cacheDesGaulois(gaulois: GauloisParJoueur, luLe: Date): CacheDesGaulois {
  const parEmpreinte: Record<string, Tenue> = {};
  for (const [id, tenue] of gaulois) parEmpreinte[empreinte(id)] = tenue;
  return { version: 1, luLe: luLe.toISOString(), gaulois: parEmpreinte };
}

/**
 * Les Gaulois gardés pour les fiches, pour une liste d'identifiants publics. Fichier absent, illisible ou d'une autre forme :
 * `AUCUN_GAULOIS`, et les fiches se dessinent comme avant. Une tenue que le dessin ne sait pas lire est ignorée.
 */
export function gauloisDuCache(chemin: string, publicIds: Iterable<string | null | undefined>): GauloisParJoueur {
  let brut: unknown;
  try {
    brut = JSON.parse(readFileSync(chemin, "utf8"));
  } catch {
    return AUCUN_GAULOIS;
  }
  const fichier = objet(brut);
  const gaulois = objet(fichier?.["gaulois"]);
  if (!fichier || fichier["version"] !== 1 || typeof fichier["luLe"] !== "string" || Number.isNaN(Date.parse(fichier["luLe"])) || !gaulois) return AUCUN_GAULOIS;
  const carte = new Map<string, Tenue>();
  for (const id of identifiants(publicIds)) {
    const cle = empreinte(id);
    if (!Object.hasOwn(gaulois, cle)) continue;
    const tenue = lireTenue(gaulois[cle]);
    if (tenue) carte.set(id, tenue);
  }
  return carte.size > 0 ? carte : AUCUN_GAULOIS;
}

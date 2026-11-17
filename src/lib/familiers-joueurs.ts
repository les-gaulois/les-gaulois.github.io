/**
 * Le familier des membres, pour leur carte (17 novembre 2026, à la demande du pilote : « faut qu'on puisse ajouter le
 * familier s'ils en ont ») : la carte du podium de l'accueil et celle de la fiche montrent le familier que le membre montre
 * à côté de son Gaulois.
 *
 * Même chemin que les bannières de la liste (`bannieres-joueurs.ts`) et les finitions des cartes (`finitions-joueurs.ts`) :
 * - l'étape « Lire les Gaulois des fiches » de la GitHub Action, seule à avoir la clé de service, demande au serveur le
 *   familier des membres au pseudo public (`familiers_des_joueurs`, migration `20261117001400_familiers_des_joueurs.sql`),
 *   en n'envoyant que l'empreinte de leur identifiant ; le serveur décide de qui en montre un ;
 * - elle les range dans `.cache/familiers-membres.json`, hors de Git et de `dist/`, par empreinte ;
 * - la construction du site les relit par `familiersDuCache` : rien n'est du temps réel.
 * Sans réglage, sans la migration ou en cas de panne, le fichier n'existe pas et les cartes n'ont pas de familier. Un
 * familier que le dessin ne connaît pas est ignoré. Aucun message ne contient d'identifiant, d'empreinte ni de clé.
 */
import { readFileSync } from "node:fs";
import { empreinte, GAULOIS_LOT, GAULOIS_TIMEOUT_MS, type EtatDeLecture } from "./gaulois-joueurs";
import { familierDe } from "../../supabase/functions/code-discord/familiers/index.ts";

/** Le familier à montrer, par identifiant public d'un membre au pseudo public. */
export type FamiliersParJoueur = ReadonlyMap<string, string>;

export const AUCUN_FAMILIER: FamiliersParJoueur = new Map();

/** Écrit par `scripts/lire-gaulois-fiches.ts` avant la construction, relu par `familiersDuCache`. Dossier ignoré par Git. */
export const FAMILIERS_MEMBRES_FILE = ".cache/familiers-membres.json";

/** Appelle `familiers_des_joueurs` avec la clé de service et rend sa réponse. Lève une erreur si le serveur refuse ou ne répond pas. */
export type FamiliersCall = (url: string, key: string, empreintes: readonly string[]) => Promise<unknown>;

export interface LectureDesFamiliers {
  familiers: FamiliersParJoueur;
  /** Pourquoi la carte est vide, en clair, sans identifiant ni clé. `null` : rien à dire. */
  warning: string | null;
  etat: EtatDeLecture;
}

const callSupabase: FamiliersCall = async (url, key, empreintes) => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("familiers_des_joueurs", { p_empreintes: [...empreintes] }).abortSignal(AbortSignal.timeout(GAULOIS_TIMEOUT_MS));
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
};

/** La migration n'est pas encore collée : le code d'une fonction inconnue, celui de PostgREST ou celui de Postgres. */
function fonctionAbsente(e: unknown): boolean {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  return code === "PGRST202" || code === "42883";
}

const objet = (valeur: unknown): Record<string, unknown> | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : null);
const identifiants = (publicIds: Iterable<string | null | undefined>): string[] => [...new Set([...publicIds].filter((id): id is string => typeof id === "string" && id !== ""))];
const sans = (warning: string, etat: EtatDeLecture): LectureDesFamiliers => ({ familiers: AUCUN_FAMILIER, warning, etat });

/** Range sous chaque identifiant demandé la familier que `parEmpreinte` lui donne, si le rayon la connaît. */
function ranger(parEmpreinte: Record<string, unknown>, ids: readonly string[], carte: Map<string, string>): void {
  for (const id of ids) {
    const cle = empreinte(id);
    if (!Object.hasOwn(parEmpreinte, cle)) continue;
    const valeur = parEmpreinte[cle];
    const familier = typeof valeur === "string" ? familierDe(valeur) : null;
    if (familier) carte.set(id, familier.id);
  }
}

/**
 * Les familiers des membres, lues au serveur avec la clé de service. Ne lève jamais : sans réglage, sans la migration, en
 * cas de panne ou de réponse mal formée, la carte est vide et l'avertissement dit pourquoi, sans le message du serveur.
 */
export async function lireFamiliersDesJoueurs(publicIds: Iterable<string | null | undefined>, url: string | undefined, key: string | undefined, call: FamiliersCall = callSupabase): Promise<LectureDesFamiliers> {
  const ids = identifiants(publicIds);
  if (!url || !key) return sans("pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY, cartes sans familier", "sans-reglage");
  if (ids.length === 0) return { familiers: AUCUN_FAMILIER, warning: null, etat: "lu" };
  const carte = new Map<string, string>();
  for (let i = 0; i < ids.length; i += GAULOIS_LOT) {
    const lot = ids.slice(i, i + GAULOIS_LOT);
    let data: unknown;
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    try {
      const tard = new Promise<never>((_, refuser) => {
        minuteur = setTimeout(() => refuser(new Error("délai dépassé")), GAULOIS_TIMEOUT_MS);
      });
      data = await Promise.race([call(url, key, lot.map(empreinte)), tard]);
    } catch (e) {
      if (fonctionAbsente(e)) return sans("le serveur ne connaît pas encore familiers_des_joueurs (migration 20261117001400 à coller dans Supabase), cartes sans familier", "fonction-absente");
      return sans("lecture impossible, cartes sans familier", "panne");
    } finally {
      clearTimeout(minuteur);
    }
    const reponse = objet(data);
    const lus = objet(reponse?.["familiers"]);
    if (!reponse || reponse["ok"] !== true || !lus) return sans("réponse illisible ou refus du serveur, cartes sans familier", "panne");
    ranger(lus, lot, carte);
  }
  return { familiers: carte.size > 0 ? carte : AUCUN_FAMILIER, warning: null, etat: "lu" };
}

/** La ligne du journal de l'Action, ou `null`. Une note quand rien n'est réglé ou que la migration manque, un avertissement en cas de panne. */
export function journalDesFamiliers(lecture: LectureDesFamiliers): string | null {
  if (!lecture.warning) return null;
  return `${lecture.etat === "panne" ? "::warning::" : "::notice::"}Familiers des cartes : ${lecture.warning}.`;
}

/** Le contenu du fichier : les familiers par empreinte, jamais par identifiant, et l'heure de la lecture. */
export interface CacheDesFamiliers {
  version: 1;
  luLe: string;
  familiers: Record<string, string>;
}

export function cacheDesFamiliers(familiers: FamiliersParJoueur, luLe: Date): CacheDesFamiliers {
  const parEmpreinte: Record<string, string> = {};
  for (const [id, familier] of familiers) parEmpreinte[empreinte(id)] = familier;
  return { version: 1, luLe: luLe.toISOString(), familiers: parEmpreinte };
}

/** Les familiers gardées pour l'accueil, pour des identifiants publics. Fichier absent, illisible ou d'une autre forme : aucune. */
export function familiersDuCache(chemin: string, publicIds: Iterable<string | null | undefined>): FamiliersParJoueur {
  let brut: unknown;
  try {
    brut = JSON.parse(readFileSync(chemin, "utf8"));
  } catch {
    return AUCUN_FAMILIER;
  }
  const fichier = objet(brut);
  const familiers = objet(fichier?.["familiers"]);
  if (!fichier || fichier["version"] !== 1 || typeof fichier["luLe"] !== "string" || Number.isNaN(Date.parse(fichier["luLe"])) || !familiers) return AUCUN_FAMILIER;
  const carte = new Map<string, string>();
  ranger(familiers, identifiants(publicIds), carte);
  return carte.size > 0 ? carte : AUCUN_FAMILIER;
}

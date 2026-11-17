/**
 * La finition de carte des membres, pour le podium de l'accueil (17 novembre 2026, le rayon « Cartes » de la boutique,
 * `src/lib/village/cartes.ts`) : la carte d'un joueur du podium porte la finition qu'il a choisie.
 *
 * Même chemin que les bannières de la liste (`bannieres-joueurs.ts`) :
 * - l'étape « Lire les Gaulois des fiches » de la GitHub Action, seule à avoir la clé de service, demande au serveur la
 *   finition des membres au pseudo public (`cartes_des_joueurs`, migration `20261117001200_cartes_du_gaulois.sql`), en
 *   n'envoyant que l'empreinte de leur identifiant ; le serveur décide de qui en montre une ;
 * - elle les range dans `.cache/finitions-membres.json`, hors de Git et de `dist/`, par empreinte ;
 * - la construction du site les relit par `finitionsDuCache` : rien n'est du temps réel.
 * Sans réglage, sans la migration ou en cas de panne, le fichier n'existe pas et les cartes portent la finition de leur
 * place. Une finition que le rayon ne connaît pas est ignorée. Aucun message ne contient d'identifiant, d'empreinte ni de clé.
 */
import { readFileSync } from "node:fs";
import { empreinte, GAULOIS_LOT, GAULOIS_TIMEOUT_MS, type EtatDeLecture } from "./gaulois-joueurs";
import { finitionParId, type IdDeFinition } from "./village/cartes";

/** La finition à montrer, par identifiant public d'un membre au pseudo public. */
export type FinitionsParJoueur = ReadonlyMap<string, IdDeFinition>;

export const AUCUNE_FINITION: FinitionsParJoueur = new Map();

/** Écrit par `scripts/lire-gaulois-fiches.ts` avant la construction, relu par `finitionsDuCache`. Dossier ignoré par Git. */
export const FINITIONS_MEMBRES_FILE = ".cache/finitions-membres.json";

/** Appelle `cartes_des_joueurs` avec la clé de service et rend sa réponse. Lève une erreur si le serveur refuse ou ne répond pas. */
export type FinitionsCall = (url: string, key: string, empreintes: readonly string[]) => Promise<unknown>;

export interface LectureDesFinitions {
  finitions: FinitionsParJoueur;
  /** Pourquoi la carte est vide, en clair, sans identifiant ni clé. `null` : rien à dire. */
  warning: string | null;
  etat: EtatDeLecture;
}

const callSupabase: FinitionsCall = async (url, key, empreintes) => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("cartes_des_joueurs", { p_empreintes: [...empreintes] }).abortSignal(AbortSignal.timeout(GAULOIS_TIMEOUT_MS));
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
const sans = (warning: string, etat: EtatDeLecture): LectureDesFinitions => ({ finitions: AUCUNE_FINITION, warning, etat });

/** Range sous chaque identifiant demandé la finition que `parEmpreinte` lui donne, si le rayon la connaît. */
function ranger(parEmpreinte: Record<string, unknown>, ids: readonly string[], carte: Map<string, IdDeFinition>): void {
  for (const id of ids) {
    const cle = empreinte(id);
    if (!Object.hasOwn(parEmpreinte, cle)) continue;
    const valeur = parEmpreinte[cle];
    const finition = typeof valeur === "string" ? finitionParId(valeur) : null;
    if (finition) carte.set(id, finition.id);
  }
}

/**
 * Les finitions des membres, lues au serveur avec la clé de service. Ne lève jamais : sans réglage, sans la migration, en
 * cas de panne ou de réponse mal formée, la carte est vide et l'avertissement dit pourquoi, sans le message du serveur.
 */
export async function lireFinitionsDesJoueurs(publicIds: Iterable<string | null | undefined>, url: string | undefined, key: string | undefined, call: FinitionsCall = callSupabase): Promise<LectureDesFinitions> {
  const ids = identifiants(publicIds);
  if (!url || !key) return sans("pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY, cartes à la finition de leur place", "sans-reglage");
  if (ids.length === 0) return { finitions: AUCUNE_FINITION, warning: null, etat: "lu" };
  const carte = new Map<string, IdDeFinition>();
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
      if (fonctionAbsente(e)) return sans("le serveur ne connaît pas encore cartes_des_joueurs (migration 20261117001200 à coller dans Supabase), cartes à la finition de leur place", "fonction-absente");
      return sans("lecture impossible, cartes à la finition de leur place", "panne");
    } finally {
      clearTimeout(minuteur);
    }
    const reponse = objet(data);
    const cartes = objet(reponse?.["cartes"]);
    if (!reponse || reponse["ok"] !== true || !cartes) return sans("réponse illisible ou refus du serveur, cartes à la finition de leur place", "panne");
    ranger(cartes, lot, carte);
  }
  return { finitions: carte.size > 0 ? carte : AUCUNE_FINITION, warning: null, etat: "lu" };
}

/** La ligne du journal de l'Action, ou `null`. Une note quand rien n'est réglé ou que la migration manque, un avertissement en cas de panne. */
export function journalDesFinitions(lecture: LectureDesFinitions): string | null {
  if (!lecture.warning) return null;
  return `${lecture.etat === "panne" ? "::warning::" : "::notice::"}Finitions des cartes : ${lecture.warning}.`;
}

/** Le contenu du fichier : les finitions par empreinte, jamais par identifiant, et l'heure de la lecture. */
export interface CacheDesFinitions {
  version: 1;
  luLe: string;
  finitions: Record<string, string>;
}

export function cacheDesFinitions(finitions: FinitionsParJoueur, luLe: Date): CacheDesFinitions {
  const parEmpreinte: Record<string, string> = {};
  for (const [id, finition] of finitions) parEmpreinte[empreinte(id)] = finition;
  return { version: 1, luLe: luLe.toISOString(), finitions: parEmpreinte };
}

/** Les finitions gardées pour l'accueil, pour des identifiants publics. Fichier absent, illisible ou d'une autre forme : aucune. */
export function finitionsDuCache(chemin: string, publicIds: Iterable<string | null | undefined>): FinitionsParJoueur {
  let brut: unknown;
  try {
    brut = JSON.parse(readFileSync(chemin, "utf8"));
  } catch {
    return AUCUNE_FINITION;
  }
  const fichier = objet(brut);
  const finitions = objet(fichier?.["finitions"]);
  if (!fichier || fichier["version"] !== 1 || typeof fichier["luLe"] !== "string" || Number.isNaN(Date.parse(fichier["luLe"])) || !finitions) return AUCUNE_FINITION;
  const carte = new Map<string, IdDeFinition>();
  ranger(finitions, identifiants(publicIds), carte);
  return carte.size > 0 ? carte : AUCUNE_FINITION;
}

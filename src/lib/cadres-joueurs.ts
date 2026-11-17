/**
 * Le cadre de carte des membres, pour leur fiche (17 novembre 2026, le rayon « Cadres » de la boutique,
 * `src/lib/village/cadres.ts`) : la carte d'un membre porte le cadre qu'il a choisi.
 *
 * Même chemin que les finitions (`finitions-joueurs.ts`) : l'étape « Lire les Gaulois des fiches » de la GitHub Action,
 * seule à avoir la clé de service, demande au serveur le cadre des membres au pseudo public (`cadres_des_joueurs`,
 * migration `20261117001600_cadres_des_cartes.sql`), en n'envoyant que l'empreinte de leur identifiant ; elle les range
 * dans `.cache/cadres-membres.json`, hors de Git et de `dist/`, par empreinte ; la construction les relit par
 * `cadresDuCache`. Rien n'est du temps réel. Sans réglage, sans la migration ou en cas de panne, le fichier n'existe pas
 * et les cartes n'ont pas de cadre. Aucun message ne contient d'identifiant, d'empreinte ni de clé.
 */
import { readFileSync } from "node:fs";
import { empreinte, GAULOIS_LOT, GAULOIS_TIMEOUT_MS, type EtatDeLecture } from "./gaulois-joueurs";
import { cadreParId, type IdDeCadre } from "./village/cadres";

/** Le cadre à montrer, par identifiant public d'un membre au pseudo public. */
export type CadresParJoueur = ReadonlyMap<string, IdDeCadre>;

export const AUCUN_CADRE: CadresParJoueur = new Map();

/** Écrit par `scripts/lire-gaulois-fiches.ts` avant la construction, relu par `cadresDuCache`. Dossier ignoré par Git. */
export const CADRES_MEMBRES_FILE = ".cache/cadres-membres.json";

/** Appelle `cadres_des_joueurs` avec la clé de service et rend sa réponse. Lève une erreur si le serveur refuse ou ne répond pas. */
export type CadresCall = (url: string, key: string, empreintes: readonly string[]) => Promise<unknown>;

export interface LectureDesCadres {
  cadres: CadresParJoueur;
  /** Pourquoi rien n'est lu, en clair, sans identifiant ni clé. `null` : rien à dire. */
  warning: string | null;
  etat: EtatDeLecture;
}

const callSupabase: CadresCall = async (url, key, empreintes) => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("cadres_des_joueurs", { p_empreintes: [...empreintes] }).abortSignal(AbortSignal.timeout(GAULOIS_TIMEOUT_MS));
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
const sans = (warning: string, etat: EtatDeLecture): LectureDesCadres => ({ cadres: AUCUN_CADRE, warning, etat });

/** Range sous chaque identifiant demandé le cadre que `parEmpreinte` lui donne, si le rayon le connaît. */
function ranger(parEmpreinte: Record<string, unknown>, ids: readonly string[], carte: Map<string, IdDeCadre>): void {
  for (const id of ids) {
    const cle = empreinte(id);
    if (!Object.hasOwn(parEmpreinte, cle)) continue;
    const valeur = parEmpreinte[cle];
    const cadre = typeof valeur === "string" ? cadreParId(valeur) : null;
    if (cadre) carte.set(id, cadre.id);
  }
}

/**
 * Les cadres des membres, lus au serveur avec la clé de service. Ne lève jamais : sans réglage, sans la migration, en
 * cas de panne ou de réponse mal formée, rien n'est lu et l'avertissement dit pourquoi, sans le message du serveur.
 */
export async function lireCadresDesJoueurs(publicIds: Iterable<string | null | undefined>, url: string | undefined, key: string | undefined, call: CadresCall = callSupabase): Promise<LectureDesCadres> {
  const ids = identifiants(publicIds);
  if (!url || !key) return sans("pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY, cartes sans cadre", "sans-reglage");
  if (ids.length === 0) return { cadres: AUCUN_CADRE, warning: null, etat: "lu" };
  const carte = new Map<string, IdDeCadre>();
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
      if (fonctionAbsente(e)) return sans("le serveur ne connaît pas encore cadres_des_joueurs (migration 20261117001600 à coller dans Supabase), cartes sans cadre", "fonction-absente");
      return sans("lecture impossible, cartes sans cadre", "panne");
    } finally {
      clearTimeout(minuteur);
    }
    const reponse = objet(data);
    const cartes = objet(reponse?.["cadres"]);
    if (!reponse || reponse["ok"] !== true || !cartes) return sans("réponse illisible ou refus du serveur, cartes sans cadre", "panne");
    ranger(cartes, lot, carte);
  }
  return { cadres: carte.size > 0 ? carte : AUCUN_CADRE, warning: null, etat: "lu" };
}

/** La ligne du journal de l'Action, ou `null`. Une note quand rien n'est réglé ou que la migration manque, un avertissement en cas de panne. */
export function journalDesCadres(lecture: LectureDesCadres): string | null {
  if (!lecture.warning) return null;
  return `${lecture.etat === "panne" ? "::warning::" : "::notice::"}Cadres des cartes : ${lecture.warning}.`;
}

/** Le contenu du fichier : les cadres par empreinte, jamais par identifiant, et l'heure de la lecture. */
export interface CacheDesCadres {
  version: 1;
  luLe: string;
  cadres: Record<string, string>;
}

export function cacheDesCadres(cadres: CadresParJoueur, luLe: Date): CacheDesCadres {
  const parEmpreinte: Record<string, string> = {};
  for (const [id, cadre] of cadres) parEmpreinte[empreinte(id)] = cadre;
  return { version: 1, luLe: luLe.toISOString(), cadres: parEmpreinte };
}

/** Les cadres gardés pour les fiches, pour des identifiants publics. Fichier absent, illisible ou d'une autre forme : aucun. */
export function cadresDuCache(chemin: string, publicIds: Iterable<string | null | undefined>): CadresParJoueur {
  let brut: unknown;
  try {
    brut = JSON.parse(readFileSync(chemin, "utf8"));
  } catch {
    return AUCUN_CADRE;
  }
  const fichier = objet(brut);
  const cadres = objet(fichier?.["cadres"]);
  if (!fichier || fichier["version"] !== 1 || typeof fichier["luLe"] !== "string" || Number.isNaN(Date.parse(fichier["luLe"])) || !cadres) return AUCUN_CADRE;
  const carte = new Map<string, IdDeCadre>();
  ranger(cadres, identifiants(publicIds), carte);
  return carte.size > 0 ? carte : AUCUN_CADRE;
}

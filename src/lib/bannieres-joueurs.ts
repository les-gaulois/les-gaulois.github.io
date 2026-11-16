/**
 * La bannière des membres sur la liste du clan (demande du pilote, 16 novembre 2026) : la ligne d'un membre qui a choisi
 * une bannière pour son Gaulois la porte en fond, sur la page « Liste des membres ».
 *
 * Même chemin que les Gaulois des fiches (`gaulois-joueurs.ts`) :
 * - l'étape « Lire les Gaulois des fiches » de la GitHub Action, seule à avoir la clé de service, demande au serveur la
 *   bannière des membres au pseudo public (`bannieres_des_joueurs`, migration `20261116000400_bannieres_des_joueurs.sql`),
 *   en n'envoyant que l'empreinte de leur identifiant ; le serveur décide de qui en montre une ;
 * - elle les range dans `.cache/bannieres-membres.json`, hors de Git et de `dist/`, par empreinte ;
 * - la construction du site les relit par `bannieresDuCache` : rien n'est du temps réel, la liste montre les bannières
 *   relevées à la dernière construction, comme ses chiffres.
 * Sans réglage, sans la migration ou en cas de panne, le fichier n'existe pas et la liste s'affiche comme avant. Une
 * bannière que le catalogue ne connaît pas est ignorée. Aucun message ne contient d'identifiant, d'empreinte ni de clé.
 */
import { readFileSync } from "node:fs";
import { banniereParId, type RareteDeBanniere } from "../../supabase/functions/code-discord/bannieres/index.ts";
import { empreinte, GAULOIS_LOT, GAULOIS_TIMEOUT_MS, type EtatDeLecture } from "./gaulois-joueurs";

/** La bannière d'une ligne : son identifiant (celui de son image, `/bannieres/<id>.png`) et sa rareté, pour le cadre. */
export interface BanniereDeLigne {
  id: string;
  rarete: RareteDeBanniere;
}

/** Les bannières à montrer, par identifiant public d'un membre au pseudo public. */
export type BannieresParJoueur = ReadonlyMap<string, BanniereDeLigne>;

export const AUCUNE_BANNIERE: BannieresParJoueur = new Map();

/**
 * Ce que la liste des membres reçoit : pour chaque identifiant public, le chemin de l'image de la bannière sur le site
 * (sans la base, publiée par `src/pages/bannieres/[id].png.ts`) et sa rareté.
 */
export function fondsDesLignes(bannieres: BannieresParJoueur): Record<string, { image: string; rarete: RareteDeBanniere }> {
  const fonds: Record<string, { image: string; rarete: RareteDeBanniere }> = {};
  for (const [publicId, { id, rarete }] of bannieres) fonds[publicId] = { image: `/bannieres/${encodeURIComponent(id)}.png`, rarete };
  return fonds;
}

/** Écrit par `scripts/lire-gaulois-fiches.ts` avant la construction, relu par `bannieresDuCache`. Dossier ignoré par Git. */
export const BANNIERES_MEMBRES_FILE = ".cache/bannieres-membres.json";

/** Appelle `bannieres_des_joueurs` avec la clé de service et rend sa réponse. Lève une erreur si le serveur refuse ou ne répond pas. */
export type BannieresCall = (url: string, key: string, empreintes: readonly string[]) => Promise<unknown>;

export interface LectureDesBannieres {
  bannieres: BannieresParJoueur;
  /** Pourquoi la carte est vide, en clair, sans identifiant ni clé. `null` : rien à dire. */
  warning: string | null;
  etat: EtatDeLecture;
}

const callSupabase: BannieresCall = async (url, key, empreintes) => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("bannieres_des_joueurs", { p_empreintes: [...empreintes] }).abortSignal(AbortSignal.timeout(GAULOIS_TIMEOUT_MS));
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

const sans = (warning: string, etat: EtatDeLecture): LectureDesBannieres => ({ bannieres: AUCUNE_BANNIERE, warning, etat });

/** La bannière du catalogue pour cette valeur reçue, ou `null` : une valeur qui n'est pas un texte, une bannière inconnue. */
function lireBanniere(valeur: unknown): BanniereDeLigne | null {
  const banniere = typeof valeur === "string" ? banniereParId(valeur) : null;
  return banniere ? { id: banniere.id, rarete: banniere.rarete } : null;
}

/** Range sous chaque identifiant demandé la bannière que `parEmpreinte` lui donne. */
function ranger(parEmpreinte: Record<string, unknown>, ids: readonly string[], carte: Map<string, BanniereDeLigne>): void {
  for (const id of ids) {
    const cle = empreinte(id);
    if (!Object.hasOwn(parEmpreinte, cle)) continue;
    const banniere = lireBanniere(parEmpreinte[cle]);
    if (banniere) carte.set(id, banniere);
  }
}

/**
 * Les bannières des membres, lues au serveur avec la clé de service. Ne lève jamais : sans réglage, sans la migration, en
 * cas de panne ou de réponse mal formée, la carte est vide et l'avertissement dit pourquoi, sans le message du serveur
 * (il pourrait porter un lien ou une empreinte).
 */
export async function lireBannieresDesJoueurs(
  publicIds: Iterable<string | null | undefined>,
  url: string | undefined,
  key: string | undefined,
  call: BannieresCall = callSupabase,
): Promise<LectureDesBannieres> {
  const ids = identifiants(publicIds);
  if (!url || !key) return sans("pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY, liste sans bannière", "sans-reglage");
  if (ids.length === 0) return { bannieres: AUCUNE_BANNIERE, warning: null, etat: "lu" };
  const carte = new Map<string, BanniereDeLigne>();
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
      if (fonctionAbsente(e)) {
        return sans("le serveur ne connaît pas encore bannieres_des_joueurs (migration 20261116000400 à coller dans Supabase), liste sans bannière", "fonction-absente");
      }
      return sans("lecture impossible, liste sans bannière", "panne");
    } finally {
      clearTimeout(minuteur);
    }
    const reponse = objet(data);
    const bannieres = objet(reponse?.["bannieres"]);
    if (!reponse || reponse["ok"] !== true || !bannieres) return sans("réponse illisible ou refus du serveur, liste sans bannière", "panne");
    ranger(bannieres, lot, carte);
  }
  return { bannieres: carte.size > 0 ? carte : AUCUNE_BANNIERE, warning: null, etat: "lu" };
}

/** La ligne du journal de l'Action, ou `null`. Une note quand rien n'est réglé ou que la migration manque, un avertissement en cas de panne. */
export function journalDesBannieres(lecture: LectureDesBannieres): string | null {
  if (!lecture.warning) return null;
  return `${lecture.etat === "panne" ? "::warning::" : "::notice::"}Bannières de la liste : ${lecture.warning}.`;
}

/** Le contenu du fichier : l'identifiant de la bannière par empreinte, jamais par identifiant de membre, et l'heure de la lecture. */
export interface CacheDesBannieres {
  version: 1;
  luLe: string;
  bannieres: Record<string, string>;
}

export function cacheDesBannieres(bannieres: BannieresParJoueur, luLe: Date): CacheDesBannieres {
  const parEmpreinte: Record<string, string> = {};
  for (const [id, banniere] of bannieres) parEmpreinte[empreinte(id)] = banniere.id;
  return { version: 1, luLe: luLe.toISOString(), bannieres: parEmpreinte };
}

/**
 * Les bannières gardées pour la liste, pour des identifiants publics. Fichier absent, illisible ou d'une autre forme :
 * `AUCUNE_BANNIERE`, et la liste s'affiche comme avant.
 */
export function bannieresDuCache(chemin: string, publicIds: Iterable<string | null | undefined>): BannieresParJoueur {
  let brut: unknown;
  try {
    brut = JSON.parse(readFileSync(chemin, "utf8"));
  } catch {
    return AUCUNE_BANNIERE;
  }
  const fichier = objet(brut);
  const bannieres = objet(fichier?.["bannieres"]);
  if (!fichier || fichier["version"] !== 1 || typeof fichier["luLe"] !== "string" || Number.isNaN(Date.parse(fichier["luLe"])) || !bannieres) return AUCUNE_BANNIERE;
  const carte = new Map<string, BanniereDeLigne>();
  ranger(bannieres, identifiants(publicIds), carte);
  return carte.size > 0 ? carte : AUCUNE_BANNIERE;
}

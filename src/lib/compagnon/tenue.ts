/**
 * La tenue du Gaulois compagnon : un membre connecté qui a créé son Gaulois au village voit le sien ; les autres, le Gaulois
 * de départ, qui invite à l'habiller.
 *
 * Elle vient du serveur, par la fonction SQL `get_mon_gaulois` et `src/lib/compte/api.ts`, seul chemin du navigateur vers
 * lui. Une seule lecture par onglet : la tenue est gardée dans l'onglet (`sessionStorage`) pour les pages suivantes, et
 * relue à la page qui suit un passage au village, où elle a pu changer. Le vestiaire peut aussi annoncer une tenue tout
 * juste enregistrée (l'événement `gal:gaulois-enregistre`) : le compagnon se rhabille aussitôt.
 *
 * Sans session dans ce navigateur, rien n'est lu et Supabase n'est pas chargé ; la tenue gardée et les images peintes du
 * membre sont effacées. À la déconnexion aussi, sur la page même (`surveillerLeCompte`). Une session expirée, une panne ou
 * un refus du serveur (`discord_required`, `suspended`) donnent le Gaulois de départ, sans message : il est décoratif.
 *
 * Ce fichier ne charge pas le dessin du Gaulois (`gaulois.ts`, lourd) : il rend la tenue telle que le serveur l'a donnée,
 * que `src/lib/compagnon/dessin.ts` relit toujours par `lireTenue`. Une tenue absente ou illisible donne le Gaulois de départ.
 */
import { AUTH_ENABLED, ServerError, call, getSession, mayHaveSession, supabase } from "../compte/api";

/** Dans cet onglet : la tenue lue au serveur et le compte qui l'a lue. Effacée à la déconnexion. */
export const CLE_TENUE = "gal-compagnon-tenue";
/** Dans cet onglet : les images peintes du compagnon (`src/scripts/compagnon.ts`), effacées avec la tenue du membre. */
export const CLE_IMAGES = "gal-compagnon-images";
/** Ce que le vestiaire du village annonce après un enregistrement, avec `detail.tenue`. */
export const EVENEMENT_ENREGISTRE = "gal:gaulois-enregistre";
/** Le temps laissé au serveur avant de montrer le Gaulois de départ, à la première page d'un onglet : il se rhabille ensuite. */
export const ATTENTE_DU_SERVEUR_MS = 3_000;

export interface TenueGardee {
  /** La tenue telle que le serveur l'a donnée ; `null` : pas de Gaulois enregistré, ou pas le droit d'en avoir un. */
  tenue: unknown;
  /** Le compte qui l'a lue : un autre compte ouvert dans ce navigateur la relit. */
  compte: string | null;
  /** Gardée pendant un passage au village : la page suivante la relit. */
  relire: boolean;
  /**
   * Le serveur n'a pas reconnu la session : l'heure de connexion de cette session (`""` inconnue). Une nouvelle connexion
   * dans l'onglet, à une autre heure, la relit.
   */
  refusee?: string;
}

/** La session ouverte : son compte, et l'heure de sa connexion (`last_sign_in_at`), qui ne change qu'à une nouvelle connexion. */
export interface Connexion {
  compte: string;
  depuis: string | null;
}

/** La tenue gardée, relue telle quelle ; `null` si elle manque ou ne ressemble à rien. */
export function lireLaTenueGardee(texte: string | null): TenueGardee | null {
  if (texte === null) return null;
  try {
    const brut: unknown = JSON.parse(texte);
    if (brut === null || typeof brut !== "object" || Array.isArray(brut) || !("tenue" in brut)) return null;
    const garde = brut as Record<string, unknown>;
    const lue: TenueGardee = { tenue: garde["tenue"] ?? null, compte: typeof garde["compte"] === "string" ? garde["compte"] : null, relire: garde["relire"] === true };
    return typeof garde["refusee"] === "string" ? { ...lue, refusee: garde["refusee"] } : lue;
  } catch {
    return null;
  }
}

/** Ce que la page doit faire de la tenue : laquelle montrer tout de suite, s'il faut la lire, et si l'on attend la lecture. */
export interface Besoin {
  tenue: unknown;
  /** Lire la tenue au serveur. */
  lire: boolean;
  /** Rien de gardé : attendre la réponse (au plus `ATTENTE_DU_SERVEUR_MS`) avant de le montrer, sans montrer d'abord le Gaulois de départ. */
  attendre: boolean;
  /** Personne n'est connecté : la tenue gardée et les images du membre s'effacent. */
  oublier: boolean;
}

export function besoinDeLaTenue(serveur: boolean, session: boolean, gardee: TenueGardee | null): Besoin {
  if (!serveur || !session) return { tenue: null, lire: false, attendre: false, oublier: true };
  if (!gardee) return { tenue: null, lire: true, attendre: true, oublier: false };
  return { tenue: gardee.tenue, lire: gardee.relire, attendre: false, oublier: false };
}

/** Les refus qui valent pour tout l'onglet : pas de Gaulois pour ce compte, on ne redemande pas. */
const REFUS_DEFINITIFS = new Set(["discord_required", "suspended", "forbidden"]);

/**
 * La tenue à garder après une lecture. Réussie : celle du serveur. Refus définitif : le Gaulois de départ. Session que le
 * serveur ne reconnaît pas (`not_signed_in`) : le Gaulois de départ, relu seulement à une nouvelle connexion dans l'onglet.
 * Panne : la tenue d'avant s'il y en a une, sinon le Gaulois de départ. Dans tous les cas, on ne redemande pas avant le
 * prochain passage au village : une seule lecture par onglet.
 */
export function apresLecture(reponse: { tenue: unknown } | { erreur: string }, avant: TenueGardee | null, connexion: Connexion, auVillage: boolean): TenueGardee {
  const { compte } = connexion;
  if ("tenue" in reponse) return { tenue: reponse.tenue ?? null, compte, relire: auVillage };
  if (reponse.erreur === "not_signed_in") return { tenue: null, compte, relire: auVillage, refusee: connexion.depuis ?? "" };
  if (REFUS_DEFINITIFS.has(reponse.erreur) || !avant) return { tenue: null, compte, relire: auVillage };
  return { tenue: avant.tenue, compte, relire: auVillage };
}

/**
 * La tenue gardée vaut-elle encore pour la session ouverte ? Non pour un autre compte, ni pour une nouvelle connexion
 * après un refus de la session : elle est alors relue. Une page de plus ou un jeton renouvelé ne la font pas relire.
 */
export function aRelirePour(gardee: TenueGardee | null, connexion: Connexion): boolean {
  if (!gardee) return false;
  if (gardee.compte !== null && gardee.compte !== connexion.compte) return true;
  return gardee.refusee !== undefined && gardee.refusee !== (connexion.depuis ?? "");
}

/** La clé d'une tenue pour les images gardées : ses emplacements dans un ordre fixe, quel que soit l'ordre reçu. */
export function cleDeLaTenue(brute: unknown): string {
  if (brute === null || brute === undefined) return "depart";
  try {
    if (typeof brute !== "object" || Array.isArray(brute)) return JSON.stringify(brute);
    const objet = brute as Record<string, unknown>;
    return JSON.stringify(Object.keys(objet).sort().map((cle) => [cle, objet[cle]]));
  } catch {
    return "illisible";
  }
}

/* ---------- Dans le navigateur ---------- */

const lireStockage = (cle: string): string | null => {
  try {
    return sessionStorage.getItem(cle);
  } catch {
    return null;
  }
};
const ecrireStockage = (cle: string, valeur: string | null): void => {
  try {
    if (valeur === null) sessionStorage.removeItem(cle);
    else sessionStorage.setItem(cle, valeur);
  } catch {
    // Stockage refusé : la tenue sera relue à la page suivante.
  }
};

export const tenueGardee = (): TenueGardee | null => lireLaTenueGardee(lireStockage(CLE_TENUE));
export const garderLaTenue = (gardee: TenueGardee | null): void => ecrireStockage(CLE_TENUE, gardee === null ? null : JSON.stringify(gardee));

/** Plus rien du membre dans l'onglet : ni sa tenue, ni les images peintes de son Gaulois. */
export function oublierLeMembre(): void {
  ecrireStockage(CLE_TENUE, null);
  ecrireStockage(CLE_IMAGES, null);
}

/** Les images gardées sont-elles celles du Gaulois de départ ? Sans images gardées, rien du membre ne reste non plus. */
export function imagesDeDepart(texte: string | null): boolean {
  if (texte === null) return true;
  try {
    return (JSON.parse(texte) as { deDepart?: unknown } | null)?.deDepart === true;
  } catch {
    return false;
  }
}

/** Ce que la page sait sans attendre : le serveur, la session, la tenue gardée. Sans session, efface ce qui reste du membre. */
export function besoinDeCettePage(): Besoin {
  const besoin = besoinDeLaTenue(AUTH_ENABLED, AUTH_ENABLED && mayHaveSession(), tenueGardee());
  if (besoin.oublier && (lireStockage(CLE_TENUE) !== null || !imagesDeDepart(lireStockage(CLE_IMAGES)))) oublierLeMembre();
  return besoin;
}

/** La tenue à dessiner sur cette page, sans rien attendre : celle gardée pour le membre connecté, sinon `null` (départ). */
export function tenueBruteDuCompagnon(): unknown {
  return besoinDeCettePage().tenue;
}

/** Au village, la tenue peut changer (vestiaire, marché) : la page suivante la relira, une fois. */
export function marquerUnPassageAuVillage(): void {
  const gardee = tenueGardee();
  if (gardee && !gardee.relire) garderLaTenue({ ...gardee, relire: true });
}

/**
 * Ce qu'annonce le vestiaire après un enregistrement (`detail.tenue`, la tenue que le serveur vient d'accepter) : gardée
 * pour les pages suivantes, et rendue pour habiller le compagnon tout de suite. `undefined` : rien à en faire (pas de
 * tenue dans l'annonce, ou plus personne de connecté).
 */
export function recevoirLaTenue(detail: unknown, auVillage: boolean): unknown {
  if (detail === null || typeof detail !== "object" || !("tenue" in detail)) return undefined;
  if (!AUTH_ENABLED || !mayHaveSession()) return undefined;
  const tenue = (detail as { tenue: unknown }).tenue ?? null;
  const avant = tenueGardee();
  garderLaTenue({ tenue, compte: avant?.compte ?? null, relire: auVillage || (avant?.relire ?? false) });
  return tenue;
}

/**
 * Lit la tenue au serveur, une fois, et la garde dans l'onglet. Rend la tenue gardée, ou `null` quand personne n'est plus
 * connecté. Ne lève jamais : un échec donne le Gaulois de départ.
 */
export async function lireLaTenue(auVillage: boolean): Promise<TenueGardee | null> {
  const avant = tenueGardee();
  let connexion: Connexion | null = null;
  try {
    const session = await getSession();
    if (session) connexion = { compte: session.user.id, depuis: session.user.last_sign_in_at ?? null };
  } catch {
    connexion = null;
  }
  if (connexion === null) {
    oublierLeMembre();
    return null;
  }
  let reponse: { tenue: unknown } | { erreur: string };
  try {
    const lue = await call<{ tenue?: unknown } | null>("get_mon_gaulois");
    reponse = { tenue: lue?.tenue ?? null };
  } catch (e) {
    reponse = { erreur: e instanceof ServerError ? e.code : "network" };
  }
  // Déconnecté pendant la lecture : rien n'est gardé.
  if (!mayHaveSession()) {
    oublierLeMembre();
    return null;
  }
  const suite = apresLecture(reponse, avant, connexion, auVillage);
  garderLaTenue(suite);
  return suite;
}

/**
 * Suit la session de ce navigateur, sur une page où elle existe : Supabase y est déjà chargé par l'en-tête. Déconnexion
 * (ici, dans un autre onglet, ou session perdue) : tout s'efface et `quand("parti")`. Un autre compte que celui de la tenue
 * gardée, ou une nouvelle connexion après un refus de la session : elle s'efface et `quand("autre")`, pour être relue.
 * Rend de quoi arrêter de suivre.
 */
export async function surveillerLeCompte(quand: (changement: "parti" | "autre") => void): Promise<() => void> {
  if (!AUTH_ENABLED || !mayHaveSession()) return () => undefined;
  try {
    const sb = await supabase();
    const { data } = sb.auth.onAuthStateChange((evenement, session) => {
      if (evenement === "SIGNED_OUT" || !session) {
        oublierLeMembre();
        quand("parti");
        return;
      }
      if (aRelirePour(tenueGardee(), { compte: session.user.id, depuis: session.user.last_sign_in_at ?? null })) {
        oublierLeMembre();
        quand("autre");
      }
    });
    return () => data.subscription.unsubscribe();
  } catch {
    return () => undefined;
  }
}

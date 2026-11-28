/**
 * Le seul point de contact entre le navigateur et le serveur de connexion (Supabase) : ses fonctions SQL, le dépôt d'une
 * image des messages Discord, la fonction serveur de la connexion par code (`signInWithCode`) et le compte des visites
 * (`noteSiteVisit`).
 * Le code de Supabase n'est chargé que pour un visiteur qui a une session ou qui ouvre une page de compte.
 * Rien de ce qui s'affiche ici ne protège quoi que ce soit : chaque fonction du serveur
 * revérifie l'appelant. Masquer un bouton n'est qu'une politesse.
 */
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "./errors";
import { setPlayerView } from "./vue-joueur";
import type { AdversairesDuDuel, ContreQui, EtatDuDuel, MainDuDuel, MainEnregistree, PartieRendue } from "../village/contrat-duel";
import type { EtatDesSalles } from "../village/contrat-salles";
import type {
  CoupDeLaCourse, CoupDeLaMachine, CoupDeLaPalissade, CoupDeLaRoue, CoupDesDes, CoupDuVingtEtUn, EtatDuCasino, LectureDuVingtEtUn, MisesDeLaRoue, MisesDesDes,
  ReponseDuVingtEtUn, CoupDuPoker, DonneDuPoker,
} from "../village/contrat-casino";

export const SUPABASE_URL = (import.meta.env.PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
export const SUPABASE_KEY = import.meta.env.PUBLIC_SUPABASE_KEY ?? "";
/** Sans ces deux réglages, le site reste entièrement statique et la connexion n'apparaît pas. */
export const AUTH_ENABLED = SUPABASE_URL !== "" && SUPABASE_KEY !== "";

/** Là où la session est gardée dans le navigateur. Ce nom date de l'ancien jeu : le changer déconnecterait tout le monde. */
export const SESSION_KEY = "gal-conquete-session";

export const basePath = (): string => import.meta.env.BASE_URL.replace(/\/$/, "");

/** Le brouillon des messages Discord de la Direction, gardé dans ce navigateur : effacé à la déconnexion. */
export const MESSAGE_DRAFT_KEY = "gal-direction-message";

/**
 * Le carnet des touchers de la place du village, effacé à la déconnexion lui aussi. La place et le toucher des Gaulois ont
 * été retirés le 15 novembre 2026 avec le monde du village : la clé reste, pour vider ce carnet chez qui l'a encore.
 */
export const VILLAGE_TOUCHER_KEY = "gal-village-toucher";

function forgetDrafts(): void {
  try {
    localStorage.removeItem(MESSAGE_DRAFT_KEY);
    localStorage.removeItem(VILLAGE_TOUCHER_KEY);
  } catch {
    // Stockage refusé : il n'y a rien à effacer.
  }
}

/** Une session est peut-être ouverte ici. Sinon, inutile de télécharger Supabase : il n'y a personne à reconnaître. */
export function mayHaveSession(): boolean {
  try {
    // Au retour de Discord, la session n'est pas encore enregistrée : seul le code de l'adresse l'annonce.
    return localStorage.getItem(SESSION_KEY) !== null || new URLSearchParams(location.search).has("code");
  } catch {
    return false;
  }
}

export class ServerError extends Error {
  constructor(readonly code: string) {
    super(errorMessage(code));
  }
}

let client: Promise<SupabaseClient> | null = null;

export function supabase(): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) => {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: SESSION_KEY },
    });
    // Session fermée ou perdue (jeton révoqué, déconnexion ailleurs) : la vue joueur n'a plus de compte à montrer.
    sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setPlayerView(false);
        forgetDrafts();
      }
    });
    return sb;
  });
  return client;
}

/** Appelle une fonction du serveur. Lève une ServerError au message en français si elle refuse. */
/**
 * Le nom de l'annonce du solde : le serveur vient de donner la bourse du compte (`solde`, dans sa réponse ou dans un de ses
 * blocs), et la page le fait savoir. Le bandeau de « Mon Gaulois » le suit ainsi sans relire le serveur, quel que soit
 * l'onglet qui a acheté, gravé ou ouvert. Rien n'est calculé ici : c'est le nombre du serveur, tel quel.
 */
export const SOLDE_ANNONCE = "gal:solde";

/**
 * Le solde que porte une réponse du serveur : son champ `solde`, ou celui d'un de ses blocs de premier niveau (la forge
 * le range dans `forge`), s'il est un entier positif ou nul ; `null` sinon. Les listes sont écartées : une ligne d'une
 * liste n'est pas la bourse du compte.
 */
export function soldeDeLaReponse(reponse: unknown): number | null {
  if (reponse === null || typeof reponse !== "object" || Array.isArray(reponse)) return null;
  const blocs = [reponse, ...Object.values(reponse).filter((v) => v !== null && typeof v === "object" && !Array.isArray(v))] as Record<string, unknown>[];
  const solde = blocs.map((b) => b["solde"]).find((v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0);
  return typeof solde === "number" ? solde : null;
}

function annoncerLeSolde(reponse: unknown): void {
  if (typeof window === "undefined") return;
  const solde = soldeDeLaReponse(reponse);
  if (solde !== null) window.dispatchEvent(new CustomEvent(SOLDE_ANNONCE, { detail: { solde } }));
}

export async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = await supabase();
  let response: Awaited<ReturnType<SupabaseClient["rpc"]>>;
  try {
    response = await sb.rpc(fn, args);
  } catch {
    throw new ServerError("network");
  }
  const { data, error } = response;
  if (error) throw new ServerError(error.code === "42501" ? "not_signed_in" : "network");
  const result = data as ({ ok?: boolean; error?: string } & T) | null;
  if (result?.ok === false) throw new ServerError(result.error ?? "network");
  annoncerLeSolde(result);
  return result as T;
}

/** L'espace public des images des messages Discord (migration `20261111000600_messages_discord.sql`). */
const DISCORD_IMAGES = "discord-images";

/** Le refus du stockage, ramené à un code de `errors.ts`. */
export function uploadErrorCode(error: { status?: number | undefined; statusCode?: string | undefined; message?: string }): string {
  const status = error.status ?? Number(error.statusCode);
  const message = error.message ?? "";
  if (status === 401) return "not_signed_in";
  if (status === 413 || /maximum allowed size|too large/i.test(message)) return "image_too_large";
  if (status === 415 || /mime type/i.test(message)) return "invalid_image";
  if (status === 403 || /row-level security|unauthorized/i.test(message)) return "forbidden";
  return "image_upload_failed";
}

/**
 * Dépose une image d'un message Discord et rend son adresse publique : Discord ne lit une image d'embed qu'à une adresse.
 * Le seul envoi de fichier du site. Le serveur décide, comme pour les fonctions : la règle d'accès du stockage ne laisse
 * déposer que les admins et le fondateur, sous un nom tiré au sort, et l'espace refuse ce qui n'est pas une image PNG,
 * JPEG, GIF ou WebP de 8 Mo au plus.
 */
export async function uploadDiscordImage(file: Blob, extension: string): Promise<string> {
  const sb = await supabase();
  const bucket = sb.storage.from(DISCORD_IMAGES);
  const path = `${crypto.randomUUID()}.${extension}`;
  let result: Awaited<ReturnType<typeof bucket.upload>>;
  try {
    result = await bucket.upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  } catch {
    throw new ServerError("network");
  }
  if (result.error) throw new ServerError(uploadErrorCode(result.error));
  return bucket.getPublicUrl(path).data.publicUrl;
}

export async function getSession(): Promise<Session | null> {
  const sb = await supabase();
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function signInWithDiscord(returnPath: string): Promise<void> {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: `${location.origin}${basePath()}${returnPath}` },
  });
  if (error) throw new ServerError("network");
}

export { CODE_LOGIN_OPEN } from "./connexion-code";

/**
 * Le second chemin du navigateur vers le serveur, à côté des fonctions SQL : la fonction `code-discord` vérifie le code et
 * rend de quoi ouvrir la session, que Supabase échange ensuite contre la session elle-même. Le serveur décide de tout : un
 * code faux, usé ou de plus de cinq minutes est refusé là-bas.
 */
export async function signInWithCode(code: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/code-discord/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
  } catch {
    throw new ServerError("code_unavailable");
  }
  let result: { ok?: unknown; error?: unknown; token_hash?: unknown } | null;
  try {
    result = (await response.json()) as typeof result;
  } catch {
    result = null;
  }
  if (result?.ok !== true || typeof result.token_hash !== "string") {
    throw new ServerError(typeof result?.error === "string" ? result.error : "code_unavailable");
  }
  // Le lien vient d'être créé pour ce compte : s'il est refusé, la panne est chez le serveur, pas dans le code tapé.
  const sb = await supabase();
  const { error } = await sb.auth.verifyOtp({ token_hash: result.token_hash, type: "magiclink" });
  if (error) throw new ServerError("code_unavailable");
}

/**
 * Le troisième chemin vers le serveur : le compte des visites (`src/scripts/visite.ts`). Un simple `fetch`, pour ne pas
 * charger le code de Supabase sur chaque page. Il ne fait qu'ajouter aux totaux ; le serveur vérifie et range tout
 * (`note_site_visit`, migration `20261113001500_activite_du_site.sql`). Un échec ne se voit pas : le compteur ne doit
 * jamais gêner la visite.
 */
export function noteSiteVisit(payload: string): void {
  fetch(`${SUPABASE_URL}/rest/v1/rpc/note_site_visit`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  }).catch(() => undefined);
}

export async function signOut(): Promise<void> {
  // Le prochain compte ouvert dans ce navigateur repart de la vue normale, sans le brouillon d'un autre.
  setPlayerView(false);
  forgetDrafts();
  const sb = await supabase();
  await sb.auth.signOut();
}

/**
 * Le duel des Gaulois, « Coup pour coup » (migration `20261122000100_duel_des_gaulois`, formes des réponses :
 * `src/lib/village/contrat-duel.ts`). Le serveur décide de tout : il garde les mains, choisit la carte de la machine sans
 * voir la tienne et résout chaque manche. Un refus devient une `ServerError` dont le code est dans `REFUS_DU_DUEL`.
 */
export const duel = {
  /** Tout l'écran du duel. */
  etat: (): Promise<EtatDuDuel> => call<EtatDuDuel>("get_mon_duel"),
  /** La main de défense, que la machine joue quand un autre membre te défie. */
  enregistrerMain: (main: MainDuDuel): Promise<MainEnregistree> => call<MainEnregistree>("enregistrer_main_duel", { p_main: main }),
  /** Les Gaulois qu'on peut défier. */
  adversaires: (): Promise<AdversairesDuDuel> => call<AdversairesDuDuel>("get_adversaires_duel"),
  /** Un duel contre la main de défense d'un membre (sa clé) ou contre le boss du jour (sans clé), avec ta main. */
  commencer: (contre: ContreQui, cle: string | null, main: MainDuDuel): Promise<PartieRendue> => call<PartieRendue>("commencer_duel", { p_contre: contre, p_cle: cle, p_main: main }),
  /** Pose ta carte (de 0 à 4) pour la manche `manche` ; la réponse dit la carte de la machine et la partie après la manche. */
  jouerManche: (partie: number, manche: number, carte: number): Promise<PartieRendue> => call<PartieRendue>("jouer_manche_duel", { p_partie: partie, p_manche: manche, p_carte: carte }),
  /** Abandonne la partie : elle est perdue. */
  abandonner: (partie: number): Promise<PartieRendue> => call<PartieRendue>("abandonner_duel", { p_partie: partie }),
};

/**
 * Les salles en direct du duel, avec mise (migration `20261122001000_duel_salles_en_direct`, formes des réponses :
 * `src/lib/village/contrat-salles.ts`). Le serveur apparie, garde les mises et la carte posée de chacun, compte le temps et
 * résout chaque manche. Chaque appel rend l'état entier ; l'écran le relit environ chaque seconde. Un refus devient une
 * `ServerError` dont le code est dans `REFUS_DES_SALLES` (ou ceux du duel).
 */
export const salles = {
  /** Tout l'écran des salles ; donne aussi des nouvelles de qui attend. */
  etat: (): Promise<EtatDesSalles> => call<EtatDesSalles>("get_salles_duel"),
  /** Entre dans la salle `mise` avec ta main : rejoint le premier qui attend, ou attend. */
  entrer: (mise: number, main: MainDuDuel): Promise<EtatDesSalles> => call<EtatDesSalles>("entrer_salle_duel", { p_mise: mise, p_main: main }),
  /** Pose ta carte (de 0 à 4) pour la manche `manche` du match : elle reste cachée jusqu'à ce que l'autre pose. */
  poser: (match: number, manche: number, carte: number): Promise<EtatDesSalles> => call<EtatDesSalles>("poser_carte_salle", { p_match: match, p_manche: manche, p_carte: carte }),
  /** Quitte ta salle (rien n'est perdu) ; avec `match`, quitte aussi ce match (il est perdu). */
  quitter: (match: number | null = null): Promise<EtatDesSalles> => call<EtatDesSalles>("quitter_salle_duel", { p_match: match }),
};

/** Ce qu'un coup du casino attend au plus la réponse du serveur, en millisecondes. */
export const DELAI_DU_CASINO = 20_000;
/**
 * Un appel du casino sans réponse au bout de `DELAI_DU_CASINO` devient un refus `delai` : un jeu ne reste jamais suspendu
 * à une réponse qui ne vient pas (réseau coupé, session bloquée), il rouvre ses boutons et le dit. Le serveur, lui, a pu
 * jouer le coup entre-temps : c'est lui qui fait foi, et « Vos dernières parties » comme la bourse le montrent à la
 * relecture suivante (le vingt-et-un relit sa main aussitôt).
 */
export function avecDelai<T>(p: Promise<T>, ms = DELAI_DU_CASINO): Promise<T> {
  return new Promise<T>((ok, ko) => {
    const minuteur = setTimeout(() => ko(new ServerError("delai")), ms);
    p.then(
      (v) => {
        clearTimeout(minuteur);
        ok(v);
      },
      (e: unknown) => {
        clearTimeout(minuteur);
        ko(e);
      },
    );
  });
}

/**
 * Le casino des Gaulois (migration `20261123000100_casino_des_gaulois`, formes des réponses :
 * `src/lib/village/contrat-casino.ts`). Le serveur tire tout, d'abord, prend la mise et rend le gain ; l'écran ne fait que
 * montrer. Un refus lève une `ServerError` dont le code est dans `REFUS_DU_CASINO`. Le solde d'après un coup s'appelle
 * `solde_apres` : `call` ne l'annonce pas, l'écran le fait quand le résultat est montré.
 */
export const casino = {
  /** Tout l'écran du casino, et la main du vingt-et-un laissée ouverte. */
  etat: (): Promise<EtatDuCasino> => avecDelai(call<EtatDuCasino>("get_casino")),
  /** Un tour de roue avec les paris de la table. */
  roue: (paris: MisesDeLaRoue): Promise<CoupDeLaRoue> => avecDelai(call<CoupDeLaRoue>("jouer_roue", { p_paris: paris })),
  /** Un tirage de la machine. */
  machine: (mise: number): Promise<CoupDeLaMachine> => avecDelai(call<CoupDeLaMachine>("jouer_machine", { p_mise: mise })),
  /** Une course, sur le couloir `couloir` (0 à 5). */
  course: (couloir: number, mise: number): Promise<CoupDeLaCourse> => avecDelai(call<CoupDeLaCourse>("jouer_course", { p_couloir: couloir, p_mise: mise })),
  /** Un lâcher de statère à la palissade. */
  palissade: (mise: number): Promise<CoupDeLaPalissade> => avecDelai(call<CoupDeLaPalissade>("jouer_palissade", { p_mise: mise })),
  /** Un lancer de dés avec les paris de la table. */
  des: (paris: MisesDesDes): Promise<CoupDesDes> => avecDelai(call<CoupDesDes>("jouer_des", { p_paris: paris })),
  /**
   * Une main du vingt-et-un commence avec la mise `mise` et `trois` statères sur « Trois cartes », la mise à côté. Sans mise à
   * côté, l'appel est celui d'avant (`p_mise` seul).
   */
  distribuer: (mise: number, trois = 0): Promise<ReponseDuVingtEtUn> =>
    avecDelai(call<ReponseDuVingtEtUn>("distribuer_vingt_et_un", trois > 0 ? { p_mise: mise, p_trois: trois } : { p_mise: mise })),
  /** Un coup sur la main `partie`, vue au tour `tour` (celui de la dernière réponse). */
  jouer: (partie: number, tour: number, coup: CoupDuVingtEtUn): Promise<ReponseDuVingtEtUn> => avecDelai(call<ReponseDuVingtEtUn>("jouer_vingt_et_un", { p_partie: partie, p_tour: tour, p_coup: coup })),
  /** La main laissée ouverte, à reprendre, ou `null`. */
  lire: (): Promise<LectureDuVingtEtUn> => avecDelai(call<LectureDuVingtEtUn>("lire_vingt_et_un")),
  /** Le poker du barde : la mise et la donne des cinq cartes (refus `main_en_cours` si une main attend). */
  distribuerPoker: (mise: number): Promise<DonneDuPoker> => avecDelai(call<DonneDuPoker>("distribuer_poker", { p_mise: mise })),
  /** Le poker du barde : les cartes gardées sur la main `partie`, le tirage, ce que rend la main. */
  jouerPoker: (partie: number, gardes: boolean[]): Promise<CoupDuPoker> => avecDelai(call<CoupDuPoker>("jouer_poker", { p_partie: partie, p_gardes: gardes })),
};

/**
 * Le tableau des duellistes et la saison du duel (migration `20261122002000_duel_tableau_et_saison`, formes des réponses :
 * `src/lib/village/contrat-tableau.ts`, qui les lit sans confiance). Le serveur classe, couronne le premier de chaque
 * semaine et partage la cagnotte de la saison ; l'écran ne fait que lire.
 */
export const tableauDuel = {
  /** Le tableau de la semaine et de la saison, la cagnotte, la dernière semaine couronnée, tes insignes. */
  etat: (): Promise<unknown> => call<unknown>("get_tableau_duel"),
  /** Tes insignes du duelliste de la semaine, pour ta carte. */
  mesInsignes: (): Promise<unknown> => call<unknown>("get_mes_insignes_duel"),
};

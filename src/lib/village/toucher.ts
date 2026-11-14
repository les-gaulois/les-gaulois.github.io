/**
 * Toucher un Gaulois de la place (demande du pilote, le 14 novembre 2026) : on clique sur un Gaulois, il répond dans une
 * bulle ; si on insiste dans l'heure, il s'agace, de plus en plus. Calculs purs : l'écran (`PlaceToucher.tsx`) ne fait que
 * les appeler et garder le carnet dans le navigateur. Rien n'est envoyé au serveur, aucun appel de plus, aucune dépense.
 *
 * La règle, pour un même Gaulois et un même visiteur :
 * - le compte tient une heure à partir du premier toucher ; l'heure passée, il repart de un ;
 * - la 1re fois, il dit sa bulle du serveur s'il en a une (et s'il ne vient pas de la dire), sinon un salut ;
 * - les 2e et 3e fois, une phrase aimable, selon le lieu où il est ;
 * - de la 4e à la 6e fois, il est agacé ; de la 7e à la 10e, excédé ; au-delà, furieux, jusqu'à la fin de l'heure ;
 * - dans les maisons, il dort : il marmonne dans son sommeil (1re à 3e fois), puis il grogne, sans jamais se réveiller ;
 * - son propre Gaulois a ses phrases à lui ;
 * - jamais deux fois la même phrase de suite, et pas une des six dernières tant que la liste le permet.
 * Les phrases sont dans `repliques-toucher.ts`.
 */
import { AGACES, AIMABLES, EXCEDES, FURIEUX, LE_SIEN, LE_SIEN_AGACE, SALUTS, SOMMEIL, SOMMEIL_AGACE } from "./repliques-toucher";
import type { Lieu } from "./vie";

/** La durée du compte, à partir du premier toucher. */
export const HEURE_MS = 60 * 60_000;
/** Jusqu'à cette fois, il reste aimable ; puis agacé, excédé jusqu'à ces fois-là, et furieux au-delà. */
export const FOIS_AIMABLE = 3;
export const FOIS_AGACE = 6;
export const FOIS_EXCEDE = 10;
/** Le nombre de ses dernières phrases qu'un Gaulois évite de redire. */
export const MEMOIRE_DES_PHRASES = 6;
/** Un carnet ne garde pas un Gaulois touché il y a plus d'un jour, ni plus de Gaulois que cela. */
export const CARNET_JOUR_MS = 24 * HEURE_MS;
export const CARNET_MAX = 200;
/** Le nom sous lequel le carnet est gardé dans le navigateur. */
export const CLE_DU_CARNET = "gal-village-toucher";

/** L'humeur du Gaulois à ce toucher. */
export type Palier = "premier" | "aimable" | "agace" | "excede" | "furieux";

/** L'humeur au `fois`-ième toucher de l'heure. */
export function palierDuToucher(fois: number): Palier {
  if (fois <= 1) return "premier";
  if (fois <= FOIS_AIMABLE) return "aimable";
  if (fois <= FOIS_AGACE) return "agace";
  if (fois <= FOIS_EXCEDE) return "excede";
  return "furieux";
}

/** Le compte d'un Gaulois : l'instant du premier toucher de l'heure, le nombre de touchers, ses dernières phrases. */
export interface Compte {
  debut: number;
  fois: number;
  /** Ses dernières phrases, la plus récente à la fin : `MEMOIRE_DES_PHRASES` au plus. */
  dites: string[];
}

/** Le carnet du visiteur. `vu` : il a déjà touché un Gaulois, le mot d'emploi ne s'affiche plus. */
export interface Carnet {
  vu: boolean;
  comptes: Record<string, Compte>;
}

export const carnetVide = (): Carnet => ({ vu: false, comptes: {} });

/** La clé d'un Gaulois dans le carnet : son nom, derrière un préfixe (un nom ne peut pas être une clé spéciale d'objet). */
export const cleDuGaulois = (nom: string): string => `g:${nom}`;

/** Le compte après un toucher de plus à cet instant. L'heure passée, ou une horloge revenue en arrière : il repart de un. */
export function compterLeToucher(avant: Compte | undefined, maintenant: number): Compte {
  if (!avant || !(maintenant >= avant.debut) || maintenant - avant.debut >= HEURE_MS) return { debut: maintenant, fois: 1, dites: avant?.dites ?? [] };
  return { debut: avant.debut, fois: avant.fois + 1, dites: avant.dites };
}

/** Ce qu'il faut savoir du Gaulois touché. */
export interface Touche {
  /** Le combientième toucher de l'heure. */
  fois: number;
  lieu: Lieu;
  /** C'est le Gaulois du visiteur. */
  moi: boolean;
  /** Sa bulle du serveur, s'il en a une. */
  replique: string | null;
}

/** La liste où se tire la phrase, d'après la règle écrite en tête de ce fichier. */
export function listeDuToucher({ fois, lieu, moi, replique }: Touche): readonly string[] {
  const palier = palierDuToucher(fois);
  const aimable = palier === "premier" || palier === "aimable";
  if (lieu === "maisons") return aimable ? SOMMEIL : SOMMEIL_AGACE;
  if (palier === "premier" && replique) return [replique];
  if (aimable) return moi ? LE_SIEN : palier === "premier" ? SALUTS : AIMABLES[lieu];
  const liste = palier === "agace" ? AGACES : palier === "excede" ? EXCEDES : FURIEUX;
  return moi ? [...liste, ...LE_SIEN_AGACE] : liste;
}

/** Une phrase tirée au sort dans la liste. `hasard` : un tirage entre 0 et 1, qu'un test peut fixer. */
function tirer(liste: readonly string[], hasard: () => number): string {
  return liste[Math.min(liste.length - 1, Math.max(0, Math.floor(hasard() * liste.length)))] ?? "";
}

/**
 * La phrase de ce toucher. `dites` : ses dernières phrases, la plus récente à la fin. Jamais la dernière ; pas une des
 * dernières tant qu'il en reste d'autres. Sa bulle du serveur, s'il vient de la dire, laisse la place à un salut.
 */
export function phraseDuToucher(touche: Touche, dites: readonly string[], hasard: () => number = Math.random): string {
  const derniere = dites[dites.length - 1];
  let liste = listeDuToucher(touche);
  if (liste.length === 1 && liste[0] === derniere) liste = listeDuToucher({ ...touche, replique: null });
  const neuves = liste.filter((phrase) => !dites.includes(phrase));
  if (neuves.length > 0) return tirer(neuves, hasard);
  const autres = liste.filter((phrase) => phrase !== derniere);
  return tirer(autres.length > 0 ? autres : liste, hasard);
}

/** Le résultat d'un toucher : la phrase, l'humeur, le combientième de l'heure, et le carnet à garder. */
export interface Reponse {
  phrase: string;
  palier: Palier;
  fois: number;
  carnet: Carnet;
}

/** Un toucher : le compte avance, la phrase est tirée, le carnet rendu est neuf (celui d'avant n'est pas modifié). */
export function toucherLeGaulois(carnet: Carnet, gaulois: { nom: string; moi: boolean; replique?: string | null }, lieu: Lieu, maintenant: number, hasard: () => number = Math.random): Reponse {
  const cle = cleDuGaulois(gaulois.nom);
  const compte = compterLeToucher(carnet.comptes[cle], maintenant);
  const phrase = phraseDuToucher({ fois: compte.fois, lieu, moi: gaulois.moi, replique: gaulois.replique ?? null }, compte.dites, hasard);
  const dites = [...compte.dites, phrase].slice(-MEMOIRE_DES_PHRASES);
  return { phrase, palier: palierDuToucher(compte.fois), fois: compte.fois, carnet: { vu: true, comptes: { ...carnet.comptes, [cle]: { ...compte, dites } } } };
}

/** Il sursaute : quand il s'agace, sauf dans son lit. Le dessin seul bouge, jamais ce qui est dit. */
export const sursaute = (palier: Palier, lieu: Lieu): boolean => lieu !== "maisons" && palier !== "premier" && palier !== "aimable";

/** Les comptes encore utiles à cet instant : touchés depuis moins d'un jour, les plus récents d'abord, `CARNET_MAX` au plus. */
function elaguer(comptes: Record<string, Compte>, maintenant: number): Record<string, Compte> {
  const gardes = Object.entries(comptes)
    .filter(([, compte]) => maintenant - compte.debut < CARNET_JOUR_MS)
    .sort((a, b) => b[1].debut - a[1].debut)
    .slice(0, CARNET_MAX);
  return Object.fromEntries(gardes);
}

/**
 * Le carnet relu du navigateur. Absent, illisible ou d'une autre forme : un carnet vide ; un compte abîmé est laissé de
 * côté. Rien ne casse : au pire, le Gaulois redit bonjour.
 */
export function lireCarnet(texte: string | null | undefined, maintenant: number): Carnet {
  if (typeof texte !== "string" || texte === "") return carnetVide();
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return carnetVide();
  }
  if (brut === null || typeof brut !== "object" || Array.isArray(brut)) return carnetVide();
  const { vu, comptes } = brut as Record<string, unknown>;
  const lus: Record<string, Compte> = {};
  if (comptes !== null && typeof comptes === "object" && !Array.isArray(comptes)) {
    for (const [cle, valeur] of Object.entries(comptes as Record<string, unknown>)) {
      if (!cle.startsWith("g:") || valeur === null || typeof valeur !== "object") continue;
      const { debut, fois, dites } = valeur as Record<string, unknown>;
      if (typeof debut !== "number" || !Number.isFinite(debut) || typeof fois !== "number" || !Number.isInteger(fois) || fois < 1) continue;
      lus[cle] = { debut, fois, dites: Array.isArray(dites) ? dites.filter((d): d is string => typeof d === "string").slice(-MEMOIRE_DES_PHRASES) : [] };
    }
  }
  return { vu: vu === true, comptes: elaguer(lus, maintenant) };
}

/** Le carnet à écrire dans le navigateur, élagué. */
export function ecrireCarnet(carnet: Carnet, maintenant: number): string {
  return JSON.stringify({ vu: carnet.vu, comptes: elaguer(carnet.comptes, maintenant) });
}

/** Le temps de lire une bulle, en millisecondes : de 4 à 9 secondes selon sa longueur (une bulle automatique en tient 7). */
export function dureeDeLaBulle(phrase: string): number {
  return Math.min(9_000, Math.max(4_000, 2_500 + 70 * Array.from(phrase).length));
}

/** Une espace qui ne se coupe pas, devant un point d'interrogation, un point d'exclamation ou un deux-points. */
const INSECABLE = String.fromCharCode(160);

/** La phrase prête à écrire dans la bulle : « ! » et « ? » ne passent jamais seuls à la ligne. */
export function ponctuer(phrase: string): string {
  return phrase.replace(/ ([?!;:])/g, `${INSECABLE}$1`);
}

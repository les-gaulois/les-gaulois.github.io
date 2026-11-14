/**
 * L'écran de la place du village (onglet « La place » de `/village`) : ce que la page calcule à partir de la réponse du
 * serveur (`get_village`, contrat dans `contrat.ts`). Le serveur décide de qui est au village et donne les faits ; ici,
 * seulement la relecture de sa réponse, les tailles et les mots. Qui est où : `vie.ts`.
 */
import { lireTenue } from "../gaulois";
import type { GauloisDeLaPlace, Village } from "./contrat";
import { DECOR_LARGEUR_MIN } from "./decor";
import { lireReplique } from "./vie";

/** Le côté d'une case du décor, en pixels : 2 sur téléphone, 3 à partir d'une tablette. */
export const CASE_TELEPHONE = 2;
export const CASE_ORDINATEUR = 3;
/** La largeur d'écran, en pixels, à partir de laquelle le décor passe à la grande case. */
export const LARGEUR_ORDINATEUR = 768;
/** Jusqu'à ce nombre de Gaulois dans le lieu ouvert, un écran large le montre en grand ; au-delà, il prend du recul. */
export const FOULE_EN_GRAND = 12;

/**
 * Jusqu'à ce nombre de Gaulois dans le lieu ouvert, un téléphone garde sa case de 2 pixels ; au-delà, il prend du recul à
 * son tour, pour que la page ne s'allonge pas sur des écrans et des écrans (80 Gaulois : 6 000 pixels de haut sans cela).
 */
export const FOULE_AU_TELEPHONE = 24;
/** Le côté d'une case quand un téléphone prend du recul : chaque Gaulois fait alors 48 pixels sur 64, toujours nets. */
export const CASE_DE_LOIN = 1;

/** Le côté d'une case de la scène, décor et Gaulois ensemble, pour cet écran et ce nombre de Gaulois dans le lieu. */
export function caseDeLaScene(largeurEcran: number, nombre: number): number {
  if (largeurEcran >= LARGEUR_ORDINATEUR) return nombre <= FOULE_EN_GRAND ? CASE_ORDINATEUR : CASE_TELEPHONE;
  return nombre <= FOULE_AU_TELEPHONE ? CASE_TELEPHONE : CASE_DE_LOIN;
}

/** Le nombre de cases du décor pour remplir une scène de cette largeur : jamais moins que le plus petit décor. */
export function largeurDuDecor(largeurScene: number, cote: number): number {
  if (!(largeurScene > 0) || !(cote > 0)) return DECOR_LARGEUR_MIN;
  return Math.max(DECOR_LARGEUR_MIN, Math.ceil(largeurScene / cote));
}

/** Un instant écrit par le serveur : gardé tel quel s'il se lit comme une date, `null` sinon. */
function lireInstant(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur !== "" && !Number.isNaN(new Date(valeur).getTime()) ? valeur : null;
}

/**
 * La réponse de `get_village`, relue : un Gaulois sans nom ou à la tenue illisible n'est pas dessiné. Les faits de la vie
 * du village que le serveur ne donne pas, ou donne mal, valent `null` : « rien de connu ». `null` : la réponse n'a pas la
 * forme du contrat.
 */
export function lireVillage(reponse: unknown): Village | null {
  if (reponse === null || typeof reponse !== "object") return null;
  const brut = reponse as Record<string, unknown>;
  if (!Array.isArray(brut["gaulois"])) return null;
  const gaulois: GauloisDeLaPlace[] = [];
  for (const ligne of brut["gaulois"] as unknown[]) {
    if (ligne === null || typeof ligne !== "object") continue;
    const { nom, tenue, moi, partie_le, vocal, replique } = ligne as Record<string, unknown>;
    const lue = lireTenue(tenue);
    if (typeof nom !== "string" || nom.trim() === "" || !lue) continue;
    gaulois.push({ nom: nom.trim(), tenue: lue, moi: moi === true, partie_le: lireInstant(partie_le), vocal: typeof vocal === "boolean" ? vocal : null, replique: lireReplique(replique) });
  }
  return { ok: true, gaulois, releve: lireInstant(brut["releve"]) };
}

/** Le membre n'est pas au village : il n'a pas encore créé son Gaulois. */
export const sonGauloisManque = (village: Village): boolean => !village.gaulois.some((g) => g.moi);

/** Les mots de la place pour un refus du serveur ; `null` : le message courant du refus convient. */
export function messageDeLaPlace(code: string): string | null {
  return code === "not_validated" ? "La place s'ouvre une fois votre compte validé." : null;
}

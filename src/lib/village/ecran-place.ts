/**
 * L'écran de la place du village (onglet « La place » de `/village`) : ce que la page calcule à partir de la réponse du
 * serveur (`get_village`, contrat dans `contrat.ts`). Le serveur décide de qui est sur la place ; ici, seulement l'ordre
 * d'affichage, les tailles et les mots.
 */
import { lireTenue } from "../gaulois";
import type { GauloisDeLaPlace, Village } from "./contrat";
import { DECOR_LARGEUR_MIN } from "./decor";

/** Le côté d'une case du décor, en pixels : 2 sur téléphone, 3 à partir d'une tablette. */
export const CASE_TELEPHONE = 2;
export const CASE_ORDINATEUR = 3;
/** La largeur d'écran, en pixels, à partir de laquelle le décor passe à la grande case. */
export const LARGEUR_ORDINATEUR = 768;

export const caseDuDecor = (largeurEcran: number): number => (largeurEcran >= LARGEUR_ORDINATEUR ? CASE_ORDINATEUR : CASE_TELEPHONE);

/** Le nombre de cases du décor pour remplir une scène de cette largeur : jamais moins que le plus petit décor. */
export function largeurDuDecor(largeurScene: number, cote: number): number {
  if (!(largeurScene > 0) || !(cote > 0)) return DECOR_LARGEUR_MIN;
  return Math.max(DECOR_LARGEUR_MIN, Math.ceil(largeurScene / cote));
}

/** Jusqu'à ce nombre, les Gaulois se dessinent en grand sur un écran large ; au-delà, en plus petit, pour tenir en rangées. */
export const FOULE_EN_GRAND = 12;
export type TailleDesGaulois = "grand" | "petit";
export const tailleDesGaulois = (nombre: number): TailleDesGaulois => (nombre <= FOULE_EN_GRAND ? "grand" : "petit");

/**
 * La réponse de `get_village`, relue : un Gaulois sans nom ou à la tenue illisible n'est pas dessiné. `null` : la réponse
 * n'a pas la forme du contrat.
 */
export function lireVillage(reponse: unknown): Village | null {
  if (reponse === null || typeof reponse !== "object") return null;
  const brut = reponse as Record<string, unknown>;
  if (!Array.isArray(brut["gaulois"])) return null;
  const gaulois: GauloisDeLaPlace[] = [];
  for (const ligne of brut["gaulois"] as unknown[]) {
    if (ligne === null || typeof ligne !== "object") continue;
    const { nom, tenue, moi } = ligne as Record<string, unknown>;
    const lue = lireTenue(tenue);
    if (typeof nom !== "string" || nom.trim() === "" || !lue) continue;
    gaulois.push({ nom: nom.trim(), tenue: lue, moi: moi === true });
  }
  return { ok: true, visible: brut["visible"] !== false, gaulois };
}

/** L'ordre sur la place : le sien d'abord, près du feu, puis les autres dans l'ordre du serveur. */
export function ordreDeLaPlace(gaulois: readonly GauloisDeLaPlace[]): GauloisDeLaPlace[] {
  return [...gaulois.filter((g) => g.moi), ...gaulois.filter((g) => !g.moi)];
}

/** Le membre veut se montrer, mais n'est pas sur la place : il n'a pas encore créé son Gaulois. */
export const sonGauloisManque = (village: Village): boolean => village.visible && !village.gaulois.some((g) => g.moi);

/** « 1 Gaulois sur la place », « 12 Gaulois sur la place ». Rien pour une place vide : c'est une autre phrase. */
export function compteDeLaPlace(nombre: number): string | null {
  return nombre > 0 ? `${nombre} Gaulois sur la place` : null;
}

/** Les mots de la place pour un refus du serveur ; `null` : le message courant du refus convient. */
export function messageDeLaPlace(code: string): string | null {
  return code === "not_validated" ? "La place s'ouvre une fois votre compte validé." : null;
}

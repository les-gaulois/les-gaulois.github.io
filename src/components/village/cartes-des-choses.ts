import type { ComponentChildren } from "preact";
import { cleDuFamilier, cleDuModele } from "../../lib/village/fonds-objets";
import { vignetteDuFamilier } from "../../lib/village/ecran-familiers";
import { TAILLES, tailleDuFamilier, type Familier } from "../../lib/village/familiers";
import { modeleNu, type ModeleRange } from "../../lib/village/modeles";
import type { ProprietesDeLaCarte } from "./CarteDeCosmetique";

/**
 * Ce qui fait la carte d'un familier et d'un Gaulois unique dans le modèle unique (`CarteDeCosmetique.tsx`), choix du pilote
 * sur l'aperçu du 28 novembre 2026 (idées « A ») :
 * - le familier « Sur son lieu » : posé au sol de sa scène, agrandi deux fois au plus, sa famille sous son nom, sa phrase de
 *   compagnon dans la boîte (pour qui voit le duel), « Familier » et sa taille au pied ;
 * - le Gaulois unique « Le corps seul » : la créature entière, sans habits, debout sur sa scène, sa description dans la
 *   boîte, qui s'ouvre d'un appui.
 * À étendre par ce que la case pose en plus (bouton, marques, état, grande carte).
 */
type Chose = Pick<ProprietesDeLaCarte, "nom" | "rarete" | "cle" | "dessin" | "pose" | "agrandiAuPlus" | "type" | "sous" | "effets" | "piedMilieu" | "piedDroit">;

/** Le nom de la taille d'un familier (« Minuscule », « Grand »). */
export const nomDeLaTaille = (familier: Familier): string => TAILLES.find((t) => t.id === tailleDuFamilier(familier).classe)?.nom ?? "";

/** La carte d'un familier. */
export function carteDuFamilier(familier: Familier): Chose & { piedDroit: ComponentChildren } {
  return {
    nom: familier.nom,
    rarete: familier.rarete,
    cle: cleDuFamilier(familier.id),
    dessin: vignetteDuFamilier(familier),
    pose: "sol",
    agrandiAuPlus: 2,
    type: familier.famille,
    piedMilieu: "Familier",
    piedDroit: nomDeLaTaille(familier),
  };
}

/** Le corps seul d'un Gaulois unique, dessiné une fois par modèle. */
const CORPS = new Map<string, ReturnType<typeof modeleNu>>();
function corpsDe(id: string): ReturnType<typeof modeleNu> {
  if (!CORPS.has(id)) CORPS.set(id, modeleNu(id));
  return CORPS.get(id) ?? null;
}

/** La carte d'un Gaulois unique. */
export function carteDuModele(modele: Pick<ModeleRange, "id" | "nom" | "rarete" | "description">): Chose {
  return {
    nom: modele.nom,
    rarete: modele.rarete,
    cle: cleDuModele(modele.id),
    dessin: corpsDe(modele.id),
    pose: "sol",
    type: "Gaulois unique",
    sous: modele.description,
    effets: null,
  };
}

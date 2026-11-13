/**
 * Le village des Gaulois côté site : le vestiaire de `/village` et la commande /gaulois partagent les dessins et les règles
 * de `supabase/functions/code-discord/gaulois.ts` (voir ce fichier). Ici, ce dont la page a besoin en plus : son adresse,
 * le retour après la connexion par Discord, et la lecture des réponses du serveur.
 */
import { lireTenue, type Tenue } from "../../supabase/functions/code-discord/gaulois";

export {
  EMPLACEMENTS,
  EMPLACEMENTS_OBJETS,
  GAULOIS_HAUTEUR,
  GAULOIS_LARGEUR,
  NOMS_EMPLACEMENTS,
  OBJETS,
  ORDRE_RARETES,
  PEAUX,
  POILS,
  RARETES,
  TEINTE_CHEVEUX,
  TENUE_DE_DEPART,
  casesDuGaulois,
  changerObjet,
  decrireGaulois,
  estGratuit,
  lireTenue,
  tenueAuHasard,
  tenueGratuite,
  vignetteDeLObjet,
  type Emplacement,
  type Objet,
  type Rarete,
  type Tenue,
  type Vignette,
} from "../../supabase/functions/code-discord/gaulois";

/** La page du village, où mène /gaulois sur Discord. */
export const ADRESSE_VILLAGE = "/village";

/**
 * Gardé dans l'onglet le temps de la connexion par Discord : elle passe par la page de compte, seule adresse de retour
 * admise par le serveur avec la Direction, qui ramène ensuite au village.
 */
export const RETOUR_VILLAGE_KEY = "gal-village-retour";

/** La réponse de `get_mon_gaulois` : la tenue enregistrée, `null` s'il n'y en a pas encore. Une tenue illisible ne compte pas. */
export function tenueDuServeur(reponse: unknown): Tenue | null {
  if (reponse === null || typeof reponse !== "object") return null;
  return lireTenue((reponse as Record<string, unknown>)["tenue"]);
}

/** Deux tenues identiques, clé par clé. */
export function memeTenue(a: Tenue | null, b: Tenue | null): boolean {
  if (!a || !b) return a === b;
  const cles = Object.keys(a);
  return cles.length === Object.keys(b).length && cles.every((cle) => a[cle] === b[cle]);
}
